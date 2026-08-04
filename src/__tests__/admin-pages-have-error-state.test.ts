/**
 * Ratchet: admin pages that fetch must be able to tell an operator it failed.
 *
 * WHY
 *
 * `/admin/leads` caught `TypeError: Failed to fetch`, reported it to Sentry,
 * and rendered "No leads match your filters" — a false statement about the
 * dealer's own pipeline. The monitoring worked perfectly; the page lied anyway.
 *
 * A sweep on 2026-08-04 found this was not one page's oversight: 41 of the 94
 * admin pages that fetch had no user-visible error state of any kind. Leads is
 * fixed, leaving 40. Fixing the rest in one change would be a 40-page diff
 * nobody can review, so this ratchet holds the line instead — the count may
 * fall, never rise.
 *
 * HOW TO USE IT
 *
 * Adding a page that fetches? Give it an error state. `ErrorState` +
 * `describeFetchFailure` in `src/components/admin/ErrorState.tsx` are there for
 * exactly this, and the leads page is the worked example.
 *
 * Fixing one of the pages on the list? Delete its line from ALLOWED and lower
 * MAX_SILENT_PAGES. That is the only direction this file is meant to move.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { globSync } from "glob";

const ADMIN_DIR = join(process.cwd(), "src", "app", "admin");

/** A page "handles failure" if it can put something on screen about it. */
const HANDLES_FAILURE =
  /setError|setLoadError|setFetchError|errorMessage|<ErrorState|describeFetchFailure/;

/**
 * Pages that fetch but cannot report a failure, as of 2026-08-04.
 *
 * This is a debt list, not an approval list. Every entry renders a blank or
 * stale surface when its request fails.
 */
const ALLOWED = new Set<string>([
  "accounting/export/page.tsx",
  "accounting/page.tsx",
  "agency/page.tsx",
  "analytics/cohorts/page.tsx",
  "analytics/platform-health/page.tsx",
  "analytics/verification/page.tsx",
  "auction/page.tsx",
  "compliance/checks/page.tsx",
  "data-export/page.tsx",
  "deals/[dealId]/compliance/page.tsx",
  "deals/[dealId]/page.tsx",
  "deals/page.tsx",
  "deliveries/page.tsx",
  "documents/compliance/page.tsx",
  "fi-products/page.tsx",
  "floor-plan/page.tsx",
  "intake/page.tsx",
  "inventory-pool/page.tsx",
  "inventory/backgrounds/page.tsx",
  "knowledge/page.tsx",
  "leads/[id]/page.tsx",
  "marketing/templates/page.tsx",
  "payments/page.tsx",
  "reports/page.tsx",
  "reputation/page.tsx",
  "resources/page.tsx",
  "service/appointments/page.tsx",
  "service/parts/page.tsx",
  "service/repair-orders/page.tsx",
  "service/technicians/page.tsx",
  "settings/integrations/page.tsx",
  "settings/mfa/page.tsx",
  "settings/notifications/page.tsx",
  "sms/page.tsx",
  "surveys/page.tsx",
  "team/page.tsx",
  "training/page.tsx",
  "user-testing/page.tsx",
  "vehicles/new/page.tsx",
  "webhooks/page.tsx",
]);

/** Must never rise. Lower it whenever a page is fixed. */
const MAX_SILENT_PAGES = ALLOWED.size;

function fetchingPages(): string[] {
  return globSync("**/page.tsx", { cwd: ADMIN_DIR })
    .filter((rel) => readFileSync(join(ADMIN_DIR, rel), "utf8").includes("await fetch("))
    .sort();
}

describe("admin pages can report a failed fetch", () => {
  const pages = fetchingPages();

  test("the sweep still finds pages to check", () => {
    /* If a refactor moves admin pages, this file would otherwise pass by
       checking nothing at all. */
    expect(pages.length).toBeGreaterThan(50);
  });

  test("no NEW page ships without a way to report failure", () => {
    const silent = pages.filter(
      (rel) => !HANDLES_FAILURE.test(readFileSync(join(ADMIN_DIR, rel), "utf8")),
    );
    const unexpected = silent.filter((rel) => !ALLOWED.has(rel));

    expect(unexpected).toEqual([]);
  });

  test("the debt list only shrinks", () => {
    const silent = pages.filter(
      (rel) => !HANDLES_FAILURE.test(readFileSync(join(ADMIN_DIR, rel), "utf8")),
    );
    expect(silent.length).toBeLessThanOrEqual(MAX_SILENT_PAGES);
  });

  test("the debt list has no stale entries", () => {
    /* A page listed here that now handles failure means somebody fixed it and
       did not lower the count. Keeps the number honest. */
    const stale = [...ALLOWED].filter((rel) => {
      const full = join(ADMIN_DIR, rel);
      try {
        return HANDLES_FAILURE.test(readFileSync(full, "utf8"));
      } catch {
        return true; // deleted page still listed
      }
    });
    expect(stale).toEqual([]);
  });

  test("the page that caused this is fixed", () => {
    const src = readFileSync(join(ADMIN_DIR, "leads", "page.tsx"), "utf8");
    expect(HANDLES_FAILURE.test(src)).toBe(true);
    expect(ALLOWED.has("leads/page.tsx")).toBe(false);
  });
});
