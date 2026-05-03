/**
 * Zero-token security hardening scanner for the wolfpack-auto platform.
 *
 * Pure static analysis — reads source files via fs, applies regex-based
 * pattern matching, and returns structured findings. No LLM tokens consumed.
 *
 * Categories scanned:
 *   1. Hardcoded secrets (API keys, passwords, tokens, fallback secrets)
 *   2. Rate limiting coverage (API routes missing rate limit checks)
 *   3. Input validation coverage (routes using request.json() without Zod)
 *   4. Shadow mode coverage (auth'd routes not checking DATABASE_URL)
 *   5. SSRF vectors (fetch() with potentially user-controlled URLs)
 *   6. Auth guard coverage (admin routes missing requireAuth)
 *   7. CSRF protection (mutation routes missing CSRF checks)
 *   8. Content-Length limits (routes not limiting request body size)
 *   9. SQL injection risk (string concatenation in queries)
 *  10. Sensitive data exposure (SSN, credit card patterns in logs/responses)
 */

import * as fs from "fs";
import * as path from "path";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export type FindingCategory =
  | "hardcoded_secrets"
  | "rate_limiting"
  | "input_validation"
  | "shadow_mode"
  | "ssrf"
  | "auth_guard"
  | "csrf"
  | "content_length"
  | "sql_injection"
  | "sensitive_data";

export interface SecurityFinding {
  category: FindingCategory;
  severity: FindingSeverity;
  file: string;
  line: number;
  description: string;
  recommendation: string;
}

export interface ScanResult {
  timestamp: string;
  duration_ms: number;
  total_findings: number;
  by_severity: Record<FindingSeverity, number>;
  by_category: Record<FindingCategory, number>;
  findings: SecurityFinding[];
  files_scanned: number;
}

/* -------------------------------------------------------------------------- */
/* File discovery                                                             */
/* -------------------------------------------------------------------------- */

function collectFiles(dir: string, ext: string[] = [".ts", ".tsx"]): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) return results;

  function walk(d: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules, .next, test fixtures
        if (
          entry.name === "node_modules" ||
          entry.name === ".next" ||
          entry.name === "dist" ||
          entry.name === "coverage"
        ) {
          continue;
        }
        walk(full);
      } else if (ext.some((e) => entry.name.endsWith(e))) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}

/* -------------------------------------------------------------------------- */
/* Individual scanners                                                        */
/* -------------------------------------------------------------------------- */

function scanHardcodedSecrets(
  file: string,
  content: string,
  lines: string[],
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const patterns: Array<{
    regex: RegExp;
    desc: string;
    severity: FindingSeverity;
  }> = [
    {
      regex: /NEXTAUTH_SECRET\s*\|\|\s*["']/,
      desc: "NEXTAUTH_SECRET has a hardcoded fallback value",
      severity: "critical",
    },
    {
      regex: /(?:api[_-]?key|apikey|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9+/=_-]{8,}["']/i,
      desc: "Potential hardcoded secret (API key, password, or token)",
      severity: "high",
    },
    {
      regex: /Bearer\s+[A-Za-z0-9._-]{20,}/,
      desc: "Hardcoded Bearer token found",
      severity: "high",
    },
    {
      regex: /(?:sk|pk)[-_](?:live|test)[-_][a-zA-Z0-9]{10,}/,
      desc: "Stripe-style API key found in source",
      severity: "critical",
    },
    {
      regex: /ghp_[a-zA-Z0-9]{36}/,
      desc: "GitHub personal access token found in source",
      severity: "critical",
    },
  ];

  for (const { regex, desc, severity } of patterns) {
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        // Skip test files and comments
        if (file.includes("__tests__") || file.includes(".test.") || file.includes(".spec.")) continue;
        if (lines[i].trim().startsWith("//") || lines[i].trim().startsWith("*")) continue;
        // Skip env var reads like process.env.X
        if (/process\.env\.\w+/.test(lines[i]) && !regex.test(lines[i].replace(/process\.env\.\w+/g, ""))) continue;

        findings.push({
          category: "hardcoded_secrets",
          severity,
          file,
          line: i + 1,
          description: desc,
          recommendation:
            "Move secrets to environment variables. Use process.env and Vercel env var management.",
        });
      }
    }
  }

  return findings;
}

