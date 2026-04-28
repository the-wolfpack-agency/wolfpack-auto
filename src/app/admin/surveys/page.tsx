"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface SurveyQuestion {
  id: string;
  text: string;
  type: string;
  options?: string[];
  required: boolean;
  order: number;
}

interface Survey {
  id: string;
  title: string;
  description: string;
  questions: SurveyQuestion[];
  trigger: { type: string; delay_seconds?: number; scroll_percentage?: number; page_pattern?: string };
  active: boolean;
  created_at: string;
  response_count: number;
  nps_score: number | null;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Survey | null>(null);

  // Create form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("time_on_page");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/admin/surveys")
      .then((r) => r.json())
      .then((data) => setSurveys(data.surveys ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          questions: [
            { text: "How would you rate your experience?", type: "rating", required: true, order: 0 },
            { text: "Any additional feedback?", type: "free_text", required: false, order: 1 },
          ],
          trigger: { type: triggerType, delay_seconds: 30 },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSurveys((prev) => [data.survey, ...prev]);
        setShowCreate(false);
        setTitle("");
        setDescription("");
      }
    } catch {
      // swallow
    } finally {
      setCreating(false);
    }
  }, [title, description, triggerType]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  // Detail view
  if (selected) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <button
          onClick={() => setSelected(null)}
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; Back to surveys
        </button>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-gray-900">{selected.title}</h1>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                const newTitle = window.prompt("New title", selected.title);
                if (newTitle === null) return;
                const newDescription = window.prompt("New description", selected.description ?? "");
                if (newDescription === null) return;
                const res = await fetch(`/api/admin/surveys?id=${encodeURIComponent(selected.id)}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title: newTitle, description: newDescription }),
                });
                if (res.ok) {
                  setSelected({ ...selected, title: newTitle, description: newDescription });
                  setSurveys((prev) =>
                    prev.map((s) => (s.id === selected.id ? { ...s, title: newTitle, description: newDescription } : s)),
                  );
                } else {
                  alert(`Edit failed: ${(await res.json().catch(() => ({}))).error ?? res.status}`);
                }
              }}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              data-testid="survey-edit"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Delete survey "${selected.title}"? This will deactivate it for new responses.`)) return;
                const res = await fetch(`/api/admin/surveys?id=${encodeURIComponent(selected.id)}`, { method: "DELETE" });
                if (res.ok) {
                  setSurveys((prev) => prev.filter((s) => s.id !== selected.id));
                  setSelected(null);
                } else {
                  alert(`Delete failed: ${(await res.json().catch(() => ({}))).error ?? res.status}`);
                }
              }}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              data-testid="survey-delete"
            >
              Delete
            </button>
            <a
              href={`/admin/surveys/${selected.id}/responses`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              View Responses
            </a>
          </div>
        </div>
        <p className="text-sm text-gray-500">{selected.description}</p>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="Responses" value={String(selected.response_count)} />
          <StatCard
            label="NPS Score"
            value={selected.nps_score !== null ? String(selected.nps_score) : "N/A"}
            color={
              selected.nps_score !== null
                ? selected.nps_score >= 50
                  ? "text-green-600"
                  : selected.nps_score >= 0
                    ? "text-amber-600"
                    : "text-red-600"
                : "text-gray-400"
            }
          />
          <StatCard label="Trigger" value={selected.trigger.type.replace(/_/g, " ")} />
        </div>

        {/* NPS visual bar */}
        {selected.nps_score !== null && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">NPS Score Distribution</h2>
            <div className="h-4 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full ${
                  selected.nps_score >= 50
                    ? "bg-green-500"
                    : selected.nps_score >= 0
                      ? "bg-amber-500"
                      : "bg-red-500"
                }`}
                style={{ width: `${Math.max(0, Math.min(100, (selected.nps_score + 100) / 2))}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-xs text-gray-400">
              <span>-100</span>
              <span>0</span>
              <span>+100</span>
            </div>
          </div>
        )}

        {/* Questions list */}
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-900">Questions</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {selected.questions.map((q, i) => (
              <li key={q.id ?? i} className="px-4 py-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{q.text}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Type: {q.type.replace(/_/g, " ")} {q.required && " (required)"}
                    </p>
                    {q.options && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {q.options.map((opt) => (
                          <span key={opt} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                            {opt}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">#{i + 1}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Surveys</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create and manage visitor surveys. Track NPS, CSAT, and collect feedback.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showCreate ? "Cancel" : "New Survey"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Create Survey</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="e.g., Customer Satisfaction Survey"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={2}
              placeholder="Brief description of the survey purpose"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Trigger</label>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="time_on_page">Time on page</option>
              <option value="exit_intent">Exit intent</option>
              <option value="scroll_depth">Scroll depth</option>
              <option value="page_visit">Page visit</option>
              <option value="post_purchase">Post purchase</option>
            </select>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !title.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Survey"}
          </button>
        </div>
      )}

      {/* Survey list */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Survey</th>
              <th className="px-4 py-3">Trigger</th>
              <th className="px-4 py-3">Responses</th>
              <th className="px-4 py-3">NPS</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {surveys.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{s.title}</p>
                  <p className="text-xs text-gray-500">{s.questions.length} questions</p>
                </td>
                <td className="px-4 py-3 text-gray-700 text-xs">
                  {s.trigger.type.replace(/_/g, " ")}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">
                  {s.response_count}
                </td>
                <td className="px-4 py-3">
                  {s.nps_score !== null ? (
                    <span
                      className={`font-bold ${
                        s.nps_score >= 50
                          ? "text-green-600"
                          : s.nps_score >= 0
                            ? "text-amber-600"
                            : "text-red-600"
                      }`}
                    >
                      {s.nps_score}
                    </span>
                  ) : (
                    <span className="text-gray-400">--</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {s.active ? (
                    <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {new Date(s.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setSelected(s)}
                    className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color ?? "text-gray-900"}`}>{value}</p>
    </div>
  );
}
