/**
 * Video Walkaround Recording
 *
 * Manage video walkaround recordings for vehicles — segment-based
 * recording (exterior, interior, engine, trunk, features) with
 * thumbnail generation and VDP publishing.
 *
 * Persists to PostgreSQL (walkarounds + walkaround_segments from migration 052).
 * Falls back to in-memory Map when DATABASE_URL is not set (shadow mode).
 */

import { query } from "@/lib/db";

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
/*  In-memory store (shadow mode fallback)                             */
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

function useDb(): boolean {
  return !!process.env.DATABASE_URL;
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

function rowToSegment(row: Record<string, unknown>): VideoSegment {
  return {
    id: row.id as string,
    segmentType: row.segment_type as SegmentType,
    url: row.url as string,
    thumbnailUrl: (row.thumbnail_url as string) ?? null,
    durationSeconds: row.duration_seconds as number,
    addedAt: typeof row.added_at === "string" ? row.added_at : (row.added_at as Date).toISOString(),
  };
}

function rowToWalkaround(row: Record<string, unknown>, segments: VideoSegment[]): WalkaroundVideo {
  const metadata = typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata as VideoMetadata) ?? buildMetadata(segments);
  return {
    id: row.id as string,
    vin: row.vin as string,
    dealerId: row.dealer_id as string,
    status: row.status as WalkaroundStatus,
    segments,
    metadata,
    createdAt: typeof row.created_at === "string" ? row.created_at : (row.created_at as Date).toISOString(),
    publishedAt: row.published_at ? (typeof row.published_at === "string" ? row.published_at : (row.published_at as Date).toISOString()) : null,
    createdBy: (row.created_by as string) ?? "system",
  };
}

async function loadWalkaroundWithSegments(walkaroundId: string): Promise<WalkaroundVideo | null> {
  const wkResult = await query(
    `SELECT * FROM walkarounds WHERE id = $1`,
    [walkaroundId],
  );
  if (wkResult.rows.length === 0) return null;

  const segResult = await query(
    `SELECT * FROM walkaround_segments WHERE walkaround_id = $1 ORDER BY added_at ASC`,
    [walkaroundId],
  );
  const segments = segResult.rows.map(rowToSegment);
  return rowToWalkaround(wkResult.rows[0], segments);
}

/* ------------------------------------------------------------------ */
/*  Core functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Initialize a new walkaround recording for a vehicle.
 */
