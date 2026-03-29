# Compliance and Regulatory

Wolfpack Auto includes two compliance systems: **document compliance analysis** (TILA, FCRA, ECOA, FTC, GLBA) and **OEM brand compliance scoring**. Both are implemented in pure TypeScript with no external API dependencies.

---

## Document Compliance Rules

The document analyzer (`src/lib/document-analyzer.ts`) checks dealer documents against 21 regulatory compliance rules. Each rule has a severity level and, where applicable, a reference to the specific federal regulation.

### Severity Levels

| Severity | Score impact | Meaning |
|----------|-------------|---------|
| Critical | -25 points | Must be resolved before funding; legal liability risk |
| High | -15 points | Should be resolved; regulatory risk |
| Medium | -8 points | Recommended improvement |
| Low | -3 points | Minor improvement |
| Info | -1 point | Informational |

A document **passes** only if it has zero critical and zero high issues.

---

### Purchase Agreement Rules

| Rule ID | Severity | Category | What it checks | Regulatory Reference |
|---------|----------|----------|---------------|---------------------|
| PA-001 | Critical | Truth in Lending | APR must be disclosed conspicuously | TILA Reg Z SS226.18 |
| PA-002 | Critical | Truth in Lending | Total finance charge must be disclosed | TILA Reg Z SS226.18(d) |
| PA-003 | High | Contract Terms | Total of payments must be clearly stated | TILA Reg Z SS226.18(h) |
| PA-004 | High | Contract Terms | Number, amount, and due dates of payments must be specified | -- |
| PA-005 | Critical | Buyer Rights | Buyer's right to cancel must be disclosed (where applicable by state) | -- |
| PA-006 | High | Vehicle Identity | VIN on purchase agreement must match the vehicle being sold | -- |
| PA-007 | Medium | Signatures | All required signatures (buyer, co-buyer, dealer) must be present | -- |

### Credit Application Rules

| Rule ID | Severity | Category | What it checks | Regulatory Reference |
|---------|----------|----------|---------------|---------------------|
| CA-001 | Critical | FCRA Compliance | FCRA authorization to pull credit must be signed | FCRA SS604(a)(3)(A) |
| CA-002 | Critical | ECOA | Equal Credit Opportunity Act notice must be provided | ECOA Reg B SS1002.4 |
| CA-003 | High | Privacy | Privacy notice (GLBA) must be provided to applicant | GLBA Reg P |
| CA-004 | High | Data Accuracy | SSN must be properly formatted and not stored in plain text | -- |

### Disclosure Rules

| Rule ID | Severity | Category | What it checks | Regulatory Reference |
|---------|----------|----------|---------------|---------------------|
| DC-001 | Critical | Buyer's Guide | FTC Buyer's Guide (window sticker) required for used vehicles | FTC Used Car Rule 16 CFR 455 |
| DC-002 | High | Adverse Action | Adverse action notice required when credit application is denied | ECOA SS1002.9 |

### Title Rules

| Rule ID | Severity | Category | What it checks | Regulatory Reference |
|---------|----------|----------|---------------|---------------------|
| TI-001 | Critical | Title Verification | Title branding (salvage, rebuilt, flood) must be disclosed to buyer | -- |
| TI-002 | Critical | Odometer | Federal odometer disclosure required on title transfer | 49 USC SS32705 |

### Marketing Rules

| Rule ID | Severity | Category | What it checks | Regulatory Reference |
|---------|----------|----------|---------------|---------------------|
| MK-001 | High | Advertising | If advertising a monthly payment, must include all TILA trigger terms (APR, term, down payment) | TILA Reg Z SS226.24 |
| MK-002 | Medium | Advertising | Advertised vehicle must be available for purchase at advertised price | FTC Act SS5 |

### Insurance Rules

| Rule ID | Severity | Category | What it checks | Regulatory Reference |
|---------|----------|----------|---------------|---------------------|
| IN-001 | High | Insurance Verification | Proof of insurance must be obtained before vehicle delivery | -- |

### Anti-Fraud / Red Flags Rules

| Rule ID | Severity | Category | What it checks | Regulatory Reference |
|---------|----------|----------|---------------|---------------------|
| RF-001 | Critical | Red Flags | Identity verification required before credit application processing; mismatched name/SSN/address triggers review | Red Flags Rule 16 CFR 681 |

### Deal Jacket Rules

| Rule ID | Severity | Category | What it checks | Regulatory Reference |
|---------|----------|----------|---------------|---------------------|
| DJ-001 | High | Deal Jacket | Deal jacket must contain all required documents before funding | -- |

---

## Document Types

The analyzer supports the following document categories:

