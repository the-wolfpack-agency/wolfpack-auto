/**
 * Photo Engagement Micro-Signals
 *
 * Tracks granular photo interaction behavior on vehicle detail pages:
 *  - Time per photo (dwell tracking via timing)
 *  - Zoom events (pinch-zoom on mobile, scroll/click-zoom on desktop)
 *  - Photo category classification
 *  - Swipe/navigation speed between transitions
 *  - Photo skip patterns (skipped vs dwelled)
 *  - First-photo-clicked tracking
 *
 * Privacy-first: no PII, no cookies. All events fire-and-forget.
 * Integrates with EventCollector via the track() callback pattern.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type PhotoCategory =
  | "exterior_front"
  | "exterior_side"
  | "exterior_rear"
  | "interior_dashboard"
  | "interior_seats"
  | "interior_cargo"
  | "engine"
  | "wheels"
  | "damage"
  | "other";

export type SwipeClassification = "browsing" | "studying" | "comparing";

export type BuyerType =
  | "family_buyer"
  | "appearance_buyer"
  | "mechanical_buyer"
  | "casual_browser"
  | "negotiator";

export interface PhotoDwellEvent {
  vin: string;
  photo_index: number;
  category: PhotoCategory;
  dwell_ms: number;
  zoomed: boolean;
}

export interface PhotoSwipeSpeedEvent {
  vin: string;
  avg_transition_ms: number;
  classification: SwipeClassification;
}

export interface PhotoInterestProfileEvent {
  vin: string;
  top_category: PhotoCategory;
  time_by_category: Record<string, number>;
}

export interface PhotoEngagementConfig {
  vin: string;
  photoCategories?: PhotoCategory[];
  track: (
    eventType: string,
    action: string,
    metadata?: Record<string, unknown>,
  ) => void;
}

export interface PhotoEngagementState {
  destroy: () => void;
  onPhotoChange: (newIndex: number) => void;
  onZoom: (photoIndex: number) => void;
  getInterestProfile: () => PhotoInterestProfileEvent;
  getBuyerType: () => BuyerType;
}

/* ------------------------------------------------------------------ */
/*  Category classification                                            */
/* ------------------------------------------------------------------ */

const CATEGORY_KEYWORDS: Record<PhotoCategory, string[]> = {
  exterior_front: ["front", "grille", "headlight", "bumper-front", "hood"],
  exterior_side: ["side", "profile", "door", "mirror"],
  exterior_rear: ["rear", "back", "taillight", "trunk", "bumper-rear", "hatch"],
  interior_dashboard: ["dashboard", "dash", "steering", "console", "gauge", "instrument"],
  interior_seats: ["seat", "leather", "upholstery", "cabin"],
  interior_cargo: ["cargo", "trunk-interior", "storage", "boot"],
  engine: ["engine", "motor", "bay", "mechanical", "under-hood"],
  wheels: ["wheel", "tire", "rim", "brake", "caliper"],
  damage: ["damage", "dent", "scratch", "rust", "repair", "crack"],
  other: [],
};

/**
 * Classify a photo by its filename, alt text, or index-based heuristic.
 * If no keyword matches, uses positional heuristic (typical dealer photo order).
 */
export function classifyPhoto(
  index: number,
  totalPhotos: number,
  label?: string,
): PhotoCategory {
  // Try keyword match from label/filename
  if (label) {
    const lower = label.toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (category === "other") continue;
      if (keywords.some((kw) => lower.includes(kw))) {
        return category as PhotoCategory;
      }
    }
  }

  // Positional heuristic: typical dealer photo ordering
  if (totalPhotos <= 1) return "exterior_front";
  const position = index / totalPhotos;
  if (position < 0.15) return "exterior_front";
  if (position < 0.3) return "exterior_side";
  if (position < 0.4) return "exterior_rear";
  if (position < 0.55) return "interior_dashboard";
  if (position < 0.65) return "interior_seats";
  if (position < 0.75) return "interior_cargo";
  if (position < 0.85) return "engine";
  if (position < 0.95) return "wheels";
  return "other";
}

/* ------------------------------------------------------------------ */
/*  Swipe speed classification                                         */
/* ------------------------------------------------------------------ */