function scanRateLimiting(
  file: string,
  content: string,
  lines: string[],
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  // Only check route.ts files under api/admin
  if (!file.includes("/api/admin/") || !file.endsWith("route.ts")) return findings;

  const hasPOST = /export\s+async\s+function\s+POST/.test(content);
  const hasPATCH = /export\s+async\s+function\s+PATCH/.test(content);
  const hasDELETE = /export\s+async\s+function\s+DELETE/.test(content);
  const hasMutation = hasPOST || hasPATCH || hasDELETE;
  const hasRateLimit =
    /checkRateLimit/.test(content) || /rate.?limit/i.test(content);

  if (hasMutation && !hasRateLimit) {
    findings.push({
      category: "rate_limiting",
      severity: "medium",
      file,
      line: 1,
      description: `Mutation endpoint (POST/PATCH/DELETE) has no rate limiting`,
      recommendation:
        'Import checkRateLimit from "@/lib/rate-limit" and apply before processing. Pattern: const rl = await checkRateLimit(`route:${dealerId}`, limit, windowSec)',
    });
  }

  return findings;
}

function scanInputValidation(
  file: string,
  content: string,
  lines: string[],
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (!file.endsWith("route.ts")) return findings;

  const usesRequestJson = /request\.json\(\)/.test(content);
  const hasZod = /from\s+["']zod["']/.test(content) || /z\.object/.test(content);
  const hasManualValidation =
    /if\s*\(\s*!body\./.test(content) ||
    /if\s*\(\s*!.*\.trim\(\)/.test(content) ||
    /typeof\s+\w+\s*!==?\s*["']string["']/.test(content);

  if (usesRequestJson && !hasZod && !hasManualValidation) {
    for (let i = 0; i < lines.length; i++) {
      if (/request\.json\(\)/.test(lines[i])) {
        findings.push({
          category: "input_validation",
          severity: "high",
          file,
          line: i + 1,
          description:
            "Route parses request.json() without Zod schema validation or manual field checks",
          recommendation:
            "Add Zod schema validation at the top of the handler. Define a z.object({...}) schema and call schema.parse(body).",
        });
        break;
      }
    }
  }

  return findings;
}

function scanShadowMode(
  file: string,
  content: string,
  lines: string[],
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (!file.includes("/api/admin/") || !file.endsWith("route.ts")) return findings;

  const hasAuth = /requireAuth/.test(content);
  const hasDbCheck = /DATABASE_URL/.test(content) || /process\.env\.DATABASE_URL/.test(content);

  if (hasAuth && !hasDbCheck) {
    findings.push({
      category: "shadow_mode",
      severity: "info",
      file,
      line: 1,
      description:
        "Auth'd route does not check DATABASE_URL — no shadow/mock fallback mode",
      recommendation:
        'Add `if (process.env.DATABASE_URL) { /* DB path */ }` with a mock data fallback for shadow mode.',
    });
  }

  return findings;
}

function scanSSRF(
  file: string,
  content: string,
  lines: string[],
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (file.includes("__tests__") || file.includes(".test.") || file.includes(".spec.")) return findings;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

    // Look for fetch() with template literals or variable URLs
    if (/fetch\s*\(\s*`/.test(line) || /fetch\s*\(\s*\w+(?!\s*,)/.test(line)) {
      // Skip known safe external APIs.
      //
      // We extract the URL host from the line and compare it against the
      // allowlist with proper hostname semantics — anchored equality plus
      // ".host" suffix — so a line like fetch(`https://attacker.com/api.resend.com/...`)
      // does NOT match. CodeQL js/regex/missing-regexp-anchor would (correctly)
      // flag the previous /host/.test(line) substring approach.
      const SAFE_HOSTS = [
        "api.resend.com",
        "api.twilio.com",
        "plausible.io",
        "api.nhtsa.dot.gov",
        "ai-gateway.vercel.sh",
      ];
      const hostMatch = line.match(/https?:\/\/([A-Za-z0-9.\-]+)/);
      if (hostMatch) {
        const host = hostMatch[1].toLowerCase();
        const allowed = SAFE_HOSTS.some(
          (h) => host === h || host.endsWith("." + h),
        );
        if (allowed) continue;
      }

      // Check if the URL contains user-controlled input
      if (/\$\{.*body|params|query|searchParams|url/.test(line)) {
        findings.push({
          category: "ssrf",
          severity: "high",
          file,
          line: i + 1,
          description:
            "fetch() call uses user-controlled input in URL — potential SSRF vector",
          recommendation:
            "Validate and allowlist destination URLs. Use URL parsing to ensure the host is on an approved list. Never pass raw user input as a URL.",
        });
      }
    }
  }

  return findings;
}

function scanAuthGuard(
  file: string,
  content: string,
  lines: string[],
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (!file.includes("/api/admin/") || !file.endsWith("route.ts")) return findings;

  const hasAuth =
    /requireAuth/.test(content) || /requireRole/.test(content);

  if (!hasAuth) {
    findings.push({
      category: "auth_guard",
      severity: "critical",
      file,
      line: 1,
      description:
        "Admin API route does not call requireAuth() or requireRole() — unauthenticated access possible",
      recommendation:
        'Import { requireAuth, isAuthenticated } from "@/lib/auth-guard" and call at the top of every handler.',
    });
  }

  return findings;
}

function scanCSRF(
  file: string,
  content: string,
  lines: string[],
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (!file.endsWith("route.ts")) return findings;

  const hasMutation =
    /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)/.test(content);
  const hasCSRF =
    /validateCSRFToken/.test(content) ||
    /csrf/i.test(content) ||
    /x-csrf-token/i.test(content);

  // Only flag admin routes for CSRF since public routes (like /api/leads) may
  // intentionally skip CSRF for cross-origin form submissions
  if (file.includes("/api/admin/") && hasMutation && !hasCSRF) {
    findings.push({
      category: "csrf",
      severity: "low",
      file,
      line: 1,
      description:
        "Mutation route (POST/PUT/PATCH/DELETE) has no CSRF token validation",
      recommendation:
        "For browser-facing mutation routes, validate the X-CSRF-Token header against the csrf cookie. JWT-authenticated API clients are inherently CSRF-safe.",
    });
  }

  return findings;
}

function scanContentLength(
  file: string,
  content: string,
  lines: string[],
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (!file.endsWith("route.ts")) return findings;

  const hasPost = /export\s+async\s+function\s+POST/.test(content);
  const hasPatch = /export\s+async\s+function\s+PATCH/.test(content);
  const parsesBody = /request\.json\(\)/.test(content) || /request\.formData\(\)/.test(content);
  const hasBodyLimit =
    /content-length/i.test(content) ||
    /maxBytes/.test(content) ||
    /parseBody/.test(content) ||
    /PayloadTooLarge/.test(content);

  if ((hasPost || hasPatch) && parsesBody && !hasBodyLimit) {
    findings.push({
      category: "content_length",
      severity: "low",
      file,
      line: 1,
      description:
        "Route parses request body without checking Content-Length limit — large payloads accepted",
      recommendation:
        'Use parseBody() from "@/lib/request-guard" which enforces a 1MB default limit, or check Content-Length header manually.',
    });
  }

  return findings;
}

function scanSQLInjection(
  file: string,
  content: string,
  lines: string[],
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (file.includes("__tests__") || file.includes(".test.") || file.includes(".spec.")) return findings;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

    // Look for string concatenation in SQL queries
    if (
      /query\s*\(\s*`[^`]*\$\{(?!idx|conditions|params)/.test(line) ||
      /query\s*\(\s*["'][^"']*["']\s*\+\s*\w+/.test(line)
    ) {
      // Skip safe patterns (parameterized index references like $${idx++})
      if (/\$\$\{idx/.test(line) || /\$\{idx/.test(line) || /\$\{conditions/.test(line)) continue;

      findings.push({
        category: "sql_injection",
        severity: "critical",
        file,
        line: i + 1,
        description:
          "Potential SQL injection — string interpolation/concatenation in query instead of parameterized query",
        recommendation:
          "Use parameterized queries with $1, $2, ... placeholders. Never concatenate user input into SQL strings.",
      });
    }
  }

  return findings;
}

function scanSensitiveData(
  file: string,
  content: string,
  lines: string[],
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  if (file.includes("__tests__") || file.includes(".test.") || file.includes(".spec.")) return findings;

  const sensitivePatterns: Array<{
    regex: RegExp;
    desc: string;
    severity: FindingSeverity;
  }> = [
    {
      regex: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/,
      desc: "Possible SSN pattern in source (XXX-XX-XXXX)",
      severity: "high",
    },
    {
      regex: /\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))\s*[-.\s]?\d{4}\s*[-.\s]?\d{4}\s*[-.\s]?\d{4}\b/,
      desc: "Possible credit card number pattern in source",
      severity: "critical",
    },
  ];

  for (const { regex, desc, severity } of sensitivePatterns) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith("//") || lines[i].trim().startsWith("*")) continue;
      // Skip mock data VINs and IDs that happen to match numeric patterns
      if (/vin|stock|ro_number|id|phone|zip/i.test(lines[i])) continue;

      if (regex.test(lines[i])) {
        // Additional check: skip if it's in a variable name or comment
        const trimmed = lines[i].trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;

        findings.push({
          category: "sensitive_data",
          severity,
          file,
          line: i + 1,
          description: desc,
          recommendation:
            "Ensure sensitive data (SSNs, credit card numbers) is masked/encrypted in logs, responses, and source. Use @/lib/crypto for encryption and @/lib/vin-masking for PII masking.",
        });
      }
    }
  }

  // Check for console.log that might leak sensitive data
  for (let i = 0; i < lines.length; i++) {
    if (
      /console\.(log|info|debug)\s*\(.*(?:password|ssn|credit_card|social_security|secret)/i.test(
        lines[i],
      )
    ) {
      findings.push({
        category: "sensitive_data",
        severity: "high",
        file,
        line: i + 1,
        description: "Console logging may expose sensitive data (password, SSN, credit card)",
        recommendation:
          "Remove sensitive data from log statements. Use structured logging that automatically redacts PII.",
      });
    }
  }

  return findings;
}

/* -------------------------------------------------------------------------- */
/* Main scanner                                                               */
/* -------------------------------------------------------------------------- */

export function runSecurityScan(rootDir?: string): ScanResult {
  const start = Date.now();
  const scanRoot = rootDir ?? path.resolve(__dirname, "..");

  const files = collectFiles(scanRoot);
  const allFindings: SecurityFinding[] = [];

  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    const relFile = path.relative(scanRoot, file);

    const scanners = [
      scanHardcodedSecrets,
      scanRateLimiting,
      scanInputValidation,
      scanShadowMode,
      scanSSRF,
      scanAuthGuard,
      scanCSRF,
      scanContentLength,
      scanSQLInjection,
      scanSensitiveData,
    ];

    for (const scanner of scanners) {
      const results = scanner(file, content, lines);
      // Use relative paths in output
      for (const finding of results) {
        finding.file = relFile;
      }
      allFindings.push(...results);
    }
  }

  // Compute summaries
  const bySeverity: Record<FindingSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  const byCategory: Record<FindingCategory, number> = {
    hardcoded_secrets: 0,
    rate_limiting: 0,
    input_validation: 0,
    shadow_mode: 0,
    ssrf: 0,
    auth_guard: 0,
    csrf: 0,
    content_length: 0,
    sql_injection: 0,
    sensitive_data: 0,
  };

  for (const f of allFindings) {
    bySeverity[f.severity]++;
    byCategory[f.category]++;
  }

  return {
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - start,
    total_findings: allFindings.length,
    by_severity: bySeverity,
    by_category: byCategory,
    findings: allFindings,
    files_scanned: files.length,
  };
}
