/**
 * openapi-coverage.test.ts — Drift protection for the OpenAPI spec.
 *
 * Asserts:
 *  1. Every route.ts file under src/app/api/ has a corresponding path in public/openapi.json.
 *  2. Every HTTP method exported from each file is documented on that path.
 *
 * If you add a new route and this test fails, run `npm run openapi` to regenerate the spec.
 *
 * Run with: npx jest src/__tests__/openapi-coverage.test.ts
 */

import * as fs from "fs";
import * as path from "path";

/* -------------------------------------------------------------------------- */
/* Helpers (duplicated from generator to keep tests self-contained)           */
/* -------------------------------------------------------------------------- */

const REPO_ROOT = path.resolve(__dirname, "../..");
const API_DIR = path.join(REPO_ROOT, "src", "app", "api");
const SPEC_PATH = path.join(REPO_ROOT, "public", "openapi.json");

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

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
  return walkDir(API_DIR).filter(
    (f) => f.endsWith(path.sep + "route.ts") || f.endsWith("/route.ts"),
  );
}

function deriveOpenApiPath(routeFile: string): string {
  const rel = path.relative(path.join(REPO_ROOT, "src", "app"), routeFile);
  let p = rel
    .replace(/\/route\.ts$/, "")
    .replace(/\\/g, "/");
  p = p.replace(/\[\.\.\.([^\]]+)\]/g, "{$1}");
  p = p.replace(/\[([^\]]+)\]/g, "{$1}");
  return "/" + p;
}

function getExportedMethods(routeFile: string): HttpMethod[] {
  const isNextAuth = /\[\.\.\.nextauth\]/i.test(routeFile);
  if (isNextAuth) return ["GET", "POST"];

  const source = fs.readFileSync(routeFile, "utf-8");
  return HTTP_METHODS.filter((m) =>
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}\\b`).test(source),
  );
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe("OpenAPI coverage", () => {
  let spec: {
    openapi: string;
    paths: Record<string, Record<string, unknown>>;
  };
  let routeFiles: string[];

  beforeAll(() => {
    expect(fs.existsSync(SPEC_PATH)).toBe(true);
    spec = JSON.parse(fs.readFileSync(SPEC_PATH, "utf-8"));
    routeFiles = findRouteFiles();
  });

  it("spec file exists and is valid JSON", () => {
    expect(spec).toBeTruthy();
    expect(spec.openapi).toMatch(/^3\.1/);
    expect(spec.paths).toBeTruthy();
  });

  it("every route.ts has a corresponding path in the spec", () => {
    const missingPaths: string[] = [];

    for (const file of routeFiles) {
      const apiPath = deriveOpenApiPath(file);
      const methods = getExportedMethods(file);
      if (methods.length === 0) continue; // no exported handlers — legitimately skipped

      if (!spec.paths[apiPath]) {
        missingPaths.push(`${apiPath}  (file: ${path.relative(REPO_ROOT, file)})`);
      }
    }

    expect(missingPaths).toEqual(
      /* istanbul ignore next */ [],
      // If this fails: run `npm run openapi` to regenerate the spec.
      // Missing: \n${missingPaths.join("\n")}
    );
    if (missingPaths.length > 0) {
      throw new Error(
        `${missingPaths.length} route(s) missing from spec. Run \`npm run openapi\` to regenerate.\n\n` +
          missingPaths.map((p) => `  MISSING: ${p}`).join("\n"),
      );
    }
  });

  it("every exported HTTP method is documented in the spec", () => {
    const missingMethods: string[] = [];

    for (const file of routeFiles) {
      const apiPath = deriveOpenApiPath(file);
      const methods = getExportedMethods(file);
      if (methods.length === 0) continue;

      const pathItem = spec.paths[apiPath];
      if (!pathItem) continue; // already caught above

      for (const method of methods) {
        if (!pathItem[method.toLowerCase()]) {
          missingMethods.push(
            `${method} ${apiPath}  (file: ${path.relative(REPO_ROOT, file)})`,
          );
        }
      }
    }

    if (missingMethods.length > 0) {
      throw new Error(
        `${missingMethods.length} method(s) missing from spec. Run \`npm run openapi\` to regenerate.\n\n` +
          missingMethods.map((m) => `  MISSING: ${m}`).join("\n"),
      );
    }
  });

  it("spec contains no phantom paths (paths without any route.ts source)", () => {
    const liveApiPaths = new Set(
      routeFiles
        .map((f) => ({ path: deriveOpenApiPath(f), methods: getExportedMethods(f) }))
        .filter((r) => r.methods.length > 0)
        .map((r) => r.path),
    );

    const phantomPaths = Object.keys(spec.paths).filter((p) => !liveApiPaths.has(p));

    if (phantomPaths.length > 0) {
      throw new Error(
        `${phantomPaths.length} path(s) in spec have no route.ts source. Run \`npm run openapi\` to regenerate.\n\n` +
          phantomPaths.map((p) => `  PHANTOM: ${p}`).join("\n"),
      );
    }
  });
});
