// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * One agent's run: its input (the standing brief), each tool call in order on
 * a timeline (tool, input, output summary; click a call for the full
 * payloads), and its final output (the answer).
 */

import React, { useMemo, useState } from 'react';
import { Banner, Button, BxBookOpen, BxCheck, BxChevronDown, BxChevronRight, BxComponent, BxRefresh, BxSearch, BxUser, Card, MarkdownRenderer, StatusBadge, commonStyles } from 'shell';
import type { AgentDef } from './agents';
import type { AgentRunState } from './useAgentRun';
import { clip, pretty, redact, summarizeOutput, unwrapOutput, type CallItem, type PlanItem } from './runTrace';
import { clockText, compactMarkdown, durationText, inputPreview, isErrorOutput, parseAnswer, runState, shortToolName, timelineRows, toolFamily, type ParsedAnswer, type TimelineRow } from './display';
import { IconTile, LiveDot, Pill, Pulse, TONE, tint, type Tone } from './ui';

// =============================================================================
// AGENT LOOK
// =============================================================================

type IconComponent = React.ComponentType<{ size?: number }>;

/** Accent tone and icon per agent, shared with the overview. */
export const AGENT_LOOK: Record<AgentDef['key'], { tone: Tone; Icon: IconComponent }> = {
	bench: { tone: 'green', Icon: BxUser },
	hunter: { tone: 'blue', Icon: BxSearch },
};

// =============================================================================
// STYLES
// =============================================================================

const codeBlock: React.CSSProperties = {
	...commonStyles.fontMono,
	fontSize: 11,
	lineHeight: 1.5,
	whiteSpace: 'pre-wrap',
	wordBreak: 'break-word',
	maxHeight: 280,
	overflowY: 'auto',
	margin: 0,
	padding: '10px 12px',
	borderRadius: 8,
	color: 'var(--rr-text-primary)',
	background: tint('var(--rr-text-primary)', 4),
	boxShadow: 'inset 0 0 0 1px var(--rr-border)',
};

