/**
 * Every dealer join must survive contact with the real schema.
 *
 * WHY THIS EXISTS
 *
 * The Agency Dashboard listed two invented dealerships, "Demo Dealership" and
 * "Triangle Auto Group", with invented lead and inventory counts, while 19 real
 * ones including a newly onboarded client were invisible. The join read
 *
 *     ON l.dealer_id = d.id::text
 *
 * and leads.dealer_id is uuid, so Postgres raised `operator does not exist:
 * uuid = text`, the route caught it and answered with MOCK_DEALERS. The page
 * looked healthy and was showing fiction.
 *
 * The column types genuinely differ per table, which is what makes this easy to
 * get wrong:
 *
 *     dealers.id            uuid
 *     leads.dealer_id       uuid      <- no cast
 *     vehicles.dealer_id    uuid      <- no cast
 *     dealer_users.dealer_id text     <- cast REQUIRED
 *     deals.dealer_id        text     <- cast REQUIRED
 *
 * A unit test cannot see any of this: the SQL is a valid string and the mock
 * hid the failure. Only a real server comparing real types can.
 *
 * Skipped without TEST_DATABASE_URL; CI supplies one.
 */
import { Client } from "pg";

const URL = process.env.TEST_DATABASE_URL;
const d = URL ? describe : describe.skip;

d("dealer id joins", () => {
  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString: URL });
    await db.connect();
    await db.query(`DROP TABLE IF EXISTS dealers, leads, vehicles, dealer_users, deals CASCADE`);
    // The production types, so a cast that is wrong here is wrong there.
    await db.query(`CREATE TABLE dealers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text)`);
    await db.query(`CREATE TABLE leads (id serial PRIMARY KEY, dealer_id uuid)`);
    await db.query(`CREATE TABLE vehicles (id serial PRIMARY KEY, dealer_id uuid)`);
    await db.query(`CREATE TABLE dealer_users (id serial PRIMARY KEY, dealer_id text, last_login timestamptz)`);
    await db.query(`CREATE TABLE deals (id serial PRIMARY KEY, dealer_id text)`);
    await db.query(`INSERT INTO dealers (name) VALUES ('Acme')`);
  }, 60_000);

  afterAll(async () => {
    if (db) await db.end();
  });

  it("leads joins WITHOUT a cast", async () => {
    // The production defect, as an executable statement.
    await expect(
      db.query(`SELECT 1 FROM dealers d LEFT JOIN leads l ON l.dealer_id = d.id`),
    ).resolves.toBeDefined();
  });

  it("leads joined WITH a cast fails, which is what shipped", async () => {
    await expect(
      db.query(`SELECT 1 FROM dealers d LEFT JOIN leads l ON l.dealer_id = d.id::text`),
    ).rejects.toThrow(/operator does not exist/i);
  });

  it("vehicles joins WITHOUT a cast", async () => {
    await expect(
      db.query(`SELECT 1 FROM dealers d LEFT JOIN vehicles v ON v.dealer_id = d.id`),
    ).resolves.toBeDefined();
  });

  it("dealer_users REQUIRES the cast, so removing every cast is also wrong", async () => {
    await expect(
      db.query(`SELECT 1 FROM dealers d LEFT JOIN dealer_users u ON u.dealer_id = d.id::text`),
    ).resolves.toBeDefined();
    await expect(
      db.query(`SELECT 1 FROM dealers d LEFT JOIN dealer_users u ON u.dealer_id = d.id`),
    ).rejects.toThrow(/operator does not exist/i);
  });

  it("deals REQUIRES the cast too", async () => {
    await expect(
      db.query(`SELECT 1 FROM dealers d LEFT JOIN deals dl ON dl.dealer_id = d.id::text`),
    ).resolves.toBeDefined();
  });
});
