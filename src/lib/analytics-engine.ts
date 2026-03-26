/**
 * Analytics Engine — the "brain" of the platform.
 *
 * Collects, stores, aggregates, and vectorizes user behavioral data.
 * Triple-write: in-memory buffer → PostgreSQL (raw) → Qdrant (vectors) → Neo4j (graph).
 *
 * Reusable across projects — no Wolfpack-specific logic in this module.
 */

import { embedText, getVectorDimension } from "@/lib/embeddings";
import {
  createCollection,
  upsertPoints,
  searchPoints,
  type QdrantFilter,
} from "@/lib/qdrant-client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AnalyticsEvent {
  /** Event type: page_view, click, scroll, form_submit, chat_message, etc. */
  event_type: string;
  /** Specific action: "submit_contact_form", "click_inventory_card", etc. */
  action: string;
  /** Page where the event occurred */
  page: string;
  /** Session fingerprint */
  session_id: string;
  /** Anonymous user fingerprint (no PII) */
  user_fingerprint: string;
  /** ISO timestamp */
  timestamp: string;
  /** Arbitrary metadata (element clicked, search query, vehicle VIN, etc.) */
  metadata: Record<string, unknown>;
}

export interface BehavioralInsight {
  id: string;
  /** Human-readable insight text for RAG retrieval */
  insight: string;
  /** Category: conversion, engagement, search, navigation, chat */
  category: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Number of events that contributed to this insight */
  sample_size: number;
  /** ISO timestamp when insight was generated */
  generated_at: string;
  /** Raw aggregation data */
  data: Record<string, unknown>;
}

export interface SessionSummary {
  session_id: string;
  user_fingerprint: string;
  pages_visited: string[];
  total_events: number;
  duration_ms: number;
  started_at: string;
  ended_at: string;
  converted: boolean;
  conversion_type?: string;
  search_queries: string[];
  vehicles_viewed: string[];
  chat_messages: number;
  deepest_scroll_page?: string;
  deepest_scroll_pct: number;
}

