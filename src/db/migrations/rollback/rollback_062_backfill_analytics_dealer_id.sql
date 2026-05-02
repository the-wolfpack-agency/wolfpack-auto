-- rollback_062_backfill_analytics_dealer_id.sql
--
-- The forward migration only added a `dealer_id` key to event metadata
-- where one was missing. Reversing it would strip that key from every
-- row — but the route fix shipped in the same commit means new events
-- always carry dealer_id natively, so a clean reverse can't tell
-- backfilled rows from genuine ones.
--
-- The rollback is intentionally a no-op: re-running migration 062 is
-- safe (it's idempotent), and reverting the route code is the right
-- way to "undo" this change rather than mutating production data.

BEGIN;
SELECT 1; -- explicit no-op so migration runners that require a statement succeed
COMMIT;
