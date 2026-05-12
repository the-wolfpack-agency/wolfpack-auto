/**
 * Lender packet builder for prequal -> real lender routing (Stream B).
 *
 * Builds a human-readable packet that a lender can underwrite from. The
 * packet pulls together:
 *
 *   - customer name, requested vehicle/stock, vehicle interest text
 *   - income (Plaid BYO if available, else self-reported) + confidence tag
 *   - employment + residence (if dealer has captured them; nullable here
 *     because migration 067 didn't add those columns -- handled via the
 *     optional `extras` field)
 *   - prior bankruptcies flag
 *   - OFAC clear flag (from migration 044's ofac_screening result)
 *   - credit-bureau status (range + tier from soft_credit_pulls); we do
 *     NOT pull bureaus here. Bureaus remain mocked per Stream B scope.
 *
 * Output format:
 *
 *   - PRIMARY: plain text. Every dealer + lender stack can ingest plain
 *     text in an email body. Zero new runtime deps. Plain text is what
 *     gets delivered when no PDF lib is available.
 *   - PDF: if `pdfkit` is installed in this repo, we ALSO emit a PDF
 *     buffer. (Checked dynamically -- no static import.) Disabled when
 *     pdfkit isn't installed, which is the current state of this repo.
 *
 * Security:
 *
 *   - The packet NEVER contains a raw SSN. We accept `ssnLastFour` and
 *     render it as "XXX-XX-1234". Callers that pass a full SSN have it
 *     redacted at the boundary (see normalizeSsn()).
 *   - Phone + email are echoed verbatim (the lender needs them) but only
 *     when explicitly provided; the function never reaches into the DB.
 *   - Mock vs real bureau / income is explicitly labeled in the packet
 *     output so the lender knows when to re-verify.
 */

import type { CreditTier } from "./types";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface LenderPacketInput {
  /** Prequal session id -- echoed into the packet header for the lender. */
  prequalId: string;
  /** Dealer name + address line (display only). */
  dealerName: string;
  dealerLocation?: string;

  /** Customer identity (no full SSN). */
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  ssnLastFour?: string;
  dateOfBirth?: string;

  /** Vehicle of interest. */
  vehicleInterestText: string;
  stockNumber?: string;
  vin?: string;
  estimatedPriceCents?: number;

  /** Income summary. Source MUST be labeled. */
  income: {
    monthlyCents: number;
    /** Where the number came from + how confident we are. */
    confidence: "self_reported" | "mock" | "plaid_low" | "plaid_medium" | "plaid_high";
    isMock: boolean;
  };

  /** Credit summary -- comes from soft_credit_pulls; bureaus stay mocked. */
  credit: {
    bureauUsed: "mock" | "experian" | "equifax" | "transunion";
    scoreRangeMin: number;
    scoreRangeMax: number;
    tier: CreditTier;
    isMock: boolean;
  };

  /** Optional dealer-captured fields the customer surfaced during the wizard. */
  employment?: {
    employer: string;
    monthsAtEmployer?: number;
    occupation?: string;
  };
  residence?: {
    addressLine?: string;
    city?: string;
    state?: string;
    zip?: string;
    monthsAtResidence?: number;
    rentOrOwn?: "rent" | "own" | "other";
  };

  /** Compliance flags. */
  priorBankruptcies?: boolean;
  /** From migration 044 ofac_screening result -- caller passes the boolean. */
  ofacClear: boolean;

  /** ISO timestamp at the moment the packet was generated. */
  generatedAt?: string;
}

