/**
 * EV Readiness utilities — federal tax credit rules (IRA 2023) and
 * charge-time formatting helpers.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaxCreditResult {
  /** Whether the vehicle qualifies for any federal credit. */
  eligible: boolean;
  /** Credit amount: 0, 3750, or 7500 (new); 4000 (used). */
  amount: number;
  /** Human-readable reason for the decision. */
  reason: string;
  /** MSRP cap that applies to this vehicle type. */
  msrpCap: number;
  /** Additional notes for the buyer. */
  notes: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** MSRP caps for new-vehicle credit (IRA 2023). */
const MSRP_CAP_SUV_TRUCK_VAN = 80_000;
const MSRP_CAP_SEDAN = 55_000;

/** Used vehicle sale-price cap. */
const USED_SALE_PRICE_CAP = 25_000;

/**
 * Makes known to produce primarily large-body vehicles (SUV/truck/van).
 * Used for MSRP cap determination when body-style is unavailable.
 */
const LARGE_BODY_MAKES = new Set([
  "ford",
  "gmc",
  "chevrolet",
  "chevy",
  "ram",
  "rivian",
  "hummer",
  "cadillac",
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate the federal EV tax credit under IRA 2023 rules.
 *
 * Simplifications applied:
 * - Assembly and critical-mineral requirements are assumed met for major brands.
 * - PHEV is assumed to have ≥7 kWh battery (eligible for half credit).
 * - MSRP cap uses a heuristic: large-body makes → $80K cap, others → $55K.
 * - Used vehicles: $4,000 credit, max sale price $25,000.
 */
export function calculateFederalTaxCredit(vehicle: {
  is_ev: boolean;
  ev_drivetrain?: string | null;
  msrp?: number | null;
  make?: string | null;
  year?: number | null;
  condition?: string | null;
}): TaxCreditResult {
  const noCredit = (reason: string, notes: string[] = []): TaxCreditResult => ({
    eligible: false,
    amount: 0,
    reason,
    msrpCap: 0,
    notes,
  });

  // Must be an EV
  if (!vehicle.is_ev) {
    return noCredit("Vehicle is not electric.");
  }

  // Must be BEV or PHEV (FCEV currently ineligible under standard 30D credit)
  const drivetrain = vehicle.ev_drivetrain ?? "BEV";
  if (drivetrain === "FCEV") {
    return noCredit("Fuel cell vehicles use a separate credit (30B); check IRS.gov.", [
      "FCEV vehicles may qualify for the Alternative Fuel Refueling Property Credit.",
    ]);
  }

  const isUsed = vehicle.condition?.toLowerCase() === "used" ||
                 vehicle.condition?.toLowerCase() === "certified";

  // ── Used vehicle credit (25E) ───────────────────────────────────────────
  if (isUsed) {
    const msrp = vehicle.msrp ?? 0;
    if (msrp > 0 && msrp > USED_SALE_PRICE_CAP) {
      return noCredit(
        `Sale price exceeds the $${USED_SALE_PRICE_CAP.toLocaleString()} cap for used EVs.`,
        ["The used clean vehicle credit (IRC 25E) requires a sale price at or below $25,000."],
      );
    }
    return {
      eligible: true,
      amount: 4_000,
      reason: "Qualifies for the used clean vehicle credit (IRC 25E).",
      msrpCap: USED_SALE_PRICE_CAP,
      notes: [
        "Credit capped at $4,000 or 30% of sale price, whichever is less.",
        "Buyer income limits apply. Consult a tax advisor.",
      ],
    };
  }

  // ── New vehicle credit (30D) ────────────────────────────────────────────
  const make = vehicle.make?.toLowerCase() ?? "";
  const isLargeBody = LARGE_BODY_MAKES.has(make);
  const msrpCap = isLargeBody ? MSRP_CAP_SUV_TRUCK_VAN : MSRP_CAP_SEDAN;

  const msrp = vehicle.msrp ?? 0;
  if (msrp > 0 && msrp > msrpCap) {
    return noCredit(
      `MSRP of $${msrp.toLocaleString()} exceeds the $${msrpCap.toLocaleString()} cap.`,
      [
        `New clean vehicle credit (IRC 30D) has an MSRP cap of $${msrpCap.toLocaleString()} for this vehicle type.`,
        "Buyer income limits also apply.",
      ],
    );
  }

  // PHEV gets half credit ($3,750); BEV gets full ($7,500)
  if (drivetrain === "PHEV") {
    return {
      eligible: true,
      amount: 3_750,
      reason: "Qualifies for the new clean vehicle credit (IRC 30D) — plug-in hybrid.",
      msrpCap,
      notes: [
        "PHEV credit is up to $3,750 (battery ≥7 kWh assumed).",
        "Buyer income limits apply. Consult a tax advisor.",
        "Credit may be applied at point of sale starting 2024.",
      ],
    };
  }

  // BEV — full credit
  return {
    eligible: true,
    amount: 7_500,
    reason: "Qualifies for the new clean vehicle credit (IRC 30D) — battery electric.",
    msrpCap,
    notes: [
      "Full $7,500 credit assumes assembly and critical-mineral requirements are met.",
      "Buyer income limits apply. Consult a tax advisor.",
      "Credit may be applied at point of sale starting 2024.",
    ],
  };
}

/**
 * Format a charge time into a human-readable string.
 * Pass hours for L2, minutes for DC Fast.
 */
export function formatChargeTime(
  hours?: number | null,
  minutes?: number | null,
): string {
  const parts: string[] = [];

  if (hours != null && hours > 0) {
    parts.push(`${hours} hr${hours === 1 ? "" : "s"} (L2)`);
  }
  if (minutes != null && minutes > 0) {
    parts.push(`${minutes} min (DC Fast)`);
  }

  return parts.length > 0 ? parts.join(" · ") : "Charge time unavailable";
}

/**
 * Set of makes known to offer pure-EV or plug-in-hybrid models.
 * Used for quick heuristic filtering — not exhaustive.
 */
export function evMakesSet(): Set<string> {
  return new Set([
    // Pure-EV first-movers
    "Tesla",
    "Rivian",
    "Lucid",
    "Polestar",
    "Fisker",
    "Canoo",
    "Lordstown",
    "Arrival",
    // Traditional makes with significant EV lines
    "Chevrolet",
    "Ford",
    "GMC",
    "Cadillac",
    "BMW",
    "Mercedes-Benz",
    "Audi",
    "Volkswagen",
    "Hyundai",
    "Kia",
    "Genesis",
    "Nissan",
    "Honda",
    "Toyota",
    "Subaru",
    "Volvo",
    "Jaguar",
    "Porsche",
    "Mini",
    "Jeep",
    "Ram",
    "Chrysler",
    "Dodge",
    "Mitsubishi",
    "Mazda",
    "Lexus",
  ]);
}
