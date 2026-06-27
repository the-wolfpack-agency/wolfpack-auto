/**
 * fetchJson: the silent-blank-page fix. A non-2xx response must THROW (HttpError)
 * so callers' try/catch handles it, instead of the error body being parsed as data.
 */
import { fetchJson, HttpError } from "@/lib/safe-fetch";

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

function mockFetch(status: number, body: unknown) {
  global.fetch = (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

it("returns parsed JSON on a 2xx", async () => {
  mockFetch(200, { customers: [{ id: "c1" }] });
  const data = await fetchJson<{ customers: { id: string }[] }>("/api/admin/customers");
  expect(data.customers[0].id).toBe("c1");
});

it("THROWS HttpError on a non-2xx (so the body is never parsed as data)", async () => {
  mockFetch(401, { error: "unauthorized" });
  await expect(fetchJson("/api/admin/customers")).rejects.toBeInstanceOf(HttpError);
  mockFetch(500, { error: "boom" });
  await expect(fetchJson("/api/admin/customers")).rejects.toMatchObject({ status: 500 });
});
