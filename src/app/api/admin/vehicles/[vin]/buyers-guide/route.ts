import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";
import { getDealerConfig } from "@/lib/dealer-config";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface RouteContext {
  params: Promise<{ vin: string }>;
}

/* -------------------------------------------------------------------------- */
/* GET /api/admin/vehicles/[vin]/buyers-guide                                 */
/* -------------------------------------------------------------------------- */

export async function GET(_req: NextRequest, context: RouteContext) {
  // --- Authentication ---
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { vin } = await context.params;

  if (!vin) {
    return NextResponse.json({ error: "VIN is required" }, { status: 400 });
  }

  const dealer = await getDealerConfig();
  const dealerId = authResult.user.dealer_id;

  // Fetch vehicle data from DB (or shadow fallback)
  let vehicle: Record<string, any>;

  if (!process.env.DATABASE_URL) {
    // Shadow mode fallback
    vehicle = {
      vin: vin.toUpperCase(),
      stock_number: "STK-" + vin.slice(-6).toUpperCase(),
      year: 2024,
      make: "Demo",
      model: "Vehicle",
      trim: "SE",
      mileage: 15000,
      price: 28995,
      condition: "used",
      warranty_type: "as_is",
      warranty_months: 0,
      warranty_miles: 0,
      warranty_deductible: 0,
      warranty_systems: "",
    };
  } else {
    try {
      const result = await query(
        `SELECT
          vin, stock_number, year, make, model, trim,
          mileage, price, condition,
          COALESCE(warranty_type, 'as_is') AS warranty_type,
          COALESCE(warranty_months, 0) AS warranty_months,
          COALESCE(warranty_miles, 0) AS warranty_miles,
          COALESCE(warranty_deductible, 0) AS warranty_deductible,
          COALESCE(warranty_systems, '') AS warranty_systems
        FROM vehicles
        WHERE dealer_id = $1 AND vin = $2
        LIMIT 1`,
        [dealerId, vin.toUpperCase()],
      );

      const row = (result.rows as any[])[0];

      if (!row) {
        return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
      }

      vehicle = row;
    } catch {
      // DB error — return shadow fallback
      vehicle = {
        vin: vin.toUpperCase(),
        stock_number: "STK-" + vin.slice(-6).toUpperCase(),
        year: 2024,
        make: "Demo",
        model: "Vehicle",
        trim: "SE",
        mileage: 15000,
        price: 28995,
        condition: "used",
        warranty_type: "as_is",
        warranty_months: 0,
        warranty_miles: 0,
        warranty_deductible: 0,
        warranty_systems: "",
      };
    }
  }

  const isAsIs = vehicle.warranty_type === "as_is";
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Track analytics event (fire-and-forget)
  try {
    trackSystem("document.buyers_guide_generated", dealerId, {
      action: "buyers_guide_generated",
      vin: vehicle.vin,
    });
  } catch {
    // analytics must never break the primary flow
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Buyer's Guide - ${vehicle.year} ${vehicle.make} ${vehicle.model} - ${vehicle.vin}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111827;
      background: #f9fafb;
      line-height: 1.5;
      padding: 20px;
    }

    .page {
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      border: 2px solid #111827;
      padding: 40px;
    }

    .header {
      text-align: center;
      border-bottom: 3px solid #111827;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }

    .header h1 {
      font-size: 32px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    .header .subtitle {
      font-size: 14px;
      color: #6b7280;
      margin-top: 4px;
    }

    .dealer-info {
      text-align: center;
      font-size: 14px;
      color: #374151;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid #e5e7eb;
    }

    .dealer-info .dealer-name {
      font-size: 18px;
      font-weight: 700;
      color: #111827;
    }

    .vehicle-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 24px;
      margin-bottom: 24px;
      padding: 20px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
    }

    .vehicle-info .field {
      display: flex;
      flex-direction: column;
    }

    .vehicle-info .field-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      font-weight: 600;
    }

    .vehicle-info .field-value {
      font-size: 16px;
      font-weight: 600;
      color: #111827;
    }

    .warranty-section {
      border: 3px solid #111827;
      border-radius: 8px;
      margin-bottom: 24px;
      overflow: hidden;
    }

    .warranty-header {
      background: #111827;
      color: #fff;
      padding: 12px 20px;
      font-size: 16px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .warranty-body {
      padding: 20px;
    }

    .warranty-option {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      margin-bottom: 12px;
    }

    .warranty-option.selected {
      border-color: #111827;
      background: #f9fafb;
    }

    .warranty-option:last-child {
      margin-bottom: 0;
    }

    .checkbox {
      width: 24px;
      height: 24px;
      border: 2px solid #9ca3af;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .checkbox.checked {
      border-color: #111827;
      background: #111827;
    }

    .checkbox.checked::after {
      content: "\\2713";
      color: #fff;
      font-size: 16px;
      font-weight: 700;
    }

    .warranty-option h3 {
      font-size: 16px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .warranty-option p {
      font-size: 13px;
      color: #6b7280;
      margin-top: 4px;
    }

    .warranty-details {
      margin-top: 16px;
      padding: 16px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
    }

    .warranty-details h4 {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      color: #374151;
      margin-bottom: 8px;
    }

    .warranty-details .detail-row {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      padding: 6px 0;
      border-bottom: 1px solid #e5e7eb;
    }

    .warranty-details .detail-row:last-child {
      border-bottom: none;
    }

    .notice {
      padding: 16px 20px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 13px;
      color: #374151;
    }

    .notice h4 {
      font-weight: 700;
      font-size: 14px;
      text-transform: uppercase;
      color: #111827;
      margin-bottom: 6px;
    }

    .footer {
      margin-top: 32px;
      padding-top: 20px;
      border-top: 2px solid #111827;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      font-size: 13px;
    }

    .signature-line {
      margin-top: 40px;
      border-top: 1px solid #111827;
      padding-top: 4px;
      font-size: 12px;
      color: #6b7280;
    }

    .date-line {
      font-size: 12px;
      color: #6b7280;
      margin-top: 8px;
    }

    .ftc-notice {
      margin-top: 24px;
      padding: 16px;
      background: #fef3c7;
      border: 1px solid #f59e0b;
      border-radius: 8px;
      font-size: 11px;
      color: #92400e;
      text-align: center;
    }

    @media print {
      body {
        background: #fff;
        padding: 0;
      }

      .page {
        border: none;
        padding: 20px;
        max-width: 100%;
      }

      .no-print {
        display: none !important;
      }
    }

    @media (max-width: 640px) {
      .page {
        padding: 20px;
      }

      .vehicle-info {
        grid-template-columns: 1fr;
      }

      .footer {
        grid-template-columns: 1fr;
      }
    }

    .print-btn {
      display: block;
      max-width: 800px;
      margin: 16px auto;
      padding: 12px 24px;
      background: #0c8de9;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
    }

    .print-btn:hover {
      background: #0b7fd4;
    }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">
    Print Buyer's Guide
  </button>

  <div class="page">
    <div class="header">
      <h1>Buyer's Guide</h1>
      <p class="subtitle">IMPORTANT: Spoken promises are difficult to enforce. Ask the dealer to put all promises in writing. Keep this form.</p>
    </div>

    <div class="dealer-info">
      <div class="dealer-name">${escapeHtml(dealer.name)}</div>
      <div>${escapeHtml(dealer.address)}, ${escapeHtml(dealer.city)}, ${escapeHtml(dealer.state)} ${escapeHtml(dealer.zip)}</div>
      <div>${escapeHtml(dealer.phone)} | ${escapeHtml(dealer.email)}</div>
    </div>

    <div class="vehicle-info">
      <div class="field">
        <span class="field-label">Year / Make / Model</span>
        <span class="field-value">${vehicle.year} ${escapeHtml(String(vehicle.make))} ${escapeHtml(String(vehicle.model))}${vehicle.trim ? " " + escapeHtml(String(vehicle.trim)) : ""}</span>
      </div>
      <div class="field">
        <span class="field-label">VIN</span>
        <span class="field-value" style="font-family: monospace; font-size: 14px;">${escapeHtml(vehicle.vin)}</span>
      </div>
      <div class="field">
        <span class="field-label">Stock Number</span>
        <span class="field-value">${escapeHtml(String(vehicle.stock_number || "N/A"))}</span>
      </div>
      <div class="field">
        <span class="field-label">Mileage</span>
        <span class="field-value">${vehicle.mileage ? Number(vehicle.mileage).toLocaleString() : "N/A"} miles</span>
      </div>
      <div class="field">
        <span class="field-label">Price</span>
        <span class="field-value">$${Number(vehicle.price).toLocaleString()}</span>
      </div>
      <div class="field">
        <span class="field-label">Condition</span>
        <span class="field-value">${escapeHtml(String(vehicle.condition || "Used")).replace(/^\w/, (c: string) => c.toUpperCase())}</span>
      </div>
    </div>

    <div class="warranty-section">
      <div class="warranty-header">Warranties</div>
      <div class="warranty-body">
        <div class="warranty-option ${isAsIs ? "selected" : ""}">
          <div class="checkbox ${isAsIs ? "checked" : ""}"></div>
          <div>
            <h3>As Is - No Dealer Warranty</h3>
            <p>
              YOU WILL PAY ALL COSTS FOR ANY REPAIRS. The dealer assumes no responsibility for any repairs regardless of any oral statements about the vehicle.
            </p>
          </div>
        </div>

        <div class="warranty-option ${!isAsIs ? "selected" : ""}">
          <div class="checkbox ${!isAsIs ? "checked" : ""}"></div>
          <div>
            <h3>Warranty</h3>
            <p>
              The dealer will pay ${!isAsIs ? vehicle.warranty_months + " month(s) or " + Number(vehicle.warranty_miles).toLocaleString() + " miles, whichever comes first" : "____% of the labor and ____% of the parts"} for the covered systems listed below.
            </p>
          </div>
        </div>

        ${!isAsIs ? `
        <div class="warranty-details">
          <h4>Warranty Coverage Details</h4>
          <div class="detail-row">
            <span>Duration</span>
            <span>${vehicle.warranty_months} months / ${Number(vehicle.warranty_miles).toLocaleString()} miles</span>
          </div>
          <div class="detail-row">
            <span>Deductible</span>
            <span>$${Number(vehicle.warranty_deductible).toLocaleString()}</span>
          </div>
          <div class="detail-row">
            <span>Systems Covered</span>
            <span>${escapeHtml(String(vehicle.warranty_systems || "See dealer for details"))}</span>
          </div>
        </div>
        ` : ""}
      </div>
    </div>

    <div class="notice">
      <h4>Systems Covered Under Warranty (if applicable)</h4>
      <p>
        Frame &amp; Body, Engine, Transmission/Transaxle, Drive Axle, Steering, Suspension, Brakes, Electrical, Air Conditioning, Heating/Cooling, Fuel System, Exhaust, Accessories, Seals &amp; Gaskets.
        Coverage may vary &mdash; consult your warranty document for specific terms.
      </p>
    </div>

    <div class="notice">
      <h4>Service Contract</h4>
      <p>
        A service contract is available at an extra charge on this vehicle. Ask for details as to coverage, deductible, price, and exclusions. If you buy a service contract within 90 days of the time of sale, state law "implied warranties" may give you additional rights.
      </p>
    </div>

    <div class="notice">
      <h4>Pre-Purchase Inspection</h4>
      <p>
        YOU MAY HAVE THIS VEHICLE INSPECTED BY A MECHANIC OF YOUR CHOICE BEFORE YOU BUY IT.
        Ask the dealer for permission and for the name of a local mechanic.
      </p>
    </div>

    <div class="footer">
      <div>
        <strong>Buyer</strong>
        <div class="signature-line">Signature</div>
        <div class="date-line">Date: ${today}</div>
      </div>
      <div>
        <strong>Dealer Representative</strong>
        <div class="signature-line">Signature</div>
        <div class="date-line">Date: ${today}</div>
      </div>
    </div>

    <div class="ftc-notice">
      This form is required by the Federal Trade Commission (FTC) Used Car Rule, 16 CFR Part 455.
      It must be displayed on all used vehicles offered for sale and must be given to the buyer upon purchase.
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
