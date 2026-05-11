/**
 * Structure tests for /security-posture page.
 *
 * Without @testing-library/react in devDeps, we validate the page
 * structurally: source contains the required testids, all four
 * sections, the security@ contact email, SOC 2 / GLBA references,
 * and the download brief link.
 *
 * Visual regression is exercised by the canary playwright suite.
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const PAGE = resolve(__dirname, "../page.tsx");
const SOURCE = readFileSync(PAGE, "utf-8");

describe("/security-posture page structure", () => {
  it("page file exists", () => {
    expect(existsSync(PAGE)).toBe(true);
  });

  it("declares the four required sections", () => {
    expect(SOURCE).toContain('id: "data-encryption"');
    expect(SOURCE).toContain('id: "compliance-posture"');
    expect(SOURCE).toContain('id: "operational-security"');
    expect(SOURCE).toContain('id: "disclosure-contact"');
  });

  it("each section has an icon, heading, and bullet list", () => {
    // Each section object declares an icon, title, and bullets array.
    const sectionMatches = SOURCE.match(/icon:\s*"[a-z]+"/g) ?? [];
    expect(sectionMatches.length).toBeGreaterThanOrEqual(4);
    const bulletMatches = SOURCE.match(/bullets:\s*\[/g) ?? [];
    expect(bulletMatches.length).toBeGreaterThanOrEqual(4);
  });

  it("includes the security contact email", () => {
    expect(SOURCE).toContain("security@thewolfpack.agency");
  });

  it("references SOC 2 and GLBA", () => {
    expect(SOURCE).toMatch(/SOC\s*2/);
    expect(SOURCE).toMatch(/GLBA/);
  });

  it("mentions encryption primitives in plain text", () => {
    expect(SOURCE).toContain("AES-256-GCM");
    expect(SOURCE).toContain("TLS 1.3");
    expect(SOURCE).toContain("X25519MLKEM768");
  });

  it("mentions GDPR and CCPA data subject rights", () => {
    expect(SOURCE).toContain("GDPR");
    expect(SOURCE).toContain("CCPA");
  });

  it("mentions row-level multi-tenant isolation per migration 055", () => {
    expect(SOURCE).toMatch(/Row[-\s]Level Security/);
    expect(SOURCE).toContain("055");
  });

  it("provides a security-brief download link", () => {
    expect(SOURCE).toContain('data-testid="security-brief-download"');
    expect(SOURCE).toMatch(/href="\/docs\/security-posture\.md"/);
  });

  it("exposes a 30-day coordinated disclosure window", () => {
    expect(SOURCE).toMatch(/30-?day/i);
    expect(SOURCE).toMatch(/coordinated disclosure/i);
  });

  it("links to SECURITY.md for the public security policy", () => {
    expect(SOURCE).toContain("SECURITY.md");
  });

  it("renders a last-updated date", () => {
    expect(SOURCE).toContain('data-testid="last-updated"');
    expect(SOURCE).toMatch(/LAST_UPDATED\s*=\s*"\d{4}-\d{2}-\d{2}"/);
  });

  it("uses brand colors from tailwind config", () => {
    expect(SOURCE).toMatch(/brand-\d{2,3}/);
  });

  it("renders a mobile + desktop responsive grid", () => {
    expect(SOURCE).toMatch(/grid-cols-1\s+md:grid-cols-2/);
  });

  it("contains no em dashes in user-facing text", () => {
    // Em dash = U+2014. Per user feedback: use periods, commas, colons,
    // or parentheses instead.
    expect(SOURCE).not.toContain("—");
  });

  it("contains the page-level testid for E2E coverage", () => {
    expect(SOURCE).toContain('data-testid="security-posture-page"');
  });
});
