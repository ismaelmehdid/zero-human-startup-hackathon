// Shared helpers for the platform scripts.
// Connects to the development server (ROCKETRIDE_URI / ROCKETRIDE_APIKEY from .env) and runs raw SQL
// against the shared database through pipelines/db_admin.pipe (tools source + rocketride_sql node).
// Run scripts from the workspace root with: node --env-file=.env scripts/<name>.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RocketRideClient } from 'rocketride';

export const WORKSPACE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DB_PIPELINE = path.join(WORKSPACE_ROOT, 'pipelines', 'db_admin.pipe');
export const DB_NODE_ID = 'rocketride_sql_1';

/** Fail fast when a required variable is missing. Prints names only, never values. */
export function requireEnv(...names) {
	const missing = names.filter((name) => !process.env[name]);
	if (missing.length > 0) {
		throw new Error(`Missing environment variables: ${missing.join(', ')}. Run with: node --env-file=.env ...`);
	}
}

/** Connect to the development server. */
export async function connect(options = {}) {
	requireEnv('ROCKETRIDE_URI', 'ROCKETRIDE_APIKEY');
	const client = new RocketRideClient({
		uri: process.env.ROCKETRIDE_URI,
		auth: process.env.ROCKETRIDE_APIKEY,
		...options,
	});
	await client.connect();
	return client;
}

/** Connect to the deployment target (ROCKETRIDE_DEPLOY_* pair). Lifecycle work never uses the development pair. */
export async function connectDeploy() {
	requireEnv('ROCKETRIDE_DEPLOY_URI', 'ROCKETRIDE_DEPLOY_APIKEY');
	const client = new RocketRideClient({ uri: process.env.ROCKETRIDE_DEPLOY_URI, auth: process.env.ROCKETRIDE_DEPLOY_APIKEY });
	await client.connect();
	return client;
}

// rocketride_sql requires an LLM connection, and llm_anthropic checks the key FORMAT when the pipeline starts.
// These scripts only send raw SQL (the execute tool), which never calls the model, so when the real key is
// absent a format-valid placeholder lets the database scripts run without one. It is never sent to Anthropic.
const PLACEHOLDER_ANTHROPIC_KEY = `sk-ant-api03-${'placeholderNotARealKey'.padEnd(93, 'x')}-AA`;

// Teammates share one dev identity, so only one db_admin task can run at a time. Every caller reattaches to it
// (useExisting) and nobody terminates it, since another caller may be mid-query: the server ends it after
// DB_TASK_IDLE_TTL_SECONDS without activity.
const DB_TASK_IDLE_TTL_SECONDS = 120;

/**
 * Start (or reattach to) the database helper pipeline and hand a small query API to `fn`.
 * db.query(sql, params?, sessionId?) resolves to { rows, affected_rows }.
 */
export async function withDatabase(fn) {
	const client = await connect();
	try {
		const env = process.env.ROCKETRIDE_ANTHROPIC_KEY ? undefined : { ROCKETRIDE_ANTHROPIC_KEY: PLACEHOLDER_ANTHROPIC_KEY };
		const { token } = await client.use({
			filepath: DB_PIPELINE,
			name: 'db_admin',
			useExisting: true,
			ttl: DB_TASK_IDLE_TTL_SECONDS,
			...(env ? { env } : {}),
		});
		const nodeId = DB_NODE_ID;
		const db = {
			query: (sql, params, sessionId) =>
				client.database.query({ token, sql, nodeId, ...(params ? { params } : {}), ...(sessionId ? { sessionId } : {}) }),
			begin: async () => (await client.database.beginTransaction({ token, nodeId })).session_id,
			commit: (sessionId) => client.database.commit({ token, sessionId, nodeId }),
			rollback: (sessionId) => client.database.rollback({ token, sessionId, nodeId }),
			dialect: () => client.database.dialect({ token, nodeId }),
		};
		return await fn(db, client);
	} finally {
		await client.disconnect().catch(() => {});
	}
}

/** Run every statement of a SQL script inside one transaction; roll back on the first error. */
export async function applySqlScript(db, sqlText, label) {
	const statements = splitSqlStatements(sqlText);
	const sessionId = await db.begin();
	try {
		for (const [index, statement] of statements.entries()) {
			const result = await db.query(statement, undefined, sessionId);
			const firstLine = statement.split('\n')[0].slice(0, 90);
			console.log(`  [${label} ${index + 1}/${statements.length}] ok, affected_rows=${result?.affected_rows ?? 0}: ${firstLine}`);
		}
		await db.commit(sessionId);
	} catch (error) {
		await db.rollback(sessionId).catch(() => {});
		throw new Error(`${label}: rolled back, nothing applied. ${error?.message ?? error}`);
	}
	return statements.length;
}

/**
 * Split a SQL script into statements on top-level semicolons.
 * Understands quotes, double-quoted identifiers, dollar quotes and both comment styles.
 */
export function splitSqlStatements(sqlText) {
	const statements = [];
	let current = '';
	let i = 0;
	while (i < sqlText.length) {
		const char = sqlText[i];
		const next = sqlText[i + 1];
		if (char === '-' && next === '-') {
			const end = sqlText.indexOf('\n', i);
			i = end === -1 ? sqlText.length : end;
			continue;
		}
		if (char === '/' && next === '*') {
			const end = sqlText.indexOf('*/', i + 2);
			i = end === -1 ? sqlText.length : end + 2;
			continue;
		}
		if (char === "'" || char === '"') {
			let j = i + 1;
			while (j < sqlText.length) {
				if (sqlText[j] === char && sqlText[j + 1] === char) j += 2;
				else if (sqlText[j] === char) break;
				else j += 1;
			}
			current += sqlText.slice(i, j + 1);
			i = j + 1;
			continue;
		}
		const dollarTag = char === '$' ? sqlText.slice(i).match(/^\$[A-Za-z_]*\$/) : null;
		if (dollarTag) {
			const end = sqlText.indexOf(dollarTag[0], i + dollarTag[0].length);
			const stop = end === -1 ? sqlText.length : end + dollarTag[0].length;
			current += sqlText.slice(i, stop);
			i = stop;
			continue;
		}
		if (char === ';') {
			if (current.trim()) statements.push(current.trim());
			current = '';
			i += 1;
			continue;
		}
		current += char;
		i += 1;
	}
	if (current.trim()) statements.push(current.trim());
	return statements;
}

/** Print query rows as a compact table (arrays joined, long text truncated). */
export function printRows(rows, maxWidth = 60) {
	if (!rows || rows.length === 0) {
		console.log('  (no rows)');
		return;
	}
	const display = rows.map((row) =>
		Object.fromEntries(
			Object.entries(row).map(([key, value]) => {
				let text = Array.isArray(value) ? value.join(', ') : value instanceof Date ? value.toISOString() : value;
				if (typeof text === 'string' && text.length > maxWidth) text = `${text.slice(0, maxWidth - 3)}...`;
				return [key, text];
			}),
		),
	);
	console.table(display);
}
