// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * The shared database as the agents leave it: consultants, opportunities with
 * their stage, and touches (emails). Refreshed every 5 seconds.
 */

import React, { useMemo, useState } from 'react';
import { Banner, Button, Card, DataGrid, TabControl, badgeEl, commonStyles } from 'shell';
import type { GridColumnDefinition } from 'shell';
import type { DatabaseState } from './useDatabase';

// =============================================================================
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
	headerActions: { display: 'flex', alignItems: 'center', gap: 8 },
	updated: { ...commonStyles.textMuted, fontSize: 12 },
	grid: { marginTop: 8 },
};

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
			header='Database'
			headerActions={
				<div style={styles.headerActions}>
					{db.updatedAt && <span style={styles.updated}>Updated {new Date(db.updatedAt).toLocaleTimeString()}</span>}
					<Button variant='secondary' small onClick={() => void db.refresh()}>
						Refresh
					</Button>
				</div>
			}
		>
			{db.error && <Banner variant='error'>{db.error}</Banner>}
			<TabControl menu={menu} activeId={tab} onSelect={(id) => setTab(id as TabId)} />
			<div style={styles.grid}>
				{tab === 'consultants' && <DataGrid<Row> tableId='staffing-consultants' columns={CONSULTANT_COLUMNS} data={db.consultants} pageSizes={[10, 25]} emptyTitle='No consultants yet' />}
				{tab === 'opportunities' && <DataGrid<Row> tableId='staffing-opportunities' columns={OPPORTUNITY_COLUMNS} data={db.opportunities} pageSizes={[10, 25]} emptyTitle='No opportunities yet' />}
				{tab === 'touches' && <DataGrid<Row> tableId='staffing-touches' columns={TOUCH_COLUMNS} data={db.touches} pageSizes={[10, 25]} emptyTitle='No emails yet' />}
			</div>
		</Card>
	);
};
