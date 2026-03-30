"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface DealerUser {
  id: string;
  dealer_id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const ROLES = ["owner", "admin", "manager", "staff"] as const;

const ROLE_BADGE: Record<string, string> = {
  owner: "bg-purple-100 text-purple-800",
  admin: "bg-blue-100 text-blue-800",
  manager: "bg-green-100 text-green-800",
  staff: "bg-gray-100 text-gray-700",
};

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const INPUT_CLASS =
  "block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function TeamPage() {
  const [users, setUsers] = useState<DealerUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite form state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("admin");
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dealer-users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users ?? []);
      }
    } catch {
      // swallow
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteSubmitting(true);
    setInviteError(null);

    try {
      const res = await fetch("/api/admin/dealer-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: inviteName,
          email: inviteEmail,
          role: inviteRole,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setInviteError(data.error || `Failed to create user (${res.status})`);
        return;
      }

      // Success — reset form and refresh
      setInviteName("");
      setInviteEmail("");
      setInviteRole("admin");
      setInviteSuccess(true);
      setTimeout(() => {
        setInviteSuccess(false);
        setShowInvite(false);
      }, 3000);
      fetchUsers();
    } catch {
      setInviteError("Network error. Please try again.");
    } finally {
      setInviteSubmitting(false);
    }
  };

  const toggleActive = async (user: DealerUser) => {
    try {
      await fetch(`/api/admin/dealer-users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      fetchUsers();
    } catch {
      // swallow
    }
  };

  const updateRole = async (user: DealerUser, newRole: string) => {
    try {
      await fetch(`/api/admin/dealer-users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      fetchUsers();
    } catch {
      // swallow
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage users who can access this dealership&apos;s admin panel.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          {showInvite ? "Cancel" : "Invite User"}
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Invite New User</h2>

          {inviteError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {inviteError}
            </div>
          )}
          {inviteSuccess && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
              Invitation sent! They'll receive an email to set up their account.
            </div>
          )}

          <form onSubmit={handleInvite} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="invite-name" className="block text-sm font-medium text-gray-700">
                Name *
              </label>
              <input
                id="invite-name"
                type="text"
                required
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Full name"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700">
                Email *
              </label>
              <input
                id="invite-email"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@dealership.com"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="invite-role" className="block text-sm font-medium text-gray-700">
                Role
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className={INPUT_CLASS}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={inviteSubmitting}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {inviteSubmitting ? "Sending..." : "Send Invite"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* User list */}
      <div className="mt-6">
        {loading ? (
          <p className="text-gray-500">Loading team members...</p>
        ) : users.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-500">No team members yet. Click &quot;Invite User&quot; to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Last Login</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                      {user.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {user.email}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <select
                        value={user.role}
                        onChange={(e) => updateRole(user, e.target.value)}
                        className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r.charAt(0).toUpperCase() + r.slice(1)}
                          </option>
                        ))}
                      </select>
                      <span
                        className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[user.role] ?? "bg-gray-100 text-gray-700"}`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {formatDate(user.last_login)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          user.is_active
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {user.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        onClick={() => toggleActive(user)}
                        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                          user.is_active
                            ? "bg-red-50 text-red-700 hover:bg-red-100"
                            : "bg-green-50 text-green-700 hover:bg-green-100"
                        }`}
                      >
                        {user.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
