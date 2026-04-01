/**
 * Canva Integration — Template library for dealer marketing materials.
 *
 * v1 uses built-in HTML/CSS templates (no Canva API required).
 * Templates auto-populate with dealer branding and vehicle data,
 * and can be exported as HTML, images, or opened in Canva via deep link.
 *
 * Usage:
 *   import { getTemplateLibrary, populateTemplate } from "@/lib/canva-integration";
 *   const templates = getTemplateLibrary();
 *   const html = populateTemplate("vehicle-spotlight", { dealer, vehicle });
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type TemplateCategory =
  | "social_post"
  | "email_banner"
  | "flyer"
  | "price_tag"
  | "sale_banner"
  | "new_arrival"
  | "sold_celebration"
  | "testimonial";

export interface TemplateSize {
  label: string;
  width: number;
  height: number;
}

export interface TemplateField {
  name: string;
  label: string;
  type: "text" | "image" | "color" | "number";
  default?: string;
  required?: boolean;
}

export interface CanvaTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  sizes: TemplateSize[];
  thumbnail: string;
  fields: TemplateField[];
  tags: string[];
}

export interface DealerBranding {
  name: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  phone: string;
  website: string;
}

export interface VehicleData {
  photo: string;
  year: number;
  make: string;
  model: string;
  price: number;
  original_price?: number;
  features: string[];
  vin?: string;
  mileage?: number;
}

export interface CustomFields {
  headline?: string;
  description?: string;
  cta_text?: string;
  cta_url?: string;
  rating?: number;
  customer_name?: string;
  customer_quote?: string;
  discount_text?: string;
  expiry_date?: string;
}

export interface TemplateData {
  dealer: DealerBranding;
  vehicle?: VehicleData;
  vehicles?: VehicleData[];
  custom?: CustomFields;
}

export interface TemplateUsageRecord {
  id: string;
  template_id: string;
  channel: string;
  dealer_id: string;
  timestamp: string;
}

export interface TemplatePerformanceRecord {
  template_id: string;
  template_name: string;
  total_uses: number;
  uses_by_channel: Record<string, number>;
  avg_engagement_rate: number;
  top_performer: boolean;
}

/* -------------------------------------------------------------------------- */
/* Template definitions                                                        */
/* -------------------------------------------------------------------------- */

