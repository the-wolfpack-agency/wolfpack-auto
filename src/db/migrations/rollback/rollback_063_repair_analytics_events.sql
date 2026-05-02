-- rollback_063_repair_analytics_events.sql
--
-- Restore page + metadata fields from analytics_events_repair_063
-- snapshot. Drops the snapshot table at the end.

BEGIN;

UPDATE analytics_events e
   SET page = s.prior_page,
       metadata = s.prior_metadata
  FROM analytics_events_repair_063 s
 WHERE e.id = s.id;

DROP TABLE IF EXISTS analytics_events_repair_063;

COMMIT;
