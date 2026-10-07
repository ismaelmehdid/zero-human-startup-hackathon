// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * Observes one agent pipeline without ever starting it:
 * - replays the latest recorded run from the run log (client.log), picking the
 *   newest run across every project id the agent is known by, and
 * - live-tails new runs. A new run under an unknown project id (the canvas
 *   re-keys a .pipe on save) is recognized by its task name `<key>.<source>`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShellEvent } from 'shell';
import type { RocketRideClient } from 'shell';
import type { AgentDef } from './agents';
import { reduceRun, type RawEvent, type RunView } from './runTrace';

const MONITOR_TYPES = ['task', 'flow', 'summary', 'sse'];
const MAX_PAGES = 25;

export interface AgentRunState {
	run: RunView;
	brief: string | null;
	error: string | null;
	loading: boolean;
	reload: () => void;
}

function errorText(err: unknown): string {
	return String((err as Error)?.message ?? err);
}

/** True when a task name (`<pipeline name>.<source>`) belongs to this agent. */
function isAgentTask(agent: AgentDef, name: unknown, source: unknown): boolean {
	return typeof name === 'string' && name.split('.')[0] === agent.key && (source === undefined || source === agent.source);
}

export function useAgentRun(client: RocketRideClient | null, isConnected: boolean, agent: AgentDef): AgentRunState {
	const [events, setEvents] = useState<RawEvent[]>([]);
	const [brief, setBrief] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [ids, setIds] = useState<string[]>(agent.projectIds);
	const idsRef = useRef<Set<string>>(new Set(agent.projectIds));
	const seen = useRef<Set<number>>(new Set());

	const addId = useCallback((id: string) => {
		if (!id || idsRef.current.has(id)) return;
		idsRef.current.add(id);
		setIds((prev) => (prev.includes(id) ? prev : [id, ...prev]));
	}, []);

	const loadBrief = useCallback(async () => {
		if (!client) return;
		try {
			setBrief(await client.fsReadString(agent.briefPath));
		} catch (err) {
			setBrief(null);
			setError(`Could not read ${agent.briefPath}: ${errorText(err)}`);
		}
	}, [client, agent.briefPath]);

	/** Best effort: learn the agent's current project id from the task registry by name. */
	const discover = useCallback(async () => {
		if (!client) return;
		try {
			const page = await client.listTasks({ page_size: 100, sort: [{ field: 'startTime', dir: 'desc' }] });
			for (const task of page.rows) if (isAgentTask(agent, task.name, task.source)) addId(task.projectId);
		} catch {
			// Needs the task.monitor permission; the known ids still work without it.
		}
	}, [client, agent, addId]);

	const loadLatest = useCallback(async () => {
		if (!client) return;
		setLoading(true);
		setError(null);
		try {
			await discover();
			// The newest run across every id this agent is known by.
			let best: { stream: { projectId: string; source: string }; beginSeq: number; beginTime: number } | null = null;
			for (const projectId of idsRef.current) {
				const stream = { projectId, source: agent.source };
				try {
					const { chapters } = await client.log.chapters(stream);
					for (const chapter of chapters) {
						if (!best || chapter.beginTime > best.beginTime) best = { stream, beginSeq: chapter.beginSeq, beginTime: chapter.beginTime };
					}
				} catch {
					// No stream under this id.
				}
			}
			if (!best) {
				seen.current = new Set();
				setEvents([]);
				return;
			}
			const collected: RawEvent[] = [];
			let cursor: number | undefined;
			for (let page = 0; page < MAX_PAGES; page++) {
				const res = await client.log.read(best.stream, { fromSeq: best.beginSeq, ...(cursor !== undefined ? { cursor } : {}), maxEvents: 2000 });
				for (const e of res.events) collected.push({ event: e.event, body: e.body as Record<string, unknown> });
				if (res.nextSeq === undefined || res.nextSeq === null || res.events.length === 0) break;
				cursor = res.nextSeq;
			}
			seen.current = new Set(collected.map((e) => Number(e.body.logSeq)).filter((n) => Number.isFinite(n)));
			setEvents(collected);
		} catch (err) {
			setError(errorText(err));
		} finally {
			setLoading(false);
		}
	}, [client, agent.source, discover]);

	const reload = useCallback(() => {
		void loadBrief();
		void loadLatest();
	}, [loadBrief, loadLatest]);

	// Initial replay once connected.
	useEffect(() => {
		if (client && isConnected) reload();
	}, [client, isConnected, reload]);

	// Live: one monitor per known id, plus all of the user's tasks so a re-keyed
	// pipeline is still seen (its events are matched by task name below).
	useEffect(() => {
		if (!client || !isConnected) return;
		const keys = [{ token: '*' }, ...ids.map((projectId) => ({ projectId, source: agent.source }))];
		for (const key of keys) client.addMonitor(key, MONITOR_TYPES).catch(() => undefined);
		return () => {
			for (const key of keys) client.removeMonitor(key, MONITOR_TYPES).catch(() => undefined);
		};
	}, [client, isConnected, ids, agent.source]);

	useShellEvent('shell:event', ({ event }) => {
		const message = event as unknown as { event?: string; body?: Record<string, unknown> };
		const body = message.body;
		if (!message.event || !body) return;
		const projectId = String(body.project_id ?? body.projectId ?? '');
		if (message.event === 'apaevt_task' && body.action === 'begin' && isAgentTask(agent, body.name, body.source)) addId(projectId);
		if (!idsRef.current.has(projectId)) return;
		if (typeof body.source === 'string' && body.source !== agent.source) return;
		if (message.event === 'apaevt_task' && body.action === 'begin') {
			// A new run started: drop the previous one and follow this one.
			const seq = Number(body.logSeq);
			seen.current = new Set(Number.isFinite(seq) ? [seq] : []);
			setEvents([{ event: message.event, body }]);
			void loadBrief();
			return;
		}
		const seq = Number(body.logSeq);
		if (Number.isFinite(seq)) {
			if (seen.current.has(seq)) return;
			seen.current.add(seq);
		}
		const name = message.event;
		setEvents((prev) => [...prev, { event: name, body }]);
	});

	const run = useMemo(() => reduceRun(events), [events]);
	return { run, brief, error, loading, reload };
}
