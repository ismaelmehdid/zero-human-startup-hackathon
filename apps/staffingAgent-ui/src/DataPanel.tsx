// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * The shared database as the agents leave it: a stage funnel of the
 * opportunities, then consultants, opportunities with their stage, and
 * touches (emails). Refreshed every 5 seconds.
 */

import React, { useMemo, useState } from 'react';
import { Banner, Button, BxChevronRight, BxGridAlt, BxRefresh, Card, DataGrid, TabControl, badgeEl, commonStyles } from 'shell';
import type { GridColumnDefinition } from 'shell';
import type { DatabaseState } from './useDatabase';
import { IconTile, LiveDot, TONE, tint, type Tone } from './ui';

// =============================================================================
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
	header: { display: 'inline-flex', alignItems: 'center', gap: 10 },
	headerActions: { display: 'flex', alignItems: 'center', gap: 10 },
	updated: { ...commonStyles.textMuted, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontVariantNumeric: 'tabular-nums' },
	buttonLabel: { display: 'inline-flex', alignItems: 'center', gap: 5 },
	intro: { ...commonStyles.textMuted, fontSize: 12.5, lineHeight: 1.5, marginBottom: 14 },
	funnelLabel: { ...commonStyles.labelUppercase, fontSize: 10.5, letterSpacing: '0.8px', marginBottom: 8 },
	funnel: { display: 'flex', alignItems: 'stretch', gap: 6, flexWrap: 'wrap', marginBottom: 18 },
	stages: { display: 'flex', alignItems: 'stretch', gap: 6, flex: '3 1 520px', minWidth: 0 },
	closed: { display: 'flex', alignItems: 'stretch', gap: 6, flex: '1 1 220px', minWidth: 0, paddingLeft: 12, borderLeft: '1px dashed var(--rr-border)' },
	arrow: { display: 'flex', alignItems: 'center', color: 'var(--rr-text-disabled)', flexShrink: 0 },
	stage: { flex: 1, minWidth: 0, padding: '10px 12px 12px', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 6 },
	stageLabel: { ...commonStyles.textEllipsis, fontSize: 11.5, fontWeight: 600, color: 'var(--rr-text-secondary)' },
	stageCount: { fontSize: 22, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', color: 'var(--rr-text-primary)' },
	track: { display: 'block', height: 4, borderRadius: 2, overflow: 'hidden', background: tint('var(--rr-text-primary)', 8) },
	empty: { ...commonStyles.textMuted, fontSize: 12, marginTop: -8, marginBottom: 16 },
	grid: { marginTop: 8 },
};

function stageStyle(tone: Tone, count: number): React.CSSProperties {
	return {
		...styles.stage,
		background: count > 0 ? tint(TONE[tone], 9) : tint('var(--rr-text-primary)', 3),
		boxShadow: `inset 0 0 0 1px ${count > 0 ? tint(TONE[tone], 30) : 'var(--rr-border)'}`,
	};
}

function fillStyle(tone: Tone, ratio: number): React.CSSProperties {
	return { display: 'block', height: '100%', width: `${Math.round(ratio * 100)}%`, borderRadius: 2, background: TONE[tone], transition: 'width 0.4s ease' };
}

// =============================================================================
// COLUMNS
// =============================================================================

type Row = Record<string, unknown>;
type BadgeVariant = 'success' | 'info' | 'warning' | 'error' | 'muted';

const STAGE_VARIANT: Record<string, BadgeVariant> = {
	new: 'muted',
	contacted: 'info',
	replied: 'warning',
	meeting_booked: 'success',
	lost: 'error',
	no_response: 'error',
};

const TOUCH_VARIANT: Record<string, BadgeVariant> = { scheduled: 'muted', sent: 'info', received: 'success', cancelled: 'error' };

const CONSULTANT_COLUMNS: GridColumnDefinition[] = [
	{ title: 'Id', field: 'id', rrType: 'number', rrDefault: true, width: 60, rrDescription: 'Consultant row id.' },
	{ title: 'Name', field: 'full_name', rrType: 'string', rrDefault: true, rrDescription: 'Full name extracted from the CV.' },
	{ title: 'Title', field: 'title', rrType: 'string', rrDefault: true, rrDescription: 'Current or most recent job title.' },
	{ title: 'Skills', field: 'skills', rrType: 'string', rrDefault: true, widthGrow: 3, rrDescription: 'Normalized skills used for matching.' },
	{ title: 'Years', field: 'years_experience', rrType: 'number', rrDefault: true, width: 80, rrDescription: 'Years of professional experience.' },
	{ title: 'Rate (USD/h)', field: 'hourly_rate_usd', rrType: 'number', rrDefault: true, width: 110, rrDescription: 'Hourly rate, when the CV states one.' },
	{ title: 'Location', field: 'location', rrType: 'string', rrDefault: true, rrDescription: 'Location from the CV.' },
	{ title: 'Availability', field: 'availability', rrType: 'string', rrDescription: 'Availability from the CV.' },
	{ title: 'Box file', field: 'box_file_id', rrType: 'string', rrDefault: true, rrDescription: 'Box file id of the CV (seed-* rows are fictional seeds).' },
];

