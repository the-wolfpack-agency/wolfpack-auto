"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/safe-fetch";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface SequenceStep {
  order: number;
  delay_hours: number;
  channel: "email" | "sms";
  template_id: string;
  template_name: string;
}

interface FollowUpSequence {
  id: string;
  name: string;
  trigger: string;
  steps: SequenceStep[];
  active: boolean;
  enrolled_count: number;
  completed_count: number;
  created_at: string;
}

interface TemplateOption {
  id: string;
  name: string;
  channel: "email" | "sms";
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const TRIGGER_LABELS: Record<string, string> = {
  lead_created: "New Lead Created",
  appointment_completed: "Appointment Completed",
  deal_closed: "Deal Closed",
  trade_in_submitted: "Trade-In Submitted",
  service_completed: "Service Completed",
};

function formatDelay(hours: number): string {
  if (hours === 0) return "Immediately";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function SequencesPage() {
  const [sequences, setSequences] = useState<FollowUpSequence[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState("");
  const [formTrigger, setFormTrigger] = useState("lead_created");
  const [formSteps, setFormSteps] = useState<{ delay_hours: number; channel: "email" | "sms"; template_id: string }[]>([
    { delay_hours: 0, channel: "email", template_id: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [seqData, tplData] = await Promise.all([
        fetchJson<{ sequences?: FollowUpSequence[] }>("/api/admin/comms/sequences"),
        fetchJson<{ templates?: { id: string; name: string; channel: "email" | "sms" }[] }>("/api/admin/comms/templates"),
      ]);
      setSequences(seqData.sequences ?? []);
      setTemplates(
        (tplData.templates ?? []).map((t) => ({
          id: t.id,
          name: t.name,
          channel: t.channel,
        })),
      );
    } catch {
      setError("Failed to load sequences.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function addStep() {
    setFormSteps((prev) => [...prev, { delay_hours: 24, channel: "email", template_id: "" }]);
  }

  function removeStep(idx: number) {
    setFormSteps((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateStep(idx: number, field: string, value: string | number) {
    setFormSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess("");
    try {
      const res = await fetch("/api/admin/comms/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          trigger: formTrigger,
          steps: formSteps,
        }),
      });
      if (res.ok) {
        setSaveSuccess("Sequence created!");
        setFormName("");
        setFormTrigger("lead_created");
        setFormSteps([{ delay_hours: 0, channel: "email", template_id: "" }]);
        setShowCreate(false);
        void loadData();
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
          <h1 className="text-2xl font-bold text-gray-900">Follow-Up Sequences</h1>
          <p className="mt-1 text-sm text-gray-500">
            Automate multi-step follow-up workflows triggered by lead events.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {showCreate ? "Cancel" : "+ New Sequence"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {saveSuccess && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          {saveSuccess}
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50/30 p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-800">Create Sequence</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Sequence name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Trigger Event *</label>
                <select
                  value={formTrigger}
                  onChange={(e) => setFormTrigger(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Steps */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Steps</label>
              <div className="space-y-2">
                {formSteps.map((step, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                      {idx + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-gray-500">Delay:</label>
                      <input
                        type="number"
                        min={0}
                        value={step.delay_hours}
                        onChange={(e) => updateStep(idx, "delay_hours", parseInt(e.target.value) || 0)}
                        className="w-16 rounded border border-gray-300 px-2 py-1 text-xs"
                      />
                      <span className="text-xs text-gray-500">hrs</span>
                    </div>
                    <select
                      value={step.channel}
                      onChange={(e) => updateStep(idx, "channel", e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                    >
                      <option value="email">Email</option>
                      <option value="sms">SMS</option>
                    </select>
                    <select
                      value={step.template_id}
                      onChange={(e) => updateStep(idx, "template_id", e.target.value)}
                      className="flex-1 min-w-[120px] rounded border border-gray-300 px-2 py-1 text-xs"
                    >
                      <option value="">Select template...</option>
                      {templates
                        .filter((t) => t.channel === step.channel)
                        .map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                    {formSteps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStep(idx)}
                        className="text-red-400 hover:text-red-600 text-xs"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addStep}
                className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                + Add Step
              </button>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? "Creating..." : "Create Sequence"}
            </button>
          </form>
        </div>
      )}

      {/* Sequence List */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading...</div>
      ) : sequences.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          No sequences yet. Create one to automate your follow-ups.
        </div>
      ) : (
        <div className="space-y-4">
          {sequences.map((seq) => (
            <div key={seq.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{seq.name}</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        seq.active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {seq.active ? "Active" : "Paused"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Trigger: {TRIGGER_LABELS[seq.trigger] ?? seq.trigger}
                  </p>
                </div>
                <div className="flex gap-4 text-center">
                  <div>
                    <p className="text-lg font-bold text-gray-900">{seq.enrolled_count}</p>
                    <p className="text-[10px] text-gray-500">Enrolled</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-green-600">{seq.completed_count}</p>
                    <p className="text-[10px] text-gray-500">Completed</p>
                  </div>
                </div>
              </div>

              {/* Steps visualization */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {seq.steps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    {idx > 0 && (
                      <span className="text-xs text-gray-400">
                        {formatDelay(step.delay_hours)} &rarr;
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        step.channel === "email"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {step.channel === "email" ? "Email" : "SMS"}: {step.template_name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
