/**
 * Drift guard: the module catalog (src/lib/admin-modules.ts MODULE_CATALOG) MUST
 * stay 1:1 with the sidebar's NAV_SECTIONS. If someone adds a nav item without a
 * catalog entry (or vice versa), gating would silently miss it — this fails CI.
 *
 * We parse AdminSidebar.tsx as text (rather than importing the client component,
 * which pulls next-auth/react into node) and extract the hrefs inside the
 * NAV_SECTIONS array literal.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MODULE_CATALOG } from "@/lib/admin-modules";

function navHrefsFromSidebar(): string[] {
  const src = readFileSync(
    resolve(process.cwd(), "src/components/AdminSidebar.tsx"),
    "utf8",
  );
  const start = src.indexOf("const NAV_SECTIONS");
  expect(start).toBeGreaterThan(-1);
  // The array literal ends at the first "\n];" after the declaration.
  const end = src.indexOf("\n];", start);
  expect(end).toBeGreaterThan(start);
  const block = src.slice(start, end);
  const hrefs = [...block.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);
  return hrefs;
}

describe("module catalog <-> sidebar nav drift", () => {
  const navHrefs = navHrefsFromSidebar();
  const catalogHrefs = MODULE_CATALOG.map((m) => m.href);

  test("sidebar actually yields nav hrefs", () => {
    expect(navHrefs.length).toBeGreaterThan(20);
  });

  test("every sidebar nav item has a catalog entry", () => {
    const missing = navHrefs.filter((h) => !catalogHrefs.includes(h));
    expect(missing).toEqual([]);
  });

  test("every catalog entry maps to a real sidebar nav item", () => {
    const orphan = catalogHrefs.filter((h) => !navHrefs.includes(h));
    expect(orphan).toEqual([]);
  });

  test("counts match exactly (no duplicates on either side)", () => {
    expect(new Set(navHrefs).size).toBe(navHrefs.length);
    expect(catalogHrefs.length).toBe(navHrefs.length);
  });
});
