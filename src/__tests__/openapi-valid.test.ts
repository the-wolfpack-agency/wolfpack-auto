/**
 * openapi-valid.test.ts — Structural validation for public/openapi.json.
 *
 * Asserts:
 *  - Top-level OpenAPI 3.1.x structure is present and correct.
 *  - Every path object has at least one method with a summary and responses.
 *  - components.securitySchemes.bearerAuth is defined.
 *  - No external validator needed — all checks are hand-rolled structural assertions.
 *
 * Run with: npx jest src/__tests__/openapi-valid.test.ts
 */

import * as fs from "fs";
import * as path from "path";

const SPEC_PATH = path.resolve(__dirname, "../../public/openapi.json");

interface OpenApiSpec {
  openapi: string;
  info: {
    title?: string;
    version?: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  components?: {
    securitySchemes?: {
      bearerAuth?: {
        type?: string;
        scheme?: string;
      };
    };
  };
  paths: Record<
    string,
    Record<
      string,
      {
        summary?: string;
        tags?: string[];
        security?: Array<Record<string, string[]>>;
        responses?: Record<string, { description: string }>;
        [key: string]: unknown;
      }
    >
  >;
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options"];

describe("OpenAPI spec validity", () => {
  let spec: OpenApiSpec;

  beforeAll(() => {
    expect(fs.existsSync(SPEC_PATH)).toBe(true);
    spec = JSON.parse(fs.readFileSync(SPEC_PATH, "utf-8")) as OpenApiSpec;
  });

  /* -- Top-level structure ------------------------------------------------- */

  it("openapi version is 3.1.x", () => {
    expect(spec.openapi).toMatch(/^3\.1\./);
  });

  it("info.title is present and non-empty", () => {
    expect(typeof spec.info.title).toBe("string");
    expect(spec.info.title!.length).toBeGreaterThan(0);
  });

  it("info.version is present and non-empty", () => {
    expect(typeof spec.info.version).toBe("string");
    expect(spec.info.version!.length).toBeGreaterThan(0);
  });

  it("servers array is present and has at least one entry", () => {
    expect(Array.isArray(spec.servers)).toBe(true);
    expect(spec.servers!.length).toBeGreaterThan(0);
    expect(typeof spec.servers![0].url).toBe("string");
  });

  it("paths is a non-empty object", () => {
    expect(spec.paths).toBeTruthy();
    expect(typeof spec.paths).toBe("object");
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
  });

  /* -- SecuritySchemes ----------------------------------------------------- */

  it("components.securitySchemes.bearerAuth is defined", () => {
    expect(spec.components).toBeTruthy();
    expect(spec.components!.securitySchemes).toBeTruthy();
    const bearerAuth = spec.components!.securitySchemes!.bearerAuth;
    expect(bearerAuth).toBeTruthy();
    expect(bearerAuth!.type).toBe("http");
    expect(bearerAuth!.scheme).toBe("bearer");
  });

  /* -- Per-path / per-operation checks ------------------------------------ */

  it("every path starts with /api/", () => {
    const badPaths = Object.keys(spec.paths).filter((p) => !p.startsWith("/api/"));
    expect(badPaths).toEqual([]);
  });

  it("every path has at least one documented HTTP method", () => {
    const emptyPaths: string[] = [];
    for (const [apiPath, pathItem] of Object.entries(spec.paths)) {
      const hasMethods = HTTP_METHODS.some((m) => pathItem[m] !== undefined);
      if (!hasMethods) emptyPaths.push(apiPath);
    }
    expect(emptyPaths).toEqual([]);
  });

  it("every operation has a non-empty summary", () => {
    const missingSummary: string[] = [];
    for (const [apiPath, pathItem] of Object.entries(spec.paths)) {
      for (const method of HTTP_METHODS) {
        const op = pathItem[method];
        if (!op) continue;
        if (!op.summary || op.summary.trim().length === 0) {
          missingSummary.push(`${method.toUpperCase()} ${apiPath}`);
        }
      }
    }
    expect(missingSummary).toEqual([]);
  });

  it("every operation has a responses object with at least one response code", () => {
    const missingResponses: string[] = [];
    for (const [apiPath, pathItem] of Object.entries(spec.paths)) {
      for (const method of HTTP_METHODS) {
        const op = pathItem[method];
        if (!op) continue;
        if (!op.responses || Object.keys(op.responses).length === 0) {
          missingResponses.push(`${method.toUpperCase()} ${apiPath}`);
        }
      }
    }
    expect(missingResponses).toEqual([]);
  });

  it("every operation has a tags array with at least one tag", () => {
    const missingTags: string[] = [];
    for (const [apiPath, pathItem] of Object.entries(spec.paths)) {
      for (const method of HTTP_METHODS) {
        const op = pathItem[method];
        if (!op) continue;
        if (!Array.isArray(op.tags) || op.tags.length === 0) {
          missingTags.push(`${method.toUpperCase()} ${apiPath}`);
        }
      }
    }
    expect(missingTags).toEqual([]);
  });

  /* -- Aggregate stats (informational, not blocking) ----------------------- */

  it("documents at least 200 paths", () => {
    expect(Object.keys(spec.paths).length).toBeGreaterThanOrEqual(200);
  });

  it("at least 50% of paths require auth (sanity check for auth detection)", () => {
    const pathItems = Object.values(spec.paths);
    let authCount = 0;
    let totalOps = 0;

    for (const pathItem of pathItems) {
      for (const method of HTTP_METHODS) {
        const op = pathItem[method];
        if (!op) continue;
        totalOps++;
        if (op.security && op.security.length > 0) authCount++;
      }
    }

    const ratio = authCount / totalOps;
    expect(ratio).toBeGreaterThanOrEqual(0.5);
  });
});
