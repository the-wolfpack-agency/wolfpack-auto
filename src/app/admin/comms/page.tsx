"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/safe-fetch";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Announcement {
  id: string;
  title: string;
  body: string;
  author: string;
  audience: "all" | "sales" | "service" | "management";
  pinned: boolean;
  created_at: string;
  read_count: number;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const AUDIENCE_LABELS: Record<Announcement["audience"], string> = {
  all: "All Staff",
  sales: "Sales Team",
  service: "Service",
  management: "Management",
};

const AUDIENCE_BADGE: Record<Announcement["audience"], string> = {
  all: "bg-brand-100 text-brand-800",
  sales: "bg-purple-100 text-purple-700",
  service: "bg-orange-100 text-orange-700",
  management: "bg-gray-100 text-gray-700",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className ?? "h-4 w-4"}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599.8a1 1 0 01-.484 1.862L14 8.5V13a1 1 0 01-.553.894L10 15.618 6.553 13.894A1 1 0 016 13V8.5l-2.069-.933a1 1 0 01-.485-1.862l1.6-.8L9 3.323V3a1 1 0 011-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function AnnouncementCard({ ann }: { ann: Announcement }) {
  const [expanded, setExpanded] = useState(false);
  const bodyPreview = ann.body.length > 150 ? ann.body.slice(0, 150) + "…" : ann.body;

  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        ann.pinned ? "border-brand-300 ring-1 ring-brand-200" : "border-gray-200"
      }`}
    >
      <div className="flex flex-wrap items-start gap-2">
        {ann.pinned && (
          <span className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600">
            <PinIcon className="h-3 w-3" />
            Pinned
          </span>
        )}
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${AUDIENCE_BADGE[ann.audience]}`}
        >
          {AUDIENCE_LABELS[ann.audience]}
        </span>
      </div>

      <h3 className="mt-2 font-semibold text-gray-900">{ann.title}</h3>
      <p className="mt-1 text-sm text-gray-600">
        {expanded ? ann.body : bodyPreview}
        {ann.body.length > 150 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="ml-1 text-brand-600 hover:underline text-xs"
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
      </p>

      <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
        <span>{ann.author}</span>
        <span>{timeAgo(ann.created_at)}</span>
        <span className="flex items-center gap-1">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
            <path
              fillRule="evenodd"
              d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
              clipRule="evenodd"
            />
          </svg>
          {ann.read_count} read
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main page                                                                  */
/* -------------------------------------------------------------------------- */

export default function CommsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Compose form
  const [compTitle, setCompTitle] = useState("");
  const [compBody, setCompBody] = useState("");
  const [compAudience, setCompAudience] = useState<Announcement["audience"]>("all");
  const [compPinned, setCompPinned] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState("");

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<{ announcements?: Announcement[] }>("/api/admin/comms");
      setAnnouncements(data.announcements ?? []);
    } catch {
      setError("Failed to load announcements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnnouncements();
  }, [loadAnnouncements]);

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    setPublishing(true);
    setPublishSuccess("");
    try {
      const res = await fetch("/api/admin/comms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: compTitle,
          body: compBody,
          audience: compAudience,
          pinned: compPinned,
        }),
      });
      if (res.ok) {
        setCompTitle("");
        setCompBody("");
        setCompAudience("all");
        setCompPinned(false);
        setPublishSuccess("Announcement published!");
        void loadAnnouncements();
      }
    } finally {
      setPublishing(false);
    }
  }

  const pinnedCount = announcements.filter((a) => a.pinned).length;
  const totalCount = announcements.length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Comms Platform</h1>
        <p className="mt-1 text-sm text-gray-500">
          Publish announcements to your entire team or specific departments.
        </p>
      </div>

      {/* Stat strip */}
      <div className="mb-6 flex flex-wrap gap-4">
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Total Announcements</p>
          <p className="mt-0.5 text-2xl font-bold text-gray-900">{totalCount}</p>
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-brand-700">Pinned</p>
          <p className="mt-0.5 text-2xl font-bold text-brand-700">{pinnedCount}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Announcement feed */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-base font-semibold text-gray-800">Announcements</h2>
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
          ) : announcements.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
              No announcements yet. Publish one to get started.
            </div>
          ) : (
            announcements.map((ann) => (
              <AnnouncementCard key={ann.id} ann={ann} />
            ))
          )}
        </div>

        {/* Compose panel */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm self-start">
          <h2 className="mb-4 text-base font-semibold text-gray-800">Compose Announcement</h2>

          {publishSuccess && (
            <div className="mb-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
              {publishSuccess}
            </div>
          )}

          <form onSubmit={handlePublish} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Title *
              </label>
              <input
                required
                value={compTitle}
                onChange={(e) => setCompTitle(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Announcement headline"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Message *
              </label>
              <textarea
                required
                value={compBody}
                onChange={(e) => setCompBody(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
                placeholder="Write your announcement…"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Audience *
              </label>
              <select
                value={compAudience}
                onChange={(e) =>
                  setCompAudience(e.target.value as Announcement["audience"])
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="all">All Staff</option>
                <option value="sales">Sales Team</option>
                <option value="service">Service</option>
                <option value="management">Management</option>
              </select>
            </div>

            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={compPinned}
                onChange={(e) => setCompPinned(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700">Pin to top</span>
            </label>

            <button
              type="submit"
              disabled={publishing}
              className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {publishing ? "Publishing…" : "Publish"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
