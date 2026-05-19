/**
 * Landing page for the free Website Audit engagement-opener.
 *
 * Second engagement-opener artifact for the Wolfpack Dealer Excellence
 * Program. Mirrors the structure of `/audits/fi-penetration` so the two
 * landing surfaces feel consistent to OEM and dealer prospects.
 *
 * Mobile + desktop responsive. No competitor names. Plain English. No em dashes.
 *
 * Path: /audits/website
 */

import type { Metadata } from "next";
import Link from "next/link";
import WebsiteAuditRequestForm from "@/components/audits/WebsiteAuditRequestForm";
import SampleWebsiteAuditEmbed from "./SampleWebsiteAuditEmbed";
import { getDealerBrandedTitle } from "@/lib/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const title = await getDealerBrandedTitle("Free Website Audit");
  return {
    title,
    description:
      "Free 4-page PDF audit of your dealership's customer-facing website. We scan your homepage and inventory pages, score performance and conversion, and return a ranked list of actions. No call required.",
    openGraph: {
      title: "Free Dealership Website Audit",
      description:
        "4-page PDF audit. We scan your site. You get a ranked list of actions.",
      type: "website",
    },
  };
}

const BULLETS = [
  {
    headline: "Performance + mobile scorecard",
    detail:
      "Independent rating of how fast and accessible your site is on a phone. Plain English explanations.",
  },
  {
    headline: "Conversion funnel review",
    detail:
      "Where customers fall out before they reach the lead form, with concrete fixes.",
  },
  {
    headline: "Inventory presentation report",
    detail:
      "Sampled VDP analysis: photo counts, schema markup, price visibility, and history-link coverage.",
  },
];

export default function WebsiteAuditPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      {/* Pitch */}
      <section className="bg-white">
        <div className="mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-16">
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Wolfpack Auto
          </div>
          <h1
            data-testid="website-audit-landing-headline"
            className="mt-2 text-3xl font-bold text-gray-900 md:text-4xl"
          >
            Free dealership website audit.
            <br className="hidden md:block" />
            <span className="text-blue-700"> 4-page PDF. No call required.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base text-gray-600">
            Tell us your dealer website and we will scan it the same way a
            shopper sees it. You will get a 4-page PDF with what we found and
            what to do about it.
          </p>
          <ul className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {BULLETS.map((b) => (
              <li
                key={b.headline}
                className="rounded-lg border border-gray-200 bg-gray-50 p-4"
              >
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
          <SampleWebsiteAuditEmbed />
        </div>
      </section>

      {/* Form */}
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
          <h2 className="text-2xl font-bold text-gray-900">
            Request your audit
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Provide your dealer website URL and a contact. The audit runs
            on your public pages only.
          </p>
          <div className="mt-6">
            <WebsiteAuditRequestForm />
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-10 md:px-6">
          <div className="grid grid-cols-1 gap-4 text-sm text-gray-700 md:grid-cols-3">
            <div>
              <div className="font-semibold text-gray-900">Public pages only.</div>
              <div className="mt-1 text-gray-600">
                We scan what any shopper can see. No login, no customer data,
                no DMS access.
              </div>
            </div>
            <div>
              <div className="font-semibold text-gray-900">Same-day turnaround.</div>
              <div className="mt-1 text-gray-600">
                Most audits land in your inbox within the next business day.
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
