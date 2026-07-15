-- rollback_087_lead_pii_blind_index.sql
--
-- Drops the blind-index columns and their indexes. Safe: the hashes are derived
-- data, recomputable at any time from the plaintext via
-- `npm run backfill:lead-hashes`. No source-of-truth data is lost.
--
-- WARNING: rolling this back restores the silent-failure behaviour it fixed.
-- Dedup and CCPA erasure go back to matching plaintext against an encrypted
-- column, which matches nothing whenever PII_ENCRYPTION_KEY is set. Only roll
-- back together with the application code that reads these columns.

DROP INDEX IF EXISTS idx_leads_dealer_email_hash;
DROP INDEX IF EXISTS idx_leads_dealer_phone_hash;

ALTER TABLE leads DROP COLUMN IF EXISTS email_hash;
ALTER TABLE leads DROP COLUMN IF EXISTS phone_hash;
