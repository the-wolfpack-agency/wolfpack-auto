"use client";

import { useState } from "react";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/inventory", label: "Inventory" },
  { href: "/financing", label: "Financing" },
  { href: "/trade-in", label: "Trade-In" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/help", label: "Help" },
];

/**
 * The floating menu's navigation drawer. The hamburger is shown at every
 * breakpoint (matching the V_01 wireframe). The panel is always rendered (just
 * visually toggled) so every nav link stays in the header DOM for a11y and the
 * navigation contract the E2E suite asserts on.
 */
export default function MobileMenu() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Hamburger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center justify-center rounded-full p-2 text-brand-950 transition-colors hover:bg-brand-50"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
      >
        {open ? (
          <svg width="22" height="22" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg width="22" height="22" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        )}
      </button>

      {/* Nav drawer - always in the DOM, visually toggled */}
      <div
        className={
          open
            ? "absolute left-0 right-0 top-full z-50 mt-3 rounded-3xl border border-surface-border bg-white p-4 shadow-card-hover"
            : "hidden"
        }
      >
        <nav aria-label="Site navigation">
          <ul className="space-y-1">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-full px-4 py-3 text-base font-medium text-brand-700 transition-colors hover:bg-brand-50 hover:text-brand-950"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-3 border-t border-surface-border pt-3">
          <a
            href="tel:+13035551234"
            className="flex items-center justify-center gap-2 rounded-full bg-brand-950 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-800"
          >
            <svg width="20" height="20" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
            </svg>
            Call (303) 555-1234
          </a>
        </div>
      </div>
    </>
  );
}
