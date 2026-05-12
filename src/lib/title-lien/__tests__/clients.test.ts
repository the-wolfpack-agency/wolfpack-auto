/**
 * Unit tests for the per-state title/lien clients + dispatcher.
 *
 * Stream E "honest mode": none of the three states currently has a true
 * free public API. CA returns state_not_supported_yet; TX + FL return
 * paid_subscription_required. The dispatcher routes correctly and never
 * throws.
 */

import { caClient } from "@/lib/title-lien/ca-client";
import { txClient } from "@/lib/title-lien/tx-client";
import { flClient, parseFlhsmvResponse } from "@/lib/title-lien/fl-client";
import {
  dispatchTitleLien,
  isStateRegistered,
  registeredStateCodes,
} from "@/lib/title-lien/dispatcher";

describe("California client (honest stub)", () => {
  it("is marked unsupported with state_not_supported_yet", async () => {
    expect(caClient.state_code).toBe("CA");
    expect(caClient.supported).toBe(false);
    const r = await caClient.lookup("1HGCM82633A123456");
    expect(r.supported).toBe(false);
    expect(r.reason).toBe("state_not_supported_yet");
    expect(r.source).toBe("unsupported");
    expect(r.vin).toBe("1HGCM82633A123456");
    expect(r.state_code).toBe("CA");
  });

  it("never throws on any input", async () => {
    await expect(caClient.lookup("")).resolves.toBeDefined();
    await expect(caClient.lookup("BOGUSVIN")).resolves.toBeDefined();
  });
});

describe("Texas client (honest stub)", () => {
  it("is marked unsupported with paid_subscription_required", async () => {
    expect(txClient.state_code).toBe("TX");
    expect(txClient.supported).toBe(false);
    const r = await txClient.lookup("1HGCM82633A123456");
    expect(r.supported).toBe(false);
    expect(r.reason).toBe("paid_subscription_required");
    expect(r.source).toBe("unsupported");
  });
});

describe("Florida client (honest stub)", () => {
  it("is marked unsupported with paid_subscription_required", async () => {
    expect(flClient.state_code).toBe("FL");
    expect(flClient.supported).toBe(false);
    const r = await flClient.lookup("1HGCM82633A123456");
    expect(r.supported).toBe(false);
    expect(r.reason).toBe("paid_subscription_required");
    expect(r.source).toBe("unsupported");
  });

  it("parseFlhsmvResponse extracts has_lien + status from a partner-shaped payload", () => {
    const parsed = parseFlhsmvResponse({
      vin: "1HGCM82633A123456",
      titleStatus: "CLEAN",
      hasLien: true,
      lienholderName: "BANK OF AMERICA",
    });
    expect(parsed.has_lien).toBe(true);
    expect(parsed.title_status).toBe("CLEAN");
    expect(parsed.lienholder_name).toBe("BANK OF AMERICA");
  });

  it("parseFlhsmvResponse handles missing fields gracefully", () => {
    const parsed = parseFlhsmvResponse({});
    expect(parsed.has_lien).toBeUndefined();
    expect(parsed.title_status).toBeNull();
    expect(parsed.lienholder_name).toBeNull();
  });

  it("parseFlhsmvResponse trims whitespace and drops empty strings", () => {
    const parsed = parseFlhsmvResponse({
      titleStatus: "   ",
      lienholderName: "",
    });
    expect(parsed.title_status).toBeNull();
    expect(parsed.lienholder_name).toBeNull();
  });
});

describe("dispatcher", () => {
  it("registered states are CA, TX, FL", () => {
    expect(registeredStateCodes().sort()).toEqual(["CA", "FL", "TX"]);
    expect(isStateRegistered("CA")).toBe(true);
    expect(isStateRegistered("ca")).toBe(true);
    expect(isStateRegistered("TX")).toBe(true);
    expect(isStateRegistered("FL")).toBe(true);
    expect(isStateRegistered("NY")).toBe(false);
  });

  it("routes a CA lookup to the CA client", async () => {
    const r = await dispatchTitleLien("1HGCM82633A123456", "CA");
    expect(r.state_code).toBe("CA");
    expect(r.reason).toBe("state_not_supported_yet");
  });

  it("routes a TX lookup to the TX client", async () => {
    const r = await dispatchTitleLien("1HGCM82633A123456", "tx");
    expect(r.state_code).toBe("TX");
    expect(r.reason).toBe("paid_subscription_required");
  });

  it("routes a FL lookup to the FL client", async () => {
    const r = await dispatchTitleLien("1HGCM82633A123456", "FL");
    expect(r.state_code).toBe("FL");
    expect(r.reason).toBe("paid_subscription_required");
  });

  it("returns state_not_supported_yet for an unregistered state", async () => {
    const r = await dispatchTitleLien("1HGCM82633A123456", "NY");
    expect(r.supported).toBe(false);
    expect(r.reason).toBe("state_not_supported_yet");
    expect(r.source).toBe("unsupported");
  });

  it("normalizes VIN to upper-case and state to upper-case", async () => {
    const r = await dispatchTitleLien("1hgcm82633a123456", "fl");
    expect(r.vin).toBe("1HGCM82633A123456");
    expect(r.state_code).toBe("FL");
  });

  it("collapses any thrown client error to an upstream_error result", async () => {
    // Inject a throwing client by re-importing the dispatcher module and
    // mocking the FL client.
    jest.isolateModules(() => {
      jest.doMock("@/lib/title-lien/fl-client", () => ({
        flClient: {
          state_code: "FL",
          supported: true,
          lookup: () => {
            throw new Error("simulated upstream blow-up");
          },
        },
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const isolated = require("@/lib/title-lien/dispatcher");
      return isolated
        .dispatchTitleLien("1HGCM82633A123456", "FL")
        .then(
          (r: { reason: string; supported: boolean; source: string }) => {
            expect(r.supported).toBe(false);
            expect(r.reason).toBe("upstream_error");
            expect(r.source).toBe("unsupported");
          },
        );
    });
  });
});
