"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Task {
  id: string;
  title: string;
  description: string;
  assigned_to: string;
  assigned_by: string;
  due_date: string | null;
  status: "pending" | "in_progress" | "completed";
  priority: "high" | "medium" | "low";
  created_at: string;
  recognition_note: string | null;
}

/* -------------------------------------------------------------------------- */
/* Style helpers                                                               */
/* -------------------------------------------------------------------------- */

const STATUS_BADGE: Record<Task["status"], string> = {
  pending: "bg-yellow-100 text-yellow-800 ring-yellow-500/30",
  in_progress: "bg-blue-100 text-blue-800 ring-blue-500/30",
  completed: "bg-green-100 text-green-800 ring-green-500/30",
};

const STATUS_LABEL: Record<Task["status"], string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
};

const PRIORITY_BADGE: Record<Task["priority"], string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-orange-100 text-orange-700",
  low: "bg-gray-100 text-gray-600",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function TaskCard({
  task,
  onStatusChange,
}: {
  task: Task;
  onStatusChange: (id: string, status: Task["status"]) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function handleStatusChange(newStatus: Task["status"]) {
    setSaving(true);
    try {
      await fetch("/api/admin/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, status: newStatus }),
      });
      onStatusChange(task.id, newStatus);
    } finally {
      setSaving(false);
    }
  }

  const isOverdue =
    task.due_date &&
    task.status !== "completed" &&
    new Date(task.due_date) < new Date();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 truncate">{task.title}</h3>
          {task.description && (
            <p className="mt-0.5 text-sm text-gray-500 line-clamp-2">
              {task.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[task.status]}`}
          >
            {STATUS_LABEL[task.status]}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[task.priority]}`}
          >
            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>
          <span className="font-medium text-gray-700">Assigned to:</span>{" "}
          {task.assigned_to || "Unassigned"}
        </span>
        <span className={isOverdue ? "font-medium text-red-600" : ""}>
          <span className="font-medium text-gray-700">Due:</span>{" "}
          {formatDate(task.due_date)}
          {isOverdue && " (Overdue)"}
        </span>
      </div>

      {task.status !== "completed" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {task.status === "pending" && (
            <button
              disabled={saving}
              onClick={() => handleStatusChange("in_progress")}
              className="rounded-md bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
            >
              Start
            </button>
          )}
          <button
            disabled={saving}
            onClick={() => handleStatusChange("completed")}
            className="rounded-md bg-green-50 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-60"
          >
            Mark Complete
          </button>
        </div>
      )}
    </div>
  );
}

