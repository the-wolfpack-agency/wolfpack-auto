"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface CallAnalysis {
  callId: string;
  sentiment: { label: string; score: number; confidence: number };
  keyPhrases: { phrase: string; category: string; position: number }[];
  outcome: string;
  purchaseIntent: number;
  objections: string[];
  actionItems: { description: string; dueBy: string; priority: string; assignedTo: string }[];
  qualityScore: {
    overall: number;
    greeting: number;
    discovery: number;
    presentation: number;
    closeAttempt: number;
    professionalism: number;
    feedback: string[];
  };
  analyzedAt: string;
}

interface CallMetrics {
  totalCalls: number;
  avgSentiment: number;
  avgQualityScore: number;
  avgPurchaseIntent: number;
  outcomeDistribution: Record<string, number>;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "bg-emerald-50 text-emerald-700",
  neutral: "bg-gray-100 text-gray-600",
  negative: "bg-red-50 text-red-700",
};

const OUTCOME_LABELS: Record<string, string> = {
  appointment_set: "Appointment Set",
  follow_up_needed: "Follow-Up Needed",
  lost: "Lost",
  information_only: "Information Only",
  sale_closed: "Sale Closed",
};

const OUTCOME_COLORS: Record<string, string> = {
  appointment_set: "bg-brand-50 text-brand-800",
  follow_up_needed: "bg-amber-50 text-amber-700",
  lost: "bg-red-50 text-red-700",
  information_only: "bg-gray-100 text-gray-600",
  sale_closed: "bg-emerald-50 text-emerald-700",
};

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function CallIntelligencePage() {
  const [calls, setCalls] = useState<CallAnalysis[]>([]);
  const [metrics, setMetrics] = useState<CallMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCall, setExpandedCall] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/call-intelligence");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setCalls(data.calls);
        setMetrics(data.metrics);
      } catch {
        setError("Failed to load call intelligence data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function analyzeTranscript() {
    if (!transcript.trim()) return;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/admin/call-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      if (!res.ok) throw new Error("Failed to analyze");
      const data = await res.json();
      setCalls((prev) => [data.analysis, ...prev]);
      setTranscript("");
    } catch {
      setError("Failed to analyze transcript");
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Conversation Intelligence</h1>
        <p className="mt-1 text-sm text-gray-500">
          AI-powered call analysis: sentiment, outcomes, quality scoring, and action items.
        </p>
      </div>

      {/* Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Total Calls</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{metrics.totalCalls}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Avg Quality</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{metrics.avgQualityScore}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Avg Purchase Intent</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{metrics.avgPurchaseIntent}%</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Avg Sentiment</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{metrics.avgSentiment.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Transcript analyzer */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Analyze New Call</h2>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Paste call transcript here..."
          rows={4}
          className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        />
        <button
          onClick={analyzeTranscript}
          disabled={analyzing || !transcript.trim()}
          className="mt-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {analyzing ? "Analyzing..." : "Analyze Transcript"}
        </button>
      </div>

      {/* Call list */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Recent Calls</h2>
        {calls.map((call) => (
          <div
            key={call.callId}
            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-900">{call.callId}</span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    SENTIMENT_COLORS[call.sentiment.label] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {call.sentiment.label}
                </span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    OUTCOME_COLORS[call.outcome] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {OUTCOME_LABELS[call.outcome] ?? call.outcome}
                </span>
              </div>
              <button
                onClick={() =>
                  setExpandedCall(expandedCall === call.callId ? null : call.callId)
                }
                className="text-sm text-brand-700 hover:text-brand-800"
              >
                {expandedCall === call.callId ? "Collapse" : "Details"}
              </button>
            </div>

            {/* Quality bar */}
            <div className="mt-3 flex items-center gap-3">
              <span className="text-xs text-gray-500">Quality:</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${
                    call.qualityScore.overall >= 70
                      ? "bg-emerald-500"
                      : call.qualityScore.overall >= 40
                        ? "bg-amber-500"
                        : "bg-red-500"
                  }`}
                  style={{ width: `${call.qualityScore.overall}%` }}
                />
              </div>
              <span className="text-xs font-medium text-gray-700">{call.qualityScore.overall}</span>
            </div>

            {/* Expanded details */}
            {expandedCall === call.callId && (
              <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
                {/* Action items */}
                {call.actionItems.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">Action Items</h4>
                    <ul className="mt-1 space-y-1">
                      {call.actionItems.map((item, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${
                              item.priority === "high"
                                ? "bg-red-500"
                                : item.priority === "medium"
                                  ? "bg-amber-500"
                                  : "bg-gray-400"
                            }`}
                          />
                          {item.description} ({item.assignedTo})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Quality breakdown */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Quality Breakdown</h4>
                  <div className="mt-2 grid grid-cols-5 gap-2">
                    {["greeting", "discovery", "presentation", "closeAttempt", "professionalism"].map((cat) => (
                      <div key={cat} className="text-center">
                        <p className="text-xs text-gray-500 capitalize">{cat.replace(/([A-Z])/g, " $1")}</p>
                        <p className="text-lg font-bold text-gray-900">
                          {call.qualityScore[cat as keyof typeof call.qualityScore] as number}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Feedback */}
                {call.qualityScore.feedback.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">Coaching Tips</h4>
                    <ul className="mt-1 list-inside list-disc text-sm text-gray-600">
                      {call.qualityScore.feedback.map((tip, i) => (
                        <li key={i}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Objections */}
                {call.objections.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">Objections Detected</h4>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {call.objections.map((obj, i) => (
                        <span
                          key={i}
                          className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700"
                        >
                          {obj}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
