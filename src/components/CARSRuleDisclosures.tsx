/**
 * FTC CARS Rule (Combating Auto Retail Scams) disclosure component.
 *
 * The CARS Rule (16 CFR Part 463, effective July 2024) requires dealers to
 * disclose total pricing upfront, prohibit junk fees, and provide financing
 * terms before the consumer signs.
 *
 * This component renders a collapsible disclosure block for VDP and financing pages.
 */

"use client";

import { useState } from "react";

export default function CARSRuleDisclosures() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-xl border border-surface-border bg-white text-xs text-gray-500">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
        aria-expanded={isOpen}
      >
        <span>View full pricing disclosure</span>
        <svg
          className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="border-t border-surface-border px-5 pb-4 pt-3 leading-relaxed">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
            FTC Pricing &amp; Financing Disclosure
          </h4>
          <ul className="list-inside list-disc space-y-2">
            <li>
              All vehicle prices and terms are available before you visit the
              dealership. There are no surprise fees beyond the advertised price
              (excluding government-mandated tax, title, and registration).
            </li>
            <li>
              The total price you see is the total price you pay, excluding only
              tax, title, and registration fees required by your state.
            </li>
            <li>
              If financing is involved, you have the right to receive and review all
              financing terms&mdash;including APR, monthly payment, and total
              cost&mdash;before signing any agreement.
            </li>
            <li>
              The dealership will not charge for any add-on products or services
              without your express, informed consent provided after disclosure of the
              total price.
            </li>
            <li>
              You are not required to purchase any optional products (e.g., extended
              warranties, GAP insurance, paint protection) to buy or finance a
              vehicle.
            </li>
          </ul>
          <p className="mt-3 text-[10px] text-gray-400">
            This disclosure is provided in accordance with the FTC&apos;s Combating Auto
            Retail Scams (CARS) Rule, 16 CFR Part 463.
          </p>
        </div>
      )}
    </div>
  );
}