export interface JourneyNode {
  page: string;
  action: string;
  timestamp: string;
  duration_ms: number;
  metadata: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const INSIGHTS_COLLECTION = "wolfpack_behavioral_insights";
const CONVERSION_ACTIONS = new Set([
  "submit_contact_form",
  "submit_lead_form",
  "click_call_button",
  "click_email_button",
  "schedule_test_drive",
  "start_financing_application",
]);

/* ------------------------------------------------------------------ */
/*  In-memory event buffer (per-process)                               */
/* ------------------------------------------------------------------ */

interface EventBuffer {
  events: AnalyticsEvent[];
  sessions: Map<string, AnalyticsEvent[]>;
  lastFlush: number;
}

const globalForBuffer = globalThis as unknown as {
  __analyticsBuffer?: EventBuffer;
};

function getBuffer(): EventBuffer {
  if (!globalForBuffer.__analyticsBuffer) {
    globalForBuffer.__analyticsBuffer = {
      events: [],
      sessions: new Map(),
      lastFlush: Date.now(),
    };
  }
  return globalForBuffer.__analyticsBuffer;
}

/* ------------------------------------------------------------------ */
/*  Event ingestion                                                    */
/* ------------------------------------------------------------------ */

/**
 * Ingest a batch of analytics events.
 * Stores in memory, groups by session, and triggers aggregation
 * when enough data has accumulated.
 */
export function ingestEvents(events: AnalyticsEvent[]): {
  accepted: number;
  buffered: number;
} {
  const buffer = getBuffer();
  let accepted = 0;

  for (const event of events) {
    if (!event.event_type || !event.session_id) continue;

    buffer.events.push(event);

    // Group by session
    const sessionEvents = buffer.sessions.get(event.session_id) ?? [];
    sessionEvents.push(event);
    buffer.sessions.set(event.session_id, sessionEvents);

    accepted++;
  }

  return { accepted, buffered: buffer.events.length };
}

/* ------------------------------------------------------------------ */
/*  Session analysis                                                   */
/* ------------------------------------------------------------------ */

/**
 * Build a session summary from buffered events.
 */
export function buildSessionSummary(sessionId: string): SessionSummary | null {
  const buffer = getBuffer();
  const events = buffer.sessions.get(sessionId);
  if (!events || events.length === 0) return null;

  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const pages = new Set<string>();
  const searches: string[] = [];
  const vehicles: string[] = [];
  let chatMessages = 0;
  let converted = false;
  let conversionType: string | undefined;
  let deepestScroll = 0;
  let deepestScrollPage: string | undefined;

  for (const e of sorted) {
    pages.add(e.page);

    if (e.event_type === "search" && e.metadata.query) {
      searches.push(String(e.metadata.query));
    }

    if (e.event_type === "vehicle_view" && e.metadata.vin) {
      vehicles.push(String(e.metadata.vin));
    }

    if (e.event_type === "chat_message") {
      chatMessages++;
    }

    if (CONVERSION_ACTIONS.has(e.action)) {
      converted = true;
      conversionType = e.action;
    }

    if (e.event_type === "scroll" && typeof e.metadata.depth === "number") {
      if (e.metadata.depth > deepestScroll) {
        deepestScroll = e.metadata.depth;
        deepestScrollPage = e.page;
      }
    }
  }

  const startTime = new Date(sorted[0].timestamp).getTime();
  const endTime = new Date(sorted[sorted.length - 1].timestamp).getTime();

  return {
    session_id: sessionId,
    user_fingerprint: sorted[0].user_fingerprint,
    pages_visited: [...pages],
    total_events: sorted.length,
    duration_ms: endTime - startTime,
    started_at: sorted[0].timestamp,
    ended_at: sorted[sorted.length - 1].timestamp,
    converted,
    conversion_type: conversionType,
    search_queries: searches,
    vehicles_viewed: [...new Set(vehicles)],
    chat_messages: chatMessages,
    deepest_scroll_page: deepestScrollPage,
    deepest_scroll_pct: deepestScroll,
  };
}

/**
 * Build the user's journey as a sequence of nodes (for graph storage).
 */
export function buildJourney(sessionId: string): JourneyNode[] {
  const buffer = getBuffer();
  const events = buffer.sessions.get(sessionId);
  if (!events) return [];

  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const nodes: JourneyNode[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const nextTime =
      i + 1 < sorted.length
        ? new Date(sorted[i + 1].timestamp).getTime()
        : new Date(e.timestamp).getTime();

    nodes.push({
      page: e.page,
      action: e.action || e.event_type,
      timestamp: e.timestamp,
      duration_ms: nextTime - new Date(e.timestamp).getTime(),
      metadata: e.metadata,
    });
  }

  return nodes;
}

/* ------------------------------------------------------------------ */
/*  Pattern detection & insight generation                             */
/* ------------------------------------------------------------------ */

/**
 * Analyze buffered data and generate behavioral insights.
 * These insights get embedded and stored in Qdrant for RAG retrieval.
 */
export function generateInsights(): BehavioralInsight[] {
  const buffer = getBuffer();
  const insights: BehavioralInsight[] = [];
  const now = new Date().toISOString();

  // Need at least 5 sessions for meaningful patterns
  if (buffer.sessions.size < 3) return insights;

  // --- Insight 1: Page engagement ranking ---
  const pageTime = new Map<string, { total: number; count: number }>();
  for (const [, events] of buffer.sessions) {
    const pageGroups = new Map<string, AnalyticsEvent[]>();
    for (const e of events) {
      const group = pageGroups.get(e.page) ?? [];
      group.push(e);
      pageGroups.set(e.page, group);
    }

    for (const [page, pageEvents] of pageGroups) {
      const timeOnPage = pageEvents.find(
        (e) => e.event_type === "time_on_page",
      );
      if (timeOnPage && typeof timeOnPage.metadata.duration_ms === "number") {
        const entry = pageTime.get(page) ?? { total: 0, count: 0 };
        entry.total += timeOnPage.metadata.duration_ms as number;
        entry.count++;
        pageTime.set(page, entry);
      }
    }
  }

  if (pageTime.size > 0) {
    const ranked = [...pageTime.entries()]
      .map(([page, { total, count }]) => ({
        page,
        avg_ms: Math.round(total / count),
        sessions: count,
      }))
      .sort((a, b) => b.avg_ms - a.avg_ms);

    const topPage = ranked[0];
    insights.push({
      id: `page_engagement_${Date.now()}`,
      insight: `The most engaging page is "${topPage.page}" with an average time of ${Math.round(topPage.avg_ms / 1000)}s per visit across ${topPage.sessions} sessions. Full ranking: ${ranked.map((r) => `${r.page} (${Math.round(r.avg_ms / 1000)}s)`).join(", ")}.`,
      category: "engagement",
      confidence: Math.min(topPage.sessions / 10, 1),
      sample_size: topPage.sessions,
      generated_at: now,
      data: { ranking: ranked },
    });
  }

  // --- Insight 2: Conversion paths ---
  const conversionPaths: string[][] = [];
  const nonConversionPaths: string[][] = [];

  for (const [sessionId] of buffer.sessions) {
    const summary = buildSessionSummary(sessionId);
    if (!summary) continue;

    if (summary.converted) {
      conversionPaths.push(summary.pages_visited);
    } else {
      nonConversionPaths.push(summary.pages_visited);
    }
  }

  if (conversionPaths.length > 0) {
    // Find common pages in conversion paths
    const pageFreq = new Map<string, number>();
    for (const path of conversionPaths) {
      for (const page of path) {
        pageFreq.set(page, (pageFreq.get(page) ?? 0) + 1);
      }
    }

    const commonPages = [...pageFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const convRate =
      conversionPaths.length /
      (conversionPaths.length + nonConversionPaths.length);

    insights.push({
      id: `conversion_paths_${Date.now()}`,
      insight: `${(convRate * 100).toFixed(1)}% of sessions convert. Users who convert most commonly visit: ${commonPages.map(([p, c]) => `${p} (${c} times)`).join(", ")}. Average conversion path length: ${Math.round(conversionPaths.reduce((sum, p) => sum + p.length, 0) / conversionPaths.length)} pages.`,
      category: "conversion",
      confidence: Math.min(conversionPaths.length / 20, 1),
      sample_size: conversionPaths.length + nonConversionPaths.length,
      generated_at: now,
      data: {
        conversion_rate: convRate,
        common_pages: commonPages,
        avg_path_length:
          conversionPaths.reduce((sum, p) => sum + p.length, 0) /
          conversionPaths.length,
      },
    });
  }

  // --- Insight 3: Search behavior ---
  const allSearches: string[] = [];
  for (const [sessionId] of buffer.sessions) {
    const summary = buildSessionSummary(sessionId);
    if (summary) {
      allSearches.push(...summary.search_queries);
    }
  }

  if (allSearches.length > 0) {
    const queryFreq = new Map<string, number>();
    for (const q of allSearches) {
      const normalized = q.toLowerCase().trim();
      queryFreq.set(normalized, (queryFreq.get(normalized) ?? 0) + 1);
    }

    const topSearches = [...queryFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    insights.push({
      id: `search_patterns_${Date.now()}`,
      insight: `Top search queries: ${topSearches.map(([q, c]) => `"${q}" (${c}x)`).join(", ")}. Total searches: ${allSearches.length} across ${buffer.sessions.size} sessions.`,
      category: "search",
      confidence: Math.min(allSearches.length / 50, 1),
      sample_size: allSearches.length,
      generated_at: now,
      data: { top_searches: topSearches, total: allSearches.length },
    });
  }

  // --- Insight 4: Vehicle interest ---
  const vehicleViews = new Map<string, number>();
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "vehicle_view" && e.metadata.vin) {
        const vin = String(e.metadata.vin);
        vehicleViews.set(vin, (vehicleViews.get(vin) ?? 0) + 1);
      }
    }
  }

