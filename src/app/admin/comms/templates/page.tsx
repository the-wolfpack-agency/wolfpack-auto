"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface MessageTemplate {
  id: string;
  name: string;
  channel: "email" | "sms";
  category: string;
  subject: string | null;
  body: string;
  variables: string[];
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const CHANNEL_BADGE: Record<string, string> = {
  email: "bg-blue-100 text-blue-700",
  sms: "bg-green-100 text-green-700",
};

const CATEGORY_LABELS: Record<string, string> = {
  welcome: "Welcome",
  follow_up: "Follow-Up",
  appointment: "Appointment",
  post_sale: "Post-Sale",
  service: "Service",
  general: "General",
};

const VARIABLES = ["{first_name}", "{vehicle_interest}", "{dealer_name}", "{salesperson}"];

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Editor state
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [formName, setFormName] = useState("");
  const [formChannel, setFormChannel] = useState<"email" | "sms">("email");
  const [formCategory, setFormCategory] = useState("general");
  const [formSubject, setFormSubject] = useState("");
  const [formBody, setFormBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState("");

  // Filter
  const [filterChannel, setFilterChannel] = useState<"" | "email" | "sms">("");

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = filterChannel ? `?channel=${filterChannel}` : "";
      const res = await fetch(`/api/admin/comms/templates${params}`);
      const data = await res.json();
      setTemplates(data.templates ?? []);
    } catch {
      setError("Failed to load templates.");
    } finally {
      setLoading(false);
    }
  }, [filterChannel]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  function openEditor(tpl?: MessageTemplate) {
    if (tpl) {
      setEditing(tpl);
      setFormName(tpl.name);
      setFormChannel(tpl.channel);
      setFormCategory(tpl.category);
      setFormSubject(tpl.subject ?? "");
      setFormBody(tpl.body);
    } else {
      setEditing(null);
      setFormName("");
      setFormChannel("email");
      setFormCategory("general");
      setFormSubject("");
      setFormBody("");
    }
    setSaveSuccess("");
  }

  function insertVariable(v: string) {
    setFormBody((prev) => prev + v);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess("");
    try {
      const res = await fetch("/api/admin/comms/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          channel: formChannel,
          category: formCategory,
          subject: formChannel === "email" ? formSubject : undefined,
          body: formBody,
          variables: VARIABLES.filter((v) => formBody.includes(v) || formSubject.includes(v)),
        }),
      });
      if (res.ok) {
        setSaveSuccess("Template saved!");
        openEditor();
        void loadTemplates();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Message Templates</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create and manage reusable email and SMS templates.
          </p>
        </div>
        <button
          onClick={() => openEditor()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          + New Template
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filter */}
      <div className="mb-4 flex gap-2">
        {(["", "email", "sms"] as const).map((ch) => (
          <button
            key={ch}
            onClick={() => setFilterChannel(ch)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filterChannel === ch
                ? "bg-brand-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {ch === "" ? "All" : ch === "email" ? "Email" : "SMS"}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Template List */}
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400">Loading...</div>
          ) : templates.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
              No templates found. Create one to get started.
            </div>
          ) : (
            templates.map((tpl) => (
              <div
                key={tpl.id}
                className="cursor-pointer rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-brand-300 transition"
                onClick={() => openEditor(tpl)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHANNEL_BADGE[tpl.channel]}`}>
                    {tpl.channel.toUpperCase()}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {CATEGORY_LABELS[tpl.category] ?? tpl.category}
                  </span>
                </div>
                <h3 className="mt-2 font-semibold text-gray-900">{tpl.name}</h3>
                {tpl.subject && (
                  <p className="mt-1 text-xs text-gray-500">Subject: {tpl.subject}</p>
                )}
                <p className="mt-1 text-sm text-gray-600 line-clamp-2">{tpl.body}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {tpl.variables.map((v) => (
                    <span key={v} className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-mono text-brand-600">
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Editor Panel */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm self-start">
          <h2 className="mb-4 text-base font-semibold text-gray-800">
            {editing ? "Edit Template" : "Create Template"}
          </h2>

          {saveSuccess && (
            <div className="mb-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
              {saveSuccess}
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Template name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Channel *</label>
                <select
                  value={formChannel}
                  onChange={(e) => setFormChannel(e.target.value as "email" | "sms")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="general">General</option>
                  <option value="welcome">Welcome</option>
                  <option value="follow_up">Follow-Up</option>
                  <option value="appointment">Appointment</option>
                  <option value="post_sale">Post-Sale</option>
                  <option value="service">Service</option>
                </select>
              </div>
            </div>

            {formChannel === "email" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
                <input
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Email subject line"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Body *</label>
              <textarea
                required
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                rows={8}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none font-mono"
                placeholder="Message body..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Insert Variable</label>
              <div className="flex flex-wrap gap-1">
                {VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="rounded bg-brand-50 px-2 py-1 text-xs font-mono text-brand-600 hover:bg-brand-100 transition"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? "Saving..." : editing ? "Update Template" : "Create Template"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
