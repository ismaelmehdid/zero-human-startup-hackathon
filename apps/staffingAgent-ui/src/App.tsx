// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * Staffing Agent demo view: what each agent (bench, then hunter) did on its
 * latest run, followed live, plus the database state they leave behind.
 * The app only observes: runs start from the terminal with `npm run demo`.
 */

import React from 'react';
import type { ShellAppProps } from 'shell';
import { AppLayout, Banner, ContentHeader, useShellConnection } from 'shell';
import { AGENTS } from './agents';
import { AgentPanel } from './AgentPanel';
import { DataPanel } from './DataPanel';
import { useAgentRun } from './useAgentRun';
import { useDatabase } from './useDatabase';

// =============================================================================
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
	page: { height: '100%', overflowY: 'auto', padding: 20, boxSizing: 'border-box', fontFamily: 'var(--rr-font-family, system-ui)' },
	agents: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 16, marginBottom: 16, alignItems: 'start' },
};

// =============================================================================
// COMPONENT
// =============================================================================

const Content: React.FC = () => {
	const { client, isConnected } = useShellConnection();
	const bench = useAgentRun(client, isConnected, AGENTS[0]);
	const hunter = useAgentRun(client, isConnected, AGENTS[1]);
	const db = useDatabase(client, isConnected);

	return (
		<div style={styles.page}>
			<ContentHeader
				title='Staffing Agent'
				subtitle='Each agent: its brief, every tool call in order, its answer. Runs start from the terminal (npm run demo); this view replays the latest run and follows new runs live.'
			/>
			{!isConnected && <Banner variant='warning'>Not connected to RocketRide. Sign in to follow the agents.</Banner>}
			<div style={styles.agents}>
				<AgentPanel agent={AGENTS[0]} state={bench} />
				<AgentPanel agent={AGENTS[1]} state={hunter} />
			</div>
			<DataPanel db={db} />
		</div>
	);
};

/** Root view: one column, full client area. */
const App: React.FC<ShellAppProps> = () => (
	<AppLayout>
		<Content />
	</AppLayout>
);

export default App;
