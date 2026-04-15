/**
 * crypto/sign — unit tests
 *
 * Covers:
 *   - signToken + verifyToken roundtrip
 *   - Tampered token rejection (bad signature)
 *   - Expired token rejection
 *   - ml-dsa-65-hybrid throws NotImplementedError on sign
 *   - ml-dsa-65-hybrid returns valid:false on verify
 *   - Unknown algorithm rejected on sign and verify
 *   - Analytics events emitted (system.token_signed / token_verified / token_verify_failed)
 */

// Suppress console output during tests
jest.spyOn(console, "error").mockImplementation(() => {});
jest.spyOn(console, "warn").mockImplementation(() => {});

/* -------------------------------------------------------------------------- */
/* Mocks                                                                       */
/* -------------------------------------------------------------------------- */

const mockTrackSystem = jest.fn();

jest.mock("@/lib/analytics-hooks", () => ({
  trackSystem: (...args: unknown[]) => mockTrackSystem(...args),
}));

/* -------------------------------------------------------------------------- */
/* Subject                                                                     */
/* -------------------------------------------------------------------------- */

import { signToken, verifyToken, NotImplementedError } from "../crypto/sign";
import { ALGORITHMS, CURRENT_SIGN_ALGORITHM } from "../crypto/algorithms";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Wait for all pending microtasks (dynamic imports / promise chains). */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

beforeEach(() => {
  mockTrackSystem.mockClear();
  // Ensure NEXTAUTH_SECRET is set so getHmacSecret() doesn't throw
  process.env.NEXTAUTH_SECRET = "test-secret-for-unit-tests";
  // NODE_ENV is set to "test" by Jest automatically; no assignment needed
});

/* -------------------------------------------------------------------------- */
/* Algorithm registry                                                          */
/* -------------------------------------------------------------------------- */

describe("ALGORITHMS registry", () => {
  test("contains hs256, rs256, es256, ml-dsa-65-hybrid", () => {
    expect(Object.keys(ALGORITHMS)).toEqual(
      expect.arrayContaining(["hs256", "rs256", "es256", "ml-dsa-65-hybrid"]),
    );
  });

  test("ml-dsa-65-hybrid is marked quantumSafe=true", () => {
    expect(ALGORITHMS["ml-dsa-65-hybrid"].quantumSafe).toBe(true);
  });

  test("hs256 is marked quantumSafe=false", () => {
    expect(ALGORITHMS["hs256"].quantumSafe).toBe(false);
  });

  test("CURRENT_SIGN_ALGORITHM is hs256 (current default)", () => {
    expect(CURRENT_SIGN_ALGORITHM).toBe("hs256");
  });
});

/* -------------------------------------------------------------------------- */
/* Happy path: sign + verify roundtrip                                        */
/* -------------------------------------------------------------------------- */

