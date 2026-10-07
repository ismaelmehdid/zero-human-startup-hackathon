// Run one pipeline now on the development server, follow it to the end, then print its answer and the
// database row counts. Ctrl-C stops the server-side run too.
//   node --env-file=.env scripts/run.mjs bench                       (or: npm run run:bench)
//   node --env-file=.env scripts/run.mjs hunter --upload-brief       (or: npm run run:hunter)
//   node --env-file=.env scripts/run.mjs pipelines/x.pipe --raw      any .pipe
// Flags: --upload-brief uploads the repo copy of the pipeline's brief first (the repo copy wins); without it the
// brief must already be in the file store. --raw prints every event. --logs prints the engine console output.
import { connect, withDatabase } from './lib/rocketride.mjs';
import { checkBriefs, findMissingSecrets, loadPipeline, runPipeline, uploadBriefs } from './lib/pipeline-run.mjs';
import { printStats } from './lib/stats.mjs';

const args = process.argv.slice(2);
const target = args.find((arg) => !arg.startsWith('--'));
const options = { rawEvents: args.includes('--raw'), consoleLogs: args.includes('--logs') };

async function main() {
	if (!target) {
		console.log('Usage: node --env-file=.env scripts/run.mjs <bench|hunter|path/to/file.pipe> [--upload-brief] [--raw] [--logs]');
		process.exitCode = 2;
		return;
	}
	const spec = await loadPipeline(target);
	const log = (message) => console.log(`[${spec.name}] ${message}`);

	const client = await connect();
	try {
		const missing = await findMissingSecrets(client, spec);
		if (missing.length > 0) {
			throw new Error(`${spec.name} needs ${missing.join(', ')} (set in .env, see .env.example). Nothing was started.`);
		}
		if (args.includes('--upload-brief')) await uploadBriefs(client, spec, log);
		else await checkBriefs(client, spec, log);
	} finally {
		await client.disconnect().catch(() => {});
	}

	const outcome = await runPipeline(spec, options);
	await withDatabase(printStats);
	if (!outcome.ok) {
		console.error(`\n${spec.name} FAILED: ${outcome.reason}`);
		process.exitCode = 1;
	}
}

main().catch((error) => {
	console.error(`run.mjs failed: ${error?.message ?? error}`);
	process.exitCode = 1;
});