function RecognitionCard({ task }: { task: Task }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400 text-white">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-amber-900">
            {task.assigned_to}
          </p>
          <p className="mt-1 text-sm text-amber-800">{task.recognition_note}</p>
          <p className="mt-2 text-xs text-amber-600">
            From {task.assigned_by} · {formatDate(task.created_at)}
          </p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main page                                                                  */
/* -------------------------------------------------------------------------- */

export default function TasksPage() {
  const [activeTab, setActiveTab] = useState<"tasks" | "recognize">("tasks");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recognitions, setRecognitions] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create task form
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskPriority, setTaskPriority] = useState<"high" | "medium" | "low">("medium");
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [taskSuccess, setTaskSuccess] = useState("");

  // Recognition form
  const [recName, setRecName] = useState("");
  const [recNote, setRecNote] = useState("");
  const [recSubmitting, setRecSubmitting] = useState(false);
  const [recSuccess, setRecSuccess] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [tasksRes, recsRes] = await Promise.all([
        fetch("/api/admin/tasks?type=tasks"),
        fetch("/api/admin/tasks?type=recognitions"),
      ]);
      const tasksData = await tasksRes.json();
      const recsData = await recsRes.json();
      setTasks(tasksData.tasks ?? []);
      setRecognitions(recsData.tasks ?? []);
    } catch {
      setError("Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function handleStatusChange(id: string, status: Task["status"]) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    setTaskSubmitting(true);
    setTaskSuccess("");
    try {
      const res = await fetch("/api/admin/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_task",
          title: taskTitle,
          description: taskDesc,
          assigned_to: taskAssignee,
          due_date: taskDue || undefined,
          priority: taskPriority,
        }),
      });
      if (res.ok) {
        setTaskTitle("");
        setTaskDesc("");
        setTaskAssignee("");
        setTaskDue("");
        setTaskPriority("medium");
        setTaskSuccess("Task created successfully.");
        void loadData();
      }
    } finally {
      setTaskSubmitting(false);
    }
  }

  async function handleRecognize(e: React.FormEvent) {
    e.preventDefault();
    setRecSubmitting(true);
    setRecSuccess("");
    try {
      const res = await fetch("/api/admin/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "recognize",
          employee_name: recName,
          recognition_note: recNote,
        }),
      });
      if (res.ok) {
        setRecName("");
        setRecNote("");
        setRecSuccess("Recognition sent!");
        void loadData();
      }
    } finally {
      setRecSubmitting(false);
    }
  }

  // Stats
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const totalTasks = tasks.length;
  const completedThisWeek = tasks.filter(
    (t) => t.status === "completed" && new Date(t.created_at) >= weekAgo,
  ).length;
  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const recsSent = recognitions.length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Employee Hub</h1>
        <p className="mt-1 text-sm text-gray-500">
          Assign tasks, track progress, and celebrate your team.
        </p>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Tasks" value={totalTasks} color="text-gray-900" />
        <StatCard label="Completed This Week" value={completedThisWeek} color="text-green-600" />
        <StatCard label="Pending" value={pendingCount} color="text-yellow-600" />
        <StatCard label="Recognitions Sent" value={recsSent} color="text-amber-600" />
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        {(["tasks", "recognize"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-white text-brand-600 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab === "tasks" ? "Tasks" : "Recognize"}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tasks tab */}
      {activeTab === "tasks" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Task list */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-base font-semibold text-gray-800">Active Tasks</h2>
            {loading ? (
              <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
            ) : tasks.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
                No tasks yet. Create one to get started.
              </div>
            ) : (
              tasks.map((task) => (
                <TaskCard key={task.id} task={task} onStatusChange={handleStatusChange} />
              ))
            )}
          </div>

          {/* Create task form */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm self-start">
            <h2 className="mb-4 text-base font-semibold text-gray-800">Assign New Task</h2>
            {taskSuccess && (
              <div className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                {taskSuccess}
              </div>
            )}
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Task Title *
                </label>
                <input
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="e.g. Follow up with leads"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Description
                </label>
                <textarea
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
                  placeholder="Additional details…"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Assign To
                </label>
                <input
                  value={taskAssignee}
                  onChange={(e) => setTaskAssignee(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Employee name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={taskDue}
                    onChange={(e) => setTaskDue(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Priority
                  </label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as Task["priority"])}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={taskSubmitting}
                className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {taskSubmitting ? "Creating…" : "Create Task"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Recognize tab */}
      {activeTab === "recognize" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Recognition list */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-base font-semibold text-gray-800">Recent Recognitions</h2>
            {loading ? (
              <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
            ) : recognitions.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-amber-200 py-12 text-center text-sm text-gray-400">
                No recognitions yet. Send one to a team member!
              </div>
            ) : (
              recognitions.map((rec) => <RecognitionCard key={rec.id} task={rec} />)
            )}
          </div>

          {/* Recognition form */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm self-start">
            <h2 className="mb-1 text-base font-semibold text-amber-900">
              Send a Shoutout
            </h2>
            <p className="mb-4 text-xs text-amber-700">
              Celebrate a teammate&apos;s great work publicly.
            </p>
            {recSuccess && (
              <div className="mb-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
                {recSuccess}
              </div>
            )}
            <form onSubmit={handleRecognize} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-amber-800 mb-1">
                  Employee Name *
                </label>
                <input
                  required
                  value={recName}
                  onChange={(e) => setRecName(e.target.value)}
                  className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  placeholder="e.g. Sarah Chen"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-amber-800 mb-1">
                  Recognition Message *
                </label>
                <textarea
                  required
                  value={recNote}
                  onChange={(e) => setRecNote(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"
                  placeholder="Tell the team what made this person stand out…"
                />
              </div>
              <button
                type="submit"
                disabled={recSubmitting}
                className="w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
              >
                {recSubmitting ? "Sending…" : "Send Recognition"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
