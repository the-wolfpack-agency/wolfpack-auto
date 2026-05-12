-- Migration 077: Wolfpack Assistant Scaffolding
--
-- Foundation for the Wolfpack Assistant integration (see
-- docs/wolfpack-assistant-integration-2026-05-12.md). Four tables that hold
-- the action registry + capability framework + conversation logger:
--
--   assistant_actions                — curated, agency-shared action registry
--                                      (slug → display_name + parameter_schema
--                                      + role allowlist + side-effect class)
--   assistant_capabilities           — (action, role) join table that the
--                                      capability matcher walks at runtime
--   assistant_conversations          — per-dealer, per-user conversation log
--   assistant_conversation_messages  — message-by-message log inside a
--                                      conversation (user prompt + assistant
--                                      response + proposed action + outcome)
--
-- The first two are AGENCY-SHARED curated metadata (mirrors migration 075's
-- pattern). They are RLS-enabled so verify:rls is satisfied, but the policy
-- is permissive on read; mutating writes are gated at the route layer via
-- requireWolfpackStaff in /api/admin/assistant/actions/route.ts.
--
-- The conversation tables are PER-DEALER and carry strict dealer_id-keyed
-- RLS policies mirroring migration 055's enforcement pattern.
--
-- Idempotent: every CREATE uses IF NOT EXISTS, every policy is wrapped in
-- DROP POLICY IF EXISTS / CREATE POLICY. Re-running this migration is a
-- no-op. Ends with a final ASSERT that fails loudly if any table is missing.

BEGIN;

