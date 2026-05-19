/**
 * Landing page for the free F&I Penetration Audit lead magnet.
 *
 * Mobile + desktop responsive (per .ai/client-context.md).
 * Single-purpose: pitch + form + sample-PDF + trust strip.
 * No competitor names. Plain English. No claims we can't back up.
 *
 * Path: /audits/fi-penetration
 * Aliased subdomain (future): audits.wolfpackauto.com/fi-penetration
 */

import type { Metadata } from "next";
import Link from "next/link";
import AuditRequestForm from "@/components/audits/AuditRequestForm";
import SampleAuditEmbed from "./SampleAuditEmbed";
import { getDealerBrandedTitle } from "@/lib/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const title = await getDealerBrandedTitle("Free F&I Penetration Audit");
  return {
    title,
    description:
      "Free 4-page PDF audit of your dealership's F&I performance. Upload three months of funded deals; we return a manager-by-manager scorecard, product penetration heatmap, and ranked opportunities. No call required.",
    openGraph: {
      title: "Free F&I Penetration Audit",
      description:
        "4-page PDF audit. Upload three months of funded deals. No call required.",
      type: "website",
    },
  };
}

const BULLETS = [
  {
    headline: "Manager-by-manager scorecard",
    detail:
      "Attach rate on every product, average gross per deal, top performer vs. bottom performer.",
  },
  {
    headline: "Product penetration heatmap",
    detail:
      "Six months of attach trends across GAP, warranty, tire & wheel, paint protection, and ancillaries.",
  },
  {
    headline: "Three named opportunities, ranked in dollars",
    detail:
      "Each opportunity is sized against industry benchmarks for your monthly volume tier.",
  },
];

export default function FIPenetrationAuditPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      {/* Pitch */}
      <section className="bg-white">
        <div className="mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-16">
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Wolfpack Auto
          </div>
          <h1
            data-testid="audit-landing-headline"
            className="mt-2 text-3xl font-bold text-gray-900 md:text-4xl"
          >
            Free F&amp;I Penetration Audit.
            <br className="hidden md:block" />
            <span className="text-blue-700"> 4-page PDF. No call required.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base text-gray-600">
            Send us three months of your funded deals and we will return a
            consultant-grade audit by the next business day. It is genuinely free.
          </p>
          <ul className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {BULLETS.map((b) => (
              <li key={b.headline} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="text-sm font-semibold text-gray-900">{b.headline}</div>
                <div className="mt-1 text-sm text-gray-600">{b.detail}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Sample */}
      <section className="bg-gray-50">
        <div className="mx-auto max-w-5xl px-4 py-10 md:px-6 md:py-12">
          <SampleAuditEmbed />
        </div>
      </section>

      {/* Form */}
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
          <h2 className="text-2xl font-bold text-gray-900">
            Request your audit
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Most dealers can pull this CSV from their DMS in under five minutes.
            We accept the export as-is.
          </p>
          <div className="mt-6">
            <AuditRequestForm />
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-10 md:px-6">
          <div className="grid grid-cols-1 gap-4 text-sm text-gray-700 md:grid-cols-3">
            <div>
              <div className="font-semibold text-gray-900">Your data stays yours.</div>
              <div className="mt-1 text-gray-600">
                The audit runs on your data alone. We do not pool it with other
                dealers and we do not resell it.
              </div>
            </div>
            <div>
              <div className="font-semibold text-gray-900">Anonymization on request.</div>
              <div className="mt-1 text-gray-600">
                Check the box on the form and we hash manager names before the
                PDF goes out.
              </div>
            </div>
            <div>
              <div className="font-semibold text-gray-900">Full security posture.</div>
              <div className="mt-1 text-gray-600">
                <Link href="/security-posture" className="text-blue-700 underline">
                  Read /security-posture
                </Link>{" "}
                for the encryption, retention, and access details.
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
