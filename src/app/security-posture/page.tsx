/**
 * /security-posture: public-facing trust page.
 *
 * Server component. Renders a polished, pitch-ready hero plus four
 * highlight sections (encryption, compliance, operational security,
 * disclosure) sourced from docs/security-posture.md and SECURITY.md.
 *
 * Mobile + desktop responsive. Uses brand-50 / brand-700 palette from
 * tailwind.config.ts so colors stay consistent with the rest of the
 * marketing site.
 */
import Link from "next/link";

export const metadata = {
  title: "Security and Trust",
  description:
    "How the platform protects dealer and customer data. Hybrid post-quantum TLS, AES-256-GCM at rest, row-level tenant isolation, GLBA Safeguards alignment.",
};

const LAST_UPDATED = "2026-05-11";

interface PostureSection {
  id: string;
  icon: string;
  title: string;
  bullets: string[];
}

const SECTIONS: PostureSection[] = [
  {
    id: "data-encryption",
    icon: "lock",
    title: "Data encryption",
    bullets: [
      "AES-256-GCM for all PII at rest. Effective key size remains beyond brute-force reach even under Grover's algorithm.",
      "TLS 1.3 in flight with hybrid X25519MLKEM768 key exchange where the client supports the post-quantum extension. Classical X25519 fallback for older clients.",
      "Crypto-agility wrapper at src/lib/crypto with named-algorithm registry and an ML-DSA slot reserved for FIPS 204 signing migration.",
    ],
  },
  {
    id: "compliance-posture",
    icon: "shield",
    title: "Compliance posture",
    bullets: [
      "GLBA Safeguards Rule controls aligned: access control, encryption, monitoring, incident response, vendor oversight.",
      "SOC 2 Type I in progress. Type II observation window starts after Type I issuance.",
      "GDPR and CCPA data subject rights workflow: export, rectification, deletion. Audit-logged with hash-chained evidence.",
      "Cyber insurance carrier covered for breach response, regulatory defense, and business interruption.",
    ],
  },
  {
    id: "operational-security",
    icon: "users",
    title: "Operational security",
    bullets: [
      "Role-based access control: owner, admin, manager, staff. Capability checks gate every admin route via requireAuth.",
      "TOTP multi-factor authentication for every admin user (migration 020). Backup codes issued at enrollment.",
      "Append-only, hash-chained audit log on every mutating admin action. Immutable evidence trail for incident review.",
      "Postgres Row-Level Security enforced per tenant (migration 055). Each query carries a dealer scope. Cross-tenant reads return zero rows.",
    ],
  },
  {
    id: "disclosure-contact",
    icon: "mail",
    title: "Disclosure and contact",
    bullets: [
      "Security contact: security@thewolfpack.agency for vulnerability reports, audit requests, or compliance questions.",
      "30-day coordinated disclosure window from initial report to public advisory. Faster timelines available for actively exploited issues.",
      "Public security policy and PGP fingerprint published at /SECURITY.md.",
    ],
  },
];

function Icon({ name }: { name: string }): JSX.Element {
  // Inline SVGs so the page has zero external font/icon dependencies.
  const common = {
    width: 28,
    height: 28,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "lock":
      return (
        <svg {...common}>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "mail":
      return (
        <svg {...common}>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 6-10 7L2 6" />
        </svg>
      );
    default:
      return <svg {...common} />;
  }
}

export default function SecurityPosturePage(): JSX.Element {
  return (
    <main className="min-h-screen bg-surface-muted text-gray-900" data-testid="security-posture-page">
      {/* Hero */}
      <section className="bg-brand-950 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <p className="uppercase tracking-widest text-xs sm:text-sm text-brand-200 mb-3">
            Trust and transparency
          </p>
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight">Security and Trust</h1>
          <p className="mt-5 text-base sm:text-lg text-brand-100 max-w-3xl">
            Our platform is built crypto-agile and post-quantum migration-ready. Dealer and
            customer data is encrypted end-to-end, isolated per tenant at the database layer, and
            governed by an append-only audit trail. The same controls that protect a single
            rooftop scale to multi-location dealer groups without configuration changes.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4">
            <a
              href="/docs/security-posture.md"
              className="inline-flex items-center justify-center rounded-md bg-white text-brand-800 hover:bg-brand-50 font-semibold px-5 py-3 text-sm sm:text-base transition-colors"
              data-testid="security-brief-download"
            >
              Download our security brief
            </a>
            <a
              href="mailto:security@thewolfpack.agency"
              className="inline-flex items-center justify-center rounded-md border border-brand-200 text-white hover:bg-brand-800 font-semibold px-5 py-3 text-sm sm:text-base transition-colors"
            >
              Contact security@thewolfpack.agency
            </a>
          </div>
        </div>
      </section>

      {/* Sections */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {SECTIONS.map((section) => (
            <article
              key={section.id}
              id={section.id}
              data-testid={`section-${section.id}`}
              className="bg-white rounded-card shadow-card p-6 sm:p-8 border border-surface-border"
            >
              <div className="flex items-center gap-3 mb-4 text-brand-700">
                <Icon name={section.icon} />
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{section.title}</h2>
              </div>
              <ul className="space-y-3 text-sm sm:text-base text-gray-700 leading-relaxed">
                {section.bullets.map((bullet, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span aria-hidden className="text-brand-500 select-none mt-0.5">•</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        {/* Footer band */}
        <div className="mt-12 sm:mt-16 rounded-card bg-white border border-surface-border p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900">
              Full technical security posture
            </h3>
            <p className="mt-1 text-sm sm:text-base text-gray-600">
              Cryptographic inventory, known weaknesses, migration roadmap, and quarterly review
              cadence. Maintained by the Wolfpack engineering team.
            </p>
          </div>
          <div className="flex flex-col sm:items-end gap-2 text-sm">
            <Link
              href="/docs/security-posture.md"
              className="text-brand-700 hover:text-brand-900 font-semibold underline"
            >
              Read the technical brief
            </Link>
            <span className="text-gray-500" data-testid="last-updated">
              Last updated: {LAST_UPDATED}
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
