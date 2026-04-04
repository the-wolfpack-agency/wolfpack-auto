/**
 * Migration 052 — New Feature Tables
 *
 * Validates that migration 052 creates all required tables for the 19 admin
 * routes, that every route has auth guards + analytics tracking, that the
 * seed data covers new tables, and that the migration SQL is structurally valid.
 *
 * These are static-analysis + contract tests that don't require a running DB.
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");
const MIGRATION_FILE = path.join(ROOT, "src/db/migrations/052_new_feature_tables.sql");
const SEED_FILE = path.join(ROOT, "src/db/seed.ts");
const API_DIR = path.join(ROOT, "src/app/api/admin");
const ANALYTICS_HOOKS = path.join(ROOT, "src/lib/analytics-hooks.ts");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

const migrationSQL = readFile(MIGRATION_FILE);
const seedTS = readFile(SEED_FILE);
const analyticsHooksTS = readFile(ANALYTICS_HOOKS);

/* ------------------------------------------------------------------ */
/*  1. Migration file exists and is valid SQL                          */
/* ------------------------------------------------------------------ */

describe("Migration 052 — File Structure", () => {
  test("migration file exists", () => {
    expect(fs.existsSync(MIGRATION_FILE)).toBe(true);
  });

  test("migration file is non-empty", () => {
    expect(migrationSQL.length).toBeGreaterThan(1000);
  });

  test("migration uses CREATE TABLE IF NOT EXISTS (safe to re-run)", () => {
    const createTableStatements = migrationSQL.match(/CREATE TABLE/gi) ?? [];
    const safeStatements = migrationSQL.match(/CREATE TABLE IF NOT EXISTS/gi) ?? [];
    expect(safeStatements.length).toBe(createTableStatements.length);
  });

  test("migration uses CREATE INDEX IF NOT EXISTS (safe to re-run)", () => {
    const indexStatements = migrationSQL.match(/CREATE INDEX/gi) ?? [];
    const safeIndexStatements = migrationSQL.match(/CREATE INDEX IF NOT EXISTS/gi) ?? [];
    expect(safeIndexStatements.length).toBe(indexStatements.length);
  });

  test("migration does not contain DROP TABLE", () => {
    expect(migrationSQL).not.toMatch(/DROP TABLE/i);
  });

  test("migration does not contain TRUNCATE", () => {
    expect(migrationSQL).not.toMatch(/TRUNCATE/i);
  });
});

/* ------------------------------------------------------------------ */
/*  2. All required tables are created                                 */
/* ------------------------------------------------------------------ */

describe("Migration 052 — Table Creation", () => {
  const REQUIRED_TABLES = [
    "analytics_events",
    "data_exports",
    "customer_vehicles",
    "households",
    "household_members",
    "household_vehicles",
    "sms_messages",
    "drip_campaigns",
    "campaign_enrollments",
    "call_recordings",
    "session_replays",
    "session_replay_events",
    "client_errors",
    "surveys",
    "survey_responses",
    "user_tests",
    "test_recordings",
    "reinsurance_programs",
    "reinsurance_policies",
    "reinsurance_claims",
    "erating_cache",
    "deliveries",
    "vehicle_delivery_tracker",
    "walkarounds",
    "walkaround_segments",
    "lead_ingestion_feeds",
    "ingested_leads",
    "dashboard_annotations",
    "customer_touchpoints",
  ];

  test.each(REQUIRED_TABLES)("CREATE TABLE IF NOT EXISTS %s", (table) => {
    const regex = new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(`, "i");
    expect(migrationSQL).toMatch(regex);
  });

  test("creates all 29 tables", () => {
    const matches = migrationSQL.match(/CREATE TABLE IF NOT EXISTS/gi) ?? [];
    expect(matches.length).toBe(29);
  });
});

/* ------------------------------------------------------------------ */
/*  3. Row-Level Security (RLS) on tenant-scoped tables                */
/* ------------------------------------------------------------------ */

describe("Migration 052 — Row-Level Security", () => {
  const RLS_TABLES = [
    "data_exports",
    "customer_vehicles",
    "households",
    "sms_messages",
    "drip_campaigns",
    "campaign_enrollments",
    "call_recordings",
    "session_replays",
    "client_errors",
    "surveys",
    "survey_responses",
    "user_tests",
    "test_recordings",
    "reinsurance_programs",
    "reinsurance_policies",
    "reinsurance_claims",
    "erating_cache",
    "deliveries",
    "vehicle_delivery_tracker",
    "walkarounds",
    "lead_ingestion_feeds",
    "ingested_leads",
    "dashboard_annotations",
    "customer_touchpoints",
  ];

  test.each(RLS_TABLES)("ENABLE ROW LEVEL SECURITY on %s", (table) => {
    const regex = new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`, "i");
    expect(migrationSQL).toMatch(regex);
  });

  test.each(RLS_TABLES)("RLS policy on %s uses app.current_dealer_id", (table) => {
    const regex = new RegExp(`CREATE POLICY.*${table}.*current_setting.*app\\.current_dealer_id`, "is");
    expect(migrationSQL).toMatch(regex);
  });
});

