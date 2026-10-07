// Deploy bench, hunter and the demo UI to the deployment target (ROCKETRIDE_DEPLOY_* pair). No schedules.
//   node --env-file=.env scripts/deploy.mjs --team <teamId>         dry run: runs the checks, prints every command
//   node --env-file=.env scripts/deploy.mjs --team <teamId> --go    runs them, stopping at the first failure
//   --only pipes | --only app        deploy one half;   --app-target @me (default) | @team/<name>
// Pipelines: `rocketride deploy add <file>`, then `rocketride deploy publish <projectId> <version> --team <teamId>`.
// deploy add reads the working file (the git clean filter only changes what git stores), so the Gmail userToken the
// canvas wrote into hunter.pipe ships with the artifact; the script re-reads the artifact to check (length only).
// App: `rocketride app verify`, `rocketride app deploy`, then client.publishApp (the CLI has no app publish verb).
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { WORKSPACE_ROOT, connectDeploy } from './lib/rocketride.mjs';

const PIPELINES = ['pipelines/bench.pipe', 'pipelines/hunter.pipe'];
const APP_FOLDER = 'apps/staffingAgent-ui';
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const teamId = option('--team');
const only = option('--only');
const appTarget = option('--app-target') ?? '@me';
const go = args.includes('--go');
const comment = `demo deploy ${new Date().toISOString()}`;
const redact = (text) => String(text ?? '').replace(/rr_[A-Za-z0-9]+/g, 'rr_***');

/** Print one CLI command; with --go run it and return its --json result. */
function cli(verbArgs) {
	const fullArgs = [...verbArgs, '--json'];
	console.log(`$ npx --no -- rocketride ${fullArgs.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg)).join(' ')}`);
	if (!go) return undefined;
	const run = spawnSync('npx', ['--no', '--', 'rocketride', ...fullArgs], { cwd: WORKSPACE_ROOT, encoding: 'utf8' });
	if (run.status !== 0) throw new Error(`command failed (exit ${run.status}): ${redact(run.stdout).trim()} ${redact(run.stderr).trim()}`);
	return JSON.parse(run.stdout);
}

/** Lengths of every "userToken" value found anywhere in a JSON value (never the values). */
function userTokenLengths(node, found = []) {
	if (Array.isArray(node)) node.forEach((item) => userTokenLengths(item, found));
	else if (node && typeof node === 'object') {
		for (const [key, value] of Object.entries(node)) {
			if (key === 'userToken') found.push(typeof value === 'string' ? value.length : 0);
			else userTokenLengths(value, found);
		}
	}
	return found;
}

async function preflight() {
	const problems = [];
	if (!teamId || teamId.startsWith('--')) problems.push('pass --team <teamId>');
	const deployPair = Boolean(process.env.ROCKETRIDE_DEPLOY_URI && process.env.ROCKETRIDE_DEPLOY_APIKEY);
	if (!deployPair) problems.push('ROCKETRIDE_DEPLOY_URI / ROCKETRIDE_DEPLOY_APIKEY are not in .env (run: npx rocketride login --deploy)');
	if (only !== 'app') {
		for (const file of PIPELINES) {
			const pipeline = JSON.parse(await readFile(path.join(WORKSPACE_ROOT, file), 'utf8'));
			if (!pipeline.name) problems.push(`${file} has no top-level "name", which the server requires to deploy (its owner adds it)`);
			const tokens = userTokenLengths(pipeline);
			if (file.endsWith('hunter.pipe') && !tokens.some((length) => length > 0)) {
				problems.push(`${file} has no Gmail userToken: sign in with Google on node gmail in the canvas first`);
			}
		}
	}
	if (only !== 'pipes') {
		const appId = JSON.parse(await readFile(path.join(WORKSPACE_ROOT, APP_FOLDER, 'package.json'), 'utf8')).appManifest?.id ?? '';
		let developerId;
		if (deployPair) {
			const client = await connectDeploy();
			developerId = client.getAccountInfo()?.organization?.developerId;
			await client.disconnect().catch(() => {});
		}
		const prefix = appId.split('.')[0];
		if (prefix === 'local' || (developerId && prefix !== developerId)) {
			problems.push(`${APP_FOLDER} has app id "${appId}"; deploys only work under the org namespace${developerId ? ` "${developerId}."` : ''}`);
		}
	}
	return problems;
}

