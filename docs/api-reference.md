# API Reference

Every API route in the Wolfpack Auto platform. All `/api/admin/*` routes require authentication via NextAuth JWT unless noted otherwise. Routes marked "Shadow mode: Yes" return sample data when `DATABASE_URL` is not set.

---

## Authentication

### `POST /api/auth/[...nextauth]`
NextAuth.js handler. Supports credentials-based login with optional MFA.

**Auth required:** No
**Shadow mode:** N/A

**Credentials body:**
```json
{
  "email": "string",
  "password": "string"
}
```

**MFA second-step body:**
```json
{
  "mfa_user_id": "string",
  "mfa_token": "string",
  "mfa_is_backup_code": "true" | "false"
}
```

**Response:** NextAuth session JWT

---

## Health

### `GET /api/health`
Health check endpoint.

**Auth required:** No
**Shadow mode:** No

**Response:** `{ "status": "ok" }`

---

## Admin: Stats

### `GET /api/admin/stats`
Dashboard statistics.

**Auth required:** Yes
**Shadow mode:** Yes

**Response:**
```json
{
  "vehicles": { "total": 0, "available": 0, "sold": 0 },
  "leads": { "total": 0, "new": 0, "qualified": 0 },
  "avgDaysOnLot": 0,
  "conversionRate": 0
}
```

---

## Admin: Inventory

### `GET /api/admin/inventory`
### `POST /api/admin/inventory`
List or create vehicles.

**Auth required:** Yes
**Shadow mode:** Yes (GET), No (POST -- requires DB)

**POST body:**
```json
{
  "vin": "string (17 chars, A-Z 0-9, no I/O/Q)",
  "year": "number (>= 1900)",
  "make": "string",
  "model": "string",
  "trim": "string (optional)",
  "price": "number (> 0)",
  "msrp": "number (optional)",
  "mileage": "number (optional)",
  "condition": "new | used | certified",
  "fuel_type": "string (optional)",
  "transmission": "string (optional)",
  "exterior_color": "string (optional)",
  "body_style": "string (optional)",
  "description": "string (optional)",
  "status": "available | pending | sold"
}
```

### `GET /api/admin/inventory/[vin]`
### `PATCH /api/admin/inventory/[vin]`
### `DELETE /api/admin/inventory/[vin]`
Read, update, or delete a vehicle by VIN.

**Auth required:** Yes
**Shadow mode:** Yes (GET)

---

## Admin: Vehicles

### `GET /api/admin/vehicles`
### `POST /api/admin/vehicles`
List or create vehicles (canonical endpoint).

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/vehicles/[vin]`
### `PATCH /api/admin/vehicles/[vin]`
### `DELETE /api/admin/vehicles/[vin]`
Single vehicle operations.

**Auth required:** Yes
**Shadow mode:** Yes (GET)

### `POST /api/admin/vehicles/generate-listing`
Generate a listing description for a vehicle.

**Auth required:** Yes
**Shadow mode:** Yes

### `POST /api/admin/vehicles/index-all`
Re-index all vehicles into the search engine.

**Auth required:** Yes
**Shadow mode:** No

### `POST /api/admin/quick-add`
Quick vehicle add with minimal fields.

**Auth required:** Yes
**Shadow mode:** Yes

### `POST /api/admin/vin-decode`
Decode a VIN to extract year, make, model, and specs.

**Auth required:** Yes
**Shadow mode:** Yes

---

## Admin: Intake

### `GET /api/admin/intake`
### `POST /api/admin/intake`
Vehicle intake pipeline management.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/intake/recommendations`
Smart pricing and listing recommendations for a vehicle.

**Auth required:** Yes
**Shadow mode:** Yes

---

## Admin: Leads

### `GET /api/admin/leads`
### `POST /api/admin/leads`
List all leads or create a new lead.

**Auth required:** Yes
**Shadow mode:** Yes

**GET query params:** `status`, `source`, `assigned_to`, `temperature`

**POST body:**
```json
{
  "first_name": "string",
  "last_name": "string",
  "email": "string",
  "phone": "string (optional)",
  "vehicle_interest": "string (optional)",
  "source": "website_form | vdp_inquiry | chat | phone | third_party | walk_in",
  "message": "string (optional)"
}
```