  if (vehicleViews.size > 0) {
    const topVehicles = [...vehicleViews.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    insights.push({
      id: `vehicle_interest_${Date.now()}`,
      insight: `Most viewed vehicles: ${topVehicles.map(([vin, views]) => `VIN ${vin} (${views} views)`).join(", ")}. ${vehicleViews.size} unique vehicles viewed across ${buffer.sessions.size} sessions.`,
      category: "engagement",
      confidence: Math.min(vehicleViews.size / 10, 1),
      sample_size: [...vehicleViews.values()].reduce((a, b) => a + b, 0),
      generated_at: now,
      data: { top_vehicles: topVehicles, unique_vehicles: vehicleViews.size },
    });
  }

  // --- Insight 5: Chat engagement ---
  let chatSessions = 0;
  let chatConversions = 0;
  const chatQueries: string[] = [];

  for (const [sessionId, events] of buffer.sessions) {
    const hasChatMessages = events.some(
      (e) => e.event_type === "chat_message" && e.metadata.role === "user",
    );
    if (hasChatMessages) {
      chatSessions++;
      const summary = buildSessionSummary(sessionId);
      if (summary?.converted) chatConversions++;

      for (const e of events) {
        if (e.event_type === "chat_message" && e.metadata.role === "user") {
          chatQueries.push(String(e.metadata.content ?? ""));
        }
      }
    }
  }

  if (chatSessions > 0) {
    const chatConvRate =
      chatSessions > 0 ? chatConversions / chatSessions : 0;

    insights.push({
      id: `chat_engagement_${Date.now()}`,
      insight: `${chatSessions} sessions used the chat widget. Chat users convert at ${(chatConvRate * 100).toFixed(1)}% vs overall. Common chat topics: ${chatQueries.slice(0, 5).map((q) => `"${q.slice(0, 50)}"`).join(", ")}.`,
      category: "chat",
      confidence: Math.min(chatSessions / 10, 1),
      sample_size: chatSessions,
      generated_at: now,
      data: {
        chat_sessions: chatSessions,
        chat_conversion_rate: chatConvRate,
        sample_queries: chatQueries.slice(0, 10),
      },
    });
  }

  // --- Insight 5b: Chat sentiment trajectory ---
  // Track whether chat conversations get more specific (approaching conversion)
  // or more vague (losing interest) over the conversation
  if (chatSessions > 0) {
    let risingSpecificity = 0;
    let fallingSpecificity = 0;

    for (const [, events] of buffer.sessions) {
      const userMessages = events
        .filter(
          (e) =>
            e.event_type === "chat_message" && e.metadata.role === "user",
        )
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

      if (userMessages.length < 2) continue;

      // Simple specificity heuristic: message length + question marks +
      // presence of numbers/VINs/prices
      const specificityScores = userMessages.map((m) => {
        const content = String(m.metadata.content ?? "");
        let score = 0;
        score += Math.min(content.length / 50, 2); // longer = more specific (capped)
        if (/\?/.test(content)) score += 1; // asking questions
        if (/\d{4,}/.test(content)) score += 2; // contains numbers (prices, years, VINs)
        if (/\$/.test(content)) score += 2; // mentions price
        if (/vin|test\s*drive|financ|appoint|schedul/i.test(content))
          score += 3; // high-intent keywords
        return score;
      });

      // Check if specificity is rising or falling
      const firstHalf = specificityScores.slice(
        0,
        Math.ceil(specificityScores.length / 2),
      );
      const secondHalf = specificityScores.slice(
        Math.ceil(specificityScores.length / 2),
      );
      const firstAvg =
        firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg =
        secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      if (secondAvg > firstAvg * 1.2) risingSpecificity++;
      else if (secondAvg < firstAvg * 0.8) fallingSpecificity++;
    }

    if (risingSpecificity + fallingSpecificity > 0) {
      insights.push({
        id: `chat_sentiment_${Date.now()}`,
        insight: `Chat conversation trajectories: ${risingSpecificity} conversations show RISING specificity (users getting closer to buying — they mention prices, VINs, scheduling), ${fallingSpecificity} show FALLING specificity (users losing interest). ${risingSpecificity > fallingSpecificity ? "The chat is effectively nurturing leads toward conversion." : "Consider adding proactive CTAs mid-conversation to maintain engagement."}`,
        category: "chat",
        confidence: Math.min(
          (risingSpecificity + fallingSpecificity) / 10,
          1,
        ),
        sample_size: risingSpecificity + fallingSpecificity,
        generated_at: now,
        data: {
          rising_specificity: risingSpecificity,
          falling_specificity: fallingSpecificity,
        },
      });
    }
  }

  // --- Insight 6: Peak hours ---
  const hourBuckets = new Array(24).fill(0) as number[];
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      const hour = new Date(e.timestamp).getHours();
      hourBuckets[hour]++;
    }
  }

  const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));
  const totalEvents = hourBuckets.reduce((a, b) => a + b, 0);

  if (totalEvents > 10) {
    insights.push({
      id: `peak_hours_${Date.now()}`,
      insight: `Peak activity hour is ${peakHour}:00 with ${hourBuckets[peakHour]} events (${((hourBuckets[peakHour] / totalEvents) * 100).toFixed(1)}% of traffic). Hourly distribution: ${hourBuckets.map((c, h) => `${h}:00=${c}`).filter((_, i) => hourBuckets[i] > 0).join(", ")}.`,
      category: "engagement",
      confidence: Math.min(totalEvents / 100, 1),
      sample_size: totalEvents,
      generated_at: now,
      data: { hourly: hourBuckets, peak_hour: peakHour },
    });
  }

  // ================================================================
  // ADVANCED INSIGHT GENERATORS — industry-differentiating analytics
  // ================================================================

  // --- Insight 7: Micro-hesitation patterns ---
  const hesitations: { field: string; deletions: number; chars: number }[] = [];
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "micro_hesitation") {
        const field = String(e.metadata.field_name ?? "unknown");
        const existing = hesitations.find((h) => h.field === field);
        if (existing) {
          existing.deletions++;
          existing.chars += (e.metadata.chars_deleted as number) ?? 0;
        } else {
          hesitations.push({
            field,
            deletions: 1,
            chars: (e.metadata.chars_deleted as number) ?? 0,
          });
        }
      }
    }
  }

  if (hesitations.length > 0) {
    const sorted = hesitations.sort((a, b) => b.deletions - a.deletions);
    insights.push({
      id: `hesitation_${Date.now()}`,
      insight: `Form friction detected: ${sorted.map((h) => `"${h.field}" field has ${h.deletions} hesitations (${h.chars} chars deleted)`).join("; ")}. These fields cause users to second-guess their input — consider simplifying labels, adding placeholders, or removing them.`,
      category: "conversion",
      confidence: Math.min(sorted[0].deletions / 10, 1),
      sample_size: hesitations.reduce((a, h) => a + h.deletions, 0),
      generated_at: now,
      data: { fields: sorted },
    });
  }

  // --- Insight 8: Comparison shopping detection ---
  let comparisonShoppers = 0;
  let normalVisitors = 0;
  let comparisonShopperConversions = 0;
  let normalConversions = 0;

  for (const [sessionId, events] of buffer.sessions) {
    const tabReturns = events.filter(
      (e) => e.event_type === "tab_visibility" && e.action === "tab_return",
    );
    const isComparison = tabReturns.some(
      (e) => e.metadata.likely_comparison_shopping === true,
    );
    const summary = buildSessionSummary(sessionId);

    if (isComparison) {
      comparisonShoppers++;
      if (summary?.converted) comparisonShopperConversions++;
    } else {
      normalVisitors++;
      if (summary?.converted) normalConversions++;
    }
  }

  if (comparisonShoppers > 0) {
    const compRate =
      comparisonShoppers > 0
        ? comparisonShopperConversions / comparisonShoppers
        : 0;
    const normalRate =
      normalVisitors > 0 ? normalConversions / normalVisitors : 0;

    insights.push({
      id: `comparison_shopping_${Date.now()}`,
      insight: `${comparisonShoppers} sessions show comparison-shopping behavior (3+ tab switches). These users convert at ${(compRate * 100).toFixed(1)}% vs ${(normalRate * 100).toFixed(1)}% for non-comparison shoppers. ${compRate > normalRate ? "Comparison shoppers convert MORE — they're serious buyers." : "Comparison shoppers convert LESS — consider adding comparison tools to keep them on-site."}`,
      category: "conversion",
      confidence: Math.min(comparisonShoppers / 10, 1),
      sample_size: comparisonShoppers + normalVisitors,
      generated_at: now,
      data: {
        comparison_shoppers: comparisonShoppers,
        normal_visitors: normalVisitors,
        comparison_conversion_rate: compRate,
        normal_conversion_rate: normalRate,
      },
    });
  }

  // --- Insight 9: Copy behavior (what users copy reveals intent) ---
  const copyEvents: { content_type: string; count: number }[] = [];
  const copyContentMap = new Map<string, number>();
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "copy_paste" && e.action === "copy") {
        const ct = String(e.metadata.content_type ?? "text");
        copyContentMap.set(ct, (copyContentMap.get(ct) ?? 0) + 1);
      }
    }
  }

  for (const [type, count] of copyContentMap) {
    copyEvents.push({ content_type: type, count });
  }

  if (copyEvents.length > 0) {
    const sorted = copyEvents.sort((a, b) => b.count - a.count);
    const totalCopies = sorted.reduce((a, c) => a + c.count, 0);
    insights.push({
      id: `copy_behavior_${Date.now()}`,
      insight: `Users copied content ${totalCopies} times: ${sorted.map((c) => `${c.content_type} (${c.count}x)`).join(", ")}. ${sorted[0].content_type === "vin" ? "High VIN copying suggests users are researching vehicles on other sites." : sorted[0].content_type === "price" ? "Price copying indicates active comparison shopping." : "Content copying shows high engagement."}`,
      category: "engagement",
      confidence: Math.min(totalCopies / 20, 1),
      sample_size: totalCopies,
      generated_at: now,
      data: { copy_types: sorted, total: totalCopies },
    });
  }

  // --- Insight 10: Scroll behavior classification ---
  const scrollBehaviors = new Map<string, number>();
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "scroll_velocity" && e.metadata.behavior) {
        const b = String(e.metadata.behavior);
        scrollBehaviors.set(b, (scrollBehaviors.get(b) ?? 0) + 1);
      }
    }
  }

  if (scrollBehaviors.size > 0) {
    const total = [...scrollBehaviors.values()].reduce((a, b) => a + b, 0);
    const breakdown = [...scrollBehaviors.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([b, c]) => `${b}: ${((c / total) * 100).toFixed(0)}%`);

    insights.push({
      id: `scroll_behavior_${Date.now()}`,
      insight: `User reading patterns: ${breakdown.join(", ")}. ${scrollBehaviors.get("reading") ?? 0 > (scrollBehaviors.get("scanning") ?? 0) ? "More users are carefully reading content — your copy is engaging." : "More users are scanning — consider using bullet points, bold text, and visual breaks to capture attention."}`,
      category: "engagement",
      confidence: Math.min(total / 30, 1),
      sample_size: total,
      generated_at: now,
      data: { behaviors: Object.fromEntries(scrollBehaviors) },
    });
  }

  // --- Insight 11: Time-to-first-interaction (user intent classification) ---
  const ttfiByIntent = new Map<string, number>();
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "time_to_first_interaction" && e.metadata.intent) {
        const intent = String(e.metadata.intent);
        ttfiByIntent.set(intent, (ttfiByIntent.get(intent) ?? 0) + 1);
      }
    }
  }

  if (ttfiByIntent.size > 0) {
    const total = [...ttfiByIntent.values()].reduce((a, b) => a + b, 0);
    const breakdown = [...ttfiByIntent.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([intent, count]) => `${intent}: ${count} (${((count / total) * 100).toFixed(0)}%)`);

    insights.push({
      id: `user_intent_${Date.now()}`,
      insight: `User intent classification: ${breakdown.join(", ")}. ${(ttfiByIntent.get("purposeful") ?? 0) > total / 2 ? "Most users arrive with clear intent — optimize for fast task completion." : "Most users are browsing — optimize for discovery and exploration."}`,
      category: "engagement",
      confidence: Math.min(total / 20, 1),
      sample_size: total,
      generated_at: now,
      data: { intents: Object.fromEntries(ttfiByIntent) },
    });
  }

  // --- Insight 12: Return visit "sticky pages" ---
  const stickyPages = new Map<string, { revisits: number; avgDaysBetween: number[] }>();
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "return_visit" && e.metadata.sticky_page === true) {
        const page = String(e.metadata.page);
        const entry = stickyPages.get(page) ?? { revisits: 0, avgDaysBetween: [] };
        entry.revisits++;
        if (typeof e.metadata.days_since_last_visit === "number") {
          entry.avgDaysBetween.push(e.metadata.days_since_last_visit as number);
        }
        stickyPages.set(page, entry);
      }
    }
  }

  if (stickyPages.size > 0) {
    const ranked = [...stickyPages.entries()]
      .map(([page, data]) => ({
        page,
        revisits: data.revisits,
        avg_days: data.avgDaysBetween.length > 0
          ? Math.round(data.avgDaysBetween.reduce((a, b) => a + b, 0) / data.avgDaysBetween.length)
          : 0,
      }))
      .sort((a, b) => b.revisits - a.revisits);

    insights.push({
      id: `sticky_pages_${Date.now()}`,
      insight: `"Sticky" pages users keep returning to: ${ranked.map((r) => `${r.page} (${r.revisits} revisits, avg ${r.avg_days} days between)`).join(", ")}. These pages live rent-free in users' minds — they're your strongest content. Consider adding CTAs and conversion opportunities to these pages.`,
      category: "conversion",
      confidence: Math.min(ranked[0].revisits / 5, 1),
      sample_size: ranked.reduce((a, r) => a + r.revisits, 0),
      generated_at: now,
      data: { sticky_pages: ranked },
    });
  }

  // --- Insight 13: Cross-page journey patterns ---
  const journeyPatterns = new Map<string, number>();
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "cross_page_correlation" && e.metadata.pages) {
        const pages = (e.metadata.pages as string[]).sort().join(" → ");
        journeyPatterns.set(pages, (journeyPatterns.get(pages) ?? 0) + 1);
      }
    }
  }

  if (journeyPatterns.size > 0) {
    const topPatterns = [...journeyPatterns.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    insights.push({
      id: `journey_patterns_${Date.now()}`,
      insight: `Most common user journeys: ${topPatterns.map(([path, count]) => `${path} (${count} users)`).join("; ")}. These are your natural user flows — optimize page transitions along these paths for maximum conversion.`,
      category: "navigation",
      confidence: Math.min(topPatterns[0][1] / 10, 1),
      sample_size: topPatterns.reduce((a, [, c]) => a + c, 0),
      generated_at: now,
      data: { patterns: topPatterns },
    });
  }

  // --- Insight 14: Device orientation (photo engagement on mobile) ---
  let orientationChanges = 0;
  const orientationPages = new Map<string, number>();
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "device_orientation") {
        orientationChanges++;
        const page = String(e.metadata.page ?? "unknown");
        orientationPages.set(page, (orientationPages.get(page) ?? 0) + 1);
      }
    }
  }

  if (orientationChanges > 0) {
    const topPages = [...orientationPages.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    insights.push({
      id: `orientation_engagement_${Date.now()}`,
      insight: `${orientationChanges} device rotations detected, concentrated on: ${topPages.map(([p, c]) => `${p} (${c}x)`).join(", ")}. Users rotating their device are deeply engaging with visual content — ensure these pages have high-quality landscape-optimized images.`,
      category: "engagement",
      confidence: Math.min(orientationChanges / 10, 1),
      sample_size: orientationChanges,
      generated_at: now,
      data: { total: orientationChanges, pages: topPages },
    });
  }

  // ================================================================
  // TIER 2 INSIGHT GENERATORS — industry-changing analytics
  // ================================================================

  // --- Insight 15: Rage clicks (UX frustration) ---
  const rageClickElements = new Map<string, number>();
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "rage_click") {
        const el = String(e.metadata.element_text ?? e.metadata.element ?? "unknown");
        rageClickElements.set(el, (rageClickElements.get(el) ?? 0) + 1);
      }
    }
  }
  if (rageClickElements.size > 0) {
    const sorted = [...rageClickElements.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    insights.push({
      id: `rage_clicks_${Date.now()}`,
      insight: `UX frustration detected: ${sorted.map(([el, c]) => `"${el.slice(0, 40)}" (${c} rage clicks)`).join(", ")}. Users are rapidly clicking these elements expecting a response — check for slow loading, missing feedback, or broken interactions.`,
      category: "ux_friction",
      confidence: Math.min(sorted[0][1] / 5, 1),
      sample_size: sorted.reduce((a, [, c]) => a + c, 0),
      generated_at: now,
      data: { elements: sorted },
    });
  }

  // --- Insight 16: Dead clicks (UX gaps) ---
  const deadClickElements = new Map<string, number>();
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "dead_click") {
        const el = `${e.metadata.element_tag}: "${String(e.metadata.element_text ?? "").slice(0, 30)}"`;
        deadClickElements.set(el, (deadClickElements.get(el) ?? 0) + 1);
      }
    }
  }
  if (deadClickElements.size > 0) {
    const sorted = [...deadClickElements.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    insights.push({
      id: `dead_clicks_${Date.now()}`,
      insight: `Users are clicking non-interactive elements: ${sorted.map(([el, c]) => `${el} (${c}x)`).join(", ")}. These elements look clickable but aren't — consider making them interactive or changing their visual styling.`,
      category: "ux_friction",
      confidence: Math.min(sorted[0][1] / 5, 1),
      sample_size: sorted.reduce((a, [, c]) => a + c, 0),
      generated_at: now,
      data: { elements: sorted },
    });
  }

  // --- Insight 17: Form abandonment attribution ---
  const abandonmentFields = new Map<string, number>();
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "form_abandonment") {
        const field = String(e.metadata.last_field ?? "unknown");
        abandonmentFields.set(field, (abandonmentFields.get(field) ?? 0) + 1);
      }
    }
  }
  if (abandonmentFields.size > 0) {
    const sorted = [...abandonmentFields.entries()].sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((a, [, c]) => a + c, 0);
    insights.push({
      id: `form_abandonment_${Date.now()}`,
      insight: `${total} form abandonments detected. Users quit most often at: ${sorted.map(([f, c]) => `"${f}" field (${c}x, ${((c / total) * 100).toFixed(0)}%)`).join(", ")}. Consider making these fields optional, adding helper text, or reducing the form length.`,
      category: "conversion",
      confidence: Math.min(total / 10, 1),
      sample_size: total,
      generated_at: now,
      data: { fields: sorted, total },
    });
  }

  // --- Insight 18: Exit intent patterns ---
  const exitIntentPages = new Map<string, number>();
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "exit_intent") {
        const page = String(e.metadata.page ?? "/");
        exitIntentPages.set(page, (exitIntentPages.get(page) ?? 0) + 1);
      }
    }
  }
  if (exitIntentPages.size > 0) {
    const sorted = [...exitIntentPages.entries()].sort((a, b) => b[1] - a[1]);
    insights.push({
      id: `exit_intent_${Date.now()}`,
      insight: `Exit intent detected most on: ${sorted.map(([p, c]) => `${p} (${c}x)`).join(", ")}. These are the pages where users move to leave — consider adding retention offers, chat prompts, or urgency elements on these pages.`,
      category: "conversion",
      confidence: Math.min(sorted[0][1] / 10, 1),
      sample_size: sorted.reduce((a, [, c]) => a + c, 0),
      generated_at: now,
      data: { pages: sorted },
    });
  }

  // --- Insight 19: Price trajectory (buyer psychology) ---
  const trajectoryDirections = new Map<string, number>();
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "price_trajectory" && e.metadata.direction) {
        const dir = String(e.metadata.direction);
        trajectoryDirections.set(dir, (trajectoryDirections.get(dir) ?? 0) + 1);
      }
    }
  }
  if (trajectoryDirections.size > 0) {
    const total = [...trajectoryDirections.values()].reduce((a, b) => a + b, 0);
    const breakdown = [...trajectoryDirections.entries()].map(([d, c]) => `${d}: ${c} (${((c / total) * 100).toFixed(0)}%)`);
    insights.push({
      id: `price_trajectory_${Date.now()}`,
      insight: `Buyer price psychology: ${breakdown.join(", ")}. ${(trajectoryDirections.get("anchoring_down") ?? 0) > (trajectoryDirections.get("anchoring_up") ?? 0) ? "More users start high and work down — they're aspirational browsers. Show premium vehicles first." : "More users start low and work up — they're budget-conscious and upgrading. Lead with value propositions."}`,
      category: "conversion",
      confidence: Math.min(total / 15, 1),
      sample_size: total,
      generated_at: now,
      data: { directions: Object.fromEntries(trajectoryDirections) },
    });
  }

  // --- Insight 20: Session momentum ---
  const momentumCounts = new Map<string, number>();
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "session_momentum" && e.metadata.momentum) {
        const m = String(e.metadata.momentum);
        momentumCounts.set(m, (momentumCounts.get(m) ?? 0) + 1);
      }
    }
  }
  if (momentumCounts.size > 0) {
    const total = [...momentumCounts.values()].reduce((a, b) => a + b, 0);
    const accel = momentumCounts.get("accelerating") ?? 0;
    insights.push({
      id: `session_momentum_${Date.now()}`,
      insight: `Session momentum: ${[...momentumCounts.entries()].map(([m, c]) => `${m}: ${c}`).join(", ")}. ${accel > total / 2 ? "Most sessions are accelerating — users are getting more engaged over time. Your content flow is working." : "Most sessions are steady or decelerating — consider adding interactive elements or CTAs mid-page to maintain engagement."}`,
      category: "engagement",
      confidence: Math.min(total / 20, 1),
      sample_size: total,
      generated_at: now,
      data: { momentum: Object.fromEntries(momentumCounts) },
    });
  }

  // --- Insight 21: Referrer behavior correlation ---
  const sourceMetrics = new Map<string, { sessions: number; conversions: number }>();
  for (const [sessionId, events] of buffer.sessions) {
    const sourceEvent = events.find((e) => e.event_type === "referrer_correlation");
    if (!sourceEvent) continue;
    const source = String(sourceEvent.metadata.referrer_source ?? "direct");
    const entry = sourceMetrics.get(source) ?? { sessions: 0, conversions: 0 };
    entry.sessions++;
    const summary = buildSessionSummary(sessionId);
    if (summary?.converted) entry.conversions++;
    sourceMetrics.set(source, entry);
  }
  if (sourceMetrics.size > 1) {
    const ranked = [...sourceMetrics.entries()]
      .map(([source, data]) => ({ source, ...data, rate: data.sessions > 0 ? data.conversions / data.sessions : 0 }))
      .sort((a, b) => b.rate - a.rate);
    insights.push({
      id: `referrer_correlation_${Date.now()}`,
      insight: `Traffic source performance: ${ranked.map((r) => `${r.source}: ${r.sessions} sessions, ${(r.rate * 100).toFixed(0)}% conversion`).join("; ")}. ${ranked[0].rate > 0 ? `Best converting source: ${ranked[0].source}. Invest more marketing budget here.` : "No conversions yet from tracked sources — need more data."}`,
      category: "marketing",
      confidence: Math.min(ranked.reduce((a, r) => a + r.sessions, 0) / 20, 1),
      sample_size: ranked.reduce((a, r) => a + r.sessions, 0),
      generated_at: now,
      data: { sources: ranked },
    });
  }

  // --- Insight 22: Viewport attention (what content users actually read) ---
  const sectionAttention = new Map<string, { totalMs: number; count: number }>();
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "viewport_attention" && typeof e.metadata.visible_duration_ms === "number") {
        const section = String(e.metadata.section_id ?? "unknown");
        const entry = sectionAttention.get(section) ?? { totalMs: 0, count: 0 };
        entry.totalMs += e.metadata.visible_duration_ms as number;
        entry.count++;
        sectionAttention.set(section, entry);
      }
    }
  }
  if (sectionAttention.size > 0) {
    const ranked = [...sectionAttention.entries()]
      .map(([section, data]) => ({ section, avg_ms: Math.round(data.totalMs / data.count), views: data.count }))
      .sort((a, b) => b.avg_ms - a.avg_ms);
    insights.push({
      id: `viewport_attention_${Date.now()}`,
      insight: `Content attention ranking (avg time visible): ${ranked.slice(0, 5).map((r) => `"${r.section}" ${Math.round(r.avg_ms / 1000)}s (${r.views} views)`).join(", ")}. Place your most important CTAs in the highest-attention sections.`,
      category: "engagement",
      confidence: Math.min(ranked[0].views / 10, 1),
      sample_size: ranked.reduce((a, r) => a + r.views, 0),
      generated_at: now,
      data: { sections: ranked.slice(0, 10) },
    });
  }

  return insights;
}