/* ------------------------------------------------------------------ */
/*  4. Indexes on key columns                                          */
/* ------------------------------------------------------------------ */

describe("Migration 052 — Indexes", () => {
  test("indexes exist on dealer_id for all tenant tables", () => {
    // Count distinct tables that have dealer_id indexes
    const dealerIndexes = migrationSQL.match(/CREATE INDEX IF NOT EXISTS idx_\w+_dealer\b/gi) ?? [];
    // At minimum: data_exports, customer_vehicles, households, sms_messages,
    // drip_campaigns, campaign_enrollments, call_recordings, session_replays,
    // client_errors, surveys, survey_responses, user_tests, test_recordings,
    // reinsurance_programs, reinsurance_policies, erating_cache, deliveries,
    // vehicle_delivery_tracker, walkarounds, lead_ingestion_feeds, ingested_leads,
    // dashboard_annotations, customer_touchpoints
    expect(dealerIndexes.length).toBeGreaterThanOrEqual(20);
  });

  test("analytics_events has timestamp index", () => {
    expect(migrationSQL).toMatch(/idx_analytics_events_timestamp/i);
  });

  test("analytics_events has GIN index on metadata", () => {
    expect(migrationSQL).toMatch(/USING GIN.*metadata/i);
  });

  test("analytics_events has composite index for propensity queries", () => {
    expect(migrationSQL).toMatch(/idx_analytics_events_page_ts/i);
  });

  test("client_errors has unresolved fingerprint index", () => {
    expect(migrationSQL).toMatch(/idx_client_errors_unresolved/i);
  });

  test("session_replay_events has session_id index", () => {
    expect(migrationSQL).toMatch(/idx_session_replay_events_session/i);
  });
});

/* ------------------------------------------------------------------ */
/*  5. Foreign key constraints                                         */
/* ------------------------------------------------------------------ */

