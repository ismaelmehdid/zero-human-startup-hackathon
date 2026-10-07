# Zero-Human Startup: an AI IT staffing agency

A team of AI agents that places US IT consultants on contract with no human in the loop, built on RocketRide
pipelines. Hackathon prototype.

## What it does

- **bench** keeps the consultant bench current: it reads the CVs in a Box folder, extracts each profile with Box AI
  and upserts it into the Postgres `consultants` table (at most 10 new CVs per run; it never deletes a consultant).
- **hunter** finds a US contract job and its hiring decision-maker, matches a consultant from the bench, writes a
  three-email sequence and sends the first email to the demo inbox, recording every step in the database.

## Architecture

Each pipeline is a standalone `.pipe` file that runs its standing order (a brief stored in the RocketRide file store)
through one agent. All state lives in the database, so each run picks up where the last one stopped.

```text
filestore_source (briefs/<name>.md) -> parse -> question -> agent_rocketride -> response_answers
                                                                  |  tools and models (control plane)
                     llm_openai (gpt-5.2), memory_internal, rocketride_sql, mcp_client, tool_gmail
```

| Node | Role |
|---|---|
| `filestore_source` | Reads the pipeline's brief from the file store |
| `parse`, `question` | Turn the brief into the agent's task |
| `agent_rocketride` | The agent |
| `memory_internal` | Run-scoped scratchpad required by the agent |
| `llm_openai` (profile `openai-5-2`, gpt-5.2) | Model for the agent and for `rocketride_sql` |
| `rocketride_sql` | RocketRide-managed Postgres; the agent sends raw SQL through its `execute` tool |
| `mcp_client` | Box MCP (bench: CV files and Box AI extraction) and Glasser MCP (hunter: jobs, decision-makers, work emails) |
| `tool_gmail` | Sends hunter's email (access `send`) |
| `response_answers` | Returns the agent's run report |

Layout: `pipelines/` (`.pipe` files), `briefs/` (standing orders, uploaded to the file store at the same path),
`sql/` (schema, seed, reset), `scripts/` (demo tooling). `pipelines/db_admin.pipe` is a `tools` source hosting
`rocketride_sql`, which the scripts use to run SQL without an agent.

## Data model

PostgreSQL, defined in `sql/schema.sql`:

| Table | Holds | Guards |
|---|---|---|
| `consultants` | The bench: name, title, skills (`text[]`), years of experience, hourly rate, location, availability, summary | `box_file_id` unique (upsert key) |
| `opportunities` | One row per job prospected: company, role, job URL, required skills, decision-maker contact, hook, matched consultant and rationale, stage, Gmail thread, `do_not_contact` | `job_url` unique; `stage` is one of `new`, `contacted`, `replied`, `meeting_booked`, `lost`, `no_response` |
| `touches` | Each email of a sequence: step, direction (`out`/`in`), subject, body, status (`scheduled`/`sent`/`received`/`cancelled`), due and sent times, Gmail message id | One outgoing row per opportunity and step; Gmail message id unique |
| `meetings` | Booked calls: opportunity, calendar event, start time | One per opportunity |

`sql/seed.sql` adds three fictional consultants (`box_file_id` `seed-001` to `seed-003`) as a bench baseline.

## Safety rules

- **Demo mode, always on.** Every outgoing email goes to the demo inbox (`ROCKETRIDE_DEMO_INBOX`), plus-addressed
  with the company slug. The real contact email is stored but never mailed.
- **Grounding.** Every factual sentence in an email must trace to a tool result: no invented company, contact or claim.
- **Idempotency.** The agent checks the database before contacting anyone and claims a touch before sending it.
  Unique keys on the job URL and on each outgoing step make a duplicate fail in the database, and `do_not_contact`
  is always honored.
- **Bounded spend.** hunter takes at most 1 new prospect per run and spends at most $0.75 on Glasser per run (no
  endpoint above $0.30 per call). bench adds at most 10 CVs per run.

## Setup

1. **Workspace.** Open the folder with the RocketRide VS Code extension, or run `npx rocketride init`. It signs in,
   writes the connection pair to `.env` and vendors `.rocketride/` (gitignored). Then run `pnpm install`.
2. **Keys.** Add the names listed in `.env.example` to `.env`: `ROCKETRIDE_OPENAI_KEY`, `ROCKETRIDE_DEMO_INBOX`,
   `ROCKETRIDE_BOX_TOKEN`, `ROCKETRIDE_BOX_FOLDER_ID`, `ROCKETRIDE_GLASSER_KEY` (`ROCKETRIDE_APIFY_KEY` is
   optional). Pipelines only substitute `${ROCKETRIDE_*}` names.
3. **Box.** `ROCKETRIDE_BOX_TOKEN` is a Box developer token, which expires after 60 minutes: refresh it right before
   a run.
4. **Git filter, once per clone.** The RocketRide canvas stores OAuth tokens inside `.pipe` files. This clean filter
   blanks every `userToken` and `serviceKey` value before a commit (`.gitattributes` maps `*.pipe` to it):
   ```bash
   git config filter.pipe-secrets.clean "bash scripts/strip-pipe-secrets.sh"
   git config filter.pipe-secrets.smudge cat
   git config filter.pipe-secrets.required true
   ```
5. **Gmail.** Open `pipelines/hunter.pipe` in the RocketRide canvas and sign in with Google on node `gmail`.
6. **Database.** `npm run db -- apply sql/schema.sql sql/seed.sql` (safe to run again).

