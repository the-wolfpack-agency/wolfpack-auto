/**
 * Dashboard Annotations
 *
 * Add notes, milestones, alerts, and campaign markers to any
 * dashboard chart at specific dates. Provides context for data
 * spikes/dips so the team understands "what happened on that day."
 *
 * Persists to PostgreSQL (dashboard_annotations table from migration 052).
 * Falls back to in-memory Map when DATABASE_URL is not set (shadow mode).
 */

import { query } from "@/lib/db";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type AnnotationType = "note" | "milestone" | "alert" | "campaign";

export interface Annotation {
  id: string;
  dashboardId: string;
  date: string; // ISO date (YYYY-MM-DD)
  text: string;
  type: AnnotationType;
  createdBy: string;
  createdAt: string;
  metadata: Record<string, string | number | boolean>;
}

export interface CreateAnnotationInput {
  dashboardId: string;
  date: string;
  text: string;
  type: AnnotationType;
  createdBy?: string;
  metadata?: Record<string, string | number | boolean>;
}

/* ------------------------------------------------------------------ */
/*  In-memory store (shadow mode fallback)                             */
/* ------------------------------------------------------------------ */

const annotations = new Map<string, Annotation>();

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function generateId(): string {
  return `ann-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

function rowToAnnotation(row: Record<string, unknown>): Annotation {
  return {
    id: row.id as string,
    dashboardId: row.dashboard_id as string,
    date: typeof row.date === "string" ? row.date : (row.date as Date).toISOString().split("T")[0],
    text: row.text as string,
    type: row.type as AnnotationType,
    createdBy: row.created_by as string,
    createdAt: typeof row.created_at === "string" ? row.created_at : (row.created_at as Date).toISOString(),
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata as Record<string, string | number | boolean>) ?? {},
  };
}

function useDb(): boolean {
  return !!process.env.DATABASE_URL;
}

/* ------------------------------------------------------------------ */
/*  Core functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Create an annotation on a specific date for a dashboard.
 */
export async function createAnnotation(
  input: CreateAnnotationInput,
  dealerId: string = "",
): Promise<Annotation> {
  const id = generateId();
  const annotation: Annotation = {
    id,
    dashboardId: input.dashboardId,
    date: input.date,
    text: input.text,
    type: input.type,
    createdBy: input.createdBy ?? "system",
    createdAt: new Date().toISOString(),
    metadata: input.metadata ?? {},
  };

  if (useDb()) {
    try {
      await query(
        `INSERT INTO dashboard_annotations (id, dealer_id, dashboard_id, date, text, type, created_by, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          annotation.id,
          dealerId,
          annotation.dashboardId,
          annotation.date,
          annotation.text,
          annotation.type,
          annotation.createdBy,
          JSON.stringify(annotation.metadata),
          annotation.createdAt,
        ],
      );
      return annotation;
    } catch (err: unknown) {
      // Table doesn't exist yet — fall through to in-memory
      console.warn("[dashboard-annotations] DB write failed, using in-memory:", (err as Error).message);
    }
  }

  annotations.set(id, annotation);
  return annotation;
}

/**
 * Get all annotations for a dashboard within a date range.
 */
