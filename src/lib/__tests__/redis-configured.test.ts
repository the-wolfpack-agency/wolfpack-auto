/**
 * Unit tests for isRedisConfigured().
 *
 * The rule this pins: an UNSET REDIS_URL must not mean "localhost" in
 * production. There is no localhost Redis on a serverless deploy, so the old
 * `process.env.REDIS_URL || "redis://localhost:6379"` default made every call
 * retry an address that can never answer. Outside production an unset value is
 * still allowed to mean localhost, because a developer may genuinely be running
 * one.
 */

const ORIGINAL_URL = process.env.REDIS_URL;
const ORIGINAL_ENV = process.env.NODE_ENV;

function setEnv(redisUrl: string | undefined, nodeEnv: string) {
  if (redisUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = redisUrl;
  // NODE_ENV is readonly in @types/node; this is the standard test override.
  Object.defineProperty(process.env, "NODE_ENV", { value: nodeEnv, configurable: true });
}

async function loadIsConfigured() {
  jest.resetModules();
  const mod = await import("@/lib/redis");
  return mod.isRedisConfigured;
}

afterEach(() => {
  setEnv(ORIGINAL_URL, ORIGINAL_ENV ?? "test");
});

describe("isRedisConfigured", () => {
  it("is false when REDIS_URL is unset in production (never localhost)", async () => {
    setEnv(undefined, "production");
    expect((await loadIsConfigured())()).toBe(false);
  });

  it("is false when REDIS_URL is explicitly empty (shadow/CI)", async () => {
    setEnv("", "production");
    expect((await loadIsConfigured())()).toBe(false);
  });

  it("is false when explicitly empty outside production too", async () => {
    setEnv("", "development");
    expect((await loadIsConfigured())()).toBe(false);
  });

  it("is true when REDIS_URL is set in production", async () => {
    setEnv("redis://real-host:6379", "production");
    expect((await loadIsConfigured())()).toBe(true);
  });

  it("is true when unset outside production (a local Redis may exist)", async () => {
    setEnv(undefined, "development");
    expect((await loadIsConfigured())()).toBe(true);
  });
});