/* ------------------------------------------------------------------ */
/*  Vector store integration (Qdrant)                                  */
/* ------------------------------------------------------------------ */

/**
 * Embed insights and store them in Qdrant for RAG retrieval.
 */
export async function storeInsightsInVectorStore(
  insights: BehavioralInsight[],
): Promise<{ stored: number; failed: number }> {
  if (insights.length === 0) return { stored: 0, failed: 0 };

  const dim = getVectorDimension();
  const ready = await createCollection(INSIGHTS_COLLECTION, dim);
  if (!ready) return { stored: 0, failed: insights.length };

  const points = await Promise.all(
    insights.map(async (insight) => {
      const vector = await embedText(insight.insight);
      return {
        id: hashStringToId(insight.id),
        vector,
        payload: {
          insight: insight.insight,
          category: insight.category,
          confidence: insight.confidence,
          sample_size: insight.sample_size,
          generated_at: insight.generated_at,
          source: "behavioral_analytics",
          data: JSON.stringify(insight.data),
        },
      };
    }),
  );

  const success = await upsertPoints(INSIGHTS_COLLECTION, points);

  return {
    stored: success ? insights.length : 0,
    failed: success ? 0 : insights.length,
  };
}

/**
 * Query behavioral insights from the vector store.
 * Used by the chat widget and dashboards to retrieve relevant behavioral data.
 */
