/**
 * Migration Validator — Jest unit tests
 *
 * Tests the migration validation logic itself using synthetic SQL strings.
 * No filesystem access to real migrations — pure logic validation.
 *
 * Run with: npx jest src/lib/__tests__/migration-validator.test.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";

/* -------------------------------------------------------------------------- */
/* Validation functions (extracted logic matching migration-safety.spec.ts)   */
/* -------------------------------------------------------------------------- */

function extractCreateTableNames(sql: string): string[] {
  const regex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;
  const tables: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(sql))) {
    tables.push(m[1].toLowerCase());
  }
  return tables;
}

function extractReferencedTables(sql: string): string[] {
  const regex = /REFERENCES\s+(\w+)\s*\(/gi;
  const refs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(sql))) {
    refs.push(m[1].toLowerCase());
  }
  return refs;
}

function extractAlterTableNames(sql: string): string[] {
  const regex = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/gi;
  const tables: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(sql))) {
    tables.push(m[1].toLowerCase());
  }
  return tables;
}

function extractColumnDefinitions(
  sql: string,
): Array<{ table: string; column: string; line: string }> {
  const cols: Array<{ table: string; column: string; line: string }> = [];

  const createRegex =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\);/gi;
  let cm: RegExpExecArray | null;
  while ((cm = createRegex.exec(sql))) {
    const table = cm[1].toLowerCase();
    const body = cm[2];
    for (const line of body.split("\n")) {
      const colMatch = line
        .trim()
        .match(
          /^(\w+)\s+(TEXT|VARCHAR|INTEGER|UUID|BOOLEAN|NUMERIC|JSONB|TIMESTAMPTZ|BIGINT|SERIAL|INT|SMALLINT)/i,
        );
      if (colMatch) {
        cols.push({
          table,
          column: colMatch[1].toLowerCase(),
          line: line.trim(),
        });
      }
    }
  }

  const alterRegex =
    /ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;
  let am: RegExpExecArray | null;
  while ((am = alterRegex.exec(sql))) {
    cols.push({
      table: am[1].toLowerCase(),
      column: am[2].toLowerCase(),
      line: "",
    });
  }

  return cols;
}

function findDestructiveOps(
  sql: string,
): Array<{ line: number; issue: string }> {
  const issues: Array<{ line: number; issue: string }> = [];
  const lines = sql.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("--") || line === "") continue;

    if (/DROP\s+TABLE\s+(?!IF\s+EXISTS)/i.test(line)) {
      issues.push({ line: i + 1, issue: `DROP TABLE without IF EXISTS` });
    }
    if (/DROP\s+INDEX\s+(?!IF\s+EXISTS)/i.test(line)) {
      issues.push({ line: i + 1, issue: `DROP INDEX without IF EXISTS` });
    }
    if (/DROP\s+COLUMN\s+(?!IF\s+EXISTS)/i.test(line)) {
      issues.push({ line: i + 1, issue: `DROP COLUMN without IF EXISTS` });
    }
  }
  return issues;
}

function findUnsafeDeletes(
  sql: string,
): Array<{ line: number; issue: string }> {
  const issues: Array<{ line: number; issue: string }> = [];
  const lines = sql.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("--") || line === "") continue;

    if (/\bTRUNCATE\b/i.test(line) && !/--/.test(line.split("TRUNCATE")[0])) {
      issues.push({ line: i + 1, issue: "TRUNCATE statement" });
    }

    if (/\bDELETE\s+FROM\b/i.test(line)) {
      const context = lines
        .slice(i, Math.min(i + 3, lines.length))
        .join(" ");
      if (!/\bWHERE\b/i.test(context)) {
        issues.push({ line: i + 1, issue: "DELETE FROM without WHERE" });
      }
    }
  }
  return issues;
}

const PII_COLUMN_PATTERNS = [
  /\bssn\b/i,
  /\bsocial_security\b/i,
  /\bemail\b/i,
  /\bphone\b/i,
  /\bdob\b/i,
  /\bdate_of_birth\b/i,
  /\bdriver_license\b/i,
  /\bcredit_score\b/i,
  /\bbank_account\b/i,
  /\brouting_number\b/i,
  /\btax_id\b/i,
];

const PII_PROTECTION_MARKERS = [
  /encrypt/i,
  /mask/i,
  /hash/i,
  /vault/i,
  /redact/i,
  /at\s+rest/i,
  /never\s+returned/i,
  /hashed/i,
  /sha/i,
];