const OPPORTUNITY_COLUMNS: GridColumnDefinition[] = [
	{ title: 'Id', field: 'id', rrType: 'number', rrDefault: true, width: 60, rrDefaultSort: 'desc', rrDescription: 'Opportunity row id.' },
	{ title: 'Company', field: 'company', rrType: 'string', rrDefault: true, rrDescription: 'Company hiring contractors.' },
	{ title: 'Role', field: 'role_title', rrType: 'string', rrDefault: true, widthGrow: 2, rrDescription: 'Job posting title.' },
	{ title: 'Contact', field: 'contact_name', rrType: 'string', rrDefault: true, rrDescription: 'Decision-maker we write to.' },
	{ title: 'Contact title', field: 'contact_title', rrType: 'string', rrDescription: 'Decision-maker job title.' },
	{
		title: 'Stage',
		field: 'stage',
		rrType: 'enum',
		rrDefault: true,
		width: 140,
		rrOptions: Object.keys(STAGE_VARIANT),
		rrDescription: 'Pipeline stage: new, contacted, replied, meeting_booked, lost or no_response.',
		formatter: (cell) => badgeEl(STAGE_VARIANT[String(cell.getValue())] ?? 'muted', String(cell.getValue() ?? '')),
	},
	{ title: 'Consultant', field: 'consultant', rrType: 'string', rrDefault: true, rrDescription: 'Consultant matched to the role.' },
	{ title: 'Do not contact', field: 'do_not_contact', rrType: 'boolean', rrDescription: 'Contact asked not to be emailed again.' },
	{ title: 'Created', field: 'created_at', rrType: 'date', rrDefault: true, rrDescription: 'When hunter recorded the opportunity.' },
];

const TOUCH_COLUMNS: GridColumnDefinition[] = [
	{ title: 'Id', field: 'id', rrType: 'number', rrDefault: true, width: 60, rrDefaultSort: 'desc', rrDescription: 'Touch row id.' },
	{ title: 'Company', field: 'company', rrType: 'string', rrDefault: true, rrDescription: 'Company of the opportunity.' },
	{ title: 'Step', field: 'step', rrType: 'number', rrDefault: true, width: 70, rrDescription: 'Sequence step of an outgoing email.' },
	{ title: 'Direction', field: 'direction', rrType: 'enum', rrDefault: true, width: 100, rrOptions: ['out', 'in'], rrDescription: 'out = we sent it, in = the prospect replied.' },
	{
		title: 'Status',
		field: 'status',
		rrType: 'enum',
		rrDefault: true,
		width: 120,
		rrOptions: Object.keys(TOUCH_VARIANT),
		rrDescription: 'scheduled, sent, received or cancelled.',
		formatter: (cell) => badgeEl(TOUCH_VARIANT[String(cell.getValue())] ?? 'muted', String(cell.getValue() ?? '')),
	},
	{ title: 'Subject', field: 'subject', rrType: 'string', rrDefault: true, widthGrow: 3, rrDescription: 'Email subject.' },
	{ title: 'Due', field: 'due_at', rrType: 'date', rrDescription: 'When a scheduled email is due.' },
	{ title: 'Sent', field: 'sent_at', rrType: 'date', rrDefault: true, rrDescription: 'When the email was sent.' },
];

// =============================================================================
// FUNNEL
// =============================================================================

interface StageDef {
	id: string;
	label: string;
	tone: Tone;
}

/** The open stages in order, then the closed ones. */
const OPEN_STAGES: StageDef[] = [
	{ id: 'new', label: 'New', tone: 'blue' },
	{ id: 'contacted', label: 'Contacted', tone: 'brand' },
	{ id: 'replied', label: 'Replied', tone: 'orange' },
	{ id: 'meeting_booked', label: 'Meeting booked', tone: 'green' },
];
const CLOSED_STAGES: StageDef[] = [
	{ id: 'lost', label: 'Lost', tone: 'red' },
	{ id: 'no_response', label: 'No response', tone: 'muted' },
];

