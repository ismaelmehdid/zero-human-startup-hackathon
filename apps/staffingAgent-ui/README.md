# Staffing Agent

Live view of the Staffing Agent demo: AI agents that place IT consultants at US companies with no human in the loop.

## What it does

For each agent (bench, then hunter) the app shows:

- **Input**: the agent's standing brief, read from the file store (`briefs/<agent>.md`).
- **Tool calls**, in order: tool name, input arguments and a summary of the output. Click a call to see the full payloads.
- **Output**: the agent's final answer.

Below the agents, a database panel shows the shared state the agents leave behind: consultants, opportunities with their stage, and touches (emails) with step, status, subject and send time. It refreshes every 5 seconds, inside a read-only transaction.

## How it works

The app only observes. The pipelines run from the terminal (`npm run demo`), where the secrets live. On load the app replays the latest recorded run of each agent from the run log, then follows new runs live through a monitor on each agent's project. Tool inputs and outputs appear when the run was started with `pipelineTraceLevel: 'full'`. Credential-looking values are masked before display.

## Development

Open `staffingAgent.rrapp` to launch the App Builder: live preview on the Design tab, packaging on the Package tab, publishing on the Deploy tab.
