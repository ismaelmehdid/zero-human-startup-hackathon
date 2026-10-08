// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * The whole view, from plain props (no hooks into the shell connection): a hero
 * with the agent flow, headline numbers from the database, one panel per agent
 * and the database panel. App.tsx feeds it live data.
 */

import React, { useMemo } from 'react';
import { Banner, BxCheck, BxChevronRight, BxExport, BxPurchaseTag, BxRocket, BxUndo, BxUser, commonStyles } from 'shell';
import { AGENTS, type AgentDef } from './agents';
import { AGENT_LOOK, AgentPanel } from './AgentPanel';
import { DataPanel } from './DataPanel';
import { clockText, durationText, parseAnswer, runState, type RunStateInfo } from './display';
import type { AgentRunState } from './useAgentRun';
import type { DatabaseState } from './useDatabase';
import { IconTile, LiveDot, Pulse, TONE, tint, type Tone } from './ui';

// =============================================================================
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
	page: { height: '100%', overflowY: 'auto', boxSizing: 'border-box', background: 'var(--rr-bg-default)', color: 'var(--rr-text-primary)', fontFamily: 'var(--rr-font-family, system-ui)' },
	column: { maxWidth: 1520, margin: '0 auto', padding: '24px 24px 40px', display: 'flex', flexDirection: 'column', gap: 20 },
	// Hero
	hero: {
		position: 'relative',
		overflow: 'hidden',
		borderRadius: 12,
		border: '1px solid var(--rr-border)',
		padding: '24px 24px 20px',
		background: `radial-gradient(900px 280px at 0% 0%, ${tint('var(--rr-brand)', 16)}, transparent 70%), radial-gradient(700px 260px at 100% 0%, ${tint('var(--rr-chart-purple)', 14)}, transparent 70%), var(--rr-bg-paper)`,
	},
	heroTop: { display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' },
	logo: {
		width: 52,
		height: 52,
		borderRadius: 14,
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		flexShrink: 0,
		color: 'var(--rr-bg-default)',
		background: 'linear-gradient(135deg, var(--rr-brand), var(--rr-chart-purple))',
		boxShadow: `0 8px 24px ${tint('var(--rr-brand)', 28)}`,
	},
	heroText: { flex: '1 1 380px', minWidth: 0 },
	eyebrow: { ...commonStyles.labelUppercase, fontSize: 10.5, letterSpacing: '1.2px', color: 'var(--rr-brand)', marginBottom: 4 },
	title: { fontSize: 28, fontWeight: 750, letterSpacing: '-0.5px', lineHeight: 1.15, color: 'var(--rr-text-primary)' },
	tagline: { marginTop: 6, fontSize: 14, lineHeight: 1.5, color: 'var(--rr-text-secondary)', maxWidth: 760 },
	live: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
	flow: { display: 'flex', alignItems: 'stretch', gap: 8, marginTop: 22, flexWrap: 'wrap' },
	step: {
		flex: '1 1 230px',
		minWidth: 0,
		display: 'flex',
		flexDirection: 'column',
		gap: 6,
		padding: '12px 14px',
		borderRadius: 10,
		border: 'none',
		textAlign: 'left',
		font: 'inherit',
		color: 'inherit',
		background: tint('var(--rr-bg-default)', 55),
	},
	stepHead: { display: 'flex', alignItems: 'center', gap: 10 },
	stepName: { fontSize: 14, fontWeight: 700, color: 'var(--rr-text-primary)' },
	stepIndex: { ...commonStyles.labelUppercase, fontSize: 10, color: 'var(--rr-text-disabled)', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' },
	stepCaption: { fontSize: 12, lineHeight: 1.4, color: 'var(--rr-text-secondary)' },
	stepStatus: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, marginTop: 2, minWidth: 0 },
	stepDetail: { ...commonStyles.textEllipsis, fontWeight: 400, color: 'var(--rr-text-secondary)', fontVariantNumeric: 'tabular-nums' },
	connector: { display: 'flex', alignItems: 'center', color: 'var(--rr-text-disabled)', flexShrink: 0 },
	footnote: { marginTop: 16, fontSize: 12, lineHeight: 1.5, color: 'var(--rr-text-secondary)' },
	code: { ...commonStyles.fontMono, fontSize: 11.5, padding: '1px 6px', borderRadius: 4, color: 'var(--rr-text-primary)', background: tint('var(--rr-text-primary)', 8) },
	// Numbers
	stats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 },
	statText: { minWidth: 0 },
	statValue: { fontSize: 26, fontWeight: 700, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums', color: 'var(--rr-text-primary)' },
	statLabel: { ...commonStyles.textEllipsis, fontSize: 12, marginTop: 3, color: 'var(--rr-text-secondary)' },
	// Sections
	sectionTitle: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: -8 },
	sectionName: { fontSize: 15, fontWeight: 700, color: 'var(--rr-text-primary)' },
	sectionCaption: { fontSize: 12, color: 'var(--rr-text-secondary)' },
	agents: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 520px), 1fr))', gap: 20, alignItems: 'start' },
};

