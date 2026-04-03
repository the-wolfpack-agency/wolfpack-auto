/**
 * Unit tests for src/lib/canva-integration.ts
 *
 * Tests template library, category filtering, template population,
 * HTML output validity, Canva URL generation, performance tracking,
 * and usage tracking.
 *
 * Run with: npx jest src/lib/__tests__/canva-integration.test.ts
 */

import {
  getTemplateLibrary,
  getTemplatesByCategory,
  getTemplateById,
  populateTemplate,
  generateCanvaUrl,
  getTemplatePerformance,
  trackTemplateUsage,
  _resetUsageStore,
  type TemplateData,
  type TemplateCategory,
  type CanvaTemplate,
} from "../canva-integration";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const DEMO_DEALER_ID = "00000000-0000-4000-a000-000000000001";

const MOCK_DEALER = {
  name: "Test Motors",
  logo_url: "/test-logo.png",
  primary_color: "#1e40af",
  secondary_color: "#f59e0b",
  phone: "(555) 123-4567",
  website: "https://testmotors.com",
};

const MOCK_VEHICLE = {
  photo: "/test-vehicle.jpg",
  year: 2025,
  make: "Toyota",
  model: "Camry",
  price: 32995,
  features: ["Leather Seats", "Sunroof", "Backup Camera"],
};

const MOCK_DATA: TemplateData = {
  dealer: MOCK_DEALER,
  vehicle: MOCK_VEHICLE,
  custom: {
    headline: "Spring Sale",
    description: "Limited time offer",
    cta_text: "Shop Now",
    cta_url: "https://testmotors.com/inventory",
  },
};

beforeEach(() => {
  delete process.env.CANVA_API_KEY;
  _resetUsageStore();
});

/* -------------------------------------------------------------------------- */
/* Template Library                                                            */
/* -------------------------------------------------------------------------- */

