// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * The agents the demo observes. Identity only (project id + source component):
 * the app never starts these pipelines — `npm run demo` does, from the terminal,
 * where the secrets live. The ids are copied from pipelines/*.pipe on purpose:
 * importing those files would bundle their node configs into the app.
 */
export interface AgentDef {
	key: 'bench' | 'hunter';
	label: string;
	role: string;
	projectId: string;
	source: string;
	briefPath: string;
}

export const AGENTS: AgentDef[] = [
	{
		key: 'bench',
		label: 'Bench',
		role: 'Reads consultant CVs from Box, extracts each profile with Box AI and keeps the consultants table up to date.',
		projectId: 'f99f7565-bca6-46c1-a52e-55acff0f8efb',
		source: 'filestore_source_1',
		briefPath: 'briefs/bench.md',
	},
	{
		key: 'hunter',
		label: 'Hunter',
		role: 'Finds US companies hiring contractors, matches a consultant from the bench and emails the decision-maker.',
		projectId: 'b6e8b25a-d9c5-4b82-8501-3b2e0dc84de8',
		source: 'brief',
		briefPath: 'briefs/hunter.md',
	},
];
