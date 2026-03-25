/**
 * Lightweight Qdrant REST client — no heavy SDK dependency.
 *
 * Uses fetch() directly against the Qdrant HTTP API.
 * Every operation is wrapped in try/catch so a missing or
 * unavailable Qdrant instance never crashes the application.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface QdrantPoint {
  id: string | number;
  vector: number[];
  payload?: Record<string, unknown>;
}

export interface QdrantSearchResult {
  id: string | number;
  version: number;
  score: number;
  payload?: Record<string, unknown>;
}

export interface QdrantFilter {
  must?: QdrantCondition[];
  should?: QdrantCondition[];
  must_not?: QdrantCondition[];
}

export interface QdrantCondition {
  key: string;
  match?: { value: string | number | boolean };
  range?: { gte?: number; lte?: number; gt?: number; lt?: number };
}

/* ------------------------------------------------------------------ */
/*  Client                                                             */
/* ------------------------------------------------------------------ */

function getBaseUrl(): string | null {
  return process.env.QDRANT_URL || null;
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = process.env.QDRANT_API_KEY;
  if (apiKey) {
    headers["api-key"] = apiKey;
  }
  return headers;
}

/**
 * Check if Qdrant is reachable.
 */
export async function healthCheck(): Promise<boolean> {
  const base = getBaseUrl();
  if (!base) return false;

  try {
    const res = await fetch(`${base}/healthz`, {
      method: "GET",
      headers: getHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Create a collection if it does not already exist.
 */
export async function createCollection(
  name: string,
  vectorSize: number,
): Promise<boolean> {
  const base = getBaseUrl();
  if (!base) return false;

  try {
    // Check if collection exists first
    const check = await fetch(`${base}/collections/${name}`, {
      method: "GET",
      headers: getHeaders(),
      signal: AbortSignal.timeout(5000),
    });

    if (check.ok) return true; // already exists

    const res = await fetch(`${base}/collections/${name}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({
        vectors: {
          size: vectorSize,
          distance: "Cosine",
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Upsert (insert or update) points into a collection.
 */
export async function upsertPoints(
  collection: string,
  points: QdrantPoint[],
): Promise<boolean> {
  const base = getBaseUrl();
  if (!base) return false;

  try {
    const res = await fetch(`${base}/collections/${collection}/points`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify({ points }),
      signal: AbortSignal.timeout(30000),
    });

    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Perform a similarity search.
 */
export async function searchPoints(
  collection: string,
  vector: number[],
  limit: number = 5,
  filter?: QdrantFilter,
): Promise<QdrantSearchResult[]> {
  const base = getBaseUrl();
  if (!base) return [];

  try {
    const body: Record<string, unknown> = {
      vector,
      limit,
      with_payload: true,
    };
    if (filter) {
      body.filter = filter;
    }

    const res = await fetch(
      `${base}/collections/${collection}/points/search`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) return [];

    const data = (await res.json()) as { result: QdrantSearchResult[] };
    return data.result ?? [];
  } catch {
    return [];
  }
}

/**
 * Delete points by their IDs.
 */
export async function deletePoints(
  collection: string,
  ids: (string | number)[],
): Promise<boolean> {
  const base = getBaseUrl();
  if (!base) return false;

  try {
    const res = await fetch(
      `${base}/collections/${collection}/points/delete`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ points: ids }),
        signal: AbortSignal.timeout(10000),
      },
    );

    return res.ok;
  } catch {
    return false;
  }
}