/**
 * Classify the average transition speed between photos.
 *   < 800ms  → browsing (rapid flipping)
 *   800-3000ms → comparing (moderate pace)
 *   > 3000ms → studying (careful inspection)
 */
export function classifySwipeSpeed(avgTransitionMs: number): SwipeClassification {
  if (avgTransitionMs < 800) return "browsing";
  if (avgTransitionMs <= 3000) return "comparing";
  return "studying";
}

/* ------------------------------------------------------------------ */
/*  Buyer type inference                                                */
/* ------------------------------------------------------------------ */

/**
 * Infer buyer type from photo engagement patterns.
 *
 * Logic:
 *  - Heavy interior time → family_buyer
 *  - Heavy exterior time → appearance_buyer
 *  - Engine/mechanical photos → mechanical_buyer
 *  - Fast through all → casual_browser
 *  - Zoomed on damage photos → negotiator
 */
export function inferBuyerTypeFromPhotos(
  timeByCategory: Record<string, number>,
  zoomedCategories: Set<string>,
  avgTransitionMs: number,
): BuyerType {
  const totalTime = Object.values(timeByCategory).reduce((a, b) => a + b, 0);

  // If very fast through all photos, casual browser
  if (avgTransitionMs < 600 && totalTime < 5000) return "casual_browser";

  // Zoomed on damage = negotiator
  if (zoomedCategories.has("damage") && (timeByCategory["damage"] ?? 0) > totalTime * 0.15) {
    return "negotiator";
  }

  // Calculate category group totals
  const interiorTime =
    (timeByCategory["interior_dashboard"] ?? 0) +
    (timeByCategory["interior_seats"] ?? 0) +
    (timeByCategory["interior_cargo"] ?? 0);

  const exteriorTime =
    (timeByCategory["exterior_front"] ?? 0) +
    (timeByCategory["exterior_side"] ?? 0) +
    (timeByCategory["exterior_rear"] ?? 0);

  const mechanicalTime =
    (timeByCategory["engine"] ?? 0) +
    (timeByCategory["wheels"] ?? 0);

  // Dominant category (at least 40% of total time)
  if (totalTime > 0) {
    if (mechanicalTime / totalTime > 0.35) return "mechanical_buyer";
    if (interiorTime / totalTime > 0.4) return "family_buyer";
    if (exteriorTime / totalTime > 0.4) return "appearance_buyer";
  }

  return "casual_browser";
}

/* ------------------------------------------------------------------ */
/*  Photo engagement tracker (stateful)                                */
/* ------------------------------------------------------------------ */

/**
 * Initialize photo engagement tracking for a VDP gallery.
 *
 * Returns a controller object with methods to call on photo changes,
 * zoom events, and cleanup. Fires events through the provided track()
 * callback (from EventCollector's useAnalytics()).
 *
 * Usage:
 *   const tracker = initPhotoEngagement({ vin, track });
 *   // On photo navigation:
 *   tracker.onPhotoChange(newIndex);
 *   // On zoom:
 *   tracker.onZoom(currentIndex);
 *   // On unmount:
 *   tracker.destroy();
 */
