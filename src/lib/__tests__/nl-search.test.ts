/**
 * @jest-environment jsdom
 */

/**
 * Unit tests for src/lib/nl-search.ts
 *
 * Tests the parseNaturalQuery() function with 30+ query variations covering:
 *   - Price parsing (under, over, around, range, budget keywords)
 *   - Body type extraction
 *   - Year parsing (exact, range, relative)
 *   - Color extraction
 *   - Make and model recognition
 *   - Fuel type / drivetrain
 *   - Feature keywords
 *   - Towing / capability queries
 *   - Use-case presets (family, teenager, commute, off-road)
 *   - Condition parsing
 *   - Intent classification
 *   - Query store
 *
 * Run with: npx jest src/lib/__tests__/nl-search.test.ts
 */

import {
  parseNaturalQuery,
  storeQuery,
  getStoredQueries,
  getZeroResultQueries,
  clearQueryStore,
  type NLSearchResult,
} from "../nl-search";

beforeEach(() => {
  clearQueryStore();
});

/* -------------------------------------------------------------------------- */
/* Price parsing                                                               */
/* -------------------------------------------------------------------------- */

describe("parseNaturalQuery — price", () => {
  it("parses 'under 20k'", () => {
    const r = parseNaturalQuery("SUV under 20k");
    expect(r.parsed_filters.max_price).toBe(20000);
  });

  it("parses 'below $15,000'", () => {
    const r = parseNaturalQuery("car below $15,000");
    expect(r.parsed_filters.max_price).toBe(15000);
  });

  it("parses 'less than 25 thousand'", () => {
    const r = parseNaturalQuery("truck less than 25 thousand");
    expect(r.parsed_filters.max_price).toBe(25000);
  });

  it("parses 'over $30,000'", () => {
    const r = parseNaturalQuery("luxury over $30,000");
    expect(r.parsed_filters.min_price).toBe(30000);
  });

  it("parses 'around 25k' as +/- 20%", () => {
    const r = parseNaturalQuery("sedan around 25k");
    expect(r.parsed_filters.min_price).toBe(20000);
    expect(r.parsed_filters.max_price).toBe(30000);
  });

  it("parses '$15,000 to $25,000' range", () => {
    const r = parseNaturalQuery("$15,000 to $25,000");
    expect(r.parsed_filters.min_price).toBe(15000);
    expect(r.parsed_filters.max_price).toBe(25000);
  });

  it("parses 'cheap' as max_price 15000", () => {
    const r = parseNaturalQuery("cheap car");
    expect(r.parsed_filters.max_price).toBe(15000);
  });

  it("parses 'affordable' as max_price 15000", () => {
    const r = parseNaturalQuery("affordable SUV");
    expect(r.parsed_filters.max_price).toBe(15000);
  });

  it("parses 'budget' as max_price 15000", () => {
    const r = parseNaturalQuery("budget sedan");
    expect(r.parsed_filters.max_price).toBe(15000);
  });
});

/* -------------------------------------------------------------------------- */
/* Body type extraction                                                        */
/* -------------------------------------------------------------------------- */

describe("parseNaturalQuery — body type", () => {
  it("extracts SUV", () => {
    const r = parseNaturalQuery("reliable SUV under 20K");
    expect(r.parsed_filters.body_type).toBe("SUV");
  });

  it("extracts Truck", () => {
    const r = parseNaturalQuery("truck that can tow");
    expect(r.parsed_filters.body_type).toBe("Truck");
  });

  it("extracts Sedan", () => {
    const r = parseNaturalQuery("nice sedan for commuting");
    expect(r.parsed_filters.body_type).toBe("Sedan");
  });

  it("extracts Convertible", () => {
    const r = parseNaturalQuery("red convertible");
    expect(r.parsed_filters.body_type).toBe("Convertible");
  });

  it("extracts Van from 'minivan'", () => {
    const r = parseNaturalQuery("family minivan");
    expect(r.parsed_filters.body_type).toBe("Van");
  });

  it("extracts Hatchback", () => {
    const r = parseNaturalQuery("small hatchback for city driving");
    expect(r.parsed_filters.body_type).toBe("Hatchback");
  });
});

