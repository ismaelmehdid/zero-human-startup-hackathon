# Team task board

Owned by the lead. Teammates read it but never edit it: report status changes to the lead (`SendMessage` to `main`) and the lead updates this file.

Status values: `todo`, `doing`, `blocked`, `done`, `cut`.

## Scope (decided with the user at 14:13 PDT)

- Time box: 2 hours, done by about 16:15 PDT.
- Build only the start of the flow: `bench` (Box CVs to `consultants`) and `hunter` (find a job and decision-maker, match a consultant, email the demo inbox).
- At most 5 AI agents in total: `bench` 1, `hunter` 4 (director, scout, matcher, sdr; mapper folded into scout).
- Cut: `closer` (replies and booking), the scheduling spike, deploy and scheduling.
- `apps/` belongs to the user (App Builder). Nobody on the team touches it.
- LLM provider: OpenAI (`llm_openai`, profile `openai-5-4`, `${ROCKETRIDE_OPENAI_KEY}`) instead of Anthropic, decided by the user at 14:45 PDT (no Anthropic credits). It overrides the contract's `llm_anthropic` line.
- Run the CLI as `npx --no -- rocketride <verb>`. Never run `npm install` at the root: it is a pnpm workspace now.

## Lead setup

| ID | Task | Owner | Depends on | Status |
|----|------|-------|------------|--------|
| L1 | Install the `rocketride` CLI from `.rocketride/client/rocketride.tgz` | lead | - | done |
| L2 | Fetch full component definitions into `.rocketride/schema-full/` (the files in `.rocketride/schema/` have no config fields) | lead | L1 | done |
| U1 | User batch 1: `.env` keys and sender identity | lead / user | - | done: keys 15:25 (Box token valid until about 16:25), sender identity 15:30 (Jane Carter, Northbridge Consulting) |
| U2 | User batch 2: Google connection on node `gmail` of `pipelines/hunter.pipe` (file frozen until done) | lead / user | H2a, H4 | done 15:45 (token present, file validates) |

## Milestone 1: each pipeline validates and completes a real run

| ID | Task | Owner | Depends on | Status |
|----|------|-------|------------|--------|
| P1 | `sql/schema.sql` and `sql/seed.sql`: create the four tables, seed 3 consultants. Announce to everyone | platform | - | done (applied via `pipelines/db_admin.pipe`; ad-hoc SQL: `node --env-file=.env scripts/db.mjs query "..."`) |
| P3 | `scripts/`: put the briefs in the file store, run bench now, run hunter now, row counts per stage, reset for the rehearsal | platform | B2, H2 (briefs exist) | done (`npm run briefs`, `run:bench`, `run:hunter`, `stats`, `reset`, `db`; real runs wait on keys) |
| P5 | `npm run demo`: briefs, bench, hunter, stats in one command (`--reset` optional, `--dry-run` checks only) | platform | P3 | done (all key-free paths tested) |
| P6 | Reset keeps every consultant by default (`--with-seed` also deletes the seeds) | platform | P3 | done (tested in rolled-back transactions and dry runs) |
| B1 | Prove Box access: `mcp_client` first, else `tool_http_request` | bench | U1 (Box token, folder id) | done (MCP route works with the developer token; 35 tools) |
| B2 | `pipelines/bench.pipe` + `briefs/bench.md`: validate, real run upserts CVs into `consultants` (target 15:30) | bench | P1, B1 | done 15:32 (1 CV added in 51 s; idempotent rerun added none; LLM profile `openai-5-2`) |
| H1 | Prove the Glasser handshake with the free `balance` tool | hunter | U1 (Glasser key) | done (balance $1.00; search and inspect free) |
| H2a | `tool_gmail` node (access `send`) in `pipelines/hunter.pipe` with its final node id, ready for the Google connection | hunter | - | done (node `gmail`) |
| H2 | Single-agent version: one job, one contact, one email to the demo inbox (1 prospect per run) | hunter | P1, H1, U2 | doing (go 15:47, `openai-5-2`) |
| H3 | Split into director + scout, matcher and sdr; real run (decide at 15:45) | hunter | H2 | cut for today at 15:45 (generated split variant validates; shown as next step) |
| H4 | Switch the LLM node of `hunter.pipe` to `llm_openai` before the Google connection | hunter | - | done (single-agent instructions applied; apify node dropped, no key) |
| B3 | Switch the LLM node of `bench.pipe` (and the fallback) to `llm_openai` | bench | - | done (`llm_openai_1`, both validate) |

