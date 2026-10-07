// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * Turns the raw event stream of one pipeline run (recorded run log or live
 * monitor events) into what the demo shows: the agent's plan steps, every
 * tool call with its input and output, and the final answer.
 *
 * Tool calls come from `apaevt_flow` enter/leave events whose
 * `trace.data.param.op` is `tool.invoke` (only present when the run was
 * started with pipelineTraceLevel 'full'). Plan steps come from the agent's
 * `apaevt_sse` "thinking" messages. The answer is on the flow `end` event.
 */

export interface RawEvent {
	event: string;
	body: Record<string, unknown>;
}

export interface PlanItem {
	kind: 'plan';
	seq: number;
	text: string;
}

export interface CallItem {
	kind: 'call';
	seq: number;
	component: string;
	tool: string;
	input: unknown;
	output: unknown;
	startTime: number;
	endTime: number | null;
	done: boolean;
}

export type TimelineItem = PlanItem | CallItem;

export type RunStatus = 'none' | 'running' | 'ok' | 'error' | 'cancelled';

export interface RunView {
	status: RunStatus;
	beginTime: number | null;
	endTime: number | null;
	traceLevel: string | null;
	items: TimelineItem[];
	answer: string | null;
	errors: string[];
	hiddenMemoryCalls: number;
}

const BOILERPLATE = [/^Analyzing your request/i, /^Planning step \d+/i, /^Step \d+ complete/i, /^Generating final answer/i];

function num(value: unknown): number | null {
	const n = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(n) ? n : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Reduces a run's events (any order) to the view model. */
export function reduceRun(events: RawEvent[]): RunView {
	const view: RunView = { status: 'none', beginTime: null, endTime: null, traceLevel: null, items: [], answer: null, errors: [], hiddenMemoryCalls: 0 };
	const ordered = events
		.map((e, index) => ({ e, index, seq: num(e.body.logSeq) ?? Number.MAX_SAFE_INTEGER }))
		.sort((a, b) => a.seq - b.seq || a.index - b.index);
	const runningLines: PlanItem[] = [];
	const open = new Map<string, CallItem[]>();

	for (const { e, index } of ordered) {
		const body = e.body;
		const seq = num(body.logSeq) ?? index;
		const time = num(body.eventTime) ?? 0;

		if (e.event === 'apaevt_log_lifecycle') {
			if (body.action === 'run-begin') {
				view.beginTime = time || view.beginTime;
				view.traceLevel = typeof body.traceLevel === 'string' ? body.traceLevel : view.traceLevel;
				if (view.status === 'none') view.status = 'running';
			} else if (body.action === 'run-end') {
				view.endTime = time || view.endTime;
				const outcome = String(body.outcome ?? 'ok');
				view.status = outcome === 'error' ? 'error' : outcome === 'cancelled' ? 'cancelled' : 'ok';
			}
		} else if (e.event === 'apaevt_task') {
			if (body.action === 'begin') {
				view.beginTime = view.beginTime ?? (time || null);
				if (view.status === 'none') view.status = 'running';
			} else if (body.action === 'end') {
				view.endTime = view.endTime ?? (time || null);
				if (view.status === 'running' || view.status === 'none') view.status = 'ok';
			}
		} else if (e.event === 'apaevt_status_update') {
			if (Array.isArray(body.errors)) view.errors = body.errors.map((x) => String(x));
			if (view.status === 'none' && body.completed === false) view.status = 'running';
		} else if (e.event === 'apaevt_sse') {
			const data = asRecord(body.data);
			const message = typeof data?.message === 'string' ? data.message : '';
			if (body.type !== 'thinking' || !message || BOILERPLATE.some((re) => re.test(message))) continue;
			if (Array.isArray(data?.tools)) runningLines.push({ kind: 'plan', seq, text: message });
			else view.items.push({ kind: 'plan', seq, text: message });
		} else if (e.event === 'apaevt_flow') {
			const trace = asRecord(body.trace) ?? {};
			if (body.op === 'end') {
				const answers = trace.answers;
				if (Array.isArray(answers) && answers.length > 0) {
					view.answer = answers.map((a) => (typeof a === 'string' ? a : JSON.stringify(a, null, 2))).join('\n\n');
				}
				continue;
			}
			const param = asRecord(asRecord(trace.data)?.param);
			if (!param || param.op !== 'tool.invoke') continue;
			const component = String(body.component ?? '');
			const tool = String(param.tool_name ?? 'tool');
			if (component.startsWith('memory') || tool.startsWith('memory.')) {
				if (body.op === 'enter') view.hiddenMemoryCalls += 1;
				continue;
			}
			const key = `${component}|${tool}|${JSON.stringify(param.input ?? null)}`;
			if (body.op === 'enter') {
				const call: CallItem = { kind: 'call', seq, component, tool, input: param.input ?? null, output: null, startTime: time, endTime: null, done: false };
				view.items.push(call);
				open.set(key, [...(open.get(key) ?? []), call]);
			} else if (body.op === 'leave') {
				const pending = open.get(key) ?? [];
				const call = pending.shift();
				if (call) {
					call.output = param.output ?? trace.result ?? null;
					call.endTime = time;
					call.done = true;
				}
			}
		}
	}

	// Runs traced below 'full' carry no tool calls: show the wave lines instead.
	if (!view.items.some((item) => item.kind === 'call')) view.items.push(...runningLines);
	view.items.sort((a, b) => a.seq - b.seq);
	if (view.status === 'ok' && view.errors.length > 0 && !view.answer) view.status = 'error';
	return view;
}

// =============================================================================
// DISPLAY HELPERS
// =============================================================================

const SECRET_KEY = /token|apikey|api_key|authorization|bearer|secret|password/i;
const SECRET_VALUE = /(sk-[A-Za-z0-9_-]{8,}|rr_[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,})/g;

/** Deep copy with credential-looking keys and values masked. */
export function redact(value: unknown, depth = 0): unknown {
	if (depth > 12) return '...';
	if (typeof value === 'string') return value.replace(SECRET_VALUE, '***');
	if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
	const record = asRecord(value);
	if (!record) return value;
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(record)) out[k] = SECRET_KEY.test(k) && k !== 'tokens' ? '***' : redact(v, depth + 1);
	return out;
}