const styles: Record<string, React.CSSProperties> = {
	anchor: { scrollMarginTop: 16 },
	head: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 20px 16px', borderBottom: '1px solid var(--rr-border)' },
	headText: { flex: 1, minWidth: 0 },
	name: { fontSize: 16, fontWeight: 700, lineHeight: 1.25, color: 'var(--rr-text-primary)' },
	role: { fontSize: 12.5, lineHeight: 1.45, color: 'var(--rr-text-secondary)', marginTop: 3 },
	headActions: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
	buttonLabel: { display: 'inline-flex', alignItems: 'center', gap: 5 },
	body: { padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 20 },
	chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
	chip: {
		display: 'inline-flex',
		alignItems: 'center',
		gap: 6,
		padding: '3px 10px',
		borderRadius: 999,
		fontSize: 11.5,
		lineHeight: '18px',
		color: 'var(--rr-text-secondary)',
		boxShadow: 'inset 0 0 0 1px var(--rr-border)',
		whiteSpace: 'nowrap',
	},
	chipValue: { color: 'var(--rr-text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
	sectionHead: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, minHeight: 24 },
	sectionLabel: { ...commonStyles.labelUppercase, fontSize: 10.5, letterSpacing: '0.8px', display: 'inline-flex', alignItems: 'center', gap: 6 },
	sectionAside: { marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 },
	count: { ...commonStyles.textMuted, fontSize: 11 },
	muted: { ...commonStyles.textMuted, fontSize: 13 },
	// Brief
	briefBox: { position: 'relative', overflow: 'hidden', fontSize: 13, lineHeight: 1.5, padding: '2px 2px 0' },
	briefFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 48, background: 'linear-gradient(180deg, transparent, var(--rr-bg-paper))', pointerEvents: 'none' },
	// Timeline
	timeline: { maxHeight: 560, overflowY: 'auto', paddingRight: 6, marginRight: -6 },
	list: { position: 'relative', display: 'flex', flexDirection: 'column', gap: 2 },
	rail: { position: 'absolute', left: 13, top: 14, bottom: 14, width: 2, borderRadius: 1, background: 'var(--rr-border)' },
	callButton: {
		display: 'grid',
		gridTemplateColumns: '28px minmax(0, 1fr)',
		columnGap: 12,
		width: '100%',
		padding: '8px 10px 8px 0',
		border: 'none',
		borderRadius: 10,
		textAlign: 'left',
		font: 'inherit',
		color: 'inherit',
		cursor: 'pointer',
	},
	node: {
		position: 'relative',
		zIndex: 1,
		width: 28,
		height: 28,
		borderRadius: '50%',
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		fontSize: 11,
		fontWeight: 700,
		fontVariantNumeric: 'tabular-nums',
	},
	callMain: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 3 },
	callTop: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
	toolName: { ...commonStyles.fontMono, ...commonStyles.textEllipsis, fontSize: 12.5, fontWeight: 600, color: 'var(--rr-text-primary)', minWidth: 0 },
	callMeta: { marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--rr-text-secondary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 },
	callInput: {
		...commonStyles.fontMono,
		fontSize: 11.5,
		lineHeight: 1.45,
		color: 'var(--rr-text-secondary)',
		display: '-webkit-box',
		WebkitLineClamp: 2,
		WebkitBoxOrient: 'vertical',
		overflow: 'hidden',
		wordBreak: 'break-word',
	},
	callOutput: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, minWidth: 0 },
	callOutputText: { ...commonStyles.textEllipsis, minWidth: 0 },
	outLabel: { ...commonStyles.labelUppercase, fontSize: 9.5, letterSpacing: '0.6px', flexShrink: 0 },
	details: { display: 'grid', gap: 10, margin: '2px 10px 10px 40px' },
	payloadLabel: { ...commonStyles.labelUppercase, fontSize: 10, letterSpacing: '0.6px', marginBottom: 4 },
	pre: codeBlock,
	thought: { display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', columnGap: 12, padding: '4px 10px 4px 0' },
	thoughtNode: { position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'center', paddingTop: 6 },
	thoughtDot: { width: 10, height: 10, borderRadius: '50%', background: 'var(--rr-bg-paper)', boxShadow: 'inset 0 0 0 2px var(--rr-text-disabled)' },
	thoughtText: {
		fontSize: 12,
		lineHeight: 1.5,
		fontStyle: 'italic',
		color: 'var(--rr-text-secondary)',
		display: '-webkit-box',
		WebkitLineClamp: 2,
		WebkitBoxOrient: 'vertical',
		overflow: 'hidden',
	},
	linkButton: { padding: 0, marginTop: 2, border: 'none', background: 'none', font: 'inherit', fontSize: 11.5, fontWeight: 600, color: 'var(--rr-text-link)', cursor: 'pointer' },
	thoughtList: { margin: '6px 0 2px', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, lineHeight: 1.45, fontStyle: 'italic', color: 'var(--rr-text-secondary)' },
	working: { display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', columnGap: 12, alignItems: 'center', padding: '6px 10px 6px 0', fontSize: 12, color: 'var(--rr-color-info)' },
	workingNode: { position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'center' },
	emptyBox: { padding: '22px 16px', borderRadius: 10, textAlign: 'center', boxShadow: 'inset 0 0 0 1px var(--rr-border)' },
	emptyTitle: { fontSize: 13, fontWeight: 600, color: 'var(--rr-text-primary)' },
	emptyHint: { ...commonStyles.textMuted, marginTop: 4 },
	code: { ...commonStyles.fontMono, fontSize: 11.5, padding: '1px 6px', borderRadius: 4, background: tint('var(--rr-text-primary)', 7) },
	// Result
	resultBody: { fontSize: 13, lineHeight: 1.5 },
	facts: { display: 'grid', gridTemplateColumns: 'minmax(110px, max-content) minmax(0, 1fr)', columnGap: 18, rowGap: 6, fontSize: 12.5 },
	factLabel: { color: 'var(--rr-text-secondary)' },
	factValue: { color: 'var(--rr-text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', wordBreak: 'break-word' },
	issues: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--rr-border)' },
	issuesLabel: { ...commonStyles.labelUppercase, fontSize: 10, letterSpacing: '0.6px', color: 'var(--rr-color-warning)' },
	issue: { display: 'grid', gridTemplateColumns: '10px minmax(0, 1fr)', columnGap: 10, alignItems: 'baseline', fontSize: 12.5, lineHeight: 1.5, color: 'var(--rr-text-primary)' },
	rawToggle: { marginTop: 12 },
	rawPre: { ...codeBlock, marginTop: 8, maxHeight: 360 },
	stack: { display: 'flex', flexDirection: 'column', gap: 10 },
};

