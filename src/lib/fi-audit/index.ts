/**
 * Barrel export for the F&I Penetration Audit lead-magnet product.
 *
 * Public-facing wedge: free 4-page PDF audit of a dealership's F&I
 * performance that books a paid Wolfpack Auto DOS demo.
 *
 * Spec: docs/fi-audit-wedge-spec-2026-05-12.md
 * Migration: src/db/migrations/074_fi_audit_runs.sql
 * Landing page: /audits/fi-penetration
 * Public POST: /api/audit-request
 */

export * from "@/lib/fi-audit/benchmarks";
export * from "@/lib/fi-audit/pdf-generator";
export {
  AUDIT_EMAIL_SUBJECT,
  auditDeliveryHTML,
  auditDeliveryText,
  renderHeadline,
  type AuditEmailContext,
} from "@/lib/fi-audit/email-templates";
export {
  MIN_CSV_ROWS,
  generateAudit,
  parseAuditCSV,
  rowsToCells,
  validateCSVHeaders,
  type AuditDealRow,
  type AuditRunRow,
  type GenerateAuditOptions,
  type GenerateAuditResult,
  type ParsedAuditCSV,
} from "@/lib/fi-audit/audit-orchestrator";