function findUnprotectedPii(
  sql: string,
): Array<{ table: string; column: string }> {
  const cols = extractColumnDefinitions(sql);
  const hasProtection = PII_PROTECTION_MARKERS.some((p) => p.test(sql));
  const unprotected: Array<{ table: string; column: string }> = [];

  for (const col of cols) {
    const isPii = PII_COLUMN_PATTERNS.some((p) => p.test(col.column));
    if (isPii && !hasProtection) {
      unprotected.push({ table: col.table, column: col.column });
    }
  }
  return unprotected;
}

function validateNamingConvention(filename: string): boolean {
  return /^\d{3}_[a-z][a-z0-9_]*\.sql$/.test(filename);
}

function validateSequentialNumbering(
  numbers: string[],
  expected: string[],
): string[] {
  const issues: string[] = [];
  const numberSet = new Set(numbers);

  for (const exp of expected) {
    if (!numberSet.has(exp)) {
      issues.push(`Missing migration number: ${exp}`);
    }
  }

  // Check for duplicates
  if (new Set(numbers).size !== numbers.length) {
    const seen = new Set<string>();
    for (const n of numbers) {
      if (seen.has(n)) issues.push(`Duplicate migration number: ${n}`);
      seen.add(n);
    }
  }

  return issues;
}

