// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * Read-only view of the shared staffing database. Same read path as the
 * terminal scripts (pipelines/db_admin.pipe): a `tools`-hosted rocketride_sql
 * node queried with client.database.query (raw SELECTs, no LLM call). The node
 * requires an LLM connection, so a format-valid placeholder key is passed.
 */

import { useCallback, useRef, useState } from 'react';
import { usePolling } from 'shell';
import type { RocketRideClient } from 'shell';

type Row = Record<string, unknown>;

// Mirror of pipelines/db_admin.pipe (same project id), so the app and the
// terminal scripts share one task through useExisting. Kept inline: the app is
// packed from its own folder only.
const DB_READER_PIPELINE = {
	components: [
		{ id: 'tools_1', provider: 'tools', config: { hideForm: true, mode: 'Source', parameters: {}, type: 'tools' } },
		{
			id: 'rocketride_sql_1',
			provider: 'rocketride_sql',
			config: {
				profile: 'default',
				default: {
					db_description:
						'Shared state of an AI staffing agency that places US IT consultants on contract. consultants: our bench (one row per CV, box_file_id unique, skills text[]). opportunities: job postings we prospect (job_url unique, stage one of new, contacted, replied, meeting_booked, lost, no_response; do_not_contact flag). touches: emails per opportunity (direction out or in, status scheduled, sent, received or cancelled; one outgoing row per step). meetings: booked calls, at most one per opportunity.',
					table: 'opportunities',
					max_attempts: 5,
					allow_execute: true,
				},
				parameters: {},
			},
			control: [{ classType: 'tool', from: 'tools_1' }],
		},
		{
			id: 'llm_anthropic_1',
			provider: 'llm_anthropic',
			config: { profile: 'claude-haiku-4-5', 'claude-haiku-4-5': { apikey: '${ROCKETRIDE_ANTHROPIC_KEY}', extendedThinking: false }, parameters: {} },
			control: [{ classType: 'llm', from: 'rocketride_sql_1' }],
		},
	],
	project_id: 'e06d297e-a9b6-4f4f-af89-1f4a79259b83',
	viewport: { x: 0, y: 0, zoom: 1 },
	version: 1,
};

// Format-valid placeholder (same as scripts/lib/rocketride.mjs). Never sent to
// Anthropic: raw execute bypasses the model.
const PLACEHOLDER_ANTHROPIC_KEY = `sk-ant-api03-${'placeholderNotARealKey'.padEnd(93, 'x')}-AA`;
const NODE_ID = 'rocketride_sql_1';

const SQL = {
	consultants: `SELECT id, full_name, title, array_to_string(skills, ', ') AS skills, years_experience, hourly_rate_usd, location, availability, box_file_id
		FROM consultants ORDER BY id`,
	opportunities: `SELECT o.id, o.company, o.role_title, o.contact_name, o.contact_title, o.stage, c.full_name AS consultant, o.do_not_contact, o.created_at
		FROM opportunities o LEFT JOIN consultants c ON c.id = o.consultant_id ORDER BY o.id DESC`,
	touches: `SELECT t.id, o.company, t.step, t.direction, t.status, t.subject, t.due_at, t.sent_at
		FROM touches t JOIN opportunities o ON o.id = t.opportunity_id ORDER BY t.id DESC`,
};

export interface DatabaseState {
	consultants: Row[];
	opportunities: Row[];
	touches: Row[];
	error: string | null;
	updatedAt: number | null;
	refresh: () => Promise<void>;
}

export function useDatabase(client: RocketRideClient | null, isConnected: boolean): DatabaseState {
	const tokenRef = useRef<string | null>(null);
	const busy = useRef(false);
	const [consultants, setConsultants] = useState<Row[]>([]);
	const [opportunities, setOpportunities] = useState<Row[]>([]);
	const [touches, setTouches] = useState<Row[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [updatedAt, setUpdatedAt] = useState<number | null>(null);

	/** Starts (or attaches to) the reader task and reads all three tables in one read-only transaction. */
	const readAll = useCallback(async (db: RocketRideClient) => {
		if (!tokenRef.current) {
			const started = await db.use({
				pipeline: DB_READER_PIPELINE,
				useExisting: true,
				ttl: 120,
				env: { ROCKETRIDE_ANTHROPIC_KEY: PLACEHOLDER_ANTHROPIC_KEY },
			});
			tokenRef.current = started.token;
		}
		const token = tokenRef.current;
		// Every read runs inside a READ ONLY transaction that is rolled back:
		// the database itself refuses any write from this view.
		const { session_id: sessionId } = await db.database.beginTransaction({ token, nodeId: NODE_ID });
		try {
			const query = (sql: string) => db.database.query({ token, sql, nodeId: NODE_ID, sessionId });
			await query('SET TRANSACTION READ ONLY');
			const c = await query(SQL.consultants);
			const o = await query(SQL.opportunities);
			const t = await query(SQL.touches);
			setConsultants(c.rows);
			setOpportunities(o.rows);
			setTouches(t.rows);
		} finally {
			await db.database.rollback({ token, nodeId: NODE_ID, sessionId }).catch(() => undefined);
		}
	}, []);

	const refresh = useCallback(async () => {
		if (!client || !isConnected || busy.current) return;
		busy.current = true;
		try {
			try {
				await readAll(client);
			} catch {
				// The shared reader task may have ended (ttl) or be terminating: start a fresh one once.
				tokenRef.current = null;
				await readAll(client);
			}
			setError(null);
			setUpdatedAt(Date.now());
		} catch (err) {
			tokenRef.current = null;
			setError(String((err as Error)?.message ?? err));
		} finally {
			busy.current = false;
		}
	}, [client, isConnected, readAll]);

	usePolling(refresh, 5000);
	return { consultants, opportunities, touches, error, updatedAt, refresh };
}
