-- Rehearsal reset: deletes the outreach state left by test runs (every meeting, touch and opportunity).
-- Keeps the tables and every consultant, seeded or loaded from Box.
-- Run with: node --env-file=.env scripts/reset.mjs --yes   (add --with-seed to also apply sql/reset_seed.sql)

DELETE FROM meetings;
DELETE FROM touches;
DELETE FROM opportunities;
