/**
 * Google Maps Embed — Integration Tests
 *
 * Validates that the contact page has a properly configured Google Maps iframe
 * embed pointing to the Wolfpack Motors Raleigh address, with lazy loading,
 * responsive sizing, and CSP allowance.
 *
 * Run with: npx jest --no-coverage src/lib/__tests__/google-maps-embed.test.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

describe("Google Maps Embed", () => {
  const contactPagePath = path.join(ROOT, "src/app/contact/page.tsx");
  const componentPath = path.join(ROOT, "src/components/GoogleMapsEmbed.tsx");
  const nextConfigPath = path.join(ROOT, "next.config.mjs");

  let contactPage: string;
  let component: string;
  let nextConfig: string;

  beforeAll(() => {
    contactPage = fs.readFileSync(contactPagePath, "utf-8");
    component = fs.readFileSync(componentPath, "utf-8");
    nextConfig = fs.readFileSync(nextConfigPath, "utf-8");
  });

  it("contact page file exists", () => {
    expect(fs.existsSync(contactPagePath)).toBe(true);
  });

  it("component file exists", () => {
    expect(fs.existsSync(componentPath)).toBe(true);
  });

  it("contact page imports and renders GoogleMapsEmbed", () => {
    expect(contactPage).toContain("GoogleMapsEmbed");
  });

  it("component contains an iframe with google.com/maps/embed src", () => {
    // The iframe uses src={MAPS_EMBED_URL} where the constant holds the URL
    expect(component).toContain("<iframe");
    expect(component).toContain("google.com/maps/embed");
    expect(component).toMatch(/src=\{MAPS_EMBED_URL\}/);
  });

  it("embed URL points to Raleigh coordinates (35.8428, -78.6414)", () => {
    expect(component).toContain("35.8428");
    expect(component).toContain("-78.6414");
  });

  it('iframe has loading="lazy" for performance', () => {
    expect(component).toContain('loading="lazy"');
  });

  it("map embed is responsive with mobile and desktop heights", () => {
    // Tailwind responsive: h-[300px] for mobile, sm:h-[400px] for desktop
    expect(component).toContain("h-[300px]");
    expect(component).toContain("sm:h-[400px]");
    // Full width
    expect(component).toContain("w-full");
  });

  it("iframe has rounded corners matching site theme", () => {
    expect(component).toMatch(/rounded/);
  });

  it("CSP allows google.com in frame-src", () => {
    // Extract the CSP header value from next.config.mjs
    expect(nextConfig).toMatch(/frame-src.*https:\/\/www\.google\.com/);
  });

  it("fires analytics event on mount via client-side fetch", () => {
    expect(component).toContain("fetch");
    expect(component).toContain("/api/analytics/events");
    expect(component).toContain('"system.analytics_queried"');
    expect(component).toContain('"google_maps"');
    expect(component).toContain('"contact"');
  });

  it("includes a Get Directions link", () => {
    expect(component).toContain("Get Directions");
    expect(component).toMatch(/google\.com\/maps\/dir/);
  });
});
