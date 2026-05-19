/**
 * Tests for /api/cron/prune-analytics. The route is the nightly
 * retention DELETE for analytics_events. We assert:
 *   - 401 when CRON_SECRET is set but missing/wrong
 *   - 200 + skipped when DATABASE_URL is absent (shadow mode)
 *   - 200 + deleted count when DB is available
 *   - 500 when the DELETE throws
 *   - retention-window clamp ([7, 365]) when ANALYTICS_RETENTION_DAYS
 *     is misconfigured
 */

const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

import { GET } from "@/app/api/cron/prune-analytics/route";
import { NextRequest } from "next/server";

function mkReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/cron/prune-analytics", {
    method: "GET",
    headers,
  });
}

describe("/api/cron/prune-analytics", () => {
  const origEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...origEnv };
    delete process.env.CRON_SECRET;
    delete process.env.ANALYTICS_RETENTION_DAYS;
    process.env.DATABASE_URL = "postgres://stub";
  });

  afterAll(() => {
    process.env = origEnv;
  });

  test("returns 401 when CRON_SECRET set but the request lacks it", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await GET(mkReq());
    expect(res.status).toBe(401);
  });

  test("authorizes with Bearer header", async () => {
    process.env.CRON_SECRET = "s3cret";
    mockQuery.mockResolvedValue({ rowCount: 0 });
    const res = await GET(mkReq({ authorization: "Bearer s3cret" }));
    expect(res.status).toBe(200);
  });

  test("returns skipped when DATABASE_URL unset", async () => {
    delete process.env.DATABASE_URL;
    const res = await GET(mkReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.skipped).toBe(true);
    expect(body.deleted).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 200 + deleted count on successful DELETE", async () => {
    mockQuery.mockResolvedValue({ rowCount: 42 });
    const res = await GET(mkReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.deleted).toBe(42);
    expect(body.retention_days).toBe(60); // default
    expect(mockQuery).toHaveBeenCalledTimes(1);
    /* The query must use a parameterized interval — not string-
     *  concatenation — so a manipulated ANALYTICS_RETENTION_DAYS env
     *  can't end up in raw SQL. */
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("DELETE FROM analytics_events");
    expect(sql).toContain("NOW()");
    expect(params).toEqual(["60"]);
  });

  test("returns 500 when DELETE throws", async () => {
    mockQuery.mockRejectedValue(new Error("data transfer quota exceeded"));
    const res = await GET(mkReq());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toContain("quota");
  });

  test("clamps ANALYTICS_RETENTION_DAYS to [7, 365]", async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });
    process.env.ANALYTICS_RETENTION_DAYS = "1"; // below floor
    let res = await GET(mkReq());
    let body = await res.json();
    expect(body.retention_days).toBe(7);

    process.env.ANALYTICS_RETENTION_DAYS = "9999"; // above ceiling
    res = await GET(mkReq());
    body = await res.json();
    expect(body.retention_days).toBe(365);

    process.env.ANALYTICS_RETENTION_DAYS = "30"; // valid
    res = await GET(mkReq());
    body = await res.json();
    expect(body.retention_days).toBe(30);

    process.env.ANALYTICS_RETENTION_DAYS = "not-a-number"; // garbage
    res = await GET(mkReq());
    body = await res.json();
    expect(body.retention_days).toBe(60); // falls back to default
  });
});
