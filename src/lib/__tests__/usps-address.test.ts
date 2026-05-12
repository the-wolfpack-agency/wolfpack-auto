/**
 * USPS Web Tools Address Validation client tests.
 *
 *   - parse the canonical XML response shapes
 *   - cache miss / hit
 *   - graceful no-USERID fallback
 *   - graceful fail-open on upstream HTTP errors
 *   - status classification (valid / correctable / invalid / unverifiable)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
jest.mock("@/lib/cache", () => ({
  cacheGet: (...args: any[]) => mockCacheGet(...args),
  cacheSet: (...args: any[]) => mockCacheSet(...args),
}));

import {
  buildVerifyXml,
  extractUspsError,
  extractXmlField,
  normalizeAddressKey,
  parseVerifyResponse,
  unconfiguredResult,
  validateAddress,
} from "@/lib/usps-address";

beforeEach(() => {
  mockCacheGet.mockReset();
  mockCacheSet.mockReset();
  process.env.USPS_USER_ID = "TEST_USER_ID";
});

/* ---------------------------------------------------------------------- */
/*  Pure helpers                                                            */
/* ---------------------------------------------------------------------- */

describe("normalizeAddressKey", () => {
  it("joins non-empty parts comma-separated upper-case", () => {
    expect(
      normalizeAddressKey({
        street1: "123 Main St",
        city: "Tampa",
        state: "FL",
        zip: "33601",
      }),
    ).toBe("123 MAIN ST, TAMPA, FL, 33601");
  });

  it("drops empty / whitespace-only parts", () => {
    expect(
      normalizeAddressKey({
        street1: "123 Main St",
        street2: "   ",
        city: "Tampa",
        state: "FL",
        zip: "33601",
      }),
    ).toBe("123 MAIN ST, TAMPA, FL, 33601");
  });

  it("returns empty string on fully empty input", () => {
    expect(normalizeAddressKey({ street1: "" })).toBe("");
  });
});

describe("extractXmlField", () => {
  it("extracts a present field", () => {
    expect(
      extractXmlField("<Address><City>TAMPA</City></Address>", "City"),
    ).toBe("TAMPA");
  });

  it("returns null on missing field", () => {
    expect(extractXmlField("<Address></Address>", "City")).toBeNull();
  });

  it("returns null on empty field", () => {
    expect(extractXmlField("<City></City>", "City")).toBeNull();
  });

  it("is case-insensitive on tag name", () => {
    expect(extractXmlField("<city>FT WORTH</city>", "City")).toBe("FT WORTH");
  });
});

describe("extractUspsError", () => {
  it("returns the error Description when present", () => {
    expect(
      extractUspsError("<Error><Description>Address Not Found.</Description></Error>"),
    ).toBe("Address Not Found.");
  });

  it("returns null when no error", () => {
    expect(extractUspsError("<Address><City>TAMPA</City></Address>")).toBeNull();
  });
});

describe("buildVerifyXml", () => {
  it("includes the USERID + canonical Address1/Address2 swap", () => {
    const xml = buildVerifyXml(
      {
        street1: "123 Main St",
        street2: "Apt 4",
        city: "Tampa",
        state: "FL",
        zip: "33601",
      },
      "TEST_USER_ID",
    );
    expect(xml).toContain('USERID="TEST_USER_ID"');
    // USPS contract: Address1 = secondary, Address2 = primary
    expect(xml).toContain("<Address1>Apt 4</Address1>");
    expect(xml).toContain("<Address2>123 Main St</Address2>");
    expect(xml).toContain("<City>Tampa</City>");
    expect(xml).toContain("<State>FL</State>");
    expect(xml).toContain("<Zip5>33601</Zip5>");
  });

  it("xml-escapes special characters", () => {
    const xml = buildVerifyXml(
      { street1: 'Smith & Co "Main" <hq>' },
      "ABC",
    );
    expect(xml).toContain("Smith &amp; Co &quot;Main&quot; &lt;hq&gt;");
  });
});

/* ---------------------------------------------------------------------- */
/*  Response parsing                                                        */
/* ---------------------------------------------------------------------- */

