// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * Observes one agent pipeline without ever starting it:
 * - replays the latest recorded run from the run log (client.log), and
 * - live-tails new runs through a monitor on the agent's project + source.
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

export function useAgentRun(client: RocketRideClient | null, isConnected: boolean, agent: AgentDef): AgentRunState {
	const [events, setEvents] = useState<RawEvent[]>([]);
	const [brief, setBrief] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const seen = useRef<Set<number>>(new Set());

	const loadBrief = useCallback(async () => {
		if (!client) return;
		try {
			setBrief(await client.fsReadString(agent.briefPath));
		} catch (err) {
			setBrief(null);
			setError(`Could not read ${agent.briefPath}: ${String((err as Error)?.message ?? err)}`);
		}
	}, [client, agent.briefPath]);

	const loadLatest = useCallback(async () => {
		if (!client) return;
		setLoading(true);
		setError(null);
		try {
			const stream = { projectId: agent.projectId, source: agent.source };
			const { chapters } = await client.log.chapters(stream);
			if (!chapters.length) {
				seen.current = new Set();
				setEvents([]);
				return;
			}
			const latest = [...chapters].sort((a, b) => a.beginSeq - b.beginSeq)[chapters.length - 1];
			const collected: RawEvent[] = [];
			let cursor: number | undefined;
			for (let page = 0; page < MAX_PAGES; page++) {
				const res = await client.log.read(stream, { fromSeq: latest.beginSeq, ...(cursor !== undefined ? { cursor } : {}), maxEvents: 2000 });
				for (const e of res.events) collected.push({ event: e.event, body: e.body as Record<string, unknown> });
				if (res.nextSeq === undefined || res.nextSeq === null || res.events.length === 0) break;
				cursor = res.nextSeq;
			}
			seen.current = new Set(collected.map((e) => Number(e.body.logSeq)).filter((n) => Number.isFinite(n)));
			setEvents(collected);
		} catch (err) {
			setError(String((err as Error)?.message ?? err));
		} finally {
			setLoading(false);
		}
	}, [client, agent.projectId, agent.source]);

	const reload = useCallback(() => {
		void loadBrief();
		void loadLatest();
	}, [loadBrief, loadLatest]);

	// Initial replay once connected.
	useEffect(() => {
		if (client && isConnected) reload();
	}, [client, isConnected, reload]);

	// Live monitor on this agent's own dev run (bound to the signed-in identity).
	useEffect(() => {
		if (!client || !isConnected) return;
		const key = { projectId: agent.projectId, source: agent.source };
		client.addMonitor(key, MONITOR_TYPES).catch((err: unknown) => setError(`Live monitor failed: ${String((err as Error)?.message ?? err)}`));
		return () => {
			client.removeMonitor(key, MONITOR_TYPES).catch(() => undefined);
		};
	}, [client, isConnected, agent.projectId, agent.source]);

	useShellEvent('shell:event', ({ event }) => {
		const message = event as unknown as { event?: string; body?: Record<string, unknown> };
		const body = message.body;
		if (!message.event || !body) return;
		const projectId = body.project_id ?? body.projectId;
		if (projectId !== agent.projectId) return;
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
