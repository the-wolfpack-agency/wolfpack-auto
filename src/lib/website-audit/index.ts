/**
 * Barrel export for the Website Audit engagement-opener product.
 *
 * Mirrors the F&I Audit shape from `src/lib/fi-audit/`. Pure deterministic
 * scan (Playwright + codified rules) + 4-page PDF + email delivery. Used
 * as a Dealer Excellence Program engagement-opener artifact.
 *
 * Spec: docs/fi-audit-wedge-spec-2026-05-12.md (mirror)
 * Program context: docs/dealer-excellence-program-2026-05-12.md
 * Migration: src/db/migrations/078_website_audit_runs.sql
 * Landing page: /audits/website
 * Public POST: /api/website-audit-request
 */

export * from "@/lib/website-audit/benchmarks";
export * from "@/lib/website-audit/email-templates";
export * from "@/lib/website-audit/lighthouse-runner";
export * from "@/lib/website-audit/patterns";
export * from "@/lib/website-audit/pdf-generator";
export * from "@/lib/website-audit/scanner";
export {
  generateWebsiteAudit,
  type GenerateWebsiteAuditOptions,
  type GenerateWebsiteAuditResult,
  type WebsiteAuditRunRow,
} from "@/lib/website-audit/audit-orchestrator";
