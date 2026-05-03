/**
 * Jest stub for `uuid` v14.
 *
 * uuid@14 ships ESM-only and Jest's CJS runtime can't load it (the upstream
 * `dist-node/index.js` uses `export { ... }` syntax). next-auth pulls uuid
 * in transitively via `oauth/checks.js`, which loads at module-import time
 * for any route handler that imports `@/lib/auth-guard`. The cleanest
 * unblock for unit tests is a CJS shim that returns deterministic values.
 *
 * Real uuid is exercised in integration / E2E tests where we use the real
 * Next.js + next-auth runtime, so randomness is preserved on the live path.
 */
import { randomUUID, randomBytes } from "node:crypto";

export const v1 = (): string => randomUUID();
export const v3 = (): string => randomUUID();
export const v4 = (): string => randomUUID();
export const v5 = (): string => randomUUID();
export const v6 = (): string => randomUUID();
export const v7 = (): string => randomUUID();

export const NIL = "00000000-0000-0000-0000-000000000000";
export const MAX = "ffffffff-ffff-ffff-ffff-ffffffffffff";

export const validate = (s: unknown): boolean =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export const version = (s: string): number => {
  if (!validate(s)) throw new TypeError("Invalid UUID");
  return parseInt(s.charAt(14), 16);
};

export const parse = (s: string): Uint8Array => {
  if (!validate(s)) throw new TypeError("Invalid UUID");
  const hex = s.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
};

export const stringify = (bytes: Uint8Array): string => {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

// next-auth uses `randomBytes` indirectly via crypto; export a no-op for
// any package that relied on uuid's internal helpers being importable.
export const _internal_randomBytes = (n: number) => randomBytes(n);

export default {
  v1, v3, v4, v5, v6, v7, NIL, MAX, validate, version, parse, stringify,
};
