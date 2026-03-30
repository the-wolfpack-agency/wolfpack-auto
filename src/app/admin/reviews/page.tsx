"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Review {
  id: string;
  platform: "google" | "yelp" | "facebook";
  reviewer_name: string;
  rating: number;
  text: string;
  date: string;
  responded: boolean;
  response_text: string | null;
  response_date: string | null;
  flagged: boolean;
}

interface ResponseTemplate {
  id: string;
  name: string;
  category: string;
  text: string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const PLATFORM_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  google: { label: "Google", color: "bg-red-100 text-red-700", icon: "G" },
  yelp: { label: "Yelp", color: "bg-red-100 text-red-600", icon: "Y" },
  facebook: { label: "Facebook", color: "bg-blue-100 text-blue-700", icon: "f" },
};

function renderStars(rating: number): string {
  return "\u2605".repeat(rating) + "\u2606".repeat(5 - rating);
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function ReviewManagementPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [templates, setTemplates] = useState<ResponseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [filterPlatform, setFilterPlatform] = useState("");
  const [filterRating, setFilterRating] = useState("");
  const [filterResponded, setFilterResponded] = useState("");

  // Response state
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [submittingResponse, setSubmittingResponse] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filterPlatform) params.set("platform", filterPlatform);
      if (filterRating) params.set("rating", filterRating);
      if (filterResponded) params.set("responded", filterResponded);
      const qs = params.toString() ? `?${params.toString()}` : "";

      const [revRes, tplRes] = await Promise.all([
        fetch(`/api/admin/reviews${qs}`),
        fetch("/api/admin/reviews/templates"),
      ]);
      const revData = await revRes.json();
      const tplData = await tplRes.json();
      setReviews(revData.reviews ?? []);
      setTemplates(tplData.templates ?? []);
    } catch {
      setError("Failed to load reviews.");
    } finally {
      setLoading(false);
    }
  }, [filterPlatform, filterRating, filterResponded]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function startResponding(reviewId: string) {
    setRespondingTo(reviewId);
    setResponseText("");
  }

  function applyTemplate(tpl: ResponseTemplate, reviewerName: string) {
    setResponseText(tpl.text.replace("{reviewer_name}", reviewerName));
  }

  async function submitResponse(reviewId: string) {
    if (!responseText.trim()) return;
    setSubmittingResponse(true);
    try {
      const res = await fetch(`/api/admin/reviews/${reviewId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response_text: responseText }),
      });
      if (res.ok) {
        setReviews((prev) =>
          prev.map((r) =>
            r.id === reviewId
              ? { ...r, responded: true, response_text: responseText, response_date: new Date().toISOString().split("T")[0] }
              : r,
          ),
        );
        setRespondingTo(null);
        setResponseText("");
      }
    } finally {
      setSubmittingResponse(false);
    }
  }

  // Stats
  const totalReviews = reviews.length;
  const avgRating = totalReviews > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / totalReviews : 0;
  const responseRate = totalReviews > 0 ? Math.round((reviews.filter((r) => r.responded).length / totalReviews) * 100) : 0;

  const byPlatform = reviews.reduce<Record<string, number>>((acc, r) => {
    acc[r.platform] = (acc[r.platform] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Review Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          Monitor and respond to customer reviews across all platforms.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Avg Rating</p>
          <p className="mt-0.5 text-2xl font-bold text-yellow-500">{avgRating.toFixed(1)} <span className="text-sm">/5</span></p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Total Reviews</p>
          <p className="mt-0.5 text-2xl font-bold text-gray-900">{totalReviews}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Response Rate</p>
          <p className="mt-0.5 text-2xl font-bold text-brand-600">{responseRate}%</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium text-gray-500">By Platform</p>
          <div className="mt-1 flex gap-2">
            {Object.entries(byPlatform).map(([p, count]) => (
              <span key={p} className={`rounded-full px-2 py-0.5 text-xs font-medium ${PLATFORM_CONFIG[p]?.color}`}>
                {PLATFORM_CONFIG[p]?.label}: {count}
              </span>
            ))}
          </div>
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
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
        >
          <option value="">All Platforms</option>
          <option value="google">Google</option>
          <option value="yelp">Yelp</option>
          <option value="facebook">Facebook</option>
        </select>
        <select
          value={filterRating}
          onChange={(e) => setFilterRating(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
        >
          <option value="">All Ratings</option>
          <option value="5">5 Stars</option>
          <option value="4">4 Stars</option>
          <option value="3">3 Stars</option>
          <option value="2">2 Stars</option>
          <option value="1">1 Star</option>
        </select>
        <select
          value={filterResponded}
          onChange={(e) => setFilterResponded(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
        >
          <option value="">All</option>
          <option value="true">Responded</option>
          <option value="false">Needs Response</option>
        </select>
      </div>

      {/* Review List */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading...</div>
      ) : reviews.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          No reviews found matching your filters.
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => {
            const pc = PLATFORM_CONFIG[review.platform];
            return (
              <div
                key={review.id}
                className={`rounded-xl border bg-white p-5 shadow-sm ${
                  review.flagged ? "border-red-300 ring-1 ring-red-200" : "border-gray-200"
                }`}
              >
                {/* Header row */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${pc?.color}`}>
                      {pc?.icon}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{review.reviewer_name}</p>
                      <p className="text-xs text-gray-500">{formatDate(review.date)} on {pc?.label}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg text-yellow-400 tracking-wider">{renderStars(review.rating)}</span>
                    {review.flagged && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Flagged</span>
                    )}
                    {review.responded ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Responded</span>
                    ) : (
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">Needs Response</span>
                    )}
                  </div>
                </div>

                {/* Review text */}
                <p className="mt-3 text-sm text-gray-700 leading-relaxed">{review.text}</p>

                {/* Existing response */}
                {review.responded && review.response_text && (
                  <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Your Response ({review.response_date})</p>
                    <p className="text-sm text-gray-600">{review.response_text}</p>
                  </div>
                )}

                {/* Response form */}
                {!review.responded && respondingTo === review.id && (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {templates.map((tpl) => (
                        <button
                          key={tpl.id}
                          onClick={() => applyTemplate(tpl, review.reviewer_name)}
                          className="rounded bg-brand-50 px-2 py-1 text-xs text-brand-600 hover:bg-brand-100 transition"
                        >
                          {tpl.name}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
                      placeholder="Type your response..."
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => submitResponse(review.id)}
                        disabled={submittingResponse || !responseText.trim()}
                        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                      >
                        {submittingResponse ? "Sending..." : "Submit Response"}
                      </button>
                      <button
                        onClick={() => setRespondingTo(null)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                {!review.responded && respondingTo !== review.id && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => startResponding(review.id)}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                    >
                      Respond
                    </button>
                    <button
                      onClick={() =>
                        setReviews((prev) =>
                          prev.map((r) => (r.id === review.id ? { ...r, flagged: !r.flagged } : r)),
                        )
                      }
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                        review.flagged
                          ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                          : "border-gray-300 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {review.flagged ? "Unflag" : "Flag"}
                    </button>
                  </div>
                )}
                {review.responded && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() =>
                        setReviews((prev) =>
                          prev.map((r) => (r.id === review.id ? { ...r, flagged: !r.flagged } : r)),
                        )
                      }
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                        review.flagged
                          ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                          : "border-gray-300 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {review.flagged ? "Unflag" : "Flag"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
