/**
 * Reputation Monitoring — Aggregate reviews across Google, Yelp, Facebook,
 * and DealerRater, detect sentiment shifts, and suggest responses.
 *
 * Replaces manual review monitoring with automated alerting and
 * AI-assisted response generation.
 */

import { trackReview } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ReviewSource = "google" | "yelp" | "facebook" | "dealerrater";

export interface Review {
  id: string;
  source: ReviewSource;
  author: string;
  rating: number; // 1-5
  text: string;
  date: string;
  responded: boolean;
  responseText?: string;
}

export interface ReputationScore {
  overall: number; // weighted average 1-5
  totalReviews: number;
  bySource: {
    source: ReviewSource;
    avgRating: number;
    count: number;
    weight: number;
  }[];
  ratingDistribution: Record<number, number>; // 1-5 → count
}

export interface ReviewAlert {
  id: string;
  type: "negative_review" | "unanswered_review" | "rating_drop" | "sentiment_shift";
  severity: "low" | "medium" | "high";
  message: string;
  reviewId?: string;
  createdAt: string;
}

export interface SentimentTrend {
  period: string;
  avgRating: number;
  reviewCount: number;
  trend: "up" | "down" | "stable";
}

export interface ResponseSuggestion {
  reviewId: string;
  tone: "professional" | "empathetic" | "enthusiastic";
  suggestedResponse: string;
}

/* -------------------------------------------------------------------------- */
/*  Source weights — Google carries the most weight for SEO                     */
/* -------------------------------------------------------------------------- */

const SOURCE_WEIGHTS: Record<ReviewSource, number> = {
  google: 0.45,
  yelp: 0.20,
  facebook: 0.20,
  dealerrater: 0.15,
};

/* -------------------------------------------------------------------------- */
/*  Score calculation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Calculate a weighted reputation score across all platforms.
 */
export function calculateReputationScore(reviews: Review[]): ReputationScore {
  if (reviews.length === 0) {
    return {
      overall: 0,
      totalReviews: 0,
      bySource: [],
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }

  // Group by source
  const bySource = new Map<ReviewSource, number[]>();
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  for (const review of reviews) {
    if (!bySource.has(review.source)) bySource.set(review.source, []);
    bySource.get(review.source)!.push(review.rating);
    const bucket = Math.max(1, Math.min(5, Math.round(review.rating)));
    dist[bucket] = (dist[bucket] ?? 0) + 1;
  }

  const sourceScores: ReputationScore["bySource"] = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [source, ratings] of bySource) {
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    const weight = SOURCE_WEIGHTS[source] ?? 0.1;
    sourceScores.push({ source, avgRating: Math.round(avg * 10) / 10, count: ratings.length, weight });
    weightedSum += avg * weight;
    totalWeight += weight;
  }

  const overall = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 0;

  return {
    overall,
    totalReviews: reviews.length,
    bySource: sourceScores,
    ratingDistribution: dist,
  };
}

/* -------------------------------------------------------------------------- */
/*  Sentiment shift detection                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Detect if the average rating is trending down over recent days.
 */
export function detectSentimentShift(
  reviews: Review[],
  days: number,
): SentimentTrend[] {
  if (reviews.length === 0) return [];

  const now = Date.now();
  const cutoff = now - days * 86400_000;
  const recentReviews = reviews.filter((r) => new Date(r.date).getTime() >= cutoff);

  if (recentReviews.length === 0) return [];

  // Group by week
  const weekMap = new Map<string, number[]>();
  for (const review of recentReviews) {
    const date = new Date(review.date);
    const weekStart = new Date(date);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const key = weekStart.toISOString().split("T")[0];
    if (!weekMap.has(key)) weekMap.set(key, []);
    weekMap.get(key)!.push(review.rating);
  }

  const sortedWeeks = Array.from(weekMap.keys()).sort();
  const trends: SentimentTrend[] = [];

  for (let i = 0; i < sortedWeeks.length; i++) {
    const key = sortedWeeks[i];
    const ratings = weekMap.get(key)!;
    const avg = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;

    let trend: "up" | "down" | "stable" = "stable";
    if (i > 0) {
      const prevRatings = weekMap.get(sortedWeeks[i - 1])!;
      const prevAvg = prevRatings.reduce((a, b) => a + b, 0) / prevRatings.length;
      if (avg > prevAvg + 0.2) trend = "up";
      else if (avg < prevAvg - 0.2) trend = "down";
    }

    trends.push({
      period: key,
      avgRating: avg,
      reviewCount: ratings.length,
      trend,
    });
  }

  return trends;
}

