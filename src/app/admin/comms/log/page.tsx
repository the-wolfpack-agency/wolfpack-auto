"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/safe-fetch";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface MessageLogEntry {
  id: string;
  channel: "email" | "sms";
  recipient: string;
  recipient_name: string;
  subject: string | null;
  body_preview: string;
  template_id: string | null;
  lead_id: string | null;
  status: "sent" | "delivered" | "opened" | "bounced" | "failed";
  sent_by: string;
  sent_at: string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STATUS_BADGE: Record<string, string> = {
  sent: "bg-brand-100 text-brand-800",
  delivered: "bg-green-100 text-green-700",
  opened: "bg-emerald-100 text-emerald-700",
  bounced: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
};

const CHANNEL_ICON: Record<string, string> = {
  email: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  sms: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function MessageLogPage() {
  const [messages, setMessages] = useState<MessageLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [filterChannel, setFilterChannel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filterChannel) params.set("channel", filterChannel);
      if (filterStatus) params.set("status", filterStatus);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const data = await fetchJson<{ messages?: MessageLogEntry[] }>(`/api/admin/comms/log${qs}`);
      setMessages(data.messages ?? []);
    } catch {
      setError("Failed to load message log.");
    } finally {
      setLoading(false);
    }
  }, [filterChannel, filterStatus]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const totalSent = messages.length;
  const delivered = messages.filter((m) => m.status === "delivered" || m.status === "opened").length;
  const opened = messages.filter((m) => m.status === "opened").length;
  const failed = messages.filter((m) => m.status === "failed" || m.status === "bounced").length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Message Log</h1>
        <p className="mt-1 text-sm text-gray-500">
          Complete history of all outbound messages.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Total Sent</p>
          <p className="mt-0.5 text-xl font-bold text-gray-900">{totalSent}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Delivered</p>
          <p className="mt-0.5 text-xl font-bold text-green-600">{delivered}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Opened</p>
          <p className="mt-0.5 text-xl font-bold text-emerald-600">{opened}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Failed / Bounced</p>
          <p className="mt-0.5 text-xl font-bold text-red-600">{failed}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={filterChannel}
          onChange={(e) => setFilterChannel(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
        >
          <option value="">All Channels</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="sent">Sent</option>
          <option value="delivered">Delivered</option>
          <option value="opened">Opened</option>
          <option value="bounced">Bounced</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Log Table */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading...</div>
      ) : messages.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          No messages found matching your filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recipient</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">Channel</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Subject / Preview</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Sent By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Lead</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {messages.map((msg) => (
                <tr key={msg.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatDate(msg.sent_at)}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{msg.recipient_name}</p>
                    <p className="text-xs text-gray-500">{msg.recipient}</p>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="inline-flex items-center gap-1">
                      <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={CHANNEL_ICON[msg.channel]} />
                      </svg>
                      <span className="text-xs text-gray-600 capitalize">{msg.channel}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell max-w-xs">
                    <p className="text-sm text-gray-700 truncate">
                      {msg.subject ?? msg.body_preview}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[msg.status]}`}>
                      {msg.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs text-gray-600">{msg.sent_by}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {msg.lead_id ? (
                      <a
                        href={`/admin/leads?id=${msg.lead_id}`}
                        className="text-xs text-brand-600 hover:underline"
                      >
                        {msg.lead_id}
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">--</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