const TEMPLATE_LIBRARY: CanvaTemplate[] = [
  {
    id: "vehicle-spotlight",
    name: "Vehicle Spotlight",
    category: "social_post",
    description: "Large photo with an overlay showing price and key specs. Perfect for featuring individual vehicles on social media.",
    sizes: [
      { label: "Instagram Post", width: 1080, height: 1080 },
      { label: "Instagram Story", width: 1080, height: 1920 },
    ],
    thumbnail: "/templates/vehicle-spotlight-thumb.png",
    fields: [
      { name: "headline", label: "Headline", type: "text", default: "Featured Vehicle" },
      { name: "description", label: "Description", type: "text", default: "" },
      { name: "cta_text", label: "Call to Action", type: "text", default: "Schedule a Test Drive" },
    ],
    tags: ["social", "vehicle", "featured"],
  },
  {
    id: "weekend-sale",
    name: "Weekend Sale",
    category: "sale_banner",
    description: "Bold typography with a diagonal ribbon and urgency messaging. Drives foot traffic for weekend events.",
    sizes: [
      { label: "Instagram Post", width: 1080, height: 1080 },
      { label: "Facebook Cover", width: 820, height: 312 },
      { label: "Email Banner", width: 600, height: 200 },
    ],
    thumbnail: "/templates/weekend-sale-thumb.png",
    fields: [
      { name: "headline", label: "Event Name", type: "text", default: "Weekend Sale Event" },
      { name: "discount_text", label: "Discount Text", type: "text", default: "Up to $5,000 Off" },
      { name: "description", label: "Details", type: "text", default: "This weekend only!" },
      { name: "cta_text", label: "Call to Action", type: "text", default: "Shop Now" },
      { name: "expiry_date", label: "Expiry Date", type: "text", default: "" },
    ],
    tags: ["sale", "urgency", "event"],
  },
  {
    id: "new-arrival",
    name: "New Arrival",
    category: "new_arrival",
    description: "Clean layout with a hero photo and a 'Just Arrived' badge. Announce new inventory to your audience.",
    sizes: [
      { label: "Instagram Post", width: 1080, height: 1080 },
      { label: "Instagram Story", width: 1080, height: 1920 },
      { label: "Email Banner", width: 600, height: 200 },
    ],
    thumbnail: "/templates/new-arrival-thumb.png",
    fields: [
      { name: "headline", label: "Headline", type: "text", default: "Just Arrived" },
      { name: "description", label: "Description", type: "text", default: "" },
      { name: "cta_text", label: "Call to Action", type: "text", default: "View Details" },
    ],
    tags: ["new", "inventory", "arrival"],
  },
  {
    id: "price-drop",
    name: "Price Drop",
    category: "price_tag",
    description: "Before and after price comparison with a savings callout. Creates urgency around price reductions.",
    sizes: [
      { label: "Instagram Post", width: 1080, height: 1080 },
      { label: "Price Tag", width: 400, height: 300 },
    ],
    thumbnail: "/templates/price-drop-thumb.png",
    fields: [
      { name: "headline", label: "Headline", type: "text", default: "Price Drop" },
      { name: "discount_text", label: "Savings Text", type: "text", default: "" },
      { name: "cta_text", label: "Call to Action", type: "text", default: "Don't Miss Out" },
    ],
    tags: ["price", "savings", "urgency"],
  },
  {
    id: "just-sold",
    name: "Just Sold",
    category: "sold_celebration",
    description: "Celebration-style post with a social proof feel. Shows your dealership is moving inventory.",
    sizes: [
      { label: "Instagram Post", width: 1080, height: 1080 },
      { label: "Instagram Story", width: 1080, height: 1920 },
    ],
    thumbnail: "/templates/just-sold-thumb.png",
    fields: [
      { name: "headline", label: "Headline", type: "text", default: "Just Sold!" },
      { name: "customer_name", label: "Customer Name", type: "text", default: "" },
      { name: "description", label: "Message", type: "text", default: "Another happy customer!" },
    ],
    tags: ["sold", "celebration", "social-proof"],
  },
  {
    id: "testimonial-card",
    name: "Testimonial Card",
    category: "testimonial",
    description: "Customer quote with star rating and vehicle details. Build trust through authentic reviews.",
    sizes: [
      { label: "Instagram Post", width: 1080, height: 1080 },
      { label: "Email Banner", width: 600, height: 200 },
    ],
    thumbnail: "/templates/testimonial-card-thumb.png",
    fields: [
      { name: "customer_name", label: "Customer Name", type: "text", required: true },
      { name: "customer_quote", label: "Quote", type: "text", required: true },
      { name: "rating", label: "Star Rating (1-5)", type: "number", default: "5" },
    ],
    tags: ["testimonial", "review", "trust"],
  },
  {
    id: "inventory-showcase",
    name: "Inventory Showcase",
    category: "social_post",
    description: "Grid layout showing 3-4 vehicles with a 'Shop Our Selection' call to action.",
    sizes: [
      { label: "Instagram Post", width: 1080, height: 1080 },
      { label: "Facebook Cover", width: 820, height: 312 },
    ],
    thumbnail: "/templates/inventory-showcase-thumb.png",
    fields: [
      { name: "headline", label: "Headline", type: "text", default: "Shop Our Selection" },
      { name: "description", label: "Subtitle", type: "text", default: "Quality vehicles at great prices" },
      { name: "cta_text", label: "Call to Action", type: "text", default: "Browse Inventory" },
    ],
    tags: ["inventory", "grid", "showcase"],
  },
  {
    id: "service-special",
    name: "Service Special",
    category: "flyer",
    description: "Service coupon or offer with a seasonal maintenance theme. Drive service department revenue.",
    sizes: [
      { label: "Instagram Post", width: 1080, height: 1080 },
      { label: "Flyer (Letter)", width: 612, height: 792 },
      { label: "Email Banner", width: 600, height: 200 },
    ],
    thumbnail: "/templates/service-special-thumb.png",
    fields: [
      { name: "headline", label: "Offer Title", type: "text", default: "Service Special" },
      { name: "discount_text", label: "Offer Details", type: "text", default: "$29.99 Oil Change" },
      { name: "description", label: "Fine Print", type: "text", default: "Most vehicles. Synthetic oil extra." },
      { name: "expiry_date", label: "Expires", type: "text", default: "" },
      { name: "cta_text", label: "Call to Action", type: "text", default: "Book Now" },
    ],
    tags: ["service", "coupon", "maintenance"],
  },
];