### `GET /api/admin/leads/[id]`
### `PATCH /api/admin/leads/[id]`
### `DELETE /api/admin/leads/[id]`
Single lead operations.

**Auth required:** Yes
**Shadow mode:** Yes

**PATCH body:** Any subset of lead fields plus `status`, `temperature`, `assigned_to`, `notes`

### `POST /api/admin/leads/bulk`
Bulk lead operations (import, assign, status change).

**Auth required:** Yes
**Shadow mode:** Yes

### `POST /api/admin/leads/score`
Score a single lead's purchase intent.

**Auth required:** Yes
**Shadow mode:** Yes

**Response:**
```json
{
  "score": 0-100,
  "tier": "hot | warm | cool | cold",
  "factors": [{ "signal": "string", "impact": 0, "description": "string" }],
  "recommendedFollowupAt": "ISO date",
  "recommendedChannel": "phone | email | text"
}
```

### `POST /api/admin/leads/score-all`
Re-score all leads.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/export/leads`
Export leads to CSV.

**Auth required:** Yes
**Shadow mode:** Yes

---

## Admin: Deals

### `GET /api/admin/deals`
### `POST /api/admin/deals`
List or create deal worksheets.

**Auth required:** Yes
**Shadow mode:** Yes

**POST body:**
```json
{
  "deal_type": "retail | lease | wholesale",
  "customer_name": "string",
  "customer_email": "string",
  "customer_phone": "string",
  "salesperson": "string",
  "vehicle_vin": "string",
  "selling_price": 0,
  "trade_vehicle": "string (optional)",
  "trade_value": 0,
  "trade_payoff": 0
}
```

### `GET /api/admin/deals/[dealId]`
### `PATCH /api/admin/deals/[dealId]`
Single deal operations.

**Auth required:** Yes
**Shadow mode:** Yes

### `POST /api/admin/deals/[dealId]/calculate`
Calculate payments for a deal.

**Auth required:** Yes
**Shadow mode:** Yes

**Body:**
```json
{
  "selling_price": 0,
  "down_payment": 0,
  "trade_equity": 0,
  "apr": 0,
  "term_months": 0,
  "rebates": 0
}
```

### `POST /api/admin/deals/[dealId]/submit`
Submit deal to lender.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/deals/[dealId]/submissions`
List lender submissions for a deal.

**Auth required:** Yes
**Shadow mode:** Yes

### `POST /api/admin/deals/sign`
E-signature workflow.

**Auth required:** Yes
**Shadow mode:** Yes

---

## Admin: F&I Products

### `GET /api/admin/fi-products`
### `POST /api/admin/fi-products`
F&I product catalog.

**Auth required:** Yes
**Shadow mode:** Yes

---

## Admin: Lenders

### `GET /api/admin/lenders`
### `POST /api/admin/lenders`
Lender management.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/lenders/[id]`
### `PATCH /api/admin/lenders/[id]`
### `DELETE /api/admin/lenders/[id]`
Single lender operations.

**Auth required:** Yes
**Shadow mode:** Yes

---

## Admin: Credit Bureau

### `POST /api/admin/credit/pull`
Initiate a credit pull.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/credit/history`
Credit pull history.

**Auth required:** Yes
**Shadow mode:** Yes

---

## Admin: Service

### `GET /api/admin/service/appointments`
### `POST /api/admin/service/appointments`
Appointment management.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/service/appointments/[id]`
### `PATCH /api/admin/service/appointments/[id]`
### `DELETE /api/admin/service/appointments/[id]`
Single appointment operations.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/service/repair-orders`
### `POST /api/admin/service/repair-orders`
Repair order management.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/service/repair-orders/[id]`
### `PATCH /api/admin/service/repair-orders/[id]`
Single RO operations.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/service/parts`
### `POST /api/admin/service/parts`
Parts inventory.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/service/technicians`
### `POST /api/admin/service/technicians`
Technician management.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/service/history/[vin]`
Service history by VIN.

**Auth required:** Yes
**Shadow mode:** Yes

---

## Admin: Accounting

### `GET /api/admin/accounting/summary`
Financial summary.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/accounting/sales-log`
Sales log entries.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/accounting/commissions`
### `POST /api/admin/accounting/commissions`
Commission records.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/accounting/export`
GL export download.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/accounting/chart-of-accounts`
Chart of accounts.

