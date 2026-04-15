# Wolfpack Auto — Security Posture

## Executive Summary

Wolfpack Auto is designed crypto-agile and post-quantum migration-ready. All data in transit is protected by hybrid TLS (classical ECDH + ML-KEM-768 where the client supports it), and all sensitive data at rest is encrypted with AES-256-GCM — an algorithm that is quantum-resistant at current key sizes. Session authentication uses short-lived JWT access tokens and single-use rotating refresh tokens, so the harvest-now-decrypt-later attack window for dealer or customer authentication material is minutes, not years.

## Current Crypto Inventory

| Asset | Algorithm | Quantum-Resistant? | Notes |
|---|---|---|---|
| TLS in transit | TLS 1.3 + X25519MLKEM768 (hybrid KEX) | Yes (hybrid) | Classical fallback to X25519 when client does not support PQ extension |
| PII at rest | AES-256-GCM | Yes | Grover's algorithm halves effective key size to 128 bits — still beyond brute-force reach |
| Session tokens | JWT (HS256), short TTL | Partial | HS256 uses symmetric key; HMAC-SHA256 is quantum-resistant. Short TTL limits harvest risk. |
| Refresh tokens | Opaque random, single-use rotation | Yes | Rotation + revocation means a stolen token has a narrow replay window |
| Password hashing | bcrypt (cost 12) | Yes | Work factor limits quantum speedup; argon2id migration planned |
| Multi-factor auth | TOTP (OTPAuth), time-based | Yes | HMAC-SHA1 used by TOTP is symmetric; quantum speedup is limited |
| API keys | Random 256-bit hex | Yes | No asymmetric component; brute-force infeasible |
| Signed documents / JWTs | HMAC-SHA256 | Yes | Symmetric signing; no ECDSA/RSA exposure |

## Known Weaknesses

- **ECDSA / RSA in TLS handshake** — The server certificate chain still uses ECDSA P-256 (standard WebPKI). Shor's algorithm on a Cryptographically Relevant Quantum Computer (CRQC) can forge ECDSA signatures. No CRQC exists today; estimates put CRQC capability at 2030–2035 at the earliest. Mitigation: hybrid KEX protects the session key even if the cert is forged in the future.
- **Harvest-now-decrypt-later (HNDL)** for auth tokens — an adversary archiving today's encrypted traffic could attempt to decrypt session tokens once a CRQC is available. Our mitigation: short JWT TTL means archived tokens expire well before a CRQC could be weaponised.
- **bcrypt vs argon2id** — bcrypt is not memory-hard; argon2id provides better resistance to GPU/quantum-accelerated cracking. Migration planned.

## Migration Roadmap

| Year | Action |
|---|---|
| 2026 (now) | Hybrid TLS active (X25519MLKEM768); crypto-agility wrapper with ML-DSA slot reserved |
| 2027 | Evaluate production-grade ML-DSA signing libraries for Node.js; pilot on internal signing paths |
| 2028–2029 | Migrate all signature operations to ML-DSA (FIPS 204) when library ecosystem matures |
| 2027 | Migrate password hashing from bcrypt to argon2id |
| 2029+ | Rotate remaining ECDSA keys in TLS certs as WebPKI supports PQ algorithms |
| Ongoing | Quarterly key rotation; annual crypto inventory review |

## What This Means for Customers

Any data you transmit to Wolfpack Auto today — inventory queries, lead submissions, financial data — is protected by hybrid TLS: a combination of classical elliptic-curve cryptography and the post-quantum ML-KEM-768 algorithm. Even if a quantum computer became available tomorrow, an adversary who captured your traffic today could not decrypt the session key.

Short-lived session tokens mean the worst-case exposure window for dealer authentication material is bounded by the configured access token TTL. Refresh tokens are single-use and rotated on every use, so a stolen token can only be replayed once before it is invalidated.

Multi-tenant data isolation is enforced at the database layer via Row-Level Security policies tied to dealer slugs, meaning quantum computing advances do not change the isolation model.

## Transparency

This document is maintained by the Wolfpack engineering team and updated at least quarterly. It is publicly accessible at `/security-posture`.

**Follow-up actions (not yet complete):**
- After HSTS has been live in production for >1 week, submit the domain to [https://hstspreload.org](https://hstspreload.org) to be included in browser preload lists.
- Monitor the [NIST PQC standards](https://csrc.nist.gov/projects/post-quantum-cryptography) for final FIPS 204 (ML-DSA) and FIPS 205 (SLH-DSA) publications.
- Evaluate WebPKI PQ certificate support timeline (expected 2027+) for certificate chain migration.