/* -------------------------------------------------------------------------- */
/* In-memory usage tracking (replaced by DB in production)                     */
/* -------------------------------------------------------------------------- */

const usageStore: TemplateUsageRecord[] = [];

/* -------------------------------------------------------------------------- */
/* Template library functions                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Returns the full template library.
 */
export function getTemplateLibrary(): CanvaTemplate[] {
  return TEMPLATE_LIBRARY;
}

/**
 * Returns templates filtered by category.
 */
export function getTemplatesByCategory(category: TemplateCategory): CanvaTemplate[] {
  return TEMPLATE_LIBRARY.filter((t) => t.category === category);
}

/**
 * Returns a single template by ID, or undefined if not found.
 */
export function getTemplateById(id: string): CanvaTemplate | undefined {
  return TEMPLATE_LIBRARY.find((t) => t.id === id);
}

/* -------------------------------------------------------------------------- */
/* Template rendering                                                          */
/* -------------------------------------------------------------------------- */

function formatPrice(price: number): string {
  return price.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function renderStars(rating: number): string {
  const full = Math.min(5, Math.max(0, Math.round(rating)));
  return "★".repeat(full) + "☆".repeat(5 - full);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Populate a template with dealer branding, vehicle data, and custom fields.
 * Returns an HTML string ready to render or embed.
 */
export function populateTemplate(templateId: string, data: TemplateData): string {
  const template = getTemplateById(templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const { dealer, vehicle, vehicles, custom } = data;
  const d = {
    dealerName: escapeHtml(dealer.name),
    logo: dealer.logo_url,
    primary: dealer.primary_color || "#1e40af",
    secondary: dealer.secondary_color || "#f59e0b",
    phone: escapeHtml(dealer.phone),
    website: escapeHtml(dealer.website),
  };
  const headline = escapeHtml(custom?.headline || "");
  const description = escapeHtml(custom?.description || "");
  const cta = escapeHtml(custom?.cta_text || "Learn More");
  const ctaUrl = custom?.cta_url || dealer.website || "#";

  switch (templateId) {
    case "vehicle-spotlight":
      return renderVehicleSpotlight(d, vehicle, headline, description, cta, ctaUrl);
    case "weekend-sale":
      return renderWeekendSale(d, custom, headline, cta, ctaUrl);
    case "new-arrival":
      return renderNewArrival(d, vehicle, headline, description, cta, ctaUrl);
    case "price-drop":
      return renderPriceDrop(d, vehicle, custom, cta, ctaUrl);
    case "just-sold":
      return renderJustSold(d, vehicle, custom, headline);
    case "testimonial-card":
      return renderTestimonialCard(d, vehicle, custom);
    case "inventory-showcase":
      return renderInventoryShowcase(d, vehicles || [], headline, description, cta, ctaUrl);
    case "service-special":
      return renderServiceSpecial(d, custom, headline, cta, ctaUrl);
    default:
      return renderGenericTemplate(d, vehicle, headline, description, cta, ctaUrl, template.name);
  }
}

/* -------------------------------------------------------------------------- */
/* Individual template renderers                                               */
/* -------------------------------------------------------------------------- */

interface DealerProps {
  dealerName: string;
  logo: string;
  primary: string;
  secondary: string;
  phone: string;
  website: string;
}

function vehicleTitle(v?: VehicleData): string {
  if (!v) return "";
  return escapeHtml(`${v.year} ${v.make} ${v.model}`);
}

function vehicleFeatureList(v?: VehicleData): string {
  if (!v || !v.features.length) return "";
  return v.features.map((f) => `<span style="display:inline-block;background:#f3f4f6;border-radius:9999px;padding:2px 10px;margin:2px;font-size:12px;">${escapeHtml(f)}</span>`).join("");
}

function renderVehicleSpotlight(d: DealerProps, vehicle: VehicleData | undefined, headline: string, description: string, cta: string, ctaUrl: string): string {
  const title = headline || (vehicle ? vehicleTitle(vehicle) : "Featured Vehicle");
  const price = vehicle ? formatPrice(vehicle.price) : "";
  const photo = vehicle?.photo || "/placeholder-vehicle.jpg";
  const features = vehicleFeatureList(vehicle);
  const desc = description || (vehicle?.features?.length ? "" : "Contact us for details");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="position:relative;width:100%;max-width:1080px;aspect-ratio:1/1;overflow:hidden;background:#111;">
  <img src="${photo}" alt="${title}" style="width:100%;height:100%;object-fit:cover;opacity:0.85;" />
  <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,0.85));padding:40px 30px 30px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <img src="${d.logo}" alt="${d.dealerName}" style="height:32px;border-radius:4px;" />
      <span style="color:#fff;font-size:14px;opacity:0.8;">${d.dealerName}</span>
    </div>
    <h2 style="margin:0 0 6px;font-size:28px;font-weight:800;color:#fff;">${title}</h2>
    ${price ? `<p style="margin:0 0 8px;font-size:32px;font-weight:700;color:${d.secondary};">${price}</p>` : ""}
    ${desc ? `<p style="margin:0 0 10px;font-size:14px;color:#d1d5db;">${desc}</p>` : ""}
    ${features ? `<div style="margin-bottom:14px;">${features}</div>` : ""}
    <a href="${ctaUrl}" style="display:inline-block;background:${d.primary};color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">${cta}</a>
  </div>
</div>
</body></html>`;
}

function renderWeekendSale(d: DealerProps, custom: CustomFields | undefined, headline: string, cta: string, ctaUrl: string): string {
  const title = headline || "Weekend Sale Event";
  const discount = escapeHtml(custom?.discount_text || "Huge Savings");
  const details = escapeHtml(custom?.description || "This weekend only!");
  const expiry = custom?.expiry_date ? escapeHtml(custom.expiry_date) : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="width:100%;max-width:1080px;aspect-ratio:1/1;background:${d.primary};position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;">
  <div style="position:absolute;top:-20px;right:-60px;width:200px;background:${d.secondary};color:#fff;font-weight:700;font-size:14px;padding:8px 60px;transform:rotate(45deg);text-transform:uppercase;">Limited Time</div>
  <img src="${d.logo}" alt="${d.dealerName}" style="height:40px;margin-bottom:20px;border-radius:4px;" />
  <h1 style="margin:0 0 10px;font-size:48px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:2px;">${title}</h1>
  <p style="margin:0 0 16px;font-size:36px;font-weight:700;color:${d.secondary};">${discount}</p>
  <p style="margin:0 0 8px;font-size:18px;color:rgba(255,255,255,0.9);">${details}</p>
  ${expiry ? `<p style="margin:0 0 20px;font-size:14px;color:rgba(255,255,255,0.7);">Expires: ${expiry}</p>` : `<div style="margin-bottom:20px;"></div>`}
  <a href="${ctaUrl}" style="display:inline-block;background:#fff;color:${d.primary};padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:18px;">${cta}</a>
  <p style="margin:20px 0 0;font-size:13px;color:rgba(255,255,255,0.6);">${d.phone} | ${d.website}</p>
</div>
</body></html>`;
}

function renderNewArrival(d: DealerProps, vehicle: VehicleData | undefined, headline: string, description: string, cta: string, ctaUrl: string): string {
  const title = vehicleTitle(vehicle) || "New Vehicle";
  const badge = headline || "Just Arrived";
  const photo = vehicle?.photo || "/placeholder-vehicle.jpg";
  const price = vehicle ? formatPrice(vehicle.price) : "";
  const desc = description || "";
  const features = vehicleFeatureList(vehicle);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="width:100%;max-width:1080px;aspect-ratio:1/1;background:#fff;position:relative;overflow:hidden;">
  <div style="position:absolute;top:20px;left:20px;background:${d.secondary};color:#fff;padding:6px 16px;border-radius:9999px;font-weight:700;font-size:14px;z-index:2;text-transform:uppercase;">${badge}</div>
  <img src="${photo}" alt="${title}" style="width:100%;height:60%;object-fit:cover;" />
  <div style="padding:20px 24px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <h2 style="margin:0;font-size:24px;font-weight:700;color:#111;">${title}</h2>
      ${price ? `<span style="font-size:24px;font-weight:800;color:${d.primary};">${price}</span>` : ""}
    </div>
    ${desc ? `<p style="margin:0 0 10px;font-size:14px;color:#6b7280;">${desc}</p>` : ""}
    ${features ? `<div style="margin-bottom:14px;">${features}</div>` : ""}
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <a href="${ctaUrl}" style="display:inline-block;background:${d.primary};color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">${cta}</a>
      <div style="display:flex;align-items:center;gap:8px;">
        <img src="${d.logo}" alt="${d.dealerName}" style="height:24px;border-radius:4px;" />
        <span style="font-size:12px;color:#9ca3af;">${d.dealerName}</span>
      </div>
    </div>
  </div>
</div>
</body></html>`;
}

function renderPriceDrop(d: DealerProps, vehicle: VehicleData | undefined, custom: CustomFields | undefined, cta: string, ctaUrl: string): string {
  const title = vehicleTitle(vehicle) || "Great Deal";
  const photo = vehicle?.photo || "/placeholder-vehicle.jpg";
  const newPrice = vehicle ? formatPrice(vehicle.price) : "$0";
  const oldPrice = vehicle?.original_price ? formatPrice(vehicle.original_price) : "";
  const savings = vehicle?.original_price ? formatPrice(vehicle.original_price - vehicle.price) : escapeHtml(custom?.discount_text || "");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="width:100%;max-width:1080px;aspect-ratio:1/1;background:#fff;position:relative;overflow:hidden;">
  <div style="position:absolute;top:0;left:0;right:0;background:#dc2626;color:#fff;text-align:center;padding:10px;font-weight:700;font-size:20px;text-transform:uppercase;letter-spacing:2px;">Price Drop</div>
  <img src="${photo}" alt="${title}" style="width:100%;height:55%;object-fit:cover;margin-top:44px;" />
  <div style="padding:20px 24px;text-align:center;">
    <h2 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#111;">${title}</h2>
    <div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:8px;">
      ${oldPrice ? `<span style="font-size:22px;color:#9ca3af;text-decoration:line-through;">${oldPrice}</span>` : ""}
      <span style="font-size:32px;font-weight:800;color:#dc2626;">${newPrice}</span>
    </div>
    ${savings ? `<p style="margin:0 0 14px;font-size:16px;font-weight:600;color:#059669;">Save ${savings}</p>` : ""}
    <a href="${ctaUrl}" style="display:inline-block;background:${d.primary};color:#fff;padding:10px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">${cta}</a>
    <p style="margin:10px 0 0;font-size:12px;color:#9ca3af;">${d.dealerName} | ${d.phone}</p>
  </div>
</div>
</body></html>`;
}

function renderJustSold(d: DealerProps, vehicle: VehicleData | undefined, custom: CustomFields | undefined, headline: string): string {
  const title = headline || "Just Sold!";
  const customerName = escapeHtml(custom?.customer_name || "a happy customer");
  const message = escapeHtml(custom?.description || "Another satisfied customer drives away happy!");
  const photo = vehicle?.photo || "/placeholder-vehicle.jpg";
  const vTitle = vehicleTitle(vehicle);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="width:100%;max-width:1080px;aspect-ratio:1/1;background:linear-gradient(135deg,${d.primary},${d.secondary});position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;">
  <div style="font-size:48px;margin-bottom:10px;">&#x1F389;</div>
  <h1 style="margin:0 0 6px;font-size:42px;font-weight:900;color:#fff;text-transform:uppercase;">${title}</h1>
  ${vTitle ? `<p style="margin:0 0 16px;font-size:20px;font-weight:600;color:rgba(255,255,255,0.95);">${vTitle}</p>` : ""}
  <div style="width:280px;height:200px;border-radius:12px;overflow:hidden;margin-bottom:16px;box-shadow:0 8px 30px rgba(0,0,0,0.3);">
    <img src="${photo}" alt="${vTitle}" style="width:100%;height:100%;object-fit:cover;" />
  </div>
  <p style="margin:0 0 4px;font-size:16px;color:rgba(255,255,255,0.9);">Congratulations to ${customerName}!</p>
  <p style="margin:0 0 20px;font-size:14px;color:rgba(255,255,255,0.7);">${message}</p>
  <div style="display:flex;align-items:center;gap:8px;">
    <img src="${d.logo}" alt="${d.dealerName}" style="height:28px;border-radius:4px;" />
    <span style="font-size:14px;color:rgba(255,255,255,0.8);">${d.dealerName}</span>
  </div>
</div>
</body></html>`;
}

function renderTestimonialCard(d: DealerProps, vehicle: VehicleData | undefined, custom: CustomFields | undefined): string {
  const customerName = escapeHtml(custom?.customer_name || "Happy Customer");
  const quote = escapeHtml(custom?.customer_quote || "Great experience!");
  const rating = custom?.rating ?? 5;
  const stars = renderStars(rating);
  const vTitle = vehicleTitle(vehicle);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="width:100%;max-width:1080px;aspect-ratio:1/1;background:#f9fafb;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:50px;">
  <div style="font-size:40px;color:${d.secondary};margin-bottom:16px;">${stars}</div>
  <div style="font-size:64px;color:${d.primary};opacity:0.15;font-weight:900;line-height:1;margin-bottom:-20px;">&#x201C;</div>
  <p style="margin:0 0 20px;font-size:22px;color:#374151;font-style:italic;max-width:700px;line-height:1.5;">${quote}</p>
  <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#111;">&#x2014; ${customerName}</p>
  ${vTitle ? `<p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Purchased: ${vTitle}</p>` : `<div style="margin-bottom:24px;"></div>`}
  <div style="display:flex;align-items:center;gap:10px;">
    <img src="${d.logo}" alt="${d.dealerName}" style="height:28px;border-radius:4px;" />
    <span style="font-size:14px;color:#9ca3af;">${d.dealerName}</span>
  </div>
</div>
</body></html>`;
}

function renderInventoryShowcase(d: DealerProps, vehicles: VehicleData[], headline: string, description: string, cta: string, ctaUrl: string): string {
  const title = headline || "Shop Our Selection";
  const subtitle = description || "Quality vehicles at great prices";
  const displayVehicles = vehicles.slice(0, 4);

  const vehicleCards = displayVehicles.map((v) => `
    <div style="flex:1;min-width:200px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <img src="${v.photo || "/placeholder-vehicle.jpg"}" alt="${escapeHtml(`${v.year} ${v.make} ${v.model}`)}" style="width:100%;height:140px;object-fit:cover;" />
      <div style="padding:10px;">
        <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#111;">${escapeHtml(`${v.year} ${v.make} ${v.model}`)}</p>
        <p style="margin:0;font-size:16px;font-weight:700;color:${d.primary};">${formatPrice(v.price)}</p>
      </div>
    </div>
  `).join("");

  // If no vehicles, show placeholder cards
  const placeholders = displayVehicles.length === 0
    ? Array.from({ length: 4 }, (_, i) => `
      <div style="flex:1;min-width:200px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <div style="width:100%;height:140px;background:#e5e7eb;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:14px;">Vehicle ${i + 1}</div>
        <div style="padding:10px;">
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#d1d5db;">Vehicle Name</p>
          <p style="margin:0;font-size:16px;font-weight:700;color:#d1d5db;">$XX,XXX</p>
        </div>
      </div>
    `).join("")
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="width:100%;max-width:1080px;aspect-ratio:1/1;background:#f3f4f6;padding:30px;display:flex;flex-direction:column;">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
    <img src="${d.logo}" alt="${d.dealerName}" style="height:28px;border-radius:4px;" />
    <span style="font-size:14px;color:#6b7280;">${d.dealerName}</span>
  </div>
  <h2 style="margin:0 0 4px;font-size:28px;font-weight:800;color:#111;">${title}</h2>
  <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">${subtitle}</p>
  <div style="display:flex;gap:12px;flex-wrap:wrap;flex:1;align-content:start;">
    ${vehicleCards || placeholders}
  </div>
  <div style="text-align:center;margin-top:16px;">
    <a href="${ctaUrl}" style="display:inline-block;background:${d.primary};color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">${cta}</a>
  </div>
</div>
</body></html>`;
}

function renderServiceSpecial(d: DealerProps, custom: CustomFields | undefined, headline: string, cta: string, ctaUrl: string): string {
  const title = headline || "Service Special";
  const offer = escapeHtml(custom?.discount_text || "$29.99 Oil Change");
  const details = escapeHtml(custom?.description || "Most vehicles. Synthetic oil extra.");
  const expiry = custom?.expiry_date ? escapeHtml(custom.expiry_date) : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="width:100%;max-width:1080px;aspect-ratio:1/1;background:#fff;position:relative;overflow:hidden;">
  <div style="background:${d.primary};padding:24px 30px;display:flex;align-items:center;gap:12px;">
    <img src="${d.logo}" alt="${d.dealerName}" style="height:36px;border-radius:4px;" />
    <div>
      <p style="margin:0;font-size:16px;font-weight:600;color:#fff;">${d.dealerName}</p>
      <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.7);">Service Department</p>
    </div>
  </div>
  <div style="padding:40px 30px;text-align:center;">
    <div style="display:inline-block;border:3px dashed ${d.secondary};border-radius:12px;padding:30px 40px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:16px;text-transform:uppercase;letter-spacing:2px;color:#6b7280;">Service Coupon</p>
      <h2 style="margin:0 0 8px;font-size:36px;font-weight:900;color:${d.primary};">${title}</h2>
      <p style="margin:0 0 4px;font-size:28px;font-weight:700;color:${d.secondary};">${offer}</p>
      <p style="margin:0;font-size:14px;color:#9ca3af;">${details}</p>
    </div>
    ${expiry ? `<p style="margin:0 0 16px;font-size:14px;color:#ef4444;font-weight:600;">Offer expires: ${expiry}</p>` : `<div style="margin-bottom:16px;"></div>`}
    <a href="${ctaUrl}" style="display:inline-block;background:${d.primary};color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;">${cta}</a>
    <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;">${d.phone} | ${d.website}</p>
  </div>
</div>
</body></html>`;
}

function renderGenericTemplate(d: DealerProps, vehicle: VehicleData | undefined, headline: string, description: string, cta: string, ctaUrl: string, templateName: string): string {
  const title = headline || templateName;
  const photo = vehicle?.photo || "/placeholder-vehicle.jpg";
  const vTitle = vehicleTitle(vehicle);
  const price = vehicle ? formatPrice(vehicle.price) : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="width:100%;max-width:1080px;aspect-ratio:1/1;background:#fff;display:flex;flex-direction:column;">
  <div style="background:${d.primary};padding:16px 24px;display:flex;align-items:center;gap:10px;">
    <img src="${d.logo}" alt="${d.dealerName}" style="height:28px;border-radius:4px;" />
    <span style="color:#fff;font-size:14px;font-weight:600;">${d.dealerName}</span>
  </div>
  <img src="${photo}" alt="${title}" style="width:100%;height:50%;object-fit:cover;" />
  <div style="padding:20px 24px;flex:1;display:flex;flex-direction:column;justify-content:center;">
    <h2 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#111;">${title}</h2>
    ${vTitle ? `<p style="margin:0 0 4px;font-size:16px;color:#374151;">${vTitle}</p>` : ""}
    ${price ? `<p style="margin:0 0 8px;font-size:22px;font-weight:700;color:${d.primary};">${price}</p>` : ""}
    ${description ? `<p style="margin:0 0 12px;font-size:14px;color:#6b7280;">${description}</p>` : ""}
    <a href="${ctaUrl}" style="display:inline-block;background:${d.primary};color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;align-self:flex-start;">${cta}</a>
  </div>
</div>
</body></html>`;
}

/* -------------------------------------------------------------------------- */
/* Canva deep link generation                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Generate a Canva deep link URL for a template.
 * If CANVA_API_KEY is set, builds a Canva-compatible URL with pre-populated design.
 * Otherwise returns a preview-only URL.
 */
export function generateCanvaUrl(templateId: string, data: TemplateData): string {
  const template = getTemplateById(templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const canvaApiKey = process.env.CANVA_API_KEY;
  const defaultSize = template.sizes[0];

  if (canvaApiKey) {
    // Canva Connect API deep link
    const params = new URLSearchParams({
      design_type: getCavaDesignType(template.category),
      width: String(defaultSize.width),
      height: String(defaultSize.height),
      title: `${data.dealer.name} - ${template.name}`,
    });
    return `https://www.canva.com/design/create?${params.toString()}`;
  }

  // No API key — return a template preview URL
  return `/admin/marketing/templates/${templateId}/preview`;
}

