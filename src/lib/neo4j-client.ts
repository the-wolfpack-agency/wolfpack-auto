/**
 * Neo4j HTTP Transaction API client.
 *
 * Executes Cypher queries against Neo4j via its HTTP endpoint.
 * Fire-and-forget safe — all errors are caught so callers never crash.
 */

const DEFAULT_NEO4J_URL = "http://localhost:7474";

function getBaseUrl(): string {
  return process.env.NEO4J_URL ?? DEFAULT_NEO4J_URL;
}

function getAuthHeader(): string {
  const user = process.env.NEO4J_USER ?? "neo4j";
  const pass = process.env.NEO4J_PASSWORD ?? "agenticqa123";
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

/**
 * Execute an array of Cypher queries against Neo4j's HTTP transaction API.
 *
 * Uses the commit endpoint so each call is a single atomic transaction.
 * Returns the count of successfully executed vs failed statements.
 */
export async function executeNeo4jQueries(
  queries: string[],
): Promise<{ executed: number; failed: number }> {
  if (queries.length === 0) return { executed: 0, failed: 0 };

  const url = `${getBaseUrl()}/db/neo4j/tx/commit`;

  const statements = queries.map((q) => ({ statement: q }));

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
    // Neo4j unavailable — silently skip
    console.warn("[neo4j-client] Neo4j unreachable, skipping graph write:", (err as Error).message);
    return { executed: 0, failed: queries.length };
  }
}

/**
 * Quick health check — returns true if Neo4j responds.
 */
export async function neo4jHealthCheck(): Promise<boolean> {
  try {
    const res = await fetch(getBaseUrl(), {
      method: "GET",
      headers: { Authorization: getAuthHeader() },
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
