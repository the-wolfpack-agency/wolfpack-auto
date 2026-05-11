/**
 * MarketStatusDot — small green/yellow/red badge for the inventory list.
 *
 * Maps a `recommendation` enum into a dot + accessible label. Used inside
 * the inventory table cell so dealers can see at a glance which vehicles
 * need pricing attention without opening the detail page.
 */

import type React from "react";

export type Recommendation =
  | "HOLD"
  | "REPRICE_DOWN"
  | "REPRICE_UP"
  | "MOVE_TO_LOT_FRONT"
  | "MOVE_TO_BACK_LOT";

interface DotDef {
  color: string;
  label: string;
}

const DOTS: Record<Recommendation, DotDef> = {
  HOLD: { color: "bg-emerald-500", label: "Priced right" },
  MOVE_TO_LOT_FRONT: { color: "bg-emerald-500", label: "Fresh and priced right" },
  REPRICE_UP: { color: "bg-blue-500", label: "Underpriced for the market" },
  REPRICE_DOWN: { color: "bg-red-500", label: "Overpriced or aging" },
  MOVE_TO_BACK_LOT: { color: "bg-amber-500", label: "Aged and underpriced" },
};

export interface MarketStatusDotProps {
  recommendation: Recommendation | null;
}

export function MarketStatusDot({ recommendation }: MarketStatusDotProps): React.ReactElement {
  if (!recommendation) {
    return (
      <span
        className="inline-flex items-center gap-1.5"
        aria-label="Market status: no data"
        title="No market signal yet"
      >
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" aria-hidden="true" />
        <span className="text-xs text-gray-500">No data</span>
      </span>
    );
  }
  const def = DOTS[recommendation];
  return (
    <span
      className="inline-flex items-center gap-1.5"
      aria-label={`Market status: ${def.label}`}
      title={def.label}
    >
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${def.color}`} aria-hidden="true" />
      <span className="text-xs text-gray-600">{def.label}</span>
    </span>
  );
}
