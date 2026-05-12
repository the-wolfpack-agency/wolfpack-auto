/**
 * ACME Motors — fictional dataset used to generate the public sample
 * audit PDF (`public/sample-fi-audit.pdf`). Per `.ai/client-context.md`
 * we only use generic placeholders, never client names.
 *
 * Numbers are illustrative — intentionally below industry benchmark on
 * one product (GAP) and at-benchmark on another (warranty) so the sample
 * PDF demonstrates both the gap call-out AND the "above benchmark"
 * positive flip.
 */

import type { AuditPDFInput } from "@/lib/fi-audit/pdf-generator";
import type { FIPenetrationCell } from "@/lib/analytics-engine/fi-penetration";

const MGRS = [
  { id: "mgr-alpha", name: "Alex Rivera" },
  { id: "mgr-beta", name: "Jordan Park" },
];

const PRODUCT_MIX = ["gap", "warranty", "tire_wheel", "paint_protection"] as const;

const MONTHS = ["2026-02-01", "2026-03-01", "2026-04-01"];

// Deal counts per (manager, month). Used both for synthesizing cells AND
// for declaring the simulated monthly volume on the cover page.
const DEALS_PER_MGR_PER_MONTH = 85;

function makeCells(): FIPenetrationCell[] {
  const cells: FIPenetrationCell[] = [];
  for (const m of MGRS) {
    for (const month of MONTHS) {
      // "None" bucket — share of deals with no F&I attached.
      cells.push({
        fi_manager_id: m.id,
        fi_manager_name: m.name,
        product_type: "none",
        month,
        attach_rate: 0.08,
        gross_total: 0,
        deals_count: DEALS_PER_MGR_PER_MONTH,
        accepted_items: 0,
      });
      for (const product of PRODUCT_MIX) {
        // Bake in attach rates with one product clearly below benchmark
        // and one clearly at benchmark so the audit prose reads well.
        const base: Record<typeof product, number> = {
          gap: m.id === "mgr-alpha" ? 0.42 : 0.36, // below 150-200 benchmark 53%
          warranty: 0.46, // close to 45% benchmark
          tire_wheel: 0.27,
          paint_protection: 0.24,
        };
        const rate = base[product];
        const accepted = Math.round(rate * DEALS_PER_MGR_PER_MONTH);
        // Average gross per product sale roughly varies by product class.
        const avgPerSale: Record<typeof product, number> = {
          gap: 320,
          warranty: 780,
          tire_wheel: 240,
          paint_protection: 280,
        };
        cells.push({
          fi_manager_id: m.id,
          fi_manager_name: m.name,
          product_type: product,
          month,
          attach_rate: rate,
          gross_total: accepted * avgPerSale[product],
          deals_count: DEALS_PER_MGR_PER_MONTH,
          accepted_items: accepted,
        });
      }
    }
  }
  return cells;
}

/** Pinned generation timestamp so the sample PDF is byte-stable. */
export const ACME_GENERATED_AT = new Date("2026-05-12T00:00:00.000Z");

export const ACME_SAMPLE_INPUT: AuditPDFInput = {
  dealership_name: "ACME Motors",
  contact_name: "Sample Reader",
  audit_period_label: "Feb 2026 – Apr 2026",
  monthly_volume: 170,
  avg_gross_per_deal: 1420,
  cells: makeCells(),
  anonymize: false,
  generated_at: ACME_GENERATED_AT,
  demo_url: "https://calendly.com/wolfpack-auto/dos-demo",
};
