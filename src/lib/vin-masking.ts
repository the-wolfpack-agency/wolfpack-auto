/**
 * VIN masking utility for state-specific privacy compliance.
 *
 * Some states (e.g., California) restrict the display of full VINs
 * on public-facing dealer websites. This utility masks the last 6
 * characters of the VIN when required.
 *
 * A standard VIN is 17 characters. The first 11 identify the
 * manufacturer, model, and assembly plant. The last 6 are the
 * sequential production number and are the sensitive portion.
 */

/**
 * States that restrict full VIN display on public-facing websites.
 * This set should be updated as regulations change.
 */
const VIN_MASKING_STATES = new Set([
  "CA", // California — CCPA / identity theft prevention guidance
]);

/** Number of trailing characters to mask. */
const MASK_LENGTH = 6;

/** Character used for masking. */
const MASK_CHAR = "*";

/**
 * Mask a VIN for public display based on state regulations.
 *
 * @param vin - The full 17-character VIN.
 * @param state - Two-letter state code (e.g., "CA", "CO"). Optional.
 * @returns The VIN, potentially with the last 6 characters masked.
 *
 * @example
 * maskVIN("1HGCV1F34PA012345", "CA") // "1HGCV1F34PA******"
 * maskVIN("1HGCV1F34PA012345", "CO") // "1HGCV1F34PA012345"
 * maskVIN("1HGCV1F34PA012345")       // "1HGCV1F34PA012345"
 */
export function maskVIN(vin: string, state?: string): string {
  if (!vin) return vin;

  const normalizedState = state?.toUpperCase().trim();

  // If no state provided or state does not require masking, return full VIN
  if (!normalizedState || !VIN_MASKING_STATES.has(normalizedState)) {
    return vin;
  }

  // Only mask standard 17-character VINs
  if (vin.length !== 17) {
    return vin;
  }

  const visible = vin.slice(0, vin.length - MASK_LENGTH);
  const masked = MASK_CHAR.repeat(MASK_LENGTH);

  return `${visible}${masked}`;
}

/**
 * Check whether a given state requires VIN masking.
 */
export function stateRequiresVINMasking(state: string): boolean {
  return VIN_MASKING_STATES.has(state.toUpperCase().trim());
}
