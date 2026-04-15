#!/usr/bin/env tsx
/**
 * generate-openapi.ts — Auto-generate OpenAPI 3.1 spec from Next.js route files.
 *
 * EXCLUSION RULES (documented here, permanent):
 *  - Files that are not direct route.ts exports (e.g. _helpers, _utils) — none exist in
 *    this codebase but the glob is strict: only `route.ts` files are scanned.
 *  - `src/app/api/auth/[...nextauth]/route.ts` — NextAuth catch-all route. It does not
 *    export individual HTTP method handlers; it exports a single default `handler`. It is
 *    documented as a special case under tag "auth" with GET + POST marked as NextAuth-managed.
 *  - Any file not ending in /route.ts is ignored.
 *
 * Usage:
 *   npx tsx scripts/generate-openapi.ts
 *
 * Outputs:
 *   public/openapi.json  — OpenAPI 3.1 JSON spec (served automatically by Next.js)
 *   docs/api.md          — Human-readable markdown index grouped by top-level tag
 */

import * as fs from "fs";
import * as path from "path";

/* -------------------------------------------------------------------------- */
/* Config                                                                      */
/* -------------------------------------------------------------------------- */

const REPO_ROOT = path.resolve(__dirname, "..");
const API_DIR = path.join(REPO_ROOT, "src", "app", "api");
const OUTPUT_JSON = path.join(REPO_ROOT, "public", "openapi.json");
const OUTPUT_MD = path.join(REPO_ROOT, "docs", "api.md");

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

/* -------------------------------------------------------------------------- */
/* Filesystem helpers                                                          */
/* -------------------------------------------------------------------------- */

function walkDir(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function findRouteFiles(): string[] {
  return walkDir(API_DIR).filter((f) => f.endsWith(path.sep + "route.ts") || f.endsWith("/route.ts"));
}

/* -------------------------------------------------------------------------- */
/* Path derivation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Convert a filesystem path to an OpenAPI path.
 * src/app/api/admin/vehicles/[id]/route.ts → /api/admin/vehicles/{id}
 */
function deriveOpenApiPath(routeFile: string): string {
  const rel = path.relative(path.join(REPO_ROOT, "src", "app"), routeFile);
  // rel = "api/admin/vehicles/[id]/route.ts"
  let p = rel
    .replace(/\/route\.ts$/, "")   // strip /route.ts
    .replace(/\\/g, "/");           // normalize Windows separators

  // Convert Next.js dynamic segments [param] → {param}
  // Also handle catch-all [...param] → {param} (collapsed to single param)
  p = p.replace(/\[\.\.\.([^\]]+)\]/g, "{$1}");
  p = p.replace(/\[([^\]]+)\]/g, "{$1}");

  return "/" + p;
}

/* -------------------------------------------------------------------------- */
/* File analysis                                                               */
/* -------------------------------------------------------------------------- */

interface RouteInfo {
  file: string;
  openApiPath: string;
  methods: HttpMethod[];
  requiresAuth: boolean;
  isRateLimited: boolean;
  isNextAuth: boolean;
  summary: Record<HttpMethod, string>;
}