**Auth required:** Yes
**Shadow mode:** Yes

---

## Admin: Floor Plan

### `GET /api/admin/floor-plan`
### `POST /api/admin/floor-plan`
Floor plan records.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/floor-plan/[id]`
### `PATCH /api/admin/floor-plan/[id]`
Single floor plan record.

**Auth required:** Yes
**Shadow mode:** Yes

---

## Admin: Documents

### `GET /api/admin/documents`
### `POST /api/admin/documents`
Document vault.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/documents/[id]`
### `DELETE /api/admin/documents/[id]`
Single document operations.

**Auth required:** Yes
**Shadow mode:** Yes

### `POST /api/admin/documents/analyze`
Analyze a document for compliance issues.

**Auth required:** Yes
**Shadow mode:** Yes

**Body:**
```json
{
  "document_id": "string",
  "doc_type": "purchase_agreement | credit_app | disclosure | title | registration | insurance | marketing | trade_title | lien_release | inspection | deal_jacket | other",
  "metadata": {
    "signed": true,
    "has_vin": true,
    "has_signatures": true,
    "has_disclosure": true
  }
}
```

**Response:**
```json
{
  "document_id": "string",
  "doc_type": "string",
  "analyzed_at": "ISO date",
  "issues": [{ "rule_id": "string", "severity": "critical|high|medium|low|info", "category": "string", "description": "string", "recommendation": "string", "regulatory_ref": "string" }],
  "score": 0-100,
  "passed": true,
  "summary": "string",
  "recommendations": ["string"]
}
```

### `POST /api/admin/documents/scan-all`
Scan all documents in the vault.

**Auth required:** Yes
**Shadow mode:** Yes

---

## Admin: Compliance

### `GET /api/admin/compliance`
OEM brand compliance summary (4 categories, 100-point score).

**Auth required:** Yes
**Shadow mode:** Yes

**Response:**
```json
{
  "score": 0-100,
  "grade": "A|B|C|D|F",
  "categoryScores": {
    "brandIdentity": 0-25,
    "legalDisclosures": 0-30,
    "digitalPresence": 0-25,
    "leadResponsiveness": 0-20
  },
  "violations": [{ "category": "string", "item": "string", "impact": "high|medium|low", "recommendation": "string" }]
}
```

### `GET /api/admin/compliance/checks`
### `POST /api/admin/compliance/checks`
Compliance check CRUD.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/compliance/checks/[id]`
### `PATCH /api/admin/compliance/checks/[id]`
Single compliance check.

**Auth required:** Yes
**Shadow mode:** Yes

---

## Admin: Analytics

### `GET /api/admin/analytics/dashboard`
Dashboard analytics data.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/analytics/learning`
Learning insights from the aggregator.

**Auth required:** Yes
**Shadow mode:** Yes

**Response:**
```json
{
  "fi_attachment_rate": 0.0-1.0,
  "avg_fi_per_deal": 0,
  "top_fi_products": ["string"],
  "appointment_show_rate": 0.0-1.0,
  "avg_ro_value": 0,
  "parts_turn_rate": 0,
  "email_open_rate": 0.0-1.0,
  "sms_response_rate": 0.0-1.0,
  "best_performing_template": "string",
  "optimal_follow_up_delay_hours": 0,
  "avg_days_to_close": 0,
  "conversion_by_source": { "website": 0, "walk_in": 0 },
  "top_salesperson": "string",
  "avg_rating": 0.0-5.0,
  "response_rate": 0.0-1.0,
  "sentiment_trend": "improving | stable | declining",
  "computed_at": "ISO date"
}
```

### `POST /api/admin/analytics/query`
Custom analytics query.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/export/analytics`
Export analytics data.

**Auth required:** Yes
**Shadow mode:** Yes

---

## Admin: Funnel Health

### `GET /api/admin/funnel-health`
Lead pipeline health metrics.

**Auth required:** Yes
**Shadow mode:** Yes

**Response:**
```json
{
  "leadsLast24h": 0,
  "leadsLast7d": 0,
  "leadsLast30d": 0,
  "leadsTrend": "up | down | flat",
  "slaCompliance24h": 0-100,
  "slaCompliance1h": 0-100,
  "avgResponseTimeHours": 0,
  "overdueLeads": 0,
  "funnelStages": { "new": 0, "contacted": 0, "qualified": 0, "appointment_set": 0, "sold": 0, "lost": 0 },
  "conversionRate": 0,
  "qualificationRate": 0,
  "sourceBreakdown": [{ "source": "string", "count": 0, "conversionRate": 0 }],
  "healthScore": 0-100,
  "healthGrade": "A|B|C|D|F",
  "alerts": [{ "severity": "critical|warning|info", "message": "string", "action": "string" }]
}
```

---

## Admin: Pricing

### `GET /api/admin/pricing`
Pricing report for all inventory.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/pricing/[vehicleId]`
Single vehicle pricing analysis.

