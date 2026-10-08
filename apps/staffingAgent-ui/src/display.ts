// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * Pure display helpers on top of the run view model: timeline rows (repeated
 * plan steps folded together), tool families, the derived run state, final
 * answers parsed for display, and compact markdown for briefs.
 */

import type { CallItem, PlanItem, RunStatus, RunView, TimelineItem } from './runTrace';
import { redact } from './runTrace';
import type { Tone } from './ui';

// =============================================================================
// TIMELINE
// =============================================================================

export type TimelineRow = { kind: 'call'; key: string; number: number; call: CallItem } | { kind: 'thoughts'; key: string; items: PlanItem[] };

/** Numbers the tool calls and folds consecutive plan steps into one row. */
export function timelineRows(items: TimelineItem[]): TimelineRow[] {
	const rows: TimelineRow[] = [];
	let number = 0;
	for (const item of items) {
		if (item.kind === 'call') {
			rows.push({ kind: 'call', key: `c${item.seq}`, number: ++number, call: item });
			continue;
		}
		const last = rows[rows.length - 1];
		if (last?.kind === 'thoughts') last.items.push(item);
		else rows.push({ kind: 'thoughts', key: `p${item.seq}`, items: [item] });
	}
	return rows;
}

export interface ToolFamily {
	label: string;
	tone: Tone;
}

/** The service a tool call talks to, for the coloured pill in front of it. */
export function toolFamily(call: CallItem): ToolFamily {
	const component = call.component.toLowerCase();
	const tool = call.tool.toLowerCase();
	if (tool.startsWith('box.') || component.includes('box')) return { label: 'Box', tone: 'blue' };
	if (tool.startsWith('glasser.') || component.includes('glasser')) return { label: 'Glasser', tone: 'orange' };
	if (tool.includes('gmail') || component.includes('gmail')) return { label: 'Gmail', tone: 'red' };
	if (tool === 'execute' || component.includes('sql') || component === 'db') return { label: 'SQL', tone: 'purple' };
	return { label: call.component || 'tool', tone: 'muted' };
}

/** Tool name without its family prefix (`box.list_folder` shows as `list_folder`). */
export function shortToolName(tool: string): string {
	const dot = tool.indexOf('.');
	return dot > 0 && dot < tool.length - 1 ? tool.slice(dot + 1) : tool;
}

const INPUT_PREVIEW_MAX = 320;

function previewValue(value: unknown): string {
	if (value === null || value === undefined) return 'null';
	if (typeof value === 'string') return value.length > 80 ? `${value.slice(0, 80)}...` : value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	if (Array.isArray(value)) {
		const simple = value.every((item) => typeof item === 'string' || typeof item === 'number');
		const joined = simple ? value.join(', ') : '';
		return simple && joined.length <= 60 ? `[${joined}]` : `[${value.length} ${value.length === 1 ? 'item' : 'items'}]`;
	}
	const text = JSON.stringify(value) ?? '';
	return text.length > 60 ? `${text.slice(0, 60)}...` : text;
}

/** One-line tool input: SQL as written (whitespace collapsed), objects as `key: value` pairs. */
export function inputPreview(input: unknown): string {
	const value = redact(input);
	let text: string;
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const record = value as Record<string, unknown>;
		if (typeof record.sql === 'string') text = record.sql.replace(/\s+/g, ' ').trim();
		else {
			const entries = Object.entries(record);
			text = entries.length === 0 ? 'no arguments' : entries.map(([key, item]) => `${key}: ${previewValue(item)}`).join('  ·  ');
		}
	} else text = previewValue(value);
	return text.length > INPUT_PREVIEW_MAX ? `${text.slice(0, INPUT_PREVIEW_MAX)} ...` : text;
}

/** True when a finished tool result reports an error. */
export function isErrorOutput(output: unknown): boolean {
	return !!output && typeof output === 'object' && (output as Record<string, unknown>).isError === true;
}

// =============================================================================
// FINAL ANSWER
// =============================================================================

export interface AnswerFact {
	label: string;
	value: string;
}