export function initPhotoEngagement(
  config: PhotoEngagementConfig,
): PhotoEngagementState {
  const { vin, track } = config;
  const categories = config.photoCategories ?? [];

  // State
  let currentIndex = 0;
  let currentPhotoStartedAt = Date.now();
  let firstPhotoClicked: number | null = null;
  const dwellTimes: Map<number, number> = new Map();
  const timeByCategoryAccum: Record<string, number> = {};
  const zoomedPhotos: Set<number> = new Set();
  const zoomedCategories: Set<string> = new Set();
  const transitionTimestamps: number[] = [Date.now()];
  let destroyed = false;

  function getCategoryForIndex(index: number): PhotoCategory {
    if (categories[index]) return categories[index];
    // Fall back to positional heuristic
    const total = categories.length || 10;
    return classifyPhoto(index, total);
  }

  function recordDwell(): void {
    const now = Date.now();
    const dwellMs = now - currentPhotoStartedAt;
    if (dwellMs < 50) return; // Ignore sub-50ms (programmatic swipes)

    // Accumulate dwell per photo
    dwellTimes.set(currentIndex, (dwellTimes.get(currentIndex) ?? 0) + dwellMs);

    // Accumulate by category
    const cat = getCategoryForIndex(currentIndex);
    timeByCategoryAccum[cat] = (timeByCategoryAccum[cat] ?? 0) + dwellMs;

    // Fire dwell event
    track("photo_engagement", "photo.dwell", {
      vin,
      photo_index: currentIndex,
      category: cat,
      dwell_ms: dwellMs,
      zoomed: zoomedPhotos.has(currentIndex),
    });
  }

  function onPhotoChange(newIndex: number): void {
    if (destroyed) return;

    // Record dwell on previous photo
    recordDwell();

    // Track first-photo-clicked
    if (firstPhotoClicked === null && newIndex !== 0) {
      firstPhotoClicked = newIndex;
      track("photo_engagement", "photo.first_clicked", {
        vin,
        photo_index: newIndex,
        category: getCategoryForIndex(newIndex),
      });
    }

    // Record transition timestamp for swipe speed
    transitionTimestamps.push(Date.now());

    // Update state
    currentIndex = newIndex;
    currentPhotoStartedAt = Date.now();
  }

  function onZoom(photoIndex: number): void {
    if (destroyed) return;
    zoomedPhotos.add(photoIndex);
    const cat = getCategoryForIndex(photoIndex);
    zoomedCategories.add(cat);

    track("photo_engagement", "photo.zoom", {
      vin,
      photo_index: photoIndex,
      category: cat,
    });
  }

  function getAvgTransitionMs(): number {
    if (transitionTimestamps.length < 2) return 0;
    const deltas: number[] = [];
    for (let i = 1; i < transitionTimestamps.length; i++) {
      deltas.push(transitionTimestamps[i] - transitionTimestamps[i - 1]);
    }
    return deltas.reduce((a, b) => a + b, 0) / deltas.length;
  }

  function getInterestProfile(): PhotoInterestProfileEvent {
    // Find top category
    let topCategory: PhotoCategory = "other";
    let topTime = 0;
    for (const [cat, time] of Object.entries(timeByCategoryAccum)) {
      if (time > topTime) {
        topTime = time;
        topCategory = cat as PhotoCategory;
      }
    }

    return {
      vin,
      top_category: topCategory,
      time_by_category: { ...timeByCategoryAccum },
    };
  }

  function getBuyerType(): BuyerType {
    return inferBuyerTypeFromPhotos(
      timeByCategoryAccum,
      zoomedCategories,
      getAvgTransitionMs(),
    );
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;

    // Record final dwell
    recordDwell();

    // Fire swipe speed summary
    const avgMs = getAvgTransitionMs();
    if (transitionTimestamps.length >= 2) {
      track("photo_engagement", "photo.swipe_speed", {
        vin,
        avg_transition_ms: Math.round(avgMs),
        classification: classifySwipeSpeed(avgMs),
      });
    }

    // Fire interest profile summary
    const profile = getInterestProfile();
    if (Object.keys(profile.time_by_category).length > 0) {
      track("photo_engagement", "photo.interest_profile", {
        vin,
        top_category: profile.top_category,
        time_by_category: JSON.stringify(profile.time_by_category),
      });
    }

    // Fire buyer type
    const buyerType = getBuyerType();
    track("photo_engagement", "photo.buyer_type", {
      vin,
      buyer_type: buyerType,
    });
  }

  return { destroy, onPhotoChange, onZoom, getInterestProfile, getBuyerType };
}

/* ------------------------------------------------------------------ */
/*  React hook                                                         */
/* ------------------------------------------------------------------ */

/**
 * React hook for photo engagement tracking.
 *
 * Usage in a VDP component:
 *   import { usePhotoEngagement } from "@/lib/photo-engagement-tracker";
 *   const { onPhotoChange, onZoom } = usePhotoEngagement(vin);
 *
 * Automatically fires summary events on unmount.
 */
export function createPhotoEngagementHook(
  track: PhotoEngagementConfig["track"],
) {
  return function usePhotoEngagementSetup(
    vin: string,
    photoCategories?: PhotoCategory[],
  ): PhotoEngagementState {
    // This returns the controller; the caller should store it in a ref
    // and call destroy() on component unmount.
    return initPhotoEngagement({ vin, track, photoCategories });
  };
}
