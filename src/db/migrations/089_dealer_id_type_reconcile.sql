-- 089_dealer_id_type_reconcile.sql
--
-- Make production's dealer_id columns match what the migration chain builds.
--
-- WHY
--
-- Production and a freshly migrated database disagree on two column types:
--
--                          fresh chain   production
--   dealers.id             uuid          uuid
--   leads.dealer_id        uuid          uuid
--   vehicles.dealer_id     uuid          uuid
--   dealer_users.dealer_id uuid          TEXT     <-- drift, fixed here
--   deals.dealer_id        uuid          TEXT     <-- a VIEW, see note below
--
-- That is worse than either type on its own, because no single query is correct
-- in both places:
--
--   u.dealer_id = d.id::text   works in production, "operator does not exist:
--                              uuid = text" on a fresh chain
--   u.dealer_id = d.id         the exact reverse
--
-- So a query can pass CI and fail in production, or pass in production and fail
-- the moment anyone builds a test database. On 2026-08-04 the Agency Dashboard
-- listed two fabricated dealerships for exactly this reason: the join raised
-- uuid = text, the route caught it and answered with sample data, and 19 real
-- dealers including a newly onboarded client were invisible while the page
-- looked healthy.
--
-- Reconciling the type is what removes the class. Casts sprinkled per call site
-- only move the problem to whichever environment was not being looked at.
--
-- SAFETY
--
-- Both columns hold uuid-shaped strings today; every value is checked before
-- anything is altered and the migration aborts if any row would not convert.
-- Wrapped in the runner's transaction, so a failure leaves the schema untouched.
-- Idempotent: re-running against already-converted columns is a no-op.
--
-- SCOPE
--
-- dealer_users only. `deals` is a VIEW, so its column type comes from whatever
-- table it selects from and ALTER COLUMN is not possible on it. Its joins also
-- work in production today. Converting the table behind that view is a separate
-- change with its own analysis, and bundling it here would risk the fix that is
-- actually needed.
--
-- Tested against a branch containing a copy of production data before shipping:
-- the first version of this migration tried to alter `deals` and failed with
-- "ALTER action ALTER COLUMN ... cannot be performed on relation deals", which
-- is exactly what testing on a copy is for.

BEGIN;

-- ---------------------------------------------------------------------------
-- Refuse to convert if any value is not a uuid. Better to stop than to lose a
-- row silently.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  bad_count INT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'dealer_users' AND column_name = 'dealer_id' AND data_type = 'text'
  ) THEN
    SELECT COUNT(*) INTO bad_count
      FROM dealer_users
     WHERE dealer_id IS NOT NULL
       AND dealer_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    IF bad_count > 0 THEN
      RAISE EXCEPTION 'dealer_users.dealer_id has % value(s) that are not uuids; refusing to convert', bad_count;
    END IF;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Convert. USING makes this a rewrite rather than a reinterpretation, so a
-- value that somehow slipped past the check above still fails loudly.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'dealer_users' AND column_name = 'dealer_id' AND data_type = 'text'
  ) AND EXISTS (
    -- Never attempt this on a view: ALTER COLUMN is not possible there.
    SELECT 1 FROM information_schema.tables
     WHERE table_name = 'dealer_users' AND table_type = 'BASE TABLE'
  ) THEN
    ALTER TABLE dealer_users
      ALTER COLUMN dealer_id TYPE uuid USING NULLIF(dealer_id, '')::uuid;
  END IF;

END$$;

-- ---------------------------------------------------------------------------
-- Prove it. If either column is still text the migration fails here rather
-- than reporting success on a job half done.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  still_text TEXT;
BEGIN
  SELECT string_agg(table_name || '.' || column_name, ', ')
    INTO still_text
    FROM information_schema.columns
   WHERE column_name = 'dealer_id'
     AND table_name = 'dealer_users'
     AND data_type = 'text';
  IF still_text IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 089 left % as text', still_text;
  END IF;
END$$;

COMMIT;
