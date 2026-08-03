/**
 * No role gate may lock out the people who actually use the product.
 *
 * WHY THIS EXISTS
 *
 * `/api/admin/dealers` required `["owner"]`. In production every real person
 * holds `admin`; `owner` existed on three test rows. `requireRole` is a flat
 * `includes()` with no hierarchy, so every submit came back 403 and
 * /admin/agency/new-dealer could not onboard a client at all. Nothing failed
 * until somebody tried to use it in front of a customer.
 *
 * The same scan then found `/api/admin/mfa/disable` gated to `["admin"]`,
 * which excluded `owner`: the highest-privilege role could not disable MFA.
 * Nobody had hit it because nobody had tried.
 *
 * That is a whole bug class, and it is cheap to close: read every gate in the
 * API and check the allowed set against the roles that exist. No database, no
 * credentials, no server.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const API_DIR = join(__dirname, "..");

/** Every role the product issues. Mirrors AuthResult in src/lib/auth-guard.ts. */
const ALL_ROLES = ["owner", "admin", "manager", "staff", "sub_dealer"] as const;

/**
 * The roles real people hold in production. A gate that admits none of these
 * is a locked door, whatever it says.
 */
const ROLES_IN_USE = ["owner", "admin", "manager", "staff"] as const;

/**
 * Gates that deliberately exclude `owner`.
 *
 * Empty, and it should stay that way: owner is the highest privilege, so a gate
 * it cannot pass is almost always a mistake rather than a policy. Adding an
 * entry requires a reason somebody can act on.
 */
const OWNER_EXCLUDED_BY_DESIGN: Record<string, string> = {};

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      routeFiles(full, out);
    } else if (entry === "route.ts") {
      out.push(full);
    }
  }
  return out;
}

interface Gate {
  file: string;
  raw: string;
  roles: string[] | null; // null => resolved from a shared constant
}

/** Every requireRole([...]) call in the API, with the roles it admits. */
function gates(): Gate[] {
  const found: Gate[] = [];
  for (const file of routeFiles(API_DIR)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/requireRole\(\s*(\[[^\]]*\]|[A-Z_][A-Za-z0-9_]*)\s*\)/g)) {
      const arg = m[1].trim();
      const rel = file.slice(file.indexOf("/api/") + 1);
      if (arg.startsWith("[")) {
        const roles = [...arg.matchAll(/["']([a-z_]+)["']/g)].map((r) => r[1]);
        found.push({ file: rel, raw: arg, roles });
      } else {
        // A shared constant, e.g. AGENCY_DEALER_ROLES. Resolved below.
        found.push({ file: rel, raw: arg, roles: null });
      }
    }
  }
  return found;
}

/** Shared role constants, so a gate using one is still checked. */
const SHARED: Record<string, string[]> = {
  AGENCY_DEALER_ROLES: (() => {
    const src = readFileSync(join(__dirname, "..", "..", "..", "lib", "dealers", "agency-roles.ts"), "utf8");
    return [...src.matchAll(/["']([a-z_]+)["']/g)].map((m) => m[1]);
  })(),
};

const resolved = gates().map((g) => ({
  ...g,
  roles: g.roles ?? SHARED[g.raw] ?? null,
}));

describe("the scan itself works", () => {
  it("finds the role gates, so this file cannot pass by finding nothing", () => {
    expect(resolved.length).toBeGreaterThan(3);
  });

  it("resolves every gate to a concrete role list", () => {
    const unresolved = resolved.filter((g) => g.roles === null).map((g) => `${g.file}: ${g.raw}`);
    if (unresolved.length) {
      throw new Error(
        `Cannot tell who these gates admit: ${unresolved.join(", ")}. ` +
          `Add the constant to SHARED above so it is checked rather than skipped.`,
      );
    }
    expect(unresolved).toEqual([]);
  });
});

describe("every gate admits somebody real", () => {
  it.each(resolved.map((g) => [`${g.file} ${g.raw}`, g] as const))("%s", (_label, gate) => {
    const roles = gate.roles!;
    if (roles.length === 0) {
      throw new Error(`${gate.file} admits no role at all; nobody can call it.`);
    }
    const unknown = roles.filter((r) => !ALL_ROLES.includes(r as (typeof ALL_ROLES)[number]));
    if (unknown.length) {
      throw new Error(
        `${gate.file} names ${unknown.join(", ")}, which is not a role this product issues. ` +
          `A misspelled role is a locked door: requireRole is a flat includes().`,
      );
    }
    const usable = roles.filter((r) => ROLES_IN_USE.includes(r as (typeof ROLES_IN_USE)[number]));
    if (usable.length === 0) {
      throw new Error(
        `${gate.file} admits only ${roles.join(", ")}, which no real person holds. ` +
          `This is the /api/admin/dealers bug: every request 403s and the feature is dead.`,
      );
    }
    expect(usable.length).toBeGreaterThan(0);
  });
});

describe("owner can do everything", () => {
  it.each(resolved.map((g) => [`${g.file} ${g.raw}`, g] as const))("%s admits owner", (_label, gate) => {
    /* requireRole has no hierarchy, so "owner outranks admin" is not true
       unless the gate says owner. /api/admin/mfa/disable was ["admin"] and
       silently locked out the highest-privilege role. */
    if (gate.roles!.includes("owner")) {
      expect(gate.roles).toContain("owner");
      return;
    }
    const reason = OWNER_EXCLUDED_BY_DESIGN[gate.file];
    if (!reason) {
      throw new Error(
        `${gate.file} admits ${gate.roles!.join(", ")} but not owner. requireRole is a flat ` +
          `includes() with no hierarchy, so an owner is refused here. Add "owner", or record ` +
          `it in OWNER_EXCLUDED_BY_DESIGN with a reason.`,
      );
    }
    expect(reason.length).toBeGreaterThan(10);
  });
});