export async function createWalkaround(
  vin: string,
  dealerId: string,
  createdBy: string = "system",
): Promise<WalkaroundVideo> {
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

  if (useDb()) {
    try {
      await query(
        `INSERT INTO walkarounds (id, dealer_id, vin, status, metadata, created_at, created_by, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          walkaround.id,
          walkaround.dealerId,
          walkaround.vin,
          walkaround.status,
          JSON.stringify(walkaround.metadata),
          walkaround.createdAt,
          walkaround.createdBy,
          walkaround.publishedAt,
        ],
      );
      return walkaround;
    } catch (err: unknown) {
      console.warn("[video-walkaround] DB write failed, using in-memory:", (err as Error).message);
    }
  }

  walkarounds.set(id, walkaround);
  return walkaround;
}

/**
 * Add a video segment to an existing walkaround.
 */
export async function addSegment(
  walkaroundId: string,
  segmentType: SegmentType,
  url: string,
  durationSeconds: number = 30,
): Promise<WalkaroundVideo | null> {
  const segmentId = `seg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const addedAt = new Date().toISOString();

  if (useDb()) {
    try {
      const walkaround = await loadWalkaroundWithSegments(walkaroundId);
      if (!walkaround) return null;
      if (walkaround.status === "published") return null;

      await query(
        `INSERT INTO walkaround_segments (id, walkaround_id, segment_type, url, thumbnail_url, duration_seconds, added_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [segmentId, walkaroundId, segmentType, url, null, durationSeconds, addedAt],
      );

      const newSegment: VideoSegment = { id: segmentId, segmentType, url, thumbnailUrl: null, durationSeconds, addedAt };
      walkaround.segments.push(newSegment);
      walkaround.status = "recording";
      walkaround.metadata = buildMetadata(walkaround.segments);

      await query(
        `UPDATE walkarounds SET status = $1, metadata = $2 WHERE id = $3`,
        ["recording", JSON.stringify(walkaround.metadata), walkaroundId],
      );

      return walkaround;
    } catch (err: unknown) {
      console.warn("[video-walkaround] DB addSegment failed, using in-memory:", (err as Error).message);
    }
  }

  const walkaround = walkarounds.get(walkaroundId);
  if (!walkaround) return null;
  if (walkaround.status === "published") return null;

  const segment: VideoSegment = {
    id: segmentId,
    segmentType,
    url,
    thumbnailUrl: null,
    durationSeconds,
    addedAt,
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
export async function publishWalkaround(walkaroundId: string): Promise<WalkaroundVideo | null> {
  if (useDb()) {
    try {
      const walkaround = await loadWalkaroundWithSegments(walkaroundId);
      if (!walkaround) return null;
      if (walkaround.segments.length === 0) return null;

      const publishedAt = new Date().toISOString();

      // Generate thumbnails for segments that lack them
      for (const seg of walkaround.segments) {
        if (!seg.thumbnailUrl) {
          seg.thumbnailUrl = generateThumbnail(seg.url);
          await query(
            `UPDATE walkaround_segments SET thumbnail_url = $1 WHERE id = $2`,
            [seg.thumbnailUrl, seg.id],
          ).catch(() => {});
        }
      }

      walkaround.status = "published";
      walkaround.publishedAt = publishedAt;
      walkaround.metadata = buildMetadata(walkaround.segments);

      await query(
        `UPDATE walkarounds SET status = $1, published_at = $2, metadata = $3 WHERE id = $4`,
        ["published", publishedAt, JSON.stringify(walkaround.metadata), walkaroundId],
      );

      return walkaround;
    } catch (err: unknown) {
      console.warn("[video-walkaround] DB publish failed, using in-memory:", (err as Error).message);
    }
  }

  const walkaround = walkarounds.get(walkaroundId);
  if (!walkaround) return null;
  if (walkaround.segments.length === 0) return null;

  walkaround.status = "published";
  walkaround.publishedAt = new Date().toISOString();

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
export async function unpublishWalkaround(walkaroundId: string): Promise<WalkaroundVideo | null> {
  if (useDb()) {
    try {
      const walkaround = await loadWalkaroundWithSegments(walkaroundId);
      if (!walkaround || walkaround.status !== "published") return null;

      walkaround.status = "complete";
      walkaround.publishedAt = null;

      await query(
        `UPDATE walkarounds SET status = $1, published_at = NULL WHERE id = $2`,
        ["complete", walkaroundId],
      );

      return walkaround;
    } catch (err: unknown) {
      console.warn("[video-walkaround] DB unpublish failed, using in-memory:", (err as Error).message);
    }
  }

  const walkaround = walkarounds.get(walkaroundId);
  if (!walkaround || walkaround.status !== "published") return null;

  walkaround.status = "complete";
  walkaround.publishedAt = null;
  return walkaround;
}

/**
 * Get the published walkaround for a vehicle (by VIN).
 */
export async function getWalkaroundForVehicle(vin: string): Promise<WalkaroundVideo | null> {
  if (useDb()) {
    try {
      const wkResult = await query(
        `SELECT * FROM walkarounds WHERE vin = $1 AND status = 'published' LIMIT 1`,
        [vin],
      );
      if (wkResult.rows.length > 0) {
        const segResult = await query(
          `SELECT * FROM walkaround_segments WHERE walkaround_id = $1 ORDER BY added_at ASC`,
          [wkResult.rows[0].id as string],
        );
        return rowToWalkaround(wkResult.rows[0], segResult.rows.map(rowToSegment));
      }
      return null;
    } catch (err: unknown) {
      console.warn("[video-walkaround] DB read failed, using in-memory:", (err as Error).message);
    }
  }

  for (const wk of walkarounds.values()) {
    if (wk.vin === vin && wk.status === "published") return wk;
  }
  return null;
}

/**
 * List all walkarounds for a dealer.
 */
export async function listWalkarounds(dealerId: string): Promise<WalkaroundVideo[]> {
  if (useDb()) {
    try {
      const wkResult = await query(
        `SELECT * FROM walkarounds WHERE dealer_id = $1 ORDER BY created_at DESC`,
        [dealerId],
      );
      const results: WalkaroundVideo[] = [];
      for (const row of wkResult.rows) {
        const segResult = await query(
          `SELECT * FROM walkaround_segments WHERE walkaround_id = $1 ORDER BY added_at ASC`,
          [row.id as string],
        );
        results.push(rowToWalkaround(row, segResult.rows.map(rowToSegment)));
      }
      return results;
    } catch (err: unknown) {
      console.warn("[video-walkaround] DB list failed, using in-memory:", (err as Error).message);
    }
  }

  return [...walkarounds.values()]
    .filter((wk) => wk.dealerId === dealerId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Get a walkaround by ID.
 */
export async function getWalkaround(walkaroundId: string): Promise<WalkaroundVideo | null> {
  if (useDb()) {
    try {
      return await loadWalkaroundWithSegments(walkaroundId);
    } catch (err: unknown) {
      console.warn("[video-walkaround] DB read failed, using in-memory:", (err as Error).message);
    }
  }

  return walkarounds.get(walkaroundId) ?? null;
}

/**
 * Remove a segment from a walkaround.
 */
export async function removeSegment(walkaroundId: string, segmentId: string): Promise<WalkaroundVideo | null> {
  if (useDb()) {
    try {
      const walkaround = await loadWalkaroundWithSegments(walkaroundId);
      if (!walkaround || walkaround.status === "published") return null;

      await query(
        `DELETE FROM walkaround_segments WHERE id = $1 AND walkaround_id = $2`,
        [segmentId, walkaroundId],
      );

      walkaround.segments = walkaround.segments.filter((s) => s.id !== segmentId);
      walkaround.metadata = buildMetadata(walkaround.segments);

      await query(
        `UPDATE walkarounds SET metadata = $1 WHERE id = $2`,
        [JSON.stringify(walkaround.metadata), walkaroundId],
      );

      return walkaround;
    } catch (err: unknown) {
      console.warn("[video-walkaround] DB removeSegment failed, using in-memory:", (err as Error).message);
    }
  }

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
