import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { auditLog } from "@/lib/audit-log";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackSystem } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface LeaderboardEntry {
  employee: string;
  points: number;
  badges: string[];
  rank: number;
}

export interface RecentAward {
  employee: string;
  award: string;
  points: number;
  date: string;
}

/* -------------------------------------------------------------------------- */
/* Shadow / mock data                                                          */
/* -------------------------------------------------------------------------- */

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { employee: "Sarah Chen", points: 820, badges: ["gold", "top-closer"], rank: 1 },
  { employee: "Mike Chen", points: 610, badges: ["silver", "leader"], rank: 2 },
  { employee: "Priya Patel", points: 445, badges: ["silver"], rank: 3 },
  { employee: "James Kowalski", points: 290, badges: ["bronze"], rank: 4 },
  { employee: "Tom Bradley", points: 175, badges: ["bronze"], rank: 5 },
  { employee: "Lauren Kim", points: 80, badges: [], rank: 6 },
];

const MOCK_RECENT_AWARDS: RecentAward[] = [
  { employee: "Sarah Chen", award: "Top Closer — March", points: 150, date: "2026-03-25T10:00:00Z" },
  { employee: "Priya Patel", award: "Customer Satisfaction Star", points: 75, date: "2026-03-24T14:00:00Z" },
  { employee: "Mike Chen", award: "Team Leadership Award", points: 100, date: "2026-03-22T09:00:00Z" },
  { employee: "James Kowalski", award: "Fastest Response Time", points: 50, date: "2026-03-20T16:00:00Z" },
];

const MOCK_TOTAL_POINTS = 2420;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function dbAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/* -------------------------------------------------------------------------- */
/* GET /api/admin/rewards                                                      */
/* -------------------------------------------------------------------------- */

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  if (dbAvailable()) {
    try {
      const { query } = await import("@/lib/db");

      const [leaderboardResult, recentResult, totalResult] = await Promise.all([
        query(
          `SELECT employee_name AS employee,
                  SUM(points) AS points,
                  ARRAY_AGG(DISTINCT badge) FILTER (WHERE badge IS NOT NULL) AS badges,
                  RANK() OVER (ORDER BY SUM(points) DESC) AS rank
           FROM employee_rewards
           WHERE dealer_id = $1
           GROUP BY employee_name
           ORDER BY points DESC
           LIMIT 20`,
          [dealerId],
        ),
        query(
          `SELECT employee_name AS employee, reason AS award, points, badge, created_at AS date
           FROM employee_rewards
           WHERE dealer_id = $1
           ORDER BY created_at DESC
           LIMIT 10`,
          [dealerId],
        ),
        query<{ total: string }>(
          `SELECT COALESCE(SUM(points), 0)::text AS total FROM employee_rewards WHERE dealer_id = $1`,
          [dealerId],
        ),
      ]);

      return NextResponse.json({
        leaderboard: leaderboardResult.rows,
        recent_awards: recentResult.rows,
        total_points_issued: parseInt((totalResult.rows as any[])[0]?.total ?? "0", 10),
      });
    } catch (err) {
      console.error("[api/admin/rewards] DB error, falling back:", err);
    }
  }

  return NextResponse.json({
    leaderboard: MOCK_LEADERBOARD,
    recent_awards: MOCK_RECENT_AWARDS,
    total_points_issued: MOCK_TOTAL_POINTS,
  });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/rewards                                                     */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);
  const { user } = authResult;

  let body: {
    employee_name: string;
    points: number;
    reason: string;
    badge?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.employee_name || !body.points || !body.reason) {
    return NextResponse.json(
      { error: "employee_name, points, and reason are required" },
      { status: 400 },
    );
  }

  const points = Number(body.points);
  if (isNaN(points) || points <= 0 || points > 10000) {
    return NextResponse.json({ error: "points must be a positive number up to 10000" }, { status: 400 });
  }

  const newId = `reward-${Date.now()}`;
  const now = new Date().toISOString();

  if (dbAvailable()) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `INSERT INTO employee_rewards (id, dealer_id, employee_name, points, reason, badge, awarded_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          newId,
          dealerId,
          body.employee_name,
          points,
          body.reason,
          body.badge ?? null,
          user.name ?? user.email,
          now,
        ],
      );

      void auditLog(
        "reward.issue",
        { reward_id: newId, employee_name: body.employee_name, points, badge: body.badge },
        user.id,
        user.dealer_id,
      );

      try { trackSystem("system.reward_given", authResult?.user?.dealer_id ?? "system", { action: "reward_issued", employee_name: body.employee_name, points }); } catch {}
      return NextResponse.json({ success: true, id: newId });
    } catch (err) {
      console.error("[api/admin/rewards] POST DB error:", err);
    }
  }

  // Shadow mode
  void auditLog(
    "reward.issue",
    { reward_id: newId, employee_name: body.employee_name, points, badge: body.badge },
    user.id,
    user.dealer_id,
  );

  try { trackSystem("system.reward_given", authResult?.user?.dealer_id ?? "system", { action: "reward_issued", employee_name: body.employee_name, points }); } catch {}
  return NextResponse.json({ success: true, id: newId, mode: "shadow" });
}
