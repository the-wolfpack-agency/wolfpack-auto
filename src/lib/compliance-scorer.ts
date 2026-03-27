/**
 * OEM Brand Compliance Scorer
 *
 * Automatically checks dealer configuration and data against OEM brand
 * standards across four weighted categories and produces a 0-100 score
 * with a letter grade and a prioritised violations list.
 *
 * Category weights
 *   Brand Identity       25 pts
 *   Legal & Disclosures  30 pts
 *   Digital Presence     25 pts
 *   Lead Responsiveness  20 pts
 *   ─────────────────   ────
 *   Total               100 pts
 */

import { query } from "@/lib/db";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface ComplianceViolation {
  category: string;
  item: string;
  impact: "high" | "medium" | "low";
  recommendation: string;
}

export interface ComplianceCheckResult {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  categoryScores: {
    brandIdentity: number;
    legalDisclosures: number;
    digitalPresence: number;
    leadResponsiveness: number;
  };
  violations: ComplianceViolation[];
}

/* -------------------------------------------------------------------------- */
/* Competitor name list (checked against dealer name)                         */
/* -------------------------------------------------------------------------- */

const COMPETITOR_NAMES = [
  "autotrader",
  "cars.com",
  "carmax",
  "carvana",
  "vroom",
  "shift",
  "dealertrack",
  "dealer.com",
];

/* -------------------------------------------------------------------------- */
/* Grade calculation                                                           */
/* -------------------------------------------------------------------------- */

function calculateGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/* -------------------------------------------------------------------------- */
/* Default (graceful-failure) result                                           */
/* -------------------------------------------------------------------------- */

