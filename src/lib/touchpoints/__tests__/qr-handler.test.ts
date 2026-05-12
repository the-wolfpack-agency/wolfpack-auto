/**
 * Unit tests for the QR touchpoint handler.
 *
 * Exercises every supported format (wolfpack_uri, wp_signed, url, json)
 * plus failure modes (empty input, garbage, malformed JSON, missing
 * touchpoint_id, bad signature). Signature handling is tested with a
 * deterministic secret so HMAC drift is caught.
 */

import { createQrHandler, signQrPayload, QrHandler } from "../qr-handler";
import { TouchpointParseError } from "../types";

const TENANT_ID = "11111111-1111-4111-9111-111111111111";

describe("QrHandler.parse", () => {
  const handler = createQrHandler();

  test("parses canonical wolfpack_uri", async () => {
    const parsed = await handler.parse(`wp://qr/${TENANT_ID}/vehicle-VIN123`);
    expect(parsed.id).toBe("vehicle-VIN123");
    expect(parsed.payload.format).toBe("wolfpack_uri");
    expect(parsed.payload.tenant_id).toBe(TENANT_ID);
  });

  test("parses signed envelope (wp1.<claims>.<sig>)", async () => {
    const secret = "test-secret";
    const claims = { touchpoint_id: "tp-42", tenant_id: TENANT_ID };
    const raw = signQrPayload(claims, secret);
    const parsed = await handler.parse(raw);
    expect(parsed.id).toBe("tp-42");
    expect(parsed.payload.format).toBe("wp_signed");
    expect(parsed.payload.claims).toEqual(claims);
  });

  test("parses plain URL -- touchpoint_id from last path segment", async () => {
    const parsed = await handler.parse(
      "https://example.com/walkaround/VIN123",
    );
    expect(parsed.id).toBe("VIN123");
    expect(parsed.payload.format).toBe("url");
    expect(parsed.payload.host).toBe("example.com");
  });

  test("parses JSON envelope with touchpoint_id", async () => {
    const parsed = await handler.parse(
      JSON.stringify({ touchpoint_id: "tp-9", extra: 1 }),
    );
    expect(parsed.id).toBe("tp-9");
    expect(parsed.payload.format).toBe("json");
    expect(parsed.payload.extra).toBe(1);
  });

  test("Buffer input is accepted", async () => {
    const parsed = await handler.parse(
      Buffer.from(`wp://qr/${TENANT_ID}/buf-id`),
    );
    expect(parsed.id).toBe("buf-id");
  });

  test("throws on empty input", async () => {
    await expect(handler.parse("")).rejects.toBeInstanceOf(TouchpointParseError);
    await expect(handler.parse("   ")).rejects.toBeInstanceOf(TouchpointParseError);
  });

  test("throws on garbage input", async () => {
    await expect(handler.parse("not-a-qr-payload")).rejects.toBeInstanceOf(
      TouchpointParseError,
    );
  });

  test("throws on malformed signed envelope (bad JSON claims)", async () => {
    // Looks like wp1.<claims>.<sig> but claims is not valid base64url JSON.
    await expect(
      handler.parse("wp1.bm90X2pzb24.aGVsbG8"),
    ).rejects.toBeInstanceOf(TouchpointParseError);
  });

  test("throws on JSON missing touchpoint_id", async () => {
    await expect(handler.parse('{"foo":"bar"}')).rejects.toBeInstanceOf(
      TouchpointParseError,
    );
  });

  test("throws on malformed URL", async () => {
    await expect(handler.parse("http://[bad-url")).rejects.toBeInstanceOf(
      TouchpointParseError,
    );
  });

  test("supports list declares the four formats", () => {
    expect(handler.supports.has("url")).toBe(true);
    expect(handler.supports.has("json")).toBe(true);
    expect(handler.supports.has("wp_signed")).toBe(true);
    expect(handler.supports.has("wolfpack_uri")).toBe(true);
    expect(handler.supports.has("nfc")).toBe(false);
  });
});

describe("QrHandler.validate", () => {
  const secret = "round-trip-secret";

  test("unsigned formats pass validation by default", async () => {
    const handler = createQrHandler();
    const url = await handler.parse(`wp://qr/${TENANT_ID}/walkaround`);
    expect(await handler.validate(url)).toBe(true);
    const json = await handler.parse(JSON.stringify({ touchpoint_id: "x" }));
    expect(await handler.validate(json)).toBe(true);
  });

  test("signed envelope validates with the matching secret", async () => {
    const handler = new QrHandler({
      resolveSigningSecret: async () => secret,
    });
    const raw = signQrPayload(
      { touchpoint_id: "tp-valid", tenant_id: TENANT_ID },
      secret,
    );
    const parsed = await handler.parse(raw);
    expect(await handler.validate(parsed)).toBe(true);
  });

  test("signed envelope rejects with wrong secret", async () => {
    const handler = new QrHandler({
      resolveSigningSecret: async () => "different-secret",
    });
    const raw = signQrPayload(
      { touchpoint_id: "tp-bad", tenant_id: TENANT_ID },
      secret,
    );
    const parsed = await handler.parse(raw);
    expect(await handler.validate(parsed)).toBe(false);
  });

  test("signed envelope rejects when resolver returns null", async () => {
    const handler = new QrHandler({
      resolveSigningSecret: async () => null,
    });
    const raw = signQrPayload(
      { touchpoint_id: "tp-no-secret", tenant_id: TENANT_ID },
      secret,
    );
    const parsed = await handler.parse(raw);
    expect(await handler.validate(parsed)).toBe(false);
  });

  test("signed envelope rejects when tenant_id is missing from claims", async () => {
    const handler = new QrHandler({
      resolveSigningSecret: async () => secret,
    });
    // Build a signed envelope without tenant_id in claims.
    const raw = signQrPayload({ touchpoint_id: "tp-no-tenant" }, secret);
    const parsed = await handler.parse(raw);
    expect(await handler.validate(parsed)).toBe(false);
  });
});
