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
import { executeNeo4jQueries } from "@/lib/neo4j-client";

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
/*  Hydration from PostgreSQL                                          */
/* ------------------------------------------------------------------ */

let hydrationDone = false;

/**
 * Hydrate the in-memory buffer from PostgreSQL.
 *
 * On serverless platforms (Vercel), the in-memory buffer is empty after
 * every cold start. This loads recent events from the database so the
 * analytics brain always has data to work with.
 *
 * Only runs once per process — subsequent calls are no-ops.
 */
export async function hydrateBufferFromDb(): Promise<{ loaded: number }> {
  if (hydrationDone) return { loaded: 0 };

  const buffer = getBuffer();
  // Skip if buffer already has data (warm process)
  if (buffer.events.length > 0) {
    hydrationDone = true;
    return { loaded: 0 };
  }

  if (!process.env.DATABASE_URL) {
    hydrationDone = true;
    return { loaded: 0 };
  }

  try {
    const { query } = await import("@/lib/db");

    // Load last 24 hours of events (enough for insights, not too much for memory)
    const result = await query<{
      event_type: string;
      action: string;
      page: string;
      session_id: string;
      user_fingerprint: string;
      timestamp: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT event_type, action, page, session_id, user_fingerprint,
              timestamp::text, metadata
       FROM analytics_events
       WHERE timestamp >= NOW() - INTERVAL '24 hours'
       ORDER BY timestamp ASC
       LIMIT 10000`,
    );

    if (result.rows.length > 0) {
      const events: AnalyticsEvent[] = result.rows.map((row) => ({
        event_type: row.event_type,
        action: row.action,
        page: row.page,
        session_id: row.session_id,
        user_fingerprint: row.user_fingerprint,
        timestamp: row.timestamp,
        metadata: row.metadata ?? {},
      }));

      ingestEvents(events);
    }

    hydrationDone = true;
    return { loaded: result.rows.length };
  } catch (err) {
    console.error("[analytics-engine] Hydration from PG failed:", err);
    hydrationDone = true;
    return { loaded: 0 };
  }
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

  // --- Insight 6: Peak hours (in dealer's local timezone) ---
  const dealerTz = process.env.DEALER_TIMEZONE ?? "America/New_York";
  const hourBuckets = new Array(24).fill(0) as number[];
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      // Convert to dealer timezone for accurate local hour
      const localHourStr = new Date(e.timestamp).toLocaleString("en-US", {
        timeZone: dealerTz,
        hour: "numeric",
        hour12: false,
      });
      const localHour = parseInt(localHourStr, 10);
      if (!isNaN(localHour) && localHour >= 0 && localHour < 24) {
        hourBuckets[localHour]++;
      }
    }
  }

  const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));
  const totalEvents = hourBuckets.reduce((a, b) => a + b, 0);

  // Format hour as readable time (e.g., "4:00 PM")
  const formatHour = (h: number): string => {
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:00 ${suffix}`;
  };

  // Get timezone abbreviation for display (e.g., "EDT", "PST")
  const tzAbbr = new Date()
    .toLocaleString("en-US", { timeZone: dealerTz, timeZoneName: "short" })
    .split(" ")
    .pop() ?? dealerTz;

  if (totalEvents > 10) {
    // Find top 3 busiest hours
    const topHours = hourBuckets
      .map((count, hour) => ({ hour, count }))
      .filter((h) => h.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    insights.push({
      id: `peak_hours_${Date.now()}`,
      insight: `Your busiest hour is ${formatHour(peakHour)} ${tzAbbr} with ${hourBuckets[peakHour]} events (${((hourBuckets[peakHour] / totalEvents) * 100).toFixed(1)}% of traffic). Top hours: ${topHours.map((h) => `${formatHour(h.hour)} (${h.count})`).join(", ")}.`,
      category: "engagement",
      confidence: Math.min(totalEvents / 100, 1),
      sample_size: totalEvents,
      generated_at: now,
      data: { hourly: hourBuckets, peak_hour: peakHour, timezone: dealerTz, timezone_abbr: tzAbbr },
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

  // ================================================================
  // TIER 3 — DATA MOAT INSIGHTS (require full-stack ownership)
  // ================================================================

  // --- Insight 23: Lead Temperature Score (composite of ALL signals) ---
  for (const [sessionId, events] of buffer.sessions) {
    const summary = buildSessionSummary(sessionId);
    if (!summary) continue;

    let temperature = 0;
    const signals: Record<string, number> = {};

    // Vehicle engagement (0-20 pts)
    const vehiclesViewed = summary.vehicles_viewed.length;
    const vehiclePts = Math.min(vehiclesViewed * 4, 20);
    temperature += vehiclePts;
    signals.vehicle_engagement = vehiclePts;

    // Session depth (0-15 pts)
    const pagesVisited = summary.pages_visited.length;
    const depthPts = Math.min(pagesVisited * 3, 15);
    temperature += depthPts;
    signals.session_depth = depthPts;

    // Chat engagement (0-15 pts)
    const chatPts = Math.min(summary.chat_messages * 5, 15);
    temperature += chatPts;
    signals.chat_engagement = chatPts;

    // Return visitor boost (0-15 pts)
    const lifecycleEvent = events.find((e) => e.event_type === "buyer_lifecycle");
    if (lifecycleEvent) {
      const visitCount = (lifecycleEvent.metadata.visit_count as number) ?? 1;
      const returnPts = Math.min((visitCount - 1) * 5, 15);
      temperature += returnPts;
      signals.return_visitor = returnPts;
    }

    // Price/financing interaction (0-10 pts)
    const priceEvents = events.filter((e) =>
      e.event_type === "price_trajectory" ||
      e.event_type === "calculator_input" ||
      (e.event_type === "copy_paste" && (e.metadata.content_type === "price" || e.metadata.content_type === "vin")),
    );
    const pricePts = Math.min(priceEvents.length * 3, 10);
    temperature += pricePts;
    signals.price_interaction = pricePts;

    // Search specificity (0-10 pts)
    const searchPts = Math.min(summary.search_queries.length * 2, 10);
    temperature += searchPts;
    signals.search_activity = searchPts;

    // Time investment (0-10 pts)
    const timeMinutes = summary.duration_ms / 60000;
    const timePts = Math.min(Math.round(timeMinutes * 2), 10);
    temperature += timePts;
    signals.time_investment = timePts;

    // High-intent signals (0-5 pts each)
    const hasFormInteraction = events.some((e) => e.event_type === "form_interaction" && e.action === "field_focus");
    if (hasFormInteraction) { temperature += 5; signals.form_started = 5; }

    const hasChatSpecificity = events.some((e) =>
      e.event_type === "chat_message" && e.metadata.role === "user" &&
      /vin|test\s*drive|financ|appoint|schedul|trade|down\s*payment/i.test(String(e.metadata.content ?? "")),
    );
    if (hasChatSpecificity) { temperature += 5; signals.high_intent_chat = 5; }

    // Comparison shopping (indicator of serious buyer, +5)
    const isComparisonShopper = events.some(
      (e) => e.event_type === "tab_visibility" && e.metadata.likely_comparison_shopping === true,
    );
    if (isComparisonShopper) { temperature += 5; signals.comparison_shopping = 5; }

    // Narrowing behavior from lifecycle (+5)
    if (lifecycleEvent?.metadata.is_narrowing === true) {
      temperature += 5;
      signals.narrowing_behavior = 5;
    }

    // Conversion — the strongest signal (+25 pts)
    if (summary.converted) {
      temperature += 25;
      signals.converted = 25;
    }

    // Cap at 100
    temperature = Math.min(temperature, 100);

    // Classify
    const tier = temperature >= 80 ? "hot" :
      temperature >= 50 ? "warm" :
        temperature >= 25 ? "cool" : "cold";

    insights.push({
      id: `lead_temperature_${sessionId}_${Date.now()}`,
      insight: `Session ${sessionId.slice(0, 8)} has a lead temperature of ${temperature}/100 (${tier}). Signal breakdown: ${Object.entries(signals).filter(([, v]) => v > 0).map(([k, v]) => `${k.replace(/_/g, " ")}=${v}`).join(", ")}. ${tier === "hot" ? "HIGH PRIORITY — this user is ready to buy. Proactive outreach recommended." : tier === "warm" ? "Engaged lead — nurture with personalized follow-up." : "Early-stage browser — optimize for discovery."}`,
      category: "conversion",
      confidence: Math.min(summary.total_events / 20, 1),
      sample_size: summary.total_events,
      generated_at: now,
      data: {
        session_id: sessionId,
        temperature,
        tier,
        signals,
        vehicles_viewed: summary.vehicles_viewed,
        converted: summary.converted,
      },
    });
  }

  // --- Insight 24: Inventory Gap Detection (search vs actual inventory) ---
  // Requires access to inventory data — import at call site
  const searchQueries: { query: string; count: number; sessions: number }[] = [];
  const querySessionMap = new Map<string, Set<string>>();
  for (const [sessionId, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "search" && e.metadata.query) {
        const q = String(e.metadata.query).toLowerCase().trim();
        if (!querySessionMap.has(q)) querySessionMap.set(q, new Set());
        querySessionMap.get(q)!.add(sessionId);
      }
    }
  }
  for (const [query, sessions] of querySessionMap) {
    searchQueries.push({ query, count: sessions.size, sessions: sessions.size });
  }

  // Extract demand signals from search queries
  if (searchQueries.length > 0) {
    const demandSignals = new Map<string, { queries: string[]; total_searches: number }>();

    for (const sq of searchQueries) {
      // Extract make/model/body style/fuel type patterns
      const tokens = sq.query.split(/\s+/);
      for (const token of tokens) {
        const normalized = token.replace(/[^a-z0-9]/g, "");
        if (normalized.length < 2) continue;
        // Match against known categories
        const categories = [
          { pattern: /^(suv|truck|sedan|coupe|van|convertible|hatchback|wagon|crossover|pickup)$/, type: "body_style" },
          { pattern: /^(electric|hybrid|ev|diesel|gasoline)$/, type: "fuel_type" },
          { pattern: /^(awd|4wd|4x4|fwd|rwd)$/, type: "drivetrain" },
          { pattern: /^(honda|toyota|ford|chevrolet|chevy|bmw|tesla|mazda|hyundai|kia|nissan|subaru|volkswagen|audi|mercedes|lexus|jeep|ram|dodge|gmc|cadillac|rivian|porsche)$/, type: "make" },
        ];
        for (const cat of categories) {
          if (cat.pattern.test(normalized)) {
            const key = `${cat.type}:${normalized}`;
            const entry = demandSignals.get(key) ?? { queries: [], total_searches: 0 };
            entry.queries.push(sq.query);
            entry.total_searches += sq.count;
            demandSignals.set(key, entry);
          }
        }

        // Detect price range demands ("under 30k", "below 25000")
        const priceMatch = sq.query.match(/(?:under|below|less\s*than|max|budget)\s*\$?([\d,]+k?)/i);
        if (priceMatch) {
          let priceLimit = priceMatch[1].replace(/,/g, "");
          if (priceLimit.endsWith("k")) priceLimit = priceLimit.slice(0, -1) + "000";
          const key = `price_ceiling:${priceLimit}`;
          const entry = demandSignals.get(key) ?? { queries: [], total_searches: 0 };
          entry.queries.push(sq.query);
          entry.total_searches += sq.count;
          demandSignals.set(key, entry);
        }
      }
    }

    if (demandSignals.size > 0) {
      const ranked = [...demandSignals.entries()]
        .map(([key, data]) => ({ category: key, ...data }))
        .sort((a, b) => b.total_searches - a.total_searches);

      insights.push({
        id: `inventory_demand_${Date.now()}`,
        insight: `Market demand signals from search queries: ${ranked.slice(0, 8).map((r) => `${r.category.replace(":", " ")} (${r.total_searches} searches from queries: "${r.queries.slice(0, 2).join('", "')}")`).join("; ")}. Cross-reference with current inventory to identify gaps — vehicles matching high-demand categories that aren't in stock represent missed revenue.`,
        category: "search",
        confidence: Math.min(ranked[0].total_searches / 10, 1),
        sample_size: searchQueries.reduce((a, sq) => a + sq.count, 0),
        generated_at: now,
        data: { demand_signals: ranked.slice(0, 20), raw_queries: searchQueries.slice(0, 50) },
      });
    }

    // Zero-result searches are the strongest gap signal
    const zeroResultSearches = searchQueries.filter((sq) => {
      const events = [...buffer.sessions.values()].flat();
      return events.some(
        (e) => e.event_type === "search" &&
          String(e.metadata.query).toLowerCase().trim() === sq.query &&
          (e.metadata.result_count === 0 || e.metadata.result_count === undefined),
      );
    });

    if (zeroResultSearches.length > 0) {
      insights.push({
        id: `inventory_gaps_${Date.now()}`,
        insight: `INVENTORY GAPS: ${zeroResultSearches.length} search queries returned ZERO results: ${zeroResultSearches.slice(0, 5).map((sq) => `"${sq.query}" (${sq.sessions} users)`).join(", ")}. These users wanted something you don't have — consider acquiring these vehicle types or adding them to your wish list.`,
        category: "search",
        confidence: Math.min(zeroResultSearches.length / 5, 1),
        sample_size: zeroResultSearches.reduce((a, sq) => a + sq.sessions, 0),
        generated_at: now,
        data: { zero_result_queries: zeroResultSearches },
      });
    }
  }

  // --- Insight 25: Photo Engagement Score (per-vehicle composite) ---
  const vehicleEngagement = new Map<string, {
    vin: string;
    views: number;
    totalDwell: number;
    orientationChanges: number;
    pinchZooms: number;
    copies: number;
    scrollDepth: number;
    sessions: Set<string>;
  }>();

  for (const [sessionId, events] of buffer.sessions) {
    for (const e of events) {
      // Collect per-vehicle signals
      const vin = String(e.metadata.vin ?? "");
      const page = String(e.metadata.page ?? e.page ?? "");
      const isVehiclePage = page.match(/\/inventory\/([A-Z0-9]+)/i);
      const vehicleId = vin || (isVehiclePage ? isVehiclePage[1] : "");
      if (!vehicleId) continue;

      if (!vehicleEngagement.has(vehicleId)) {
        vehicleEngagement.set(vehicleId, {
          vin: vehicleId, views: 0, totalDwell: 0, orientationChanges: 0,
          pinchZooms: 0, copies: 0, scrollDepth: 0, sessions: new Set(),
        });
      }
      const v = vehicleEngagement.get(vehicleId)!;
      v.sessions.add(sessionId);

      if (e.event_type === "vehicle_view") v.views++;
      if (e.event_type === "time_on_page" && isVehiclePage) v.totalDwell += (e.metadata.duration_ms as number) ?? 0;
      if (e.event_type === "device_orientation" && isVehiclePage) v.orientationChanges++;
      if (e.event_type === "touch_gesture" && e.action === "pinch_zoom" && isVehiclePage) v.pinchZooms++;
      if (e.event_type === "copy_paste" && e.action === "copy" && isVehiclePage) v.copies++;
      if (e.event_type === "scroll" && isVehiclePage) v.scrollDepth = Math.max(v.scrollDepth, (e.metadata.depth as number) ?? 0);
    }
  }

  if (vehicleEngagement.size > 0) {
    const scored = [...vehicleEngagement.values()].map((v) => {
      // Composite score: weight each signal
      let score = 0;
      const avgDwell = v.views > 0 ? v.totalDwell / v.views : 0;
      score += Math.min(avgDwell / 30000, 30); // dwell time: up to 30 pts (30s avg = max)
      score += Math.min(v.orientationChanges * 10, 20); // orientation: up to 20 pts
      score += Math.min(v.pinchZooms * 8, 20); // pinch-zoom: up to 20 pts
      score += Math.min(v.copies * 10, 15); // copies (VIN/price): up to 15 pts
      score += Math.min(v.scrollDepth / 100 * 15, 15); // scroll depth: up to 15 pts
      return { ...v, score: Math.round(Math.min(score, 100)), avg_dwell_ms: Math.round(avgDwell), sessions_count: v.sessions.size };
    }).sort((a, b) => b.score - a.score);

    // Find low-engagement vehicles (get views but low interaction)
    const lowEngagement = scored.filter((v) => v.views >= 2 && v.score < 30);
    const highEngagement = scored.filter((v) => v.score >= 60);

    if (scored.length >= 2) {
      const avgScore = Math.round(scored.reduce((a, v) => a + v.score, 0) / scored.length);
      insights.push({
        id: `photo_engagement_${Date.now()}`,
        insight: `Vehicle Photo Engagement Scores (avg ${avgScore}/100): TOP — ${highEngagement.slice(0, 3).map((v) => `${v.vin} (${v.score}/100, ${v.avg_dwell_ms}ms dwell, ${v.pinchZooms} zooms)`).join(", ") || "none yet"}. ${lowEngagement.length > 0 ? `NEEDS ATTENTION — ${lowEngagement.slice(0, 3).map((v) => `${v.vin} (${v.score}/100, ${v.views} views but low interaction)`).join(", ")}. These vehicles attract views but fail to engage — likely need better photos, descriptions, or pricing.` : "All vehicles showing healthy engagement."}`,
        category: "engagement",
        confidence: Math.min(scored.length / 5, 1),
        sample_size: scored.reduce((a, v) => a + v.views, 0),
        generated_at: now,
        data: { vehicles: scored.slice(0, 20), avg_score: avgScore, low_engagement: lowEngagement.slice(0, 10) },
      });
    }
  }

  // --- Insight 26: Cross-Session Buyer Lifecycle ---
  const lifecycleProfiles = new Map<string, {
    fingerprint: string;
    visit_count: number;
    days_active: number;
    stage: string;
    is_narrowing: boolean;
    vehicles_viewed: number;
    searches: number;
  }>();

  for (const [, events] of buffer.sessions) {
    const le = events.find((e) => e.event_type === "buyer_lifecycle");
    if (!le) continue;
    const fp = String(le.metadata.fingerprint ?? le.user_fingerprint ?? "");
    if (!fp || lifecycleProfiles.has(fp)) continue;

    lifecycleProfiles.set(fp, {
      fingerprint: fp.slice(0, 12),
      visit_count: (le.metadata.visit_count as number) ?? 1,
      days_active: (le.metadata.days_since_first_visit as number) ?? 0,
      stage: String(le.metadata.lifecycle_stage ?? "awareness"),
      is_narrowing: (le.metadata.is_narrowing as boolean) ?? false,
      vehicles_viewed: (le.metadata.total_vehicles_viewed as number) ?? 0,
      searches: (le.metadata.total_searches as number) ?? 0,
    });
  }

  if (lifecycleProfiles.size > 0) {
    const profiles = [...lifecycleProfiles.values()];
    const stageCount = new Map<string, number>();
    for (const p of profiles) {
      stageCount.set(p.stage, (stageCount.get(p.stage) ?? 0) + 1);
    }

    const narrowing = profiles.filter((p) => p.is_narrowing);
    const returning = profiles.filter((p) => p.visit_count > 1);

    insights.push({
      id: `buyer_lifecycle_${Date.now()}`,
      insight: `Buyer lifecycle across ${profiles.length} tracked users: ${[...stageCount.entries()].map(([s, c]) => `${s}: ${c}`).join(", ")}. ${returning.length} returning visitors (avg ${returning.length > 0 ? Math.round(returning.reduce((a, p) => a + p.visit_count, 0) / returning.length) : 0} visits). ${narrowing.length} users are NARROWING their search (exploring fewer makes/models per visit) — these are your warmest pre-conversion leads.`,
      category: "conversion",
      confidence: Math.min(profiles.length / 10, 1),
      sample_size: profiles.length,
      generated_at: now,
      data: { stages: Object.fromEntries(stageCount), narrowing_count: narrowing.length, returning_count: returning.length, profiles: profiles.slice(0, 20) },
    });
  }

  // --- Insight 27: Performance → Conversion Correlation ---
  const perfBuckets = new Map<string, { sessions: number; conversions: number; avg_load_ms: number; total_load_ms: number }>();

  for (const [sessionId, events] of buffer.sessions) {
    const perfEvent = events.find((e) => e.event_type === "page_performance" && e.action === "timing_measured");
    if (!perfEvent) continue;

    const loadMs = (perfEvent.metadata.load_time_ms as number) ?? 0;
    if (loadMs <= 0) continue;

    // Bucket: <1s, 1-2s, 2-3s, 3-5s, 5s+
    const bucket = loadMs < 1000 ? "<1s" :
      loadMs < 2000 ? "1-2s" :
        loadMs < 3000 ? "2-3s" :
          loadMs < 5000 ? "3-5s" : "5s+";

    const entry = perfBuckets.get(bucket) ?? { sessions: 0, conversions: 0, avg_load_ms: 0, total_load_ms: 0 };
    entry.sessions++;
    entry.total_load_ms += loadMs;
    entry.avg_load_ms = Math.round(entry.total_load_ms / entry.sessions);

    const summary = buildSessionSummary(sessionId);
    if (summary?.converted) entry.conversions++;

    perfBuckets.set(bucket, entry);
  }

  if (perfBuckets.size >= 2) {
    const buckets = [...perfBuckets.entries()]
      .map(([range, data]) => ({
        range,
        ...data,
        conversion_rate: data.sessions > 0 ? data.conversions / data.sessions : 0,
      }))
      .sort((a, b) => a.avg_load_ms - b.avg_load_ms);

    const fastest = buckets[0];
    const slowest = buckets[buckets.length - 1];
    const convDrop = fastest.conversion_rate > 0 && slowest.conversion_rate < fastest.conversion_rate
      ? Math.round((1 - slowest.conversion_rate / fastest.conversion_rate) * 100)
      : 0;

    insights.push({
      id: `perf_conversion_${Date.now()}`,
      insight: `Page speed → conversion correlation: ${buckets.map((b) => `${b.range}: ${(b.conversion_rate * 100).toFixed(1)}% conversion (${b.sessions} sessions, avg ${b.avg_load_ms}ms)`).join(" | ")}. ${convDrop > 0 ? `Users on slow connections convert ${convDrop}% LESS than fast ones. Every second of load time costs you leads.` : "Not enough conversion data yet for speed impact analysis."}`,
      category: "conversion",
      confidence: Math.min(buckets.reduce((a, b) => a + b.sessions, 0) / 30, 1),
      sample_size: buckets.reduce((a, b) => a + b.sessions, 0),
      generated_at: now,
      data: { buckets, conversion_drop_pct: convDrop },
    });
  }

  // --- Insight 28: CTA Visibility Gap ---
  const ctaStats = new Map<string, {
    text: string;
    position_pct: number;
    times_visible: number;
    times_clicked: number;
    avg_visible_ms: number;
    total_visible_ms: number;
    page: string;
  }>();

  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "cta_visibility") {
        const text = String(e.metadata.cta_text ?? "").trim();
        if (!text) continue;
        const key = `${e.metadata.page}:${text}`;
        const entry = ctaStats.get(key) ?? {
          text,
          position_pct: (e.metadata.position_pct as number) ?? 0,
          times_visible: 0,
          times_clicked: 0,
          avg_visible_ms: 0,
          total_visible_ms: 0,
          page: String(e.metadata.page ?? "/"),
        };
        entry.times_visible++;
        entry.total_visible_ms += (e.metadata.visible_duration_ms as number) ?? 0;
        entry.avg_visible_ms = Math.round(entry.total_visible_ms / entry.times_visible);
        ctaStats.set(key, entry);
      }
    }

    // Cross-reference: check if CTA text was clicked
    for (const e of events) {
      if (e.event_type === "click") {
        const clickText = String(e.metadata.text ?? "").trim();
        for (const [key, cta] of ctaStats) {
          if (cta.text === clickText || clickText.includes(cta.text)) {
            cta.times_clicked++;
          }
        }
      }
    }
  }

  // Also cross-reference with scroll depth data to find visibility gaps
  const pageScrollDepths = new Map<string, number[]>();
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "scroll" && typeof e.metadata.depth === "number") {
        const page = String(e.metadata.page ?? e.page ?? "/");
        const depths = pageScrollDepths.get(page) ?? [];
        depths.push(e.metadata.depth as number);
        pageScrollDepths.set(page, depths);
      }
    }
  }

  if (ctaStats.size > 0) {
    const ctas = [...ctaStats.values()].sort((a, b) => b.times_visible - a.times_visible);
    const gaps: string[] = [];

    for (const cta of ctas) {
      const scrollDepths = pageScrollDepths.get(cta.page) ?? [];
      if (scrollDepths.length === 0) continue;

      const reachPct = Math.round(
        (scrollDepths.filter((d) => d >= cta.position_pct).length / scrollDepths.length) * 100,
      );

      if (reachPct < 50 && cta.position_pct > 40) {
        gaps.push(`"${cta.text.slice(0, 30)}" on ${cta.page} is at ${cta.position_pct}% scroll depth but only ${reachPct}% of users scroll that far`);
      }
    }

    const ctaClickRates = ctas
      .filter((c) => c.times_visible >= 3)
      .map((c) => ({
        ...c,
        click_rate: c.times_visible > 0 ? c.times_clicked / c.times_visible : 0,
      }))
      .sort((a, b) => a.click_rate - b.click_rate);

    insights.push({
      id: `cta_visibility_${Date.now()}`,
      insight: `CTA Performance: ${ctaClickRates.slice(0, 5).map((c) => `"${c.text.slice(0, 25)}" on ${c.page} — seen ${c.times_visible}x, clicked ${c.times_clicked}x (${(c.click_rate * 100).toFixed(0)}% CTR, position ${c.position_pct}%)`).join("; ")}. ${gaps.length > 0 ? `VISIBILITY GAPS: ${gaps.slice(0, 3).join("; ")}. Move these CTAs higher on the page to increase exposure.` : "All CTAs are within scroll reach for most users."}`,
      category: "conversion",
      confidence: Math.min(ctas.reduce((a, c) => a + c.times_visible, 0) / 20, 1),
      sample_size: ctas.reduce((a, c) => a + c.times_visible, 0),
      generated_at: now,
      data: { ctas: ctaClickRates.slice(0, 15), visibility_gaps: gaps },
    });
  }

  // ================================================================
  // CROSS-REFERENCE IMPROVEMENTS (enhance existing insights)
  // ================================================================

  // --- Cross-ref 1: Network quality × conversion (slow network = different behavior) ---
  const networkBuckets = new Map<string, { sessions: number; conversions: number; avg_dwell_ms: number; total_dwell_ms: number }>();
  for (const [sessionId, events] of buffer.sessions) {
    const netEvent = events.find((e) => e.event_type === "network_quality");
    if (!netEvent) continue;
    const type = String(netEvent.metadata.effective_type ?? "unknown");
    const entry = networkBuckets.get(type) ?? { sessions: 0, conversions: 0, avg_dwell_ms: 0, total_dwell_ms: 0 };
    entry.sessions++;
    const summary = buildSessionSummary(sessionId);
    if (summary?.converted) entry.conversions++;
    if (summary) { entry.total_dwell_ms += summary.duration_ms; entry.avg_dwell_ms = Math.round(entry.total_dwell_ms / entry.sessions); }
    networkBuckets.set(type, entry);
  }
  if (networkBuckets.size >= 2) {
    const nets = [...networkBuckets.entries()].map(([type, data]) => ({
      type, ...data, conversion_rate: data.sessions > 0 ? data.conversions / data.sessions : 0,
    })).sort((a, b) => b.conversion_rate - a.conversion_rate);
    insights.push({
      id: `network_conversion_${Date.now()}`,
      insight: `Network quality impact: ${nets.map((n) => `${n.type}: ${n.sessions} sessions, ${(n.conversion_rate * 100).toFixed(1)}% conversion, avg ${Math.round(n.avg_dwell_ms / 1000)}s dwell`).join(" | ")}. ${nets[nets.length - 1].conversion_rate < nets[0].conversion_rate * 0.5 ? `Users on ${nets[nets.length - 1].type} connections convert ${Math.round((1 - nets[nets.length - 1].conversion_rate / (nets[0].conversion_rate || 1)) * 100)}% less — optimize page weight for mobile users.` : "Network quality shows minimal conversion impact — good mobile optimization."}`,
      category: "conversion",
      confidence: Math.min(nets.reduce((a, n) => a + n.sessions, 0) / 20, 1),
      sample_size: nets.reduce((a, n) => a + n.sessions, 0),
      generated_at: now,
      data: { network_types: nets },
    });
  }

  // --- Cross-ref 2: Exit intent × lead temperature (are HOT leads leaving?) ---
  const exitTemperatures: { temperature: number; page: string }[] = [];
  for (const [sessionId, events] of buffer.sessions) {
    const hasExitIntent = events.some((e) => e.event_type === "exit_intent");
    if (!hasExitIntent) continue;

    // Find or calculate this session's temperature from our insights
    const tempInsight = insights.find(
      (i) => i.id.startsWith("lead_temperature_") && i.data.session_id === sessionId,
    );
    if (tempInsight) {
      const exitPage = events.find((e) => e.event_type === "exit_intent");
      exitTemperatures.push({
        temperature: tempInsight.data.temperature as number,
        page: String(exitPage?.metadata.page ?? "/"),
      });
    }
  }

  if (exitTemperatures.length > 0) {
    const hotExits = exitTemperatures.filter((e) => e.temperature >= 50);
    if (hotExits.length > 0) {
      const exitPages = new Map<string, number>();
      for (const e of hotExits) exitPages.set(e.page, (exitPages.get(e.page) ?? 0) + 1);
      const topExitPages = [...exitPages.entries()].sort((a, b) => b[1] - a[1]);

      insights.push({
        id: `hot_lead_exit_${Date.now()}`,
        insight: `WARNING: ${hotExits.length} warm/hot leads (temperature 50+) are showing exit intent. They're leaving from: ${topExitPages.slice(0, 3).map(([p, c]) => `${p} (${c}x)`).join(", ")}. These are your highest-value visitors about to walk away — consider targeted retention: chat prompts, special offers, or scheduling CTAs on these exit pages.`,
        category: "conversion",
        confidence: Math.min(hotExits.length / 5, 1),
        sample_size: exitTemperatures.length,
        generated_at: now,
        data: { hot_exits: hotExits.length, total_exits: exitTemperatures.length, exit_pages: topExitPages },
      });
    }
  }

  // --- Cross-ref 3: Rage clicks × lead temperature (frustrated buyers are the worst to lose) ---
  const frustratedBuyers: { temperature: number; element: string }[] = [];
  for (const [sessionId, events] of buffer.sessions) {
    const hasRageClicks = events.some((e) => e.event_type === "rage_click");
    if (!hasRageClicks) continue;

    const tempInsight = insights.find(
      (i) => i.id.startsWith("lead_temperature_") && i.data.session_id === sessionId,
    );
    if (tempInsight && (tempInsight.data.temperature as number) >= 40) {
      const rageEvent = events.find((e) => e.event_type === "rage_click");
      frustratedBuyers.push({
        temperature: tempInsight.data.temperature as number,
        element: String(rageEvent?.metadata.element_text ?? rageEvent?.metadata.element ?? "unknown"),
      });
    }
  }

  if (frustratedBuyers.length > 0) {
    insights.push({
      id: `frustrated_buyers_${Date.now()}`,
      insight: `CRITICAL UX ISSUE: ${frustratedBuyers.length} engaged leads (temp ${Math.round(frustratedBuyers.reduce((a, f) => a + f.temperature, 0) / frustratedBuyers.length)}+ avg) are rage-clicking on: ${[...new Set(frustratedBuyers.map((f) => `"${f.element.slice(0, 30)}"`))].slice(0, 3).join(", ")}. These are people trying to buy from you but getting blocked by broken or slow UI elements. Fix these immediately — each frustrated buyer is lost revenue.`,
      category: "ux_friction",
      confidence: Math.min(frustratedBuyers.length / 3, 1),
      sample_size: frustratedBuyers.length,
      generated_at: now,
      data: { frustrated_buyers: frustratedBuyers },
    });
  }

  // ================================================================
  // TIER 4 — FEATURE-CONNECTED INSIGHTS (from wired components)
  // ================================================================

  // --- Insight 29: Vehicle Comparison Patterns ---
  const comparisonPairs = new Map<string, number>();
  const compareActions = new Map<string, number>();
  for (const [, events] of buffer.sessions) {
    const compared: string[] = [];
    for (const e of events) {
      if (e.event_type === "vehicle_comparison") {
        if (e.action === "added_to_compare" && e.metadata.vin) {
          compared.push(String(e.metadata.vin));
        }
        if (e.action === "compare_initiated" && Array.isArray(e.metadata.vins)) {
          // Record the exact comparison set
          const vins = (e.metadata.vins as string[]).sort();
          for (let i = 0; i < vins.length; i++) {
            for (let j = i + 1; j < vins.length; j++) {
              const pair = `${vins[i]}|${vins[j]}`;
              comparisonPairs.set(pair, (comparisonPairs.get(pair) ?? 0) + 1);
            }
          }
        }
        const action = String(e.action);
        compareActions.set(action, (compareActions.get(action) ?? 0) + 1);
      }
    }
  }

  if (comparisonPairs.size > 0) {
    const topPairs = [...comparisonPairs.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pair, count]) => ({ vehicles: pair.split("|"), count }));

    const totalCompares = compareActions.get("compare_initiated") ?? 0;
    const totalAdds = compareActions.get("added_to_compare") ?? 0;

    insights.push({
      id: `comparison_patterns_${Date.now()}`,
      insight: `Vehicle comparison behavior: ${totalAdds} vehicles added to compare, ${totalCompares} comparisons viewed. Most compared pairs: ${topPairs.slice(0, 3).map((p) => `${p.vehicles.join(" vs ")} (${p.count}x)`).join(", ")}. These pairings reveal which vehicles buyers see as substitutes -- position them accordingly in marketing and lot placement.`,
      category: "engagement",
      confidence: Math.min(totalCompares / 5, 1),
      sample_size: totalAdds + totalCompares,
      generated_at: now,
      data: { top_pairs: topPairs, total_compares: totalCompares, total_adds: totalAdds },
    });
  }

  // --- Insight 30: Financing Intent Profile ---
  const financingProfiles = new Map<string, {
    mode_preferences: { loan: number; lease: number };
    monthly_ranges: Map<string, number>;
    down_ranges: Map<string, number>;
    term_preferences: Map<number, number>;
    interactions: number;
  }>();

  for (const [sessionId, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "calculator_input" && e.action === "calc_interaction") {
        if (!financingProfiles.has(sessionId)) {
          financingProfiles.set(sessionId, {
            mode_preferences: { loan: 0, lease: 0 },
            monthly_ranges: new Map(),
            down_ranges: new Map(),
            term_preferences: new Map(),
            interactions: 0,
          });
        }
        const profile = financingProfiles.get(sessionId)!;
        profile.interactions++;

        const mode = String(e.metadata.mode ?? "loan");
        if (mode === "lease") profile.mode_preferences.lease++;
        else profile.mode_preferences.loan++;

        const monthly = String(e.metadata.target_monthly_range ?? "unknown");
        profile.monthly_ranges.set(monthly, (profile.monthly_ranges.get(monthly) ?? 0) + 1);

        const down = String(e.metadata.down_payment_range ?? "unknown");
        profile.down_ranges.set(down, (profile.down_ranges.get(down) ?? 0) + 1);

        const term = (e.metadata.term_months as number) ?? 60;
        profile.term_preferences.set(term, (profile.term_preferences.get(term) ?? 0) + 1);
      }
    }
  }

  if (financingProfiles.size > 0) {
    let totalLoan = 0, totalLease = 0;
    const allMonthly = new Map<string, number>();
    const allTerms = new Map<number, number>();
    let totalInteractions = 0;

    for (const profile of financingProfiles.values()) {
      totalLoan += profile.mode_preferences.loan;
      totalLease += profile.mode_preferences.lease;
      totalInteractions += profile.interactions;
      for (const [range, count] of profile.monthly_ranges) allMonthly.set(range, (allMonthly.get(range) ?? 0) + count);
      for (const [term, count] of profile.term_preferences) allTerms.set(term, (allTerms.get(term) ?? 0) + count);
    }

    const topMonthly = [...allMonthly.entries()].sort((a, b) => b[1] - a[1]);
    const topTerms = [...allTerms.entries()].sort((a, b) => b[1] - a[1]);
    const leaseRatio = totalLease / (totalLoan + totalLease || 1);

    insights.push({
      id: `financing_intent_${Date.now()}`,
      insight: `Financing behavior: ${financingProfiles.size} users interacted with the calculator (${totalInteractions} total adjustments). ${(leaseRatio * 100).toFixed(0)}% explored leasing. Target monthly payment distribution: ${topMonthly.slice(0, 3).map(([r, c]) => `${r}: ${c}`).join(", ")}. Preferred terms: ${topTerms.slice(0, 3).map(([t, c]) => `${t}mo: ${c}`).join(", ")}. ${leaseRatio > 0.3 ? "Significant lease interest -- ensure lease specials are prominent." : "Users prefer financing -- highlight low APR offers."}`,
      category: "conversion",
      confidence: Math.min(financingProfiles.size / 5, 1),
      sample_size: totalInteractions,
      generated_at: now,
      data: {
        users: financingProfiles.size,
        loan_vs_lease: { loan: totalLoan, lease: totalLease, lease_ratio: leaseRatio },
        monthly_distribution: Object.fromEntries(allMonthly),
        term_distribution: Object.fromEntries(allTerms),
        total_interactions: totalInteractions,
      },
    });
  }

  // --- Insight 31: Gallery Engagement (enriches Photo Engagement Score) ---
  const galleryStats = new Map<string, {
    lightbox_opens: number;
    total_dwell_ms: number;
    photos_viewed_counts: number[];
    viewed_all_count: number;
    thumbnail_clicks: number;
  }>();

  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "gallery_interaction") {
        const vehicle = String(e.metadata.alt ?? "unknown");
        if (!galleryStats.has(vehicle)) {
          galleryStats.set(vehicle, {
            lightbox_opens: 0, total_dwell_ms: 0, photos_viewed_counts: [],
            viewed_all_count: 0, thumbnail_clicks: 0,
          });
        }
        const stats = galleryStats.get(vehicle)!;

        if (e.action === "lightbox_opened") stats.lightbox_opens++;
        if (e.action === "lightbox_closed") {
          stats.total_dwell_ms += (e.metadata.dwell_ms as number) ?? 0;
          stats.photos_viewed_counts.push((e.metadata.photos_viewed as number) ?? 0);
          if (e.metadata.viewed_all === true) stats.viewed_all_count++;
        }
        if (e.action === "thumbnail_click") stats.thumbnail_clicks++;
      }
    }
  }

  if (galleryStats.size > 0) {
    const ranked = [...galleryStats.entries()]
      .map(([vehicle, stats]) => ({
        vehicle,
        ...stats,
        avg_dwell_ms: stats.lightbox_opens > 0 ? Math.round(stats.total_dwell_ms / stats.lightbox_opens) : 0,
        avg_photos_viewed: stats.photos_viewed_counts.length > 0
          ? Math.round(stats.photos_viewed_counts.reduce((a, b) => a + b, 0) / stats.photos_viewed_counts.length)
          : 0,
      }))
      .sort((a, b) => b.lightbox_opens - a.lightbox_opens);

    insights.push({
      id: `gallery_engagement_${Date.now()}`,
      insight: `Photo gallery engagement: ${ranked.slice(0, 5).map((r) => `"${r.vehicle}" -- ${r.lightbox_opens} lightbox opens, avg ${Math.round(r.avg_dwell_ms / 1000)}s dwell, ${r.avg_photos_viewed} photos viewed, ${r.viewed_all_count} viewed all`).join("; ")}. ${ranked.some((r) => r.avg_photos_viewed < 2 && r.lightbox_opens > 2) ? "Some vehicles have low photo browse-through -- consider reordering photos (best angle first) or adding more angles." : "Gallery engagement is healthy across listings."}`,
      category: "engagement",
      confidence: Math.min(ranked.reduce((a, r) => a + r.lightbox_opens, 0) / 10, 1),
      sample_size: ranked.reduce((a, r) => a + r.lightbox_opens + r.thumbnail_clicks, 0),
      generated_at: now,
      data: { vehicles: ranked.slice(0, 20) },
    });
  }

  // --- Insight 32: UTM Campaign Attribution ---
  const campaignMap = new Map<string, { visits: number; conversions: number; leads: number; sessions: Set<string> }>();

  for (const [sessionId, events] of buffer.sessions) {
    const firstEvent = events[0];
    const utmSource = String(firstEvent?.metadata?.utm_source ?? "");
    const utmMedium = String(firstEvent?.metadata?.utm_medium ?? "");
    const utmCampaign = String(firstEvent?.metadata?.utm_campaign ?? "");

    if (!utmSource && !utmCampaign) continue;

    const key = [utmSource, utmMedium, utmCampaign].filter(Boolean).join(" / ") || "unknown";
    if (!campaignMap.has(key)) campaignMap.set(key, { visits: 0, conversions: 0, leads: 0, sessions: new Set() });
    const camp = campaignMap.get(key)!;
    camp.visits++;
    camp.sessions.add(sessionId);

    for (const e of events) {
      if (CONVERSION_ACTIONS.has(e.action)) camp.conversions++;
      if (e.action === "submit_lead_form" || e.action === "submit_contact_form") camp.leads++;
    }
  }

  if (campaignMap.size > 0) {
    const ranked = [...campaignMap.entries()]
      .map(([campaign, stats]) => ({
        campaign,
        visits: stats.visits,
        conversions: stats.conversions,
        leads: stats.leads,
        conversion_rate: stats.visits > 0 ? Math.round((stats.conversions / stats.visits) * 100) : 0,
      }))
      .sort((a, b) => b.leads - a.leads || b.conversions - a.conversions);

    insights.push({
      id: `utm_campaign_attribution_${Date.now()}`,
      insight: `Campaign attribution: ${ranked.slice(0, 5).map((c) => `"${c.campaign}" → ${c.visits} visits, ${c.leads} leads, ${c.conversion_rate}% conversion`).join("; ")}. ${ranked.find((c) => c.visits > 10 && c.leads === 0) ? "Some campaigns drive traffic but zero leads — review ad targeting or landing pages." : ""}`,
      category: "marketing",
      confidence: Math.min(ranked.reduce((a, c) => a + c.visits, 0) / 50, 1),
      sample_size: ranked.reduce((a, c) => a + c.visits, 0),
      generated_at: now,
      data: { campaigns: ranked.slice(0, 20) },
    });
  }

  // --- Insight 33: Retargeting Signals ---
  const retargetCandidates: Array<{ fingerprint: string; vehicle_views: number; sessions: number; last_seen: string; top_vehicle: string }> = [];

  const userVehicleViews = new Map<string, Map<string, number>>();
  const userSessionCounts = new Map<string, { sessions: Set<string>; last_seen: string }>();

  for (const [sessionId, events] of buffer.sessions) {
    for (const e of events) {
      const fp = e.user_fingerprint;
      if (!userSessionCounts.has(fp)) userSessionCounts.set(fp, { sessions: new Set(), last_seen: e.timestamp });
      userSessionCounts.get(fp)!.sessions.add(sessionId);
      if (e.timestamp > userSessionCounts.get(fp)!.last_seen) userSessionCounts.get(fp)!.last_seen = e.timestamp;

      if (e.event_type === "vehicle_view" || (e.event_type === "click" && e.metadata.vin)) {
        if (!userVehicleViews.has(fp)) userVehicleViews.set(fp, new Map());
        const vin = String(e.metadata.vin ?? e.metadata.vehicle ?? "unknown");
        userVehicleViews.get(fp)!.set(vin, (userVehicleViews.get(fp)!.get(vin) ?? 0) + 1);
      }
    }
  }

  for (const [fp, vehicles] of userVehicleViews) {
    const totalViews = [...vehicles.values()].reduce((a, b) => a + b, 0);
    const hasConversion = [...buffer.sessions.values()].some((events) =>
      events.some((e) => e.user_fingerprint === fp && CONVERSION_ACTIONS.has(e.action))
    );

    if (totalViews >= 3 && !hasConversion) {
      const topVehicle = [...vehicles.entries()].sort((a, b) => b[1] - a[1])[0];
      retargetCandidates.push({
        fingerprint: fp,
        vehicle_views: totalViews,
        sessions: userSessionCounts.get(fp)?.sessions.size ?? 1,
        last_seen: userSessionCounts.get(fp)?.last_seen ?? now,
        top_vehicle: topVehicle[0],
      });
    }
  }

  if (retargetCandidates.length > 0) {
    retargetCandidates.sort((a, b) => b.vehicle_views - a.vehicle_views);
    insights.push({
      id: `retargeting_signals_${Date.now()}`,
      insight: `${retargetCandidates.length} visitors viewed vehicles 3+ times without converting — prime retargeting candidates. Top: ${retargetCandidates.slice(0, 3).map((c) => `${c.vehicle_views} views across ${c.sessions} sessions, most interested in ${c.top_vehicle}`).join("; ")}.`,
      category: "marketing",
      confidence: Math.min(retargetCandidates.length / 10, 1),
      sample_size: retargetCandidates.reduce((a, c) => a + c.vehicle_views, 0),
      generated_at: now,
      data: { candidates: retargetCandidates.slice(0, 50) },
    });
  }

  // --- Insight 34: Seasonal Demand Patterns ---
  const monthlyDemand = new Map<string, Map<string, number>>();

  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "search" || e.event_type === "vehicle_view") {
        const month = e.timestamp.slice(0, 7); // YYYY-MM
        const category = String(
          e.metadata.body_style ?? e.metadata.category ?? e.metadata.query ?? "other"
        ).toLowerCase();

        if (!monthlyDemand.has(month)) monthlyDemand.set(month, new Map());
        monthlyDemand.get(month)!.set(category, (monthlyDemand.get(month)!.get(category) ?? 0) + 1);
      }
    }
  }

  if (monthlyDemand.size > 1) {
    const trends: Array<{ month: string; top_categories: Array<{ category: string; count: number }> }> = [];

    for (const [month, categories] of [...monthlyDemand.entries()].sort()) {
      const top = [...categories.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([category, count]) => ({ category, count }));
      trends.push({ month, top_categories: top });
    }

    const latestMonth = trends[trends.length - 1];
    const topNow = latestMonth.top_categories[0]?.category ?? "unknown";

    insights.push({
      id: `seasonal_demand_${Date.now()}`,
      insight: `Seasonal demand: "${topNow}" is the most searched category this period. ${trends.length > 1 ? `Trends over ${trends.length} months: ${trends.map((t) => `${t.month}: top is "${t.top_categories[0]?.category}"`).join(", ")}.` : ""} Stock inventory to match demand curves.`,
      category: "marketing",
      confidence: Math.min([...monthlyDemand.values()].reduce((a, m) => a + [...m.values()].reduce((b, c) => b + c, 0), 0) / 100, 1),
      sample_size: [...monthlyDemand.values()].reduce((a, m) => a + [...m.values()].reduce((b, c) => b + c, 0), 0),
      generated_at: now,
      data: { trends },
    });
  }

  // --- Insight 35: Chat-to-Conversion Attribution ---
  let chatConvSessions = 0;
  let chatConvCount = 0;
  for (const [, events] of buffer.sessions) {
    const hasChat = events.some((e) => e.event_type === "chat_message");
    if (!hasChat) continue;
    chatConvSessions++;
    if (events.some((e) => CONVERSION_ACTIONS.has(e.action))) chatConvCount++;
  }
  if (chatConvSessions > 0) {
    const rate = Math.round((chatConvCount / chatConvSessions) * 100);
    insights.push({
      id: `chat_conversion_${Date.now()}`,
      insight: `Chat-to-conversion: ${chatConvCount}/${chatConvSessions} chat sessions led to a conversion (${rate}%). ${rate > 20 ? "Chat is effectively closing deals." : rate > 5 ? "Chat assists but rarely closes — consider adding CTAs within chat." : "Chat isn't driving conversions — review chat responses and add scheduling/contact prompts."}`,
      category: "chat",
      confidence: Math.min(chatConvSessions / 20, 1),
      sample_size: chatConvSessions,
      generated_at: now,
      data: { chat_sessions: chatConvSessions, conversions: chatConvCount, rate },
    });
  }

  // --- Insight 36: Chat Topic Demand ---
  const topicCounts = new Map<string, number>();
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "chat_message" && e.metadata.role === "user") {
        const msg = String(e.metadata.message ?? "").toLowerCase();
        const topics = [
          ["financing", "finance", "payment", "apr", "loan", "credit"],
          ["trade-in", "trade in", "tradein", "my car"],
          ["availability", "available", "in stock", "do you have"],
          ["test drive", "schedule", "appointment", "come in"],
          ["warranty", "certified", "cpo", "guarantee"],
          ["price", "cost", "how much", "deal", "negotiate"],
        ];
        for (const [keyword, ...aliases] of topics) {
          if ([keyword, ...aliases].some((k) => msg.includes(k))) {
            topicCounts.set(keyword, (topicCounts.get(keyword) ?? 0) + 1);
          }
        }
      }
    }
  }
  if (topicCounts.size > 0) {
    const ranked = [...topicCounts.entries()].sort((a, b) => b[1] - a[1]);
    insights.push({
      id: `chat_topic_demand_${Date.now()}`,
      insight: `Chat topics: ${ranked.map(([t, c]) => `"${t}" (${c}x)`).join(", ")}. ${ranked[0] ? `"${ranked[0][0]}" is the #1 question — ensure this info is prominent on your site.` : ""}`,
      category: "chat",
      confidence: Math.min(ranked.reduce((a, [, c]) => a + c, 0) / 20, 1),
      sample_size: ranked.reduce((a, [, c]) => a + c, 0),
      generated_at: now,
      data: { topics: ranked },
    });
  }

  // --- Insight 37: Slow Page Bounce Correlation ---
  const pagePerfBounce = new Map<string, { slow_visits: number; slow_bounces: number; fast_visits: number; fast_bounces: number }>();
  for (const [, events] of buffer.sessions) {
    const pageViews = events.filter((e) => e.event_type === "page_view");
    const isBounce = pageViews.length === 1;
    for (const e of pageViews) {
      const loadMs = Number(e.metadata.load_time_ms ?? e.metadata.duration_ms ?? 0);
      const page = e.page;
      if (!pagePerfBounce.has(page)) pagePerfBounce.set(page, { slow_visits: 0, slow_bounces: 0, fast_visits: 0, fast_bounces: 0 });
      const stats = pagePerfBounce.get(page)!;
      if (loadMs > 3000) { stats.slow_visits++; if (isBounce) stats.slow_bounces++; }
      else { stats.fast_visits++; if (isBounce) stats.fast_bounces++; }
    }
  }
  const slowBouncePages = [...pagePerfBounce.entries()]
    .filter(([, s]) => s.slow_visits >= 3 && s.slow_bounces / s.slow_visits > 0.5)
    .map(([page, s]) => ({ page, slow_bounce_rate: Math.round((s.slow_bounces / s.slow_visits) * 100), fast_bounce_rate: s.fast_visits > 0 ? Math.round((s.fast_bounces / s.fast_visits) * 100) : 0 }))
    .sort((a, b) => b.slow_bounce_rate - a.slow_bounce_rate);
  if (slowBouncePages.length > 0) {
    insights.push({
      id: `slow_page_bounce_${Date.now()}`,
      insight: `Slow pages losing visitors: ${slowBouncePages.slice(0, 3).map((p) => `"${p.page}" — ${p.slow_bounce_rate}% bounce when slow vs ${p.fast_bounce_rate}% when fast`).join("; ")}. Speed improvements here directly recover lost leads.`,
      category: "ux_friction",
      confidence: Math.min(slowBouncePages.reduce((a, p) => a + p.slow_bounce_rate, 0) / 200, 1),
      sample_size: [...pagePerfBounce.values()].reduce((a, s) => a + s.slow_visits, 0),
      generated_at: now,
      data: { pages: slowBouncePages },
    });
  }

  // --- Insight 38: Mobile Pinch-Zoom Detection ---
  const pinchPages = new Map<string, number>();
  for (const [, events] of buffer.sessions) {
    for (const e of events) {
      if (e.event_type === "pinch_zoom" || (e.event_type === "gesture" && e.action === "pinch_zoom")) {
        pinchPages.set(e.page, (pinchPages.get(e.page) ?? 0) + 1);
      }
    }
  }
  if (pinchPages.size > 0) {
    const ranked = [...pinchPages.entries()].sort((a, b) => b[1] - a[1]);
    insights.push({
      id: `pinch_zoom_${Date.now()}`,
      insight: `Mobile pinch-zoom detected on: ${ranked.slice(0, 5).map(([p, c]) => `"${p}" (${c}x)`).join(", ")}. Users are zooming because text or buttons are too small — increase font sizes and tap targets on these pages.`,
      category: "ux_friction",
      confidence: Math.min(ranked.reduce((a, [, c]) => a + c, 0) / 15, 1),
      sample_size: ranked.reduce((a, [, c]) => a + c, 0),
      generated_at: now,
      data: { pages: ranked },
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
/**
 * Build parameterized Cypher queries for a session's journey graph.
 *
 * Returns objects with { statement, parameters } for Neo4j's HTTP API.
 * Uses parameterized queries (not string interpolation) to prevent
 * Cypher injection from user-controlled data.
 */
export function buildGraphQueries(
  sessionId: string,
): Array<{ statement: string; parameters: Record<string, unknown> }> {
  const summary = buildSessionSummary(sessionId);
  const journey = buildJourney(sessionId);
  if (!summary || journey.length === 0) return [];

  const queries: Array<{ statement: string; parameters: Record<string, unknown> }> = [];

  // Create User + Session nodes
  queries.push({
    statement: `MERGE (u:User {fingerprint: $fingerprint})
MERGE (s:Session {id: $sessionId})
SET s.started_at = datetime($startedAt),
    s.ended_at = datetime($endedAt),
    s.duration_ms = $durationMs,
    s.converted = $converted,
    s.conversion_type = $conversionType,
    s.total_events = $totalEvents,
    s.chat_messages = $chatMessages
MERGE (u)-[:HAS_SESSION]->(s)`,
    parameters: {
      fingerprint: summary.user_fingerprint,
      sessionId: summary.session_id,
      startedAt: summary.started_at,
      endedAt: summary.ended_at,
      durationMs: summary.duration_ms,
      converted: summary.converted,
      conversionType: summary.conversion_type ?? null,
      totalEvents: summary.total_events,
      chatMessages: summary.chat_messages,
    },
  });

  // Create Page visit chain
  for (let i = 0; i < journey.length; i++) {
    const node = journey[i];
    queries.push({
      statement: `MERGE (p:Page {path: $page})
WITH p
MATCH (s:Session {id: $sessionId})
MERGE (s)-[:VISITED {order: $order, action: $action, duration_ms: $durationMs}]->(p)`,
      parameters: {
        page: node.page,
        sessionId: summary.session_id,
        order: i,
        action: node.action,
        durationMs: node.duration_ms,
      },
    });

    // Page-to-page transitions
    if (i > 0 && journey[i - 1].page !== node.page) {
      queries.push({
        statement: `MERGE (p1:Page {path: $fromPage})
MERGE (p2:Page {path: $toPage})
MERGE (p1)-[t:LEADS_TO]->(p2)
ON CREATE SET t.count = 1
ON MATCH SET t.count = t.count + 1`,
        parameters: {
          fromPage: journey[i - 1].page,
          toPage: node.page,
        },
      });
    }
  }

  // Search queries
  for (const q of summary.search_queries) {
    queries.push({
      statement: `MERGE (sq:SearchQuery {text: $text})
WITH sq
MATCH (s:Session {id: $sessionId})
MERGE (s)-[:SEARCHED]->(sq)`,
      parameters: {
        text: q.toLowerCase().trim(),
        sessionId: summary.session_id,
      },
    });
  }

  // Vehicle views
  for (const vin of summary.vehicles_viewed) {
    queries.push({
      statement: `MERGE (v:Vehicle {vin: $vin})
WITH v
MATCH (s:Session {id: $sessionId})
MERGE (s)-[:VIEWED]->(v)`,
      parameters: {
        vin,
        sessionId: summary.session_id,
      },
    });
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

  // Build parameterized graph queries for all sessions
  const allGraphQueries: Array<{ statement: string; parameters: Record<string, unknown> }> = [];
  for (const [sessionId] of buffer.sessions) {
    const queries = buildGraphQueries(sessionId);
    allGraphQueries.push(...queries);
  }

  // Execute graph queries against Neo4j — AWAIT so we know if it worked
  let graphResult = { executed: 0, failed: 0 };
  if (allGraphQueries.length > 0) {
    try {
      graphResult = await executeNeo4jQueries(allGraphQueries);
    } catch (err) {
      console.error("[analytics] Neo4j graph write error:", err);
      graphResult = { executed: 0, failed: allGraphQueries.length };
    }
  }

  // Clear processed events from buffer to prevent memory leak
  // and duplicate insight generation. Keep the buffer structure alive.
  const sessionsAnalyzed = buffer.sessions.size;
  buffer.events = [];
  buffer.sessions.clear();
  buffer.lastFlush = Date.now();

  return {
    insights_generated: insights.length,
    insights_stored: stored,
    graph_queries: allGraphQueries,
    graph_executed: graphResult.executed,
    graph_failed: graphResult.failed,
    sessions_analyzed: sessionsAnalyzed,
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

// esc() function removed — Cypher queries now use parameterized statements
// via Neo4j's HTTP transaction API { statement, parameters } format.