function headStyle(tone: Tone): React.CSSProperties {
	return { ...styles.head, background: `linear-gradient(180deg, ${tint(TONE[tone], 10)}, transparent)` };
}

function callButtonStyle(hovered: boolean, open: boolean): React.CSSProperties {
	return { ...styles.callButton, background: hovered || open ? tint('var(--rr-text-primary)', 4) : 'transparent' };
}

function nodeStyle(tone: Tone): React.CSSProperties {
	// An opaque paper base under the tint hides the rail behind the node.
	return {
		...styles.node,
		color: TONE[tone],
		background: `linear-gradient(${tint(TONE[tone], 16)}, ${tint(TONE[tone], 16)}), var(--rr-bg-paper)`,
		boxShadow: `inset 0 0 0 1.5px ${tint(TONE[tone], 65)}`,
	};
}

function outputStyle(error: boolean): React.CSSProperties {
	return { ...styles.callOutput, color: error ? 'var(--rr-color-error)' : 'var(--rr-text-primary)' };
}

function outLabelStyle(error: boolean): React.CSSProperties {
	return { ...styles.outLabel, color: error ? 'var(--rr-color-error)' : 'var(--rr-text-disabled)' };
}

function briefBoxStyle(open: boolean): React.CSSProperties {
	return { ...styles.briefBox, maxHeight: open ? 420 : 104, overflowY: open ? 'auto' : 'hidden' };
}

function resultStyle(tone: Tone): React.CSSProperties {
	return {
		...styles.resultBody,
		padding: '14px 16px',
		borderRadius: 10,
		background: tint(TONE[tone], 7),
		boxShadow: `inset 3px 0 0 ${TONE[tone]}, inset 0 0 0 1px ${tint(TONE[tone], 22)}`,
	};
}

// =============================================================================
// PIECES
// =============================================================================

const SectionHead: React.FC<{ icon: React.ReactNode; label: string; aside?: React.ReactNode }> = ({ icon, label, aside }) => (
	<div style={styles.sectionHead}>
		<span style={styles.sectionLabel}>
			{icon}
			{label}
		</span>
		{aside && <span style={styles.sectionAside}>{aside}</span>}
	</div>
);

const Brief: React.FC<{ brief: string | null; path: string }> = ({ brief, path }) => {
	const [open, setOpen] = useState(false);
	const content = useMemo(() => (brief ? compactMarkdown(brief) : ''), [brief]);
	return (
		<section>
			<SectionHead
				icon={<BxBookOpen size={13} />}
				label='Input · standing brief'
				aside={
					brief && (
						<Button variant='ghost' small onClick={() => setOpen((v) => !v)} ariaExpanded={open}>
							{open ? 'Collapse' : 'Show full brief'}
						</Button>
					)
				}
			/>
			{brief ? (
				<div style={briefBoxStyle(open)}>
					<MarkdownRenderer content={content} />
					{!open && <div style={styles.briefFade} />}
				</div>
			) : (
				<div style={styles.muted}>No brief at {path}</div>
			)}
		</section>
	);
};