| Category | Description |
|----------|-------------|
| `purchase_agreement` | Vehicle purchase contract |
| `credit_app` | Customer credit application |
| `disclosure` | Required disclosures (Buyer's Guide, adverse action, etc.) |
| `title` | Vehicle title document |
| `trade_title` | Trade-in vehicle title |
| `registration` | Vehicle registration |
| `insurance` | Proof of insurance |
| `marketing` | Marketing materials and advertisements |
| `lien_release` | Lien release document |
| `inspection` | Vehicle inspection report |
| `deal_jacket` | Complete deal folder |
| `other` | Other document types |

---

## How Document Analysis Works

1. A document is submitted for analysis via `POST /api/admin/documents/analyze`
2. The analyzer identifies which rules apply based on document type
3. Each applicable rule is checked against the document metadata:
   - Signature presence
   - VIN presence and match
   - Disclosure inclusion
   - SSN format (checks for plain-text SSN in content)
   - TILA trigger terms (checks for payment amounts without APR disclosure)
4. Issues are collected with severity, category, and recommendations
5. A compliance score (0-100) is computed by deducting points per issue
6. The result indicates whether the document passes (no critical/high issues)

---

## Deal Jacket Analysis

The `analyzeDealJacket()` function checks a complete deal folder:

1. Verifies all required documents are present:
   - Purchase agreement
   - Credit application
   - Disclosure
   - Insurance
2. Analyzes each document individually
3. Checks for unsigned documents
4. Computes an overall score (average of individual document scores)
5. Lists blockers that must be resolved before funding:
   - Missing required documents
   - Documents with critical/high issues
   - Unsigned documents

---

## OEM Brand Compliance Scoring

The OEM compliance scorer (`src/lib/compliance-scorer.ts`) evaluates dealer configuration against brand standards across four weighted categories.

### Category Weights

| Category | Max Points | What it measures |
|----------|-----------|-----------------|
| Brand Identity | 25 | Logo, primary color, dealer name, tagline |
| Legal & Disclosures | 30 | FTC disclosure, privacy policy, terms of use, pricing, address |
| Digital Presence | 25 | Website URL, phone number, email, inventory |
| Lead Responsiveness | 20 | Team members, email configuration, response time |
| **Total** | **100** | |

### Grade Scale

| Score Range | Grade |
|-------------|-------|
| 90-100 | A |
| 80-89 | B |
| 70-79 | C |
| 60-69 | D |
| 0-59 | F |

### Brand Identity Checks (25 points)

| Check | Points | What it verifies |
|-------|--------|-----------------|
| Logo URL configured | 7 | Dealer has uploaded a logo |
| Primary color valid hex | 6 | Valid hex color (e.g., #0070c7) set for branding |
| No competitor names in dealer name | 6 | Dealer name does not reference competitor brands |
| Tagline or description set | 6 | Dealer has a tagline configured |

### Legal & Disclosures Checks (30 points)

| Check | Points | What it verifies |
|-------|--------|-----------------|
| FTC disclosure text | 8 | FTC-compliant disclosure text configured |
| Privacy policy URL | 6 | Privacy policy published and linked |
| Terms of use URL | 6 | Terms of use published and linked |
| At least one priced vehicle | 5 | Inventory has vehicles with price > $0 |
| Complete business address | 5 | Street, city, state, ZIP all filled |

### Digital Presence Checks (25 points)

| Check | Points | What it verifies |
|-------|--------|-----------------|
| Website URL set | 7 | Dealer website URL configured |
| Valid phone number (10+ digits) | 6 | Valid phone number on file |
| Valid business email | 6 | Email address with @ symbol |
| Inventory listed | 6 | At least one vehicle in inventory |

### Lead Responsiveness Checks (20 points)

| Check | Points | What it verifies |
|-------|--------|-----------------|
| Team members configured | 7 | At least one team member exists |
| Email from address configured | 6 | Resend from-email set for notifications |
| Average response time < 24h | 7 | Leads are responded to within 24 hours |

---

## OFAC and Red Flags

Compliance checks (`/admin/compliance/checks`) include OFAC screening and Red Flags Rule checks. These are run via the compliance checks API (`/api/admin/compliance/checks`) and can be:

- **Run** -- execute a check
- **Reviewed** -- mark as reviewed by staff
- **Overridden** -- override with documented reason (tracked in audit log)

All compliance events are tracked via `trackCompliance()` analytics hooks.

---

## Regulatory Reference Summary

| Regulation | Full Name | What it governs |
|-----------|-----------|----------------|
| TILA | Truth in Lending Act (Regulation Z) | APR disclosure, finance charges, payment terms, advertising trigger terms |
| FCRA | Fair Credit Reporting Act | Credit report authorization, adverse action notices |
| ECOA | Equal Credit Opportunity Act (Regulation B) | Non-discrimination in credit, adverse action notices |
| FTC Act | Federal Trade Commission Act | Unfair/deceptive practices, bait-and-switch prevention |
| FTC Used Car Rule | 16 CFR 455 | Buyer's Guide window sticker requirement |
| GLBA | Gramm-Leach-Bliley Act (Regulation P) | Customer financial privacy, privacy notices |
| Odometer Act | 49 USC SS32705 | Odometer disclosure on title transfer |

---

## Related Documentation

- [Analytics & Learning](./analytics-and-learning.md) -- how compliance events feed into the learning system
- [Platform Map](./platform-map.md) -- compliance module pages and routes
- [API Reference](./api-reference.md) -- compliance API endpoints
