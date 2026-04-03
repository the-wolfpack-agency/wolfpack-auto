/**
 * Neo4j client — supports both Aura (Query API v2) and self-hosted (HTTP tx).
 *
 * Executes Cypher queries against Neo4j via HTTP.
 * Requires NEO4J_URL + NEO4J_PASSWORD to be set. Fails loudly
 * if credentials are missing — silent data loss is unacceptable.
 *
 * Auto-detects Aura (*.databases.neo4j.io) vs self-hosted and uses
 * the appropriate API endpoint.
 */

/** Returns true when Neo4j is explicitly disabled (NEO4J_URL set to empty). */
function isDisabled(): boolean {
  return process.env.NEO4J_URL === "";
}

/** Returns true when Neo4j is not configured (no URL set). */
function isUnconfigured(): boolean {
  return !process.env.NEO4J_URL;
}

function getBaseUrl(): string | null {
  if (!process.env.NEO4J_URL) return null;
  // Normalize: neo4j+s:// → https://, bolt+s:// → https://
  let url = process.env.NEO4J_URL;
  if (url.startsWith("neo4j+s://")) url = url.replace("neo4j+s://", "https://");
  if (url.startsWith("neo4j://")) url = url.replace("neo4j://", "http://");
  if (url.startsWith("bolt+s://")) url = url.replace("bolt+s://", "https://");
  if (url.startsWith("bolt://")) url = url.replace("bolt://", "http://");
  return url;
}

/** Returns true if the Neo4j URL points to Aura (uses Query API v2). */
function isAura(): boolean {
  const url = process.env.NEO4J_URL ?? "";
  return url.includes(".databases.neo4j.io");
}

function getAuthHeader(): string {
  const user = process.env.NEO4J_USER ?? "neo4j";
  const pass = process.env.NEO4J_PASSWORD;
  if (!pass) {
    console.error(
      "[neo4j-client] NEO4J_PASSWORD not set — refusing to use hardcoded defaults. " +
        "Set NEO4J_PASSWORD in your environment.",
    );
    throw new Error("NEO4J_PASSWORD is required");
  }
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

/* ------------------------------------------------------------------ */
/*  Aura Query API v2                                                   */
/* ------------------------------------------------------------------ */

async function executeViaQueryApi(
  baseUrl: string,
  queries: Array<{ statement: string; parameters?: Record<string, unknown> }>,
): Promise<{ executed: number; failed: number }> {
  let executed = 0;
  let failed = 0;

  // Query API v2 executes one statement at a time
  for (const q of queries) {
    try {
      const res = await fetch(`${baseUrl}/db/neo4j/query/v2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: getAuthHeader(),
          Accept: "application/json",
        },
        body: JSON.stringify({
          statement: q.statement,
          parameters: q.parameters ?? {},
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (res.status === 202 || res.ok) {
        const body = await res.json();
        if (body.errors && body.errors.length > 0) {
          console.warn("[neo4j-client] Query error:", body.errors[0]);
          failed++;
        } else {
          executed++;
        }
      } else {
        const errText = await res.text().catch(() => "(no body)");
        console.error(`[neo4j-client] HTTP ${res.status}:`, errText);
        failed++;
      }
    } catch (err) {
      console.error("[neo4j-client] Query failed:", (err as Error).message);
      failed++;
    }
  }

  return { executed, failed };
}

/* ------------------------------------------------------------------ */
/*  Self-hosted HTTP Transaction API                                    */
/* ------------------------------------------------------------------ */

async function executeViaTxApi(
  baseUrl: string,
  queries: Array<{ statement: string; parameters?: Record<string, unknown> }>,
): Promise<{ executed: number; failed: number }> {
  const url = `${baseUrl}/db/neo4j/tx/commit`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
        Accept: "application/json",
      },
      body: JSON.stringify({ statements: queries }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(
        `[neo4j-client] HTTP ${res.status} from Neo4j:`,
        await res.text().catch(() => "(no body)"),
      );
      return { executed: 0, failed: queries.length };
    }

    const body = await res.json();
    const errors = body.errors ?? [];
    const failed = errors.length;
    const executed = queries.length - failed;

    if (failed > 0) {
      console.warn(
        `[neo4j-client] ${failed}/${queries.length} statements failed:`,
        errors.slice(0, 3),
      );
    }

    return { executed, failed };
  } catch (err) {
    console.error(
      "[neo4j-client] Neo4j unreachable — graph write FAILED:",
      (err as Error).message,
    );
    return { executed: 0, failed: queries.length };
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Execute an array of Cypher queries against Neo4j.
 * Auto-detects Aura (Query API v2) vs self-hosted (HTTP tx).
 */
export async function executeNeo4jQueries(
  queries: Array<string | { statement: string; parameters?: Record<string, unknown> }>,
): Promise<{ executed: number; failed: number }> {
  if (queries.length === 0 || isDisabled()) return { executed: 0, failed: 0 };

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    console.warn(
      `[neo4j-client] NEO4J_URL not set — ${queries.length} graph queries will NOT be executed. Journey data is being lost.`,
    );
    return { executed: 0, failed: queries.length };
  }

  // Normalize all queries to parameterized format
  const normalized = queries.map((q) =>
    typeof q === "string" ? { statement: q } : q,
  );

  if (isAura()) {
    return executeViaQueryApi(baseUrl, normalized);
  } else {
    return executeViaTxApi(baseUrl, normalized);
  }
}

/**
 * Quick health check — returns true if Neo4j responds.
 */
export async function neo4jHealthCheck(): Promise<boolean> {
  if (isDisabled() || isUnconfigured()) return false;
  try {
    const baseUrl = getBaseUrl();
    if (!baseUrl) return false;

    if (isAura()) {
      // Aura: test via Query API
      const res = await fetch(`${baseUrl}/db/neo4j/query/v2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: getAuthHeader(),
          Accept: "application/json",
        },
        body: JSON.stringify({ statement: "RETURN 1" }),
        signal: AbortSignal.timeout(5_000),
      });
      return res.status === 202 || res.ok;
    } else {
      // Self-hosted: test via root endpoint
      const res = await fetch(baseUrl, {
        method: "GET",
        headers: { Authorization: getAuthHeader() },
        signal: AbortSignal.timeout(3_000),
      });
      return res.ok;
    }
  } catch {
    return false;
  }
}

/**
 * Returns configuration status for diagnostics.
 */
export function getNeo4jConfigStatus(): {
  configured: boolean;
  disabled: boolean;
  hasPassword: boolean;
  isAura: boolean;
} {
  return {
    configured: !isUnconfigured(),
    disabled: isDisabled(),
    hasPassword: !!process.env.NEO4J_PASSWORD,
    isAura: isAura(),
  };
}