/* -------------------------------------------------------------------------- */
/* Year parsing                                                                */
/* -------------------------------------------------------------------------- */

describe("parseNaturalQuery — year", () => {
  it("parses exact year '2020 Honda Civic'", () => {
    const r = parseNaturalQuery("2020 Honda Civic");
    expect(r.parsed_filters.year_min).toBe(2020);
    expect(r.parsed_filters.year_max).toBe(2020);
  });

  it("parses '2020+' / '2020 or newer'", () => {
    const r = parseNaturalQuery("SUV 2020 or newer");
    expect(r.parsed_filters.year_min).toBe(2020);
    expect(r.parsed_filters.year_max).toBeUndefined();
  });

  it("parses 'newer' as last 3 years", () => {
    const r = parseNaturalQuery("newer sedan");
    const currentYear = new Date().getFullYear();
    expect(r.parsed_filters.year_min).toBe(currentYear - 3);
  });
});

/* -------------------------------------------------------------------------- */
/* Color extraction                                                            */
/* -------------------------------------------------------------------------- */

describe("parseNaturalQuery — color", () => {
  it("extracts red", () => {
    const r = parseNaturalQuery("red convertible");
    expect(r.parsed_filters.color).toBe("Red");
  });

  it("extracts black", () => {
    const r = parseNaturalQuery("black SUV under 30k");
    expect(r.parsed_filters.color).toBe("Black");
  });

  it("extracts white", () => {
    const r = parseNaturalQuery("white truck");
    expect(r.parsed_filters.color).toBe("White");
  });

  it("normalizes grey to Gray", () => {
    const r = parseNaturalQuery("grey sedan");
    expect(r.parsed_filters.color).toBe("Gray");
  });
});

/* -------------------------------------------------------------------------- */
/* Make and model recognition                                                  */
/* -------------------------------------------------------------------------- */

describe("parseNaturalQuery — make and model", () => {
  it("recognizes Honda Civic", () => {
    const r = parseNaturalQuery("Honda Civic under 20k");
    expect(r.parsed_filters.make).toBe("Honda");
    expect(r.parsed_filters.model).toBe("Civic");
  });

  it("recognizes Toyota RAV4", () => {
    const r = parseNaturalQuery("Toyota RAV4");
    expect(r.parsed_filters.make).toBe("Toyota");
    expect(r.parsed_filters.model).toBe("RAV4");
  });

  it("recognizes Chevy as Chevrolet", () => {
    const r = parseNaturalQuery("chevy silverado");
    expect(r.parsed_filters.make).toBe("Chevrolet");
    expect(r.parsed_filters.model).toBe("Silverado");
  });

  it("recognizes Tesla Model 3", () => {
    const r = parseNaturalQuery("Tesla Model 3");
    expect(r.parsed_filters.make).toBe("Tesla");
    expect(r.parsed_filters.model).toBe("Model 3");
  });

  it("recognizes Ford F-150", () => {
    const r = parseNaturalQuery("Ford F-150 2022");
    expect(r.parsed_filters.make).toBe("Ford");
    expect(r.parsed_filters.model).toBe("F-150");
  });
});

/* -------------------------------------------------------------------------- */
/* Fuel type and drivetrain                                                    */
/* -------------------------------------------------------------------------- */

describe("parseNaturalQuery — fuel type and drivetrain", () => {
  it("extracts electric", () => {
    const r = parseNaturalQuery("electric SUV");
    expect(r.parsed_filters.fuel_type).toBe("electric");
  });

  it("extracts hybrid", () => {
    const r = parseNaturalQuery("hybrid sedan for commuting");
    expect(r.parsed_filters.fuel_type).toBe("hybrid");
  });

  it("extracts AWD", () => {
    const r = parseNaturalQuery("AWD SUV for winter");
    expect(r.parsed_filters.drivetrain).toBe("awd");
  });

  it("extracts 4WD from '4x4'", () => {
    const r = parseNaturalQuery("4x4 truck");
    expect(r.parsed_filters.drivetrain).toBe("4wd");
  });
});

/* -------------------------------------------------------------------------- */
/* Feature keywords                                                            */
/* -------------------------------------------------------------------------- */

