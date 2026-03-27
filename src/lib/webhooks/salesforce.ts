/**
 * Salesforce-specific payload formatting.
 *
 * Maps internal lead fields to Salesforce Lead sObject fields using the
 * standard Salesforce REST API format.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] ?? "", last: "" };
  const first = parts[0];
  const last = parts.slice(1).join(" ");
  return { first, last };
}

/**
 * Map internal lead status to Salesforce Lead.Status picklist values.
 * Standard picklist: Open - Not Contacted, Working - Contacted, Closed - Converted, Closed - Not Converted
 */
function mapStatus(status?: string): string {
  switch (status) {
    case "new":
      return "Open - Not Contacted";
    case "contacted":
      return "Working - Contacted";
    case "qualified":
      return "Working - Contacted";
    case "appointment_set":
      return "Working - Contacted";
    case "sold":
      return "Closed - Converted";
    case "lost":
      return "Closed - Not Converted";
    default:
      return "Open - Not Contacted";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Format a lead payload for Salesforce's REST API (Lead sObject).
 *
 * Input fields:
 *   - name / first_name + last_name
 *   - email
 *   - phone
 *   - vehicle_interest
 *   - status
 *   - source
 *   - notes
 *
 * Output: flat Salesforce Lead sObject fields.
 */
export function formatForSalesforce(
  lead: Record<string, unknown>,
): Record<string, unknown> {
  const name =
    (lead.name as string) ??
    `${(lead.first_name as string) ?? ""} ${(lead.last_name as string) ?? ""}`.trim();

  const { first, last } = lead.first_name
    ? { first: lead.first_name as string, last: (lead.last_name as string) ?? "" }
    : splitName(name);

  const sfLead: Record<string, unknown> = {
    FirstName: first,
    // Salesforce requires LastName — use company name as fallback
    LastName: last || "Unknown",
    Email: lead.email ?? "",
    Phone: lead.phone ?? "",
    Description: lead.vehicle_interest ?? "",
    Status: mapStatus(lead.status as string | undefined),
    LeadSource: mapLeadSource(lead.source as string | undefined),
  };

  // Optional fields
  if (lead.notes) {
    sfLead.Description =
      `Vehicle Interest: ${lead.vehicle_interest ?? "N/A"}\n\n${lead.notes}`;
  }
  if (lead.utm_campaign) {
    sfLead.Campaign_Source__c = lead.utm_campaign;
  }

  return sfLead;
}

/**
 * Map internal source values to Salesforce LeadSource picklist.
 */
function mapLeadSource(source?: string): string {
  switch (source) {
    case "website_form":
      return "Web";
    case "vdp_inquiry":
      return "Web";
    case "chat":
      return "Web";
    case "phone":
      return "Phone Inquiry";
    case "third_party":
      return "Partner Referral";
    case "walk_in":
      return "Other";
    default:
      return "Web";
  }
}
