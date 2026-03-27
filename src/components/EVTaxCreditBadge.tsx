/**
 * EVTaxCreditBadge — renders a green eligibility badge on VDP pages when a
 * vehicle qualifies for the federal EV tax credit.  Renders nothing when not
 * eligible so it is safe to include unconditionally.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EVTaxCreditBadgeProps {
  eligible: boolean;
  amount: number;
  condition?: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EVTaxCreditBadge({
  eligible,
  amount,
  condition,
}: EVTaxCreditBadgeProps) {
  if (!eligible || amount <= 0) {
    return null;
  }

  const isUsed =
    condition?.toLowerCase() === "used" ||
    condition?.toLowerCase() === "certified";

  return (
    <div
      role="note"
      aria-label={`This vehicle qualifies for up to $${amount.toLocaleString()} in federal tax credits`}
      className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"
    >
      {/* Lightning bolt icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
        <svg
          className="h-4 w-4 text-emerald-600"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-emerald-800">
          Up to{" "}
          <span className="text-base">
            ${amount.toLocaleString()}
          </span>{" "}
          Federal Tax Credit
        </p>
        <p className="mt-0.5 text-xs text-emerald-700">
          {isUsed
            ? "Used clean vehicle credit (IRC 25E) — income limits apply."
            : "New clean vehicle credit (IRC 30D) — income limits apply."}
        </p>
        <a
          href="https://www.irs.gov/credits-deductions/credits-for-new-clean-vehicles-purchased-in-2023-or-after"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 underline underline-offset-2 transition-colors hover:text-emerald-900"
          aria-label="See if you qualify on IRS.gov (opens in new tab)"
        >
          See if you qualify
          <svg
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>
    </div>
  );
}