export async function queryInsights(
  query: string,
  limit: number = 5,
  filter?: QdrantFilter,
): Promise<BehavioralInsight[]> {
  const vector = await embedText(query);

  const categoryFilter: QdrantFilter = {
    must: [
      { key: "source", match: { value: "behavioral_analytics" } },
      ...(filter?.must ?? []),
    ],
  };

  const results = await searchPoints(
    INSIGHTS_COLLECTION,
    vector,
    limit,
    categoryFilter,
  );

  return results.map((r) => ({
    id: String(r.id),
    insight: (r.payload?.insight as string) ?? "",
    category: (r.payload?.category as string) ?? "",
    confidence: (r.payload?.confidence as number) ?? 0,
    sample_size: (r.payload?.sample_size as number) ?? 0,
    generated_at: (r.payload?.generated_at as string) ?? "",
    data: r.payload?.data ? JSON.parse(r.payload.data as string) : {},
  }));
}

/* ------------------------------------------------------------------ */
/*  Neo4j graph integration                                            */
/* ------------------------------------------------------------------ */

/**
 * Build Cypher queries for storing session journeys in Neo4j.
 * Returns query strings that can be executed against a Neo4j instance.
 *
 * Graph model:
 *   (:User {fingerprint})-[:HAS_SESSION]->(:Session {id, started_at, converted})
 *   (:Session)-[:VISITED {order, duration_ms}]->(:Page {path})
 *   (:Session)-[:SEARCHED {query}]->(:SearchQuery {text})
 *   (:Session)-[:VIEWED]->(:Vehicle {vin})
 *   (:Page)-[:LEADS_TO {count}]->(:Page)
 */