/* -------------------------------------------------------------------------- */
/*  Review alerts                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Generate alerts for new negative reviews, unanswered reviews, and rating drops.
 */
export function getReviewAlerts(reviews: Review[]): ReviewAlert[] {
  const alerts: ReviewAlert[] = [];
  const now = new Date().toISOString();
  const threeDaysAgo = Date.now() - 3 * 86400_000;

  // Negative reviews (1-2 stars) in last 3 days
  const recentNegative = reviews.filter(
    (r) => r.rating <= 2 && new Date(r.date).getTime() >= threeDaysAgo,
  );
  for (const review of recentNegative) {
    alerts.push({
      id: `alert_neg_${review.id}`,
      type: "negative_review",
      severity: review.rating === 1 ? "high" : "medium",
      message: `${review.rating}-star review from ${review.author} on ${review.source}: "${review.text.slice(0, 80)}..."`,
      reviewId: review.id,
      createdAt: now,
    });
  }

  // Unanswered reviews older than 24h
  const oneDayAgo = Date.now() - 86400_000;
  const unanswered = reviews.filter(
    (r) => !r.responded && new Date(r.date).getTime() < oneDayAgo,
  );
  if (unanswered.length > 0) {
    alerts.push({
      id: `alert_unans_${Date.now()}`,
      type: "unanswered_review",
      severity: unanswered.length > 5 ? "high" : "medium",
      message: `${unanswered.length} reviews awaiting response (oldest: ${unanswered.length > 0 ? unanswered[unanswered.length - 1].date : "N/A"})`,
      createdAt: now,
    });
  }

  // Rating drop detection
  const sortedByDate = [...reviews].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  if (sortedByDate.length >= 10) {
    const recentSlice = sortedByDate.slice(-5);
    const olderSlice = sortedByDate.slice(-10, -5);

    const recentAvg = recentSlice.reduce((s, r) => s + r.rating, 0) / recentSlice.length;
    const olderAvg = olderSlice.reduce((s, r) => s + r.rating, 0) / olderSlice.length;

    if (recentAvg < olderAvg - 0.5) {
      alerts.push({
        id: `alert_drop_${Date.now()}`,
        type: "rating_drop",
        severity: recentAvg < olderAvg - 1.0 ? "high" : "medium",
        message: `Rating trending down: recent avg ${recentAvg.toFixed(1)} vs previous ${olderAvg.toFixed(1)}`,
        createdAt: now,
      });
    }
  }

  return alerts;
}

/* -------------------------------------------------------------------------- */
/*  Response suggestion                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Generate a suggested response for a review based on its content and sentiment.
 */