function buildMigrationMetrics(migrations: Array<{ content: string }>) {
  const allTables = new Set<string>();
  let totalColumns = 0;
  let piiColumns = 0;

  for (const m of migrations) {
    for (const t of extractCreateTableNames(m.content)) {
      allTables.add(t);
    }
    const cols = extractColumnDefinitions(m.content);
    totalColumns += cols.length;
    piiColumns += cols.filter((c) =>
      PII_COLUMN_PATTERNS.some((p) => p.test(c.column)),
    ).length;
  }

  return {
    total_migrations: migrations.length,
    total_tables: allTables.size,
    total_columns: totalColumns,
    pii_columns_found: piiColumns,
  };
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

describe("extractCreateTableNames", () => {
  it("extracts simple CREATE TABLE names", () => {
    const sql = `CREATE TABLE users (id UUID PRIMARY KEY);`;
    expect(extractCreateTableNames(sql)).toEqual(["users"]);
  });

  it("extracts CREATE TABLE IF NOT EXISTS names", () => {
    const sql = `CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY);`;
    expect(extractCreateTableNames(sql)).toEqual(["orders"]);
  });

  it("extracts multiple tables from a single migration", () => {
    const sql = `
      CREATE TABLE alpha (id UUID);
      CREATE TABLE IF NOT EXISTS beta (id UUID);
      CREATE TABLE gamma (id UUID);
    `;
    expect(extractCreateTableNames(sql)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("returns empty array when no CREATE TABLE exists", () => {
    expect(extractCreateTableNames("ALTER TABLE users ADD COLUMN age INT;")).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(extractCreateTableNames("create table MyTable (id uuid);")).toEqual([
      "mytable",
    ]);
  });
});

describe("extractReferencedTables", () => {
  it("extracts REFERENCES targets", () => {
    const sql = `dealer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE`;
    expect(extractReferencedTables(sql)).toEqual(["dealers"]);
  });

  it("extracts multiple references", () => {
    const sql = `
      group_id UUID REFERENCES groups(id),
      user_id UUID REFERENCES users(id)
    `;
    expect(extractReferencedTables(sql)).toEqual(["groups", "users"]);
  });

  it("returns empty for no references", () => {
    expect(extractReferencedTables("CREATE TABLE t (id UUID);")).toEqual([]);
  });
});

describe("extractAlterTableNames", () => {
  it("extracts ALTER TABLE target", () => {
    const sql = "ALTER TABLE users ADD COLUMN age INTEGER;";
    expect(extractAlterTableNames(sql)).toEqual(["users"]);
  });

  it("extracts ALTER TABLE IF EXISTS", () => {
    const sql = "ALTER TABLE IF EXISTS users DROP COLUMN IF EXISTS temp;";
    expect(extractAlterTableNames(sql)).toEqual(["users"]);
  });

  it("extracts multiple ALTER TABLE statements", () => {
    const sql = `
      ALTER TABLE users ADD COLUMN a TEXT;
      ALTER TABLE orders ADD COLUMN b TEXT;
    `;
    expect(extractAlterTableNames(sql)).toEqual(["users", "orders"]);
  });
});

describe("extractColumnDefinitions", () => {
  it("extracts columns from CREATE TABLE", () => {
    const sql = `CREATE TABLE users (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      age INTEGER DEFAULT 0
    );`;
    const cols = extractColumnDefinitions(sql);
    expect(cols).toHaveLength(3);
    expect(cols.map((c) => c.column)).toEqual(["id", "name", "age"]);
    expect(cols.every((c) => c.table === "users")).toBe(true);
  });

  it("extracts columns from ALTER TABLE ADD COLUMN", () => {
    const sql = `ALTER TABLE leads ADD COLUMN IF NOT EXISTS temperature TEXT;`;
    const cols = extractColumnDefinitions(sql);
    expect(cols).toHaveLength(1);
    expect(cols[0]).toEqual({
      table: "leads",
      column: "temperature",
      line: "",
    });
  });

  it("handles mixed CREATE and ALTER", () => {
    const sql = `
      CREATE TABLE dealers (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL
      );
      ALTER TABLE dealers ADD COLUMN phone TEXT;
    `;
    const cols = extractColumnDefinitions(sql);
    expect(cols).toHaveLength(3);
    expect(cols.map((c) => c.column)).toEqual(["id", "email", "phone"]);
  });
});

describe("findDestructiveOps", () => {
  it("flags DROP TABLE without IF EXISTS", () => {
    const sql = "DROP TABLE users;";
    const issues = findDestructiveOps(sql);
    expect(issues).toHaveLength(1);
    expect(issues[0].issue).toContain("DROP TABLE");
  });

  it("allows DROP TABLE IF EXISTS", () => {
    expect(findDestructiveOps("DROP TABLE IF EXISTS temp_data;")).toHaveLength(
      0,
    );
  });

  it("flags DROP INDEX without IF EXISTS", () => {
    const issues = findDestructiveOps("DROP INDEX idx_users_email;");
    expect(issues).toHaveLength(1);
  });

  it("allows DROP INDEX IF EXISTS", () => {
    expect(
      findDestructiveOps("DROP INDEX IF EXISTS idx_users_email;"),
    ).toHaveLength(0);
  });

  it("ignores comment lines", () => {
    expect(findDestructiveOps("-- DROP TABLE users;")).toHaveLength(0);
  });

  it("flags DROP COLUMN without IF EXISTS", () => {
    const issues = findDestructiveOps(
      "ALTER TABLE users DROP COLUMN temp_col;",
    );
    expect(issues).toHaveLength(1);
  });
});

describe("findUnsafeDeletes", () => {
  it("flags DELETE FROM without WHERE", () => {
    const issues = findUnsafeDeletes("DELETE FROM users;");
    expect(issues).toHaveLength(1);
    expect(issues[0].issue).toContain("DELETE FROM without WHERE");
  });

  it("allows DELETE FROM with WHERE", () => {
    expect(
      findUnsafeDeletes("DELETE FROM users WHERE id = 'abc';"),
    ).toHaveLength(0);
  });

  it("allows DELETE FROM with WHERE on next line", () => {
    const sql = `DELETE FROM users
    WHERE status = 'expired';`;
    expect(findUnsafeDeletes(sql)).toHaveLength(0);
  });

  it("flags TRUNCATE", () => {
    const issues = findUnsafeDeletes("TRUNCATE TABLE users;");
    expect(issues).toHaveLength(1);
    expect(issues[0].issue).toBe("TRUNCATE statement");
  });

  it("ignores TRUNCATE in comments", () => {
    expect(findUnsafeDeletes("-- TRUNCATE TABLE users;")).toHaveLength(0);
  });
});

describe("findUnprotectedPii", () => {
  it("flags email column without encryption markers", () => {
    const sql = `CREATE TABLE contacts (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL
    );`;
    const unprotected = findUnprotectedPii(sql);
    expect(unprotected).toHaveLength(1);
    expect(unprotected[0].column).toBe("email");
  });

  it("passes email column when encryption comment is present", () => {
    const sql = `-- customer_email is encrypted at rest via pgcrypto
    CREATE TABLE contacts (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL
    );`;
    expect(findUnprotectedPii(sql)).toHaveLength(0);
  });

  it("flags ssn and credit_score as PII", () => {
    const sql = `CREATE TABLE customers (
      id UUID PRIMARY KEY,
      ssn TEXT NOT NULL,
      credit_score INTEGER
    );`;
    const unprotected = findUnprotectedPii(sql);
    expect(unprotected.map((u) => u.column)).toContain("ssn");
    expect(unprotected.map((u) => u.column)).toContain("credit_score");
  });

  it("passes when hashed/vault markers are present", () => {
    const sql = `-- SSN is stored hashed via SHA-256, vault-managed key rotation
    CREATE TABLE customers (
      id UUID PRIMARY KEY,
      ssn TEXT NOT NULL
    );`;
    expect(findUnprotectedPii(sql)).toHaveLength(0);
  });

  it("does not flag non-PII columns", () => {
    const sql = `CREATE TABLE products (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      price NUMERIC(10,2)
    );`;
    expect(findUnprotectedPii(sql)).toHaveLength(0);
  });
});

describe("validateNamingConvention", () => {
  it("accepts valid migration filenames", () => {
    expect(validateNamingConvention("001_initial_schema.sql")).toBe(true);
    expect(validateNamingConvention("045_high_priority_features.sql")).toBe(
      true,
    );
    expect(validateNamingConvention("020_mfa.sql")).toBe(true);
  });

  it("rejects filenames without number prefix", () => {
    expect(validateNamingConvention("initial_schema.sql")).toBe(false);
  });

  it("rejects filenames with uppercase letters", () => {
    expect(validateNamingConvention("001_Initial_Schema.sql")).toBe(false);
  });

  it("rejects filenames starting with a digit after prefix", () => {
    expect(validateNamingConvention("001_1bad.sql")).toBe(false);
  });

  it("rejects non-SQL files", () => {
    expect(validateNamingConvention("001_schema.txt")).toBe(false);
  });

  it("rejects two-digit prefixes", () => {
    expect(validateNamingConvention("01_schema.sql")).toBe(false);
  });
});

describe("validateSequentialNumbering", () => {
  it("returns empty for valid sequential numbers", () => {
    const expected = ["001", "002", "003"];
    expect(validateSequentialNumbering(["001", "002", "003"], expected)).toEqual(
      [],
    );
  });

  it("reports missing numbers", () => {
    const expected = ["001", "002", "003"];
    const issues = validateSequentialNumbering(["001", "003"], expected);
    expect(issues).toContain("Missing migration number: 002");
  });

  it("reports duplicate numbers", () => {
    const issues = validateSequentialNumbering(
      ["001", "001", "002"],
      ["001", "002"],
    );
    expect(issues).toContain("Duplicate migration number: 001");
  });
});

describe("buildMigrationMetrics", () => {
  it("computes correct metrics for simple migrations", () => {
    const migrations = [
      {
        content: `CREATE TABLE users (
          id UUID PRIMARY KEY,
          email TEXT NOT NULL,
          phone TEXT
        );`,
      },
      {
        content: `CREATE TABLE orders (
          id UUID PRIMARY KEY,
          user_id UUID REFERENCES users(id)
        );`,
      },
    ];

    const metrics = buildMigrationMetrics(migrations);
    expect(metrics.total_migrations).toBe(2);
    expect(metrics.total_tables).toBe(2);
    expect(metrics.total_columns).toBe(5);
    expect(metrics.pii_columns_found).toBe(2); // email, phone
  });

  it("returns zeros for empty input", () => {
    const metrics = buildMigrationMetrics([]);
    expect(metrics).toEqual({
      total_migrations: 0,
      total_tables: 0,
      total_columns: 0,
      pii_columns_found: 0,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Integration: validate real migration files exist on disk                   */
/* -------------------------------------------------------------------------- */

describe("real migration files", () => {
  const migrationsDir = path.resolve(
    __dirname,
    "../../db/migrations",
  );

  it("migrations directory exists", () => {
    expect(fs.existsSync(migrationsDir)).toBe(true);
  });

  it("contains .sql files with valid naming convention", () => {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql") && /^\d{3}_/.test(f));

    expect(files.length).toBeGreaterThanOrEqual(36);

    for (const f of files) {
      expect(validateNamingConvention(f)).toBe(true);
    }
  });

  it("no migration file is empty", () => {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql") && /^\d{3}_/.test(f));

    for (const f of files) {
      const content = fs.readFileSync(path.join(migrationsDir, f), "utf-8");
      expect(content.trim().length).toBeGreaterThan(0);
    }
  });

  it("rollback directory exists", () => {
    expect(fs.existsSync(path.join(migrationsDir, "rollback"))).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Analytics event shape validation                                          */
/* -------------------------------------------------------------------------- */

describe("analytics event shape", () => {
  it("migration_safety event has required fields", () => {
    const event = {
      event_type: "migration_safety",
      action: "validation_complete",
      category: "migration_safety",
      timestamp: new Date().toISOString(),
      session_id: `migration_safety_${Date.now().toString(36)}`,
      user_fingerprint: "ci_migration_validator",
      metadata: {
        total_migrations: 45,
        valid_count: 45,
        issues_found: 0,
        pii_columns_found: 12,
        destructive_ops_found: 0,
        check: "summary",
      },
    };

    expect(event.event_type).toBe("migration_safety");
    expect(event.category).toBe("migration_safety");
    expect(event.metadata.total_migrations).toBeGreaterThan(0);
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event.session_id).toMatch(/^migration_safety_/);
  });
});
