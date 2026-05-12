"use client";

/**
 * SampleAuditEmbed — inline credibility component on the landing page.
 *
 * Shows a screenshot-style summary of the sample audit + a direct link
 * to `/sample-fi-audit.pdf`. Mobile-responsive. Plain English copy.
 */

import Link from "next/link";

export default function SampleAuditEmbed() {
  return (
    <div
      data-testid="sample-audit-embed"
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
            Generated using a fictional dealer (ACME Motors) so you can see the
            format before sharing your data. Page 1 is the gap headline; pages
            2 and 3 break down by F&amp;I manager and product; page 4 is the
            recommendations.
          </p>
          <Link
            href="/sample-fi-audit.pdf"
            data-testid="sample-audit-link"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open the sample PDF
          </Link>
        </div>
        <div className="flex-1 rounded-lg bg-gray-50 p-4 text-xs text-gray-700">
          <div className="font-semibold text-gray-900">Excerpt — page 1</div>
          <div className="mt-2 space-y-1.5">
            <div>Your average F&amp;I gross per deal: $1,420</div>
            <div>Industry benchmark (150-200 retail units / month): $1,820</div>
            <div className="font-semibold text-blue-700">
              Gap: $400 per deal — about $68,000 per month at 170 units.
            </div>
          </div>
          <div className="mt-3 text-gray-500">
            (Numbers shown are from the sample dataset, not a real dealer.)
          </div>
        </div>
      </div>
    </div>
  );
}
