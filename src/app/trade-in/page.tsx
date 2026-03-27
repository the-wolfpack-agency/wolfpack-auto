import type { Metadata } from "next";
import Script from "next/script";
import TradeInWizard from "./TradeInWizard";
import { getDealerConfig } from "@/lib/dealer-config";

// Render at request time — prevents Vercel static generation from silently
// failing (DB timeout during build) and producing a 404 for this route.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trade-In Value | Get an Instant Offer",
  description:
    "Get an instant trade-in offer for your vehicle. Fast, free, and no obligation. Find out what your car is worth in minutes.",
  openGraph: {
    title: "Get an Instant Trade-In Offer",
    description:
      "Find out what your vehicle is worth. Fast, free, and no obligation.",
    type: "website",
  },
  alternates: {
    canonical: "/trade-in",
  },
};

export default async function TradeInPage() {
  const config = await getDealerConfig();
  const dealerName = config?.name ?? "Wolfpack Auto";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Vehicle Trade-In Valuation",
    description:
      "Get an instant, no-obligation trade-in offer for your vehicle.",
    provider: {
      "@type": "AutoDealer",
      name: dealerName,
    },
    offers: {
      "@type": "Offer",
      description: "Free instant trade-in valuation",
      price: "0",
      priceCurrency: "USD",
    },
    serviceType: "Vehicle Trade-In",
    areaServed: {
      "@type": "Country",
      name: "United States",
    },
  };

  return (
    <>
      <Script
        id="trade-in-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TradeInWizard />
    </>
  );
}