describe("signToken / verifyToken roundtrip", () => {
  test("signs and verifies a simple payload", async () => {
    const token = signToken({ sub: "user-123", role: "admin" });
    const result = verifyToken<{ sub: string; role: string }>(token);

    expect(result.valid).toBe(true);
    if (!result.valid) return;

    expect(result.payload.sub).toBe("user-123");
    expect(result.payload.role).toBe("admin");
    expect(result.algorithm).toBe("hs256");
  });

  test("token has three segments (header.payload.signature)", () => {
    const token = signToken({ sub: "u1" });
    expect(token.split(".")).toHaveLength(3);
  });

  test("header contains correct alg and typ", () => {
    const token = signToken({ sub: "u1" });
    const [rawHeader] = token.split(".");
    const header = JSON.parse(Buffer.from(rawHeader, "base64url").toString()) as { alg: string; typ: string };
    expect(header.alg).toBe("HS256");
    expect(header.typ).toBe("JWT");
  });

  test("respects ttlSeconds option", async () => {
    const token = signToken({ sub: "u1" }, { ttlSeconds: 60 });
    const result = verifyToken<{ sub: string; exp: number }>(token);

    expect(result.valid).toBe(true);
    if (!result.valid) return;

    const now = Math.floor(Date.now() / 1000);
    expect(result.payload.exp).toBeGreaterThanOrEqual(now + 55);
    expect(result.payload.exp).toBeLessThanOrEqual(now + 65);
  });

  test("emits system.token_signed analytics event", async () => {
    signToken({ sub: "u1" });
    await flushMicrotasks();
    expect(mockTrackSystem).toHaveBeenCalledWith(
      "system.token_signed",
      "system",
      expect.objectContaining({ algorithm: "hs256", quantum_safe: false }),
    );
  });

  test("emits system.token_verified analytics event", async () => {
    const token = signToken({ sub: "u1" });
    mockTrackSystem.mockClear();
    verifyToken(token);
    await flushMicrotasks();
    expect(mockTrackSystem).toHaveBeenCalledWith(
      "system.token_verified",
      "system",
      expect.objectContaining({ algorithm: "hs256", quantum_safe: false }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Tampered token rejection                                                    */
/* -------------------------------------------------------------------------- */

describe("tampered token rejection", () => {
  test("rejects token with modified payload", async () => {
    const token = signToken({ sub: "user-a", role: "staff" });
    const parts = token.split(".");

    // Tamper: replace payload with a different one
    const tamperedClaims = Buffer.from(
      JSON.stringify({ sub: "user-b", role: "admin", iat: 0, exp: 9999999999 }),
    ).toString("base64url");

    const tampered = `${parts[0]}.${tamperedClaims}.${parts[2]}`;
    const result = verifyToken(tampered);

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toContain("Invalid signature");
  });

  test("rejects token with modified signature", async () => {
    const token = signToken({ sub: "u1" });
    const parts = token.split(".");
    const badSig = Buffer.from("totallywrongsignature").toString("base64url");
    const result = verifyToken(`${parts[0]}.${parts[1]}.${badSig}`);

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toContain("Invalid signature");
  });

  test("emits system.token_verify_failed on tamper", async () => {
    const token = signToken({ sub: "u1" });
    const parts = token.split(".");
    mockTrackSystem.mockClear();
    const badSig = Buffer.from("bad").toString("base64url");
    verifyToken(`${parts[0]}.${parts[1]}.${badSig}`);
    await flushMicrotasks();

    const events = mockTrackSystem.mock.calls.map((c) => c[0] as string);
    expect(events).toContain("system.token_verify_failed");
  });

  test("rejects malformed token (missing segments)", async () => {
    const result = verifyToken("not.a.valid.jwt.here.extra");
    expect(result.valid).toBe(false);
  });

  test("rejects completely malformed input", async () => {
    const result = verifyToken("notavalidtoken");
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toContain("3 segments");
  });
});

/* -------------------------------------------------------------------------- */
/* Expired token                                                               */
/* -------------------------------------------------------------------------- */

describe("expired token rejection", () => {
  test("rejects token that has already expired", async () => {
    // Sign with a negative TTL (expired immediately)
    const token = signToken({ sub: "u1" }, { ttlSeconds: -10 });
    const result = verifyToken(token);

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toContain("expired");
  });

  test("emits system.token_verify_failed with reason=expired", async () => {
    const token = signToken({ sub: "u1" }, { ttlSeconds: -10 });
    mockTrackSystem.mockClear();
    verifyToken(token);
    await flushMicrotasks();

    const call = mockTrackSystem.mock.calls.find((c) => c[0] === "system.token_verify_failed");
    expect(call).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* Reserved ml-dsa-65-hybrid slot                                             */
/* -------------------------------------------------------------------------- */

describe("ml-dsa-65-hybrid reserved slot", () => {
  test("signToken throws NotImplementedError for ml-dsa-65-hybrid", () => {
    expect(() => signToken({ sub: "u1" }, { algorithm: "ml-dsa-65-hybrid" })).toThrow(
      NotImplementedError,
    );
  });

  test("NotImplementedError message mentions ml-dsa-65-hybrid", () => {
    try {
      signToken({ sub: "u1" }, { algorithm: "ml-dsa-65-hybrid" });
      fail("expected NotImplementedError");
    } catch (err) {
      expect((err as Error).message).toContain("ml-dsa-65-hybrid");
    }
  });

  test("verifyToken returns valid:false for ml-dsa-65-hybrid tokens", () => {
    // Manually craft a token with ml-dsa-65-hybrid alg header
    const header = Buffer.from(
      JSON.stringify({ alg: "ML-DSA-65+ECDSA", typ: "JWT" }),
    ).toString("base64url");
    const claims = Buffer.from(
      JSON.stringify({ sub: "u1", iat: 0, exp: 9999999999 }),
    ).toString("base64url");
    const fakeToken = `${header}.${claims}.fakesig`;

    const result = verifyToken(fakeToken);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toContain("not yet implemented");
  });
});

/* -------------------------------------------------------------------------- */
/* Unknown algorithm rejection                                                 */
/* -------------------------------------------------------------------------- */

describe("unknown algorithm rejection", () => {
  test("signToken throws for completely unknown algorithm", () => {
    expect(() =>
      // @ts-expect-error intentional bad algorithm for test
      signToken({ sub: "u1" }, { algorithm: "unknown-alg-xyz" }),
    ).toThrow();
  });

  test("verifyToken returns valid:false for unknown alg in header", () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "SUPER-FAKE-999", typ: "JWT" }),
    ).toString("base64url");
    const claims = Buffer.from(
      JSON.stringify({ sub: "u1", iat: 0, exp: 9999999999 }),
    ).toString("base64url");
    const fakeToken = `${header}.${claims}.fakesig`;

    const result = verifyToken(fakeToken);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.reason).toContain("Unknown or unsupported algorithm");
  });
});
