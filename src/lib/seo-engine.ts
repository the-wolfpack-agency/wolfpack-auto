/**
 * AI SEO Engine — meta tag generation, structured data (JSON-LD),
 * sitemap generation, and performance tracking.
 *
 * Zero-token: all templates and logic are deterministic; no LLM calls.
 */

import type { Vehicle, VehicleListItem } from "@/types/vehicle";
import type { Dealer } from "@/types/dealer";
import { query } from "@/lib/db";

// ---------------------------------------------------------------------------
// Meta tags
// ---------------------------------------------------------------------------

export interface MetaTags {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string | null;
}

type PageType = "home" | "inventory" | "vdp" | "financing" | "about" | "contact";

export function generateMetaTags(
  dealer: Dealer,
  page: PageType,
  vehicle?: Vehicle | null,
): MetaTags {
  const { city, state } = dealer.address;
  const base = dealer.website_url.replace(/\/$/, "");

  switch (page) {
    case "vdp": {
      if (!vehicle) throw new Error("Vehicle required for VDP meta tags");
      const title = truncate(
        `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim} for Sale | ${dealer.name} | ${city}, ${state}`,
        70,
      );
      const price = vehicle.internet_price ?? vehicle.price;
      const miles = vehicle.mileage.toLocaleString();
      const desc = truncate(
        `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim} with ${miles} miles for ${fmtPrice(price)}. ${topFeatures(vehicle.features)}. Shop at ${dealer.name} in ${city}, ${state}.`,
        160,
      );
      const photo = vehicle.photos.find((p) => p.is_primary)?.url ?? vehicle.photos[0]?.url ?? null;
      return {
        title,
        description: desc,
        canonical: `${base}/inventory/${vehicle.vin}`,
        ogTitle: title,
        ogDescription: desc,
        ogImage: photo,
      };
    }

    case "inventory": {
      const title = truncate(
        `New & Used Cars for Sale | ${dealer.name} | ${city}, ${state}`,
        70,
      );
      const desc = truncate(
        `Browse our full inventory of new and used vehicles at ${dealer.name} in ${city}, ${state}. Competitive pricing, financing available.`,
        160,
      );
      return {
        title,
        description: desc,
        canonical: `${base}/inventory`,
        ogTitle: title,
        ogDescription: desc,
        ogImage: dealer.branding.logo_url,
      };
    }

    case "financing": {
      const title = truncate(
        `Auto Financing & Loan Calculator | ${dealer.name} | ${city}, ${state}`,
        70,
      );
      const desc = truncate(
        `Apply for auto financing at ${dealer.name}. Calculate your monthly payment online. Competitive rates for all credit types in ${city}, ${state}.`,
        160,
      );
      return {
        title,
        description: desc,
        canonical: `${base}/financing`,
        ogTitle: title,
        ogDescription: desc,
        ogImage: dealer.branding.logo_url,
      };
    }

    case "about": {
      const title = truncate(`About ${dealer.name} | ${city}, ${state}`, 70);
      const desc = truncate(
        `Learn about ${dealer.name}, a trusted dealership serving ${city}, ${state} and surrounding areas. Quality vehicles and exceptional service.`,
        160,
      );
      return {
        title,
        description: desc,
        canonical: `${base}/about`,
        ogTitle: title,
        ogDescription: desc,
        ogImage: dealer.branding.logo_url,
      };
    }

    case "contact": {
      const title = truncate(
        `Contact Us | ${dealer.name} | ${city}, ${state}`,
        70,
      );
      const desc = truncate(
        `Get in touch with ${dealer.name} in ${city}, ${state}. Call ${dealer.phone} or visit us today. Sales, service, and financing assistance.`,
        160,
      );
      return {
        title,
        description: desc,
        canonical: `${base}/contact`,
        ogTitle: title,
        ogDescription: desc,
        ogImage: dealer.branding.logo_url,
      };
    }

    case "home":
    default: {
      const title = truncate(
        `${dealer.name} | New & Used Cars | ${city}, ${state}`,
        70,
      );
      const desc = truncate(
        `${dealer.name} in ${city}, ${state} — shop our inventory of new and used vehicles, get financing, and schedule service. Your trusted local dealership.`,
        160,
      );
      return {
        title,
        description: desc,
        canonical: base,
        ogTitle: title,
        ogDescription: desc,
        ogImage: dealer.branding.logo_url,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// JSON-LD Structured Data
// ---------------------------------------------------------------------------

export interface JsonLd {
  "@context": string;
  "@type": string;
  [key: string]: unknown;
}

export function generateStructuredData(
  dealer: Dealer,
  vehicle?: Vehicle | null,
): JsonLd[] {
  const items: JsonLd[] = [];
  const base = dealer.website_url.replace(/\/$/, "");
  const { city, state, street, zip, lat, lng } = dealer.address;

  // AutoDealer (always present)
  const openingHours = dealer.sales_hours
    .filter((h) => !h.closed)
    .map((h) => `${capitalize(h.day.slice(0, 2))} ${h.open}-${h.close}`);

  items.push({
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    name: dealer.name,
    url: base,
    telephone: dealer.phone,
    email: dealer.email,
    image: dealer.branding.logo_url,
    address: {
      "@type": "PostalAddress",
      streetAddress: street,
      addressLocality: city,
      addressRegion: state,
      postalCode: zip,
      addressCountry: "US",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: lat,
      longitude: lng,
    },
    openingHoursSpecification: openingHours.length > 0 ? openingHours : undefined,
  });

  // Vehicle (on VDP pages)
  if (vehicle) {
    const price = vehicle.internet_price ?? vehicle.price;
    items.push({
      "@context": "https://schema.org",
      "@type": "Vehicle",
      name: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`.trim(),
      brand: {
        "@type": "Brand",
        name: vehicle.make,
      },
      model: vehicle.model,
      vehicleIdentificationNumber: vehicle.vin,
      mileageFromOdometer: {
        "@type": "QuantitativeValue",
        value: vehicle.mileage,
        unitCode: "SMI",
      },
      fuelType: fuelTypeLabel(vehicle.fuel_type),
      vehicleTransmission: vehicle.transmission,
      driveWheelConfiguration: vehicle.drivetrain.toUpperCase(),
      vehicleEngine: {
        "@type": "EngineSpecification",
        name: vehicle.engine,
      },
      color: vehicle.exterior_color,
      vehicleInteriorColor: vehicle.interior_color,
      itemCondition:
        vehicle.condition === "new"
          ? "https://schema.org/NewCondition"
          : "https://schema.org/UsedCondition",
      image: vehicle.photos.find((p) => p.is_primary)?.url ?? vehicle.photos[0]?.url,
      url: `${base}/inventory/${vehicle.vin}`,
      offers: {
        "@type": "Offer",
        price: price,
        priceCurrency: "USD",
        availability: vehicle.status === "available"
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        seller: {
          "@type": "AutoDealer",
          name: dealer.name,
        },
      },
    });

    // BreadcrumbList for VDP
    items.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: base,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Inventory",
          item: `${base}/inventory`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
          item: `${base}/inventory/${vehicle.vin}`,
        },
      ],
    });

    // FAQPage for VDP (common questions)
    items.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: `What is the price of the ${vehicle.year} ${vehicle.make} ${vehicle.model}?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: `The ${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim} is listed at ${fmtPrice(price)} at ${dealer.name} in ${city}, ${state}.`,
          },
        },
        {
          "@type": "Question",
          name: `How many miles does this ${vehicle.make} ${vehicle.model} have?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: `This ${vehicle.year} ${vehicle.make} ${vehicle.model} has ${vehicle.mileage.toLocaleString()} miles on the odometer.`,
          },
        },
        {
          "@type": "Question",
          name: `Is financing available for this vehicle?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: dealer.has_financing
              ? `Yes, ${dealer.name} offers financing options. Contact us at ${dealer.phone} or apply online.`
              : `Please contact ${dealer.name} at ${dealer.phone} for financing information.`,
          },
        },
      ],
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------------

interface SitemapEntry {
  loc: string;
  lastmod: string;
  changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: number;
}

export function generateSitemap(
  dealerBaseUrl: string,
  vehicles: Pick<VehicleListItem, "vin">[] | Pick<Vehicle, "vin" | "updated_at">[],
): string {
  const base = dealerBaseUrl.replace(/\/$/, "");
  const now = new Date().toISOString().split("T")[0];

  const staticPages: SitemapEntry[] = [
    { loc: base, lastmod: now, changefreq: "weekly", priority: 1.0 },
    { loc: `${base}/inventory`, lastmod: now, changefreq: "daily", priority: 0.9 },
    { loc: `${base}/financing`, lastmod: now, changefreq: "weekly", priority: 0.6 },
    { loc: `${base}/about`, lastmod: now, changefreq: "monthly", priority: 0.6 },
    { loc: `${base}/contact`, lastmod: now, changefreq: "monthly", priority: 0.6 },
  ];

  const vehiclePages: SitemapEntry[] = vehicles.map((v) => ({
    loc: `${base}/inventory/${v.vin}`,
    lastmod: "updated_at" in v ? new Date(v.updated_at).toISOString().split("T")[0] : now,
    changefreq: "daily" as const,
    priority: 0.8,
  }));

  const entries = [...staticPages, ...vehiclePages];

  const urls = entries
    .map(
      (e) => `  <url>
    <loc>${escapeXml(e.loc)}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority.toFixed(1)}</priority>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

// ---------------------------------------------------------------------------
// Performance tracking
// ---------------------------------------------------------------------------

export async function trackPagePerformance(
  dealerId: string,
  pagePath: string,
  impressions: number,
  clicks: number,
  position: number,
): Promise<void> {
  await query(
    `INSERT INTO seo_metrics (dealer_id, page_path, impressions, clicks, avg_position, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (dealer_id, page_path)
     DO UPDATE SET
       impressions  = seo_metrics.impressions + EXCLUDED.impressions,
       clicks       = seo_metrics.clicks + EXCLUDED.clicks,
       avg_position = EXCLUDED.avg_position,
       updated_at   = now()`,
    [dealerId, pagePath, impressions, clicks, position],
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3).replace(/\s+\S*$/, "") + "...";
}

function fmtPrice(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function topFeatures(features: string[], max = 3): string {
  if (!features || features.length === 0) return "Well-equipped";
  return features.slice(0, max).join(", ");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fuelTypeLabel(ft: string): string {
  const map: Record<string, string> = {
    gasoline: "Gasoline",
    diesel: "Diesel",
    electric: "Electric",
    hybrid: "Hybrid",
    plug_in_hybrid: "Plug-In Hybrid Electric",
  };
  return map[ft] ?? ft;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ---------------------------------------------------------------------------
// Behavior-driven SEO optimization (powered by analytics brain)
// ---------------------------------------------------------------------------

import { queryInsights } from "@/lib/analytics-engine";

/**
 * Query behavioral insights to determine which pages/vehicles should
 * be prioritized in internal linking and sitemap generation.
 *
 * Returns pages ranked by engagement + conversion correlation.
 */
export async function getHighValuePages(): Promise<
  { path: string; priority: number; reason: string }[]
> {
  try {
    const insights = await queryInsights(
      "most popular pages highest engagement conversion",
      5,
    );

    const pages: { path: string; priority: number; reason: string }[] = [];

    for (const insight of insights) {
      if (insight.category === "engagement" && insight.data.ranking) {
        const ranking = insight.data.ranking as {
          page: string;
          avg_ms: number;
        }[];
        for (const entry of ranking) {
          pages.push({
            path: entry.page,
            priority: Math.min(entry.avg_ms / 60000, 1),
            reason: `${Math.round(entry.avg_ms / 1000)}s avg engagement`,
          });
        }
      }

      if (insight.category === "conversion" && insight.data.common_pages) {
        const common = insight.data.common_pages as [string, number][];
        for (const [page, count] of common) {
          const existing = pages.find((p) => p.path === page);
          if (existing) {
            existing.priority = Math.min(existing.priority + 0.3, 1);
            existing.reason += `, ${count} conversions`;
          } else {
            pages.push({
              path: page,
              priority: 0.8,
              reason: `${count} conversions`,
            });
          }
        }
      }
    }

    return pages.sort((a, b) => b.priority - a.priority);
  } catch {
    return [];
  }
}

/**
 * Get popular search terms from behavioral data to inform
 * meta descriptions, internal linking, and content strategy.
 */
export async function getPopularSearchTerms(): Promise<string[]> {
  try {
    const insights = await queryInsights("popular search queries terms", 3);

    for (const insight of insights) {
      if (insight.category === "search" && insight.data.top_searches) {
        return (insight.data.top_searches as [string, number][]).map(
          ([term]) => term,
        );
      }
    }

    return [];
  } catch {
    return [];
  }
}

/**
 * Generate a behavior-optimized sitemap that boosts priorities
 * for pages with high engagement and conversion rates.
 */
export async function generateBehaviorOptimizedSitemap(
  dealerBaseUrl: string,
  vehicles: Pick<VehicleListItem, "vin">[] | Pick<Vehicle, "vin" | "updated_at">[],
): Promise<string> {
  const base = dealerBaseUrl.replace(/\/$/, "");
  const now = new Date().toISOString().split("T")[0];

  // Get behavioral data to boost priorities
  const highValuePages = await getHighValuePages();
  const hvMap = new Map(highValuePages.map((p) => [p.path, p.priority]));

  const staticPages: SitemapEntry[] = [
    { loc: base, lastmod: now, changefreq: "weekly", priority: hvMap.get("/") ?? 1.0 },
    { loc: `${base}/inventory`, lastmod: now, changefreq: "daily", priority: hvMap.get("/inventory") ?? 0.9 },
    { loc: `${base}/financing`, lastmod: now, changefreq: "weekly", priority: hvMap.get("/financing") ?? 0.6 },
    { loc: `${base}/about`, lastmod: now, changefreq: "monthly", priority: hvMap.get("/about") ?? 0.6 },
    { loc: `${base}/contact`, lastmod: now, changefreq: "monthly", priority: hvMap.get("/contact") ?? 0.6 },
  ];

  const vehiclePages: SitemapEntry[] = vehicles.map((v) => ({
    loc: `${base}/inventory/${v.vin}`,
    lastmod: "updated_at" in v ? new Date(v.updated_at).toISOString().split("T")[0] : now,
    changefreq: "daily" as const,
    priority: 0.8,
  }));

  const entries = [...staticPages, ...vehiclePages].sort(
    (a, b) => b.priority - a.priority,
  );

  const urls = entries
    .map(
      (e) => `  <url>
    <loc>${escapeXml(e.loc)}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority.toFixed(1)}</priority>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}
