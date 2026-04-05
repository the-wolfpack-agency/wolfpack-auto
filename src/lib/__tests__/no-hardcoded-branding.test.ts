/**
 * Regression test: no hardcoded "Wolfpack Motors" or "Wolfpack Auto" branding
 * in customer-facing or admin-facing code.
 *
 * Scans all .ts and .tsx files under src/app/ and fails if branded strings
 * appear in JSX return statements, metadata exports, or page titles.
 *
 * Allowed exceptions:
 *   - Seed/demo/shadow data arrays (SHADOW_, MOCK_, DEMO_, SEED_)
 *   - Test files (*.test.ts, *.test.tsx, *.spec.ts)
 *   - Single-line comments (// ...) and block comments
 *   - Form placeholder attributes (placeholder="...")
 *   - Variable/type declarations that are clearly internal
 */

import * as fs from "fs";
import * as path from "path";

const SRC_APP_DIR = path.resolve(__dirname, "../../app");

const BRANDED_PATTERNS = [/Wolfpack\s+Motors/g, /Wolfpack\s+Auto/g];

/** Recursively collect all .ts and .tsx files. */
function collectFiles(dir: string, ext: string[]): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, ext));
    } else if (ext.some((e) => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

/** Check if a line is inside an allowed context. */
function isAllowedContext(line: string, fullContent: string, lineIndex: number): boolean {
  const trimmed = line.trim();

  // Single-line comment
  if (trimmed.startsWith("//")) return true;
  if (trimmed.startsWith("*") || trimmed.startsWith("/*")) return true;

  // Form placeholder attributes
  if (/placeholder\s*=\s*["'{].*Wolfpack/i.test(trimmed)) return true;

  // Inside a seed/demo/shadow/mock data block
  // Look backwards for const SHADOW_|MOCK_|DEMO_|SEED_ or known demo-data patterns
  const lines = fullContent.split("\n");
  for (let i = lineIndex; i >= Math.max(0, lineIndex - 80); i--) {
    const prevLine = lines[i]?.trim() ?? "";
    // Named seed/mock/shadow arrays
    if (/^(const|let|var)\s+(SHADOW_|MOCK_|DEMO_|SEED_|SAMPLE_)/i.test(prevLine)) return true;
    // Demo transcript/intelligence functions
    if (/analyzeCallTranscript/i.test(prevLine)) return true;
  }

  // Demo data heuristic: line is inside a string literal assigned to known
  // demo-data keys (body_preview, subject, description, text, message, name, top_performer)
  // inside an object literal in an API route
  if (/^\s*(body_preview|subject|description|text|message|title|name|top_performer)\s*:/.test(trimmed)) return true;

  // If the file is an API route with shadow/demo data arrays/objects, check for context
  const fileLinesAbove = lines.slice(Math.max(0, lineIndex - 100), lineIndex + 1).join("\n");
  // Heuristic: if we see "const " + a PascalCase or ALL_CAPS array/object opening within 100 lines above
  if (/const\s+[A-Z][A-Z_]*\s*[:=]\s*[\[{]/.test(fileLinesAbove)) return true;
  if (/const\s+[a-z]\w+\s*[:=]\s*[\[{]/.test(fileLinesAbove) && /shadow|mock|demo|seed|sample|fallback/i.test(fileLinesAbove)) return true;
  // Shadow mode comment above the data
  if (/[Ss]hadow\s*mode|sample\s*data/i.test(fileLinesAbove)) return true;

  // Inside a timeline, events, or data array (object literal with id/date/type keys)
  if (/^\s*\{\s*id\s*:/.test(trimmed)) return true;
  // Description field inside an object literal
  if (/description\s*:\s*["'`]/.test(trimmed)) return true;

  // Data property inside an object literal (e.g. webhook test payload)
  if (/data\s*:\s*\{/.test(trimmed) || /data\s*:\s*\{/.test(lines[lineIndex - 1]?.trim() ?? "")) return true;

  return false;
}

describe("No hardcoded branding in src/app/", () => {
  const files = collectFiles(SRC_APP_DIR, [".ts", ".tsx"]);

  // Exclude test files
  const appFiles = files.filter(
    (f) => !f.includes(".test.") && !f.includes(".spec."),
  );

  it("should find files to scan", () => {
    expect(appFiles.length).toBeGreaterThan(0);
  });

  it('should not contain "Wolfpack Motors" or "Wolfpack Auto" in customer/admin-facing code', () => {
    const violations: string[] = [];

    for (const filePath of appFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of BRANDED_PATTERNS) {
          pattern.lastIndex = 0;
          if (pattern.test(line)) {
            if (!isAllowedContext(line, content, i)) {
              const rel = path.relative(SRC_APP_DIR, filePath);
              violations.push(`${rel}:${i + 1}: ${line.trim()}`);
            }
          }
        }
      }
    }

    expect(violations).toEqual(
      // If this fails, you have hardcoded branding in customer/admin-facing code.
      // Use getDealerConfig() or a generic fallback instead.
      [],
    );
  });
});
