#!/usr/bin/env node
/**
 * generate-shadow-report.mjs
 *
 * Reads shadow-hardening-results.json (Playwright JSON reporter output)
 * and generates a standalone shadow-hardening-report.html with dark theme.
 *
 * No external dependencies — uses only Node.js built-ins.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const INPUT = resolve(ROOT, "shadow-hardening-results.json");
const OUTPUT = resolve(ROOT, "shadow-hardening-report.html");

// ── Theme tokens ───────────────────────────────────────────────────────
const C = {
  bg: "#0f1117",
  surface: "#1a1d27",
  surfaceHover: "#22252f",
  border: "#2a2d37",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  pass: "#22c55e",
  fail: "#ef4444",
  skip: "#eab308",
  accent: "#6366f1",
};

// ── Spec-file friendly names ───────────────────────────────────────────
const FRIENDLY = {
  "security-headers": "Security Headers",
  seo: "SEO",
  links: "Links",
  xss: "XSS",
  performance: "Performance",
  accessibility: "Accessibility",
  mobile: "Mobile",
  analytics: "Analytics",
  api: "API",
  forms: "Forms",
};

function friendlyName(specTitle) {
  const base = specTitle.replace(/\.spec\.ts$/, "").replace(/\.test\.ts$/, "");
  for (const [key, label] of Object.entries(FRIENDLY)) {
    if (base.toLowerCase().includes(key)) return label;
  }
  // Fallback: title-case the filename
  return base
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Collect tests from Playwright JSON structure ───────────────────────
function collectTests(suites, parentFile = "") {
  const groups = {}; // fileLabel -> { describe -> [tests] }

  function walk(suite, fileLabel) {
    const label = fileLabel || friendlyName(suite.title || "Unknown");

    if (suite.specs) {
      for (const spec of suite.specs) {
        const describeTitle = suite.title || "Ungrouped";
        const key = `${label}|||${describeTitle}`;
        if (!groups[key]) groups[key] = [];

        for (const test of spec.tests || []) {
          const result = (test.results || [])[test.results.length - 1] || {};
          groups[key].push({
            name: spec.title,
            status: result.status || "skipped",
            duration: result.duration || 0,
            error:
              result.status === "failed" || result.status === "unexpected"
                ? (result.error?.message || result.error?.snippet || "")
                : "",
          });
        }
      }
    }

    if (suite.suites) {
      for (const child of suite.suites) {
        walk(child, label);
      }
    }
  }

  for (const s of suites) {
    walk(s, "");
  }

  // Restructure into ordered sections
  const sections = {};
  for (const [key, tests] of Object.entries(groups)) {
    const [fileLabel, describeTitle] = key.split("|||");
    if (!sections[fileLabel]) sections[fileLabel] = [];
    sections[fileLabel].push({ describe: describeTitle, tests });
  }
  return sections;
}

// ── Badge / icon helpers ───────────────────────────────────────────────
function statusIcon(status) {
  if (status === "passed" || status === "expected")
    return `<span style="color:${C.pass};font-size:1.1em;">&#10003;</span>`;
  if (status === "failed" || status === "unexpected")
    return `<span style="color:${C.fail};font-size:1.1em;">&#10007;</span>`;
  return `<span style="color:${C.skip};font-size:1.1em;">&#9644;</span>`;
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ms(d) {
  if (d < 1000) return `${Math.round(d)}ms`;
  return `${(d / 1000).toFixed(2)}s`;
}

// ── Build HTML ─────────────────────────────────────────────────────────
function buildReport(data) {
  const stats = data.stats || {};
  const passed = stats.expected || 0;
  const failed = stats.unexpected || 0;
  const skipped = stats.skipped || 0;
  const flaky = stats.flaky || 0;
  const total = passed + failed + skipped + flaky;
  const duration = stats.duration || 0;
  const allPassed = failed === 0;

  const sections = collectTests(data.suites || []);

  const badgeColor = allPassed ? C.pass : C.fail;
  const badgeText = allPassed ? "ALL TESTS PASSED" : `${failed} TEST${failed !== 1 ? "S" : ""} FAILED`;

  let sectionsHtml = "";
  for (const [fileLabel, groups] of Object.entries(sections)) {
    let groupHtml = "";
    for (const { describe, tests } of groups) {
      let rows = "";
      for (const t of tests) {
        const statusClass =
          t.status === "passed" || t.status === "expected"
            ? "pass"
            : t.status === "failed" || t.status === "unexpected"
              ? "fail"
              : "skip";
        rows += `
          <div class="test-row ${statusClass}">
            <div class="test-icon">${statusIcon(t.status)}</div>
            <div class="test-name">${esc(t.name)}</div>
            <div class="test-duration">${ms(t.duration)}</div>
          </div>
          ${t.error ? `<div class="test-error"><pre>${esc(t.error)}</pre></div>` : ""}`;
      }
      groupHtml += `
        <div class="describe-group">
          <div class="describe-title">${esc(describe)}</div>
          ${rows}
        </div>`;
    }

    sectionsHtml += `
      <div class="section">
        <h2 class="section-title">${esc(fileLabel)}</h2>
        ${groupHtml}
      </div>`;
  }

  const now = new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Shadow Hardening Report — Wolfpack Auto</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{
  font-family:'Inter',system-ui,-apple-system,sans-serif;
  background:${C.bg};
  color:${C.text};
  line-height:1.6;
  padding:2rem;
}
.container{max-width:960px;margin:0 auto;}
h1{font-size:1.75rem;font-weight:700;margin-bottom:0.5rem;}
.subtitle{color:${C.textMuted};font-size:0.9rem;margin-bottom:2rem;}

/* Badge */
.badge{
  display:inline-block;
  padding:0.6rem 1.8rem;
  border-radius:8px;
  font-size:1.1rem;
  font-weight:700;
  letter-spacing:0.04em;
  margin-bottom:2rem;
  background:${badgeColor}22;
  color:${badgeColor};
  border:2px solid ${badgeColor};
}

