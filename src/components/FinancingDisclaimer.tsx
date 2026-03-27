/**
 * Financing disclosure component for Regulation Z / Truth-in-Lending compliance.
 *
 * Renders required disclosures below any financing content or payment calculator.
 */

interface FinancingDisclaimerProps {
  /** Whether the context shows an APR value. */
  showAPRDefinition?: boolean;
}

export default function FinancingDisclaimer({
  showAPRDefinition = true,
}: FinancingDisclaimerProps) {
  return (
    <div className="rounded-lg border border-surface-border bg-gray-50 px-4 py-3 text-[11px] leading-relaxed text-gray-400">
      <ul className="list-inside list-disc space-y-1">
        <li>
          Subject to credit approval. Not all buyers will qualify for all rates or terms.
        </li>
        <li>
          Rates shown are examples only. Your actual rate may differ based on
          creditworthiness, loan-to-value ratio, and lender requirements.
        </li>
        <li>
          Monthly payment estimates do not include tax, title, registration, or
          insurance.
        </li>
        {showAPRDefinition && (
          <li>
            <strong>APR</strong> = Annual Percentage Rate. APR may vary by lender and is
            subject to change.
          </li>
        )}
      </ul>
      <p className="mt-2">
        These figures are estimates provided for informational purposes only and do not
        constitute a loan offer or guarantee of terms. Contact the dealership for
        actual financing options.
      </p>
    </div>
  );
}