function liveStyle(connected: boolean): React.CSSProperties {
	const tone = connected ? TONE.success : TONE.muted;
	return { ...styles.live, color: tone, background: tint(tone, 12), boxShadow: `inset 0 0 0 1px ${tint(tone, 30)}` };
}

function stepStyle(tone: Tone, planned: boolean): React.CSSProperties {
	return planned
		? { ...styles.step, cursor: 'default', opacity: 0.75, boxShadow: 'inset 0 0 0 1px var(--rr-border)', backgroundImage: 'none', outline: '1px dashed var(--rr-border-hover)', outlineOffset: -1 }
		: { ...styles.step, cursor: 'pointer', boxShadow: `inset 0 0 0 1px ${tint(TONE[tone], 30)}, inset 0 3px 0 ${tint(TONE[tone], 70)}` };
}

function statStyle(tone: Tone): React.CSSProperties {
	return {
		display: 'flex',
		alignItems: 'center',
		gap: 14,
		padding: '14px 16px',
		borderRadius: 10,
		border: '1px solid var(--rr-border)',
		background: `radial-gradient(180px 90px at 0% 0%, ${tint(TONE[tone], 12)}, transparent 75%), var(--rr-bg-paper)`,
	};
}

// =============================================================================
// HERO
// =============================================================================

interface FlowStep {
	key: string;
	label: string;
	caption: string;
	tone: Tone;
	icon: React.ReactNode;
	/** Null for a step that does not run yet. */
	info: RunStateInfo | null;
	detail: string;
}

