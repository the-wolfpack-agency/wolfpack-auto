/**
 * Unit tests for src/lib/search-intent-classifier.ts
 *
 * Tests referrer detection, UTM extraction, query extraction,
 * intent classification, and the main classifySearchIntent() function.
 *
 * Run with: npx jest src/lib/__tests__/search-intent-classifier.test.ts
 */

import {
  detectSource,
  extractSearchQuery,
  extractUTMParams,
  classifyQueryIntent,
  classifyLandingPageIntent,
  classifySearchIntent,
  type SearchIntentResult,
} from "../search-intent-classifier";

/* -------------------------------------------------------------------------- */
/* detectSource — referrer hostname to traffic source                         */
/* -------------------------------------------------------------------------- */

describe("detectSource", () => {
  it("returns 'direct' for empty referrer", () => {
    expect(detectSource("")).toBe("direct");
  });

  it("detects Google", () => {
    expect(detectSource("https://www.google.com/search?q=used+cars")).toBe("google");
  });

  it("detects Google country domains", () => {
    expect(detectSource("https://www.google.co.uk/search?q=ford")).toBe("google");
  });

  it("detects Bing", () => {
    expect(detectSource("https://www.bing.com/search?q=trucks")).toBe("bing");
  });

  it("detects Yahoo", () => {
    expect(detectSource("https://search.yahoo.com/search?p=honda+civic")).toBe("yahoo");
  });

  it("detects DuckDuckGo", () => {
    expect(detectSource("https://duckduckgo.com/?q=cars")).toBe("duckduckgo");
  });

  it("detects Facebook", () => {
    expect(detectSource("https://www.facebook.com/marketplace")).toBe("facebook");
  });

  it("detects Facebook via fb.com", () => {
    expect(detectSource("https://m.fb.com/story")).toBe("facebook");
  });

  it("detects Instagram", () => {
    expect(detectSource("https://www.instagram.com/wolfpackauto")).toBe("instagram");
  });

  it("detects TikTok", () => {
    expect(detectSource("https://www.tiktok.com/@dealer")).toBe("tiktok");
  });

  it("detects YouTube", () => {
    expect(detectSource("https://www.youtube.com/watch?v=abc")).toBe("youtube");
  });

  it("detects YouTube short URLs", () => {
    expect(detectSource("https://youtu.be/abc123")).toBe("youtube");
  });

  it("detects Twitter/X", () => {
    expect(detectSource("https://x.com/status/123")).toBe("twitter");
    expect(detectSource("https://twitter.com/wolfpackauto")).toBe("twitter");
  });

  it("detects Reddit", () => {
    expect(detectSource("https://www.reddit.com/r/cars")).toBe("reddit");
  });

  it("detects Pinterest", () => {
    expect(detectSource("https://www.pinterest.com/pin/123")).toBe("pinterest");
  });

  it("detects LinkedIn", () => {
    expect(detectSource("https://www.linkedin.com/feed")).toBe("linkedin");
  });

  it("returns hostname for unknown referrers", () => {
    expect(detectSource("https://www.cargurus.com/listing/123")).toBe("www.cargurus.com");
  });

  it("returns 'direct' for malformed URLs", () => {
    expect(detectSource("not-a-url")).toBe("direct");
  });
});

/* -------------------------------------------------------------------------- */
/* extractSearchQuery — pulls search query from referrer URL                  */
/* -------------------------------------------------------------------------- */

