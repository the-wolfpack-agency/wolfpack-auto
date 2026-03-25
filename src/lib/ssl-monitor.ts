import { checkCertificateStatus, type CertificateInfo } from "./ssl";

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const WARN_DAYS = 30;
const CRITICAL_DAYS = 7;

export type CertHealth = "valid" | "expiring_soon" | "critical" | "expired" | "error";

export interface DealerCertStatus {
  domain: string;
  health: CertHealth;
  info: CertificateInfo | null;
  error: string | null;
}

export interface CertReport {
  checkedAt: Date;
  total: number;
  valid: number;
  expiringSoon: number;
  critical: number;
  expired: number;
  errors: number;
  dealers: DealerCertStatus[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifyHealth(info: CertificateInfo): CertHealth {
  if (!info.isValid || info.daysUntilExpiry <= 0) return "expired";
  if (info.daysUntilExpiry <= CRITICAL_DAYS) return "critical";
  if (info.daysUntilExpiry <= WARN_DAYS) return "expiring_soon";
  return "valid";
}

// ---------------------------------------------------------------------------
// Monitor
// ---------------------------------------------------------------------------

/**
 * Check TLS certificates for a list of dealer custom domains.
 *
 * Connections are made in parallel with a concurrency cap to avoid
 * hammering the network.
 */
export async function monitorDealerCerts(
  domains: string[],
  concurrency = 5,
): Promise<DealerCertStatus[]> {
  const results: DealerCertStatus[] = [];

  // Simple concurrency limiter
  for (let i = 0; i < domains.length; i += concurrency) {
    const batch = domains.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map(async (domain): Promise<DealerCertStatus> => {
        try {
          const info = await checkCertificateStatus(domain);
          return {
            domain,
            health: classifyHealth(info),
            info,
            error: null,
          };
        } catch (err) {
          return {
            domain,
            health: "error",
            info: null,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    for (const r of batchResults) {
      results.push(
        r.status === "fulfilled"
          ? r.value
          : { domain: "unknown", health: "error", info: null, error: String(r.reason) },
      );
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

/**
 * Produce a summary report across all monitored domains.
 */
export async function getCertReport(
  domains: string[],
): Promise<CertReport> {
  const dealers = await monitorDealerCerts(domains);

  return {
    checkedAt: new Date(),
    total: dealers.length,
    valid: dealers.filter((d) => d.health === "valid").length,
    expiringSoon: dealers.filter((d) => d.health === "expiring_soon").length,
    critical: dealers.filter((d) => d.health === "critical").length,
    expired: dealers.filter((d) => d.health === "expired").length,
    errors: dealers.filter((d) => d.health === "error").length,
    dealers,
  };
}
