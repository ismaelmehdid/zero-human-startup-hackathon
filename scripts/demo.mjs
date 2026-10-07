// The live demo in one command: upload the briefs, run bench, run hunter, then show the database stats.
// Every check runs before anything changes, and the demo stops at the first failure with the reason.
//   node --env-file=.env scripts/demo.mjs              (or: npm run demo)
//   node --env-file=.env scripts/demo.mjs --reset      first clears the outreach state, keeps every consultant
//                                                      (same as reset.mjs --yes)
//   node --env-file=.env scripts/demo.mjs --reset --with-seed   also deletes the seed consultants
//   node --env-file=.env scripts/demo.mjs --dry-run    runs the checks and shows the plan; changes nothing
// --raw and --logs work as in run.mjs. The repo copies of briefs/bench.md and briefs/hunter.md are uploaded, so
// they win over whatever dev copy is in the file store.
import { connect, withDatabase } from './lib/rocketride.mjs';
import { findMissingRepoBriefs, findMissingSecrets, loadPipeline, runPipeline, uploadBriefs } from './lib/pipeline-run.mjs';
import { resetDatabase } from './lib/reset.mjs';
import { fetchTotals, printStats } from './lib/stats.mjs';

const PIPELINE_ORDER = ['bench', 'hunter'];
const args = process.argv.slice(2);
const withReset = args.includes('--reset');
const withSeed = args.includes('--with-seed');
const dryRun = args.includes('--dry-run');
const runOptions = { rawEvents: args.includes('--raw'), consoleLogs: args.includes('--logs') };

const heading = (text) => console.log(`\n=== ${text}`);

/** Everything that can be checked without changing anything. Resolves to a list of problems. */
async function preflight(specs) {
	const problems = [];
	const client = await connect();
	try {
		for (const spec of specs) {
			const missingSecrets = await findMissingSecrets(client, spec);
			if (missingSecrets.length > 0) problems.push(`${spec.name} needs ${missingSecrets.join(', ')} (set in .env, see .env.example)`);
			for (const brief of await findMissingRepoBriefs(spec)) problems.push(`${spec.name} reads ${brief}, which is missing from the repo`);
		}
	} finally {
		await client.disconnect().catch(() => {});
	}
	const totals = await withDatabase(fetchTotals);
	console.log(`database reachable: ${totals.consultants} consultants (${totals.seed_consultants} seed), ${totals.opportunities} opportunities`);
	return problems;
}

async function main() {
	if (withSeed && !withReset) console.log('note: --with-seed only applies together with --reset; ignoring it');
	const resetStep = withSeed ? 'reset (delete outreach rows and seed consultants)' : 'reset (delete outreach rows, keep every consultant)';
	const steps = [
		...(withReset ? [resetStep] : []),
		'upload briefs',
		'run bench',
		'check the bench is not empty',
		'run hunter',
		'stats',
	];
	heading(`Demo${dryRun ? ' (dry run: nothing will change)' : ''}: ${steps.join(' -> ')}`);

	heading('Checks (before changing anything)');
	const specs = await Promise.all(PIPELINE_ORDER.map(loadPipeline));
	const problems = await preflight(specs);
	if (problems.length > 0) throw new Error(`checks failed, nothing was changed:\n  - ${problems.join('\n  - ')}`);
	console.log('all checks passed');

	if (dryRun) {
		if (withReset) await withDatabase((db) => resetDatabase(db, { confirmed: false, withSeed }));
		console.log('\nDry run complete: nothing was changed. Run without --dry-run to start the demo.');
		return;
	}

	if (withReset) {
		heading('Reset');
		await withDatabase((db) => resetDatabase(db, { confirmed: true, withSeed }));
	}

	heading('Upload the briefs (the repo copies win)');
	const client = await connect();
	try {
		for (const spec of specs) await uploadBriefs(client, spec, (message) => console.log(`[${spec.name}] ${message}`));
	} finally {
		await client.disconnect().catch(() => {});
	}

	for (const spec of specs) {
		heading(`Run ${spec.name}`);
		const outcome = await runPipeline(spec, runOptions);
		if (!outcome.ok) throw new Error(`${spec.name} failed: ${outcome.reason}`);
		if (spec.name === 'bench') {
			const totals = await withDatabase(fetchTotals);
			if (totals.consultants === 0) {
				throw new Error('bench finished but the consultants table is empty, so hunter has no one to match. Check the Box keys, or re-seed: npm run db -- apply sql/seed.sql');
			}
			console.log(`bench check: ${totals.consultants} consultants on the bench`);
		}
	}

	heading('Stats');
	await withDatabase(printStats);
	console.log('\nDemo complete.');
}

main().catch((error) => {
	console.error(`\nDEMO STOPPED: ${error?.message ?? error}`);
	process.exitCode = 1;
});