describe("Migration 052 — Foreign Keys", () => {
  test("household_members references households ON DELETE CASCADE", () => {
    expect(migrationSQL).toMatch(/household_members[\s\S]*?REFERENCES households.*ON DELETE CASCADE/i);
  });

  test("household_members references customers", () => {
    expect(migrationSQL).toMatch(/household_members[\s\S]*?REFERENCES customers/i);
  });

  test("customer_vehicles references customers", () => {
    expect(migrationSQL).toMatch(/customer_vehicles[\s\S]*?REFERENCES customers/i);
  });

  test("campaign_enrollments references drip_campaigns ON DELETE CASCADE", () => {
    expect(migrationSQL).toMatch(/campaign_enrollments[\s\S]*?REFERENCES drip_campaigns.*ON DELETE CASCADE/i);
  });

  test("campaign_enrollments references leads", () => {
    expect(migrationSQL).toMatch(/campaign_enrollments[\s\S]*?REFERENCES leads/i);
  });

  test("session_replay_events references session_replays ON DELETE CASCADE", () => {
    expect(migrationSQL).toMatch(/session_replay_events[\s\S]*?REFERENCES session_replays.*ON DELETE CASCADE/i);
  });

  test("survey_responses references surveys ON DELETE CASCADE", () => {
    expect(migrationSQL).toMatch(/survey_responses[\s\S]*?REFERENCES surveys.*ON DELETE CASCADE/i);
  });

  test("test_recordings references user_tests ON DELETE CASCADE", () => {
    expect(migrationSQL).toMatch(/test_recordings[\s\S]*?REFERENCES user_tests.*ON DELETE CASCADE/i);
  });

  test("reinsurance_policies references reinsurance_programs ON DELETE CASCADE", () => {
    expect(migrationSQL).toMatch(/reinsurance_policies[\s\S]*?REFERENCES reinsurance_programs.*ON DELETE CASCADE/i);
  });

  test("reinsurance_claims references reinsurance_policies ON DELETE CASCADE", () => {
    expect(migrationSQL).toMatch(/reinsurance_claims[\s\S]*?REFERENCES reinsurance_policies.*ON DELETE CASCADE/i);
  });

  test("walkaround_segments references walkarounds ON DELETE CASCADE", () => {
    expect(migrationSQL).toMatch(/walkaround_segments[\s\S]*?REFERENCES walkarounds.*ON DELETE CASCADE/i);
  });

  test("ingested_leads references lead_ingestion_feeds", () => {
    expect(migrationSQL).toMatch(/ingested_leads[\s\S]*?REFERENCES lead_ingestion_feeds/i);
  });
});

/* ------------------------------------------------------------------ */
/*  6. CHECK constraints (data integrity)                              */
/* ------------------------------------------------------------------ */

describe("Migration 052 — CHECK Constraints", () => {
  test("deliveries has status CHECK", () => {
    expect(migrationSQL).toMatch(/deliveries[\s\S]*?CHECK.*scheduled.*confirmed.*in_transit.*delivered.*cancelled/i);
  });

  test("vehicle_delivery_tracker has stage CHECK", () => {
    expect(migrationSQL).toMatch(/vehicle_delivery_tracker[\s\S]*?CHECK.*acquired.*in_transit.*arrived/i);
  });

  test("sms_messages has direction CHECK", () => {
    expect(migrationSQL).toMatch(/sms_messages[\s\S]*?CHECK.*inbound.*outbound/i);
  });

  test("reinsurance_programs has type CHECK", () => {
    expect(migrationSQL).toMatch(/reinsurance_programs[\s\S]*?CHECK.*CFC.*DOWC/i);
  });

  test("customer_vehicles has condition CHECK", () => {
    expect(migrationSQL).toMatch(/customer_vehicles[\s\S]*?CHECK.*excellent.*good.*fair.*poor/i);
  });

  test("walkarounds has status CHECK", () => {
    expect(migrationSQL).toMatch(/walkarounds[\s\S]*?CHECK.*draft.*recording.*published/i);
  });

  test("dashboard_annotations has type CHECK", () => {
    expect(migrationSQL).toMatch(/dashboard_annotations[\s\S]*?CHECK.*campaign.*milestone.*alert.*note/i);
  });

  test("customer_touchpoints has channel CHECK", () => {
    expect(migrationSQL).toMatch(/customer_touchpoints[\s\S]*?CHECK.*online.*phone.*email.*in_store/i);
  });
});

/* ------------------------------------------------------------------ */
/*  7. Learning views (analytics/propensity)                           */
/* ------------------------------------------------------------------ */

