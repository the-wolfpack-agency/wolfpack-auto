/**
 * Shared dealer config types and defaults.
 * Safe to import from both client and server components.
 */

export interface DealerConfig {
  id: string;
  name: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  business_hours: Record<string, string>;
  social: { facebook?: string; instagram?: string; twitter?: string };
}

export const DEFAULT_CONFIG: DealerConfig = {
  id: "wolfpack-motors",
  name: "Wolfpack Motors",
  tagline: "Find Your Perfect Vehicle",
  phone: "(303) 555-1234",
  email: "hello@wolfpackmotors.com",
  address: "1234 Auto Drive",
  city: "Denver",
  state: "CO",
  zip: "80202",
  logo_url: null,
  primary_color: "#0070c7",
  secondary_color: "#0c8de9",
  accent_color: "#f97316",
  business_hours: {
    "Monday - Friday": "9:00 AM - 8:00 PM",
    Saturday: "9:00 AM - 6:00 PM",
    Sunday: "10:00 AM - 5:00 PM",
  },
  social: {},
};