export function generateReviewResponse(
  review: Review,
  tone: "professional" | "empathetic" | "enthusiastic" = "professional",
): ResponseSuggestion {
  const dealerName = "our dealership";
  let response: string;

  if (review.rating >= 4) {
    // Positive review
    switch (tone) {
      case "enthusiastic":
        response = `Thank you so much, ${review.author}! We're thrilled to hear about your experience. Your kind words mean the world to our team. We look forward to seeing you again!`;
        break;
      case "empathetic":
        response = `${review.author}, thank you for sharing your experience with us. We truly appreciate your trust in ${dealerName} and are glad we could meet your expectations.`;
        break;
      default:
        response = `Thank you for your review, ${review.author}. We appreciate your business and are pleased you had a positive experience at ${dealerName}. We look forward to serving you again.`;
    }
  } else if (review.rating === 3) {
    // Neutral review
    response = `Thank you for your feedback, ${review.author}. We appreciate you taking the time to share your experience. We'd love the opportunity to exceed your expectations next time. Please don't hesitate to reach out to us directly.`;
  } else {
    // Negative review
    switch (tone) {
      case "empathetic":
        response = `${review.author}, we're truly sorry to hear about your experience. This is not the standard we hold ourselves to. We'd like to make this right — please contact our management team directly so we can address your concerns personally.`;
        break;
      case "enthusiastic":
        response = `${review.author}, thank you for bringing this to our attention. We take every piece of feedback seriously and want to turn this around for you. Please reach out to us — we're committed to making things right!`;
        break;
      default:
        response = `${review.author}, we sincerely apologize for your experience. Your feedback is important to us, and we'd like to address your concerns directly. Please contact our Customer Relations team at your convenience.`;
    }
  }

  return {
    reviewId: review.id,
    tone,
    suggestedResponse: response,
  };
}

/* -------------------------------------------------------------------------- */
/*  Demo data                                                                  */
/* -------------------------------------------------------------------------- */

export function getDemoReviews(): Review[] {
  return [
    { id: "rev_001", source: "google", author: "John M.", rating: 5, text: "Excellent experience buying my F-150. Sales team was knowledgeable and no-pressure. Best dealership in Austin!", date: new Date(Date.now() - 86400_000).toISOString(), responded: true, responseText: "Thank you, John!" },
    { id: "rev_002", source: "google", author: "Sarah K.", rating: 4, text: "Good selection of vehicles. Financing was smooth. Only minor issue was wait time for paperwork.", date: new Date(Date.now() - 172800_000).toISOString(), responded: true },
    { id: "rev_003", source: "yelp", author: "Mike R.", rating: 2, text: "Service department took way too long for an oil change. Was told 1 hour, waited almost 3. Not happy.", date: new Date(Date.now() - 259200_000).toISOString(), responded: false },
    { id: "rev_004", source: "google", author: "Emily T.", rating: 5, text: "Second car I've purchased here. Always a great experience. Love the home delivery option!", date: new Date(Date.now() - 345600_000).toISOString(), responded: true },
    { id: "rev_005", source: "facebook", author: "David L.", rating: 4, text: "Fair prices and friendly staff. Would recommend to friends.", date: new Date(Date.now() - 432000_000).toISOString(), responded: false },
    { id: "rev_006", source: "dealerrater", author: "Lisa W.", rating: 5, text: "Amazing trade-in value and the finance manager found us a great rate. Very transparent.", date: new Date(Date.now() - 518400_000).toISOString(), responded: true },
    { id: "rev_007", source: "google", author: "Chris P.", rating: 1, text: "Worst experience ever. Hidden fees everywhere. Will never come back.", date: new Date(Date.now() - 86400_000).toISOString(), responded: false },
    { id: "rev_008", source: "yelp", author: "Amanda G.", rating: 4, text: "Clean facility, nice lounge while waiting. Good coffee!", date: new Date(Date.now() - 604800_000).toISOString(), responded: false },
    { id: "rev_009", source: "google", author: "Robert H.", rating: 5, text: "They went above and beyond to find the exact color and trim I wanted. Delivered to my door!", date: new Date(Date.now() - 691200_000).toISOString(), responded: true },
    { id: "rev_010", source: "facebook", author: "Jennifer S.", rating: 3, text: "Average experience. Nothing bad but nothing memorable either.", date: new Date(Date.now() - 777600_000).toISOString(), responded: false },
    { id: "rev_011", source: "google", author: "Tom B.", rating: 5, text: "Best dealer website I've ever used. Found exactly what I needed in minutes.", date: new Date(Date.now() - 864000_000).toISOString(), responded: true },
    { id: "rev_012", source: "dealerrater", author: "Nancy F.", rating: 4, text: "Professional and courteous. Quick turnaround on service appointment.", date: new Date(Date.now() - 950400_000).toISOString(), responded: true },
  ];
}
