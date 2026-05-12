/**
 * ACME Motors fixture for the sample Website Audit PDF.
 *
 * Used by:
 *   - `scripts/generate-sample-website-audit.ts` (writes public/sample-website-audit.pdf)
 *   - `pdf-generator.test.ts` (smoke test that the PDF renders)
 *
 * Numbers are intentionally a mix of "needs work" findings so the sample
 * shows what a typical dealer audit looks like.
 */

import type { ScanResult } from "@/lib/website-audit/scanner";
import type { LighthouseResult } from "@/lib/website-audit/lighthouse-runner";
import type { WebsiteAuditPDFInput } from "@/lib/website-audit/pdf-generator";
import { applyRules, computeOverallScore } from "@/lib/website-audit/patterns";

const FIXED_DATE = new Date("2026-05-12T00:00:00Z");

export const ACME_SCAN: ScanResult = {
  scanned_url: "https://www.acmemotors.example",
  scan_started_at: FIXED_DATE.toISOString(),
  scan_completed_at: FIXED_DATE.toISOString(),
  homepage: {
    title: "ACME Motors - Used and New Vehicles",
    meta_description:
      "Visit ACME Motors for new and used vehicles, financing, service, and parts.",
    viewport_meta_present: true,
    link_count: 78,
    image_count: 42,
    image_alt_coverage: 0.55,
    form_count: 2,
    primary_form_field_count: 14,
    mobile_has_horizontal_scroll: true,
    small_tap_targets_count: 9,
    is_https: true,
    has_above_fold_cta: false,
    has_inventory_link: true,
    has_trade_in_link: false,
    has_financing_link: false,
    has_privacy_link: true,
    has_accessibility_link: false,
    has_tcpa_consent: false,
    has_review_widget: false,
    shows_inventory_count: false,
    phone_visible: false,
    broken_link_count: 2,
  },
  vdp_samples: [
    {
      url: "https://www.acmemotors.example/inventory/used-2022-camry-vin-12345",
      photo_count: 6,
      photos_lazy_loaded: false,
      has_vehicle_schema: false,
      price_visible: false,
      has_video: false,
      has_history_link: false,
    },
    {
      url: "https://www.acmemotors.example/inventory/used-2021-civic-vin-67890",
      photo_count: 7,
      photos_lazy_loaded: false,
      has_vehicle_schema: false,
      price_visible: true,
      has_video: false,
      has_history_link: false,
    },
    {
      url: "https://www.acmemotors.example/inventory/new-2025-rav4-vin-24680",
      photo_count: 5,
      photos_lazy_loaded: false,
      has_vehicle_schema: false,
      price_visible: true,
      has_video: false,
      has_history_link: false,
    },
  ],
  network: {
    request_count: 168,
    total_bytes: 4_200_000,
    largest_resource_bytes: 1_400_000,
  },
  warnings: [],
};

export const ACME_LIGHTHOUSE: LighthouseResult = {
  available: true,
  performance_score: 38,
  accessibility_score: 64,
  seo_score: 72,
  best_practices_score: 70,
  lcp_seconds: 5.4,
  cls: 0.18,
  tbt_ms: 720,
  fcp_seconds: 2.8,
  fetched_at: FIXED_DATE.toISOString(),
};

const TRIGGERED = applyRules({ scan: ACME_SCAN, lighthouse: ACME_LIGHTHOUSE });
const SCORE = computeOverallScore(TRIGGERED);

export const ACME_WEBSITE_SAMPLE_INPUT: WebsiteAuditPDFInput = {
  dealership_name: "ACME Motors",
  contact_name: "Sample Recipient",
  website_url: "https://www.acmemotors.example",
  audit_label: "May 2026",
  overall_score: SCORE,
  triggered: TRIGGERED,
  scan: ACME_SCAN,
  lighthouse: ACME_LIGHTHOUSE,
  generated_at: FIXED_DATE,
};
