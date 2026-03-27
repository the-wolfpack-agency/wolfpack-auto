"use client";

import { useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotificationType {
  id: string;
  label: string;
  description: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

// ---------------------------------------------------------------------------
// Static data (would come from API in production)
// ---------------------------------------------------------------------------

const NOTIFICATION_TYPES: NotificationType[] = [
  {
    id: "new_leads",
    label: "New Leads",
    description: "Get notified when a new lead is submitted via the website.",
  },
  {
    id: "contact_forms",
    label: "Contact Form Submissions",
    description: "Get notified when someone submits the contact form.",
  },
  {
    id: "inventory_alerts",
    label: "Inventory Alerts",
    description:
      "Receive alerts for slow movers, pricing opportunities, and inventory gaps.",
  },
  {
    id: "lead_assigned",
    label: "Lead Assignments",
    description:
      "Notify team members when a lead is assigned to them.",
  },
];

const DEFAULT_TEAM: TeamMember[] = [
  { id: "1", name: "Nick Homyk", email: "nick@wolfpackauto.com", role: "Admin" },
  { id: "2", name: "Sales Manager", email: "sales@wolfpackauto.com", role: "Manager" },
  { id: "3", name: "BDC Team", email: "bdc@wolfpackauto.com", role: "Manager" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NotificationsSettingsPage() {
  // Toggle state per notification type
  const [enabledTypes, setEnabledTypes] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        NOTIFICATION_TYPES.map((t) => [t.id, true]),
      ),
  );

  // Recipient state: notificationType -> set of teamMember ids
  const [recipients, setRecipients] = useState<Record<string, Set<string>>>(
    () =>
      Object.fromEntries(
        NOTIFICATION_TYPES.map((t) => [
          t.id,
          new Set(DEFAULT_TEAM.map((m) => m.id)),
        ]),
      ),
  );

  const [testStatus, setTestStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");

  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  // Handlers
  const toggleType = useCallback((typeId: string) => {
    setEnabledTypes((prev) => ({ ...prev, [typeId]: !prev[typeId] }));
  }, []);

  const toggleRecipient = useCallback(
    (typeId: string, memberId: string) => {
      setRecipients((prev) => {
        const set = new Set(prev[typeId]);
        if (set.has(memberId)) {
          set.delete(memberId);
        } else {
          set.add(memberId);
        }
        return { ...prev, [typeId]: set };
      });
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setSaveStatus("saving");
    try {
      // Build payload
      const payload = NOTIFICATION_TYPES.map((t) => ({
        type: t.id,
        enabled: enabledTypes[t.id] ?? false,
        recipients: Array.from(recipients[t.id] ?? []),
      }));

      const res = await fetch("/api/admin/settings/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: payload }),
      });

      setSaveStatus(res.ok ? "saved" : "error");
    } catch {
      setSaveStatus("error");
    }

    setTimeout(() => setSaveStatus("idle"), 3000);
  }, [enabledTypes, recipients]);

  const handleTestEmail = useCallback(async () => {
    setTestStatus("sending");
    try {
      const res = await fetch("/api/admin/settings/notifications/test", {
        method: "POST",
      });
      setTestStatus(res.ok ? "sent" : "error");
    } catch {
      setTestStatus("error");
    }

    setTimeout(() => setTestStatus("idle"), 3000);
  }, []);

  return (
    <>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Notification Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure which notifications your team receives and who gets them.
        </p>
      </div>

      <div className="space-y-8">
        {/* ---------------------------------------------------------------- */}
        {/* Notification toggles                                             */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="notif-types-heading"
          className="rounded-card border border-surface-border bg-white p-6 shadow-card"
        >
          <h2
            id="notif-types-heading"
            className="mb-6 text-lg font-semibold text-gray-900"
          >
            Notification Types
          </h2>

          <div className="divide-y divide-surface-border">
            {NOTIFICATION_TYPES.map((type) => (
              <div
                key={type.id}
                className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
              >
                <div className="pr-4">
                  <p className="text-sm font-medium text-gray-900">
                    {type.label}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {type.description}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabledTypes[type.id]}
                  onClick={() => toggleType(type.id)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                    enabledTypes[type.id] ? "bg-brand-600" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      enabledTypes[type.id]
                        ? "translate-x-5"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Recipients per type                                              */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="recipients-heading"
          className="rounded-card border border-surface-border bg-white p-6 shadow-card"
        >
          <h2
            id="recipients-heading"
            className="mb-6 text-lg font-semibold text-gray-900"
          >
            Email Recipients
          </h2>

          <div className="space-y-6">
            {NOTIFICATION_TYPES.map((type) => (
              <fieldset
                key={type.id}
                disabled={!enabledTypes[type.id]}
                className={
                  enabledTypes[type.id] ? "" : "opacity-40 pointer-events-none"
                }
              >
                <legend className="text-sm font-semibold text-gray-900">
                  {type.label}
                </legend>
                <div className="mt-2 space-y-2">
                  {DEFAULT_TEAM.map((member) => (
                    <label
                      key={member.id}
                      className="flex items-center gap-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={recipients[type.id]?.has(member.id) ?? false}
                        onChange={() => toggleRecipient(type.id, member.id)}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="text-gray-700">
                        {member.name}
                      </span>
                      <span className="text-gray-400">
                        ({member.email})
                      </span>
                      <span className="ml-auto rounded bg-surface-subtle px-2 py-0.5 text-xs text-gray-500">
                        {member.role}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Test Email                                                       */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-labelledby="test-heading"
          className="rounded-card border border-surface-border bg-white p-6 shadow-card"
        >
          <h2
            id="test-heading"
            className="mb-2 text-lg font-semibold text-gray-900"
          >
            Test Notifications
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            Send a sample notification to verify your email setup is working.
          </p>

          <button
            type="button"
            onClick={handleTestEmail}
            disabled={testStatus === "sending"}
            className="rounded-lg bg-gray-800 px-6 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testStatus === "sending"
              ? "Sending..."
              : testStatus === "sent"
                ? "Test Email Sent"
                : testStatus === "error"
                  ? "Failed — Try Again"
                  : "Send Test Email"}
          </button>

          {testStatus === "sent" && (
            <p className="mt-2 text-sm text-green-600">
              Test email dispatched. Check your inbox.
            </p>
          )}
          {testStatus === "error" && (
            <p className="mt-2 text-sm text-red-600">
              Could not send test email. Check your RESEND_API_KEY
              configuration.
            </p>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Save button                                                      */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex items-center justify-end gap-3">
          {saveStatus === "saved" && (
            <span className="text-sm text-green-600">
              Settings saved successfully.
            </span>
          )}
          {saveStatus === "error" && (
            <span className="text-sm text-red-600">
              Failed to save. Please try again.
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saveStatus === "saving"}
            className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveStatus === "saving" ? "Saving..." : "Save Preferences"}
          </button>
        </div>
      </div>
    </>
  );
}
