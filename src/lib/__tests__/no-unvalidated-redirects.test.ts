/**
 * No page may send a browser to a URL it did not check.
 *
 * The reported bug was one line on the admin login page: `callbackUrl` taken
 * from the query string and assigned to window.location.href once the password
 * was accepted. Sweeping the estate afterwards found the identical line on the
 * operator login page. Fixing the reported instance and leaving its twin is how
 * a class of bug survives being fixed, so this makes the class fail the build.
 *
 * THE RULE: a file that performs a full-page navigation to a non-literal target
 * must import `safeCallbackUrl`, or be listed below with a reason. A literal
 * path ("/admin") is always fine, because nobody can influence it.
 *
 * This is deliberately a coarse text scan, not a taint analysis. It is a
 * tripwire that costs milliseconds and asks a human to think, not a prover.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Navigations whose target cannot be influenced, with the reason it is safe. */
const ALLOWED: Record<string, string> = {
  "src/lib/auth-redirect.ts":
    "target is built from location.pathname, the browser's own current path, never from a query parameter",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/* Every full-page navigation in the file, with the first character of its
   target captured.

   The first version of this used a negative lookahead for a quote, and it was
   wrong in a way worth recording: `\s*` can match ZERO characters, so the
   engine backtracked and tested the lookahead against the SPACE after the
   equals sign. A space is not a quote, so every navigation matched and four
   safe files were reported as offenders. Capturing the target's opening
   characters and classifying them cannot backtrack into a false positive. */
const NAV = /(?:window\.)?location\.(?:href\s*=|assign\(|replace\()\s*(.{0,8})/g;

/** A target that begins with a quote and a slash is a literal path. */
const LITERAL_PATH = /^["'`]\//;

describe("every full-page navigation has a checked destination", () => {
  const offenders: string[] = [];

  for (const file of walk("src")) {
    const rel = file.replace(/\\/g, "/");
    if (rel in ALLOWED) continue;
    const source = readFileSync(file, "utf8");
    if (source.includes("safeCallbackUrl")) continue;

    NAV.lastIndex = 0;
    for (let m = NAV.exec(source); m !== null; m = NAV.exec(source)) {
      if (LITERAL_PATH.test(m[1])) continue;
      offenders.push(`${rel} -> ${m[1].trim()}`);
    }
  }

  test("no page navigates to an unchecked, non-literal target", () => {
    expect(offenders).toEqual([]);
  });
});
