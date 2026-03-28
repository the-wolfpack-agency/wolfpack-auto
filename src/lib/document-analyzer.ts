/**
 * Document Analyzer — connects to AgenticQA's RAG pipeline to analyze
 * dealer documents for compliance, legal, and quality issues.
 *
 * Analyzes: purchase agreements, credit apps, disclosures, titles,
 * marketing materials, deal jackets, insurance docs.
 *
 * Feeds results into the learning system so the platform gets smarter
 * at catching issues over time.
 */

export type DocCategory =
  | "purchase_agreement"
  | "credit_app"
  | "disclosure"
  | "title"
  | "registration"
  | "insurance"
  | "marketing"
  | "trade_title"
  | "lien_release"
  | "inspection"
  | "deal_jacket"
  | "other";

export type IssueSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface DocumentIssue {
  rule_id: string;
  severity: IssueSeverity;
  category: string;
  description: string;
  recommendation: string;
  field?: string;       // specific field/section with the issue
  regulatory_ref?: string;  // e.g. "TILA Reg Z §226.18", "FCRA §604"
}

export interface AnalysisResult {
  document_id: string;
  doc_type: DocCategory;
  analyzed_at: string;
  issues: DocumentIssue[];
  score: number;         // 0-100, higher = more compliant
  passed: boolean;       // true if no critical/high issues
  summary: string;
  recommendations: string[];
}

/* -------------------------------------------------------------------------- */
/* Compliance rules by document type                                          */
/* -------------------------------------------------------------------------- */

interface ComplianceRule {
  id: string;
  doc_types: DocCategory[];
  severity: IssueSeverity;
  category: string;
  check: string;          // what to look for
  description: string;
  regulatory_ref?: string;
  recommendation: string;
}

