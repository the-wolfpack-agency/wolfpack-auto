"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface Touchpoint {
  id: string;
  channel: string;
  timestamp: string;
  summary: string;
  metadata: Record<string, string | number | boolean>;
}

interface OmnichannelProfile {
  customerId: string;
  dealerId: string;
  touchpoints: Touchpoint[];
  channels: string[];
  firstContact: string;
  lastContact: string;
  totalInteractions: number;
  preferredChannel: string;
}

interface HandoffData {
  handoffId: string;
  customerId: string;
  fromChannel: string;
  toChannel: string;
  qrUrl: string;
  createdAt: string;
  expiresAt: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const CHANNEL_COLORS: Record<string, string> = {
  online: "bg-brand-50 text-brand-800",
  in_store: "bg-emerald-50 text-emerald-700",
  phone: "bg-purple-50 text-purple-700",
  email: "bg-amber-50 text-amber-700",
  sms: "bg-pink-50 text-pink-700",
};

const CHANNEL_LABELS: Record<string, string> = {
  online: "Online",
  in_store: "In-Store",
  phone: "Phone",
  email: "Email",
  sms: "SMS",
};

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function OmnichannelPage() {
  const [profile, setProfile] = useState<OmnichannelProfile | null>(null);
  const [handoff, setHandoff] = useState<HandoffData | null>(null);
  const [searchId, setSearchId] = useState("cust-demo-001");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadProfile(customerId?: string) {
    setLoading(true);
    setError(null);
    try {
      const cid = customerId ?? searchId;
      const res = await fetch(`/api/admin/omnichannel?customerId=${encodeURIComponent(cid)}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setProfile(data.profile);
    } catch {
      setError("Failed to load omnichannel profile");
    } finally {
      setLoading(false);
    }
  }

  async function createHandoff() {
    if (!profile) return;
    try {
      const res = await fetch("/api/admin/omnichannel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_handoff",
          customerId: profile.customerId,
          fromChannel: "online",
          toChannel: "in_store",
        }),
      });
      if (!res.ok) throw new Error("Failed to create handoff");
      const data = await res.json();
      setHandoff(data.handoff);
    } catch {
      setError("Failed to create handoff");
    }
  }

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Omnichannel Continuity</h1>
        <p className="mt-1 text-sm text-gray-500">
          Unified customer timeline across online, in-store, phone, email, and SMS.
        </p>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <input
          type="text"
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
          placeholder="Customer ID..."
          className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        />
        <button
          onClick={() => loadProfile()}
          className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
        >
          Search
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {profile && !loading && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">Total Interactions</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{profile.totalInteractions}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">Channels Used</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{profile.channels.length}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">Preferred Channel</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{CHANNEL_LABELS[profile.preferredChannel] ?? profile.preferredChannel}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">First Contact</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{formatDate(profile.firstContact)}</p>
            </div>
          </div>

          {/* Handoff Generator */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Create Handoff</h2>
            <p className="mt-1 text-sm text-gray-500">
              Generate a QR code so in-store staff can continue this customer's online session.
            </p>
            <button
              onClick={createHandoff}
              className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Generate QR Handoff
            </button>
            {handoff && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-medium text-emerald-700">
                  Handoff created: {handoff.fromChannel} to {handoff.toChannel}
                </p>
                <p className="mt-1 text-xs text-emerald-600">
                  QR URL: {handoff.qrUrl}
                </p>
                <p className="mt-1 text-xs text-emerald-600">
                  Expires: {formatDate(handoff.expiresAt)}
                </p>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Unified Timeline</h2>
            <div className="mt-4 space-y-3">
              {profile.touchpoints.map((tp) => (
                <div
                  key={tp.id}
                  className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3"
                >
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      CHANNEL_COLORS[tp.channel] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {CHANNEL_LABELS[tp.channel] ?? tp.channel}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{tp.summary}</p>
                    <p className="text-xs text-gray-400">{formatDate(tp.timestamp)}</p>
                  </div>
                </div>
              ))}
              {profile.touchpoints.length === 0 && (
                <p className="text-sm text-gray-400">No interactions recorded.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