const Stage: React.FC<{ stage: StageDef; count: number; max: number }> = ({ stage, count, max }) => (
	<div style={stageStyle(stage.tone, count)} title={`${count} ${count === 1 ? 'opportunity' : 'opportunities'} at stage ${stage.id}`}>
		<span style={styles.stageLabel}>{stage.label}</span>
		<span style={styles.stageCount}>{count}</span>
		<span style={styles.track}>
			<span style={fillStyle(stage.tone, max > 0 ? count / max : 0)} />
		</span>
	</div>
);

const Funnel: React.FC<{ opportunities: Row[] }> = ({ opportunities }) => {
	const counts = useMemo(() => {
		const byStage: Record<string, number> = {};
		for (const row of opportunities) {
			const stage = String(row.stage ?? '');
			byStage[stage] = (byStage[stage] ?? 0) + 1;
		}
		return byStage;
	}, [opportunities]);
	const max = Math.max(0, ...Object.values(counts));
	return (
		<>
			<div style={styles.funnelLabel}>Opportunity pipeline</div>
			<div style={styles.funnel}>
				<div style={styles.stages}>
					{OPEN_STAGES.map((stage, index) => (
						<React.Fragment key={stage.id}>
							{index > 0 && (
								<span style={styles.arrow} aria-hidden>
									<BxChevronRight size={16} />
								</span>
							)}
							<Stage stage={stage} count={counts[stage.id] ?? 0} max={max} />
						</React.Fragment>
					))}
				</div>
				<div style={styles.closed}>
					{CLOSED_STAGES.map((stage) => (
						<Stage key={stage.id} stage={stage} count={counts[stage.id] ?? 0} max={max} />
					))}
				</div>
			</div>
			{opportunities.length === 0 && <div style={styles.empty}>No opportunities yet. Hunter adds one for each contract role it prospects.</div>}
		</>
	);
};

// =============================================================================
// COMPONENT
// =============================================================================

type TabId = 'consultants' | 'opportunities' | 'touches';

export const DataPanel: React.FC<{ db: DatabaseState }> = ({ db }) => {
	const [tab, setTab] = useState<TabId>('opportunities');
	const menu = useMemo(
		() => ({
			entries: [
				{ id: 'consultants', label: 'Consultants', count: db.consultants.length },
				{ id: 'opportunities', label: 'Opportunities', count: db.opportunities.length },
				{ id: 'touches', label: 'Touches', count: db.touches.length },
			],
		}),
		[db.consultants.length, db.opportunities.length, db.touches.length],
	);

	return (
		<Card
			header={
				<span style={styles.header}>
					<IconTile tone='purple' size={26}>
						<BxGridAlt size={14} />
					</IconTile>
					Shared database
				</span>
			}
			headerActions={
				<div style={styles.headerActions}>
					{db.updatedAt && (
						<span style={styles.updated} title='Refreshed every 5 seconds'>
							<LiveDot tone={db.error ? 'error' : 'success'} live={!db.error} size={6} />
							Updated {new Date(db.updatedAt).toLocaleTimeString()}
						</span>
					)}
					<Button variant='secondary' small onClick={() => void db.refresh()}>
						<span style={styles.buttonLabel}>
							<BxRefresh size={13} />
							Refresh
						</span>
					</Button>
				</div>
			}
		>
			<div style={styles.intro}>The state the agents leave behind, read live from the shared database (read-only, every 5 seconds).</div>
			{db.error && <Banner variant='error'>{db.error}</Banner>}
			<Funnel opportunities={db.opportunities} />
			<TabControl menu={menu} activeId={tab} onSelect={(id) => setTab(id as TabId)} />
			<div style={styles.grid}>
				{tab === 'consultants' && <DataGrid<Row> tableId='staffing-consultants' columns={CONSULTANT_COLUMNS} data={db.consultants} pageSizes={[10, 25]} emptyTitle='No consultants yet' />}
				{tab === 'opportunities' && <DataGrid<Row> tableId='staffing-opportunities' columns={OPPORTUNITY_COLUMNS} data={db.opportunities} pageSizes={[10, 25]} emptyTitle='No opportunities yet' />}
				{tab === 'touches' && <DataGrid<Row> tableId='staffing-touches' columns={TOUCH_COLUMNS} data={db.touches} pageSizes={[10, 25]} emptyTitle='No emails yet' />}
			</div>
		</Card>
	);
};
