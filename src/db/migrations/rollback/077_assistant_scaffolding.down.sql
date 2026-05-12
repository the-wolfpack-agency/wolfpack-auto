-- Paired .down.sql for migration 077 (Wolfpack Assistant scaffolding).
-- Mirror of rollback_077_assistant_scaffolding.sql.

DROP TABLE IF EXISTS assistant_conversation_messages CASCADE;
DROP TABLE IF EXISTS assistant_conversations         CASCADE;
DROP TABLE IF EXISTS assistant_capabilities          CASCADE;
DROP TABLE IF EXISTS assistant_actions               CASCADE;

DROP FUNCTION IF EXISTS assistant_actions_set_updated_at() CASCADE;
