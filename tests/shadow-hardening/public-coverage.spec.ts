/**
 * Public site static analysis + structural coverage.
 *
 * Verifies the public-facing pages are correctly structured without requiring
 * a running browser. Catches:
 *
 * - Missing page files
 * - Missing metadata (title/description) — breaks SEO
 * - Missing layout imports (chat, cookie consent, analytics collector)
 * - Broken component references
 * - Forms missing required fields or ARIA labels
 * - Smoke test PAGES list staying in sync with actual routes
 * - Key trust signals present in source
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../../src");
const TESTS_DIR = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// All public pages must exist as page.tsx files
// ---------------------------------------------------------------------------

test.describe("Public pages: file existence", () => {
  const REQUIRED_PAGES = [
    "app/page.tsx",                          // homepage
    "app/inventory/page.tsx",
    "app/inventory/[vin]/page.tsx",
    "app/inventory/compare/page.tsx",
    "app/financing/page.tsx",
    "app/about/page.tsx",
    "app/contact/page.tsx",
    "app/privacy/page.tsx",
    "app/terms/page.tsx",
    "app/not-found.tsx",
  ];

  for (const page of REQUIRED_PAGES) {
    test(`${page} exists`, () => {
      expect(fs.existsSync(path.join(SRC, page)), `${page} is missing`).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// All public pages must export metadata with title and description
// ---------------------------------------------------------------------------

test.describe("Public pages: metadata exports", () => {
  const PAGES_WITH_METADATA = [
    { file: "app/inventory/page.tsx",          expectedTitle: /inventory/i },
    { file: "app/financing/page.tsx",          expectedTitle: /financing/i },
    { file: "app/about/page.tsx",              expectedTitle: /about/i },
    { file: "app/contact/page.tsx",            expectedTitle: /contact/i },
  ];

  for (const { file, expectedTitle } of PAGES_WITH_METADATA) {
    test(`${file} exports metadata`, () => {
      const filePath = path.join(SRC, file);
      if (!fs.existsSync(filePath)) {
        test.skip();
        return;
      }
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("export const metadata");
    });

    test(`${file} has title matching ${expectedTitle}`, () => {
      const filePath = path.join(SRC, file);
      if (!fs.existsSync(filePath)) {
        test.skip();
        return;
      }
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("title");
      expect(expectedTitle.test(content)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Root layout: critical components must be imported
// ---------------------------------------------------------------------------

test.describe("Root layout: critical component imports", () => {
  let layoutContent: string;

  test.beforeAll(() => {
    layoutContent = fs.readFileSync(path.join(SRC, "app/layout.tsx"), "utf-8");
  });

  test("imports ChatWidget", () => {
    expect(layoutContent).toContain("ChatWidget");
  });

  test("imports CookieConsent", () => {
    expect(layoutContent).toContain("CookieConsent");
  });

  test("imports EventCollector (analytics)", () => {
    expect(layoutContent).toContain("EventCollector");
  });

  test("top bar has id='wolfpack-top-bar' for CSS isolation", () => {
    expect(layoutContent).toContain('id="wolfpack-top-bar"');
  });

  test("chat widget wrapped with id='wolfpack-chat'", () => {
    expect(layoutContent).toContain('id="wolfpack-chat"');
  });

  test("cookie consent wrapped with id='wolfpack-cookie'", () => {
    expect(layoutContent).toContain('id="wolfpack-cookie"');
  });

  test("header has role='banner' for admin CSS isolation", () => {
    expect(layoutContent).toContain("role=\"banner\"");
  });

  test("footer has role='contentinfo' for admin CSS isolation", () => {
    expect(layoutContent).toContain("role=\"contentinfo\"");
  });

  test("skip-nav link to #main-content", () => {
    expect(layoutContent).toContain("#main-content");
  });
});

// ---------------------------------------------------------------------------
// Admin layout: must hide all public chrome on admin pages
// ---------------------------------------------------------------------------

test.describe("Admin layout: public chrome isolation", () => {
  let adminLayoutContent: string;

  test.beforeAll(() => {
    adminLayoutContent = fs.readFileSync(
      path.join(SRC, "app/admin/layout.tsx"),
      "utf-8"
    );
  });

  test("hides #wolfpack-top-bar", () => {
    expect(adminLayoutContent).toContain("#wolfpack-top-bar");
    expect(adminLayoutContent).toContain("display: none");
  });

  test("hides header[role=banner]", () => {
    expect(adminLayoutContent).toContain("header[role=\"banner\"]");
  });

  test("hides footer[role=contentinfo]", () => {
    expect(adminLayoutContent).toContain("footer[role=\"contentinfo\"]");
  });

  test("hides #wolfpack-chat", () => {
    expect(adminLayoutContent).toContain("#wolfpack-chat");
  });

  test("hides #wolfpack-cookie", () => {
    expect(adminLayoutContent).toContain("#wolfpack-cookie");
  });

  test("uses AuthProvider", () => {
    expect(adminLayoutContent).toContain("AuthProvider");
  });

  test("uses AdminSidebar", () => {
    expect(adminLayoutContent).toContain("AdminSidebar");
  });
});

// ---------------------------------------------------------------------------
// Chat widget component: must have correct aria labels
// ---------------------------------------------------------------------------

test.describe("ChatWidget component: aria labels", () => {
  let chatContent: string;

  test.beforeAll(() => {
    const chatPath = path.join(SRC, "components/ChatWidget.tsx");
    chatContent = fs.existsSync(chatPath)
      ? fs.readFileSync(chatPath, "utf-8")
      : "";
  });

  test("ChatWidget.tsx exists", () => {
    expect(fs.existsSync(path.join(SRC, "components/ChatWidget.tsx"))).toBe(true);
  });

  test('open bubble has aria-label="Open chat assistant"', () => {
    expect(chatContent).toContain("Open chat assistant");
  });

  test('close button has aria-label="Close chat"', () => {
    expect(chatContent).toContain("Close chat");
  });

  test('send button has aria-label="Send message"', () => {
    expect(chatContent).toContain("Send message");
  });

  test("chat input has id='chat-input'", () => {
    expect(chatContent).toContain('id="chat-input"');
  });

  test("message log has role='log'", () => {
    expect(chatContent).toContain("role=\"log\"");
  });

  test("chat panel has role='dialog'", () => {
    expect(chatContent).toContain("role=\"dialog\"");
  });

  test("chat input has maxLength 500", () => {
    expect(chatContent).toContain("500");
    expect(chatContent).toContain("maxLength");
  });
});

// ---------------------------------------------------------------------------
// Contact form: required fields and ARIA
// ---------------------------------------------------------------------------

test.describe("Contact form: required fields and ARIA", () => {
  let contactContent: string;

  test.beforeAll(() => {
    const p = path.join(SRC, "app/contact/page.tsx");
    contactContent = fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
  });

  const REQUIRED_FIELD_IDS = [
    "contact-first-name",
    "contact-last-name",
    "contact-email",
    "contact-phone",
    "contact-subject",
    "contact-message",
  ];

  for (const id of REQUIRED_FIELD_IDS) {
    test(`field #${id} defined`, () => {
      expect(contactContent).toContain(id);
    });
  }

  test("form has send/submit button", () => {
    expect(contactContent).toMatch(/Send Message|submit/i);
  });

  test("form has client-side validation", () => {
    // Validation errors must be defined in the component
    expect(contactContent).toContain("First name is required");
    expect(contactContent).toContain("Email address is required");
    expect(contactContent).toContain("Message is required");
  });

  test("success state has 'Message Sent'", () => {
    expect(contactContent).toContain("Message Sent");
  });
});

// ---------------------------------------------------------------------------
// Inventory page: filter and sort elements
// ---------------------------------------------------------------------------

test.describe("Inventory page: filter and sort elements", () => {
  let inventoryContent: string;

  test.beforeAll(() => {
    const p = path.join(SRC, "app/inventory/page.tsx");
    inventoryContent = fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
  });

  test("filter sidebar has aria-label='Inventory filters'", () => {
    expect(inventoryContent).toContain("Inventory filters");
  });

  test("sort select has id='sort-by'", () => {
    expect(inventoryContent).toContain("sort-by");
  });

  test("pagination nav has aria-label='Pagination'", () => {
    expect(inventoryContent).toContain("Pagination");
  });

  test("vehicle grid has aria-label='Search results'", () => {
    expect(inventoryContent).toContain("Search results");
  });

  test("breadcrumb nav present", () => {
    expect(inventoryContent).toContain("Breadcrumb");
  });
});

// ---------------------------------------------------------------------------
// VDP: must have critical sections
// ---------------------------------------------------------------------------

test.describe("VDP: critical sections in source", () => {
  let vdpContent: string;

  test.beforeAll(() => {
    const p = path.join(SRC, "app/inventory/[vin]/page.tsx");
    vdpContent = fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
  });

  test("specs section has aria-labelledby='specs-heading'", () => {
    expect(vdpContent).toContain("specs-heading");
  });

  test("features section present", () => {
    expect(vdpContent).toContain("features-heading");
  });

  test("similar vehicles section present", () => {
    expect(vdpContent).toContain("similar-heading");
  });

  test("trust badges present (CARFAX, inspection, return)", () => {
    expect(vdpContent).toContain("CARFAX");
    expect(vdpContent).toContain("Inspection");
    expect(vdpContent).toContain("Return");
  });

  test("payment calculator ids present", () => {
    expect(vdpContent).toContain("calc-down");
    expect(vdpContent).toContain("calc-term");
  });

  test("financing link points to /financing", () => {
    expect(vdpContent).toContain("/financing");
  });

  test("breadcrumb nav present", () => {
    expect(vdpContent).toContain("Breadcrumb");
  });
});

// ---------------------------------------------------------------------------
// Financing page: required sections
// ---------------------------------------------------------------------------

test.describe("Financing page: required sections in source", () => {
  let content: string;

  test.beforeAll(() => {
    const p = path.join(SRC, "app/financing/page.tsx");
    content = fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
  });

  test("credit tier section present", () => {
    expect(content).toContain("tiers-heading");
  });

  test("calculator section present", () => {
    expect(content).toContain("calc-heading");
  });

  test("FAQ section present", () => {
    expect(content).toContain("faq-heading");
  });

  test("APR rates present", () => {
    expect(content).toContain("2.9%");
    expect(content).toContain("4.9%");
    expect(content).toContain("7.9%");
  });
});

// ---------------------------------------------------------------------------
// Smoke test PAGES array: stays in sync with actual route files
// ---------------------------------------------------------------------------

test.describe("Smoke test: PAGES array coverage", () => {
  let smokeContent: string;

  test.beforeAll(() => {
    smokeContent = fs.readFileSync(path.join(TESTS_DIR, "smoke.spec.ts"), "utf-8");
  });

  const EXPECTED_PATHS = ["/", "/inventory", "/financing", "/about", "/contact"];

  for (const p of EXPECTED_PATHS) {
    test(`smoke.spec.ts includes path "${p}"`, () => {
      // The PAGES array in smoke.spec.ts must include this path
      expect(smokeContent).toContain(`"${p}"`);
    });
  }

  test("smoke.spec.ts includes dealer sub-pages", () => {
    expect(smokeContent).toContain("/dealers/summit-auto");
    expect(smokeContent).toContain("/dealers/mile-high-motors");
  });

  test("smoke.spec.ts tests analytics collector on each page", () => {
    expect(smokeContent).toContain("testAnalyticsCollector");
  });
});

// ---------------------------------------------------------------------------
// CookieConsent component: functional requirements in source
// ---------------------------------------------------------------------------

test.describe("CookieConsent component: functional requirements", () => {
  test("CookieConsent.tsx exists", () => {
    expect(fs.existsSync(path.join(SRC, "components/CookieConsent.tsx"))).toBe(true);
  });

  test("stores preference in localStorage", () => {
    const content = fs.readFileSync(
      path.join(SRC, "components/CookieConsent.tsx"),
      "utf-8"
    );
    expect(content).toContain("localStorage");
    expect(content).toContain("cookie_consent");
  });
});

// ---------------------------------------------------------------------------
// EventCollector: analytics collector functional requirements
// ---------------------------------------------------------------------------

test.describe("EventCollector: analytics requirements", () => {
  test("EventCollector.tsx exists", () => {
    expect(fs.existsSync(path.join(SRC, "components/EventCollector.tsx"))).toBe(true);
  });

  test("checks consent before tracking", () => {
    const content = fs.readFileSync(
      path.join(SRC, "components/EventCollector.tsx"),
      "utf-8"
    );
    expect(content).toContain("cookie_consent");
    expect(content).toContain("consentLevel");
  });

  test("sets wolfpack_analytics_session in sessionStorage", () => {
    const content = fs.readFileSync(
      path.join(SRC, "components/EventCollector.tsx"),
      "utf-8"
    );
    expect(content).toContain("wolfpack_analytics_session");
  });

  test("sets wolfpack_analytics_fp fingerprint in localStorage", () => {
    const content = fs.readFileSync(
      path.join(SRC, "components/EventCollector.tsx"),
      "utf-8"
    );
    expect(content).toContain("wolfpack_analytics_fp");
  });
});

// ---------------------------------------------------------------------------
// Public test files exist
// ---------------------------------------------------------------------------

test.describe("Public test coverage: test files exist", () => {
  const TEST_FILES = [
    "smoke.spec.ts",
    "pages/homepage.spec.ts",
    "pages/inventory.spec.ts",
    "pages/vdp.spec.ts",
    "pages/financing.spec.ts",
    "pages/contact.spec.ts",
    "pages/about.spec.ts",
    "pages/dealer-subpages-full.spec.ts",
    "pages/hero-search.spec.ts",
    "pages/inventory-expanded.spec.ts",
    "e2e/public-flows.spec.ts",
    "e2e/oem-portal.spec.ts",
    "e2e/admin-workflow.spec.ts",
    "components/chat.spec.ts",
  ];

  for (const file of TEST_FILES) {
    test(`tests/${file} exists`, () => {
      expect(
        fs.existsSync(path.join(TESTS_DIR, file)),
        `tests/${file} is missing`
      ).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// AdminSidebar: public chrome must not be referenced
// ---------------------------------------------------------------------------

test.describe("AdminSidebar: no public chrome bleed", () => {
  let sidebarContent: string;

  test.beforeAll(() => {
    sidebarContent = fs.readFileSync(
      path.join(SRC, "components/AdminSidebar.tsx"),
      "utf-8"
    );
  });

  test("sidebar does not render the public header nav links", () => {
    // The sidebar should not link to the public routes from its nav items
    expect(sidebarContent).not.toContain('href="/inventory"');
    expect(sidebarContent).not.toContain('href="/financing"');
    expect(sidebarContent).not.toContain('href="/about"');
  });

  test("sidebar has mobile hamburger with aria-label='Open menu'", () => {
    expect(sidebarContent).toContain("Open menu");
  });

  test("sidebar has desktop aria-label='Admin navigation desktop'", () => {
    expect(sidebarContent).toContain("Admin navigation desktop");
  });

  test("sidebar has View Storefront link back to /", () => {
    expect(sidebarContent).toContain('href="/"');
    expect(sidebarContent).toContain("View Storefront");
  });
});

// ---------------------------------------------------------------------------
// No hardcoded secrets in public pages
// ---------------------------------------------------------------------------

test.describe("Security: no hardcoded credentials in public pages", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  const PUBLIC_PAGE_FILES = [
    "app/page.tsx",
    "app/inventory/page.tsx",
    "app/financing/page.tsx",
    "app/about/page.tsx",
    "app/contact/page.tsx",
  ];

  for (const file of PUBLIC_PAGE_FILES) {
    test(`${file}: no API keys or secrets`, () => {
      const filePath = path.join(SRC, file);
      if (!fs.existsSync(filePath)) {
        test.skip();
        return;
      }
      const content = fs.readFileSync(filePath, "utf-8");
      // Should not contain patterns that look like hardcoded secrets
      expect(content).not.toMatch(/sk-[a-zA-Z0-9]{20,}/); // OpenAI-style keys
      expect(content).not.toMatch(/password\s*=\s*["'][^"']{4,}/i); // hardcoded passwords
      expect(content).not.toMatch(/secret\s*=\s*["'][^"']{8,}/i); // hardcoded secrets
      expect(content).not.toMatch(/api_key\s*=\s*["'][^"']{8,}/i); // hardcoded API keys
    });
  }
});
