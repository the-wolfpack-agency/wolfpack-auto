"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface TestTask {
  id: string;
  title: string;
  description: string;
  success_url_pattern: string;
  success_selector?: string;
  max_duration_seconds: number;
  order: number;
}

interface UserTest {
  id: string;
  title: string;
  description: string;
  tasks: TestTask[];
  created_at: string;
  active: boolean;
  total_participants: number;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function UserTestingPage() {
  const [tests, setTests] = useState<UserTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<UserTest | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Create form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    fetch("/api/admin/user-testing")
      .then((r) => r.json())
      .then((data) => setTests(data.tests ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/user-testing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          tasks: [
            {
              title: "Navigate to inventory",
              description: "Find the inventory page",
              success_url_pattern: "/inventory*",
              max_duration_seconds: 30,
              order: 0,
            },
            {
              title: "View a vehicle",
              description: "Click on any vehicle card",
              success_url_pattern: "/inventory/*",
              max_duration_seconds: 45,
              order: 1,
            },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTests((prev) => [data.test, ...prev]);
        setShowCreate(false);
        setTitle("");
        setDescription("");
      }
    } catch {
      // swallow
    } finally {
      setCreating(false);
    }
  }, [title, description]);

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
          &larr; Back to tests
        </button>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{selected.title}</h1>
            {selected.active ? (
              <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                Active
              </span>
            ) : (
              <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                Inactive
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                const newTitle = window.prompt("New title", selected.title);
                if (newTitle === null) return;
                const newDescription = window.prompt("New description", selected.description ?? "");
                if (newDescription === null) return;
                const res = await fetch(`/api/admin/user-testing?id=${encodeURIComponent(selected.id)}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title: newTitle, description: newDescription }),
                });
                if (res.ok) {
                  setSelected({ ...selected, title: newTitle, description: newDescription });
                  setTests((prev) =>
                    prev.map((t) => (t.id === selected.id ? { ...t, title: newTitle, description: newDescription } : t)),
                  );
                } else {
                  alert(`Edit failed: ${(await res.json().catch(() => ({}))).error ?? res.status}`);
                }
              }}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              data-testid="usertest-edit"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Delete test "${selected.title}"? It will stop accepting new participants.`)) return;
                const res = await fetch(`/api/admin/user-testing?id=${encodeURIComponent(selected.id)}`, { method: "DELETE" });
                if (res.ok) {
                  setTests((prev) => prev.filter((t) => t.id !== selected.id));
                  setSelected(null);
                } else {
                  alert(`Delete failed: ${(await res.json().catch(() => ({}))).error ?? res.status}`);
                }
              }}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              data-testid="usertest-delete"
            >
              Delete
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-500">{selected.description}</p>

        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Participants" value={String(selected.total_participants)} />
          <StatCard label="Tasks" value={String(selected.tasks.length)} />
        </div>

        {/* Tasks list */}
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-900">Tasks</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {selected.tasks
              .sort((a, b) => a.order - b.order)
              .map((task, i) => (
                <li key={task.id} className="px-4 py-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{task.title}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{task.description}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          URL: {task.success_url_pattern}
                        </span>
                        {task.success_selector && (
                          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                            Selector: {task.success_selector}
                          </span>
                        )}
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          Max: {task.max_duration_seconds}s
                        </span>
                      </div>
                    </div>
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
          <h1 className="text-2xl font-bold text-gray-900">User Testing</h1>
          <p className="mt-1 text-sm text-gray-500">
            Define tasks and measure how visitors complete them. Track completion rates and find drop-off points.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showCreate ? "Cancel" : "New Test"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Create User Test</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="e.g., Vehicle Search Usability"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={2}
              placeholder="What are you testing?"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !title.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Test"}
          </button>
        </div>
      )}

      {/* Test list */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Test</th>
              <th className="px-4 py-3">Tasks</th>
              <th className="px-4 py-3">Participants</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tests.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{t.title}</p>
                  <p className="text-xs text-gray-500">{t.description}</p>
                </td>
                <td className="px-4 py-3 text-gray-700">{t.tasks.length}</td>
                <td className="px-4 py-3 font-medium text-gray-900">
                  {t.total_participants}
                </td>
                <td className="px-4 py-3">
                  {t.active ? (
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
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setSelected(t)}
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