const AUTH_PATTERNS = /requireAuth\s*\(|requireRole\s*\(|getServerSession\s*\(|getToken\s*\(/;
const RATE_LIMIT_PATTERNS = /checkRateLimit\s*\(|rateLimit\s*\(/;
const NEXTAUTH_CATCH_ALL = /\[\.\.\.nextauth\]/i;

function extractJsDocSummary(source: string, method: HttpMethod): string | null {
  // Look for /** ... */ block immediately before `export async function METHOD`
  // or `export function METHOD`
  const pattern = new RegExp(
    `/\\*\\*([\\s\\S]*?)\\*/\\s*(?:export\\s+(?:async\\s+)?function\\s+${method})`,
    "i",
  );
  const match = source.match(pattern);
  if (!match) return null;

  // Extract first non-empty line from JSDoc
  const lines = match[1]
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("@"));

  return lines.length > 0 ? lines[0] : null;
}

/**
 * Derive a human-readable summary from the OpenAPI path + method when no JSDoc exists.
 * POST /api/admin/vehicles → "Create vehicle"
 */
function deriveSummary(method: HttpMethod, apiPath: string): string {
  const segments = apiPath
    .split("/")
    .filter((s) => s && !s.startsWith("{"));   // drop empty + param segments

  // Last meaningful segment (after /api/)
  const resource = segments.length > 1 ? segments[segments.length - 1] : segments[0] ?? "resource";
  // Singularize common plural forms
  const singular = resource.replace(/ies$/, "y").replace(/s$/, "");

  const verbMap: Record<HttpMethod, string> = {
    GET: "Get",
    POST: "Create",
    PUT: "Update",
    PATCH: "Update",
    DELETE: "Delete",
    OPTIONS: "Options for",
  };

  const verb = verbMap[method];

  // For list-style GETs (path ends without a param), add "list" nuance
  const endsWithParam = apiPath.endsWith("}");
  if (method === "GET" && !endsWithParam) {
    return `List ${resource}`;
  }

  return `${verb} ${singular}`;
}

function analyzeRoute(routeFile: string): RouteInfo {
  const source = fs.readFileSync(routeFile, "utf-8");
  const openApiPath = deriveOpenApiPath(routeFile);
  const isNextAuth = NEXTAUTH_CATCH_ALL.test(routeFile);

  let methods: HttpMethod[];
  if (isNextAuth) {
    // NextAuth exports a default handler, not individual HTTP method functions.
    // Document as GET + POST (standard OAuth flow).
    methods = ["GET", "POST"];
  } else {
    methods = HTTP_METHODS.filter((m) => {
      // Match: export async function GET / export function GET
      return new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}\\b`).test(source);
    });
  }

  const requiresAuth = AUTH_PATTERNS.test(source);
  const isRateLimited = RATE_LIMIT_PATTERNS.test(source);

  const summary: Partial<Record<HttpMethod, string>> = {};
  for (const method of methods) {
    const jsdoc = isNextAuth ? null : extractJsDocSummary(source, method);
    summary[method] = jsdoc ?? deriveSummary(method, openApiPath);
  }

  return {
    file: routeFile,
    openApiPath,
    methods,
    requiresAuth,
    isRateLimited,
    isNextAuth,
    summary: summary as Record<HttpMethod, string>,
  };
}

/* -------------------------------------------------------------------------- */
/* OpenAPI document builder                                                    */
/* -------------------------------------------------------------------------- */

interface OpenApiOperation {
  summary: string;
  tags: string[];
  security?: Array<Record<string, string[]>>;
  "x-rate-limited"?: boolean;
  "x-nextauth-managed"?: boolean;
  responses: Record<string, { description: string }>;
}

type PathItem = Partial<Record<Lowercase<HttpMethod>, OpenApiOperation>>;

function deriveTag(openApiPath: string): string {
  // /api/admin/vehicles/{id} → admin
  // /api/leads → leads
  const parts = openApiPath.split("/").filter(Boolean); // ["api", "admin", "vehicles", ...]
  return parts[1] ?? "misc";  // parts[0] = "api"
}

function buildOpenApiSpec(routes: RouteInfo[]): object {
  const paths: Record<string, PathItem> = {};

  for (const route of routes) {
    if (route.methods.length === 0) continue;  // no exported handlers found

    const pathItem: PathItem = {};

    for (const method of route.methods) {
      const operation: OpenApiOperation = {
        summary: route.summary[method],
        tags: [deriveTag(route.openApiPath)],
        responses: {
          "200": { description: "Success" },
          "400": { description: "Bad request" },
          "401": { description: "Unauthorized" },
          "500": { description: "Internal server error" },
        },
      };

      if (route.requiresAuth) {
        operation.security = [{ bearerAuth: [] }];
      }

      if (route.isRateLimited) {
        operation["x-rate-limited"] = true;
      }

      if (route.isNextAuth) {
        operation["x-nextauth-managed"] = true;
        operation.summary = method === "GET"
          ? "NextAuth.js OAuth callback / session handler (GET)"
          : "NextAuth.js sign-in / CSRF handler (POST)";
      }

      pathItem[method.toLowerCase() as Lowercase<HttpMethod>] = operation;
    }

    paths[route.openApiPath] = pathItem;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Wolfpack Auto API",
      version: "1.0.0",
      description:
        "Auto-generated from src/app/api/**/route.ts. Do not edit by hand — run `npm run openapi` to regenerate.",
    },
    servers: [
      { url: "https://{dealerSlug}.wolfpackauto.com", description: "Production (dealer subdomain)" },
      { url: "http://localhost:3000", description: "Local development" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "NextAuth.js session token or API key",
        },
      },
    },
    paths,
  };
}

/* -------------------------------------------------------------------------- */
/* Markdown index builder                                                      */
/* -------------------------------------------------------------------------- */

function buildMarkdownIndex(routes: RouteInfo[], spec: ReturnType<typeof buildOpenApiSpec>): string {
  // Group by tag
  const byTag: Record<string, RouteInfo[]> = {};
  for (const route of routes) {
    if (route.methods.length === 0) continue;
    const tag = deriveTag(route.openApiPath);
    if (!byTag[tag]) byTag[tag] = [];
    byTag[tag].push(route);
  }

  const tags = Object.keys(byTag).sort();
  const lines: string[] = [];

  lines.push("# Wolfpack Auto — API Reference");
  lines.push("");
  lines.push(
    `> Auto-generated ${new Date().toISOString().split("T")[0]} from \`src/app/api/**/route.ts\`.  `,
  );
  lines.push("> Do not edit by hand — run `npm run openapi` to regenerate.");
  lines.push("");
  lines.push(`**Total routes:** ${routes.filter((r) => r.methods.length > 0).length}`);
  lines.push("");
  lines.push("## Contents");
  lines.push("");
  for (const tag of tags) {
    lines.push(`- [${tag}](#${tag})`);
  }
  lines.push("");

  for (const tag of tags) {
    lines.push(`## ${tag}`);
    lines.push("");
    lines.push("| Method | Path | Summary | Auth | Rate-limited |");
    lines.push("|--------|------|---------|------|-------------|");

    for (const route of byTag[tag].sort((a, b) => a.openApiPath.localeCompare(b.openApiPath))) {
      for (const method of route.methods) {
        const auth = route.requiresAuth ? "Bearer" : "—";
        const rl = route.isRateLimited ? "Yes" : "—";
        const summary = route.summary[method] ?? "";
        lines.push(`| \`${method}\` | \`${route.openApiPath}\` | ${summary} | ${auth} | ${rl} |`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

function main(): void {
  console.log("[generate-openapi] Scanning route files...");
  const routeFiles = findRouteFiles();
  console.log(`[generate-openapi] Found ${routeFiles.length} route.ts files`);

  const routes = routeFiles.map(analyzeRoute);

  const skipped = routes.filter((r) => r.methods.length === 0);
  if (skipped.length > 0) {
    console.warn(`[generate-openapi] Skipped ${skipped.length} routes with no exported HTTP methods:`);
    for (const r of skipped) {
      console.warn(`  - ${r.openApiPath} (${path.relative(REPO_ROOT, r.file)})`);
    }
  }

  const documented = routes.filter((r) => r.methods.length > 0);
  const spec = buildOpenApiSpec(routes);
  const md = buildMarkdownIndex(routes, spec as ReturnType<typeof buildOpenApiSpec>);

  // Ensure output directories exist
  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.mkdirSync(path.dirname(OUTPUT_MD), { recursive: true });

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(spec, null, 2), "utf-8");
  fs.writeFileSync(OUTPUT_MD, md, "utf-8");

  const totalMethods = documented.reduce((sum, r) => sum + r.methods.length, 0);
  console.log(`[generate-openapi] Done.`);
  console.log(`  Routes documented : ${documented.length}`);
  console.log(`  Operations total  : ${totalMethods}`);
  console.log(`  Auth-required     : ${documented.filter((r) => r.requiresAuth).length}`);
  console.log(`  Rate-limited      : ${documented.filter((r) => r.isRateLimited).length}`);
  console.log(`  Output JSON       : ${OUTPUT_JSON}`);
  console.log(`  Output Markdown   : ${OUTPUT_MD}`);
}

main();