describe("extractSearchQuery", () => {
  it("returns undefined for empty referrer", () => {
    expect(extractSearchQuery("")).toBeUndefined();
  });

  it("extracts Google 'q' param", () => {
    expect(extractSearchQuery("https://www.google.com/search?q=used+ford+f150")).toBe("used ford f150");
  });

  it("extracts Yahoo 'p' param", () => {
    expect(extractSearchQuery("https://search.yahoo.com/search?p=honda+accord")).toBe("honda accord");
  });

  it("extracts DuckDuckGo 'q' param", () => {
    expect(extractSearchQuery("https://duckduckgo.com/?q=cheap+trucks+near+me")).toBe("cheap trucks near me");
  });

  it("extracts 'query' param", () => {
    expect(extractSearchQuery("https://example.com/search?query=suv")).toBe("suv");
  });

  it("returns undefined when no query param exists", () => {
    expect(extractSearchQuery("https://www.facebook.com/marketplace")).toBeUndefined();
  });

  it("returns undefined for malformed URLs", () => {
    expect(extractSearchQuery("not-a-url")).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* extractUTMParams                                                           */
/* -------------------------------------------------------------------------- */

describe("extractUTMParams", () => {
  it("extracts all UTM params", () => {
    const search = "?utm_source=google&utm_medium=cpc&utm_campaign=spring_sale&utm_content=banner_1&utm_term=used+trucks";
    const result = extractUTMParams(search);

    expect(result.utm_source).toBe("google");
    expect(result.utm_medium).toBe("cpc");
    expect(result.utm_campaign).toBe("spring_sale");
    expect(result.utm_content).toBe("banner_1");
    expect(result.utm_term).toBe("used trucks");
  });

  it("returns empty strings for missing params", () => {
    const result = extractUTMParams("");
    expect(result.utm_source).toBe("");
    expect(result.utm_medium).toBe("");
    expect(result.utm_campaign).toBe("");
    expect(result.utm_content).toBe("");
    expect(result.utm_term).toBe("");
  });

  it("handles partial UTM params", () => {
    const result = extractUTMParams("?utm_source=facebook&utm_campaign=retarget");
    expect(result.utm_source).toBe("facebook");
    expect(result.utm_medium).toBe("");
    expect(result.utm_campaign).toBe("retarget");
  });
});

/* -------------------------------------------------------------------------- */
/* classifyQueryIntent                                                        */
/* -------------------------------------------------------------------------- */

describe("classifyQueryIntent", () => {
  it("returns 'general_browse' for empty query", () => {
    expect(classifyQueryIntent("")).toBe("general_browse");
  });

  it("detects price_shopping intent", () => {
    expect(classifyQueryIntent("cheap trucks under 20000")).toBe("price_shopping");
    expect(classifyQueryIntent("affordable used cars")).toBe("price_shopping");
    expect(classifyQueryIntent("best deal on SUV")).toBe("price_shopping");
    expect(classifyQueryIntent("what is the msrp")).toBe("price_shopping");
  });

  it("detects specific_model intent", () => {
    expect(classifyQueryIntent("2024 ford f-150")).toBe("specific_model");
    expect(classifyQueryIntent("toyota camry review")).toBe("specific_model");
    expect(classifyQueryIntent("honda civic for sale")).toBe("specific_model");
    expect(classifyQueryIntent("jeep wrangler rubicon")).toBe("specific_model");
    expect(classifyQueryIntent("tesla model 3")).toBe("specific_model");
  });

  it("detects near_me intent", () => {
    expect(classifyQueryIntent("used cars near me")).toBe("near_me");
    expect(classifyQueryIntent("dealership nearby")).toBe("near_me");
    expect(classifyQueryIntent("trucks close to me")).toBe("near_me");
    expect(classifyQueryIntent("cars in new york city")).toBe("near_me");
  });

  it("detects financing intent", () => {
    expect(classifyQueryIntent("auto financing options")).toBe("financing");
    expect(classifyQueryIntent("best car loan rates")).toBe("financing");
    expect(classifyQueryIntent("0 apr deals")).toBe("financing");
    expect(classifyQueryIntent("monthly payment calculator")).toBe("financing");
    expect(classifyQueryIntent("lease vs buy")).toBe("financing");
  });

  it("detects trade_in intent", () => {
    expect(classifyQueryIntent("trade in value for my car")).toBe("trade_in");
    expect(classifyQueryIntent("kbb value estimate")).toBe("trade_in");
    expect(classifyQueryIntent("what's my truck worth")).toBe("trade_in");
    expect(classifyQueryIntent("vehicle appraisal")).toBe("trade_in");
  });

  it("detects service intent", () => {
    expect(classifyQueryIntent("oil change near me")).toBe("service");
    expect(classifyQueryIntent("brake repair cost")).toBe("service");
    expect(classifyQueryIntent("car maintenance schedule")).toBe("service");
    expect(classifyQueryIntent("tire rotation appointment")).toBe("service");
  });

  it("returns general_browse for generic queries", () => {
    expect(classifyQueryIntent("wolfpack auto")).toBe("general_browse");
    expect(classifyQueryIntent("car dealership reviews")).toBe("general_browse");
  });
});

/* -------------------------------------------------------------------------- */
/* classifyLandingPageIntent                                                  */
/* -------------------------------------------------------------------------- */

describe("classifyLandingPageIntent", () => {
  it("returns null for home page", () => {
    expect(classifyLandingPageIntent("/")).toBeNull();
  });

  it("detects financing page", () => {
    expect(classifyLandingPageIntent("/financing")).toBe("financing");
    expect(classifyLandingPageIntent("/financing/apply")).toBe("financing");
  });

  it("detects trade-in page", () => {
    expect(classifyLandingPageIntent("/trade-in")).toBe("trade_in");
    expect(classifyLandingPageIntent("/trade-in/estimate")).toBe("trade_in");
  });

  it("detects service page", () => {
    expect(classifyLandingPageIntent("/service")).toBe("service");
    expect(classifyLandingPageIntent("/service/schedule")).toBe("service");
  });

  it("detects specific vehicle (VIN) page", () => {
    expect(classifyLandingPageIntent("/inventory/1FTFW1E87NFA12345")).toBe("specific_model");
  });

  it("detects inventory browsing", () => {
    expect(classifyLandingPageIntent("/inventory")).toBe("general_browse");
    expect(classifyLandingPageIntent("/inventory?make=ford")).toBe("general_browse");
  });
});

/* -------------------------------------------------------------------------- */
/* classifySearchIntent — full integration                                    */
/* -------------------------------------------------------------------------- */

describe("classifySearchIntent", () => {
  it("classifies direct visit with no referrer", () => {
    const result = classifySearchIntent({
      referrer: "",
      search: "",
      pathname: "/",
    });

    expect(result.source).toBe("direct");
    expect(result.medium).toBe("direct");
    expect(result.intent_category).toBe("direct");
    expect(result.landing_page).toBe("/");
    expect(result.raw_query).toBeUndefined();
  });

  it("classifies Google organic with search query", () => {
    const result = classifySearchIntent({
      referrer: "https://www.google.com/search?q=cheap+trucks+near+me",
      search: "",
      pathname: "/inventory",
    });

    expect(result.source).toBe("google");
    expect(result.medium).toBe("organic");
    expect(result.intent_category).toBe("price_shopping");
    expect(result.raw_query).toBe("cheap trucks near me");
  });

  it("classifies Facebook social traffic", () => {
    const result = classifySearchIntent({
      referrer: "https://www.facebook.com/wolfpackauto",
      search: "",
      pathname: "/inventory",
    });

    expect(result.source).toBe("facebook");
    expect(result.medium).toBe("social");
    expect(result.intent_category).toBe("general_browse");
  });

  it("uses UTM params for medium and campaign", () => {
    const result = classifySearchIntent({
      referrer: "https://www.google.com/",
      search: "?utm_source=google&utm_medium=cpc&utm_campaign=spring_sale&utm_term=used+f150",
      pathname: "/inventory",
    });

    expect(result.source).toBe("google");
    expect(result.medium).toBe("cpc");
    expect(result.campaign).toBe("spring_sale");
    expect(result.term).toBe("used f150");
    // UTM term is used for intent classification when no raw query
    expect(result.intent_category).toBe("specific_model");
  });

  it("landing page overrides intent when no query or UTM term", () => {
    const result = classifySearchIntent({
      referrer: "https://www.facebook.com/ad",
      search: "",
      pathname: "/financing",
    });

    expect(result.intent_category).toBe("financing");
  });

  it("raw_query takes priority over landing page for intent", () => {
    const result = classifySearchIntent({
      referrer: "https://www.google.com/search?q=oil+change+near+me",
      search: "",
      pathname: "/financing",
    });

    // Query says service, even though landing page is financing
    expect(result.intent_category).toBe("service");
    expect(result.raw_query).toBe("oil change near me");
  });

  it("classifies email medium", () => {
    const result = classifySearchIntent({
      referrer: "",
      search: "?utm_source=newsletter&utm_medium=email&utm_campaign=weekly_deals",
      pathname: "/inventory",
    });

    expect(result.medium).toBe("email");
    expect(result.campaign).toBe("weekly_deals");
  });

  it("handles VIN landing page as specific_model intent", () => {
    const result = classifySearchIntent({
      referrer: "https://www.google.com/",
      search: "",
      pathname: "/inventory/1FTFW1E87NFA12345",
    });

    expect(result.intent_category).toBe("specific_model");
  });

  it("includes all UTM fields in result", () => {
    const result = classifySearchIntent({
      referrer: "",
      search: "?utm_source=instagram&utm_medium=social&utm_campaign=summer&utm_content=reel_1&utm_term=trucks",
      pathname: "/",
    });

    expect(result.content).toBe("reel_1");
    expect(result.term).toBe("trucks");
    expect(result.campaign).toBe("summer");
  });

  it("handles malformed referrer gracefully", () => {
    const result = classifySearchIntent({
      referrer: "not-a-valid-url",
      search: "",
      pathname: "/",
    });

    expect(result.source).toBe("direct");
    expect(result.intent_category).toBe("direct");
  });
});