const CallRow: React.FC<{ call: CallItem; number: number; runActive: boolean }> = ({ call, number, runActive }) => {
	const [open, setOpen] = useState(false);
	const [hovered, setHovered] = useState(false);
	const family = toolFamily(call);
	const error = call.done && isErrorOutput(call.output);
	const pending = !call.done && runActive;
	const tone: Tone = error ? 'error' : pending ? 'info' : call.done ? family.tone : 'muted';
	const duration = call.done && call.endTime ? `${Math.max(0, call.endTime - call.startTime).toFixed(1)} s` : pending ? 'running' : 'no result';
	return (
		<div>
			<button
				type='button'
				style={callButtonStyle(hovered, open)}
				onClick={() => setOpen((v) => !v)}
				onMouseEnter={() => setHovered(true)}
				onMouseLeave={() => setHovered(false)}
				aria-expanded={open}
				title='Show the full input and output'
			>
				<Pulse active={pending}>
					<span style={nodeStyle(tone)}>{number}</span>
				</Pulse>
				<span style={styles.callMain}>
					<span style={styles.callTop}>
						<Pill tone={family.tone}>{family.label}</Pill>
						<span style={styles.toolName} title={`${call.tool} (${call.component})`}>
							{shortToolName(call.tool)}
						</span>
						<span style={styles.callMeta}>
							{duration}
							{open ? <BxChevronDown size={14} /> : <BxChevronRight size={14} />}
						</span>
					</span>
					<span style={styles.callInput}>{inputPreview(call.input)}</span>
					<span style={outputStyle(error)}>
						<span style={outLabelStyle(error)}>{error ? 'Error' : 'Out'}</span>
						<span style={styles.callOutputText}>{call.done ? summarizeOutput(call.output) : pending ? 'waiting for the result' : 'no result recorded'}</span>
					</span>
				</span>
			</button>
			{open && (
				<div style={styles.details}>
					<div>
						<div style={styles.payloadLabel}>Input</div>
						<pre style={styles.pre}>{clip(pretty(redact(call.input)), 4000)}</pre>
					</div>
					<div>
						<div style={styles.payloadLabel}>Output</div>
						<pre style={styles.pre}>{call.done ? clip(pretty(unwrapOutput(redact(call.output))), 12000) : '(no result)'}</pre>
					</div>
				</div>
			)}
		</div>
	);
};

const Thoughts: React.FC<{ items: PlanItem[] }> = ({ items }) => {
	const [open, setOpen] = useState(false);
	const latest = items[items.length - 1];
	const earlier = items.length - 1;
	return (
		<div style={styles.thought}>
			<span style={styles.thoughtNode}>
				<span style={styles.thoughtDot} />
			</span>
			<div>
				<div style={styles.thoughtText} title={latest.text}>
					{latest.text}
				</div>
				{earlier > 0 && (
					<button type='button' style={styles.linkButton} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
						{open ? 'Hide earlier thoughts' : `+${earlier} earlier ${earlier === 1 ? 'thought' : 'thoughts'}`}
					</button>
				)}
				{open && (
					<ol style={styles.thoughtList}>
						{items.slice(0, -1).map((item) => (
							<li key={item.seq}>{item.text}</li>
						))}
					</ol>
				)}
			</div>
		</div>
	);
};

const Timeline: React.FC<{ rows: TimelineRow[]; running: boolean; noRun: boolean }> = ({ rows, running, noRun }) => {
	if (rows.length === 0) {
		return (
			<div style={styles.emptyBox}>
				<div style={styles.emptyTitle}>{noRun ? 'No run recorded yet' : 'Waiting for the first step'}</div>
				<div style={styles.emptyHint}>
					{noRun ? (
						<>
							Start one with <code style={styles.code}>npm run demo</code>
						</>
					) : (
						'The agent is planning its first tool call.'
					)}
				</div>
			</div>
		);
	}
	return (
		<div style={styles.timeline}>
			<div style={styles.list}>
				<span style={styles.rail} />
				{rows.map((row) =>
					row.kind === 'call' ? <CallRow key={row.key} call={row.call} number={row.number} runActive={running} /> : <Thoughts key={row.key} items={row.items} />,
				)}
				{running && (
					<div style={styles.working}>
						<span style={styles.workingNode}>
							<LiveDot tone='info' live size={10} />
						</span>
						<Pulse active>Working on the next step</Pulse>
					</div>
				)}
			</div>
		</div>
	);
};

const Result: React.FC<{ answer: ParsedAnswer | null; tone: Tone; running: boolean }> = ({ answer, tone, running }) => {
	const [raw, setRaw] = useState(false);
	if (!answer) return <div style={styles.muted}>{running ? 'The agent is still working.' : 'No answer recorded.'}</div>;
	if (answer.kind === 'markdown') {
		return (
			<div style={resultStyle(tone)}>
				<MarkdownRenderer content={answer.text} />
			</div>
		);
	}
	return (
		<div style={resultStyle(answer.issues.length > 0 ? 'warning' : tone)}>
			<div style={styles.facts}>
				{answer.facts.map((fact) => (
					<React.Fragment key={fact.label}>
						<span style={styles.factLabel}>{fact.label}</span>
						<span style={styles.factValue}>{fact.value}</span>
					</React.Fragment>
				))}
			</div>
			{answer.issues.length > 0 && (
				<div style={styles.issues}>
					<span style={styles.issuesLabel}>
						{answer.issues.length} {answer.issues.length === 1 ? 'issue' : 'issues'} reported
					</span>
					{answer.issues.map((issue, index) => (
						<div key={index} style={styles.issue}>
							<LiveDot tone='warning' size={6} />
							<span>{issue}</span>
						</div>
					))}
				</div>
			)}
			<div style={styles.rawToggle}>
				<Button variant='ghost' small onClick={() => setRaw((v) => !v)} ariaExpanded={raw}>
					{raw ? 'Hide raw JSON' : 'Show raw JSON'}
				</Button>
			</div>
			{raw && <pre style={styles.rawPre}>{answer.raw}</pre>}
		</div>
	);
};

