/**
 * Migration 089: production's dealer_id types match what the chain builds.
 *
 * WHY THIS MATTERS MORE THAN A TYPE TIDY-UP
 *
 * Production and a freshly migrated database disagreed:
 *
 *                          fresh chain   production
 *   dealers.id             uuid          uuid
 *   dealer_users.dealer_id uuid          TEXT
 *
 * That is worse than either type alone, because no single query is right in
 * both places. `u.dealer_id = d.id::text` works in production and raises
 * "operator does not exist: uuid = text" on a fresh chain; dropping the cast
 * does the exact reverse. A query could pass CI and fail in production.
 *
 * It already cost a client: the Agency Dashboard listed two fabricated
 * dealerships because the join raised uuid = text, the route caught it and
 * answered with sample data, and 19 real dealers were invisible behind a page
 * that looked healthy.
 *
 * Skipped without TEST_DATABASE_URL; the DB contract workflow supplies one.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const URL = process.env.TEST_DATABASE_URL;
const d = URL ? describe : describe.skip;

const SQL = readFileSync(join(__dirname, "..", "089_dealer_id_type_reconcile.sql"), "utf8");

d("089 dealer_id type reconcile", () => {
  let db: Client;

  beforeEach(async () => {
    db = new Client({ connectionString: URL });
    await db.connect();
    await db.query(`DROP TABLE IF EXISTS dealer_users, dealers CASCADE`);
    await db.query(`CREATE TABLE dealers (id uuid PRIMARY KEY DEFAULT gen_random_uuid())`);
    // The production shape: dealer_id as text.
    await db.query(`CREATE TABLE dealer_users (id serial PRIMARY KEY, email text, dealer_id text)`);
  }, 60_000);

  afterEach(async () => {
    if (db) await db.end();
  });

  const seed = async (values: (string | null)[]) => {
    const { rows } = await db.query(`INSERT INTO dealers DEFAULT VALUES RETURNING id`);
    for (const v of values) {
      await db.query(`INSERT INTO dealer_users (email, dealer_id) VALUES ($1, $2)`, [
        `u${Math.random()}@x.test`,
        v === "REAL" ? rows[0].id : v,
      ]);
    }
    return rows[0].id as string;
  };

  it("converts text to uuid", async () => {
    await seed(["REAL", "REAL"]);
    await db.query(SQL);
    const { rows } = await db.query(
      `SELECT data_type FROM information_schema.columns WHERE table_name='dealer_users' AND column_name='dealer_id'`,
    );
    expect(rows[0].data_type).toBe("uuid");
  });

  it("loses no rows and no values", async () => {
    await seed(["REAL", "REAL", null]);
    const before = await db.query(`SELECT count(*)::int n, count(dealer_id)::int w FROM dealer_users`);
    await db.query(SQL);
    const after = await db.query(`SELECT count(*)::int n, count(dealer_id)::int w FROM dealer_users`);
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it("makes the uncast join work, which is the whole point", async () => {
    await seed(["REAL"]);
    await db.query(SQL);
    await expect(
      db.query(`SELECT 1 FROM dealers d LEFT JOIN dealer_users u ON u.dealer_id = d.id`),
    ).resolves.toBeDefined();
  });

  it("REFUSES to convert when a value is not a uuid, rather than dropping it", async () => {
    /* Aborting is the correct outcome. Silently discarding a row that does not
       parse would lose somebody's account. */
    await seed(["REAL", "not-a-uuid"]);
    await expect(db.query(SQL)).rejects.toThrow(/not uuids|refusing to convert/i);

    /* The migration opens with BEGIN, so RAISE EXCEPTION leaves the connection
       in an aborted transaction and every later statement answers "current
       transaction is aborted" until it is cleared. That is Postgres behaving
       correctly and the refusal working; it just has to be unwound before the
       column can be inspected. */
    await db.query("ROLLBACK");

    const { rows } = await db.query(
      `SELECT data_type FROM information_schema.columns WHERE table_name='dealer_users' AND column_name='dealer_id'`,
    );
    // The column must be untouched after a refusal.
    expect(rows[0].data_type).toBe("text");
  });

  it("is idempotent: re-running on a converted column is a no-op", async () => {
    await seed(["REAL"]);
    await db.query(SQL);
    await expect(db.query(SQL)).resolves.toBeDefined();
  });

  it("does nothing when the column is already uuid", async () => {
    await db.query(`DROP TABLE dealer_users`);
    await db.query(`CREATE TABLE dealer_users (id serial PRIMARY KEY, dealer_id uuid)`);
    await expect(db.query(SQL)).resolves.toBeDefined();
  });
});
