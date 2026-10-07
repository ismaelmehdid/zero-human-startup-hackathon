// Deployed runs execute as a team and resolve ${ROCKETRIDE_*} from the server-side environment (org + team layers),
// never from the local .env. This copies the secrets bench and hunter reference from .env into one team's
// environment on the deployment target. It merges (setEnv replaces the whole team set) and prints key names only.
//   node --env-file=.env scripts/set-team-env.mjs --team <teamId>        dry run: shows which names would be set
//   node --env-file=.env scripts/set-team-env.mjs --team <teamId> --go   merges them into the team environment
// Re-run with --go whenever a value changes (the Box developer token expires after 60 minutes).
import { connectDeploy } from './lib/rocketride.mjs';
import { loadPipeline } from './lib/pipeline-run.mjs';

const args = process.argv.slice(2);
const teamId = args[args.indexOf('--team') + 1];
const go = args.includes('--go');

async function main() {
	if (!args.includes('--team') || !teamId || teamId.startsWith('--')) throw new Error('Pass --team <teamId>.');
	const specs = await Promise.all(['bench', 'hunter'].map(loadPipeline));
	const required = [...new Set(specs.flatMap((spec) => spec.secrets))].sort();
	for (const spec of specs) console.log(`${spec.name} references: ${spec.secrets.join(', ')}`);
	const missingLocally = required.filter((name) => !process.env[name]);
	if (missingLocally.length > 0) throw new Error(`Missing from .env, so nothing can be copied: ${missingLocally.join(', ')}`);

	const client = await connectDeploy();
	try {
		const current = (await client.account.getEnv('team', teamId)) ?? {};
		console.log(`team ${teamId} currently holds: ${Object.keys(current).sort().join(', ') || '(nothing)'}`);
		const changed = required.filter((name) => current[name] !== process.env[name]);
		console.log(`would set: ${changed.join(', ') || '(nothing: already up to date)'}`);
		if (!go) {
			console.log('Dry run: nothing written. Re-run with --go to write.');
			return;
		}
		const merged = { ...current, ...Object.fromEntries(required.map((name) => [name, process.env[name]])) };
		await client.account.setEnv('team', merged, teamId);
		const after = Object.keys((await client.account.getEnv('team', teamId)) ?? {}).sort();
		const absent = required.filter((name) => !after.includes(name));
		console.log(`team ${teamId} now holds: ${after.join(', ')}`);
		if (absent.length > 0) throw new Error(`Still missing after the write: ${absent.join(', ')}`);
	} finally {
		await client.disconnect().catch(() => {});
	}
}

main().catch((error) => {
	console.error(`set-team-env.mjs failed: ${error?.message ?? error}`);
	process.exitCode = 1;
});