describe("Migration 052 — Learning Views", () => {
  const REQUIRED_VIEWS = [
    "v_feature_engagement",
    "v_module_adoption",
    "v_error_impact",
    "v_delivery_performance",
    "v_reinsurance_roi",
    "v_survey_nps",
  ];

  test.each(REQUIRED_VIEWS)("view %s is created", (view) => {
    const regex = new RegExp(`CREATE OR REPLACE VIEW ${view}`, "i");
    expect(migrationSQL).toMatch(regex);
  });

  test("v_module_adoption has adoption tiers", () => {
    expect(migrationSQL).toMatch(/power_user.*active.*tried.*never/is);
  });

  test("v_error_impact calculates impact_score", () => {
    expect(migrationSQL).toMatch(/impact_score/i);
  });

  test("v_delivery_performance calculates completion_rate", () => {
    expect(migrationSQL).toMatch(/completion_rate/i);
  });

  test("v_reinsurance_roi calculates roi_pct", () => {
    expect(migrationSQL).toMatch(/roi_pct/i);
  });

  test("v_survey_nps calculates NPS from promoters/detractors", () => {
    expect(migrationSQL).toMatch(/promoters/i);
    expect(migrationSQL).toMatch(/detractors/i);
  });
});

/* ------------------------------------------------------------------ */
/*  8. Customers table enrichment                                      */
/* ------------------------------------------------------------------ */

describe("Migration 052 — Customers Table Enrichment", () => {
  test("adds first_name column to customers", () => {
    expect(migrationSQL).toMatch(/ALTER TABLE customers ADD COLUMN IF NOT EXISTS first_name/i);
  });

  test("adds last_name column to customers", () => {
    expect(migrationSQL).toMatch(/ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_name/i);
  });

  test("adds address column to customers", () => {
    expect(migrationSQL).toMatch(/ALTER TABLE customers ADD COLUMN IF NOT EXISTS address/i);
  });

  test("adds zip column to customers", () => {
    expect(migrationSQL).toMatch(/ALTER TABLE customers ADD COLUMN IF NOT EXISTS zip/i);
  });

  test("backfills first_name/last_name from name", () => {
    expect(migrationSQL).toMatch(/UPDATE customers[\s\S]*?SET first_name.*split_part/i);
  });
});

/* ------------------------------------------------------------------ */
/*  9. Every admin route has analytics tracking                        */
/* ------------------------------------------------------------------ */

describe("Admin Routes — Analytics Tracking", () => {
  const TRACKED_ROUTES = [
    { route: "sms", tracker: "trackSMS" },
    { route: "surveys", tracker: "trackSurvey" },
    { route: "user-testing", tracker: "trackUserTest" },
    { route: "session-replay", tracker: "trackSessionReplay" },
    { route: "error-monitor", tracker: "trackErrorMonitor" },
    { route: "households", tracker: "trackHousehold" },
    { route: "lead-ingestion", tracker: "trackLeadIngestion" },
    { route: "deliveries", tracker: "trackDelivery" },
    { route: "data-export", tracker: "trackDataExport" },
    { route: "reputation", tracker: "trackReputation" },
    { route: "propensity", tracker: "trackPropensity" },
    { route: "annotations", tracker: "trackAnnotation" },
    { route: "walkarounds", tracker: "trackWalkaround" },
    { route: "call-intelligence", tracker: "trackCallIntelligence" },
    { route: "equity-mining", tracker: "trackEquityMining" },
    { route: "reinsurance", tracker: "trackReinsurance" },
    { route: "omnichannel", tracker: "trackOmnichannel" },
    { route: "vehicle-pipeline", tracker: "trackVehiclePipeline" },
    { route: "drip-campaigns", tracker: "trackDripCampaign" },
  ];

  test.each(TRACKED_ROUTES)(
    "$route imports $tracker",
    ({ route, tracker }) => {
      const routeFile = path.join(API_DIR, route, "route.ts");
      expect(fs.existsSync(routeFile)).toBe(true);
      const content = readFile(routeFile);
      expect(content).toContain(tracker);
    },
  );

  test.each(TRACKED_ROUTES)(
    "$route calls $tracker at least once",
    ({ route, tracker }) => {
      const routeFile = path.join(API_DIR, route, "route.ts");
      const content = readFile(routeFile);
      // Must call the tracker (not just import it)
      const callRegex = new RegExp(`${tracker}\\(`, "g");
      const calls = content.match(callRegex) ?? [];
      expect(calls.length).toBeGreaterThanOrEqual(1);
    },
  );
});

