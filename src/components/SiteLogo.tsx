/**
 * Brand-agnostic site logo: the centered mark in the floating menu.
 *
 * Renders the dealer NAME as a legible wordmark. We deliberately do not render
 * `dealer.logo_url`: the production data points at a tiny, unreadable icon, and
 * a name wordmark is the clear default that works for any brand. When a real,
 * high-quality logo asset is configured, swap an <img> in here.
 */
export default function SiteLogo({ name }: { name: string }) {
  return (
    <span className="whitespace-nowrap text-base font-semibold uppercase tracking-[0.25em] text-brand-950 sm:text-lg">
      {name}
    </span>
  );
}
