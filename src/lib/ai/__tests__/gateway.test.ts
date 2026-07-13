/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for the wrapped Vercel AI Gateway client.
 *
 * The wrapper must NEVER throw — every failure maps to a typed
 * `{ ok: false, error }`. `fetch` is stubbed so no network is touched.
 */

import { runGatewayChat, GATEWAY_TIEBREAKER_MODEL } from "../gateway";

const ORIGINAL_KEY = process.env.AI_GATEWAY_API_KEY;
const ORIGINAL_FETCH = global.fetch;

function jsonResponse(body: unknown, status = 200): any {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  process.env.AI_GATEWAY_API_KEY = "test-key";
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.AI_GATEWAY_API_KEY;
  else process.env.AI_GATEWAY_API_KEY = ORIGINAL_KEY;
});

const baseReq = { system: "s", user: "u", timeoutMs: 2000 };

test("missing key → { missing_key } and fetch is never called", async () => {
  delete process.env.AI_GATEWAY_API_KEY;
  const spy = jest.fn();
  global.fetch = spy as any;
  const res = await runGatewayChat(baseReq);
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.error.kind).toBe("missing_key");
  expect(spy).not.toHaveBeenCalled();
});

test("200 with content → ok:true text", async () => {
  global.fetch = jest.fn().mockResolvedValue(
    jsonResponse({ choices: [{ message: { content: "  2  " } }] }),
  ) as any;
  const res = await runGatewayChat(baseReq);
  expect(res.ok).toBe(true);
  if (res.ok) expect(res.value.text).toBe("2");
});

test("sends the verified model string + bearer auth", async () => {
  const fetchMock = jest.fn().mockResolvedValue(
    jsonResponse({ choices: [{ message: { content: "0" } }] }),
  );
  global.fetch = fetchMock as any;
  await runGatewayChat(baseReq);
  const [, init] = fetchMock.mock.calls[0];
  const body = JSON.parse(init.body);
  expect(body.model).toBe(GATEWAY_TIEBREAKER_MODEL);
  expect(body.temperature).toBe(0);
  expect(init.headers.authorization).toBe("Bearer test-key");
});

test("non-2xx → http_error with status", async () => {
  global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, 503)) as any;
  const res = await runGatewayChat(baseReq);
  expect(res.ok).toBe(false);
  if (!res.ok) {
    expect(res.error.kind).toBe("http_error");
    expect(res.error.status).toBe(503);
  }
});

test("2xx but no content → invalid_response", async () => {
  global.fetch = jest.fn().mockResolvedValue(
    jsonResponse({ choices: [{ message: {} }] }),
  ) as any;
  const res = await runGatewayChat(baseReq);
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.error.kind).toBe("invalid_response");
});

test("AbortError → timeout", async () => {
  const err = new Error("aborted");
  err.name = "AbortError";
  global.fetch = jest.fn().mockRejectedValue(err) as any;
  const res = await runGatewayChat(baseReq);
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.error.kind).toBe("timeout");
});

test("generic fetch rejection → network (never throws)", async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error("ECONNRESET")) as any;
  const res = await runGatewayChat(baseReq);
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.error.kind).toBe("network");
});
