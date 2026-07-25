/**
 * Recently-viewed vehicles - client-side session memory.
 *
 * Powers the homepage "resume where you left off" bar. Written when a visitor
 * opens a vehicle detail page; read on the homepage. Stored in localStorage so
 * it survives a tab close but stays on-device (no PII leaves the browser). The
 * durable learning signal for these views is the server-side `page_view` event
 * that EventCollector already emits on the VDP - this store is purely the
 * lightweight state the resume bar needs to render.
 */

export interface RecentVehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  price: number;
  bodyStyle?: string;
  viewedAt: number;
}

const KEY = "wolfpack_recently_viewed";
const MAX = 8;

function safeParse(raw: string | null): RecentVehicle[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is RecentVehicle =>
        v && typeof v.vin === "string" && typeof v.viewedAt === "number",
    );
  } catch {
    return [];
  }
}

/** Record a vehicle as recently viewed (most-recent first, deduped by VIN). */
export function recordRecentlyViewed(
  vehicle: Omit<RecentVehicle, "viewedAt">,
): void {
  if (typeof window === "undefined") return;
  try {
    const existing = safeParse(window.localStorage.getItem(KEY));
    const deduped = existing.filter((v) => v.vin !== vehicle.vin);
    const next = [{ ...vehicle, viewedAt: Date.now() }, ...deduped].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage disabled / quota - non-fatal, the resume bar just won't show.
  }
}

/** Read recently-viewed vehicles, most-recent first. */
export function getRecentlyViewed(): RecentVehicle[] {
  if (typeof window === "undefined") return [];
  try {
    return safeParse(window.localStorage.getItem(KEY)).sort(
      (a, b) => b.viewedAt - a.viewedAt,
    );
  } catch {
    return [];
  }
}
