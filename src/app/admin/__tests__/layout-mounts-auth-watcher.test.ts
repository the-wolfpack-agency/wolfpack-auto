/**
 * The admin layout must actually RENDER its global guards, not just import them.
 *
 * WHY THIS EXISTS
 *
 * AdminAuthWatcher wraps window.fetch and redirects to login when a same-origin
 * /api call returns 401. It was imported in src/app/admin/layout.tsx and never
 * placed in the JSX. So on an expired session every admin page sat on a dead
 * "Authentication required" banner, with actions that silently failed, instead
 * of sending the person to sign in. A client hit this.
 *
 * The component itself had five passing tests the entire time. They exercise it
 * directly and never asserted it was mounted anywhere, so "the component works"
 * and "the product works" had drifted apart with nothing to notice.
 *
 * An unused import is not a lint error when the symbol is referenced by the
 * import statement alone in some configs, and it is invisible to every test
 * that does not read the layout. So the check is on the layout source.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LAYOUT = readFileSync(join(__dirname, "..", "layout.tsx"), "utf8");

/** Components the admin layout must mount for the product to behave. */
const REQUIRED = [
  {
    name: "AdminAuthWatcher",
    why: "without it, an expired session leaves every admin page on a dead error banner instead of redirecting to login",
  },
  {
    name: "AdminSidebar",
    why: "without it the admin area has no navigation",
  },
];

describe("the admin layout mounts its global components", () => {
  it.each(REQUIRED.map((r) => [r.name, r] as const))("%s is rendered", (name, spec) => {
    const imported = new RegExp(`import\\s+${name}\\b`).test(LAYOUT);
    const rendered = new RegExp(`<${name}[\\s/>]`).test(LAYOUT);

    if (imported && !rendered) {
      throw new Error(
        `${name} is imported but never rendered in the admin layout: ${spec.why}. ` +
          `An import alone does nothing.`,
      );
    }
    if (!rendered) {
      throw new Error(`${name} is not rendered in the admin layout: ${spec.why}.`);
    }
    expect(rendered).toBe(true);
  });

  it("reads a layout that actually has JSX, so this cannot pass on an empty file", () => {
    expect(LAYOUT).toMatch(/return\s*\(/);
    expect(LAYOUT.length).toBeGreaterThan(300);
  });

  it("has no component imported and left unrendered", () => {
    /* The general form of the bug. Any local component import that never
       appears as a tag is either dead code or a guard that silently is not
       running. Both are worth failing on. */
    const imports = [...LAYOUT.matchAll(/import\s+([A-Z][A-Za-z0-9_]*)\s+from\s+["']@\/components\/[^"']+["']/g)]
      .map((m) => m[1]);
    const unrendered = imports.filter((n) => !new RegExp(`<${n}[\\s/>]`).test(LAYOUT));
    if (unrendered.length) {
      throw new Error(
        `Imported into the admin layout but never rendered: ${unrendered.join(", ")}. ` +
          `That is how AdminAuthWatcher silently stopped guarding expired sessions.`,
      );
    }
    expect(unrendered).toEqual([]);
  });
});