/* ------------------------------------------------------------------ */
/*  10. Every admin route has auth guards                              */
/* ------------------------------------------------------------------ */

describe("Admin Routes — Auth Guards", () => {
  const ROUTES = [
    "sms", "surveys", "user-testing", "session-replay", "error-monitor",
    "households", "lead-ingestion", "deliveries", "data-export", "reputation",
    "propensity", "annotations", "walkarounds", "call-intelligence",
    "equity-mining", "reinsurance", "omnichannel", "vehicle-pipeline",
    "drip-campaigns",
  ];

  test.each(ROUTES)("%s has requireAuth guard", (route) => {
    const routeFile = path.join(API_DIR, route, "route.ts");
    const content = readFile(routeFile);
    expect(content).toContain("requireAuth");
  });
});

/* ------------------------------------------------------------------ */
/*  11. Analytics hooks — all tracker functions exist                   */
/* ------------------------------------------------------------------ */

describe("Analytics Hooks — Completeness", () => {
  const TRACKER_FUNCTIONS = [
    "trackSMS", "trackSurvey", "trackUserTest", "trackSessionReplay",
    "trackErrorMonitor", "trackHousehold", "trackLeadIngestion", "trackDelivery",
    "trackDataExport", "trackReputation", "trackPropensity", "trackAnnotation",
    "trackWalkaround", "trackCallIntelligence", "trackEquityMining",
    "trackReinsurance", "trackOmnichannel", "trackVehiclePipeline",
    "trackDripCampaign", "trackERating",
  ];

  test.each(TRACKER_FUNCTIONS)("export function %s exists in analytics-hooks.ts", (fn) => {
    expect(analyticsHooksTS).toContain(`export function ${fn}(`);
  });
});

/* ------------------------------------------------------------------ */
/*  12. Seed data covers new tables                                    */
/* ------------------------------------------------------------------ */

describe("Seed Data — Coverage", () => {
  const SEEDED_TABLES = [
    "customer_vehicles",
    "households",
    "surveys",
    "reinsurance_programs",
    "dashboard_annotations",
    "lead_ingestion_feeds",
    "drip_campaigns",
  ];

  test.each(SEEDED_TABLES)("seed.ts inserts into %s", (table) => {
    expect(seedTS).toContain(table);
  });

  test("seed uses DEMO_DEALER_ID consistently", () => {
    expect(seedTS).toContain("00000000-0000-4000-a000-000000000001");
  });

  test("seed uses ON CONFLICT DO NOTHING (idempotent)", () => {
    const conflicts = seedTS.match(/ON CONFLICT/gi) ?? [];
    expect(conflicts.length).toBeGreaterThanOrEqual(5);
  });

  test("seed enriches customers with first_name/last_name", () => {
    expect(seedTS).toContain("first_name");
    expect(seedTS).toContain("last_name");
  });
});

/* ------------------------------------------------------------------ */
/*  13. Shadow mode — every route gracefully handles missing tables    */
/* ------------------------------------------------------------------ */

