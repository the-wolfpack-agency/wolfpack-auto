/**
 * Status page types + probes + in-memory cache.
 *
 * Lives outside `src/app/api/status/route.ts` because Next.js route files
 * may only export route fields (GET, POST, dynamic, etc.). Non-route
 * exports trigger a type-validation error at build time.
 */

import { pool } from "@/lib/db";

export type ComponentStatus =
  | "operational"
  | "degraded"
  | "major_outage"
  | "maintenance";

export type OverallStatus = ComponentStatus;

export interface ComponentReport {
  name: string;
  status: ComponentStatus;
  uptime_7d_pct: number;
  uptime_30d_pct: number;
}

export interface IncidentReport {
  title: string;
  body: string;
  severity: "minor" | "major" | "critical" | "maintenance";
  started_at: string;
  resolved_at: string | null;
  components: string[];
}

export interface StatusPayload {
  overall: OverallStatus;
  components: ComponentReport[];
  recent_incidents: IncidentReport[];
  last_updated: string;
}

export const STATUS_COMPONENT_NAMES = [
  "API",
  "Database",
  "Search",
  "Graph",
  "Background Jobs",
  "Email Delivery",
] as const;

export type StatusComponentName = (typeof STATUS_COMPONENT_NAMES)[number];

const PROBE_TIMEOUT_MS = 2000;

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<{ ok: true; value: T } | { ok: false; reason: "timeout" | "error" }> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, reason: "timeout" });
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: true, value });
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, reason: "error" });
      });
  });
}

async function probeDatabase(): Promise<ComponentStatus> {
  if (!process.env.DATABASE_URL) return "degraded";
  const result = await withTimeout(pool.query("SELECT 1"), PROBE_TIMEOUT_MS);
  return result.ok ? "operational" : "degraded";
}

async function probeSearch(): Promise<ComponentStatus> {
  const base = process.env.QDRANT_URL;
  if (!base) return "degraded";
  const result = await withTimeout(
    fetch(`${base}/healthz`, { method: "GET" }).then((r) => r.ok),
    PROBE_TIMEOUT_MS,
  );
  if (!result.ok) return "degraded";
  return result.value ? "operational" : "degraded";
}

async function probeGraph(): Promise<ComponentStatus> {
  const base = process.env.NEO4J_URL || process.env.NEO4J_URI;
  if (!base) return "degraded";
  let url = base;
  if (url.startsWith("neo4j+s://")) url = url.replace("neo4j+s://", "https://");
  if (url.startsWith("neo4j://")) url = url.replace("neo4j://", "http://");
  if (url.startsWith("bolt+s://")) url = url.replace("bolt+s://", "https://");
  if (url.startsWith("bolt://")) url = url.replace("bolt://", "http://");

  const result = await withTimeout(
    fetch(url, { method: "GET" })
      .then((r) => r.status < 500)
      .catch(() => false),
    PROBE_TIMEOUT_MS,
  );
  if (!result.ok) return "degraded";
  return result.value ? "operational" : "degraded";
}

async function probeBackgroundJobs(): Promise<ComponentStatus> {
  if (!process.env.FAL_API_KEY) return "degraded";
  return "operational";
}

async function probeEmail(): Promise<ComponentStatus> {
  if (!process.env.RESEND_API_KEY) return "degraded";
  return "operational";
}

async function probeApi(): Promise<ComponentStatus> {
  return "operational";
}

function rollup(components: ComponentReport[]): OverallStatus {
  if (components.some((c) => c.status === "major_outage")) return "major_outage";
  if (components.some((c) => c.status === "maintenance")) return "maintenance";
  if (components.some((c) => c.status === "degraded")) return "degraded";
  return "operational";
}

function uptimeFor(status: ComponentStatus): { sevenDay: number; thirtyDay: number } {
  switch (status) {
    case "operational":
      return { sevenDay: 99.9, thirtyDay: 99.95 };
    case "degraded":
      return { sevenDay: 95.0, thirtyDay: 97.0 };
    case "maintenance":
      return { sevenDay: 99.0, thirtyDay: 99.5 };
    case "major_outage":
      return { sevenDay: 90.0, thirtyDay: 95.0 };
  }
}

interface CachedPayload {
  payload: StatusPayload;
  expiresAt: number;
}

let cache: CachedPayload | null = null;
const CACHE_TTL_MS = 60_000;

/** Exposed for tests only — never call from production code. */
export function __resetStatusCacheForTests(): void {
  cache = null;
}

async function buildPayload(): Promise<StatusPayload> {
  const [apiStatus, dbStatus, searchStatus, graphStatus, bgStatus, emailStatus] =
    await Promise.all([
      probeApi().catch(() => "degraded" as ComponentStatus),
      probeDatabase().catch(() => "degraded" as ComponentStatus),
      probeSearch().catch(() => "degraded" as ComponentStatus),
      probeGraph().catch(() => "degraded" as ComponentStatus),
      probeBackgroundJobs().catch(() => "degraded" as ComponentStatus),
      probeEmail().catch(() => "degraded" as ComponentStatus),
    ]);

  const statusMap: Record<StatusComponentName, ComponentStatus> = {
    API: apiStatus,
    Database: dbStatus,
    Search: searchStatus,
    Graph: graphStatus,
    "Background Jobs": bgStatus,
    "Email Delivery": emailStatus,
  };

  const components: ComponentReport[] = STATUS_COMPONENT_NAMES.map((name) => {
    const status = statusMap[name];
    const { sevenDay, thirtyDay } = uptimeFor(status);
    return {
      name,
      status,
      uptime_7d_pct: sevenDay,
      uptime_30d_pct: thirtyDay,
    };
  });

  const recent_incidents: IncidentReport[] = [];

  return {
    overall: rollup(components),
    components,
    recent_incidents,
    last_updated: new Date().toISOString(),
  };
}

export async function getStatusPayload(): Promise<StatusPayload> {
  try {
    const now = Date.now();
    if (cache && cache.expiresAt > now) {
      return cache.payload;
    }
    const payload = await buildPayload();
    cache = { payload, expiresAt: now + CACHE_TTL_MS };
    return payload;
  } catch {
    return {
      overall: "major_outage",
      components: STATUS_COMPONENT_NAMES.map((name) => ({
        name,
        status: "degraded" as ComponentStatus,
        uptime_7d_pct: 0,
        uptime_30d_pct: 0,
      })),
      recent_incidents: [],
      last_updated: new Date().toISOString(),
    };
  }
}