describe("parseVerifyResponse", () => {
  it("returns valid when canonical equals input", () => {
    // The canonical builder concatenates city/state/zip with single spaces,
    // separated from the street line by ", ". Match that exact shape so the
    // status falls into the "valid" bucket.
    const inputKey = "123 MAIN ST, TAMPA FL 33601";
    const xml = `
      <AddressValidateResponse><Address ID="0">
        <Address2>123 MAIN ST</Address2>
        <City>TAMPA</City>
        <State>FL</State>
        <Zip5>33601</Zip5>
        <DPVConfirmation>Y</DPVConfirmation>
      </Address></AddressValidateResponse>
    `;
    const r = parseVerifyResponse(xml, inputKey);
    expect(r.validated).toBe(true);
    expect(r.status).toBe("valid");
    expect(r.canonical_address).toBe("123 MAIN ST, TAMPA FL 33601");
    expect(r.components.dpv_confirmation).toBe("Y");
  });

  it("returns correctable when canonical differs from input", () => {
    const inputKey = "123 MAIN, TAMPA, FL, 33601";
    const xml = `
      <Address2>123 MAIN STREET</Address2>
      <City>TAMPA</City>
      <State>FL</State>
      <Zip5>33601</Zip5>
    `;
    const r = parseVerifyResponse(xml, inputKey);
    expect(r.validated).toBe(true);
    expect(r.status).toBe("correctable");
    expect(r.canonical_address).not.toBe(inputKey);
  });

  it("returns invalid on <Error><Description>", () => {
    const xml = `<Error><Description>Address Not Found.</Description></Error>`;
    const r = parseVerifyResponse(xml, "FOO");
    expect(r.validated).toBe(false);
    expect(r.status).toBe("invalid");
    expect(r.reason).toBe("usps_error");
  });

  it("returns unverifiable when USPS replies with no usable fields", () => {
    const r = parseVerifyResponse(
      "<AddressValidateResponse><Address /></AddressValidateResponse>",
      "FOO",
    );
    expect(r.status).toBe("unverifiable");
  });
});

/* ---------------------------------------------------------------------- */
/*  unconfiguredResult                                                      */
/* ---------------------------------------------------------------------- */

describe("unconfiguredResult", () => {
  it("returns a graceful service_not_configured payload", () => {
    const r = unconfiguredResult("FOO");
    expect(r.validated).toBe(false);
    expect(r.status).toBe("unverifiable");
    expect(r.reason).toBe("service_not_configured");
    expect(r.source).toBe("unverifiable");
  });
});

/* ---------------------------------------------------------------------- */
/*  validateAddress end-to-end                                              */
/* ---------------------------------------------------------------------- */

describe("validateAddress", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns service_not_configured when USPS_USER_ID is unset", async () => {
    delete process.env.USPS_USER_ID;
    const r = await validateAddress({ street1: "123 Main St" });
    expect(r.status).toBe("unverifiable");
    expect(r.reason).toBe("service_not_configured");
  });

  it("returns invalid_input when normalized input is empty", async () => {
    const r = await validateAddress({ street1: "  " });
    expect(r.status).toBe("invalid");
    expect(r.reason).toBe("invalid_input");
  });

  it("returns cached result with source:'cache' on hit", async () => {
    mockCacheGet.mockResolvedValueOnce({
      validated: true,
      status: "valid",
      input_address: "FOO",
      canonical_address: "FOO",
      components: {
        street1: null,
        street2: null,
        city: null,
        state: null,
        zip5: null,
        zip4: null,
        dpv_confirmation: null,
      },
      source: "usps",
      looked_up_at: new Date().toISOString(),
    });
    const r = await validateAddress({ street1: "FOO" });
    expect(r.source).toBe("cache");
    expect(r.status).toBe("valid");
  });

  it("hits USPS, caches a valid response", async () => {
    mockCacheGet.mockResolvedValueOnce(null);
    const xml = `
      <Address2>123 MAIN ST</Address2>
      <City>TAMPA</City>
      <State>FL</State>
      <Zip5>33601</Zip5>
    `;
    globalThis.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(xml),
    } as Response);

    const r = await validateAddress({
      street1: "123 Main St",
      city: "Tampa",
      state: "FL",
      zip: "33601",
    });
    expect(r.validated).toBe(true);
    expect(["valid", "correctable"]).toContain(r.status);
    expect(mockCacheSet).toHaveBeenCalled();
  });

  it("returns upstream_error on HTTP non-200, never throws", async () => {
    mockCacheGet.mockResolvedValueOnce(null);
    globalThis.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: () => Promise.resolve(""),
    } as Response);
    const r = await validateAddress({ street1: "123 Main St" });
    expect(r.status).toBe("unverifiable");
    expect(r.reason).toBe("upstream_error");
  });

  it("returns upstream_error when fetch throws (network failure)", async () => {
    mockCacheGet.mockResolvedValueOnce(null);
    globalThis.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error("network down"));
    const r = await validateAddress({ street1: "123 Main St" });
    expect(r.status).toBe("unverifiable");
    expect(r.reason).toBe("upstream_error");
  });
});