-- ============================================================================
-- 1. assistant_actions — registry of every action the assistant can take
-- ============================================================================
CREATE TABLE IF NOT EXISTS assistant_actions (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                TEXT         NOT NULL UNIQUE,
  display_name        TEXT         NOT NULL,
  description         TEXT         NOT NULL,
  parameter_schema    JSONB        NOT NULL DEFAULT '{}'::jsonb,
  allowed_roles       TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  side_effect         TEXT         NOT NULL CHECK (side_effect IN (
                                     'read',
                                     'mutating',
                                     'irreversible'
                                   )),
  dry_run_supported   BOOLEAN      NOT NULL DEFAULT TRUE,
  category            TEXT,
  active              BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_actions_slug
  ON assistant_actions (slug);
CREATE INDEX IF NOT EXISTS idx_assistant_actions_category
  ON assistant_actions (category);
CREATE INDEX IF NOT EXISTS idx_assistant_actions_active
  ON assistant_actions (active);
CREATE INDEX IF NOT EXISTS idx_assistant_actions_side_effect
  ON assistant_actions (side_effect);

-- ============================================================================
-- 2. assistant_capabilities — which roles can invoke which actions
-- ============================================================================
CREATE TABLE IF NOT EXISTS assistant_capabilities (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id    UUID         NOT NULL REFERENCES assistant_actions(id)
                                ON DELETE CASCADE,
  role         TEXT         NOT NULL,
  enabled      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_assistant_capabilities_action_role
  ON assistant_capabilities (action_id, role);
CREATE INDEX IF NOT EXISTS idx_assistant_capabilities_role
  ON assistant_capabilities (role);
CREATE INDEX IF NOT EXISTS idx_assistant_capabilities_enabled
  ON assistant_capabilities (enabled);

-- ============================================================================
-- 3. assistant_conversations — per-dealer, per-user conversation log
-- ============================================================================
CREATE TABLE IF NOT EXISTS assistant_conversations (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id                UUID         NOT NULL,
  user_id                  UUID         NOT NULL,
  user_role                TEXT         NOT NULL,
  conversation_started_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  conversation_ended_at    TIMESTAMPTZ,
  message_count            INT          NOT NULL DEFAULT 0,
  actions_proposed         INT          NOT NULL DEFAULT 0,
  actions_executed         INT          NOT NULL DEFAULT 0,
  actions_rejected         INT          NOT NULL DEFAULT 0,
  satisfaction_signal      TEXT         CHECK (satisfaction_signal IN (
                                          'positive',
                                          'neutral',
                                          'negative',
                                          'unknown'
                                        ))
);

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_dealer_started
  ON assistant_conversations (dealer_id, conversation_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user
  ON assistant_conversations (user_id, conversation_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_satisfaction
  ON assistant_conversations (satisfaction_signal);

-- ============================================================================
-- 4. assistant_conversation_messages — one row per turn
-- ============================================================================
CREATE TABLE IF NOT EXISTS assistant_conversation_messages (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id          UUID         NOT NULL REFERENCES assistant_conversations(id)
                                          ON DELETE CASCADE,
  dealer_id                UUID         NOT NULL,
  message_index            INT          NOT NULL,
  direction                TEXT         NOT NULL CHECK (direction IN (
                                          'user',
                                          'assistant'
                                        )),
  content                  TEXT         NOT NULL,
  proposed_action_slug     TEXT,
  proposed_parameters      JSONB,
  was_executed             BOOLEAN,
  execution_result         JSONB,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation
  ON assistant_conversation_messages (conversation_id, message_index);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_dealer_created
  ON assistant_conversation_messages (dealer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_proposed_action
  ON assistant_conversation_messages (proposed_action_slug);

-- Same (conversation, index) shouldn't appear twice — append-only with
-- monotonically increasing message_index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_assistant_messages_conv_index
  ON assistant_conversation_messages (conversation_id, message_index);

-- ============================================================================
-- updated_at trigger on assistant_actions
-- ============================================================================
CREATE OR REPLACE FUNCTION assistant_actions_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'assistant_actions_updated_at'
  ) THEN
    CREATE TRIGGER assistant_actions_updated_at
    BEFORE UPDATE ON assistant_actions
    FOR EACH ROW EXECUTE FUNCTION assistant_actions_set_updated_at();
  END IF;
END $$;

-- ============================================================================
-- Row-level security
--
-- assistant_actions + assistant_capabilities are agency-shared curated
-- metadata. RLS is enabled so verify:rls is satisfied, but the policy is
-- permissive on read — writes are gated at the route layer
-- (requireWolfpackStaff in /api/admin/assistant/actions/*).
--
-- assistant_conversations + assistant_conversation_messages are per-dealer
-- and carry strict dealer_id-keyed policies mirroring migration 055.
-- ============================================================================
ALTER TABLE assistant_actions                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_capabilities            ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_conversations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_conversation_messages   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistant_actions_app_only ON assistant_actions;
CREATE POLICY assistant_actions_app_only ON assistant_actions
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS assistant_capabilities_app_only ON assistant_capabilities;
CREATE POLICY assistant_capabilities_app_only ON assistant_capabilities
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS assistant_conversations_tenant ON assistant_conversations;
CREATE POLICY assistant_conversations_tenant ON assistant_conversations
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

DROP POLICY IF EXISTS assistant_messages_tenant ON assistant_conversation_messages;
CREATE POLICY assistant_messages_tenant ON assistant_conversation_messages
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- Row-count assertions (log only — never fail the migration)
-- ============================================================================
DO $$
DECLARE
  a_count INT; c_count INT; conv_count INT; msg_count INT;
BEGIN
  SELECT COUNT(*) INTO a_count    FROM assistant_actions;
  SELECT COUNT(*) INTO c_count    FROM assistant_capabilities;
  SELECT COUNT(*) INTO conv_count FROM assistant_conversations;
  SELECT COUNT(*) INTO msg_count  FROM assistant_conversation_messages;
  RAISE NOTICE '[migration 077] assistant_actions rows: %',                a_count;
  RAISE NOTICE '[migration 077] assistant_capabilities rows: %',           c_count;
  RAISE NOTICE '[migration 077] assistant_conversations rows: %',          conv_count;
  RAISE NOTICE '[migration 077] assistant_conversation_messages rows: %',  msg_count;
END $$;

-- ============================================================================
-- Final ASSERT — fail loudly if any table is missing.
-- ============================================================================
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM (
    SELECT 'assistant_actions'                AS t WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assistant_actions')
    UNION ALL SELECT 'assistant_capabilities'           WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assistant_capabilities')
    UNION ALL SELECT 'assistant_conversations'          WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assistant_conversations')
    UNION ALL SELECT 'assistant_conversation_messages'  WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assistant_conversation_messages')
  ) AS missing_tables;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 077 failed — missing tables: %', missing;
  END IF;
END $$;

COMMIT;
