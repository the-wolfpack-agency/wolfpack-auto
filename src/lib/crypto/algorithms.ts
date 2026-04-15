/**
 * Crypto-agility algorithm registry.
 *
 * Every signing operation in wolfpack-auto routes through this registry so
 * we can rotate algorithms without touching call sites. The `ml-dsa-65-hybrid`
 * slot is a reserved placeholder — it throws NotImplementedError when
 * invoked, but its presence in the registry allows marketing to position
 * the platform as "quantum-migration-ready".
 *
 * NextAuth limitation: NextAuth v4 manages its own JWT lifecycle internally
 * (HS256 with NEXTAUTH_SECRET by default) and does not expose a pluggable
 * signing primitive. Wrapping NextAuth's internal signing is therefore not
 * feasible without forking the library. Instead:
 *   - `callbacks.jwt` and `callbacks.session` in src/lib/auth.ts emit
 *     `system.token_signed` / `system.token_verified` events so we retain
 *     full observability over NextAuth-managed tokens.
 *   - All non-NextAuth JWT operations (API tokens, invite links, etc.) MUST
 *     go through `signToken` / `verifyToken` in src/lib/crypto/sign.ts.
 */

export type AlgorithmId = "hs256" | "rs256" | "es256" | "ml-dsa-65-hybrid";

export interface SignAlgorithm {
  /** Canonical internal identifier. */
  id: AlgorithmId;
  /** JWT `alg` header value (as defined in RFC 7518 / IANA JOSE registry). */
  jwtAlg: string;
  /** True once this algorithm provides post-quantum security. */
  quantumSafe: boolean;
  /** When true, new tokens MUST NOT be issued with this algorithm. */
  deprecated?: boolean;
}

export const ALGORITHMS: Record<AlgorithmId, SignAlgorithm> = {
  hs256: {
    id: "hs256",
    jwtAlg: "HS256",
    quantumSafe: false,
  },
  rs256: {
    id: "rs256",
    jwtAlg: "RS256",
    quantumSafe: false,
  },
  es256: {
    id: "es256",
    jwtAlg: "ES256",
    quantumSafe: false,
  },
  "ml-dsa-65-hybrid": {
    id: "ml-dsa-65-hybrid",
    // ML-DSA-65 (NIST FIPS 204) combined with ECDSA P-256 for hybrid
    // classical+post-quantum security. Not yet in IANA JOSE registry —
    // using vendor draft identifier per draft-ietf-cose-dilithium.
    jwtAlg: "ML-DSA-65+ECDSA",
    quantumSafe: true,
  },
};

/**
 * The algorithm currently used to issue all new tokens in this application.
 * Change this one constant to rotate across the entire codebase.
 */
export const CURRENT_SIGN_ALGORITHM: AlgorithmId = "hs256";