Check a pipeline with `npx --no -- rocketride validate pipelines/hunter.pipe`.

## Run the demo

```bash
npm run demo -- --dry-run    # check keys, briefs and database; changes nothing
npm run demo                 # upload the briefs, run bench, run hunter, show the stats
npm run demo -- --reset      # first clear the outreach state (every consultant is kept)
```

| Command | Does |
|---|---|
| `npm run run:bench`, `npm run run:hunter` | Run one pipeline now and follow it to the end (`run:hunter` uploads the repo brief first) |
| `npm run stats` | Opportunities per stage, touches per status, latest opportunities |
| `npm run reset` | Dry run; `-- --yes` deletes meetings, touches and opportunities; add `--with-seed` to also delete the seed consultants |
| `npm run briefs` | Upload `briefs/bench.md` to the file store |
| `npm run db -- query "SELECT ..."` | Ad-hoc SQL |

The demo stops at the first failure and prints the reason. Ctrl-C also stops the run on the server. Only one dev run
of a given pipeline can exist at a time.

## Deploy

Not done yet. Deployed runs execute as a team on the deployment target. They resolve `${ROCKETRIDE_*}` from the
server-side environment (org and team layers), never from the local `.env`.

1. **Connect the deployment target:** `npx rocketride login --deploy` writes `ROCKETRIDE_DEPLOY_URI` and
   `ROCKETRIDE_DEPLOY_APIKEY` to `.env`. Lifecycle commands never use the development pair.
2. **Fix the files the server checks:**
   - each `.pipe` needs a top-level `"name"`;
   - the app id in `apps/staffingAgent-ui/package.json` (`appManifest.id`) and `staffingAgent.rrapp` must use your
     org's developer namespace (`<developerId>.staffingAgent`, not `local.`);
   - `pipelines/hunter.pipe` must hold the Gmail sign-in. `deploy add` reads the working file; git only stores a
     blanked copy.
3. **Set the team's secrets** (org admin or team admin). These are the keys the pipelines reference today; the
   script re-reads them from the `.pipe` files:

   | Pipeline | Server-side keys |
   |---|---|
   | bench | `ROCKETRIDE_OPENAI_KEY`, `ROCKETRIDE_BOX_TOKEN`, `ROCKETRIDE_BOX_FOLDER_ID` |
   | hunter | `ROCKETRIDE_OPENAI_KEY`, `ROCKETRIDE_DEMO_INBOX`, `ROCKETRIDE_GLASSER_KEY`, `ROCKETRIDE_APIFY_KEY` |

   ```bash
   node --env-file=.env scripts/set-team-env.mjs --team <teamId>        # dry run: key names only
   node --env-file=.env scripts/set-team-env.mjs --team <teamId> --go   # merge them into the team environment
   ```
   The Box developer token expires after 60 minutes: refresh it and re-run before each deployed bench run.
4. **Deploy and publish** (no schedules). The dry run prints every command:
   ```bash
   node --env-file=.env scripts/deploy.mjs --team <teamId>        # checks and prints the commands
   node --env-file=.env scripts/deploy.mjs --team <teamId> --go   # runs them, stops at the first failure
   ```
   It runs, for each pipeline and then for the app:
   ```bash
   npx --no -- rocketride deploy add pipelines/hunter.pipe --comment "demo deploy" --json   # prints projectId, version
   npx --no -- rocketride deploy publish <projectId> <version> --team <teamId>
   npx --no -- rocketride app verify apps/staffingAgent-ui
   npx --no -- rocketride app deploy apps/staffingAgent-ui --comment "demo deploy" --json  # prints version
   # then, with the SDK (the CLI has no app publish verb): client.publishApp(appId, version, '@me')
   ```
5. **Check the first run:** `npx --no -- rocketride deploy run <projectId> <sourceId> --team <teamId>`. The source ids
   are `filestore_source_1` (bench) and `brief` (hunter). Read the run with the SDK
   (`client.log.chapters({ projectId, source, teamId })`).
6. **Schedule later, if wanted:**
   `npx --no -- rocketride deploy schedule set <projectId> brief "*/30 * * * *" --team <teamId> --ttl 1500`.

Open questions before relying on deployed runs:
- **Briefs.** Deployed runs read `briefs/*.md` from the team's file-store subtree, while `npm run briefs` writes to
  your user tree, and no CLI or SDK path into a team subtree was found. Check the first deployed run reads its brief.
- **Database.** The managed database's role is derived from the org id, so deployed runs should share the dev
  tables. This is unverified until a deployed run writes a row.

## Status and limitations

- closer (`pipelines/closer.pipe`: reply handling and meeting booking) is drafted but has never run.
- hunter runs as a single agent; a director-plus-specialists split was generated but has never run.
- No deployment or scheduling yet: the pipelines run on demand from the scripts (see Deploy).
- `gpt-5.4` breaks the `agent_rocketride` planner, so the pipelines use gpt-5.2.
- In `rocketride_sql`, a cast written on a placeholder (`$1::text`) fails; write `CAST($1 AS text)`.
- Edit `.pipe` files in place while the canvas has them open: a save that writes a temp file and renames it makes
  the canvas re-key `project_id`, and the demo UI hardcodes the project ids in `apps/staffingAgent-ui/src/agents.ts`.

## Next steps

- Run closer to answer replies and book meetings.
- Deploy and schedule the pipelines.
- Replace the 60-minute Box developer token with a long-lived Box app credential.
