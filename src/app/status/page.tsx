/**
 * Public status page (/status)
 *
 * Server component shell. The dynamic bits (poll every 30s, status dots) live
 * in StatusBoard which is a client component. The page itself does a server-
 * side initial fetch so the first paint already has live data even if JS is
 * disabled.
 *
 * No new dependencies. Uses brand colors from globals.css / tailwind:
 *   blue gradient #0a406f → #0070c7 → #36a8f8, accent #f97316.
 */

import type { Metadata } from "next";
import StatusBoard from "./status-board";
import type { StatusPayload } from "@/lib/status/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "System Status",
  description:
    "Live operational status. Check current health of API, database, search, and background services.",
};

async function fetchInitialStatus(): Promise<StatusPayload | null> {
  // Server-side initial fetch. If this fails (e.g. during build), fall back
  // to null and let the client poll do the work.
  try {
    const base =
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";
    const res = await fetch(`${base}/api/status`, {
      // Always fresh on initial render; client polling drives steady state.
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as StatusPayload;
  } catch {
    return null;
  }
}

export default async function StatusPage() {
  const initial = await fetchInitialStatus();

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#0070c7]">
            System Status
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            All systems status
          </h1>
          <p className="mt-3 max-w-2xl text-base text-gray-600">
            Live operational health for every customer-facing component. This
            page refreshes automatically every 30 seconds.
          </p>
        </header>

        <StatusBoard initial={initial} />

        <footer className="mt-12 border-t border-slate-200 pt-6 text-sm text-gray-500">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <span>
              Subscribe to incident updates by emailing{" "}
              <a
                href="mailto:status@thewolfpack.agency"
                className="font-medium text-[#0070c7] hover:text-[#0a406f]"
              >
                status@thewolfpack.agency
              </a>
              .
            </span>
            <span className="text-xs text-gray-400">
              The Wolfpack Agency
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
