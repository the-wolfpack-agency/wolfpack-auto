/**
 * Conversation Intelligence — Tests
 *
 * Covers: sentiment analysis, outcome classification, action item
 * extraction, quality scoring, metric aggregation.
 */

import * as fs from "fs";
import * as path from "path";

jest.mock("@/lib/analytics-hooks", () => ({
  trackCallIntelligence: jest.fn(),
}));

import {
  analyzeCallTranscript,
  classifyCallOutcome,
  extractActionItems,
  scoreCallQuality,
  aggregateCallMetrics,
  type CallAnalysis,
} from "@/lib/conversation-intelligence";

/* ------------------------------------------------------------------ */
/*  Sentiment analysis                                                 */
/* ------------------------------------------------------------------ */

describe("analyzeCallTranscript — sentiment", () => {
  it("detects positive sentiment from interested language", () => {
    const analysis = analyzeCallTranscript(
      "call-1",
      "I love this car. It's great! I'm definitely interested in buying.",
    );
    expect(analysis.sentiment.label).toBe("positive");
    expect(analysis.sentiment.score).toBeGreaterThan(0);
  });

  it("detects negative sentiment from complaint language", () => {
    const analysis = analyzeCallTranscript(
      "call-2",
      "This is too expensive. I'm frustrated and disappointed with the price.",
    );
    expect(analysis.sentiment.label).toBe("negative");
    expect(analysis.sentiment.score).toBeLessThan(0);
  });

  it("detects neutral sentiment for bland conversation", () => {
    const analysis = analyzeCallTranscript(
      "call-3",
      "The vehicle has four doors and comes in blue.",
    );
    expect(analysis.sentiment.label).toBe("neutral");
  });
});

/* ------------------------------------------------------------------ */
/*  Outcome classification                                             */
/* ------------------------------------------------------------------ */

describe("classifyCallOutcome", () => {
  it("classifies sale_closed when commitment phrases present", () => {
    const analysis = analyzeCallTranscript(
      "call-4",
      "I love it, let's do it. Sign me up! I'll take it.",
    );
    expect(analysis.outcome).toBe("sale_closed");
  });

  it("classifies appointment_set for scheduling language", () => {
    const analysis = analyzeCallTranscript(
      "call-5",
      "I'm interested in a test drive. Can we schedule an appointment this weekend? The features look great.",
    );
    expect(analysis.outcome).toBe("appointment_set");
  });

  it("classifies lost for heavy objections with negative sentiment", () => {
    const analysis = analyzeCallTranscript(
      "call-6",
      "This is too expensive. I can't afford this. Not interested. The other dealer has a better deal. This is a problem and I'm frustrated.",
    );
    expect(analysis.outcome).toBe("lost");
  });

  it("classifies information_only for low-intent calls", () => {
    const analysis = analyzeCallTranscript(
      "call-7",
      "I was just looking at the sedan. What colors do you have? Okay thanks.",
    );
    expect(analysis.outcome).toBe("information_only");
  });
});

/* ------------------------------------------------------------------ */
/*  Action item extraction                                             */
/* ------------------------------------------------------------------ */

describe("extractActionItems", () => {
  it("extracts follow-up action", () => {
    const items = extractActionItems("I'll call you back tomorrow with pricing.");
    expect(items.some((i) => i.description.includes("Follow up"))).toBe(true);
  });

  it("extracts email send action", () => {
    const items = extractActionItems(
      "Can you send me an email with the financing info?",
    );
    expect(items.some((i) => i.description.includes("email"))).toBe(true);
  });

  it("extracts trade-in appraisal action", () => {
    const items = extractActionItems("I want to trade in my current vehicle.");
    expect(items.some((i) => i.description.includes("trade-in"))).toBe(true);
  });

  it("extracts financing action", () => {
    const items = extractActionItems(
      "What are the financing options? What about my credit?",
    );
    expect(items.some((i) => i.description.includes("financing"))).toBe(true);
  });

  it("returns empty for generic conversation", () => {
    const items = extractActionItems("The weather is nice today.");
    expect(items).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Quality scoring                                                    */
/* ------------------------------------------------------------------ */

describe("scoreCallQuality", () => {
  it("scores high for well-structured call", () => {
    const score = scoreCallQuality(
      "Thank you for calling Wolfpack Auto. My name is Mike. How can I help you? " +
      "What kind of vehicle are you looking for? What features are important? " +
      "This model has great safety features and excellent warranty coverage. " +
      "Would you like to schedule a test drive?",
    );
    expect(score.overall).toBeGreaterThan(50);
    expect(score.greeting).toBeGreaterThan(60);
    expect(score.closeAttempt).toBeGreaterThan(60);
  });

  it("provides feedback for poor calls", () => {
    const score = scoreCallQuality("Um, yeah, what do you want?");
    expect(score.feedback.length).toBeGreaterThan(0);
    expect(score.overall).toBeLessThan(50);
  });

  it("scores discovery based on question count", () => {
    const goodDiscovery = scoreCallQuality(
      "What are you looking for? What's your budget? When do you need it? Do you have a trade? Are you pre-approved?",
    );
    const poorDiscovery = scoreCallQuality("We have cars.");
    expect(goodDiscovery.discovery).toBeGreaterThan(poorDiscovery.discovery);
  });
});

/* ------------------------------------------------------------------ */
/*  Metric aggregation                                                 */
/* ------------------------------------------------------------------ */

describe("aggregateCallMetrics", () => {
  it("returns zero metrics for empty array", () => {
    const metrics = aggregateCallMetrics([]);
    expect(metrics.totalCalls).toBe(0);
    expect(metrics.avgQualityScore).toBe(0);
  });

  it("correctly aggregates multiple calls", () => {
    const calls: CallAnalysis[] = [
      analyzeCallTranscript("c1", "Great car! I love it. Let's schedule a test drive."),
      analyzeCallTranscript("c2", "Too expensive, not interested."),
    ];
    const metrics = aggregateCallMetrics(calls);
    expect(metrics.totalCalls).toBe(2);
    expect(metrics.avgQualityScore).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  File structure                                                     */
/* ------------------------------------------------------------------ */

describe("file structure", () => {
  const base = path.resolve(__dirname, "../../..");

  it("has API route", () => {
    expect(
      fs.existsSync(path.join(base, "src/app/api/admin/call-intelligence/route.ts")),
    ).toBe(true);
  });

  it("has admin page", () => {
    expect(
      fs.existsSync(path.join(base, "src/app/admin/call-intelligence/page.tsx")),
    ).toBe(true);
  });

  it("has sidebar link", () => {
    const sidebar = fs.readFileSync(
      path.join(base, "src/components/AdminSidebar.tsx"),
      "utf-8",
    );
    expect(sidebar).toContain("/admin/call-intelligence");
  });
});
