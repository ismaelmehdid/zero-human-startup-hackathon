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
import { AppLayout, useShellConnection } from 'shell';
import { AGENTS } from './agents';
import { Dashboard } from './Dashboard';
import { useAgentRun } from './useAgentRun';
import { useDatabase } from './useDatabase';

// =============================================================================
// COMPONENT
// =============================================================================

/** Wires the live data (agent runs, database) into the view. */
const Content: React.FC = () => {
	const { client, isConnected } = useShellConnection();
	const bench = useAgentRun(client, isConnected, AGENTS[0]);
	const hunter = useAgentRun(client, isConnected, AGENTS[1]);
	const db = useDatabase(client, isConnected);
	return <Dashboard isConnected={isConnected} bench={bench} hunter={hunter} db={db} />;
};

/** Root view: one column, full client area. */
const App: React.FC<ShellAppProps> = () => (
	<AppLayout>
		<Content />
	</AppLayout>
);

export default App;