function defaultResult(): ComplianceCheckResult {
  return {
    score: 0,
    grade: "F",
    categoryScores: {
      brandIdentity: 0,
      legalDisclosures: 0,
      digitalPresence: 0,
      leadResponsiveness: 0,
    },
    violations: [
      {
        category: "System",
        item: "Database unavailable",
        impact: "high",
        recommendation:
          "Ensure the database is running and DATABASE_URL is configured correctly.",
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Main scorer                                                                 */
/* -------------------------------------------------------------------------- */

export async function scoreDealerCompliance(
  dealerId: string,
): Promise<ComplianceCheckResult> {
  try {
    /* ------------------------------------------------------------------ */
    /* 1. Fetch dealer row                                                  */
    /* ------------------------------------------------------------------ */
    const dealerResult = await query<{
      name: string;
      phone: string;
      email: string;
      website_url: string;
      address: Record<string, unknown> | null;
      branding: Record<string, unknown> | null;
      tagline: string | null;
      primary_color: string | null;
      logo_url: string | null;
    }>(
      `SELECT
         name,
         phone,
         email,
         website_url,
         address,
         branding,
         tagline,
         primary_color,
         logo_url
       FROM dealers
       WHERE id = $1
       LIMIT 1`,
      [dealerId],
    );

    if (dealerResult.rows.length === 0) {
      return defaultResult();
    }

    const dealer = dealerResult.rows[0];

    /* ------------------------------------------------------------------ */
    /* 2. Fetch supporting counts / data                                   */
    /* ------------------------------------------------------------------ */

    // Vehicles with price > 0 and vehicles added in last 30 days
    const vehicleResult = await query<{
      priced_count: string;
      recent_count: string;
      total_count: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE price > 0)               AS priced_count,
         COUNT(*) FILTER (WHERE created_at >= now() - INTERVAL '30 days') AS recent_count,
         COUNT(*)                                         AS total_count
       FROM vehicles
       WHERE dealer_id = $1`,
      [dealerId],
    );

    const vRow = vehicleResult.rows[0] ?? {
      priced_count: "0",
      recent_count: "0",
      total_count: "0",
    };
    const pricedVehicles = parseInt(vRow.priced_count, 10);
    const recentVehicles = parseInt(vRow.recent_count, 10);
    const totalVehicles = parseInt(vRow.total_count, 10);

    // Dealer users count
    const usersResult = await query<{ user_count: string }>(
      `SELECT COUNT(*) AS user_count
       FROM dealer_users
       WHERE dealer_id = $1`,
      [dealerId],
    ).catch(() => ({ rows: [{ user_count: "0" }] }));

    const userCount = parseInt(usersResult.rows[0]?.user_count ?? "0", 10);

    // Average lead response time (hours between created_at and first_response_at if set)
    const leadResult = await query<{ avg_response_hours: string | null }>(
      `SELECT
         AVG(
           EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600.0
         ) AS avg_response_hours
       FROM leads
       WHERE dealer_id = $1
         AND first_response_at IS NOT NULL`,
      [dealerId],
    ).catch(() => ({ rows: [{ avg_response_hours: null }] }));

    const avgResponseHours =
      leadResult.rows[0]?.avg_response_hours != null
        ? parseFloat(leadResult.rows[0].avg_response_hours)
        : null;

    /* ------------------------------------------------------------------ */
    /* 3. Parse dealer fields                                              */
    /* ------------------------------------------------------------------ */

    const branding =
      dealer.branding && typeof dealer.branding === "object"
        ? dealer.branding
        : {};

    // Resolve logo_url from either top-level column (older schema) or branding JSONB
    const logoUrl: string | null =
      dealer.logo_url ??
      (typeof branding.logo_url === "string" ? branding.logo_url : null);

    // Resolve primary colour from top-level column or branding JSONB
    const primaryColor: string | null =
      dealer.primary_color ??
      (typeof branding.primary_color === "string"
        ? branding.primary_color
        : null);

    // Resolve address parts
    const address =
      dealer.address && typeof dealer.address === "object"
        ? dealer.address
        : {};
    const hasFullAddress =
      typeof address.street === "string" && address.street.trim() !== "" &&
      typeof address.city === "string" && address.city.trim() !== "" &&
      typeof address.state === "string" && address.state.trim() !== "" &&
      typeof address.zip === "string" && address.zip.trim() !== "";

    // Privacy / terms from branding JSONB (optional fields dealers can set)
    const privacyPolicyUrl: string | null =
      typeof branding.privacy_policy_url === "string"
        ? branding.privacy_policy_url
        : null;
    const termsUrl: string | null =
      typeof branding.terms_url === "string" ? branding.terms_url : null;
    const ftcDisclosure: string | null =
      typeof branding.ftc_disclosure === "string"
        ? branding.ftc_disclosure
        : null;
    const resendFromEmail: string | null =
      typeof branding.resend_from_email === "string"
        ? branding.resend_from_email
        : process.env.RESEND_FROM_EMAIL ?? null;

    /* ------------------------------------------------------------------ */
    /* 4. Score each category                                              */
    /* ------------------------------------------------------------------ */

    const violations: ComplianceViolation[] = [];
    let brandIdentity = 0;
    let legalDisclosures = 0;
    let digitalPresence = 0;
    let leadResponsiveness = 0;

    /* --- Brand Identity (25 pts) -------------------------------------- */

    // Logo URL set (7 pts)
    if (logoUrl && logoUrl.trim() !== "") {
      brandIdentity += 7;
    } else {
      violations.push({
        category: "Brand Identity",
        item: "Logo URL not configured",
        impact: "high",
        recommendation:
          "Upload your dealership logo under Settings > Branding. A logo is required for OEM brand compliance.",
      });
    }

    // Primary colour set (6 pts)
    if (primaryColor && /^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
      brandIdentity += 6;
    } else {
      violations.push({
        category: "Brand Identity",
        item: "Primary brand color not configured or invalid",
        impact: "medium",
        recommendation:
          "Set a valid hex colour (e.g. #0070c7) for your primary brand colour in Settings > Branding.",
      });
    }

    // Dealer name does not contain competitor names (6 pts)
    const nameLower = (dealer.name ?? "").toLowerCase();
    const hasCompetitorName = COMPETITOR_NAMES.some((c) =>
      nameLower.includes(c),
    );
    if (!hasCompetitorName) {
      brandIdentity += 6;
    } else {
      violations.push({
        category: "Brand Identity",
        item: "Dealer name references a competitor brand",
        impact: "high",
        recommendation:
          "Remove competitor brand names from your dealership name to comply with OEM brand standards.",
      });
    }

    // Has tagline or description (6 pts)
    if (dealer.tagline && dealer.tagline.trim().length > 0) {
      brandIdentity += 6;
    } else {
      violations.push({
        category: "Brand Identity",
        item: "No tagline or description set",
        impact: "low",
        recommendation:
          "Add a tagline in Settings > Branding to reinforce your dealership identity.",
      });
    }

    /* --- Legal & Disclosures (30 pts) --------------------------------- */

    // FTC disclosure text configured (8 pts)
    if (ftcDisclosure && ftcDisclosure.trim().length > 0) {
      legalDisclosures += 8;
    } else {
      violations.push({
        category: "Legal & Disclosures",
        item: "FTC disclosure text not configured",
        impact: "high",
        recommendation:
          "Add FTC-compliant disclosure text in Settings > Branding (field: ftc_disclosure). Required by federal law.",
      });
    }

    // Privacy policy URL (6 pts)
    if (privacyPolicyUrl && privacyPolicyUrl.trim() !== "") {
      legalDisclosures += 6;
    } else {
      violations.push({
        category: "Legal & Disclosures",
        item: "Privacy policy URL not configured",
        impact: "high",
        recommendation:
          "Publish a privacy policy and add its URL in Settings > Branding (field: privacy_policy_url).",
      });
    }

    // Terms URL (6 pts)
    if (termsUrl && termsUrl.trim() !== "") {
      legalDisclosures += 6;
    } else {
      violations.push({
        category: "Legal & Disclosures",
        item: "Terms of use URL not configured",
        impact: "medium",
        recommendation:
          "Publish terms of use and add its URL in Settings > Branding (field: terms_url).",
      });
    }

    // At least 1 vehicle with price > 0 (5 pts)
    if (pricedVehicles > 0) {
      legalDisclosures += 5;
    } else {
      violations.push({
        category: "Legal & Disclosures",
        item: "No vehicles with disclosed pricing",
        impact: "high",
        recommendation:
          "Ensure inventory vehicles have a price greater than $0 for FTC price disclosure compliance.",
      });
    }

    // Valid business address (5 pts)
    if (hasFullAddress) {
      legalDisclosures += 5;
    } else {
      violations.push({
        category: "Legal & Disclosures",
        item: "Business address incomplete (street, city, state, zip required)",
        impact: "medium",
        recommendation:
          "Complete your dealership address in Settings. All four address fields are required.",
      });
    }

    /* --- Digital Presence (25 pts) ------------------------------------ */

    // Website URL set (7 pts)
    if (dealer.website_url && dealer.website_url.trim() !== "") {
      digitalPresence += 7;
    } else {
      violations.push({
        category: "Digital Presence",
        item: "Website URL not configured",
        impact: "medium",
        recommendation:
          "Add your dealership website URL in Settings to improve digital presence score.",
      });
    }

    // Valid phone number ≥10 digits (6 pts)
    const phoneDigits = (dealer.phone ?? "").replace(/\D/g, "");
    if (phoneDigits.length >= 10) {
      digitalPresence += 6;
    } else {
      violations.push({
        category: "Digital Presence",
        item: "Phone number invalid or missing (minimum 10 digits required)",
        impact: "medium",
        recommendation:
          "Enter a valid 10-digit phone number in Settings > Contact.",
      });
    }

    // Valid business email (contains @) (6 pts)
    if (dealer.email && dealer.email.includes("@")) {
      digitalPresence += 6;
    } else {
      violations.push({
        category: "Digital Presence",
        item: "Business email address invalid or missing",
        impact: "medium",
        recommendation:
          "Enter a valid email address in Settings > Contact.",
      });
    }

    // Inventory up to date: recent vehicles in last 30 days OR total > 0 (6 pts)
    if (recentVehicles > 0 || totalVehicles > 0) {
      digitalPresence += 6;
    } else {
      violations.push({
        category: "Digital Presence",
        item: "No inventory listed",
        impact: "high",
        recommendation:
          "Add vehicles to your inventory to improve digital presence and customer engagement.",
      });
    }

    /* --- Lead Responsiveness (20 pts) --------------------------------- */

    // Has team members (7 pts)
    if (userCount > 0) {
      leadResponsiveness += 7;
    } else {
      violations.push({
        category: "Lead Responsiveness",
        item: "No team members configured",
        impact: "high",
        recommendation:
          "Add at least one team member under Settings > Team to enable lead assignment and response tracking.",
      });
    }

    // Resend from email configured (6 pts)
    if (resendFromEmail && resendFromEmail.trim() !== "") {
      leadResponsiveness += 6;
    } else {
      violations.push({
        category: "Lead Responsiveness",
        item: "Resend from-email not configured",
        impact: "medium",
        recommendation:
          "Set RESEND_FROM_EMAIL in your environment or configure resend_from_email in dealer branding to enable automated lead email notifications.",
      });
    }

    // Average lead response time < 24 h (7 pts)
    // If no leads with response data exist, we skip (no violation, no points)
    if (avgResponseHours !== null) {
      if (avgResponseHours < 24) {
        leadResponsiveness += 7;
      } else {
        violations.push({
          category: "Lead Responsiveness",
          item: `Average lead response time is ${avgResponseHours.toFixed(1)} hours (target: < 24 h)`,
          impact: "high",
          recommendation:
            "Respond to new leads within 24 hours. Consider setting up automated email notifications via Resend.",
        });
      }
    }

    /* ------------------------------------------------------------------ */
    /* 5. Aggregate                                                        */
    /* ------------------------------------------------------------------ */

    const score = Math.min(
      100,
      brandIdentity + legalDisclosures + digitalPresence + leadResponsiveness,
    );

    return {
      score,
      grade: calculateGrade(score),
      categoryScores: {
        brandIdentity,
        legalDisclosures,
        digitalPresence,
        leadResponsiveness,
      },
      violations,
    };
  } catch (err) {
    console.error("[compliance-scorer] scoreDealerCompliance error:", err);
    return defaultResult();
  }
}
