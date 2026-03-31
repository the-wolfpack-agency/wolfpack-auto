/**
 * Lead / customer inquiry types.
 */

export type LeadSource =
  | "website_form"
  | "vdp_inquiry"
  | "chat"
  | "phone"
  | "third_party"
  | "walk_in"
  | "trade_in";

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "appointment_set"
  | "sold"
  | "lost"
  | "converted";

export type LeadTemperature = "hot" | "warm" | "cool" | "cold";

export interface LeadNote {
  id: string;
  text: string;
  author: string;
  created_at: string;
}

export interface LeadActivity {
  id: string;
  type: "status_change" | "assignment" | "note" | "follow_up";
  description: string;
  author: string;
  created_at: string;
  meta?: Record<string, string>;
}

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
  temperature: LeadTemperature;
  notes: string;
  structured_notes: LeadNote[];
  assigned_to: string | null;
  message: string;
  follow_up_date: string | null;
  activity: LeadActivity[];

  // Attribution
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer_url: string | null;

  // Intent scoring (populated after scoreLeadIntent runs)
  intent_score?: number | null;
  score_factors?: Array<{
    signal: string;
    impact: number;
    description: string;
  }> | null;
  recommended_followup_at?: string | null;
  scored_at?: string | null;

  // Behavioural signals (populated by analytics layer)
  page_views?: number;
  vdp_views?: number;
  time_on_site_seconds?: number;
  return_visits?: number;

  // Metadata
  created_at: string;
  updated_at: string;
}
