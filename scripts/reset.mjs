// Rehearsal reset (destructive): clears the outreach state left by test runs and keeps every consultant.
//   node --env-file=.env scripts/reset.mjs                     dry run: shows what would be deleted
//   node --env-file=.env scripts/reset.mjs --yes               deletes every meeting, touch and opportunity
//   node --env-file=.env scripts/reset.mjs --yes --with-seed   also deletes the seed consultants (box_file_id 'seed-%')
// (or: npm run reset -- --yes [--with-seed]). Consultants loaded from Box are never deleted.
import { withDatabase } from './lib/rocketride.mjs';
import { resetDatabase } from './lib/reset.mjs';
import { printStats } from './lib/stats.mjs';

const confirmed = process.argv.includes('--yes');
const withSeed = process.argv.includes('--with-seed');

withDatabase(async (db) => {
	if (await resetDatabase(db, { confirmed, withSeed })) await printStats(db);
	else console.log(`Dry run: nothing deleted. Re-run with --yes${withSeed ? ' --with-seed' : ''} to delete.`);
}).catch((error) => {
	console.error(`reset.mjs failed: ${error?.message ?? error}`);
	process.exitCode = 1;
});
