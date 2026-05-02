/**
 * Display helpers for the vehicle-provenance admin surface.
 *
 * Lives in a sibling module so that the page file (page.tsx) can be
 * a clean Next.js page — Next 15 only allows the special exports
 * (`default`, `metadata`, `viewport`, `generateMetadata`, etc) on
 * page modules; any other named export breaks the production build.
 */

export function shortHash(hex: string | null | undefined): string {
  if (!hex) return "—";
  return `${hex.slice(0, 8)}…${hex.slice(-6)}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
