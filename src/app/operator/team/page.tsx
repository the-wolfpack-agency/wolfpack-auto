"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import OperatorChrome from "@/components/operator/OperatorChrome";

interface StaffRow {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "operator" | "viewer";
  mfa_enabled: boolean;
  last_login_at: string | null;
  created_at: string;
  disabled_at: string | null;
}

interface InviteRow {
  id: string;
  email: string;
  role: "admin" | "operator" | "viewer";
  inviter_name: string | null;
  expires_at: string;
  created_at: string;
}

export default function OperatorTeamPage() {
  return (
    <OperatorChrome>
      <TeamView />
    </OperatorChrome>
  );
}

function TeamView() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "operator" | "viewer">("viewer");
  const [inviting, setInviting] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [staffRes, invitesRes] = await Promise.all([
        fetch("/api/operator/team"),
        fetch("/api/operator/invites"),
      ]);
      if (!staffRes.ok) throw new Error(`team HTTP ${staffRes.status}`);
      if (!invitesRes.ok) throw new Error(`invites HTTP ${invitesRes.status}`);
      const s = (await staffRes.json()) as { staff: StaffRow[] };
      const i = (await invitesRes.json()) as { invites: InviteRow[] };
      setStaff(s.staff);
      setInvites(i.invites);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setLastInviteUrl("");
    setInviting(true);
    try {
      const res = await fetch("/api/operator/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, role: newRole }),
      });
      const data = (await res.json()) as { error?: string; accept_url?: string };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      if (data.accept_url) setLastInviteUrl(data.accept_url);
      setNewEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="operator-team-page">
      <h2 className="text-2xl font-bold text-gray-900">Wolfpack team</h2>

      <form
        onSubmit={invite}
        className="space-y-3 rounded-xl border border-surface-border bg-white p-5 shadow-card"
        data-testid="invite-form"
      >
        <h3 className="text-sm font-semibold text-gray-900">Invite a teammate</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto]">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            placeholder="teammate@thewolfpack.agency"
            data-testid="invite-email"
            className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as "admin" | "operator" | "viewer")}
            data-testid="invite-role"
            className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
          >
            <option value="viewer">Viewer</option>
            <option value="operator">Operator</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit"
            disabled={inviting}
            data-testid="invite-submit"
            className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-60"
          >
            {inviting ? "Sending..." : "Send invite"}
          </button>
        </div>
        {lastInviteUrl && (
          <div
            className="rounded-md border border-brand-200 bg-brand-50 p-2 font-mono text-xs text-brand-800"
            data-testid="invite-url"
          >
            Accept URL (dev): {lastInviteUrl}
          </div>
        )}
      </form>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : (
        <>
          <Section title="Active staff" data-testid="staff-list">
            {staff.length === 0 ? (
              <p className="text-sm text-gray-500">No staff yet — run the bootstrap script.</p>
            ) : (
              <ul className="divide-y divide-surface-border">
                {staff.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{s.full_name || s.email}</div>
                      <div className="text-xs text-gray-500">{s.email}</div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">{s.role}</span>
                      {s.disabled_at && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">disabled</span>}
                      {s.mfa_enabled && <span className="rounded-full bg-accent-50 px-2 py-0.5 text-accent-700">MFA</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Pending invitations" data-testid="invites-list">
            {invites.length === 0 ? (
              <p className="text-sm text-gray-500">No pending invitations.</p>
            ) : (
              <ul className="divide-y divide-surface-border">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <div className="font-medium text-gray-900">{i.email}</div>
                      <div className="text-xs text-gray-500">
                        Role: {i.role} · invited by {i.inviter_name ?? "system"}
                      </div>
                    </div>
                    <time className="text-xs text-gray-400">
                      expires {new Date(i.expires_at).toLocaleDateString()}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  children,
  ...rest
}: {
  title: string;
  children: React.ReactNode;
  [key: string]: unknown;
}) {
  return (
    <section className="rounded-xl border border-surface-border bg-white p-5 shadow-card" {...rest}>
      <h3 className="mb-3 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </section>
  );
}