function scrollToAgent(key: string) {
	document.getElementById(`agent-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const Step: React.FC<{ step: FlowStep; index: number }> = ({ step, index }) => {
	const planned = step.info === null;
	const running = step.info?.state === 'running';
	return (
		<button
			type='button'
			style={stepStyle(step.tone, planned)}
			onClick={planned ? undefined : () => scrollToAgent(step.key)}
			disabled={planned}
			title={planned ? undefined : `Jump to ${step.label}`}
		>
			<span style={styles.stepHead}>
				<IconTile tone={step.tone} size={28}>
					{step.icon}
				</IconTile>
				<span style={styles.stepName}>{step.label}</span>
				<span style={styles.stepIndex}>Step {index + 1}</span>
			</span>
			<span style={styles.stepCaption}>{step.caption}</span>
			<span style={styles.stepStatus}>
				<LiveDot tone={step.info?.tone ?? 'muted'} live={running} />
				<Pulse active={running}>{step.info?.label ?? 'Planned'}</Pulse>
				{step.detail && <span style={styles.stepDetail}>· {step.detail}</span>}
			</span>
		</button>
	);
};

const Hero: React.FC<{ isConnected: boolean; steps: FlowStep[] }> = ({ isConnected, steps }) => (
	<header style={styles.hero}>
		<div style={styles.heroTop}>
			<span style={styles.logo} aria-hidden>
				<BxRocket size={28} />
			</span>
			<div style={styles.heroText}>
				<div style={styles.eyebrow}>Zero-human staffing agency</div>
				<h1 style={styles.title}>Staffing Agent</h1>
				<p style={styles.tagline}>AI agents find contract roles at US companies, match a consultant from the bench and email the decision-maker. No human in the loop.</p>
			</div>
			<span style={liveStyle(isConnected)}>
				<LiveDot tone={isConnected ? 'success' : 'muted'} live={isConnected} />
				{isConnected ? 'Live' : 'Offline'}
			</span>
		</div>
		<div style={styles.flow}>
			{steps.map((step, index) => (
				<React.Fragment key={step.key}>
					{index > 0 && (
						<span style={styles.connector} aria-hidden>
							<BxChevronRight size={18} />
						</span>
					)}
					<Step step={step} index={index} />
				</React.Fragment>
			))}
		</div>
		<p style={styles.footnote}>
			Replays each agent's latest run and follows new runs live. Runs start from the terminal with <code style={styles.code}>npm run demo</code>.
		</p>
	</header>
);

// =============================================================================
// NUMBERS
// =============================================================================

interface Stat {
	key: string;
	label: string;
	value: number | null;
	tone: Tone;
	icon: React.ReactNode;
}

const StatTile: React.FC<{ stat: Stat }> = ({ stat }) => (
	<div style={statStyle(stat.tone)}>
		<IconTile tone={stat.tone} size={40}>
			{stat.icon}
		</IconTile>
		<div style={styles.statText}>
			<div style={styles.statValue}>{stat.value ?? '-'}</div>
			<div style={styles.statLabel}>{stat.label}</div>
		</div>
	</div>
);

function headlineStats(db: DatabaseState): Stat[] {
	const loaded = db.updatedAt !== null;
	const count = (rows: Record<string, unknown>[], match: (row: Record<string, unknown>) => boolean) => (loaded ? rows.filter(match).length : null);
	return [
		{ key: 'consultants', label: 'Consultants on the bench', value: loaded ? db.consultants.length : null, tone: 'green', icon: <BxUser size={20} /> },
		{ key: 'opportunities', label: 'Contract roles found', value: loaded ? db.opportunities.length : null, tone: 'blue', icon: <BxPurchaseTag size={20} /> },
		{ key: 'sent', label: 'Emails sent', value: count(db.touches, (t) => t.direction === 'out' && t.status === 'sent'), tone: 'purple', icon: <BxExport size={20} /> },
		{ key: 'replies', label: 'Replies received', value: count(db.touches, (t) => t.direction === 'in'), tone: 'orange', icon: <BxUndo size={20} /> },
		{ key: 'meetings', label: 'Meetings booked', value: count(db.opportunities, (o) => o.stage === 'meeting_booked'), tone: 'yellow', icon: <BxCheck size={20} /> },
	];
}

// =============================================================================
// COMPONENT
// =============================================================================

export interface DashboardProps {
	isConnected: boolean;
	bench: AgentRunState;
	hunter: AgentRunState;
	db: DatabaseState;
}

function useStep(agent: AgentDef, state: AgentRunState, caption: string): FlowStep {
	const { run } = state;
	const answer = useMemo(() => (run.answer ? parseAnswer(run.answer) : null), [run.answer]);
	const info = runState(run, answer);
	const look = AGENT_LOOK[agent.key];
	const parts = [run.beginTime && run.endTime ? durationText(run.endTime - run.beginTime) : '', clockText(run.beginTime)].filter(Boolean);
	return { key: agent.key, label: agent.label, caption, tone: look.tone, icon: <look.Icon size={16} />, info, detail: parts.join(' · ') };
}

export const Dashboard: React.FC<DashboardProps> = ({ isConnected, bench, hunter, db }) => {
	const steps: FlowStep[] = [
		useStep(AGENTS[0], bench, 'Reads consultant CVs from Box and keeps the bench up to date'),
		useStep(AGENTS[1], hunter, 'Finds a contract role, matches a consultant, emails the decision-maker'),
		{ key: 'closer', label: 'Closer', caption: 'Handles replies and books the meeting', tone: 'purple', icon: <BxCheck size={16} />, info: null, detail: 'next' },
	];
	const stats = headlineStats(db);

	return (
		<div style={styles.page}>
			<div style={styles.column}>
				<Hero isConnected={isConnected} steps={steps} />
				{!isConnected && <Banner variant='warning'>Not connected to RocketRide. Sign in to follow the agents.</Banner>}
				<div style={styles.stats}>
					{stats.map((stat) => (
						<StatTile key={stat.key} stat={stat} />
					))}
				</div>
				<div style={styles.sectionTitle}>
					<span style={styles.sectionName}>Agents</span>
					<span style={styles.sectionCaption}>Each agent's brief, every tool call in order, and its answer</span>
				</div>
				<div style={styles.agents}>
					<AgentPanel agent={AGENTS[0]} state={bench} />
					<AgentPanel agent={AGENTS[1]} state={hunter} />
				</div>
				<DataPanel db={db} />
			</div>
		</div>
	);
};
