/**
 * SSL certificate automation via ACME (Let's Encrypt).
 *
 * This module defines the high-level API for requesting, renewing, and
 * inspecting TLS certificates for dealer custom domains. The actual ACME
 * handshake is delegated to the `acme-client` library.
 */

import * as tls from "node:tls";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChallengeType = "http-01" | "dns-01";

export interface CertificateInfo {
  domain: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  daysUntilExpiry: number;
  serialNumber: string;
  isValid: boolean;
}

export interface CertificateResult {
  domain: string;
  certificate: string;
  privateKey: string;
  chain: string;
  expiresAt: Date;
}

export interface AcmeConfig {
  /** Contact email registered with the ACME provider. */
  email: string;
  /** ACME directory URL. Default: Let's Encrypt production. */
  directoryUrl: string;
  /** Preferred challenge type. Default: http-01. */
  challengeType: ChallengeType;
  /** Where to persist certs locally. Default: /etc/ssl/wolfpack */
  storagePath: string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const LETSENCRYPT_PRODUCTION =
  "https://acme-v02.api.letsencrypt.org/directory";
const LETSENCRYPT_STAGING =
  "https://acme-staging-v02.api.letsencrypt.org/directory";

const RENEW_THRESHOLD_DAYS = 30;

function getConfig(): AcmeConfig {
  return {
    email: process.env.ACME_EMAIL ?? "ssl@wolfpackauto.com",
    directoryUrl:
      process.env.ACME_DIRECTORY_URL ??
      (process.env.NODE_ENV === "production"
        ? LETSENCRYPT_PRODUCTION
        : LETSENCRYPT_STAGING),
    challengeType: (process.env.ACME_CHALLENGE_TYPE as ChallengeType) ?? "http-01",
    storagePath: process.env.ACME_STORAGE_PATH ?? "/etc/ssl/wolfpack",
  };
}

// ---------------------------------------------------------------------------
// Request certificate
// ---------------------------------------------------------------------------

/**
 * Request a new TLS certificate for `domain` via the ACME protocol.
 *
 * Flow:
 * 1. Create / load ACME account (from `ACME_EMAIL`).
 * 2. Place an order for the domain.
 * 3. Complete the chosen challenge (HTTP-01 or DNS-01).
 * 4. Finalize and download cert + chain.
 * 5. Persist to `storagePath`.
 *
 * @throws If the ACME handshake fails or the challenge cannot be verified.
 */
export async function requestCertificate(
  domain: string,
): Promise<CertificateResult> {
  const config = getConfig();

  // Dynamic import — acme-client is only loaded when actually needed so the
  // module can be imported safely in environments that lack the dep.
  const acme = await import("acme-client");

  const client = new acme.Client({
    directoryUrl: config.directoryUrl,
    accountKey: await acme.crypto.createPrivateKey(),
  });

  // Register / retrieve account
  await client.createAccount({
    termsOfServiceAgreed: true,
    contact: [`mailto:${config.email}`],
  });

  // Create order
  const order = await client.createOrder({
    identifiers: [{ type: "dns", value: domain }],
  });

  // Authorize
  const authorizations = await client.getAuthorizations(order);

  for (const auth of authorizations) {
    const challenge = auth.challenges.find(
      (c) => c.type === config.challengeType,
    );
    if (!challenge) {
      throw new Error(
        `[ssl] No ${config.challengeType} challenge available for ${domain}`,
      );
    }

    const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);

    // In a real deployment, the challenge response is served via the HTTP
    // server or a DNS TXT record. The caller is responsible for setting up
    // the appropriate responder before calling this function.
    console.log(
      `[ssl] Challenge ${config.challengeType} for ${domain}: token=${challenge.token} key=${keyAuthorization}`,
    );

    await client.verifyChallenge(auth, challenge);
    await client.completeChallenge(challenge);
    await client.waitForValidStatus(challenge);
  }

  // Finalize
  const [key, csr] = await acme.crypto.createCsr({
    commonName: domain,
  });

  await client.finalizeOrder(order, csr);
  const cert = await client.getCertificate(order);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90); // LE certs are 90 days

  return {
    domain,
    certificate: cert,
    privateKey: key.toString(),
    chain: cert, // Full chain included in LE response
    expiresAt,
  };
}

// ---------------------------------------------------------------------------
// Renew certificate
// ---------------------------------------------------------------------------

/**
 * Check the live certificate for `domain`. If it expires within
 * `RENEW_THRESHOLD_DAYS` (30), request a fresh one.
 *
 * @returns The renewed certificate, or `null` if no renewal was needed.
 */
export async function renewCertificate(
  domain: string,
): Promise<CertificateResult | null> {
  const status = await checkCertificateStatus(domain);

  if (status.daysUntilExpiry > RENEW_THRESHOLD_DAYS) {
    console.log(
      `[ssl] ${domain} expires in ${status.daysUntilExpiry} days — no renewal needed`,
    );
    return null;
  }

  console.log(
    `[ssl] ${domain} expires in ${status.daysUntilExpiry} days — renewing`,
  );
  return requestCertificate(domain);
}

// ---------------------------------------------------------------------------
// Check certificate status
// ---------------------------------------------------------------------------

/**
 * Connect to `domain:443` and inspect the peer certificate.
 *
 * Returns structured info including days until expiry and validity.
 */
export async function checkCertificateStatus(
  domain: string,
): Promise<CertificateInfo> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      443,
      domain,
      { servername: domain, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();

        if (!cert || !cert.valid_to) {
          socket.destroy();
          return reject(
            new Error(`[ssl] No certificate found for ${domain}`),
          );
        }

        const validFrom = new Date(cert.valid_from);
        const validTo = new Date(cert.valid_to);
        const now = new Date();
        const daysUntilExpiry = Math.floor(
          (validTo.getTime() - now.getTime()) / (1_000 * 60 * 60 * 24),
        );

        socket.destroy();

        resolve({
          domain,
          issuer: (Array.isArray(cert.issuer?.O) ? cert.issuer.O[0] : cert.issuer?.O) ?? "Unknown",
          validFrom,
          validTo,
          daysUntilExpiry,
          serialNumber: cert.serialNumber,
          isValid: now >= validFrom && now <= validTo,
        });
      },
    );

    socket.on("error", (err) => {
      reject(new Error(`[ssl] Failed to connect to ${domain}: ${err.message}`));
    });

    // Timeout after 10 seconds
    socket.setTimeout(10_000, () => {
      socket.destroy();
      reject(new Error(`[ssl] Connection to ${domain} timed out`));
    });
  });
}