// --existing bench=1,hunter=2 publishes versions already in the registry instead of adding new ones (resume).
const existingVersions = Object.fromEntries(
	(option('--existing') ?? '').split(',').filter(Boolean).map((pair) => pair.split('=')),
);

async function deployPipelines() {
	for (const file of PIPELINES) {
		console.log(`\n=== ${file}`);
		const pipeline = JSON.parse(await readFile(path.join(WORKSPACE_ROOT, file), 'utf8'));
		const existing = existingVersions[pipeline.name];
		const added = existing ? { version: Number(existing) } : cli(['deploy', 'add', file, '--comment', comment]);
		if (existing) console.log(`(using registry version ${existing} of ${pipeline.name}: no new deploy)`);
		// `deploy add --json` reports the version but not the project id, which is the pipeline's own project_id.
		const projectId = added?.projectId ?? pipeline.project_id;
		const version = added?.version ?? '<version>';
		if (go && added?.version === undefined) throw new Error(`deploy add returned no version for ${file}`);
		cli(['deploy', 'publish', String(projectId), String(version), '--team', teamId]);
		const artifact = cli(['deploy', 'artifact', String(projectId), String(version)]);
		if (go && file.endsWith('hunter.pipe')) {
			const lengths = userTokenLengths(artifact);
			console.log(`deployed artifact keeps a Gmail userToken: ${lengths.some((length) => length > 0)} (lengths: ${lengths.join(', ') || 'none'})`);
		}
		if (go) console.log(`deployed ${added.name ?? file}: project ${projectId}, v${version}, published to team ${teamId}`);
	}
}

async function deployApp() {
	console.log(`\n=== ${APP_FOLDER}`);
	const verified = cli(['app', 'verify', APP_FOLDER]);
	if (go && !verified?.ok) throw new Error('app verify reported FAIL lines; fix them before deploying');
	const deployed = cli(['app', 'deploy', APP_FOLDER, '--comment', comment]);
	const appId = JSON.parse(await readFile(path.join(WORKSPACE_ROOT, APP_FOLDER, 'package.json'), 'utf8')).appManifest?.id;
	console.log(`$ (SDK, deployment target) client.publishApp('${appId}', ${deployed?.version ?? '<version>'}, '${appTarget}')`);
	if (!go) return;
	const client = await connectDeploy();
	try {
		// `app deploy --json` does not report the version: find the one this run deployed by its comment.
		const version = deployed?.version ?? (await client.listDeployments(appId)).find((row) => row.message === comment)?.registryVersion;
		if (version === undefined) throw new Error(`could not find the version of ${appId} deployed with comment "${comment}"`);
		await client.publishApp(appId, version, appTarget);
		console.log(`published ${appId} v${version} to ${appTarget}`);
	} finally {
		await client.disconnect().catch(() => {});
	}
}

async function main() {
	console.log(`Deploy ${only ?? 'pipes and app'} to team ${teamId ?? '<teamId>'}${go ? '' : ' (dry run: nothing is deployed)'}; no schedules.`);
	const problems = await preflight();
	if (problems.length > 0) {
		console.log(`\nBlocked:\n  - ${problems.join('\n  - ')}`);
		if (go) throw new Error('fix the blockers above first; nothing was deployed');
	}
	if (only !== 'app') await deployPipelines();
	if (only !== 'pipes') await deployApp();
	if (!go) {
		console.log('\nDry run complete: nothing was deployed. Re-run with --go once the blockers are cleared and the lead says go.');
		if (problems.length > 0) process.exitCode = 1;
	}
}

main().catch((error) => {
	console.error(`deploy.mjs stopped: ${error?.message ?? error}`);
	process.exitCode = 1;
});