export type ParsedAnswer = { kind: 'markdown'; text: string } | { kind: 'json'; facts: AnswerFact[]; issues: string[]; raw: string };

const ISSUE_KEY = /error|issue|warning|problem|failure/i;
const ISO_DATE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/** `glasser_balance_before` reads as "Glasser balance before". */
export function humanize(key: string): string {
	const words = key
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.trim()
		.toLowerCase();
	return words.charAt(0).toUpperCase() + words.slice(1);
}

function factValue(value: unknown): string {
	if (value === null || value === undefined || value === '') return 'none';
	if (Array.isArray(value)) return value.length === 0 ? 'none' : `${value.length}`;
	if (typeof value === 'object') {
		const text = JSON.stringify(value);
		return text.length > 120 ? `${text.slice(0, 120)} ...` : text;
	}
	const text = String(value);
	// ISO timestamps read as "2026-10-07 00:00 UTC": converting to local time can shift the day.
	const iso = ISO_DATE.exec(text);
	if (iso) return `${iso[1]} ${iso[2]}${iso[3] === 'Z' ? ' UTC' : iso[3] ? ` ${iso[3]}` : ''}`;
	return text;
}

/** Final answers that are one JSON object become facts and issues; anything else stays markdown. */
export function parseAnswer(answer: string): ParsedAnswer {
	const text = String(redact(answer));
	const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text.trim());
	const body = (fenced ? fenced[1] : text).trim();
	if (!body.startsWith('{')) return { kind: 'markdown', text };
	let value: unknown;
	try {
		value = JSON.parse(body);
	} catch {
		return { kind: 'markdown', text };
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) return { kind: 'markdown', text };
	const facts: AnswerFact[] = [];
	const issues: string[] = [];
	for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
		if (ISSUE_KEY.test(key) && Array.isArray(item)) {
			issues.push(...item.map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry))));
			continue;
		}
		facts.push({ label: humanize(key), value: factValue(item) });
	}
	return { kind: 'json', facts, issues, raw: JSON.stringify(value, null, 2) };
}

// =============================================================================
// RUN STATE
// =============================================================================

export type RunState = RunStatus | 'issues';

export interface RunStateInfo {
	state: RunState;
	label: string;
	tone: Tone;
	badge: 'success' | 'info' | 'warning' | 'error' | 'muted';
}

const RUN_STATE: Record<RunState, Omit<RunStateInfo, 'state'>> = {
	none: { label: 'No run yet', tone: 'muted', badge: 'muted' },
	running: { label: 'Running', tone: 'info', badge: 'info' },
	ok: { label: 'Done', tone: 'success', badge: 'success' },
	issues: { label: 'Done with issues', tone: 'warning', badge: 'warning' },
	error: { label: 'Failed', tone: 'error', badge: 'error' },
	cancelled: { label: 'Cancelled', tone: 'warning', badge: 'warning' },
};

/** The run status, refined: a finished run whose answer lists errors is "done with issues". */
export function runState(run: RunView, answer: ParsedAnswer | null): RunStateInfo {
	const state: RunState = run.status === 'ok' && answer?.kind === 'json' && answer.issues.length > 0 ? 'issues' : run.status;
	return { state, ...RUN_STATE[state] };
}

/** "4 min 21 s" style duration from seconds. */
export function durationText(seconds: number): string {
	const total = Math.max(0, Math.round(seconds));
	if (total < 60) return `${total} s`;
	const minutes = Math.floor(total / 60);
	const rest = total % 60;
	return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}

/** Wall-clock time of an epoch-seconds value, without seconds. */
export function clockText(epochSeconds: number | null): string {
	return epochSeconds ? new Date(epochSeconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
}

// =============================================================================
// MARKDOWN
// =============================================================================

/** Brief markdown for a compact panel: drops the leading H1 (the panel names the brief) and demotes other headings. */
export function compactMarkdown(markdown: string): string {
	const withoutTitle = markdown.replace(/^\s*#\s+[^\n]*\n+/, '');
	return withoutTitle.replace(/^(#{1,3})\s+/gm, '#### ');
}
