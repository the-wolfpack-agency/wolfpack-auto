/**
 * Delete Neon preview branches whose pull request is gone.
 *
 * See .github/workflows/neon-branch-reaper.yml for why this exists. In short:
 * the Neon/Vercel integration creates a database branch per preview deployment
 * and never removes one, Vercel bills branch-hours, and 69 abandoned previews
 * were 67% of a monthly bill.
 *
 * NO DEPENDENCIES. Node 20's built-in fetch and the gh CLI already on the
 * runner. A cost-cleanup job that installs packages to run adds supply-chain
 * surface to save money, which is a bad trade in both directions.
 *
 * Env:
 *   NEON_API_KEY     required
 *   NEON_PROJECT_ID  required
 *   DRY_RUN          "true" to print without deleting
 */

const API = "https://console.neon.tech/api/v2";
const KEY = process.env.NEON_API_KEY;
const PROJECT = process.env.NEON_PROJECT_ID;
const DRY = String(process.env.DRY_RUN).toLowerCase() === "true";

if (!KEY || !PROJECT) {
  console.error("NEON_API_KEY and NEON_PROJECT_ID are required.");
  process.exit(1);
}

/** The prefix the Vercel integration gives every preview branch. */
const PREVIEW_PREFIX = "preview/";

async function neon(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/** Head-ref names of every OPEN pull request. These are never touched. */
async function openPrHeadRefs() {
  const { execFileSync } = await import("node:child_process");
  const out = execFileSync("gh", ["pr", "list", "--state", "open", "--limit", "300", "--json", "headRefName"], {
    encoding: "utf8",
  });
  return new Set(JSON.parse(out || "[]").map((p) => p.headRefName));
}

const { branches } = await neon(`/projects/${PROJECT}/branches`);
const open = await openPrHeadRefs();

const candidates = [];
for (const b of branches) {
  const name = b.name || "";
  // Only previews. `main`, and anything a human named, are out of scope: the
  // reaper must never be the reason production or a hand-made branch vanished.
  if (!name.startsWith(PREVIEW_PREFIX)) continue;
  if (b.default) continue;
  const gitRef = name.slice(PREVIEW_PREFIX.length);
  if (open.has(gitRef)) continue;
  candidates.push({ id: b.id, name, gitRef, created: (b.created_at || "").slice(0, 10) });
}

console.log(`branches: ${branches.length}, previews with an open PR: ${branches.filter((b) => (b.name || "").startsWith(PREVIEW_PREFIX)).length - candidates.length}, reapable: ${candidates.length}`);

if (candidates.length === 0) {
  console.log("nothing to reap");
  process.exit(0);
}

for (const c of candidates) console.log(`  ${DRY ? "would delete" : "deleting"}  ${c.created}  ${c.name}`);

if (DRY) {
  console.log("\nDRY RUN: nothing was deleted. Re-run with dry_run unchecked to apply.");
  process.exit(0);
}

let ok = 0;
const failed = [];
for (const c of candidates) {
  try {
    await neon(`/projects/${PROJECT}/branches/${c.id}`, { method: "DELETE" });
    ok++;
  } catch (err) {
    // One failure must not abandon the rest: a branch can be transiently locked
    // by an in-flight operation, and the next weekly run will pick it up.
    failed.push(`${c.name}: ${err.message.slice(0, 120)}`);
  }
}

console.log(`\ndeleted ${ok}, failed ${failed.length}`);
for (const f of failed) console.log(`  ${f}`);
// Deliberately exit 0 on partial failure. This is a janitor, not a gate; a red
// weekly cron that nobody can action becomes a red nobody looks at.
process.exit(0);