/** MCP tool results wrap their payload as text content; unwrap and parse it. */
export function unwrapOutput(output: unknown): unknown {
	const record = asRecord(output);
	const content = record?.content;
	if (Array.isArray(content)) {
		const texts = content
			.map((c) => asRecord(c))
			.filter((c): c is Record<string, unknown> => !!c && typeof c.text === 'string')
			.map((c) => c.text as string);
		if (texts.length === 1) {
			try {
				return JSON.parse(texts[0]);
			} catch {
				return texts[0];
			}
		}
		if (texts.length > 1) return texts;
	}
	return output;
}

export function clip(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max)} ...` : text;
}

export function pretty(value: unknown): string {
	if (typeof value === 'string') return value;
	try {
		return JSON.stringify(value, null, 2) ?? String(value);
	} catch {
		return String(value);
	}
}

/** One-line summary of a tool result. */
export function summarizeOutput(output: unknown): string {
	const value = unwrapOutput(redact(output));
	const record = asRecord(value);
	if (record && Array.isArray(record.rows)) {
		const rows = record.rows as unknown[];
		const affected = num(record.affected_rows) ?? 0;
		if (rows.length === 0) return `${affected} row(s) affected`;
		return `${rows.length} row(s): ${clip(JSON.stringify(rows.slice(0, 3)), 220)}`;
	}
	if (record && Array.isArray(record.entries)) {
		const entries = record.entries as unknown[];
		const names = entries.map((x) => String(asRecord(x)?.name ?? asRecord(x)?.id ?? '')).filter(Boolean);
		const total = num(record.totalCount) ?? num(record.total_count) ?? entries.length;
		return `${total} item(s)${names.length ? `: ${clip(names.join(', '), 200)}` : ''}`;
	}
	if (record && asRecord(record.answer)) return clip(JSON.stringify(record.answer), 320);
	if (record && record.isError === true) return `error: ${clip(pretty(record), 300)}`;
	return clip(typeof value === 'string' ? value : JSON.stringify(value) ?? '', 320);
}

/** Compact one-line rendering of a tool input (SQL shown as-is). */
export function summarizeInput(input: unknown): string {
	const value = redact(input);
	const record = asRecord(value);
	if (record && typeof record.sql === 'string') return clip(record.sql, 320);
	return clip(JSON.stringify(value) ?? '', 320);
}
