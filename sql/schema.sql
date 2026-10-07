-- Shared database schema for the bench and hunter pipelines.
-- Dialect: PostgreSQL (the RocketRide-managed database behind the rocketride_sql node).
-- Idempotent: safe to apply again; existing tables and rows are left untouched.
-- Apply with: node --env-file=.env scripts/db.mjs apply sql/schema.sql

-- Consultants on our bench, one row per CV file in Box (upserted by bench).
CREATE TABLE IF NOT EXISTS consultants (
    id               SERIAL PRIMARY KEY,
    box_file_id      TEXT NOT NULL UNIQUE,
    full_name        TEXT NOT NULL,
    title            TEXT,
    skills           TEXT[] NOT NULL DEFAULT '{}',
    years_experience INTEGER,
    hourly_rate_usd  NUMERIC(8, 2),
    location         TEXT,
    availability     TEXT,
    summary          TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per job posting we prospect (written by hunter). job_url is the dedup key.
CREATE TABLE IF NOT EXISTS opportunities (
    id               SERIAL PRIMARY KEY,
    company          TEXT NOT NULL,
    company_domain   TEXT,
    role_title       TEXT NOT NULL,
    job_url          TEXT NOT NULL UNIQUE,
    required_skills  TEXT[] NOT NULL DEFAULT '{}',
    contact_name     TEXT,
    contact_title    TEXT,
    contact_email    TEXT,
    contact_linkedin TEXT,
    hook             TEXT,
    consultant_id    INTEGER REFERENCES consultants (id) ON DELETE SET NULL,
    match_rationale  TEXT,
    stage            TEXT NOT NULL DEFAULT 'new'
                     CHECK (stage IN ('new', 'contacted', 'replied', 'meeting_booked', 'lost', 'no_response')),
    gmail_thread_id  TEXT,
    do_not_contact   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every email in a sequence: outgoing steps (scheduled, then sent or cancelled) and incoming replies.
CREATE TABLE IF NOT EXISTS touches (
    id               SERIAL PRIMARY KEY,
    opportunity_id   INTEGER NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
    step             INTEGER,
    direction        TEXT NOT NULL CHECK (direction IN ('out', 'in')),
    subject          TEXT,
    body             TEXT,
    status           TEXT NOT NULL CHECK (status IN ('scheduled', 'sent', 'received', 'cancelled')),
    due_at           TIMESTAMPTZ,
    sent_at          TIMESTAMPTZ,
    gmail_message_id TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (direction = 'in' OR step IS NOT NULL)
);

-- Never the same outgoing step twice for one opportunity.
CREATE UNIQUE INDEX IF NOT EXISTS touches_out_step_key
    ON touches (opportunity_id, step) WHERE direction = 'out';

-- A Gmail message is recorded at most once.
CREATE UNIQUE INDEX IF NOT EXISTS touches_gmail_message_id_key
    ON touches (gmail_message_id) WHERE gmail_message_id IS NOT NULL;

-- Booked meetings, at most one per opportunity.
CREATE TABLE IF NOT EXISTS meetings (
    id                SERIAL PRIMARY KEY,
    opportunity_id    INTEGER NOT NULL UNIQUE REFERENCES opportunities (id) ON DELETE CASCADE,
    calendar_event_id TEXT UNIQUE,
    starts_at         TIMESTAMPTZ NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