// =============================================================================
// COMPONENT
// =============================================================================

export const AgentPanel: React.FC<{ agent: AgentDef; state: AgentRunState }> = ({ agent, state }) => {
	const { run, brief, error, loading, reload } = state;
	const look = AGENT_LOOK[agent.key];
	const answer = useMemo(() => (run.answer ? parseAnswer(run.answer) : null), [run.answer]);
	const info = runState(run, answer);
	const rows = useMemo(() => timelineRows(run.items), [run.items]);
	const calls = run.items.filter((item) => item.kind === 'call').length;
	const running = run.status === 'running';
	const started = clockText(run.beginTime);
	const duration = run.beginTime && run.endTime ? durationText(run.endTime - run.beginTime) : '';

	return (
		<div id={`agent-${agent.key}`} style={styles.anchor}>
			<Card noBodyPadding>
				<div style={headStyle(look.tone)}>
					<IconTile tone={look.tone} size={38}>
						<look.Icon size={20} />
					</IconTile>
					<div style={styles.headText}>
						<div style={styles.name}>{agent.label}</div>
						<div style={styles.role}>{agent.role}</div>
					</div>
					<div style={styles.headActions}>
						<Pulse active={running}>
							<StatusBadge variant={info.badge}>{info.label}</StatusBadge>
						</Pulse>
						<Button variant='secondary' small disabled={loading} onClick={reload} title='Load the latest recorded run again'>
							<span style={styles.buttonLabel}>
								<BxRefresh size={13} />
								{loading ? 'Loading' : 'Replay'}
							</span>
						</Button>
					</div>
				</div>

				<div style={styles.body}>
					{(started || calls > 0) && (
						<div style={styles.chips}>
							{started && (
								<span style={styles.chip}>
									Started <span style={styles.chipValue}>{started}</span>
								</span>
							)}
							{started && (
								<span style={styles.chip}>
									{running ? (
										<Pulse active>
											<span style={styles.chipValue}>In progress</span>
										</Pulse>
									) : (
										<>
											Took <span style={styles.chipValue}>{duration || 'n/a'}</span>
										</>
									)}
								</span>
							)}
							<span style={styles.chip}>
								<span style={styles.chipValue}>{calls}</span> tool {calls === 1 ? 'call' : 'calls'}
							</span>
							{run.hiddenMemoryCalls > 0 && (
								<span style={styles.chip} title='Reads and writes of the agent memory, hidden from the timeline'>
									<span style={styles.chipValue}>{run.hiddenMemoryCalls}</span> memory ops
								</span>
							)}
						</div>
					)}

					{error && <Banner variant='error'>{error}</Banner>}
					{run.traceLevel && run.traceLevel !== 'full' && (
						<Banner variant='info'>This run was traced at "{run.traceLevel}": it records the plan but not the tool inputs and outputs.</Banner>
					)}

					<Brief brief={brief} path={agent.briefPath} />

					<section>
						<SectionHead icon={<BxComponent size={13} />} label='Tool calls' aside={<span style={styles.count}>{calls} in order · click one for its payloads</span>} />
						<Timeline rows={rows} running={running} noRun={run.status === 'none'} />
					</section>

					<section>
						<SectionHead icon={<BxCheck size={13} />} label='Output · final answer' />
						<div style={styles.stack}>
							<Result answer={answer} tone={look.tone} running={running} />
							{run.errors.length > 0 && <Banner variant='error'>{clip(run.errors[run.errors.length - 1], 600)}</Banner>}
						</div>
					</section>
				</div>
			</Card>
		</div>
	);
};
