-- 087_lead_pii_blind_index.sql
--
-- Adds a deterministic blind index to `leads` so equality lookups work against
-- the AES-GCM-encrypted email/phone columns.
--
-- THE BUG THIS FIXES: encryptPII() uses a random IV per call, so the same email
-- encrypts to different ciphertext every time. Both
--   - lead dedup  (src/app/api/leads/route.ts: WHERE email = $1), and
--   - CCPA erasure (src/lib/privacy.ts: WHERE email_col = $1)
-- matched plaintext against that column, so once PII_ENCRYPTION_KEY is set they
-- match NOTHING, silently. Dedup lets every duplicate through; erasure no-ops
-- while still reporting status='completed'. Both are invisible in dev, where
-- getKey() returns null and encryptPII is an identity function.
--
-- The fix: match on email_hash / phone_hash (stable HMAC-SHA256 of the
-- NORMALIZED value, see hashPII in src/lib/crypto.ts), keep AES-GCM for the
-- displayed value. The columns are nullable because existing rows are backfilled
-- separately by `npm run backfill:lead-hashes` — until that runs, legacy
-- rows simply do not match, which is the pre-existing behaviour, not a new
-- regression.
--
-- Key rotation note: hashes are derived from PII_ENCRYPTION_KEY. Rotating it
-- invalidates every stored hash and requires re-running the backfill.
--
-- Additive and idempotent. `leads` already has RLS from 055; new columns inherit
-- the table's existing policy, so no policy change is needed here.
--
-- NOTE: this repo's migration chain does not run clean from 001 (it breaks at
-- 055 on dealer_users.dealer_id TEXT vs dealers.id UUID). Apply this one
-- out-of-band against the target database, the same way 085 was.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_hash TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone_hash TEXT;

COMMENT ON COLUMN leads.email_hash IS
  'Deterministic HMAC-SHA256 of the normalized email (hashPII). Match on this; never on the encrypted email column.';
COMMENT ON COLUMN leads.phone_hash IS
  'Deterministic HMAC-SHA256 of the normalized phone (hashPII). Match on this; never on the encrypted phone column.';

-- Dealer-scoped: every lookup is already tenant-scoped, so lead with the
-- dealer_id to keep these usable by the existing dedup/erasure queries.
CREATE INDEX IF NOT EXISTS idx_leads_dealer_email_hash
  ON leads (dealer_id, email_hash);
CREATE INDEX IF NOT EXISTS idx_leads_dealer_phone_hash
  ON leads (dealer_id, phone_hash);
