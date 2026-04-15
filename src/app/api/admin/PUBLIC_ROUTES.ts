// Admin routes that are intentionally unauthenticated. Every addition requires a comment explaining why.
export const PUBLIC_ADMIN_ROUTES: readonly string[] = [
  "accept-invite/route.ts", // new users clicking email invite link — no session exists yet
  "reset-password/route.ts", // unauthenticated users requesting/completing a password reset
  "mfa/verify/route.ts", // called during the login flow, before a session is established
  "digital-retail/calculator/route.ts", // customer-facing payment calculator — no login required
  "digital-retail/credit-app/route.ts", // customer-facing credit application submission (POST only; GET is guarded)
];