export interface LenderPacket {
  text: string;
  /** Subject line for the lender email. */
  subject: string;
  /** HTML version -- used by Resend so the lender email renders properly. */
  html: string;
  /** Optional PDF bytes when pdfkit is installed. */
  pdfBuffer?: Buffer;
  /** Loose summary for analytics + display. */
  summary: {
    customerName: string;
    incomeMonthlyCents: number;
    creditTier: CreditTier;
    isMockBureau: boolean;
    isMockIncome: boolean;
    estimatedPriceCents: number;
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Accept either a raw SSN or a last-4 string. Always return last-4 only.
 * Defense in depth -- callers should pass `ssnLastFour` already, but if
 * a full SSN slips through we redact it here.
 */
export function normalizeSsn(input?: string): string | undefined {
  if (!input) return undefined;
  const digits = input.replace(/\D/g, "");
  if (digits.length === 0) return undefined;
  return digits.slice(-4);
}

function fmtCents(cents: number): string {
  if (!Number.isFinite(cents) || cents < 0) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function tierLabel(tier: CreditTier): string {
  return tier.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function confidenceLabel(c: LenderPacketInput["income"]["confidence"]): string {
  switch (c) {
    case "self_reported":
      return "Self-reported by applicant (NOT verified)";
    case "mock":
      return "MOCK PROVIDER (not real -- do not underwrite without re-verification)";
    case "plaid_low":
      return "Plaid (low confidence -- short payroll history)";
    case "plaid_medium":
      return "Plaid (medium confidence)";
    case "plaid_high":
      return "Plaid (high confidence)";
  }
}

function tryRequirePdfkit(): unknown | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const req = new Function("m", "return require(m)");
    return req("pdfkit");
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Builder                                                                    */
/* -------------------------------------------------------------------------- */

export function buildLenderPacket(input: LenderPacketInput): LenderPacket {
  const last4 = normalizeSsn(input.ssnLastFour);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const priceLabel = input.estimatedPriceCents
    ? fmtCents(input.estimatedPriceCents)
    : "Not specified";

  const subject =
    `Pre-qualified buyer: ${input.customerName} -- ` +
    `${tierLabel(input.credit.tier)} tier -- ${input.vehicleInterestText}`;

  /* -------- Plain text version -------- */
  const lines: string[] = [];
  lines.push("WOLFPACK AUTO -- LENDER PACKET");
  lines.push("================================");
  lines.push(`Generated: ${generatedAt}`);
  lines.push(`Dealer: ${input.dealerName}${input.dealerLocation ? ` -- ${input.dealerLocation}` : ""}`);
  lines.push(`Prequal ID: ${input.prequalId}`);
  lines.push("");
  lines.push("--- APPLICANT ---");
  lines.push(`Name:  ${input.customerName}`);
  if (input.customerEmail) lines.push(`Email: ${input.customerEmail}`);
  if (input.customerPhone) lines.push(`Phone: ${input.customerPhone}`);
  if (last4) lines.push(`SSN:   XXX-XX-${last4}`);
  if (input.dateOfBirth) lines.push(`DOB:   ${input.dateOfBirth}`);
  lines.push("");
  lines.push("--- VEHICLE OF INTEREST ---");
  lines.push(`Interest: ${input.vehicleInterestText}`);
  if (input.stockNumber) lines.push(`Stock #:  ${input.stockNumber}`);
  if (input.vin)         lines.push(`VIN:      ${input.vin}`);
  lines.push(`Estimated Price: ${priceLabel}`);
  lines.push("");
  lines.push("--- INCOME ---");
  lines.push(`Monthly:    ${fmtCents(input.income.monthlyCents)}`);
  lines.push(`Confidence: ${confidenceLabel(input.income.confidence)}`);
  lines.push(`Source:     ${input.income.isMock ? "MOCK (label clearly to the dealer)" : "Real provider"}`);
  lines.push("");
  if (input.employment) {
    lines.push("--- EMPLOYMENT ---");
    lines.push(`Employer:    ${input.employment.employer}`);
    if (input.employment.occupation)
      lines.push(`Occupation:  ${input.employment.occupation}`);
    if (typeof input.employment.monthsAtEmployer === "number")
      lines.push(`Tenure:      ${input.employment.monthsAtEmployer} months`);
    lines.push("");
  }
  if (input.residence) {
    lines.push("--- RESIDENCE ---");
    const addrParts = [
      input.residence.addressLine,
      input.residence.city,
      input.residence.state,
      input.residence.zip,
    ].filter(Boolean);
    if (addrParts.length) lines.push(`Address:    ${addrParts.join(", ")}`);
    if (input.residence.rentOrOwn)
      lines.push(`Status:     ${input.residence.rentOrOwn}`);
    if (typeof input.residence.monthsAtResidence === "number")
      lines.push(`Tenure:     ${input.residence.monthsAtResidence} months`);
    lines.push("");
  }
  lines.push("--- CREDIT (SOFT PULL) ---");
  lines.push(`Bureau: ${input.credit.bureauUsed}${input.credit.isMock ? " (MOCK)" : ""}`);
  lines.push(`Range:  ${input.credit.scoreRangeMin} -- ${input.credit.scoreRangeMax}`);
  lines.push(`Tier:   ${tierLabel(input.credit.tier)}`);
  lines.push("");
  lines.push("--- COMPLIANCE FLAGS ---");
  lines.push(`OFAC clear:         ${input.ofacClear ? "YES" : "NO -- DO NOT UNDERWRITE"}`);
  lines.push(`Prior bankruptcies: ${input.priorBankruptcies ? "YES (disclosed)" : "None disclosed"}`);
  lines.push("");
  lines.push("--- NOTES ---");
  lines.push("Soft credit pull only. SSN last-4 included for identity match.");
  lines.push("Full bureau pull + employment verification expected on lender side.");
  if (input.credit.isMock || input.income.isMock) {
    lines.push("");
    lines.push("*** MOCK DATA PRESENT -- DO NOT UNDERWRITE WITHOUT RE-VERIFICATION ***");
  }

  const text = lines.join("\n");

  /* -------- Sanity assertion: no full SSN escaped the redactor -------- */
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) {
    // Tightly worded so a future contributor sees this in stack traces.
    throw new Error(
      "[lender-packet-pdf] Refusing to emit packet containing full SSN. Pass ssnLastFour only.",
    );
  }

  /* -------- HTML version for Resend -------- */
  const escapeHtml = (s: string): string =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const html =
    `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.45;` +
    `padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">` +
    escapeHtml(text) +
    `</pre>`;

  /* -------- Optional PDF -------- */
  let pdfBuffer: Buffer | undefined;
  const PdfKit = tryRequirePdfkit();
  if (PdfKit) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Doc = PdfKit as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = new Doc({ size: "LETTER", margin: 56 });
      const chunks: Buffer[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      doc.on("data", (c: any) => chunks.push(c as Buffer));
      doc.fontSize(11).font("Courier").text(text);
      doc.end();
      pdfBuffer = Buffer.concat(chunks);
    } catch {
      pdfBuffer = undefined;
    }
  }

  return {
    text,
    subject,
    html,
    pdfBuffer,
    summary: {
      customerName: input.customerName,
      incomeMonthlyCents: input.income.monthlyCents,
      creditTier: input.credit.tier,
      isMockBureau: input.credit.isMock,
      isMockIncome: input.income.isMock,
      estimatedPriceCents: input.estimatedPriceCents ?? 0,
    },
  };
}
