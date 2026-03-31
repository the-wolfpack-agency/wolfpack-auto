"use client";

/**
 * CompareTracker — fires analytics events for the vehicle comparison page.
 *
 * Renders as a transparent wrapper that:
 *  1. Fires `vehicle_compare_view` on mount (user opened comparison).
 *  2. Exposes a click handler for "winner" actions (Contact / Get Price / Test Drive).
 */

import { useEffect, type ReactNode } from "react";
import { useAnalytics } from "@/components/EventCollector";

interface CompareTrackerProps {
  /** VINs currently being compared */
  vins: string[];
  children: ReactNode;
}

export default function CompareTracker({ vins, children }: CompareTrackerProps) {
  const { trackComparison } = useAnalytics();

  // Fire compare_view on mount
  useEffect(() => {
    if (vins.length > 0) {
      trackComparison("view", { vins });
    }
    // Only fire once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}

/**
 * CompareWinnerLink — wraps a CTA link on the comparison page and fires
 * `vehicle_compare_winner` when clicked.
 */
export function CompareWinnerLink({
  vin,
  allVins,
  href,
  className,
  children,
}: {
  vin: string;
  allVins: string[];
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const { trackComparison } = useAnalytics();

  return (
    <a
      href={href}
      className={className}
      onClick={() => {
        trackComparison("winner", { vins: allVins, selected_vin: vin });
      }}
    >
      {children}
    </a>
  );
}