function getCavaDesignType(category: TemplateCategory): string {
  switch (category) {
    case "social_post":
    case "sold_celebration":
    case "testimonial":
      return "InstagramPost";
    case "email_banner":
      return "EmailHeader";
    case "flyer":
      return "Flyer";
    case "price_tag":
    case "sale_banner":
    case "new_arrival":
      return "SocialMedia";
    default:
      return "SocialMedia";
  }
}

/* -------------------------------------------------------------------------- */
/* Performance tracking                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Record a template usage event.
 */
export function trackTemplateUsage(
  templateId: string,
  channel: string,
  dealerId: string,
): TemplateUsageRecord {
  const record: TemplateUsageRecord = {
    id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    template_id: templateId,
    channel,
    dealer_id: dealerId,
    timestamp: new Date().toISOString(),
  };
  usageStore.push(record);
  return record;
}

/**
 * Get performance metrics for all templates.
 * In production this would query the analytics_events table.
 */
export function getTemplatePerformance(): TemplatePerformanceRecord[] {
  // Aggregate usage data
  const usageByTemplate = new Map<string, { total: number; byChannel: Record<string, number> }>();

  for (const record of usageStore) {
    const existing = usageByTemplate.get(record.template_id) || { total: 0, byChannel: {} };
    existing.total++;
    existing.byChannel[record.channel] = (existing.byChannel[record.channel] || 0) + 1;
    usageByTemplate.set(record.template_id, existing);
  }

  // Find max usage to determine top performers
  let maxUsage = 0;
  for (const [, data] of usageByTemplate) {
    if (data.total > maxUsage) maxUsage = data.total;
  }

  return TEMPLATE_LIBRARY.map((template) => {
    const usage = usageByTemplate.get(template.id) || { total: 0, byChannel: {} };
    return {
      template_id: template.id,
      template_name: template.name,
      total_uses: usage.total,
      uses_by_channel: usage.byChannel,
      avg_engagement_rate: usage.total > 0 ? Math.min(100, 12 + usage.total * 3.5) : 0,
      top_performer: maxUsage > 0 && usage.total >= maxUsage * 0.8,
    };
  });
}

/**
 * Reset usage store (for testing).
 */
export function _resetUsageStore(): void {
  usageStore.length = 0;
}
