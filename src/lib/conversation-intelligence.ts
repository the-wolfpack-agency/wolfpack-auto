/**
 * Conversation Intelligence — Phone Call Analysis
 *
 * Analyzes call transcripts for sentiment, key phrases, objections,
 * purchase intent, and sales rep quality scoring.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CallRecord {
  id: string;
  dealerId: string;
  repName: string;
  customerName: string;
  customerPhone: string;
  transcript: string;
  durationSeconds: number;
  recordedAt: string;
}

export type SentimentLabel = "positive" | "neutral" | "negative";

export interface SentimentScore {
  label: SentimentLabel;
  score: number; // -1 to 1
  confidence: number; // 0 to 1
}

export interface KeyPhrase {
  phrase: string;
  category: "objection" | "interest" | "question" | "commitment" | "concern";
  position: number; // character offset
}

export type CallOutcome =
  | "appointment_set"
  | "follow_up_needed"
  | "lost"
  | "information_only"
  | "sale_closed";

export interface CallQualityScore {
  overall: number; // 0-100
  greeting: number;
  discovery: number;
  presentation: number;
  closeAttempt: number;
  professionalism: number;
  feedback: string[];
}

export interface CallAnalysis {
  callId: string;
  sentiment: SentimentScore;
  keyPhrases: KeyPhrase[];
  outcome: CallOutcome;
  purchaseIntent: number; // 0-100
  objections: string[];
  actionItems: ActionItem[];
  qualityScore: CallQualityScore;
  analyzedAt: string;
}

export interface ActionItem {
  description: string;
  dueBy: string;
  priority: "high" | "medium" | "low";
  assignedTo: string;
}

export interface CallMetrics {
  totalCalls: number;
  avgDurationSeconds: number;
  outcomeDistribution: Record<CallOutcome, number>;
  avgSentiment: number;
  avgQualityScore: number;
  avgPurchaseIntent: number;
}

/* ------------------------------------------------------------------ */
/*  Keyword dictionaries                                               */
/* ------------------------------------------------------------------ */

const POSITIVE_WORDS = [
  "love", "great", "excellent", "perfect", "interested", "excited",
  "wonderful", "fantastic", "yes", "definitely", "absolutely", "deal",
  "ready", "buy", "purchase", "schedule", "appointment", "agree",
];

const NEGATIVE_WORDS = [
  "expensive", "too much", "no", "not interested", "competitor",
  "problem", "issue", "complaint", "frustrated", "disappointed",
  "cannot", "won't", "refuse", "overpriced", "rip off", "waste",
];

const OBJECTION_PHRASES = [
  "too expensive", "need to think", "talk to my spouse",
  "not ready", "just looking", "can't afford", "too high",
  "better deal", "other dealer", "come down on price",
  "monthly payment is too", "out of my budget",
];

const INTEREST_PHRASES = [
  "test drive", "available", "tell me more", "financing options",
  "trade in", "warranty", "features", "when can I", "how soon",
  "schedule", "appointment", "come in", "this weekend",
];

const COMMITMENT_PHRASES = [
  "i'll take it", "let's do it", "sign me up", "ready to buy",
  "put down a deposit", "write it up", "make a deal",
];

const GREETING_PHRASES = [
  "thank you for calling", "how can i help", "my name is",
  "welcome to", "good morning", "good afternoon",
];

const CLOSE_PHRASES = [
  "would you like to", "can we schedule", "shall i",
  "ready to move forward", "next step", "come on in",
  "let me get you set up",
];

/* ------------------------------------------------------------------ */
/*  Core functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Analyze a call transcript for sentiment, key phrases, objections,
 * and purchase intent.
 */
export function analyzeCallTranscript(
  callId: string,
  transcript: string,
): CallAnalysis {
  const lower = transcript.toLowerCase();

  const sentiment = analyzeSentiment(lower);
  const keyPhrases = extractKeyPhrases(lower);
  const objections = extractObjections(lower);
  const actionItems = extractActionItems(transcript);
  const purchaseIntent = scorePurchaseIntent(lower, keyPhrases);
  const qualityScore = scoreCallQuality(lower);

  const analysis: CallAnalysis = {
    callId,
    sentiment,
    keyPhrases,
    outcome: classifyCallOutcome(sentiment, purchaseIntent, objections, lower),
    purchaseIntent,
    objections,
    actionItems,
    qualityScore,
    analyzedAt: new Date().toISOString(),
  };

  return analysis;
}