## Milestone 2: integration rehearsal (lead)

| ID | Task | Owner | Depends on | Status |
|----|------|-------|------------|--------|
| R2 | Reset, run bench, run hunter. Pass = an opportunity at `contacted` with 3 touches, and the email visible in the demo inbox. Only one dev run per pipeline at a time: no teammate runs during the rehearsal | lead | B2, H3, P3 | todo |

## Added by the user at 15:56 PDT

| ID | Task | Owner | Depends on | Status |
|----|------|-------|------------|--------|
| B4 | Demo UI in `apps/staffingAgent-ui`: per agent its input (brief), each tool call (name, input, output) and its output (answer), plus the DB tables. The app observes runs started with `npm run demo` | bench | B2 | done 16:09 (builds, `app verify` passes; pushed in a8e6da3; not yet viewed in a browser) |
| P7 | Deploy and publish `bench.pipe`, `hunter.pipe` and the UI app; document the server-side secrets (no schedules unless the user asks) | platform | U3, B4, R2 | doing (prep only until go) |
| U3 | User: `npx --no -- rocketride login --deploy` (writes the DEPLOY pair) and confirm the team id | lead / user | - | blocked (asked user) |
| G1 | Push to `main` on GitHub (public repo): `*.pipe` go through the `pipe-secrets` clean filter, which blanks `userToken`; secret scan before push | lead | R2, B4, P7 | doing (checkpoints pushed: 242fef2, a8e6da3; secret scan clean) |

## Cut

| ID | Task | Owner | Status |
|----|------|-------|--------|
| P2 | Scheduling spike | platform | cut |
| P4 | Deploy and schedule the pipelines | platform | cut (deploy revived as P7, schedules still cut) |
| C1-C3 | `closer` pipeline: replies, follow-ups, booking. `pipelines/closer.pipe` is left in place: it validates but has never run and has no Google connection | closer | cut |

## Unverified items

| Item | Who checks | Result |
|------|------------|--------|
| Box MCP handshake, and which kind of token it accepts | bench (B1) | passed: `mcp.box.com` accepts a Box developer token (free developer account, user is admin); `ai_extract_structured_from_fields` takes about 18 s against the 20 s MCP timeout |
| Glasser MCP handshake | hunter (H1) | passed (`balance`, `search`, `inspect`; job search via apify `harvestapi/linkedin-job-search` $0.011; ZoomInfo contacts $0.0005) |
| `agent_rocketride` agents used as tools are reliable (else CrewAI or single agent) | hunter (H3) | not tested today (split cut at 15:45) |
| Gmail works after the canvas Google connection | hunter (H2) | - |
| A cron run of a `filestore_source` pipeline starts by itself | cut | not tested |
| `rocketride_sql` works in a scheduled team run | cut | not tested |

## Doc vs schema mismatches (the schema wins; runs confirm it)

| Doc | Doc says | Schema and runs say | Found by |
|-----|----------|---------------------|----------|
| `.rocketride/schema/*.json` | config fields live here | summaries only; full definitions come from `client.getService()` (saved to `.rocketride/schema-full/`) | lead |
| PIPELINES.md Pattern 13 | `mcp_client` `"profile": "streamable_http"` | `transport: "streamable-http"` plus an `http` object | bench |
| INTEGRATIONS.md | `urlWhitelist` is an array of strings | an array of `{whitelistPattern}` | bench |
| PIPELINES.md Pattern 18 | `filestore_source` `path` at the top level | `path` under `parameters` | bench |

| runtime | `llm_openai` profile `openai-5-4` works as the agent's LLM | `agent_rocketride`'s planner fails on `openai-5-4` ("Failed to get valid JSON response after 4 attempts ... Extra data"); `openai-5-2` works (3 of 3 runs) | bench |

| runtime | any OpenAI profile works | `openai-4o` plans but invented a job, contact and LinkedIn URL with no tool call behind them; `openai-5-2` stayed grounded | hunter |
| runtime | Glasser accepts null optional args | any `null` argument returns `internal_error`; leadmagic people search pre-holds $1.25, so it fails with $1 of credit | hunter |

Note (not a mismatch): `${ROCKETRIDE_*}` resolves only in `.pipe` config, never inside a file-store brief, so the demo inbox reaches the agent through its `instructions` (hunter).
