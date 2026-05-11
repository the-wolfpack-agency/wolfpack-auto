"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";

/**
 * Shared chrome for the Wolfpack operator console.
 *
 * - Sidebar with primary nav (Dashboard, Dealers, Team, Audit Log, Settings).
 * - Top bar with logged-in staff name + logout button.
 * - Auto-redirects unauthenticated visitors to /operator/login?next=<current>.
 *   This avoids the "blank dashboard" failure mode where 401 paints empty.
 */

const NAV = [
  { href: "/operator", label: "Dashboard", exact: true },
  { href: "/operator/dealers", label: "Dealers" },
  { href: "/operator/team", label: "Team" },
  { href: "/operator/audit", label: "Audit Log" },
];

export default function OperatorChrome({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    const isStaffSession = session?.kind === "wolfpack_staff";
    if (!session || !isStaffSession) {
      const next = encodeURIComponent(pathname ?? "/operator");
      router.replace(`/operator/login?next=${next}`);
    }
  }, [session, status, pathname, router]);

  if (status === "loading" || !session || session.kind !== "wolfpack_staff") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <div className="text-sm text-gray-500">Checking session...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] bg-surface-muted">
      <aside
        data-testid="operator-sidebar"
        className="hidden w-64 shrink-0 flex-col border-r border-surface-border bg-gradient-to-b from-brand-700 to-brand-900 text-white lg:flex"
      >
        <div className="flex items-center gap-2 border-b border-brand-800/40 px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500 text-sm font-bold">W</span>
          <div>
            <div className="text-sm font-semibold leading-tight">Wolfpack</div>
            <div className="text-[11px] uppercase tracking-wider text-brand-200">Operator Console</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4 text-sm">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md px-3 py-2 transition-colors ${
                  active ? "bg-brand-950/40 text-white" : "text-brand-100 hover:bg-brand-800/40 hover:text-white"
                }`}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-brand-800/40 p-3 text-xs text-brand-200">
          <div className="truncate" title={session.user?.email ?? ""}>
            {session.user?.name || session.user?.email}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-accent-300">{session.staff_role}</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-surface-border bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-gray-900" data-testid="operator-pagetitle">
              {NAV.find((n) => (n.exact ? pathname === n.href : pathname?.startsWith(n.href)))?.label ?? "Operator"}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-gray-600 sm:inline" data-testid="operator-staff-name">
              {session.user?.name || session.user?.email}
            </span>
            <button
              type="button"
              data-testid="operator-logout"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                try {
                  await fetch("/api/operator/auth/logout", { method: "POST" });
                } catch { /* ignore */ }
                await signOut({ callbackUrl: "/operator/login" });
              }}
              className="rounded-md border border-surface-border bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-surface-subtle disabled:opacity-50"
            >
              {signingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