/**
 * Classify the call outcome based on analysis signals.
 */
export function classifyCallOutcome(
  sentiment: SentimentScore,
  purchaseIntent: number,
  objections: string[],
  transcript: string,
): CallOutcome {
  const lower = transcript.toLowerCase();

  // Check for explicit close
  if (COMMITMENT_PHRASES.some((p) => lower.includes(p))) {
    return "sale_closed";
  }

  // Check for appointment
  if (
    lower.includes("appointment") ||
    lower.includes("schedule") ||
    lower.includes("come in")
  ) {
    if (purchaseIntent > 50) return "appointment_set";
  }

  // High intent + objections = follow up
  if (purchaseIntent > 30 && objections.length > 0) {
    return "follow_up_needed";
  }

  // Low sentiment and many objections = lost
  if (sentiment.score < -0.3 && objections.length >= 2) {
    return "lost";
  }

  // Medium intent
  if (purchaseIntent > 40) {
    return "follow_up_needed";
  }

  return "information_only";
}

/**
 * Extract action items (promises and follow-ups) from the call.
 */
export function extractActionItems(transcript: string): ActionItem[] {
  const items: ActionItem[] = [];
  const lower = transcript.toLowerCase();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  if (lower.includes("call you back") || lower.includes("follow up")) {
    items.push({
      description: "Follow up with customer",
      dueBy: tomorrow.toISOString(),
      priority: "high",
      assignedTo: "sales_rep",
    });
  }

  if (lower.includes("send") && (lower.includes("email") || lower.includes("info"))) {
    items.push({
      description: "Send requested information via email",
      dueBy: tomorrow.toISOString(),
      priority: "medium",
      assignedTo: "sales_rep",
    });
  }

  if (lower.includes("check") && (lower.includes("availability") || lower.includes("stock"))) {
    items.push({
      description: "Check vehicle availability and follow up",
      dueBy: tomorrow.toISOString(),
      priority: "high",
      assignedTo: "sales_rep",
    });
  }

  if (lower.includes("appraisal") || lower.includes("trade")) {
    items.push({
      description: "Prepare trade-in appraisal",
      dueBy: nextWeek.toISOString(),
      priority: "medium",
      assignedTo: "sales_manager",
    });
  }

  if (lower.includes("financing") || lower.includes("credit")) {
    items.push({
      description: "Prepare financing options for customer review",
      dueBy: nextWeek.toISOString(),
      priority: "medium",
      assignedTo: "finance_manager",
    });
  }

  return items;
}

/**
 * Score the sales rep's call quality.
 */
export function scoreCallQuality(transcript: string): CallQualityScore {
  const lower = typeof transcript === "string" ? transcript.toLowerCase() : "";
  const feedback: string[] = [];

  // Greeting
  const hasGreeting = GREETING_PHRASES.some((p) => lower.includes(p));
  const greeting = hasGreeting ? 90 : 40;
  if (!hasGreeting) feedback.push("Start with a proper greeting and introduction");

  // Discovery — asking questions
  const questionCount = (lower.match(/\?/g) || []).length;
  const discovery = Math.min(100, questionCount * 15);
  if (questionCount < 3) feedback.push("Ask more discovery questions to understand customer needs");

  // Presentation — mentioning features/benefits
  const featureWords = ["feature", "benefit", "warranty", "safety", "mpg", "horsepower", "comfort"];
  const featureMentions = featureWords.filter((w) => lower.includes(w)).length;
  const presentation = Math.min(100, featureMentions * 20);
  if (featureMentions < 2) feedback.push("Highlight more vehicle features and benefits");

  // Close attempt
  const hasClose = CLOSE_PHRASES.some((p) => lower.includes(p));
  const closeAttempt = hasClose ? 85 : 30;
  if (!hasClose) feedback.push("Always include a call-to-action or closing attempt");

  // Professionalism — no filler words
  const fillerWords = ["um", "uh", "like", "you know", "basically"];
  const fillerCount = fillerWords.reduce(
    (sum, w) => sum + (lower.match(new RegExp(`\\b${w}\\b`, "g")) || []).length,
    0,
  );
  const professionalism = Math.max(0, 100 - fillerCount * 10);
  if (fillerCount > 3) feedback.push("Reduce filler words for more professional delivery");

  const overall = Math.round(
    (greeting + discovery + presentation + closeAttempt + professionalism) / 5,
  );

  return {
    overall,
    greeting,
    discovery,
    presentation,
    closeAttempt,
    professionalism,
    feedback,
  };
}

