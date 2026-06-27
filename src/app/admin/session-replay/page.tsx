"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/safe-fetch";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ReplaySession {
  session_id: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number;
  pages_visited: string[];
  event_count: number;
  conversion: boolean;
  user_agent: string;
  viewport: { width: number; height: number };
}

interface ReplayEvent {
  seq: number;
  ts: number;
  type: string;
  data: Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s}s`;
}

function deviceLabel(ua: string): string {
  if (/iPhone|Android.*Mobile/i.test(ua)) return "Mobile";
  if (/iPad|Android(?!.*Mobile)/i.test(ua)) return "Tablet";
  return "Desktop";
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function SessionReplayPage() {
  const [sessions, setSessions] = useState<ReplaySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<ReplayEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  useEffect(() => {
    fetchJson<{ sessions?: ReplaySession[] }>("/api/admin/session-replay")
      .then((data) => setSessions(data.sessions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const viewSession = useCallback(async (sessionId: string) => {
    setSelected(sessionId);
    setEventsLoading(true);
    try {
      const data = await fetchJson<{ events?: ReplayEvent[] }>(`/api/admin/session-replay?sessionId=${sessionId}`);
      setEvents(data.events ?? []);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  // Detail view
  if (selected) {
    const session = sessions.find((s) => s.session_id === selected);

    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <button
          onClick={() => { setSelected(null); setEvents([]); }}
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; Back to sessions
        </button>

        <h1 className="text-2xl font-bold text-gray-900">
          Session {selected.slice(0, 12)}...
        </h1>

        {session && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Duration" value={formatDuration(session.duration_ms)} />
            <Stat label="Pages" value={String(session.pages_visited.length)} />
            <Stat label="Events" value={String(session.event_count)} />
            <Stat
              label="Conversion"
              value={session.conversion ? "Yes" : "No"}
              color={session.conversion ? "text-green-600" : "text-gray-500"}
            />
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-900">Event Timeline</h2>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            {eventsLoading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
              </div>
            ) : events.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No events recorded.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2">#</th>
                    <th className="px-4 py-2">Time</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {events.map((ev) => (
                    <tr key={ev.seq} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-400">{ev.seq}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-600">
                        {new Date(ev.ts).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeColor(ev.type)}`}>
                          {ev.type}
                        </span>
                      </td>
                      <td className="max-w-xs truncate px-4 py-2 text-gray-600">
                        {summarizeEvent(ev)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Session Replay</h1>
          <p className="mt-1 text-sm text-gray-500">
            Watch how visitors interact with your site. All input values are masked for privacy.
          </p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          {sessions.length} sessions
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Session</th>
              <th className="px-4 py-3">Device</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Pages</th>
              <th className="px-4 py-3">Events</th>
              <th className="px-4 py-3">Conversion</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sessions.map((s) => (
              <tr key={s.session_id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-600">
                  {s.session_id.slice(0, 12)}...
                </td>
                <td className="px-4 py-3 text-gray-700">{deviceLabel(s.user_agent)}</td>
                <td className="px-4 py-3 text-gray-700">{formatDuration(s.duration_ms)}</td>
                <td className="px-4 py-3 text-gray-700">{s.pages_visited.length}</td>
                <td className="px-4 py-3 text-gray-700">{s.event_count}</td>
                <td className="px-4 py-3">
                  {s.conversion ? (
                    <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      Converted
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                      Browsed
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(s.started_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => viewSession(s.session_id)}
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

function Stat({
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

function typeColor(type: string): string {
  switch (type) {
    case "click":
      return "bg-blue-50 text-blue-700";
    case "page_navigation":
      return "bg-purple-50 text-purple-700";
    case "input_change":
      return "bg-amber-50 text-amber-700";
    case "scroll":
      return "bg-gray-100 text-gray-600";
    case "error":
      return "bg-red-50 text-red-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function summarizeEvent(ev: ReplayEvent): string {
  switch (ev.type) {
    case "page_navigation":
      return `Navigated to ${ev.data.pathname ?? ev.data.url ?? "page"}`;
    case "click":
      return `Clicked ${ev.data.target_tag ?? "element"}${ev.data.target_id ? `#${ev.data.target_id}` : ""}`;
    case "input_change":
      return `Interacted with ${ev.data.input_type ?? "text"} input`;
    case "scroll":
      return `Scrolled to ${ev.data.scrollY ?? 0}px`;
    case "error":
      return `Error: ${ev.data.message ?? "Unknown"}`;
    default:
      return ev.type;
  }
}
