/**
 * Reputation Monitoring tests.
 */

import {
  calculateReputationScore,
  detectSentimentShift,
  getReviewAlerts,
  generateReviewResponse,
  getDemoReviews,
  type Review,
} from "@/lib/reputation-monitor";

/* -------------------------------------------------------------------------- */
/*  Score calculation                                                           */
/* -------------------------------------------------------------------------- */

describe("calculateReputationScore", () => {
  it("calculates weighted score across sources", () => {
    const reviews: Review[] = [
      { id: "1", source: "google", author: "A", rating: 5, text: "Great", date: "2026-04-01", responded: true },
      { id: "2", source: "google", author: "B", rating: 4, text: "Good", date: "2026-04-01", responded: true },
      { id: "3", source: "yelp", author: "C", rating: 3, text: "OK", date: "2026-04-01", responded: false },
    ];

    const score = calculateReputationScore(reviews);
    expect(score.overall).toBeGreaterThan(0);
    expect(score.overall).toBeLessThanOrEqual(5);
    expect(score.totalReviews).toBe(3);
    expect(score.bySource.length).toBe(2);
  });

  it("returns zero for empty reviews", () => {
    const score = calculateReputationScore([]);
    expect(score.overall).toBe(0);
    expect(score.totalReviews).toBe(0);
  });

  it("weights Google higher than other sources", () => {
    // All 5s on Google vs all 3s on Yelp should average closer to 5
    const reviews: Review[] = [
      { id: "1", source: "google", author: "A", rating: 5, text: "", date: "2026-04-01", responded: true },
      { id: "2", source: "yelp", author: "B", rating: 3, text: "", date: "2026-04-01", responded: true },
    ];
    const score = calculateReputationScore(reviews);
    expect(score.overall).toBeGreaterThan(4); // Google weighted 0.45 vs Yelp 0.20
  });

  it("produces correct rating distribution", () => {
    const reviews: Review[] = [
      { id: "1", source: "google", author: "A", rating: 5, text: "", date: "2026-04-01", responded: true },
      { id: "2", source: "google", author: "B", rating: 5, text: "", date: "2026-04-01", responded: true },
      { id: "3", source: "google", author: "C", rating: 3, text: "", date: "2026-04-01", responded: true },
      { id: "4", source: "google", author: "D", rating: 1, text: "", date: "2026-04-01", responded: true },
    ];
    const score = calculateReputationScore(reviews);
    expect(score.ratingDistribution[5]).toBe(2);
    expect(score.ratingDistribution[3]).toBe(1);
    expect(score.ratingDistribution[1]).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  Sentiment shift detection                                                  */
/* -------------------------------------------------------------------------- */

describe("detectSentimentShift", () => {
  it("detects trending direction", () => {
    const now = Date.now();
    const reviews: Review[] = [
      // Old week — low ratings
      { id: "1", source: "google", author: "A", rating: 2, text: "", date: new Date(now - 14 * 86400_000).toISOString(), responded: true },
      { id: "2", source: "google", author: "B", rating: 2, text: "", date: new Date(now - 13 * 86400_000).toISOString(), responded: true },
      // Recent week — high ratings
      { id: "3", source: "google", author: "C", rating: 5, text: "", date: new Date(now - 2 * 86400_000).toISOString(), responded: true },
      { id: "4", source: "google", author: "D", rating: 5, text: "", date: new Date(now - 1 * 86400_000).toISOString(), responded: true },
    ];

    const trends = detectSentimentShift(reviews, 30);
    expect(trends.length).toBeGreaterThan(0);

    // Last trend should show improvement
    const lastTrend = trends[trends.length - 1];
    expect(lastTrend.trend).toBe("up");
  });

  it("returns empty for no reviews", () => {
    expect(detectSentimentShift([], 30)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/*  Review alerts                                                              */
/* -------------------------------------------------------------------------- */

describe("getReviewAlerts", () => {
  it("flags recent negative reviews", () => {
    const reviews: Review[] = [
      {
        id: "1",
        source: "google",
        author: "Angry Customer",
        rating: 1,
        text: "Terrible experience, hidden fees and rude staff",
        date: new Date().toISOString(),
        responded: false,
      },
    ];

    const alerts = getReviewAlerts(reviews);
    const negAlerts = alerts.filter((a) => a.type === "negative_review");
    expect(negAlerts.length).toBe(1);
    expect(negAlerts[0].severity).toBe("high");
  });

  it("flags unanswered reviews", () => {
    const reviews: Review[] = [
      { id: "1", source: "google", author: "A", rating: 4, text: "Good", date: new Date(Date.now() - 3 * 86400_000).toISOString(), responded: false },
      { id: "2", source: "google", author: "B", rating: 5, text: "Great", date: new Date(Date.now() - 2 * 86400_000).toISOString(), responded: false },
    ];

    const alerts = getReviewAlerts(reviews);
    const unansAlerts = alerts.filter((a) => a.type === "unanswered_review");
    expect(unansAlerts.length).toBe(1);
    expect(unansAlerts[0].message).toContain("2 reviews");
  });

  it("detects rating drops", () => {
    const now = Date.now();
    const reviews: Review[] = [];
    // 5 old reviews at 5 stars
    for (let i = 0; i < 5; i++) {
      reviews.push({
        id: `old_${i}`,
        source: "google",
        author: `Old${i}`,
        rating: 5,
        text: "Great",
        date: new Date(now - (20 - i) * 86400_000).toISOString(),
        responded: true,
      });
    }
    // 5 recent reviews at 2 stars
    for (let i = 0; i < 5; i++) {
      reviews.push({
        id: `new_${i}`,
        source: "google",
        author: `New${i}`,
        rating: 2,
        text: "Bad",
        date: new Date(now - (5 - i) * 86400_000).toISOString(),
        responded: true,
      });
    }

    const alerts = getReviewAlerts(reviews);
    const dropAlerts = alerts.filter((a) => a.type === "rating_drop");
    expect(dropAlerts.length).toBe(1);
    expect(dropAlerts[0].severity).toBe("high");
  });
});

/* -------------------------------------------------------------------------- */
/*  Response generation                                                        */
/* -------------------------------------------------------------------------- */

describe("generateReviewResponse", () => {
  it("generates professional response for positive review", () => {
    const review: Review = {
      id: "1", source: "google", author: "John", rating: 5,
      text: "Great dealership!", date: "2026-04-01", responded: false,
    };
    const response = generateReviewResponse(review, "professional");
    expect(response.reviewId).toBe("1");
    expect(response.tone).toBe("professional");
    expect(response.suggestedResponse).toContain("John");
    expect(response.suggestedResponse.toLowerCase()).toContain("thank");
  });

  it("generates empathetic response for negative review", () => {
    const review: Review = {
      id: "2", source: "yelp", author: "Sarah", rating: 1,
      text: "Worst experience ever", date: "2026-04-01", responded: false,
    };
    const response = generateReviewResponse(review, "empathetic");
    expect(response.suggestedResponse).toContain("sorry");
    expect(response.suggestedResponse).toContain("Sarah");
  });

  it("generates appropriate response for neutral review", () => {
    const review: Review = {
      id: "3", source: "facebook", author: "Mike", rating: 3,
      text: "It was okay", date: "2026-04-01", responded: false,
    };
    const response = generateReviewResponse(review);
    expect(response.suggestedResponse).toContain("Mike");
    expect(response.suggestedResponse).toContain("feedback");
  });
});

/* -------------------------------------------------------------------------- */
/*  Demo data                                                                  */
/* -------------------------------------------------------------------------- */

describe("getDemoReviews", () => {
  it("returns well-structured review data", () => {
    const reviews = getDemoReviews();
    expect(reviews.length).toBeGreaterThan(0);

    for (const review of reviews) {
      expect(review.id).toBeTruthy();
      expect(review.source).toBeTruthy();
      expect(review.author).toBeTruthy();
      expect(review.rating).toBeGreaterThanOrEqual(1);
      expect(review.rating).toBeLessThanOrEqual(5);
      expect(review.date).toBeTruthy();
    }

    // Should have mix of sources
    const sources = new Set(reviews.map((r) => r.source));
    expect(sources.size).toBeGreaterThanOrEqual(3);

    // Should have mix of responded/not responded
    expect(reviews.some((r) => r.responded)).toBe(true);
    expect(reviews.some((r) => !r.responded)).toBe(true);
  });
});
