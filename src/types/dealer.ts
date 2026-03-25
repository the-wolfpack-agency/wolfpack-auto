/**
 * Dealer / rooftop types for multi-tenant dealer platform.
 */

export interface DealerHours {
  day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  open: string;   // "09:00"
  close: string;  // "18:00"
  closed: boolean;
}

export interface DealerBranding {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  logo_url: string;
  favicon_url: string | null;
  font_family: string;
}

export interface DealerAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
}

export interface Dealer {
  id: string;
  name: string;
  slug: string;
  subdomain: string;

  // Contact
  phone: string;
  email: string;
  website_url: string;

  // Location
  address: DealerAddress;

  // Business hours
  sales_hours: DealerHours[];
  service_hours: DealerHours[];

  // Branding
  branding: DealerBranding;

  // Features
  has_service_center: boolean;
  has_financing: boolean;
  has_trade_in: boolean;

  // Metadata
  created_at: string;
  updated_at: string;
  is_active: boolean;
}
