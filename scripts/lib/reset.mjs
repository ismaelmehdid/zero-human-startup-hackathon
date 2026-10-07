// Rehearsal reset (destructive). By default it clears the outreach state left by test runs (every meeting,
// touch and opportunity) and keeps every consultant. withSeed also deletes the fictional seed consultants
// (box_file_id 'seed-%'). Consultants loaded from Box are never deleted.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { WORKSPACE_ROOT, applySqlScript, printRows } from './rocketride.mjs';
import { fetchTotals } from './stats.mjs';

export const RESET_SQL_FILE = 'sql/reset.sql';
export const RESET_SEED_SQL_FILE = 'sql/reset_seed.sql';

/** The reset script for one mode, as one SQL text (applied in a single transaction). */
export async function resetSql({ withSeed = false } = {}) {
	const files = [RESET_SQL_FILE, ...(withSeed ? [RESET_SEED_SQL_FILE] : [])];
	const texts = await Promise.all(files.map((file) => readFile(path.resolve(WORKSPACE_ROOT, file), 'utf8')));
	return { label: files.join(' + '), sqlText: texts.join('\n') };
}

/** Show what the reset deletes; when confirmed, delete it in one transaction. Resolves to true when deleted. */
export async function resetDatabase(db, { confirmed, withSeed = false }) {
	const totals = await fetchTotals(db);
	const consultantsDeleted = withSeed ? totals.seed_consultants : 0;
	const scope = withSeed ? 'the outreach state and the seed consultants' : 'the outreach state; every consultant is kept';
	console.log(`${confirmed ? 'Reset deletes' : 'Reset would delete'} ${scope}:`);
	printRows([
		{
			opportunities: totals.opportunities,
			touches: totals.touches,
			meetings: totals.meetings,
			consultants_deleted: consultantsDeleted,
			consultants_kept: totals.consultants - consultantsDeleted,
		},
	]);
	if (!confirmed) return false;
	const { label, sqlText } = await resetSql({ withSeed });
	await applySqlScript(db, sqlText, label);
	console.log('Reset committed.');
	return true;
}