export function buildGraphQueries(sessionId: string): string[] {
  const summary = buildSessionSummary(sessionId);
  const journey = buildJourney(sessionId);
  if (!summary || journey.length === 0) return [];

  const queries: string[] = [];

  // Create User + Session nodes
  queries.push(
    `MERGE (u:User {fingerprint: "${esc(summary.user_fingerprint)}"})
MERGE (s:Session {id: "${esc(summary.session_id)}"})
SET s.started_at = datetime("${summary.started_at}"),
    s.ended_at = datetime("${summary.ended_at}"),
    s.duration_ms = ${summary.duration_ms},
    s.converted = ${summary.converted},
    s.conversion_type = ${summary.conversion_type ? `"${esc(summary.conversion_type)}"` : "null"},
    s.total_events = ${summary.total_events},
    s.chat_messages = ${summary.chat_messages}
MERGE (u)-[:HAS_SESSION]->(s)`,
  );

  // Create Page visit chain
  for (let i = 0; i < journey.length; i++) {
    const node = journey[i];
    queries.push(
      `MERGE (p:Page {path: "${esc(node.page)}"})
WITH p
MATCH (s:Session {id: "${esc(summary.session_id)}"})
MERGE (s)-[:VISITED {order: ${i}, action: "${esc(node.action)}", duration_ms: ${node.duration_ms}}]->(p)`,
    );

    // Page-to-page transitions
    if (i > 0 && journey[i - 1].page !== node.page) {
      queries.push(
        `MERGE (p1:Page {path: "${esc(journey[i - 1].page)}"})
MERGE (p2:Page {path: "${esc(node.page)}"})
MERGE (p1)-[t:LEADS_TO]->(p2)
ON CREATE SET t.count = 1
ON MATCH SET t.count = t.count + 1`,
      );
    }
  }

  // Search queries
  for (const query of summary.search_queries) {
    queries.push(
      `MERGE (sq:SearchQuery {text: "${esc(query.toLowerCase().trim())}"})
WITH sq
MATCH (s:Session {id: "${esc(summary.session_id)}"})
MERGE (s)-[:SEARCHED]->(sq)`,
    );
  }

  // Vehicle views
  for (const vin of summary.vehicles_viewed) {
    queries.push(
      `MERGE (v:Vehicle {vin: "${esc(vin)}"})
WITH v
MATCH (s:Session {id: "${esc(summary.session_id)}"})
MERGE (s)-[:VIEWED]->(v)`,
    );
  }

  return queries;
}

