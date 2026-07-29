"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/safe-fetch";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface LeaderboardEntry {
  employee: string;
  points: number;
  badges: string[];
  rank: number;
}

interface RecentAward {
  employee: string;
  award: string;
  points: number;
  date: string;
}

interface RewardsData {
  leaderboard: LeaderboardEntry[];
  recent_awards: RecentAward[];
  total_points_issued: number;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function tierLabel(points: number): { label: string; className: string } {
  if (points > 500) return { label: "Gold", className: "bg-yellow-100 text-yellow-800 ring-yellow-400/40" };
  if (points > 200) return { label: "Silver", className: "bg-gray-100 text-gray-700 ring-gray-400/40" };
  if (points > 100) return { label: "Bronze", className: "bg-orange-100 text-orange-700 ring-orange-400/40" };
  return { label: "Rising", className: "bg-brand-50 text-brand-700 ring-brand-400/30" };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-xs font-bold text-white shadow">
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-gray-700 shadow">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-300 text-xs font-bold text-white shadow">
        3
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">
      {rank}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Main page                                                                  */
/* -------------------------------------------------------------------------- */

export default function RewardsPage() {
  const [data, setData] = useState<RewardsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Award form
  const [awardEmployee, setAwardEmployee] = useState("");
  const [awardPoints, setAwardPoints] = useState("50");
  const [awardReason, setAwardReason] = useState("");
  const [awardBadge, setAwardBadge] = useState("");
  const [awarding, setAwarding] = useState(false);
  const [awardSuccess, setAwardSuccess] = useState("");
  const [awardError, setAwardError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const json = await fetchJson<RewardsData>("/api/admin/rewards");
      setData(json);
    } catch {
      setError("Failed to load rewards data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleAward(e: React.FormEvent) {
    e.preventDefault();
    setAwarding(true);
    setAwardSuccess("");
    setAwardError("");
    try {
      const res = await fetch("/api/admin/rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_name: awardEmployee,
          points: Number(awardPoints),
          reason: awardReason,
          badge: awardBadge || undefined,
        }),
      });
      if (res.ok) {
        setAwardEmployee("");
        setAwardPoints("50");
        setAwardReason("");
        setAwardBadge("");
        setAwardSuccess("Points awarded successfully!");
        void loadData();
      } else {
        const errData = await res.json().catch(() => ({}));
        setAwardError((errData as { error?: string }).error ?? "Failed to award points.");
      }
    } catch {
      setAwardError("Network error. Please try again.");
    } finally {
      setAwarding(false);
    }
  }

  const activeEmployees = data?.leaderboard.length ?? 0;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const awardsThisMonth =
    data?.recent_awards.filter((a) => new Date(a.date) >= monthStart).length ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Rewards &amp; Recognition</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track performance points and celebrate your top performers.
        </p>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Total Points Issued</p>
          <p className="mt-1 text-3xl font-bold text-yellow-600">
            {(data?.total_points_issued ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Active Employees</p>
          <p className="mt-1 text-3xl font-bold text-brand-600">{activeEmployees}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm col-span-2 sm:col-span-1">
          <p className="text-sm font-medium text-gray-500">Awards This Month</p>
          <p className="mt-1 text-3xl font-bold text-green-600">{awardsThisMonth}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: leaderboard + recent awards */}
        <div className="lg:col-span-2 space-y-6">
          {/* Leaderboard */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-800">Leaderboard</h2>
            </div>
            {loading ? (
              <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
            ) : !data?.leaderboard.length ? (
              <div className="py-12 text-center text-sm text-gray-400">
                No points issued yet.
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {data.leaderboard.map((entry) => {
                  const tier = tierLabel(entry.points);
                  return (
                    <li
                      key={entry.employee}
                      className={`flex items-center gap-4 px-5 py-3 ${
                        entry.rank === 1 ? "bg-yellow-50/50" : ""
                      }`}
                    >
                      <RankMedal rank={entry.rank} />

                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">
                          {entry.employee}
                        </p>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tier.className}`}
                          >
                            {tier.label}
                          </span>
                          {entry.badges
                            .filter((b) => !["gold", "silver", "bronze"].includes(b))
                            .map((badge) => (
                              <span
                                key={badge}
                                className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200/40"
                              >
                                {badge}
                              </span>
                            ))}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-gray-900">
                          {entry.points.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-400">pts</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Recent awards */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-800">Recent Awards</h2>
            </div>
            {loading ? (
              <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
            ) : !data?.recent_awards.length ? (
              <div className="py-8 text-center text-sm text-gray-400">No awards yet.</div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {data.recent_awards.map((award, i) => (
                  <li key={i} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-4 w-4 text-green-600"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900">{award.employee}</p>
                      <p className="text-sm text-gray-500 truncate">{award.award}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-green-700">+{award.points} pts</p>
                      <p className="text-xs text-gray-400">{formatDate(award.date)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: award form */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm self-start">
          <h2 className="mb-1 text-base font-semibold text-gray-800">Grant Points</h2>
          <p className="mb-4 text-xs text-gray-500">
            Award points to recognize outstanding contributions.
          </p>

          {awardSuccess && (
            <div className="mb-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
              {awardSuccess}
            </div>
          )}
          {awardError && (
            <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {awardError}
            </div>
          )}

          <form onSubmit={handleAward} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Employee Name *
              </label>
              <input
                required
                value={awardEmployee}
                onChange={(e) => setAwardEmployee(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="e.g. Sarah Chen"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Points *
              </label>
              <input
                required
                type="number"
                min={1}
                max={10000}
                value={awardPoints}
                onChange={(e) => setAwardPoints(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                Gold &gt;500 total · Silver &gt;200 · Bronze &gt;100
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Reason *
              </label>
              <input
                required
                value={awardReason}
                onChange={(e) => setAwardReason(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="e.g. Top Closer — March"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Badge (optional)
              </label>
              <select
                value={awardBadge}
                onChange={(e) => setAwardBadge(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">No badge</option>
                <option value="top-closer">Top Closer</option>
                <option value="customer-star">Customer Star</option>
                <option value="leader">Team Leader</option>
                <option value="innovator">Innovator</option>
                <option value="mentor">Mentor</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={awarding}
              className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {awarding ? "Awarding…" : "Award Points"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
