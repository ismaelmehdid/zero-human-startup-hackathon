// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * One agent's run: its input (the standing brief), each tool call in order
 * (tool, input, output summary; click a call for the full payloads), and its
 * final output (the answer).
 */

import React, { useState } from 'react';
import { Banner, Button, Card, MarkdownRenderer, Section, StatusBadge, commonStyles } from 'shell';
import type { AgentDef } from './agents';
import type { AgentRunState } from './useAgentRun';
import { clip, pretty, redact, summarizeInput, summarizeOutput, unwrapOutput, type CallItem, type RunStatus } from './runTrace';

// =============================================================================
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
	headerActions: { display: 'flex', alignItems: 'center', gap: 8 },
	role: { fontSize: 13, color: 'var(--rr-text-secondary)', marginBottom: 12 },
	meta: { ...commonStyles.textMuted, fontSize: 12, marginBottom: 12 },
	brief: { maxHeight: 220, overflowY: 'auto', fontSize: 13, padding: '0 4px' },
	timeline: { maxHeight: 460, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 },
	plan: { fontSize: 12, fontStyle: 'italic', color: 'var(--rr-text-secondary)', borderLeft: '2px solid var(--rr-border)', paddingLeft: 8 },
	call: { border: '1px solid var(--rr-border)', borderRadius: 6, padding: '6px 8px', background: 'var(--rr-bg-surface-alt, transparent)' },
	callHead: { display: 'flex', alignItems: 'baseline', gap: 8, cursor: 'pointer' },
	callIndex: { ...commonStyles.fontMono, fontSize: 11, color: 'var(--rr-text-secondary)', minWidth: 18 },
	callTool: { ...commonStyles.fontMono, fontSize: 13, fontWeight: 600, color: 'var(--rr-text-primary)' },
	callMeta: { ...commonStyles.textMuted, fontSize: 11, marginLeft: 'auto', whiteSpace: 'nowrap' },
	callLine: { display: 'flex', gap: 6, marginTop: 4, fontSize: 12, alignItems: 'baseline' },
	callLabel: { ...commonStyles.labelUppercase, fontSize: 10, minWidth: 26, color: 'var(--rr-text-secondary)' },
	code: { ...commonStyles.fontMono, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--rr-text-primary)' },
	pre: { ...commonStyles.fontMono, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflowY: 'auto', marginTop: 6, padding: 8, borderRadius: 4, border: '1px solid var(--rr-border)' },
	muted: { ...commonStyles.textMuted, fontSize: 13 },
	answer: { fontSize: 13 },
};

// =============================================================================
// HELPERS
// =============================================================================

const STATUS: Record<RunStatus, { variant: 'success' | 'info' | 'warning' | 'error' | 'muted'; label: string }> = {
	none: { variant: 'muted', label: 'No run yet' },
	running: { variant: 'info', label: 'Running' },
	ok: { variant: 'success', label: 'Done' },
	error: { variant: 'error', label: 'Failed' },
	cancelled: { variant: 'warning', label: 'Cancelled' },
};

function clock(epochSeconds: number | null): string {
	return epochSeconds ? new Date(epochSeconds * 1000).toLocaleTimeString() : '';
}

// =============================================================================
// COMPONENTS
// =============================================================================

const CallRow: React.FC<{ call: CallItem; index: number }> = ({ call, index }) => {
	const [open, setOpen] = useState(false);
	const duration = call.done && call.endTime ? `${Math.max(0, call.endTime - call.startTime).toFixed(1)} s` : 'running';
	return (
		<div style={styles.call}>
			<div style={styles.callHead} onClick={() => setOpen((v) => !v)} title='Show the full input and output'>
				<span style={styles.callIndex}>{index}</span>
				<span style={styles.callTool}>{call.tool}</span>
				<span style={styles.callMeta}>
					{call.component} · {duration}
				</span>
			</div>
			<div style={styles.callLine}>
				<span style={styles.callLabel}>in</span>
				<code style={styles.code}>{summarizeInput(call.input)}</code>
			</div>
			<div style={styles.callLine}>
				<span style={styles.callLabel}>out</span>
				<code style={styles.code}>{call.done ? summarizeOutput(call.output) : '...'}</code>
			</div>
			{open && (
				<pre style={styles.pre}>
					{`INPUT\n${clip(pretty(redact(call.input)), 4000)}\n\nOUTPUT\n${call.done ? clip(pretty(unwrapOutput(redact(call.output))), 12000) : '(still running)'}`}
				</pre>
			)}
		</div>
	);
};

export const AgentPanel: React.FC<{ agent: AgentDef; state: AgentRunState }> = ({ agent, state }) => {
	const { run, brief, error, loading, reload } = state;
	const status = STATUS[run.status];
	const calls = run.items.filter((item) => item.kind === 'call').length;
	let callNumber = 0;
	const started = clock(run.beginTime);
	const ended = clock(run.endTime);
	const duration = run.beginTime && run.endTime ? `${Math.round(run.endTime - run.beginTime)} s` : '';

	return (
		<Card
			header={agent.label}
			headerActions={
				<div style={styles.headerActions}>
					<StatusBadge variant={status.variant}>{status.label}</StatusBadge>
					<Button variant='secondary' small disabled={loading} onClick={reload}>
						{loading ? 'Loading' : 'Replay latest'}
					</Button>
				</div>
			}
		>
			<div style={styles.role}>{agent.role}</div>
			{started && (
				<div style={styles.meta}>
					Started {started}
					{ended ? ` · ended ${ended} · ${duration}` : ' · in progress'}
					{run.traceLevel ? ` · trace ${run.traceLevel}` : ''}
				</div>
			)}
			{error && <Banner variant='error'>{error}</Banner>}
			{run.traceLevel && run.traceLevel !== 'full' && (
				<Banner variant='info'>This run was traced at "{run.traceLevel}": it records the plan but not the tool inputs and outputs.</Banner>
			)}

			<Section label='Input · standing brief'>
				{brief ? (
					<div style={styles.brief}>
						<MarkdownRenderer content={brief} />
					</div>
				) : (
					<div style={styles.muted}>No brief at {agent.briefPath}</div>
				)}
			</Section>

			<Section label={`Tool calls · ${calls}${run.hiddenMemoryCalls ? ` (+${run.hiddenMemoryCalls} memory)` : ''}`}>
				{run.items.length === 0 ? (
					<div style={styles.muted}>{run.status === 'none' ? 'No run recorded yet. Start one with npm run demo.' : 'Waiting for the first step.'}</div>
				) : (
					<div style={styles.timeline}>
						{run.items.map((item) =>
							item.kind === 'plan' ? (
								<div key={`p${item.seq}`} style={styles.plan}>
									{item.text}
								</div>
							) : (
								<CallRow key={`c${item.seq}`} call={item} index={++callNumber} />
							),
						)}
					</div>
				)}
			</Section>

			<Section label='Output · final answer'>
				{run.answer ? (
					<div style={styles.answer}>
						<MarkdownRenderer content={run.answer} />
					</div>
				) : (
					<div style={styles.muted}>{run.status === 'running' ? 'The agent is still working.' : 'No answer recorded.'}</div>
				)}
				{run.errors.length > 0 && <Banner variant='error'>{clip(run.errors[run.errors.length - 1], 600)}</Banner>}
			</Section>
		</Card>
	);
};
