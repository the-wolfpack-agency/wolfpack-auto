/**
 * HubSpot-specific payload formatting.
 *
 * Maps internal lead fields to HubSpot contact properties using the
 * standard HubSpot CRM v3 properties API format.
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
 * Map lead temperature to HubSpot lead_status values.
 * HubSpot defaults: NEW, OPEN, IN_PROGRESS, OPEN_DEAL, UNQUALIFIED, ATTEMPTED_TO_CONTACT, CONNECTED, BAD_TIMING
 */
function mapTemperatureToStatus(
  temperature?: string,
): string {
  switch (temperature) {
    case "hot":
      return "OPEN_DEAL";
    case "warm":
      return "IN_PROGRESS";
    case "cool":
      return "OPEN";
    case "cold":
      return "UNQUALIFIED";
    default:
      return "NEW";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Format a lead payload for HubSpot's CRM v3 contacts API.
 *
 * Input fields:
 *   - name / first_name + last_name
 *   - email
 *   - phone
 *   - vehicle_interest
 *   - temperature
 *   - source
 *   - notes
 *
 * Output: HubSpot `{ properties: { ... } }` envelope.
 */
export function formatForHubSpot(
  lead: Record<string, unknown>,
): Record<string, unknown> {
  const name =
    (lead.name as string) ??
    `${(lead.first_name as string) ?? ""} ${(lead.last_name as string) ?? ""}`.trim();

  const { first, last } = lead.first_name
    ? { first: lead.first_name as string, last: (lead.last_name as string) ?? "" }
    : splitName(name);

  const properties: Record<string, unknown> = {
    firstname: first,
    lastname: last,
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    // Vehicle interest as a custom property (dealers must create this in HubSpot)
    vehicle_interest: lead.vehicle_interest ?? "",
    lead_status: mapTemperatureToStatus(lead.temperature as string | undefined),
    hs_lead_status: mapTemperatureToStatus(lead.temperature as string | undefined),
  };

  // Optional fields
  if (lead.source) {
    properties.hs_analytics_source = lead.source;
  }
  if (lead.notes) {
    properties.message = lead.notes;
  }
  if (lead.utm_source) {
    properties.hs_analytics_source_data_1 = lead.utm_source;
  }
  if (lead.utm_campaign) {
    properties.hs_analytics_source_data_2 = lead.utm_campaign;
  }

  return { properties };
}