export async function getAnnotationsForRange(
  dashboardId: string,
  startDate: string,
  endDate: string,
): Promise<Annotation[]> {
  if (useDb()) {
    try {
      const result = await query(
        `SELECT * FROM dashboard_annotations
         WHERE dashboard_id = $1 AND date BETWEEN $2 AND $3
         ORDER BY date ASC`,
        [dashboardId, startDate, endDate],
      );
      return result.rows.map(rowToAnnotation);
    } catch (err: unknown) {
      console.warn("[dashboard-annotations] DB read failed, using in-memory:", (err as Error).message);
    }
  }

  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();

  return [...annotations.values()]
    .filter((a) => {
      if (a.dashboardId !== dashboardId) return false;
      const d = new Date(a.date).getTime();
      return d >= start && d <= end;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Get all annotations for a dashboard (no date filter).
 */
export async function getAnnotationsForDashboard(dashboardId: string): Promise<Annotation[]> {
  if (useDb()) {
    try {
      const result = await query(
        `SELECT * FROM dashboard_annotations WHERE dashboard_id = $1 ORDER BY date ASC`,
        [dashboardId],
      );
      return result.rows.map(rowToAnnotation);
    } catch (err: unknown) {
      console.warn("[dashboard-annotations] DB read failed, using in-memory:", (err as Error).message);
    }
  }

  return [...annotations.values()]
    .filter((a) => a.dashboardId === dashboardId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Get annotations by type.
 */
export async function getAnnotationsByType(
  dashboardId: string,
  type: AnnotationType,
): Promise<Annotation[]> {
  if (useDb()) {
    try {
      const result = await query(
        `SELECT * FROM dashboard_annotations WHERE dashboard_id = $1 AND type = $2 ORDER BY date ASC`,
        [dashboardId, type],
      );
      return result.rows.map(rowToAnnotation);
    } catch (err: unknown) {
      console.warn("[dashboard-annotations] DB read failed, using in-memory:", (err as Error).message);
    }
  }

  return [...annotations.values()]
    .filter((a) => a.dashboardId === dashboardId && a.type === type)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Get a single annotation by ID.
 */
export async function getAnnotation(annotationId: string): Promise<Annotation | null> {
  if (useDb()) {
    try {
      const result = await query(
        `SELECT * FROM dashboard_annotations WHERE id = $1`,
        [annotationId],
      );
      if (result.rows.length > 0) return rowToAnnotation(result.rows[0]);
      return null;
    } catch (err: unknown) {
      console.warn("[dashboard-annotations] DB read failed, using in-memory:", (err as Error).message);
    }
  }

  return annotations.get(annotationId) ?? null;
}

/**
 * Update an annotation's text or type.
 */
export async function updateAnnotation(
  annotationId: string,
  updates: Partial<Pick<Annotation, "text" | "type" | "metadata">>,
): Promise<Annotation | null> {
  if (useDb()) {
    try {
      // Build SET clause dynamically based on provided fields
      const setClauses: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (updates.text !== undefined) {
        setClauses.push(`text = $${paramIdx++}`);
        params.push(updates.text);
      }
      if (updates.type !== undefined) {
        setClauses.push(`type = $${paramIdx++}`);
        params.push(updates.type);
      }
      if (updates.metadata !== undefined) {
        setClauses.push(`metadata = $${paramIdx++}`);
        params.push(JSON.stringify(updates.metadata));
      }

      if (setClauses.length === 0) {
        return getAnnotation(annotationId);
      }

      params.push(annotationId);
      const result = await query(
        `UPDATE dashboard_annotations SET ${setClauses.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
        params,
      );
      if (result.rows.length > 0) return rowToAnnotation(result.rows[0]);
      return null;
    } catch (err: unknown) {
      console.warn("[dashboard-annotations] DB update failed, using in-memory:", (err as Error).message);
    }
  }

  const annotation = annotations.get(annotationId);
  if (!annotation) return null;

  if (updates.text !== undefined) annotation.text = updates.text;
  if (updates.type !== undefined) annotation.type = updates.type;
  if (updates.metadata !== undefined) annotation.metadata = updates.metadata;

  return annotation;
}

/**
 * Delete an annotation.
 */
export async function deleteAnnotation(annotationId: string): Promise<boolean> {
  if (useDb()) {
    try {
      const result = await query(
        `DELETE FROM dashboard_annotations WHERE id = $1`,
        [annotationId],
      );
      return (result.rowCount ?? 0) > 0;
    } catch (err: unknown) {
      console.warn("[dashboard-annotations] DB delete failed, using in-memory:", (err as Error).message);
    }
  }

  return annotations.delete(annotationId);
}

/**
 * Clear all in-memory data (for testing).
 */
export function _resetForTesting(): void {
  annotations.clear();
}