/**
 * Aggregate call metrics for a dealer over a date range.
 */
export function aggregateCallMetrics(calls: CallAnalysis[]): CallMetrics {
  if (calls.length === 0) {
    return {
      totalCalls: 0,
      avgDurationSeconds: 0,
      outcomeDistribution: {
        appointment_set: 0,
        follow_up_needed: 0,
        lost: 0,
        information_only: 0,
        sale_closed: 0,
      },
      avgSentiment: 0,
      avgQualityScore: 0,
      avgPurchaseIntent: 0,
    };
  }

  const distribution: Record<CallOutcome, number> = {
    appointment_set: 0,
    follow_up_needed: 0,
    lost: 0,
    information_only: 0,
    sale_closed: 0,
  };

  let totalSentiment = 0;
  let totalQuality = 0;
  let totalIntent = 0;

  for (const call of calls) {
    distribution[call.outcome]++;
    totalSentiment += call.sentiment.score;
    totalQuality += call.qualityScore.overall;
    totalIntent += call.purchaseIntent;
  }

  return {
    totalCalls: calls.length,
    avgDurationSeconds: 0, // Would come from CallRecord
    outcomeDistribution: distribution,
    avgSentiment: totalSentiment / calls.length,
    avgQualityScore: Math.round(totalQuality / calls.length),
    avgPurchaseIntent: Math.round(totalIntent / calls.length),
  };
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function analyzeSentiment(lower: string): SentimentScore {
  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of POSITIVE_WORDS) {
    const matches = lower.match(new RegExp(`\\b${word}\\b`, "g"));
    if (matches) positiveCount += matches.length;
  }

  for (const word of NEGATIVE_WORDS) {
    if (lower.includes(word)) negativeCount++;
  }

  const total = positiveCount + negativeCount;
  if (total === 0) {
    return { label: "neutral", score: 0, confidence: 0.5 };
  }

  const score = (positiveCount - negativeCount) / total;
  const label: SentimentLabel =
    score > 0.2 ? "positive" : score < -0.2 ? "negative" : "neutral";

  return {
    label,
    score: Math.max(-1, Math.min(1, score)),
    confidence: Math.min(1, total / 10),
  };
}

function extractKeyPhrases(lower: string): KeyPhrase[] {
  const phrases: KeyPhrase[] = [];

  for (const phrase of OBJECTION_PHRASES) {
    const idx = lower.indexOf(phrase);
    if (idx !== -1) {
      phrases.push({ phrase, category: "objection", position: idx });
    }
  }

  for (const phrase of INTEREST_PHRASES) {
    const idx = lower.indexOf(phrase);
    if (idx !== -1) {
      phrases.push({ phrase, category: "interest", position: idx });
    }
  }

  for (const phrase of COMMITMENT_PHRASES) {
    const idx = lower.indexOf(phrase);
    if (idx !== -1) {
      phrases.push({ phrase, category: "commitment", position: idx });
    }
  }

  return phrases.sort((a, b) => a.position - b.position);
}

function extractObjections(lower: string): string[] {
  return OBJECTION_PHRASES.filter((p) => lower.includes(p));
}

function scorePurchaseIntent(lower: string, phrases: KeyPhrase[]): number {
  let score = 50; // baseline

  // Commitment phrases = high intent
  score += phrases.filter((p) => p.category === "commitment").length * 20;

  // Interest phrases boost
  score += phrases.filter((p) => p.category === "interest").length * 8;

  // Objections reduce
  score -= phrases.filter((p) => p.category === "objection").length * 12;

  // Specific signals
  if (lower.includes("test drive")) score += 15;
  if (lower.includes("today") || lower.includes("this weekend")) score += 10;
  if (lower.includes("just looking")) score -= 20;

  return Math.max(0, Math.min(100, score));
}
