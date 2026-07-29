"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Review {
  id: string;
  source: string;
  author: string;
  rating: number;
  text: string;
  date: string;
  responded: boolean;
  responseText?: string;
}

interface ReputationScore {
  overall: number;
  totalReviews: number;
  bySource: { source: string; avgRating: number; count: number }[];
  ratingDistribution: Record<number, number>;
}

interface ReviewAlert {
  id: string;
  type: string;
  severity: string;
  message: string;
  reviewId?: string;
}

interface SentimentTrend {
  period: string;
  avgRating: number;
  reviewCount: number;
  trend: "up" | "down" | "stable";
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function starDisplay(rating: number): string {
  return "\u2605".repeat(Math.round(rating)) + "\u2606".repeat(5 - Math.round(rating));
}

function sourceIcon(source: string): string {
  const icons: Record<string, string> = {
    google: "G",
    yelp: "Y",
    facebook: "f",
    dealerrater: "DR",
  };
  return icons[source] ?? source[0].toUpperCase();
}

function sourceColor(source: string): string {
  const colors: Record<string, string> = {
    google: "bg-brand-100 text-brand-900",
    yelp: "bg-red-100 text-red-800",
    facebook: "bg-brand-100 text-brand-900",
    dealerrater: "bg-green-100 text-green-800",
  };
  return colors[source] ?? "bg-gray-100 text-gray-800";
}

function trendIcon(trend: string): string {
  if (trend === "up") return "\u2191";
  if (trend === "down") return "\u2193";
  return "\u2192";
}

function trendColor(trend: string): string {
  if (trend === "up") return "text-green-600";
  if (trend === "down") return "text-red-600";
  return "text-gray-500";
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function ReputationPage() {
  const [score, setScore] = useState<ReputationScore | null>(null);
  const [alerts, setAlerts] = useState<ReviewAlert[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [trends, setTrends] = useState<SentimentTrend[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reputation");
      if (res.ok) {
        const data = await res.json();
        setScore(data.score);
        setAlerts(data.alerts ?? []);
        setReviews(data.reviews ?? []);
        setTrends(data.trends ?? []);
      }
    } catch {
      // swallow
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-6 text-center text-sm text-gray-500">
        Loading reputation data...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reputation Monitor</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track reviews across Google, Yelp, Facebook, and DealerRater in one place.
        </p>
      </div>

      {/* Score overview */}
      {score && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Overall Rating</p>
            <p className="text-3xl font-bold text-gray-900">{score.overall}</p>
            <p className="text-lg text-yellow-500">{starDisplay(score.overall)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Total Reviews</p>
            <p className="text-3xl font-bold text-gray-900">{score.totalReviews}</p>
          </div>
          {score.bySource.map((s) => (
            <div key={s.source} className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-500 capitalize">{s.source}</p>
              <p className="text-2xl font-bold text-gray-900">{s.avgRating}</p>
              <p className="text-xs text-gray-400">{s.count} reviews</p>
            </div>
          ))}
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="text-sm font-semibold text-red-800">
            Review Alerts ({alerts.length})
          </h3>
          <ul className="mt-2 space-y-2">
            {alerts.map((alert) => (
              <li key={alert.id} className="flex items-start gap-2 text-sm text-red-700">
                <span
                  className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    alert.severity === "high"
                      ? "bg-red-200 text-red-900"
                      : alert.severity === "medium"
                        ? "bg-orange-200 text-orange-900"
                        : "bg-yellow-200 text-yellow-900"
                  }`}
                >
                  {alert.severity}
                </span>
                <span>{alert.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sentiment trend */}
      {trends.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Sentiment Trend</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {trends.map((t) => (
              <div key={t.period} className="rounded-lg border border-gray-100 p-3 text-center">
                <p className="text-xs text-gray-500">{t.period}</p>
                <p className="text-lg font-bold text-gray-900">{t.avgRating}</p>
                <p className={`text-sm font-medium ${trendColor(t.trend)}`}>
                  {trendIcon(t.trend)} {t.reviewCount} reviews
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review feed */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Reviews</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {reviews.map((review) => (
            <div key={review.id} className="px-6 py-4">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${sourceColor(review.source)}`}
                >
                  {sourceIcon(review.source)}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{review.author}</span>
                    <span className="text-yellow-500 text-sm">{starDisplay(review.rating)}</span>
                    {review.responded && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        Responded
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {review.source} - {new Date(review.date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-sm text-gray-700">{review.text}</p>
              {!review.responded && (
                <button className="mt-2 text-xs font-medium text-brand-700 hover:text-brand-900">
                  Suggest Response
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