**Auth required:** Yes
**Shadow mode:** Yes

---

## Admin: Reviews

### `GET /api/admin/reviews`
List reviews.

**Auth required:** Yes
**Shadow mode:** Yes

### `POST /api/admin/reviews/[id]/respond`
Respond to a review.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/reviews/templates`
### `POST /api/admin/reviews/templates`
Response template management.

**Auth required:** Yes
**Shadow mode:** Yes

---

## Admin: Customers

### `GET /api/admin/customers`
### `POST /api/admin/customers`
Customer CRUD.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/customers/[id]`
### `PATCH /api/admin/customers/[id]`
Single customer operations.

**Auth required:** Yes
**Shadow mode:** Yes

---

## Admin: Comms

### `GET /api/admin/comms`
Comms overview stats.

**Auth required:** Yes
**Shadow mode:** Yes

### `POST /api/admin/comms/send`
Send a message.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/comms/templates`
### `POST /api/admin/comms/templates`
Template CRUD.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/comms/sequences`
### `POST /api/admin/comms/sequences`
Sequence CRUD.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/comms/log`
Message log.

**Auth required:** Yes
**Shadow mode:** Yes

---

## Admin: MFA

### `POST /api/admin/mfa/setup`
Begin MFA setup -- generates TOTP secret and QR code.

**Auth required:** Yes
**Shadow mode:** No -- requires DB

### `POST /api/admin/mfa/enable`
Enable MFA after verifying the first TOTP code.

**Auth required:** Yes
**Shadow mode:** No -- requires DB

### `POST /api/admin/mfa/verify`
Verify a TOTP code or backup code.

**Auth required:** Yes
**Shadow mode:** No -- requires DB

### `GET /api/admin/mfa/status`
Check whether MFA is enabled for the current user.

**Auth required:** Yes
**Shadow mode:** No -- requires DB

### `POST /api/admin/mfa/disable`
Disable MFA for the current user.

**Auth required:** Yes
**Shadow mode:** No -- requires DB

---

## Admin: Settings

### `GET /api/admin/settings`
### `PATCH /api/admin/settings`
Dealer settings (branding, contact, etc.).

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/settings/integrations`
### `PATCH /api/admin/settings/integrations`
Integration configuration.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/settings/notifications`
### `PATCH /api/admin/settings/notifications`
Notification preferences.

**Auth required:** Yes
**Shadow mode:** Yes

---

## Admin: OEM

### `GET /api/admin/oem`
OEM overview data.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/oem/dealers`
OEM dealer network.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/oem/programs`
### `POST /api/admin/oem/programs`
OEM program management.

**Auth required:** Yes
**Shadow mode:** Yes

### `GET /api/admin/oem/analytics`
Cross-dealer analytics.

**Auth required:** Yes
**Shadow mode:** Yes

---

## Admin: Other Modules

### `GET /api/admin/domains`
### `POST /api/admin/domains`
Custom domain management. **Auth required:** Yes. **Shadow mode:** Yes.

### `GET /api/admin/billing`
### `POST /api/admin/billing`
Billing management. **Auth required:** Yes. **Shadow mode:** Yes.

### `GET /api/admin/onboarding`
### `POST /api/admin/onboarding`
Onboarding state. **Auth required:** Yes. **Shadow mode:** Yes.

### `GET /api/admin/trade-in`
### `POST /api/admin/trade-in`
Trade-in records. **Auth required:** Yes. **Shadow mode:** Yes.

### `GET /api/admin/tasks`
### `POST /api/admin/tasks`
Task management. **Auth required:** Yes. **Shadow mode:** Yes.

### `GET /api/admin/training`
### `POST /api/admin/training`
Training management. **Auth required:** Yes. **Shadow mode:** Yes.

### `GET /api/admin/resources`
### `POST /api/admin/resources`
Resources. **Auth required:** Yes. **Shadow mode:** Yes.

### `GET /api/admin/rewards`
### `POST /api/admin/rewards`
Rewards. **Auth required:** Yes. **Shadow mode:** Yes.

### `GET /api/admin/marketing`
### `POST /api/admin/marketing`
Marketing. **Auth required:** Yes. **Shadow mode:** Yes.

### `GET /api/admin/competitive`
Competitive intel. **Auth required:** Yes. **Shadow mode:** Yes.

### `GET /api/admin/change-management`
### `POST /api/admin/change-management`
Change management. **Auth required:** Yes. **Shadow mode:** Yes.

### `GET /api/admin/engagement-reports`
Engagement reports. **Auth required:** Yes. **Shadow mode:** Yes.

### `GET /api/admin/good-faith`
### `POST /api/admin/good-faith`
Good faith estimates. **Auth required:** Yes. **Shadow mode:** Yes.

---

## Public API

### `GET /api/inventory`
Public vehicle inventory search with pagination and filters.

**Auth required:** No
**Shadow mode:** Yes

### `GET /api/inventory/[vin]`
Public vehicle detail.

**Auth required:** No
**Shadow mode:** Yes

### `GET /api/inventory/feed`
Inventory feed for third-party aggregators.

**Auth required:** No
**Shadow mode:** Yes

### `GET /api/inventory/spotlight`
Featured/spotlight vehicles.

**Auth required:** No
**Shadow mode:** Yes

### `POST /api/contact`
Contact form submission. Protected by CSRF double-submit cookie.

**Auth required:** No
**Shadow mode:** Yes

### `POST /api/leads`
Public lead submission.

**Auth required:** No
**Shadow mode:** Yes

### `POST /api/chat`
Chat endpoint.

**Auth required:** No
**Shadow mode:** Yes

### `POST /api/trade-in/submit`
Public trade-in submission.

**Auth required:** No
**Shadow mode:** Yes

### `POST /api/trade-in/estimate`
Get trade-in value estimate.

**Auth required:** No
**Shadow mode:** Yes

### `POST /api/trade-in/decode-vin`
Decode VIN for trade-in form.

**Auth required:** No
**Shadow mode:** Yes

### `GET /api/service/schedule/slots`
Available service appointment time slots.

**Auth required:** No
**Shadow mode:** Yes

### `POST /api/service/schedule`
Public service appointment scheduling.

**Auth required:** No
**Shadow mode:** Yes

### `POST /api/analytics/events`
Ingest analytics events (fire-and-forget from frontend).

**Auth required:** No
**Shadow mode:** Yes

### `GET /api/analytics/insights`
Retrieve computed behavioral insights.

**Auth required:** No
**Shadow mode:** Yes

### `POST /api/privacy/delete-data`
GDPR data deletion request.

**Auth required:** No
**Shadow mode:** Yes

---

## Integrations

### `POST /api/dms/upload`
DMS data upload.

**Auth required:** Yes
**Shadow mode:** No

### `POST /api/dms/webhook`
DMS webhook receiver.

**Auth required:** Via webhook secret
**Shadow mode:** No

### `POST /api/images/upload`
Image upload to S3.

**Auth required:** Yes
**Shadow mode:** No

### `GET /api/images/[key]`
Image retrieval from S3.

**Auth required:** No
**Shadow mode:** No

### `POST /api/vehicles/index`
Index vehicles into search engine.

**Auth required:** Yes
**Shadow mode:** No

### `POST /api/webhooks/stripe`
Stripe webhook handler.

**Auth required:** Via Stripe webhook secret
**Shadow mode:** No

### `POST /api/walkaround`
Walkaround video management.

**Auth required:** Yes
**Shadow mode:** Yes

---

## A/B Testing

### `POST /api/ab/assign`
Assign user to A/B test variant.

**Auth required:** No
**Shadow mode:** Yes

### `POST /api/ab/convert`
Record A/B conversion.

**Auth required:** No
**Shadow mode:** Yes

### `GET /api/ab/results`
A/B test results.

**Auth required:** Yes
**Shadow mode:** Yes
