"use client";

import { usePathname } from "next/navigation";
import MobileMenu from "@/components/MobileMenu";
import SiteLogo from "@/components/SiteLogo";

/**
 * Floating menu bar (V_01). The header is transparent on the homepage so the
 * hero image shows behind the pill; on every other route it gets a dark
 * background so it blends with the sub-page heroes instead of leaving a white
 * strip over the body.
 */
export default function SiteHeader({
  name,
  phone,
  phoneHref,
}: {
  name: string;
  phone: string;
  phoneHref: string;
}) {
  const isHome = usePathname() === "/";

  return (
    <header
      role="banner"
      className={`sticky top-0 z-40 ${isHome ? "" : "bg-brand-950"}`}
    >
      <div className="mx-auto max-w-7xl px-4 pt-3 sm:px-6 lg:px-8">
        <nav
          aria-label="Primary navigation"
          className="relative flex h-14 items-center justify-between rounded-full border border-surface-border bg-white/95 px-3 shadow-card backdrop-blur-md sm:px-4"
        >
          {/* Left: hamburger + logo (in-flow/truncating on mobile) + links */}
          <div className="flex min-w-0 items-center gap-2">
            <MobileMenu />
            {/* Logo: left-aligned and truncating on mobile so a long name never
                collides with the buttons; centered on desktop (V_01) */}
            <a
              href="/"
              aria-label={`${name} home`}
              className="block min-w-0 truncate md:absolute md:left-1/2 md:max-w-[42%] md:-translate-x-1/2 lg:max-w-none"
            >
              <SiteLogo name={name} />
            </a>
            <div className="hidden items-center gap-1 md:flex">
              {[
                { label: "Inventory", href: "/inventory" },
                { label: "Financing", href: "/financing" },
                { label: "Trade-In", href: "/trade-in" },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="rounded-full px-4 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 hover:text-brand-950"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          {/* Right: phone + Browse Cars */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <a
              href={phoneHref}
              className="hidden items-center gap-2 text-sm font-semibold text-brand-700 transition-colors hover:text-brand-950 lg:flex"
            >
              <svg width="16" height="16" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
              {phone}
            </a>
            <a
              href="/inventory"
              data-track="header_browse_cars"
              className="rounded-full bg-brand-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-800 sm:px-5 sm:py-2.5"
            >
              Browse Cars
            </a>
          </div>
        </nav>
      </div>
    </header>
  );
}
