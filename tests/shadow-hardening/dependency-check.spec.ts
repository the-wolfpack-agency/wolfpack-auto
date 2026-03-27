import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/**
 * Static analysis tests for dependency hygiene.
 * No server required — these inspect package.json and lockfile directly.
 */

const ROOT = path.resolve(__dirname, "../..");
const PKG_PATH = path.join(ROOT, "package.json");

// Packages known to be deprecated or abandoned — add as needed
const DEPRECATED_PACKAGES = [
  "request",
  "node-uuid",
  "nomnom",
  "node-sass",
  "popper.js",
  "querystring",
  "tinycolor",
  "jade",
  "formidable",
  "har-validator",
  "uuid-js",
];

function readPackageJson(): Record<string, unknown> {
  const raw = fs.readFileSync(PKG_PATH, "utf-8");
  return JSON.parse(raw);
}

function allDeps(
  pkg: Record<string, unknown>
): Record<string, string> {
  return {
    ...((pkg.dependencies as Record<string, string>) || {}),
    ...((pkg.devDependencies as Record<string, string>) || {}),
    ...((pkg.optionalDependencies as Record<string, string>) || {}),
  };
}

test.describe("Dependency check", () => {
  let pkg: Record<string, unknown>;
  let deps: Record<string, string>;

  test.beforeAll(() => {
    pkg = readPackageJson();
    deps = allDeps(pkg);
  });

  test("no wildcard (*) version ranges", () => {
    const wildcards = Object.entries(deps).filter(
      ([, ver]) => ver.trim() === "*"
    );
    expect(
      wildcards,
      `Wildcard versions found: ${wildcards.map(([n]) => n).join(", ")}`
    ).toHaveLength(0);
  });

  test("no http:// URLs in dependency specifiers", () => {
    const httpDeps = Object.entries(deps).filter(([, ver]) =>
      ver.startsWith("http://")
    );
    expect(
      httpDeps,
      `Insecure http:// URLs: ${httpDeps.map(([n]) => n).join(", ")}`
    ).toHaveLength(0);
  });

  test("no deprecated packages", () => {
    const found = Object.keys(deps).filter((name) =>
      DEPRECATED_PACKAGES.includes(name)
    );
    expect(
      found,
      `Deprecated packages found: ${found.join(", ")}`
    ).toHaveLength(0);
  });

  test("lockfile (package-lock.json) exists", () => {
    const lockPath = path.join(ROOT, "package-lock.json");
    expect(
      fs.existsSync(lockPath),
      "package-lock.json must exist — run npm install"
    ).toBe(true);
  });

  test("no git:// protocol dependencies (prefer https)", () => {
    const gitProto = Object.entries(deps).filter(([, ver]) =>
      ver.startsWith("git://")
    );
    expect(
      gitProto,
      `Insecure git:// URLs: ${gitProto.map(([n]) => n).join(", ")}`
    ).toHaveLength(0);
  });

  test("no file: dependencies in production deps", () => {
    const prodDeps = (pkg.dependencies as Record<string, string>) || {};
    const fileDeps = Object.entries(prodDeps).filter(([, ver]) =>
      ver.startsWith("file:")
    );
    expect(
      fileDeps,
      `file: dependencies in production: ${fileDeps.map(([n]) => n).join(", ")}`
    ).toHaveLength(0);
  });
});
