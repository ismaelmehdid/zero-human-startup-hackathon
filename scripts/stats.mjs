// Show row counts per stage in the shared database.
//   node --env-file=.env scripts/stats.mjs      (or: npm run stats)
import { withDatabase } from './lib/rocketride.mjs';
import { printStats } from './lib/stats.mjs';

withDatabase(printStats).catch((error) => {
	console.error(`stats.mjs failed: ${error?.message ?? error}`);
	process.exitCode = 1;
});