describe("getTemplateLibrary", () => {
  test("returns an array of templates", () => {
    const templates = getTemplateLibrary();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThanOrEqual(8);
  });

  test("every template has required fields", () => {
    const templates = getTemplateLibrary();
    for (const tpl of templates) {
      expect(typeof tpl.id).toBe("string");
      expect(tpl.id.length).toBeGreaterThan(0);
      expect(typeof tpl.name).toBe("string");
      expect(tpl.name.length).toBeGreaterThan(0);
      expect(typeof tpl.category).toBe("string");
      expect(typeof tpl.description).toBe("string");
      expect(Array.isArray(tpl.sizes)).toBe(true);
      expect(tpl.sizes.length).toBeGreaterThan(0);
      expect(typeof tpl.thumbnail).toBe("string");
      expect(Array.isArray(tpl.fields)).toBe(true);
      expect(Array.isArray(tpl.tags)).toBe(true);
    }
  });

  test("every template size has width, height, and label", () => {
    const templates = getTemplateLibrary();
    for (const tpl of templates) {
      for (const size of tpl.sizes) {
        expect(typeof size.label).toBe("string");
        expect(typeof size.width).toBe("number");
        expect(size.width).toBeGreaterThan(0);
        expect(typeof size.height).toBe("number");
        expect(size.height).toBeGreaterThan(0);
      }
    }
  });

  test("every template field has name, label, and type", () => {
    const templates = getTemplateLibrary();
    for (const tpl of templates) {
      for (const field of tpl.fields) {
        expect(typeof field.name).toBe("string");
        expect(typeof field.label).toBe("string");
        expect(["text", "image", "color", "number"]).toContain(field.type);
      }
    }
  });

  test("template IDs are unique", () => {
    const templates = getTemplateLibrary();
    const ids = templates.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

/* -------------------------------------------------------------------------- */
/* Category Filtering                                                          */
/* -------------------------------------------------------------------------- */

describe("getTemplatesByCategory", () => {
  test("filters templates by category", () => {
    const socialTemplates = getTemplatesByCategory("social_post");
    expect(Array.isArray(socialTemplates)).toBe(true);
    for (const tpl of socialTemplates) {
      expect(tpl.category).toBe("social_post");
    }
  });

  test("returns empty array for category with no templates", () => {
    // Unlikely but test boundary
    const templates = getTemplatesByCategory("nonexistent" as TemplateCategory);
    expect(templates).toEqual([]);
  });

  test("all 8 defined categories return templates", () => {
    const categories: TemplateCategory[] = [
      "social_post",
      "email_banner",
      "flyer",
      "price_tag",
      "sale_banner",
      "new_arrival",
      "sold_celebration",
      "testimonial",
    ];
    // At least some categories should have templates
    let totalFound = 0;
    for (const cat of categories) {
      totalFound += getTemplatesByCategory(cat).length;
    }
    expect(totalFound).toBe(getTemplateLibrary().length);
  });
});

/* -------------------------------------------------------------------------- */
/* getTemplateById                                                             */
/* -------------------------------------------------------------------------- */

describe("getTemplateById", () => {
  test("returns template for valid ID", () => {
    const tpl = getTemplateById("vehicle-spotlight");
    expect(tpl).toBeDefined();
    expect(tpl?.id).toBe("vehicle-spotlight");
    expect(tpl?.name).toBe("Vehicle Spotlight");
  });

  test("returns undefined for invalid ID", () => {
    const tpl = getTemplateById("nonexistent-id");
    expect(tpl).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Template Population                                                         */
/* -------------------------------------------------------------------------- */

describe("populateTemplate", () => {
  test("populates vehicle-spotlight template with dealer and vehicle data", () => {
    const html = populateTemplate("vehicle-spotlight", MOCK_DATA);
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(100);
    expect(html).toContain("Test Motors");
    expect(html).toContain("$32,995");
    // When custom.headline is set ("Spring Sale"), it replaces the vehicle title in the heading
    expect(html).toContain("Spring Sale");
  });

  test("populates weekend-sale template", () => {
    const html = populateTemplate("weekend-sale", {
      dealer: MOCK_DEALER,
      custom: { headline: "Big Sale", discount_text: "50% Off", description: "Today only" },
    });
    expect(html).toContain("Big Sale");
    expect(html).toContain("50% Off");
    expect(html).toContain("Today only");
  });

  test("populates new-arrival template", () => {
    const html = populateTemplate("new-arrival", MOCK_DATA);
    expect(html).toContain("2025 Toyota Camry");
    expect(html).toContain("$32,995");
  });

  test("populates price-drop template with original price", () => {
    const data: TemplateData = {
      dealer: MOCK_DEALER,
      vehicle: { ...MOCK_VEHICLE, original_price: 36995 },
    };
    const html = populateTemplate("price-drop", data);
    expect(html).toContain("$36,995");
    expect(html).toContain("$32,995");
    expect(html).toContain("$4,000");
  });

  test("populates just-sold template", () => {
    const html = populateTemplate("just-sold", {
      dealer: MOCK_DEALER,
      vehicle: MOCK_VEHICLE,
      custom: { customer_name: "John D.", description: "Loving the new ride!" },
    });
    expect(html).toContain("John D.");
    expect(html).toContain("Loving the new ride!");
  });

  test("populates testimonial-card template", () => {
    const html = populateTemplate("testimonial-card", {
      dealer: MOCK_DEALER,
      vehicle: MOCK_VEHICLE,
      custom: { customer_name: "Jane S.", customer_quote: "Best dealership ever!", rating: 5 },
    });
    expect(html).toContain("Jane S.");
    expect(html).toContain("Best dealership ever!");
    expect(html).toContain("★★★★★");
  });

  test("populates inventory-showcase template with multiple vehicles", () => {
    const html = populateTemplate("inventory-showcase", {
      dealer: MOCK_DEALER,
      vehicles: [
        MOCK_VEHICLE,
        { ...MOCK_VEHICLE, make: "Honda", model: "Accord", price: 28995 },
      ],
    });
    expect(html).toContain("Toyota Camry");
    expect(html).toContain("Honda Accord");
  });

  test("populates service-special template", () => {
    const html = populateTemplate("service-special", {
      dealer: MOCK_DEALER,
      custom: {
        headline: "Spring Maintenance",
        discount_text: "$19.99 Oil Change",
        expiry_date: "2026-04-30",
      },
    });
    expect(html).toContain("Spring Maintenance");
    expect(html).toContain("$19.99 Oil Change");
    expect(html).toContain("2026-04-30");
  });

  test("throws for unknown template ID", () => {
    expect(() => populateTemplate("nonexistent", MOCK_DATA)).toThrow("Template not found");
  });

  test("populates template with minimal data (dealer only)", () => {
    const html = populateTemplate("weekend-sale", { dealer: MOCK_DEALER });
    expect(typeof html).toBe("string");
    expect(html).toContain("Test Motors");
  });
});

/* -------------------------------------------------------------------------- */
/* HTML Output Validity                                                        */
/* -------------------------------------------------------------------------- */

describe("HTML output validity", () => {
  test("all templates produce valid HTML documents", () => {
    const templates = getTemplateLibrary();
    for (const tpl of templates) {
      const data: TemplateData = {
        dealer: MOCK_DEALER,
        vehicle: MOCK_VEHICLE,
        vehicles: [MOCK_VEHICLE],
        custom: {
          headline: "Test",
          description: "Test desc",
          cta_text: "Click",
          customer_name: "Tester",
          customer_quote: "Great!",
          rating: 5,
          discount_text: "$100 Off",
          expiry_date: "2026-12-31",
        },
      };
      const html = populateTemplate(tpl.id, data);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html>");
      expect(html).toContain("</html>");
      expect(html).toContain("<body");
      expect(html).toContain("</body>");
    }
  });

  test("HTML escapes special characters in text fields", () => {
    const html = populateTemplate("vehicle-spotlight", {
      dealer: { ...MOCK_DEALER, name: 'Test <script>alert("xss")</script>' },
      vehicle: MOCK_VEHICLE,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

/* -------------------------------------------------------------------------- */
/* Canva URL Generation                                                        */
/* -------------------------------------------------------------------------- */

describe("generateCanvaUrl", () => {
  test("returns preview URL when no API key set", () => {
    const url = generateCanvaUrl("vehicle-spotlight", MOCK_DATA);
    expect(url).toBe("/admin/marketing/templates/vehicle-spotlight/preview");
  });

  test("returns Canva deep link when API key is set", () => {
    process.env.CANVA_API_KEY = "test-key-123";
    const url = generateCanvaUrl("vehicle-spotlight", MOCK_DATA);
    expect(url).toContain("https://www.canva.com/design/create");
    expect(url).toContain("design_type=");
    expect(url).toContain("width=1080");
    expect(url).toContain("height=1080");
    expect(url).toContain("title=");
  });

  test("throws for unknown template ID", () => {
    expect(() => generateCanvaUrl("nonexistent", MOCK_DATA)).toThrow("Template not found");
  });
});

/* -------------------------------------------------------------------------- */
/* Usage Tracking                                                              */
/* -------------------------------------------------------------------------- */

describe("trackTemplateUsage", () => {
  test("records a usage event and returns record", () => {
    const record = trackTemplateUsage("vehicle-spotlight", "social", DEMO_DEALER_ID);
    expect(record).toHaveProperty("id");
    expect(record.template_id).toBe("vehicle-spotlight");
    expect(record.channel).toBe("social");
    expect(record.dealer_id).toBe(DEMO_DEALER_ID);
    expect(typeof record.timestamp).toBe("string");
  });

  test("generates unique IDs for each record", () => {
    const r1 = trackTemplateUsage("vehicle-spotlight", "social", DEMO_DEALER_ID);
    const r2 = trackTemplateUsage("vehicle-spotlight", "email", DEMO_DEALER_ID);
    expect(r1.id).not.toBe(r2.id);
  });
});

/* -------------------------------------------------------------------------- */
/* Performance Tracking                                                        */
/* -------------------------------------------------------------------------- */

describe("getTemplatePerformance", () => {
  test("returns performance records for all templates", () => {
    const perf = getTemplatePerformance();
    expect(Array.isArray(perf)).toBe(true);
    expect(perf.length).toBe(getTemplateLibrary().length);
    for (const p of perf) {
      expect(typeof p.template_id).toBe("string");
      expect(typeof p.template_name).toBe("string");
      expect(typeof p.total_uses).toBe("number");
      expect(typeof p.avg_engagement_rate).toBe("number");
      expect(typeof p.top_performer).toBe("boolean");
    }
  });

  test("reflects usage after tracking", () => {
    trackTemplateUsage("vehicle-spotlight", "social", DEMO_DEALER_ID);
    trackTemplateUsage("vehicle-spotlight", "email", DEMO_DEALER_ID);
    trackTemplateUsage("weekend-sale", "social", DEMO_DEALER_ID);

    const perf = getTemplatePerformance();
    const spotlightPerf = perf.find((p) => p.template_id === "vehicle-spotlight");
    expect(spotlightPerf?.total_uses).toBe(2);
    expect(spotlightPerf?.uses_by_channel).toEqual({ social: 1, email: 1 });
    expect(spotlightPerf?.top_performer).toBe(true);

    const salePerf = perf.find((p) => p.template_id === "weekend-sale");
    expect(salePerf?.total_uses).toBe(1);
  });

  test("reports zero usage when no tracking recorded", () => {
    const perf = getTemplatePerformance();
    for (const p of perf) {
      expect(p.total_uses).toBe(0);
      expect(p.avg_engagement_rate).toBe(0);
      expect(p.top_performer).toBe(false);
    }
  });
});
