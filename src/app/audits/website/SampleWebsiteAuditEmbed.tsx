"use client";

/**
 * SampleWebsiteAuditEmbed — inline credibility surface on the landing page.
 *
 * Shows a screenshot-style preview of the sample audit + a direct link to
 * `/sample-website-audit.pdf`. Mobile-responsive. Plain English copy.
 */

import Link from "next/link";

export default function SampleWebsiteAuditEmbed() {
  return (
    <div
      data-testid="sample-website-audit-embed"
      className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm md:p-8"
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Sample deliverable
          </div>
          <h3 className="mt-1 text-xl font-semibold text-gray-900">
            What the 4-page audit looks like
          </h3>
          <p className="mt-3 text-sm text-gray-600">
            Generated using a fictional dealer site (ACME Motors) so you can
            see the format before sharing your URL. Page 1 is the score and
            top issues; page 2 covers performance and mobile; page 3 covers
            inventory presentation and conversion; page 4 is the prioritized
            recommendation list.
          </p>
          <Link
            href="/sample-website-audit.pdf"
            data-testid="sample-website-audit-link"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open the sample PDF
          </Link>
        </div>
        <div className="flex-1 rounded-lg bg-gray-50 p-4 text-xs text-gray-700">
          <div className="font-semibold text-gray-900">Excerpt - page 1</div>
          <div className="mt-2 space-y-1.5">
            <div>Overall website score: 62 / 100</div>
            <div>Top issue: Slow page load (LCP &gt; 4s)</div>
            <div className="font-semibold text-blue-700">
              Your VDPs load slowly. Compress photos and load them lazily.
            </div>
          </div>
          <div className="mt-3 text-gray-500">
            (Numbers shown are from the sample fixture, not a real dealer.)
          </div>
        </div>
      </div>
    </div>
  );
}
