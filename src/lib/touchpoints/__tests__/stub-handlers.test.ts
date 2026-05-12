/**
 * Unit tests for the NFC / RFID / iBeacon handler stubs.
 *
 * Year-2 work -- every method should fail with TouchpointNotSupportedError
 * (parse) or return false (validate). These tests pin that contract so a
 * future "wire the real NFC reader" change is forced to update the test
 * suite -- i.e. you cannot accidentally silently lose the stub.
 */

import {
  createBeaconHandler,
  createNfcHandler,
  createRfidHandler,
} from "..";
import { TouchpointNotSupportedError } from "../types";

describe("NfcHandler (stub)", () => {
  const handler = createNfcHandler();

  test("declares nfc provider", () => {
    expect(handler.type).toBe("nfc");
  });

  test("supports set is empty (no formats wired yet)", () => {
    expect(handler.supports.size).toBe(0);
  });

  test("parse throws TouchpointNotSupportedError", async () => {
    await expect(handler.parse("anything")).rejects.toBeInstanceOf(
      TouchpointNotSupportedError,
    );
  });

  test("validate returns false", async () => {
    await expect(
      handler.validate({ id: "x", payload: {} }),
    ).resolves.toBe(false);
  });
});

describe("RfidHandler (stub)", () => {
  const handler = createRfidHandler();

  test("declares rfid provider", () => {
    expect(handler.type).toBe("rfid");
  });

  test("parse throws TouchpointNotSupportedError", async () => {
    await expect(handler.parse("EPC:1234")).rejects.toBeInstanceOf(
      TouchpointNotSupportedError,
    );
  });

  test("validate returns false", async () => {
    await expect(handler.validate({ id: "x", payload: {} })).resolves.toBe(false);
  });
});

describe("BeaconHandler (stub)", () => {
  const handler = createBeaconHandler();

  test("declares beacon provider", () => {
    expect(handler.type).toBe("beacon");
  });

  test("parse throws TouchpointNotSupportedError", async () => {
    await expect(
      handler.parse('{"uuid":"abc","major":1,"minor":2}'),
    ).rejects.toBeInstanceOf(TouchpointNotSupportedError);
  });

  test("validate returns false", async () => {
    await expect(handler.validate({ id: "x", payload: {} })).resolves.toBe(false);
  });
});
