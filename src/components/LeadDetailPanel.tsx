"use client";

import { useState } from "react";
import type { Lead, LeadStatus, LeadTemperature, LeadNote, LeadActivity } from "@/types/lead";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "appointment_set", label: "Appointment Set" },
  { value: "sold", label: "Sold" },
  { value: "lost", label: "Lost" },
];

const TEMP_OPTIONS: { value: LeadTemperature; label: string }[] = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cool", label: "Cool" },
  { value: "cold", label: "Cold" },
];

const ACTIVITY_ICONS: Record<LeadActivity["type"], string> = {
  status_change: "S",
  assignment: "A",
  note: "N",
  follow_up: "F",
};

const ACTIVITY_COLORS: Record<LeadActivity["type"], string> = {
  status_change: "bg-blue-100 text-blue-700",
  assignment: "bg-purple-100 text-purple-700",
  note: "bg-green-100 text-green-700",
  follow_up: "bg-amber-100 text-amber-700",
};

/* -------------------------------------------------------------------------- */
/* Props                                                                      */
/* -------------------------------------------------------------------------- */

interface LeadDetailPanelProps {
  lead: Lead;
  teamMembers: string[];
  onUpdate: (leadId: string, updates: Partial<Lead>) => void;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function LeadDetailPanel({
  lead,
  teamMembers,
  onUpdate,
}: LeadDetailPanelProps) {
  const [noteText, setNoteText] = useState("");
  const [followUpDate, setFollowUpDate] = useState(lead.follow_up_date ?? "");
  const [saving, setSaving] = useState(false);

  async function handleStatusChange(status: LeadStatus) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        onUpdate(lead.id, { status });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleTempChange(temperature: LeadTemperature) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temperature }),
      });
      if (res.ok) {
        onUpdate(lead.id, { temperature });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleAssign(assigned_to: string | null) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to }),
      });
      if (res.ok) {
        onUpdate(lead.id, { assigned_to });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteText.trim() }),
      });
      if (res.ok) {
        const newNote: LeadNote = {
          id: `n-${Date.now()}`,
          text: noteText.trim(),
          author: "You",
          created_at: new Date().toISOString(),
        };
        onUpdate(lead.id, {
          structured_notes: [...(lead.structured_notes ?? []), newNote],
        });
        setNoteText("");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleFollowUp() {
    if (!followUpDate) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ follow_up_date: followUpDate }),
      });
      if (res.ok) {
        onUpdate(lead.id, { follow_up_date: followUpDate });
      }
    } finally {
      setSaving(false);
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <tr>
      <td colSpan={9} className="border-b border-surface-border bg-gray-50 px-0">
        <div className="grid gap-6 p-6 lg:grid-cols-3">
          {/* ---- Left: Message + Notes ---- */}
          <div className="space-y-4 lg:col-span-2">
            {/* Message */}
            {lead.message && (
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Message
                </h4>
                <p className="rounded-lg border border-surface-border bg-white p-3 text-sm text-gray-700">
                  {lead.message}
                </p>
              </div>
            )}

            {/* Source / Attribution */}
            <div className="flex flex-wrap gap-4 text-sm">
              {lead.referrer_url && (
                <div>
                  <span className="text-xs font-semibold text-gray-500">Source URL: </span>
                  <span className="text-gray-700">{lead.referrer_url}</span>
                </div>
              )}
              {lead.utm_campaign && (
                <div>
                  <span className="text-xs font-semibold text-gray-500">Campaign: </span>
                  <span className="text-gray-700">{lead.utm_campaign}</span>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Notes ({lead.structured_notes?.length ?? 0})
              </h4>
              {(lead.structured_notes ?? []).length > 0 ? (
                <div className="space-y-2">
                  {(lead.structured_notes ?? []).map((note) => (
                    <div
                      key={note.id}
                      className="rounded-lg border border-surface-border bg-white p-3"
                    >
                      <p className="text-sm text-gray-700">{note.text}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {note.author} -- {formatDate(note.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No notes yet.</p>
              )}

              {/* Add note form */}
              <div className="mt-3 flex gap-2">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add a note..."
                  rows={2}
                  className="input-field flex-1 resize-none"
                />
                <button
                  type="button"
                  onClick={handleAddNote}
                  disabled={saving || !noteText.trim()}
                  className="self-end rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-50"
                >
                  Add Note
                </button>
              </div>
            </div>
          </div>

          {/* ---- Right: Controls + Activity ---- */}
          <div className="space-y-4">
            {/* Status */}
            <div>
              <label
                htmlFor={`status-${lead.id}`}
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                Status
              </label>
              <select
                id={`status-${lead.id}`}
                value={lead.status}
                onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
                disabled={saving}
                className="input-field"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Temperature */}
            <div>
              <label
                htmlFor={`temp-${lead.id}`}
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                Temperature
              </label>
              <select
                id={`temp-${lead.id}`}
                value={lead.temperature}
                onChange={(e) => handleTempChange(e.target.value as LeadTemperature)}
                disabled={saving}
                className="input-field"
              >
                {TEMP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Assign */}
            <div>
              <label
                htmlFor={`assign-${lead.id}`}
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                Assigned To
              </label>
              <select
                id={`assign-${lead.id}`}
                value={lead.assigned_to ?? ""}
                onChange={(e) =>
                  handleAssign(e.target.value || null)
                }
                disabled={saving}
                className="input-field"
              >
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Follow-up date */}
            <div>
              <label
                htmlFor={`followup-${lead.id}`}
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                Follow-up Reminder
              </label>
              <div className="flex gap-2">
                <input
                  id={`followup-${lead.id}`}
                  type="datetime-local"
                  value={followUpDate ? followUpDate.slice(0, 16) : ""}
                  onChange={(e) => setFollowUpDate(e.target.value ? new Date(e.target.value).toISOString() : "")}
                  className="input-field flex-1"
                />
                <button
                  type="button"
                  onClick={handleFollowUp}
                  disabled={saving || !followUpDate}
                  className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-surface-muted disabled:opacity-50"
                >
                  Set
                </button>
              </div>
              {lead.follow_up_date && (
                <p className="mt-1 text-xs text-gray-400">
                  Current: {formatDate(lead.follow_up_date)}
                </p>
              )}
            </div>

            {/* Activity Timeline */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Activity
              </h4>
              {(lead.activity ?? []).length > 0 ? (
                <div className="space-y-2">
                  {[...(lead.activity ?? [])]
                    .sort(
                      (a, b) =>
                        new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime(),
                    )
                    .slice(0, 10)
                    .map((act) => (
                      <div
                        key={act.id}
                        className="flex items-start gap-2"
                      >
                        <span
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${ACTIVITY_COLORS[act.type]}`}
                        >
                          {ACTIVITY_ICONS[act.type]}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs text-gray-700">
                            {act.description}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {act.author} -- {formatDate(act.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No activity yet.</p>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}