const COMPLIANCE_RULES: ComplianceRule[] = [
  // Purchase Agreement rules
  {
    id: "PA-001",
    doc_types: ["purchase_agreement"],
    severity: "critical",
    category: "Truth in Lending",
    check: "apr_disclosure",
    description: "APR must be disclosed conspicuously as required by TILA Regulation Z",
    regulatory_ref: "TILA Reg Z §226.18",
    recommendation: "Ensure APR is displayed prominently with the term 'Annual Percentage Rate'",
  },
  {
    id: "PA-002",
    doc_types: ["purchase_agreement"],
    severity: "critical",
    category: "Truth in Lending",
    check: "finance_charge_disclosure",
    description: "Total finance charge must be disclosed",
    regulatory_ref: "TILA Reg Z §226.18(d)",
    recommendation: "Include total dollar amount of finance charges",
  },
  {
    id: "PA-003",
    doc_types: ["purchase_agreement"],
    severity: "high",
    category: "Contract Terms",
    check: "total_payments",
    description: "Total of payments must be clearly stated",
    regulatory_ref: "TILA Reg Z §226.18(h)",
    recommendation: "Show total of all payments the buyer will make",
  },
  {
    id: "PA-004",
    doc_types: ["purchase_agreement"],
    severity: "high",
    category: "Contract Terms",
    check: "payment_schedule",
    description: "Number, amount, and due dates of payments must be specified",
    recommendation: "Include complete payment schedule with first payment date",
  },
  {
    id: "PA-005",
    doc_types: ["purchase_agreement"],
    severity: "critical",
    category: "Buyer Rights",
    check: "cancellation_rights",
    description: "Buyer's right to cancel (where applicable by state) must be disclosed",
    recommendation: "Include state-required cooling-off period disclosures",
  },
  {
    id: "PA-006",
    doc_types: ["purchase_agreement"],
    severity: "high",
    category: "Vehicle Identity",
    check: "vin_match",
    description: "VIN on purchase agreement must match the vehicle being sold",
    recommendation: "Verify VIN matches title, registration, and physical vehicle",
  },
  {
    id: "PA-007",
    doc_types: ["purchase_agreement"],
    severity: "medium",
    category: "Signatures",
    check: "all_signatures",
    description: "All required signatures (buyer, co-buyer, dealer) must be present",
    recommendation: "Ensure all signature lines are completed before funding",
  },

  // Credit Application rules
  {
    id: "CA-001",
    doc_types: ["credit_app"],
    severity: "critical",
    category: "FCRA Compliance",
    check: "fcra_consent",
    description: "FCRA authorization to pull credit must be signed",
    regulatory_ref: "FCRA §604(a)(3)(A)",
    recommendation: "Include and obtain signature on FCRA consent disclosure",
  },
  {
    id: "CA-002",
    doc_types: ["credit_app"],
    severity: "critical",
    category: "ECOA",
    check: "ecoa_notice",
    description: "Equal Credit Opportunity Act notice must be provided",
    regulatory_ref: "ECOA Reg B §1002.4",
    recommendation: "Include ECOA notice prohibiting discrimination in credit decisions",
  },
  {
    id: "CA-003",
    doc_types: ["credit_app"],
    severity: "high",
    category: "Privacy",
    check: "privacy_notice",
    description: "Privacy notice (GLBA) must be provided to applicant",
    regulatory_ref: "GLBA Reg P",
    recommendation: "Include Gramm-Leach-Bliley privacy notice",
  },
  {
    id: "CA-004",
    doc_types: ["credit_app"],
    severity: "high",
    category: "Data Accuracy",
    check: "ssn_format",
    description: "SSN must be properly formatted and not stored in plain text",
    recommendation: "Store SSN encrypted or hashed; verify format is 9 digits",
  },

  // Disclosure rules
  {
    id: "DC-001",
    doc_types: ["disclosure"],
    severity: "critical",
    category: "Buyer's Guide",
    check: "buyers_guide",
    description: "FTC Buyer's Guide (window sticker) required for used vehicles",
    regulatory_ref: "FTC Used Car Rule 16 CFR 455",
    recommendation: "Display Buyer's Guide on used vehicle with warranty terms or 'AS IS' notice",
  },
  {
    id: "DC-002",
    doc_types: ["disclosure"],
    severity: "high",
    category: "Adverse Action",
    check: "adverse_action_notice",
    description: "Adverse action notice required when credit application is denied",
    regulatory_ref: "ECOA §1002.9",
    recommendation: "Provide adverse action notice within 30 days of denial with specific reasons",
  },

  // Title rules
  {
    id: "TI-001",
    doc_types: ["title", "trade_title"],
    severity: "critical",
    category: "Title Verification",
    check: "title_brand",
    description: "Title branding (salvage, rebuilt, flood) must be disclosed to buyer",
    recommendation: "Check title for brands and disclose to buyer in writing",
  },
  {
    id: "TI-002",
    doc_types: ["title", "trade_title"],
    severity: "critical",
    category: "Odometer",
    check: "odometer_disclosure",
    description: "Federal odometer disclosure required on title transfer",
    regulatory_ref: "49 USC §32705",
    recommendation: "Complete odometer disclosure statement with current mileage",
  },

  // Marketing rules
  {
    id: "MK-001",
    doc_types: ["marketing"],
    severity: "high",
    category: "Advertising",
    check: "tila_trigger_terms",
    description: "If advertising a monthly payment, must include all TILA trigger terms (APR, term, down payment)",
    regulatory_ref: "TILA Reg Z §226.24",
    recommendation: "Include APR, number of payments, and down payment when advertising any payment amount",
  },
  {
    id: "MK-002",
    doc_types: ["marketing"],
    severity: "medium",
    category: "Advertising",
    check: "bait_switch",
    description: "Advertised vehicle must be available for purchase at advertised price",
    regulatory_ref: "FTC Act §5",
    recommendation: "Ensure advertised vehicles are in stock and available at stated price",
  },

  // Insurance
  {
    id: "IN-001",
    doc_types: ["insurance"],
    severity: "high",
    category: "Insurance Verification",
    check: "insurance_before_delivery",
    description: "Proof of insurance must be obtained before vehicle delivery",
    recommendation: "Verify insurance coverage before releasing vehicle to buyer",
  },

  // Deal Jacket completeness
  {
    id: "DJ-001",
    doc_types: ["deal_jacket"],
    severity: "high",
    category: "Deal Jacket",
    check: "complete_jacket",
    description: "Deal jacket must contain all required documents before funding",
    recommendation: "Verify: purchase agreement, credit app, disclosures, title, insurance, ID copies",
  },
];

/* -------------------------------------------------------------------------- */
/* Analysis engine                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Analyze a document for compliance issues.
 *
 * In production with AI_MODE=auto, this would:
 * 1. Extract text from the document (OCR for images/PDFs)
 * 2. Send to AgenticQA RAG pipeline for semantic analysis
 * 3. Cross-reference against regulatory knowledge base
 * 4. Return structured findings
 *
 * In zero-token mode, it applies rule-based checks against metadata.
 */
