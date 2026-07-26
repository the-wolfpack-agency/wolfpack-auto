import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";

// Self-hosted at build time (no runtime Google request → no CSP impact).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
import ChatWidget from "@/components/ChatWidget";
import Analytics from "@/components/Analytics";
import EventCollector from "@/components/EventCollector";
import CookieConsent from "@/components/CookieConsent";
import { getDealerConfig } from "@/lib/dealer-config";
import { DealerProvider } from "@/components/DealerProvider";

export async function generateMetadata(): Promise<Metadata> {
  const dealer = await getDealerConfig();
  return {
    title: {
      default: dealer.name,
      template: `%s | ${dealer.name}`,
    },
    description:
      "Modern automotive dealer platform with lightning-fast inventory search and best-in-class security.",
    robots: {
      index: true,
      follow: true,
    },
    manifest: "/manifest.json",
    openGraph: {
      title: dealer.name,
      description:
        "Modern automotive dealer platform with lightning-fast inventory search and best-in-class security.",
      type: "website",
      siteName: dealer.name,
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0b",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const dealer = await getDealerConfig();
  const fullAddress = `${dealer.address}, ${dealer.city}, ${dealer.state} ${dealer.zip}`;
  const phoneHref = `tel:+1${dealer.phone.replace(/\D/g, "")}`;
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <Analytics />
      </head>
      <body className="min-h-screen bg-surface font-sans text-gray-900 antialiased">
        <DealerProvider config={dealer}>
        <EventCollector>
        {/* Skip navigation link for keyboard / screen reader users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white focus:outline-none"
        >
          Skip to main content
        </a>

        {/* Top Bar */}
        <div id="wolfpack-top-bar" className="hidden bg-brand-950 sm:block">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 sm:px-6 lg:px-8">
            <div className="flex items-center gap-4 text-xs text-brand-300">
              <span className="flex items-center gap-1">
                <svg width="14" height="14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {Object.entries(dealer.business_hours).map(([day, hrs]) => `${day}: ${hrs}`).join(" | ")}
              </span>
              <span className="flex items-center gap-1">
                <svg width="14" height="14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
                {fullAddress}
              </span>
            </div>
            <a
              href={phoneHref}
              className="flex items-center gap-1.5 text-xs font-semibold text-white transition-colors hover:text-brand-300"
            >
              <svg width="14" height="14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
              {dealer.phone}
            </a>
          </div>
        </div>

        {/* Header: floating rounded menu bar (V_01), route-aware background */}
        <SiteHeader name={dealer.name} phone={dealer.phone} phoneHref={phoneHref} />

        <main id="main-content" role="main" className="flex-1">
          {children}
        </main>

        {/* Footer */}
        <footer role="contentinfo" className="bg-brand-950 text-brand-300">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr_1fr]">
              {/* Brand + tagline + contact + social */}
              <div>
                <span className="text-lg font-semibold uppercase tracking-[0.2em] text-white">
                  {dealer.name.toUpperCase()}
                </span>
                <p className="mt-5 max-w-sm text-sm leading-relaxed">
                  Your trusted destination for quality vehicles, transparent pricing, and exceptional service since 2021.
                </p>
                <div className="mt-8">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-white">Contact</h3>
                  <ul className="mt-4 space-y-2 text-sm">
                    <li>{dealer.address} &nbsp;|&nbsp; {dealer.city}, {dealer.state} {dealer.zip}</li>
                    <li><a href={phoneHref} className="transition-colors hover:text-white">{dealer.phone}</a></li>
                    <li><a href={`mailto:${dealer.email}`} className="transition-colors hover:text-white">{dealer.email}</a></li>
                  </ul>
                </div>
                <div className="mt-6 flex gap-3">
                  {/* Social Icons */}
                  {["facebook", "instagram", "twitter"].map((social) => (
                    <a
                      key={social}
                      href={`#${social}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-900 text-brand-400 transition-colors hover:bg-brand-800 hover:text-white"
                      aria-label={`Follow us on ${social}`}
                    >
                      {social === "facebook" && (
                        <svg width="16" height="16" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                      )}
                      {social === "instagram" && (
                        <svg width="16" height="16" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                        </svg>
                      )}
                      {social === "twitter" && (
                        <svg width="16" height="16" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      )}
                    </a>
                  ))}
                </div>
              </div>

              {/* Quick Links */}
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-white">Quick Links</h3>
                <ul className="mt-4 space-y-3">
                  {[
                    { label: "Browse Inventory", href: "/inventory" },
                    { label: "Financing Options", href: "/financing" },
                    { label: "About Us", href: "/about" },
                    { label: "Contact Us", href: "/contact" },
                    { label: "Value My Trade-In", href: "/trade-in" },
                    { label: "Help & FAQ", href: "/help" },
                  ].map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="text-sm transition-colors hover:text-white">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Vehicle Types */}
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-white">Vehicle Types</h3>
                <ul className="mt-4 space-y-3">
                  {["SUVs", "Trucks", "Sedans", "Electric Vehicles", "Luxury Cars", "Certified Pre-Owned"].map((type) => (
                    <li key={type}>
                      <a href={`/inventory?category=${encodeURIComponent(type)}`} className="text-sm transition-colors hover:text-white">
                        {type}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

            </div>

            <div className="mt-12 border-t border-brand-800 pt-8">
              <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                <p className="text-xs text-brand-500">
                  &copy; {new Date().getFullYear()} {dealer.name}. All rights reserved.
                </p>
                <div className="flex gap-6 text-xs text-brand-500">
                  <a href="/privacy" className="transition-colors hover:text-white">Privacy Policy</a>
                  <a href="/terms" className="transition-colors hover:text-white">Terms of Service</a>
                  <a href="/accessibility" className="transition-colors hover:text-white">Accessibility</a>
                  <a href="/status" className="transition-colors hover:text-white">System Status</a>
                </div>
              </div>
            </div>
          </div>
        </footer>

        {/* AI Chat Assistant — appears on every page */}
        <div id="wolfpack-chat"><ChatWidget /></div>
        <div id="wolfpack-cookie"><CookieConsent /></div>
        </EventCollector>
        </DealerProvider>
      </body>
    </html>
  );
}
