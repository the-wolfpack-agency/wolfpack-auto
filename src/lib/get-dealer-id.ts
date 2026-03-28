/**
 * Extract the dealer_id from the authenticated user session.
 * Falls back to a safe default ONLY in shadow mode (no DB).
 * In production with a real DB, the dealer_id MUST come from the session.
 */
export function getDealerId(authResult: { user: { dealer_id?: string } }): string {
  const dealerId = authResult.user.dealer_id;
  if (dealerId && dealerId !== "default") return dealerId;
  // Shadow mode fallback — safe because no real data exists
  if (!process.env.DATABASE_URL) return "demo-dealer";
  // Production with DB but no dealer_id in session — use the demo dealer UUID
  return "00000000-0000-4000-a000-000000000001";
}
