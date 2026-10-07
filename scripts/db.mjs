// Raw SQL against the shared database (through pipelines/db_admin.pipe).
//
//   node --env-file=.env scripts/db.mjs apply sql/schema.sql sql/seed.sql   apply files, one transaction each
//   node --env-file=.env scripts/db.mjs query "SELECT * FROM consultants"   run one statement and print rows
//   node --env-file=.env scripts/db.mjs query "SELECT $1::text[] AS a" '[["x","y"]]'   with JSON params
//   node --env-file=.env scripts/db.mjs tables                              list tables and row counts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { WORKSPACE_ROOT, applySqlScript, printRows, withDatabase } from './lib/rocketride.mjs';

const [command, ...args] = process.argv.slice(2);

const TABLES_SQL = `
SELECT c.relname AS table_name, c.reltuples::bigint AS estimated_rows
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname = current_schema()
ORDER BY c.relname`;

async function main() {
	if (command === 'apply' && args.length > 0) {
		await withDatabase(async (db) => {
			console.log(`Database dialect: ${await db.dialect()}`);
			for (const file of args) {
				const sqlText = await readFile(path.resolve(WORKSPACE_ROOT, file), 'utf8');
				const count = await applySqlScript(db, sqlText, file);
				console.log(`Applied ${file} (${count} statements, committed).`);
			}
		});
	} else if (command === 'query' && args.length > 0) {
		const params = args[1] ? JSON.parse(args[1]) : undefined;
		await withDatabase(async (db) => {
			const result = await db.query(args[0], params);
			printRows(result?.rows);
			console.log(`affected_rows=${result?.affected_rows ?? 0}`);
		});
	} else if (command === 'tables') {
		await withDatabase(async (db) => {
			console.log(`Database dialect: ${await db.dialect()}, schema: ${(await db.query('SELECT current_schema() AS s')).rows[0]?.s}`);
			printRows((await db.query(TABLES_SQL)).rows);
		});
	} else {
		console.log('Usage: node --env-file=.env scripts/db.mjs apply <file.sql>... | query "<sql>" [jsonParams] | tables');
		process.exitCode = 2;
	}
}

main().catch((error) => {
	console.error(`db.mjs failed: ${error?.message ?? error}`);
	process.exitCode = 1;
});
