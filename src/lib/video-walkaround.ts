/**
 * Video Walkaround Recording
 *
 * Manage video walkaround recordings for vehicles — segment-based
 * recording (exterior, interior, engine, trunk, features) with
 * thumbnail generation and VDP publishing.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type SegmentType =
  | "exterior_front"
  | "exterior_rear"
  | "exterior_left"
  | "exterior_right"
  | "interior"
  | "engine"
  | "trunk"
  | "features";

export interface VideoSegment {
  id: string;
  segmentType: SegmentType;
  url: string;
  thumbnailUrl: string | null;
  durationSeconds: number;
  addedAt: string;
}

export interface VideoMetadata {
  totalDuration: number;
  segmentCount: number;
  completeness: number; // 0-100, based on segments covered
  lastUpdated: string;
}

export type WalkaroundStatus = "draft" | "recording" | "complete" | "published";

export interface WalkaroundVideo {
  id: string;
  vin: string;
  dealerId: string;
  status: WalkaroundStatus;
  segments: VideoSegment[];
  metadata: VideoMetadata;
  createdAt: string;
  publishedAt: string | null;
  createdBy: string;
}

/* ------------------------------------------------------------------ */
/*  In-memory store (shadow mode)                                      */
/* ------------------------------------------------------------------ */

const walkarounds = new Map<string, WalkaroundVideo>();

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ALL_SEGMENT_TYPES: SegmentType[] = [
  "exterior_front",
  "exterior_rear",
  "exterior_left",
  "exterior_right",
  "interior",
  "engine",
  "trunk",
  "features",
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function generateId(): string {
  return `wk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function calculateCompleteness(segments: VideoSegment[]): number {
  const covered = new Set(segments.map((s) => s.segmentType));
  return Math.round((covered.size / ALL_SEGMENT_TYPES.length) * 100);
}

function buildMetadata(segments: VideoSegment[]): VideoMetadata {
  return {
    totalDuration: segments.reduce((sum, s) => sum + s.durationSeconds, 0),
    segmentCount: segments.length,
    completeness: calculateCompleteness(segments),
    lastUpdated: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/*  Core functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Initialize a new walkaround recording for a vehicle.
 */
export function createWalkaround(
  vin: string,
  dealerId: string,
  createdBy: string = "system",
): WalkaroundVideo {
  const id = generateId();
  const now = new Date().toISOString();

  const walkaround: WalkaroundVideo = {
    id,
    vin,
    dealerId,
    status: "draft",
    segments: [],
    metadata: buildMetadata([]),
    createdAt: now,
    publishedAt: null,
    createdBy,
  };

  walkarounds.set(id, walkaround);
  return walkaround;
}

/**
 * Add a video segment to an existing walkaround.
 */
export function addSegment(
  walkaroundId: string,
  segmentType: SegmentType,
  url: string,
  durationSeconds: number = 30,
): WalkaroundVideo | null {
  const walkaround = walkarounds.get(walkaroundId);
  if (!walkaround) return null;
  if (walkaround.status === "published") return null; // Can't modify published

  const segment: VideoSegment = {
    id: `seg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    segmentType,
    url,
    thumbnailUrl: null,
    durationSeconds,
    addedAt: new Date().toISOString(),
  };

  walkaround.segments.push(segment);
  walkaround.status = "recording";
  walkaround.metadata = buildMetadata(walkaround.segments);

  return walkaround;
}

/**
 * Generate a thumbnail URL from a video URL.
 * In production this would extract a poster frame; here we generate a path.
 */
export function generateThumbnail(videoUrl: string): string {
  const baseName = videoUrl.replace(/\.[^/.]+$/, "");
  return `${baseName}-thumb.jpg`;
}

/**
 * Publish a walkaround to make it visible on the VDP.
 */
export function publishWalkaround(walkaroundId: string): WalkaroundVideo | null {
  const walkaround = walkarounds.get(walkaroundId);
  if (!walkaround) return null;
  if (walkaround.segments.length === 0) return null;

  walkaround.status = "published";
  walkaround.publishedAt = new Date().toISOString();

  // Generate thumbnails for segments that lack them
  for (const seg of walkaround.segments) {
    if (!seg.thumbnailUrl) {
      seg.thumbnailUrl = generateThumbnail(seg.url);
    }
  }

  walkaround.metadata = buildMetadata(walkaround.segments);
  return walkaround;
}

/**
 * Unpublish a walkaround (revert to complete status).
 */
export function unpublishWalkaround(walkaroundId: string): WalkaroundVideo | null {
  const walkaround = walkarounds.get(walkaroundId);
  if (!walkaround || walkaround.status !== "published") return null;

  walkaround.status = "complete";
  walkaround.publishedAt = null;
  return walkaround;
}

/**
 * Get the published walkaround for a vehicle (by VIN).
 */
export function getWalkaroundForVehicle(vin: string): WalkaroundVideo | null {
  for (const wk of walkarounds.values()) {
    if (wk.vin === vin && wk.status === "published") return wk;
  }
  return null;
}

/**
 * List all walkarounds for a dealer.
 */
export function listWalkarounds(dealerId: string): WalkaroundVideo[] {
  return [...walkarounds.values()]
    .filter((wk) => wk.dealerId === dealerId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Get a walkaround by ID.
 */
export function getWalkaround(walkaroundId: string): WalkaroundVideo | null {
  return walkarounds.get(walkaroundId) ?? null;
}

/**
 * Remove a segment from a walkaround.
 */
export function removeSegment(walkaroundId: string, segmentId: string): WalkaroundVideo | null {
  const walkaround = walkarounds.get(walkaroundId);
  if (!walkaround || walkaround.status === "published") return null;

  walkaround.segments = walkaround.segments.filter((s) => s.id !== segmentId);
  walkaround.metadata = buildMetadata(walkaround.segments);
  return walkaround;
}

/**
 * Clear all in-memory data (for testing).
 */
export function _resetForTesting(): void {
  walkarounds.clear();
}
