/**
 * Neo4j HTTP Transaction API client.
 *
 * Executes Cypher queries against Neo4j via its HTTP endpoint.
 * Requires NEO4J_URL + NEO4J_PASSWORD to be set. Fails loudly
 * if credentials are missing — silent data loss is unacceptable.
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
  return process.env.NEO4J_URL;
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

/**
 * Execute an array of Cypher queries against Neo4j's HTTP transaction API.
 *
 * Uses the commit endpoint so each call is a single atomic transaction.
 * Returns the count of successfully executed vs failed statements.
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

  const url = `${baseUrl}/db/neo4j/tx/commit`;

  // Support both raw strings (legacy) and parameterized { statement, parameters } objects
  const statements = queries.map((q) =>
    typeof q === "string" ? { statement: q } : q,
  );

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
        Accept: "application/json",
      },
      body: JSON.stringify({ statements }),
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

/**
 * Quick health check — returns true if Neo4j responds.
 */
export async function neo4jHealthCheck(): Promise<boolean> {
  if (isDisabled() || isUnconfigured()) return false;
  try {
    const baseUrl = getBaseUrl();
    if (!baseUrl) return false;
    const res = await fetch(baseUrl, {
      method: "GET",
      headers: { Authorization: getAuthHeader() },
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
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
} {
  return {
    configured: !isUnconfigured(),
    disabled: isDisabled(),
    hasPassword: !!process.env.NEO4J_PASSWORD,
  };
}
