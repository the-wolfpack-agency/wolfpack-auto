/**
 * A button that looks like a call to action must actually do something.
 *
 * WHY THIS EXISTS
 *
 * /financing shipped "Apply Now" as a styled <button> with no onClick, no
 * href, no form and no type="submit". The primary call to action on the
 * financing page did nothing when clicked. /inventory shipped dead pagination
 * the same way. Both are public pages, both were live, and both would be
 * clicked in any demo.
 *
 * This is the same shape as the dealer-logo control that was a <div> with
 * cursor-pointer and no file input: markup that reads as interactive and is
 * inert. No API test can see it, because there is no API call to make.
 *
 * The scan is deliberately narrow. It flags a <button> that has none of
 * onClick, type="submit", disabled, or form. Anything genuinely inert and
 * intentional goes in ALLOWED with a reason.
 */
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const APP = join(__dirname, "..");

/**
 * Buttons that are intentionally inert. Each needs a reason.
 *
 * These two are presentational triggers inside components that attach their
 * behaviour on a parent element, verified by reading them.
 */
const ALLOWED: Record<string, string> = {
  /* ACTION NEEDED. These are real dead controls found on 2026-08-03, recorded
     rather than hidden so they stay visible and so a NEW dead CTA still fails
     this test. Each needs a feature or a product decision, not a one-line fix:

       app/inventory/page.tsx      pagination is hardcoded [1,2,3,4] with no
                                   state and a dead "Next page"; making it work
                                   means wiring real paging to the listing query.
       app/admin/reputation        "Suggest Response" has no feature behind it.
       app/admin/vehicle-history   the share control has no feature behind it.

     Delete the entry when the feature lands. */
  "app/inventory/page.tsx": "ACTION NEEDED: pagination is not wired to the listing query",
  "app/admin/reputation/page.tsx": "ACTION NEEDED: Suggest Response has no feature behind it",
  "app/admin/vehicle-history/page.tsx": "ACTION NEEDED: share control has no feature behind it",
  "components/marketing/FAQAccordion.tsx": "accordion trigger; the handler is bound by the parent component",
  "components/marketing/PricingTable.tsx": "presentational cell rendered inside a linked row",
};

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) {
      if (e === "__tests__" || e === "node_modules") continue;
      tsxFiles(full, out);
    } else if (e.endsWith(".tsx")) out.push(full);
  }
  return out;
}

interface Dead {
  file: string;
  line: number;
  label: string;
}

function deadButtons(): Dead[] {
  const found: Dead[] = [];
  for (const file of tsxFiles(APP)) {
    /* Strip comments first. A JSX comment that mentions a button tag is not a
       button, and matching one is how this scan reports its own documentation
       as a defect. */
    const src = readFileSync(file, "utf8")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const m of src.matchAll(/<button\b((?:[^>]|\n)*?)>/g)) {
      const attrs = m[1];
      if (/onClick|type="submit"|type={"submit"}|disabled|form=/.test(attrs)) continue;
      const line = src.slice(0, m.index).split("\n").length;
      const after = src.slice(m.index! + m[0].length, m.index! + m[0].length + 160);
      const label = (after.match(/>\s*([A-Za-z][^<{]{2,40})/)?.[1] ?? after.replace(/\s+/g, " ").slice(0, 40)).trim();
      found.push({ file: relative(join(APP, ".."), file), line, label });
    }
  }
  return found;
}

describe("no call to action is inert", () => {
  const dead = deadButtons();

  it("scans real files, so it cannot pass by scanning nothing", () => {
    expect(tsxFiles(APP).length).toBeGreaterThan(20);
  });

  it("has no unexplained dead button", () => {
    const unexplained = dead.filter((d) => {
      const key = d.file.replace(/^app\//, "").replace(/^src\//, "");
      return !Object.keys(ALLOWED).some((a) => key.endsWith(a) || d.file.endsWith(a));
    });
    if (unexplained.length) {
      throw new Error(
        `These <button> elements have no onClick, no type="submit", no form and are not disabled, ` +
          `so clicking them does nothing:\n` +
          unexplained.map((d) => `    ${d.file}:${d.line}  "${d.label}"`).join("\n") +
          `\n  Give it a handler or an <a href>, or record it in ALLOWED with a reason.`,
      );
    }
    expect(unexplained).toEqual([]);
  });
});
