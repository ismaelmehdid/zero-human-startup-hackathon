-- Optional part of the rehearsal reset (reset.mjs --yes --with-seed), applied in the same transaction as
-- sql/reset.sql: also deletes the fictional seed consultants (box_file_id 'seed-%').
-- Consultants loaded from Box are never deleted.

DELETE FROM consultants WHERE box_file_id LIKE 'seed-%';