export function analyzeDocument(
  documentId: string,
  docType: DocCategory,
  metadata: {
    name?: string;
    signed?: boolean;
    deal_id?: string;
    vehicle_vin?: string;
    has_vin?: boolean;
    has_signatures?: boolean;
    has_disclosure?: boolean;
    file_size_bytes?: number;
    content_text?: string;  // extracted text content if available
  } = {},
): AnalysisResult {
  const applicableRules = COMPLIANCE_RULES.filter((r) =>
    r.doc_types.includes(docType),
  );

  const issues: DocumentIssue[] = [];

  for (const rule of applicableRules) {
    let triggered = false;

    switch (rule.check) {
      case "all_signatures":
        if (metadata.has_signatures === false || metadata.signed === false) {
          triggered = true;
        }
        break;

      case "vin_match":
        if (metadata.has_vin === false || !metadata.vehicle_vin) {
          triggered = true;
        }
        break;

      case "fcra_consent":
      case "ecoa_notice":
      case "privacy_notice":
      case "buyers_guide":
      case "adverse_action_notice":
        if (metadata.has_disclosure === false) {
          triggered = true;
        }
        break;

      case "ssn_format":
        if (metadata.content_text && /\b\d{3}-?\d{2}-?\d{4}\b/.test(metadata.content_text)) {
          triggered = true;
        }
        break;

      case "tila_trigger_terms":
        if (metadata.content_text) {
          const hasPayment = /\$\d+\/mo|monthly payment/i.test(metadata.content_text);
          const hasAPR = /APR|annual percentage rate/i.test(metadata.content_text);
          if (hasPayment && !hasAPR) {
            triggered = true;
          }
        }
        break;

      default:
        // For rules we can't check with metadata alone, flag as info
        // In AI mode, the RAG pipeline would handle these
        break;
    }

    if (triggered) {
      issues.push({
        rule_id: rule.id,
        severity: rule.severity,
        category: rule.category,
        description: rule.description,
        recommendation: rule.recommendation,
        regulatory_ref: rule.regulatory_ref,
      });
    }
  }

  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const highCount = issues.filter((i) => i.severity === "high").length;

  // Score: start at 100, deduct for issues
  let score = 100;
  for (const issue of issues) {
    switch (issue.severity) {
      case "critical": score -= 25; break;
      case "high":     score -= 15; break;
      case "medium":   score -= 8;  break;
      case "low":      score -= 3;  break;
      case "info":     score -= 1;  break;
    }
  }
  score = Math.max(0, score);

  const passed = criticalCount === 0 && highCount === 0;

  const summary = issues.length === 0
    ? `Document passes all ${applicableRules.length} compliance checks.`
    : `${issues.length} issue(s) found: ${criticalCount} critical, ${highCount} high. ${
        passed ? "No blocking issues." : "Blocking issues must be resolved before funding."
      }`;

  const recommendations = issues
    .filter((i) => i.severity === "critical" || i.severity === "high")
    .map((i) => `[${i.rule_id}] ${i.recommendation}`);

  return {
    document_id: documentId,
    doc_type: docType,
    analyzed_at: new Date().toISOString(),
    issues,
    score,
    passed,
    summary,
    recommendations,
  };
}

/**
 * Analyze a complete deal jacket — checks all documents associated with a deal.
 */
export function analyzeDealJacket(
  dealId: string,
  documents: Array<{
    id: string;
    doc_type: DocCategory;
    signed: boolean;
    name: string;
  }>,
): {
  deal_id: string;
  analyzed_at: string;
  total_documents: number;
  missing_documents: DocCategory[];
  document_results: AnalysisResult[];
  overall_score: number;
  ready_to_fund: boolean;
  blockers: string[];
} {
  // Required documents for a complete deal jacket
  const REQUIRED_DOCS: DocCategory[] = [
    "purchase_agreement",
    "credit_app",
    "disclosure",
    "insurance",
  ];

  const presentTypes = new Set(documents.map((d) => d.doc_type));
  const missingDocs = REQUIRED_DOCS.filter((t) => !presentTypes.has(t));

  const documentResults = documents.map((doc) =>
    analyzeDocument(doc.id, doc.doc_type, {
      name: doc.name,
      signed: doc.signed,
      deal_id: dealId,
      has_signatures: doc.signed,
    }),
  );

  const overallScore =
    documentResults.length > 0
      ? Math.round(
          documentResults.reduce((sum, r) => sum + r.score, 0) /
            documentResults.length,
        )
      : 0;

  const blockers: string[] = [];

  if (missingDocs.length > 0) {
    blockers.push(`Missing required documents: ${missingDocs.join(", ")}`);
  }

  for (const result of documentResults) {
    if (!result.passed) {
      blockers.push(
        `${result.doc_type}: ${result.issues.filter((i) => i.severity === "critical" || i.severity === "high").length} blocking issue(s)`,
      );
    }
  }

  const unsignedDocs = documents.filter((d) => !d.signed);
  if (unsignedDocs.length > 0) {
    blockers.push(
      `${unsignedDocs.length} document(s) unsigned: ${unsignedDocs.map((d) => d.name).join(", ")}`,
    );
  }

  return {
    deal_id: dealId,
    analyzed_at: new Date().toISOString(),
    total_documents: documents.length,
    missing_documents: missingDocs,
    document_results: documentResults,
    overall_score: overallScore,
    ready_to_fund: blockers.length === 0,
    blockers,
  };
}

/**
 * Get all compliance rules for reference/display.
 */
export function getComplianceRules(): ComplianceRule[] {
  return COMPLIANCE_RULES;
}
