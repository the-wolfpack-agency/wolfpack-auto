-- Runner-facing rollback file for migration 077 (Wolfpack Assistant scaffolding).
-- Mirror of 077_assistant_scaffolding.down.sql so both naming conventions in
-- src/db/migrations/rollback/ resolve.
--
-- CASCADE so dependent indexes/policies come down with each table.
-- Idempotent (IF EXISTS) so partial rollbacks don't error.

DROP TABLE IF EXISTS assistant_conversation_messages CASCADE;
DROP TABLE IF EXISTS assistant_conversations         CASCADE;
DROP TABLE IF EXISTS assistant_capabilities          CASCADE;
DROP TABLE IF EXISTS assistant_actions               CASCADE;

DROP FUNCTION IF EXISTS assistant_actions_set_updated_at() CASCADE;
