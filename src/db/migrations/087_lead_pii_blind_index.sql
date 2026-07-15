-- 087_lead_pii_blind_index.sql
--
-- Adds a deterministic blind index to `leads` so equality lookups work against
-- the AES-GCM-encrypted email/phone columns.
--
-- THE BUG THIS FIXES. encryptPII() uses a random IV per call, so the same email
-- encrypts to different ciphertext every time. Two paths matched a plaintext
-- address against that column:
--   1. lead dedup    src/app/api/leads/route.ts   WHERE email = $1
--   2. CCPA erasure  src/lib/privacy.ts           WHERE email_col = $1
-- Once PII_ENCRYPTION_KEY is set they match NOTHING, silently. Dedup lets every
-- duplicate through. Erasure anonymizes zero rows while still reporting
-- status completed. Both are invisible in dev, where getKey() returns null and
-- encryptPII degrades to an identity function.
--
-- THE FIX. Match on email_hash / phone_hash, a stable HMAC-SHA256 of the
-- NORMALIZED value (see hashPII in src/lib/crypto.ts). Keep AES-GCM for the
-- displayed value.
--
-- The columns are nullable because existing rows are backfilled separately by
-- `npm run backfill:lead-hashes`. Until that runs, legacy rows simply do not
-- match, which is the pre-existing behaviour rather than a new regression.
--
-- KEY ROTATION. Hashes derive from PII_ENCRYPTION_KEY. Rotating it invalidates
-- every stored hash and requires NULLing the columns and re-running the backfill.
--
-- Additive and idempotent. `leads` already has RLS from 055, and new columns
-- inherit the existing table policy, so no policy change is needed.
--
-- NOTE ON THIS FILE. scripts/run-migration.mjs splits on semicolons without
-- parsing, so a semicolon anywhere in these comments or inside a quoted string
-- silently cuts a statement in half. The first version of this migration used
-- prose semicolons, which swallowed the email_hash ALTER and applied only half
-- the migration to production. Keep every comment and string here
-- semicolon-free.
--
-- The chain does not run clean from 001 (it breaks at 055 on dealer_users
-- .dealer_id TEXT vs dealers.id UUID), so apply this out-of-band like 085.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_hash TEXT;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone_hash TEXT;

COMMENT ON COLUMN leads.email_hash IS
  'Deterministic HMAC-SHA256 of the normalized email (hashPII). Match on this, never on the encrypted email column.';

COMMENT ON COLUMN leads.phone_hash IS
  'Deterministic HMAC-SHA256 of the normalized phone (hashPII). Match on this, never on the encrypted phone column.';

CREATE INDEX IF NOT EXISTS idx_leads_dealer_email_hash
  ON leads (dealer_id, email_hash);

CREATE INDEX IF NOT EXISTS idx_leads_dealer_phone_hash
  ON leads (dealer_id, phone_hash);
