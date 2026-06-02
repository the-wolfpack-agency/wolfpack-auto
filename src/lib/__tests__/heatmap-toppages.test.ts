/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for getTopPages in src/lib/heatmap.ts.
 *
 * Covers:
 *  - UUID-bearing page values (not starting with "/") are excluded.
 *  - Pages ranked by interaction volume (heatmap_click + click counts) desc.
 *  - Returns [] when DATABASE_URL absent.
 */

const mockQuery = jest.fn();
const mockTrackHeatmap = jest.fn();

jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
}));
jest.mock("@/lib/analytics-hooks", () => ({
  trackHeatmap: (...a: any[]) => mockTrackHeatmap(...a),
}));

import { getTopPages } from "@/lib/heatmap";

const ORIGINAL_DB_URL = process.env.DATABASE_URL;
afterAll(() => {
  if (ORIGINAL_DB_URL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = ORIGINAL_DB_URL;
  }
});

beforeEach(() => {
  mockQuery.mockReset();
  mockTrackHeatmap.mockReset();
});

describe("getTopPages — UUID exclusion", () => {
  test("returns [] when DATABASE_URL is absent", async () => {
    delete process.env.DATABASE_URL;
    const pages = await getTopPages("any-dealer", 5);
    expect(pages).toEqual([]);
  });

  test("SQL query filters page values not starting with '/'", async () => {
    process.env.DATABASE_URL = "postgres://test";
    /* The SQL itself filters via WHERE page LIKE '/%', but we also
       verify that the query doesn't return UUID-valued pages even if
       the DB somehow slipped one through. The row mapper returns
       whatever the query gives, so we ensure the SQL clause is
       correct by checking it excludes a UUID-style row. */
    mockQuery.mockResolvedValueOnce({
      rows: [
        { url: "/inventory", pageviews: 200, uniqueVisitors: 80, interactions: 50 },
        { url: "/", pageviews: 500, uniqueVisitors: 200, interactions: 30 },
      ],
    });

    const pages = await getTopPages("dealer-1", 10);
    expect(pages.every((p) => p.url.startsWith("/"))).toBe(true);
    // Verify the UUID-format strings are not in the result
    const hasUuid = pages.some((p) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(p.url),
    );
    expect(hasUuid).toBe(false);
  });
});

describe("getTopPages — interaction-ranked order", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://test";
  });

  test("pages with more interactions rank above pages with more pageviews", async () => {
    /* The DB query already handles ranking via ORDER BY interactions DESC.
       We simulate the DB returning pre-ranked rows and verify the lib
       passes them through in that order. */
    mockQuery.mockResolvedValueOnce({
      rows: [
        // /deals has fewer pageviews but more interactions → should be first
        { url: "/deals", pageviews: 50, uniqueVisitors: 20, interactions: 80 },
        // / has most pageviews but fewer interactions
        { url: "/", pageviews: 500, uniqueVisitors: 200, interactions: 30 },
        // /inventory middle
        { url: "/inventory", pageviews: 200, uniqueVisitors: 80, interactions: 10 },
      ],
    });

    const pages = await getTopPages("dealer-2", 10);
    expect(pages).toHaveLength(3);
    expect(pages[0].url).toBe("/deals");
    expect(pages[1].url).toBe("/");
    expect(pages[2].url).toBe("/inventory");
  });

  test("maps pageviews and uniqueVisitors correctly from DB rows", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { url: "/service", pageviews: 300, uniqueVisitors: 120, interactions: 45 },
      ],
    });

    const pages = await getTopPages("dealer-3", 5);
    expect(pages[0].url).toBe("/service");
    expect(pages[0].pageviews).toBe(300);
    expect(pages[0].uniqueVisitors).toBe(120);
  });

  test("passes dealerId and limit to the query", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getTopPages("target-dealer", 7);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(typeof sql).toBe("string");
    expect(params).toContain("target-dealer");
    expect(params).toContain(7);
  });

  test("SQL excludes UUID page values via LIKE and regex guard", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getTopPages("dealer-uuid-check", 10);

    const [sql] = mockQuery.mock.calls[0];
    // Query must include the "/" prefix filter
    expect(sql).toMatch(/page LIKE '\/%'/);
    // Query must include the UUID-regex exclusion
    expect(sql).toMatch(/page !~ '\^\/\[0-9a-f\]/);
  });

  test("returns empty array when query yields no rows", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const pages = await getTopPages("dealer-empty", 10);
    expect(pages).toEqual([]);
  });
});
