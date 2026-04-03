/**
 * Dashboard Annotations
 *
 * Add notes, milestones, alerts, and campaign markers to any
 * dashboard chart at specific dates. Provides context for data
 * spikes/dips so the team understands "what happened on that day."
 */

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
/*  In-memory store (shadow mode)                                      */
/* ------------------------------------------------------------------ */

const annotations = new Map<string, Annotation>();

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function generateId(): string {
  return `ann-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

/* ------------------------------------------------------------------ */
/*  Core functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Create an annotation on a specific date for a dashboard.
 */
export function createAnnotation(input: CreateAnnotationInput): Annotation {
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
  annotations.set(id, annotation);
  return annotation;
}

/**
 * Get all annotations for a dashboard within a date range.
 */
export function getAnnotationsForRange(
  dashboardId: string,
  startDate: string,
  endDate: string,
): Annotation[] {
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
export function getAnnotationsForDashboard(dashboardId: string): Annotation[] {
  return [...annotations.values()]
    .filter((a) => a.dashboardId === dashboardId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Get annotations by type.
 */
export function getAnnotationsByType(
  dashboardId: string,
  type: AnnotationType,
): Annotation[] {
  return [...annotations.values()]
    .filter((a) => a.dashboardId === dashboardId && a.type === type)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Get a single annotation by ID.
 */
export function getAnnotation(annotationId: string): Annotation | null {
  return annotations.get(annotationId) ?? null;
}

/**
 * Update an annotation's text or type.
 */
export function updateAnnotation(
  annotationId: string,
  updates: Partial<Pick<Annotation, "text" | "type" | "metadata">>,
): Annotation | null {
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
export function deleteAnnotation(annotationId: string): boolean {
  return annotations.delete(annotationId);
}

/**
 * Clear all in-memory data (for testing).
 */
export function _resetForTesting(): void {
  annotations.clear();
}
