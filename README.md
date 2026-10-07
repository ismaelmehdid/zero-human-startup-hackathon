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

## Status and limitations

- closer (`pipelines/closer.pipe`: reply handling and meeting booking) is drafted but has never run.
- hunter runs as a single agent; a director-plus-specialists split was generated but has never run.
- No deployment or scheduling yet: the pipelines run on demand from the scripts.
- `gpt-5.4` breaks the `agent_rocketride` planner, so the pipelines use gpt-5.2.
- In `rocketride_sql`, a cast written on a placeholder (`$1::text`) fails; write `CAST($1 AS text)`.

## Next steps

- Run closer to answer replies and book meetings.
- Deploy and schedule the pipelines.
- Replace the 60-minute Box developer token with a long-lived Box app credential.