/* Stats row */
.stats{
  display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:2.5rem;
}
.stat-card{
  background:${C.surface};
  border:1px solid ${C.border};
  border-radius:10px;
  padding:1rem 1.4rem;
  min-width:130px;
  flex:1;
}
.stat-value{font-size:1.5rem;font-weight:700;}
.stat-label{font-size:0.78rem;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.06em;}

/* Sections */
.section{
  background:${C.surface};
  border:1px solid ${C.border};
  border-radius:10px;
  padding:1.5rem;
  margin-bottom:1.5rem;
}
.section-title{font-size:1.15rem;font-weight:600;margin-bottom:1rem;color:${C.accent};}
.describe-group{margin-bottom:1rem;}
.describe-title{font-size:0.85rem;font-weight:600;color:${C.textMuted};margin-bottom:0.4rem;padding-left:0.25rem;}

/* Test rows */
.test-row{
  display:flex;align-items:center;gap:0.75rem;
  padding:0.45rem 0.5rem;border-radius:6px;
  transition:background 0.15s;
}
.test-row:hover{background:${C.surfaceHover};}
.test-icon{width:1.4rem;text-align:center;flex-shrink:0;}
.test-name{flex:1;font-size:0.88rem;}
.test-duration{font-size:0.78rem;color:${C.textMuted};flex-shrink:0;}
.test-error{
  margin:0.25rem 0 0.5rem 2.15rem;
  background:#1c1012;
  border:1px solid ${C.fail}44;
  border-radius:6px;
  padding:0.75rem;
  overflow-x:auto;
}
.test-error pre{
  font-size:0.78rem;
  color:${C.fail};
  white-space:pre-wrap;
  word-break:break-word;
  font-family:'Inter',monospace;
}

/* Footer */
.footer{
  margin-top:2rem;
  padding-top:1rem;
  border-top:1px solid ${C.border};
  font-size:0.78rem;
  color:${C.textMuted};
  display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;
}
</style>
</head>
<body>
<div class="container">
  <h1>Shadow Hardening Report &mdash; Wolfpack Auto</h1>
  <div class="subtitle">Automated security, SEO, accessibility &amp; performance hardening tests</div>

  <div class="badge">${badgeText}</div>

  <div class="stats">
    <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Total Tests</div></div>
    <div class="stat-card"><div class="stat-value" style="color:${C.pass}">${passed}</div><div class="stat-label">Passed</div></div>
    <div class="stat-card"><div class="stat-value" style="color:${C.fail}">${failed}</div><div class="stat-label">Failed</div></div>
    <div class="stat-card"><div class="stat-value" style="color:${C.skip}">${skipped}</div><div class="stat-label">Skipped</div></div>
    <div class="stat-card"><div class="stat-value">${ms(duration)}</div><div class="stat-label">Duration</div></div>
  </div>

  ${sectionsHtml}

  <div class="footer">
    <span>Generated: ${now}</span>
    <span>Runner: Node.js ${process.version} &bull; Playwright JSON Reporter</span>
  </div>
</div>
</body>
</html>`;
}

// ── No-results fallback ────────────────────────────────────────────────
function buildNoResults() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Shadow Hardening Report — Wolfpack Auto</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{
  font-family:'Inter',system-ui,sans-serif;
  background:${C.bg};color:${C.text};
  display:flex;align-items:center;justify-content:center;
  min-height:100vh;text-align:center;padding:2rem;
}
.card{
  background:${C.surface};border:1px solid ${C.border};
  border-radius:12px;padding:3rem 2.5rem;max-width:500px;
}
h1{font-size:1.5rem;margin-bottom:1rem;}
p{color:${C.textMuted};font-size:0.9rem;line-height:1.7;}
</style>
</head>
<body>
<div class="card">
  <h1>Shadow Hardening Report &mdash; Wolfpack Auto</h1>
  <p>No results found.<br/>
  <code>shadow-hardening-results.json</code> does not exist or could not be read.<br/><br/>
  Run the shadow hardening tests first:<br/>
  <code style="color:${C.accent}">bash scripts/shadow-test.sh</code></p>
</div>
</body>
</html>`;
}

// ── Main ───────────────────────────────────────────────────────────────
function main() {
  let html;

  if (!existsSync(INPUT)) {
    console.warn(`⚠  ${INPUT} not found — generating no-results report.`);
    html = buildNoResults();
  } else {
    try {
      const raw = readFileSync(INPUT, "utf-8");
      const data = JSON.parse(raw);
      html = buildReport(data);
      const stats = data.stats || {};
      const failed = stats.unexpected || 0;
      console.log(
        `Shadow Hardening Report: ${stats.expected || 0} passed, ${failed} failed, ${stats.skipped || 0} skipped`
      );
      if (failed > 0) {
        console.log(`⚠  ${failed} test(s) failed — see report for details.`);
      }
    } catch (err) {
      console.error(`Error reading results: ${err.message}`);
      html = buildNoResults();
    }
  }

  writeFileSync(OUTPUT, html, "utf-8");
  console.log(`Report written to ${OUTPUT}`);
}

main();