describe("Shadow Mode — Graceful Fallbacks", () => {
  const ROUTES_WITH_SHADOW = [
    "sms", "surveys", "user-testing", "session-replay", "error-monitor",
    "households", "lead-ingestion", "deliveries", "data-export", "reputation",
    "propensity", "annotations", "walkarounds", "call-intelligence",
    "equity-mining", "reinsurance", "omnichannel", "vehicle-pipeline",
    "drip-campaigns",
  ];

  test.each(ROUTES_WITH_SHADOW)("%s handles 'does not exist' error", (route) => {
    const routeFile = path.join(API_DIR, route, "route.ts");
    const content = readFile(routeFile);
    // Either checks DATABASE_URL or handles "does not exist"
    const hasShadowMode = content.includes("DATABASE_URL") || content.includes("does not exist");
    expect(hasShadowMode).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  14. UNIQUE constraints for data integrity                          */
/* ------------------------------------------------------------------ */

describe("Migration 052 — UNIQUE Constraints", () => {
  test("household_members has UNIQUE (household_id, customer_id)", () => {
    expect(migrationSQL).toMatch(/UNIQUE\s*\(household_id,\s*customer_id\)/i);
  });

  test("vehicle_delivery_tracker has UNIQUE (dealer_id, vin)", () => {
    expect(migrationSQL).toMatch(/UNIQUE\s*\(dealer_id,\s*vin\)/i);
  });

  test("session_replay_events has UNIQUE (session_id, seq)", () => {
    expect(migrationSQL).toMatch(/UNIQUE\s*\(session_id,\s*seq\)/i);
  });

  test("campaign_enrollments has UNIQUE (campaign_id, lead_id)", () => {
    expect(migrationSQL).toMatch(/UNIQUE\s*\(campaign_id,\s*lead_id\)/i);
  });
});

/* ------------------------------------------------------------------ */
/*  15. Update triggers                                                */
/* ------------------------------------------------------------------ */

describe("Migration 052 — Update Triggers", () => {
  test("customer_vehicles has updated_at trigger", () => {
    expect(migrationSQL).toMatch(/customer_vehicles_updated_at.*BEFORE UPDATE.*customer_vehicles/i);
  });

  test("deliveries has updated_at trigger", () => {
    expect(migrationSQL).toMatch(/deliveries_updated_at.*BEFORE UPDATE.*deliveries/i);
  });

  test("reinsurance_programs has updated_at trigger", () => {
    expect(migrationSQL).toMatch(/reinsurance_programs_updated_at.*BEFORE UPDATE.*reinsurance_programs/i);
  });
});

/* ------------------------------------------------------------------ */
/*  16. Data type validation                                           */
/* ------------------------------------------------------------------ */

describe("Migration 052 — Data Types", () => {
  test("monetary columns use NUMERIC", () => {
    // loan_balance, monthly_payment, purchase_price, fee, ceded_premium, paid_amount
    const numericColumns = migrationSQL.match(/NUMERIC\(\d+,\d+\)/gi) ?? [];
    expect(numericColumns.length).toBeGreaterThanOrEqual(10);
  });

  test("JSONB is used for flexible data columns", () => {
    const jsonbColumns = migrationSQL.match(/JSONB/gi) ?? [];
    expect(jsonbColumns.length).toBeGreaterThanOrEqual(10);
  });

  test("all timestamp columns use TIMESTAMPTZ (timezone-aware)", () => {
    const timestamptz = migrationSQL.match(/TIMESTAMPTZ/gi) ?? [];
    expect(timestamptz.length).toBeGreaterThanOrEqual(30);
    // Ensure no column declaration uses bare TIMESTAMP as a data type.
    // Column declarations look like: "column_name  TIMESTAMP" — we check for
    // TIMESTAMP used as a type (preceded by whitespace, followed by DEFAULT/NOT/comma/newline)
    // but NOT "TIMESTAMPTZ".
    const lines = migrationSQL.split("\n");
    const unsafeLines = lines.filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("--")) return false;
      // Only match lines that look like column definitions (contain DEFAULT or NOT NULL after TIMESTAMP)
      // and use plain TIMESTAMP instead of TIMESTAMPTZ
      return /\s+TIMESTAMP\s+(NOT|DEFAULT)/i.test(trimmed) && !/TIMESTAMPTZ/i.test(trimmed);
    });
    expect(unsafeLines).toEqual([]);
  });
});