/* ------------------------------------------------------------------ */
/*  Aggregation pipeline — run periodically                            */
/* ------------------------------------------------------------------ */

/**
 * Run the full aggregation pipeline:
 * 1. Generate insights from buffered events
 * 2. Store insights in Qdrant (vector store)
 * 3. Return graph queries for Neo4j (caller executes)
 *
 * Call this from a cron job, API route, or after enough events accumulate.
 */
export async function runAggregationPipeline(): Promise<{
  insights_generated: number;
  insights_stored: number;
  graph_queries: string[];
  sessions_analyzed: number;
}> {
  const buffer = getBuffer();

  // Generate insights
  const insights = generateInsights();

  // Store in Qdrant
  const { stored } = await storeInsightsInVectorStore(insights);

  // Build graph queries for all sessions
  const allGraphQueries: string[] = [];
  for (const [sessionId] of buffer.sessions) {
    const queries = buildGraphQueries(sessionId);
    allGraphQueries.push(...queries);
  }

  return {
    insights_generated: insights.length,
    insights_stored: stored,
    graph_queries: allGraphQueries,
    sessions_analyzed: buffer.sessions.size,
  };
}

/* ------------------------------------------------------------------ */
/*  Stats & diagnostics                                                */
/* ------------------------------------------------------------------ */

export function getBufferStats(): {
  total_events: number;
  active_sessions: number;
  oldest_event: string | null;
  newest_event: string | null;
  events_by_type: Record<string, number>;
} {
  const buffer = getBuffer();

  const byType: Record<string, number> = {};
  let oldest: string | null = null;
  let newest: string | null = null;

  for (const event of buffer.events) {
    byType[event.event_type] = (byType[event.event_type] ?? 0) + 1;

    if (!oldest || event.timestamp < oldest) oldest = event.timestamp;
    if (!newest || event.timestamp > newest) newest = event.timestamp;
  }

  return {
    total_events: buffer.events.length,
    active_sessions: buffer.sessions.size,
    oldest_event: oldest,
    newest_event: newest,
    events_by_type: byType,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function hashStringToId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0x7fffffff;
  }
  return hash || 1;
}

/** Escape strings for Cypher queries (prevent injection). */
function esc(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/'/g, "\\'");
}
