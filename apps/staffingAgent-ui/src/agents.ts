// =============================================================================
// MIT License
// Copyright (c) 2026 Aparavi Software AG
// =============================================================================

/**
 * The agents the demo observes. Identity only: the app never starts these
 * pipelines — `npm run demo` does, from the terminal, where the secrets live.
 * Saving a .pipe from the canvas re-keys its project_id, so each agent lists
 * every id seen so far, and the app also discovers new ids at runtime from the
 * task name (`<key>.<source>`, e.g. `hunter.brief`). The ids are copied from
 * pipelines/*.pipe on purpose: importing those files would bundle their node
 * configs into the app.
 */
export interface AgentDef {
	key: 'bench' | 'hunter';
	label: string;
	role: string;
	/** Known project ids, newest first. */
	projectIds: string[];
	source: string;
	briefPath: string;
}

export const AGENTS: AgentDef[] = [
	{
		key: 'bench',
		label: 'Bench',
		role: 'Reads consultant CVs from Box, extracts each profile with Box AI and keeps the consultants table up to date.',
		projectIds: ['f99f7565-bca6-46c1-a52e-55acff0f8efb'],
		source: 'filestore_source_1',
		briefPath: 'briefs/bench.md',
	},
	{
		key: 'hunter',
		label: 'Hunter',
		role: 'Finds US companies hiring contractors, matches a consultant from the bench and emails the decision-maker.',
		projectIds: ['4424449f-d23f-45a4-92c1-32807e40d015', '1a3d6bfb-137c-49a6-af5b-f2424c939e0d', 'b6e8b25a-d9c5-4b82-8501-3b2e0dc84de8'],
		source: 'brief',
		briefPath: 'briefs/hunter.md',
	},
];
