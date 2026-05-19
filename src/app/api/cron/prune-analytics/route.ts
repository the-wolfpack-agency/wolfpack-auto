/**
 * GET /api/cron/prune-analytics — nightly retention DELETE for the
 * analytics_events table.
 *
 * The table grows unbounded otherwise; combined with the EventCollector
 * (every 5-30s) and the COUNT(*) aggregations on multiple admin routes,
 * an unpruned table is the primary cause of Neon data-transfer-quota
 * exhaustion. See scripts/scan-db-burners.sh.
 *
 * Retention window: 60 days. Configurable via ANALYTICS_RETENTION_DAYS
 * env var (default 60). Bumping to a smaller window is fine; the cron
 * is additive — it never inserts.
 *
 * Schedule: 00:30 UTC nightly via vercel.json `crons`.
 *
 * Auth: same Bearer/CRON_SECRET pattern every other cron uses.
 *
 * Output: { success, deleted, retention_days, duration_ms }.
 *
 * Safety:
 *   - Uses a single bounded DELETE statement with a deterministic
 *     cutoff so we never delete recent rows.
 *   - The DELETE itself is wrapped in a transaction-less call (DELETE
 *     is atomic per-statement; rollback adds no value here).
 *   - If DATABASE_URL is unset (preview/shadow), the route returns 200
 *     with `skipped: true`. Same pattern as the other crons.
 */

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

const DEFAULT_RETENTION_DAYS = 60;
const MIN_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 365;

function readRetentionDays(): number {
  const raw = process.env.ANALYTICS_RETENTION_DAYS;
  if (!raw) return DEFAULT_RETENTION_DAYS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_RETENTION_DAYS;
  /* Clamp to [7, 365] so a misconfigured env var can't turn the cron
   *  into a destructive scan-everything DELETE. */
  return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, parsed));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  /* Auth — Bearer header or x-cron-secret, matching sibling crons. */
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    const cronHeader = request.headers.get("x-cron-secret");
    const provided = authHeader?.replace("Bearer ", "") ?? cronHeader;
    if (provided !== cronSecret) {
      return NextResponse.json(
        { error: "Unauthorized — invalid cron secret" },
        { status: 401 },
      );
    }
  }

  const startedAt = Date.now();
  const retentionDays = readRetentionDays();

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "DATABASE_URL not configured (shadow mode)",
      retention_days: retentionDays,
      deleted: 0,
      duration_ms: Date.now() - startedAt,
    });
  }

  try {
    const result = await pool.query(
      `DELETE FROM analytics_events
        WHERE timestamp < NOW() - ($1 || ' days')::INTERVAL`,
      [String(retentionDays)],
    );
    const deleted = result.rowCount ?? 0;
    return NextResponse.json({
      success: true,
      deleted,
      retention_days: retentionDays,
      duration_ms: Date.now() - startedAt,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        error: message.slice(0, 500),
        retention_days: retentionDays,
        duration_ms: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