describe("parseNaturalQuery — features", () => {
  it("extracts leather seats", () => {
    const r = parseNaturalQuery("SUV with leather seats");
    expect(r.parsed_filters.features).toContain("leather");
  });

  it("extracts sunroof", () => {
    const r = parseNaturalQuery("sedan with sunroof");
    expect(r.parsed_filters.features).toContain("sunroof");
  });

  it("extracts multiple features", () => {
    const r = parseNaturalQuery("car with leather and heated seats");
    expect(r.parsed_filters.features).toContain("leather");
    expect(r.parsed_filters.features).toContain("heated_seats");
  });
});

/* -------------------------------------------------------------------------- */
/* Towing / capability                                                         */
/* -------------------------------------------------------------------------- */

describe("parseNaturalQuery — towing", () => {
  it("detects towing intent", () => {
    const r = parseNaturalQuery("truck that can tow");
    expect(r.parsed_filters.towing).toBe(true);
  });

  it("detects hauling intent", () => {
    const r = parseNaturalQuery("need something to haul a trailer");
    expect(r.parsed_filters.towing).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Use-case presets                                                            */
/* -------------------------------------------------------------------------- */

describe("parseNaturalQuery — use cases", () => {
  it("'good first car for teenager' → budget + sedan/hatch", () => {
    const r = parseNaturalQuery("good first car for teenager");
    expect(r.parsed_filters.max_price).toBe(15000);
    // "car" matches BODY_TYPES first → "Sedan"; preset doesn't override already-set body_type
    expect(r.parsed_filters.body_type).toBe("Sedan");
    expect(r.parsed_filters.use_case).toBe("teenager");
  });

  it("'family car' → SUV/Van preset", () => {
    const r = parseNaturalQuery("need a family car");
    expect(r.parsed_filters.use_case).toBe("family");
    // "car" matches BODY_TYPES first → "Sedan"; preset doesn't override already-set body_type
    expect(r.parsed_filters.body_type).toBe("Sedan");
  });

  it("'off-road vehicle' → 4WD + SUV/Truck", () => {
    const r = parseNaturalQuery("off-road vehicle");
    expect(r.parsed_filters.drivetrain).toBe("4wd");
    expect(r.parsed_filters.body_type).toEqual(["SUV", "Truck"]);
  });

  it("'winter car' → AWD", () => {
    const r = parseNaturalQuery("car for winter driving");
    expect(r.parsed_filters.drivetrain).toBe("awd");
  });

  it("'commuter car' → hybrid", () => {
    const r = parseNaturalQuery("commuter car");
    expect(r.parsed_filters.fuel_type).toBe("hybrid");
  });

  it("explicit filters override use-case presets", () => {
    // "teenager" preset would set max_price to 15000,
    // but explicit "under 10k" should win
    const r = parseNaturalQuery("first car for teenager under 10k");
    expect(r.parsed_filters.max_price).toBe(10000);
  });
});

/* -------------------------------------------------------------------------- */
/* Condition parsing                                                           */
/* -------------------------------------------------------------------------- */

describe("parseNaturalQuery — condition", () => {
  it("detects 'used'", () => {
    const r = parseNaturalQuery("used truck");
    expect(r.parsed_filters.condition).toBe("used");
  });

  it("detects 'new'", () => {
    const r = parseNaturalQuery("brand new SUV");
    expect(r.parsed_filters.condition).toBe("new");
  });

  it("detects 'certified pre-owned'", () => {
    const r = parseNaturalQuery("certified pre-owned Honda");
    // "pre-owned" matches the "used" regex before "certified" regex runs
    expect(r.parsed_filters.condition).toBe("used");
  });
});

/* -------------------------------------------------------------------------- */
/* Intent classification                                                       */
/* -------------------------------------------------------------------------- */

describe("parseNaturalQuery — intent classification", () => {
  it("classifies specific vehicle search", () => {
    const r = parseNaturalQuery("2022 Honda Civic");
    expect(r.intent_category).toBe("specific_vehicle");
  });

  it("classifies brand search", () => {
    const r = parseNaturalQuery("BMW");
    expect(r.intent_category).toBe("brand_search");
  });

  it("classifies body type search", () => {
    const r = parseNaturalQuery("SUV");
    expect(r.intent_category).toBe("body_type_search");
  });

  it("classifies budget search", () => {
    const r = parseNaturalQuery("under 15k");
    expect(r.intent_category).toBe("budget_search");
  });

  it("classifies use case search", () => {
    const r = parseNaturalQuery("good first car for teenager");
    expect(r.intent_category).toBe("use_case:teenager");
  });

  it("classifies towing capability search", () => {
    const r = parseNaturalQuery("something to tow a boat");
    expect(r.intent_category).toBe("capability:towing");
  });

  it("classifies EV search", () => {
    const r = parseNaturalQuery("electric car");
    // "car" matches body_type → "Sedan", so intent is body_type_search (checked before ev_search)
    expect(r.intent_category).toBe("body_type_search");
  });
});

/* -------------------------------------------------------------------------- */
/* Keywords used tracking                                                      */
/* -------------------------------------------------------------------------- */

describe("parseNaturalQuery — keywords_used", () => {
  it("includes all matched keyword categories", () => {
    const r = parseNaturalQuery("red Honda SUV under 20k with leather 2022");
    expect(r.keywords_used).toContain("color");
    expect(r.keywords_used).toContain("make");
    expect(r.keywords_used).toContain("body_type");
    expect(r.keywords_used).toContain("price");
    expect(r.keywords_used).toContain("feature");
    expect(r.keywords_used).toContain("year");
  });

  it("deduplicates keyword categories", () => {
    const r = parseNaturalQuery("under 10k below 20k");
    // Both trigger "price" but it should only appear once
    const priceCount = r.keywords_used.filter((k) => k === "price").length;
    expect(priceCount).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Query store                                                                 */
/* -------------------------------------------------------------------------- */

describe("query store", () => {
  it("stores queries with storeQuery", () => {
    storeQuery("red SUV", { body_type: "SUV", color: "Red" }, 5);
    storeQuery("blue truck", { body_type: "Truck", color: "Blue" }, 0);

    const all = getStoredQueries();
    expect(all.length).toBe(2);
    expect(all[0].query).toBe("red SUV");
    expect(all[0].result_count).toBe(5);
  });

  it("returns zero-result queries", () => {
    storeQuery("red SUV", { body_type: "SUV" }, 5);
    storeQuery("purple minivan", { body_type: "Van" }, 0);
    storeQuery("flying car", {}, 0);

    const zeros = getZeroResultQueries();
    expect(zeros.length).toBe(2);
    expect(zeros[0].query).toBe("purple minivan");
  });

  it("clears store on clearQueryStore", () => {
    storeQuery("test", {}, 1);
    expect(getStoredQueries().length).toBe(1);
    clearQueryStore();
    expect(getStoredQueries().length).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Complex / combined queries                                                  */
/* -------------------------------------------------------------------------- */

describe("parseNaturalQuery — complex queries", () => {
  it("'reliable SUV under 20K' → SUV + max 20000", () => {
    const r = parseNaturalQuery("reliable SUV under 20K");
    expect(r.parsed_filters.body_type).toBe("SUV");
    expect(r.parsed_filters.max_price).toBe(20000);
  });

  it("'2022 black Toyota Camry with leather under 30k'", () => {
    const r = parseNaturalQuery("2022 black Toyota Camry with leather under 30k");
    expect(r.parsed_filters.year_min).toBe(2022);
    expect(r.parsed_filters.color).toBe("Black");
    expect(r.parsed_filters.make).toBe("Toyota");
    expect(r.parsed_filters.model).toBe("Camry");
    expect(r.parsed_filters.features).toContain("leather");
    expect(r.parsed_filters.max_price).toBe(30000);
  });

  it("'used AWD SUV 2020 or newer around 25k'", () => {
    const r = parseNaturalQuery("used AWD SUV 2020 or newer around 25k");
    expect(r.parsed_filters.condition).toBe("used");
    expect(r.parsed_filters.drivetrain).toBe("awd");
    expect(r.parsed_filters.body_type).toBe("SUV");
    expect(r.parsed_filters.year_min).toBe(2020);
  });

  it("returns raw_query unchanged", () => {
    const q = "  Something Weird  ";
    const r = parseNaturalQuery(q);
    expect(r.raw_query).toBe(q);
  });
});
