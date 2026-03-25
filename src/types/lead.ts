/**
 * Lead / customer inquiry types.
 */

export type LeadSource =
  | "website_form"
  | "vdp_inquiry"
  | "chat"
  | "phone"
  | "third_party"
  | "walk_in";

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "appointment_set"
  | "sold"
  | "lost";

export interface Lead {
  id: string;
  dealer_id: string;

  // Contact info
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;

  // Interest
  vehicle_id: string | null;
  vehicle_interest: string; // free-text: "2024 Toyota Camry SE"

  // Tracking
  source: LeadSource;
  status: LeadStatus;
  notes: string;

  // Attribution
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer_url: string | null;

  // Metadata
  created_at: string;
  updated_at: string;
}
