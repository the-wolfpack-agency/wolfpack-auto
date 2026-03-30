# Admin Page Reference

Every admin page in the Wolfpack Auto platform, with its path, purpose, key UI elements, and connected API routes. All admin pages require authentication (unless `DEMO_MODE=true`).

---

## Dashboard
**Path:** `/admin`
**What it does:** Provides a high-level overview of dealership performance with key metrics and recent activity.
**Key UI elements:**
- Stats cards: Total Vehicles, Available, Total Leads, Conversion Rate, New Leads, Qualified Leads, Avg Days on Lot, Vehicles Sold
- Recent Leads table (last 10): name, email, vehicle interest, source, status, date
- Quick action buttons: "Add Vehicle", "View Leads"

**Connected API routes:** `/api/admin/stats`

---

## Inventory
**Path:** `/admin/inventory`
**What it does:** Manage the dealership's vehicle inventory with search, filters, and bulk actions.
**Key UI elements:**
- Vehicle list table with columns: VIN, year, make, model, price, status, days on lot
- Filter controls: status (available/pending/sold), condition (new/used/certified)
- Search bar
- "Add Vehicle" button

**Connected API routes:** `/api/admin/inventory`, `/api/admin/vehicles`

---

## Add Vehicle
**Path:** `/admin/vehicles/new`
**What it does:** Full form for adding a new vehicle to inventory.
**Key UI elements:**
- VIN field with decode button
- Year, make, model, trim fields
- Price, MSRP, mileage fields
- Condition selector (new/used/certified)
- Fuel type, transmission, exterior color, body style fields
- Description textarea
- Photo upload area
- Save / Cancel buttons

**Connected API routes:** `/api/admin/vehicles`, `/api/admin/vin-decode`

---

## Quick Add Vehicle
**Path:** `/admin/vehicles/quick-add`
**What it does:** Streamlined vehicle entry for fast inventory adds -- fewer fields than the full form.
**Key UI elements:**
- VIN field with auto-decode
- Essential fields only (year, make, model, price)
- Submit button

**Connected API routes:** `/api/admin/quick-add`, `/api/admin/vin-decode`

---

## Edit Vehicle
**Path:** `/admin/inventory/[vin]/edit` or `/admin/vehicles/[vin]/edit`
**What it does:** Edit an existing vehicle's details.
**Key UI elements:**
- Pre-filled form with all vehicle fields
- Photo management (add/remove)
- Save / Delete buttons
- Status change dropdown

**Connected API routes:** `/api/admin/vehicles/[vin]`, `/api/admin/inventory/[vin]`

---

## Intake
**Path:** `/admin/intake`
**What it does:** Full vehicle intake pipeline -- from photos to listing-ready inventory.
**Key UI elements:**
- Photo upload from phone/camera
- VIN decoder integration
- AI listing description generator
- Smart pricing recommendations
- Pipeline status (intake -> processing -> ready)

**Connected API routes:** `/api/admin/intake`, `/api/admin/intake/recommendations`

---

## Leads
**Path:** `/admin/leads`
**What it does:** Manage all customer leads with a pipeline view.
**Key UI elements:**
- Lead table: name, email, phone, vehicle interest, source, status, temperature, assigned to
- Status pipeline filters: new, contacted, qualified, appointment set, sold, lost
- Temperature indicators: hot, warm, cool, cold
- Assignment dropdown
- Notes/activity panel
- Lead scoring display

**Connected API routes:** `/api/admin/leads`, `/api/admin/leads/[id]`, `/api/admin/leads/score`, `/api/admin/leads/bulk`

---

## Engagement Reports
**Path:** `/admin/engagement-reports`
**What it does:** Shows lead engagement metrics and follow-up performance.
**Key UI elements:**
- Engagement timeline
- Response time metrics
- Follow-up compliance rates

**Connected API routes:** `/api/admin/engagement-reports`

---

## Good Faith Estimates
**Path:** `/admin/good-faith`
**What it does:** Create and manage good faith price estimates for customers.
**Key UI elements:**
- Estimate creation form
- Estimate list
- Calculation breakdown

**Connected API routes:** `/api/admin/good-faith`

---

## Deal Desking
**Path:** `/admin/deals`
**What it does:** Manage deal worksheets across the sales pipeline.
**Key UI elements:**
- Deal list table: customer, vehicle, status, salesperson, total gross
- Status filters: working, pending approval, approved, funded, delivered, unwound
- "New Deal" button
- Quick deal summary cards

**Connected API routes:** `/api/admin/deals`

---

## Deal Detail
**Path:** `/admin/deals/[dealId]`
**What it does:** Full deal worksheet with payment calculation, F&I products, and lender submission.
**Key UI elements:**
- Vehicle info section (VIN, year/make/model, MSRP, selling price)
- Customer info section
- Trade-in section (vehicle, value, payoff)
- Payment calculator (down payment, APR, term, monthly payment)
- F&I product selector (extended warranty, GAP, paint protection, etc.)
- Front/back/total gross display
- Lender submission panel
- Notes section
- Status change buttons

**Connected API routes:** `/api/admin/deals/[dealId]`, `/api/admin/deals/[dealId]/calculate`, `/api/admin/deals/[dealId]/submit`

---

## Deal Compliance
**Path:** `/admin/deals/[dealId]/compliance`
**What it does:** Compliance check for a specific deal -- ensures all documents and disclosures are in order.
**Key UI elements:**
- Document checklist
- Compliance score
- Blocker list
- Ready-to-fund status

**Connected API routes:** `/api/admin/deals/[dealId]`, `/api/admin/documents/analyze`

---

## F&I Products
**Path:** `/admin/fi-products`
**What it does:** Manage the F&I product catalog available for deal attachment.
**Key UI elements:**
- Product list: name, category, price, provider
- Attachment rate metrics
- Add/edit product forms

**Connected API routes:** `/api/admin/fi-products`

---

## Lenders
**Path:** `/admin/lenders`
**What it does:** Manage lender relationships, rate sheets, and submission routing.
**Key UI elements:**
- Lender list: name, contact, rate range, submission count
- Add lender form
- Rate sheet configuration

**Connected API routes:** `/api/admin/lenders`, `/api/admin/lenders/[id]`

---

## Credit Bureau
**Path:** `/admin/credit`
**What it does:** Manage credit pulls with consent tracking and FCRA compliance.
**Key UI elements:**
- Credit pull history table
- Consent tracking log
- Pull request form (customer ID, bureau selection)

**Connected API routes:** `/api/admin/credit/pull`, `/api/admin/credit/history`

---

## Documents
**Path:** `/admin/documents`
**What it does:** Secure document vault for all dealer documents.
**Key UI elements:**
- Document list: name, type, deal association, signed status, upload date
- Upload button
- Category filter (purchase agreement, credit app, disclosure, title, etc.)
- Download/view actions

**Connected API routes:** `/api/admin/documents`, `/api/admin/documents/[id]`

---

## Document Compliance
**Path:** `/admin/documents/compliance`
**What it does:** Analyze documents for regulatory compliance issues.
**Key UI elements:**
- Analysis results with score (0-100)
- Issue list with severity (critical/high/medium/low)
- Regulatory references (TILA, FCRA, ECOA, FTC)
- Recommendations

**Connected API routes:** `/api/admin/documents/analyze`, `/api/admin/documents/scan-all`

---

## Knowledge Base
**Path:** `/admin/knowledge`
**What it does:** Internal knowledge repository for dealer staff.
**Key UI elements:**
- Document/article list
- Search bar
- Ingest new document form
- Query interface

**Connected API routes:** `/api/admin/knowledge/ingest`, `/api/admin/knowledge/query`

---

## Trade-Ins
**Path:** `/admin/trade-in`
**What it does:** Manage trade-in appraisals and valuations.
**Key UI elements:**
- Appraisal list
- Valuation details (low/mid/high estimates)
- Valuation factor breakdown

**Connected API routes:** `/api/admin/trade-in`

---

## Service Dashboard
**Path:** `/admin/service`
**What it does:** Service department overview with key metrics.
**Key UI elements:**
- Appointment count, RO count, revenue summary
- Today's appointments
- Open repair orders
- Low-stock parts alerts

**Connected API routes:** `/api/admin/service/appointments`, `/api/admin/service/repair-orders`

---

## Service Appointments
**Path:** `/admin/service/appointments`
**What it does:** Manage service appointments.
**Key UI elements:**
- Appointment table: customer, vehicle, service type, date/time, technician, status
- Calendar view
- New appointment form
- Status management (scheduled/in-progress/completed/no-show)

**Connected API routes:** `/api/admin/service/appointments`, `/api/admin/service/appointments/[id]`

---

## Repair Orders
**Path:** `/admin/service/repair-orders`
**What it does:** Manage repair orders.
**Key UI elements:**
- RO table: number, customer, vehicle, technician, status, total
- RO detail with line items
- Status management (open/in-progress/completed/invoiced/closed)

**Connected API routes:** `/api/admin/service/repair-orders`, `/api/admin/service/repair-orders/[id]`

---

## Parts
**Path:** `/admin/service/parts`
**What it does:** Parts inventory management.
**Key UI elements:**
- Parts list: part number, description, quantity, reorder level
- Low-stock alerts
- Order form

**Connected API routes:** `/api/admin/service/parts`

---

## Technicians
**Path:** `/admin/service/technicians`
**What it does:** Technician roster and productivity tracking.
**Key UI elements:**
- Technician list: name, specialties, hours logged, productivity metrics
- Schedule view

**Connected API routes:** `/api/admin/service/technicians`

---

## Floor Plan
**Path:** `/admin/floor-plan`
**What it does:** Floor plan financing dashboard -- track vehicles on floor plan and daily costs.
**Key UI elements:**
- Vehicles on plan list with daily interest cost
- Total floor plan exposure
- Payoff tracking
- Days-on-plan per vehicle

**Connected API routes:** `/api/admin/floor-plan`, `/api/admin/floor-plan/[id]`

---

## Accounting Dashboard
**Path:** `/admin/accounting`
**What it does:** Financial overview for the dealership.
**Key UI elements:**
- Revenue summary (front gross, back gross, total gross)
- Sales log
- Month-over-month comparison

**Connected API routes:** `/api/admin/accounting/summary`, `/api/admin/accounting/sales-log`

---

## Commissions
**Path:** `/admin/accounting/commissions`
**What it does:** Track and manage salesperson commissions.
**Key UI elements:**
- Commission table by salesperson
- Pay period selector
- Commission calculation details

**Connected API routes:** `/api/admin/accounting/commissions`

---

## Export / GL
**Path:** `/admin/accounting/export`
**What it does:** Export financial data for general ledger integration.
**Key UI elements:**
- Export format selector (CSV, QB, Xero)
- Date range picker
- Download button

**Connected API routes:** `/api/admin/accounting/export`, `/api/admin/accounting/chart-of-accounts`

---

## Digital Retail
**Path:** `/admin/digital-retail`
**What it does:** Dashboard for online buying tools and digital retail metrics.
**Key UI elements:**
- Calculator usage metrics
- Credit application stats
- Online deal starts

**Connected API routes:** `/api/admin/digital-retail/calculator`, `/api/admin/digital-retail/credit-app`

---

## Reviews
**Path:** `/admin/reviews`
**What it does:** Aggregate and manage customer reviews across platforms.
**Key UI elements:**
- Review list: source, rating, text, date, response status
- Average rating display
- Response composer
- Response templates

**Connected API routes:** `/api/admin/reviews`, `/api/admin/reviews/[id]/respond`, `/api/admin/reviews/templates`

---

## Customers
**Path:** `/admin/customers`
**What it does:** Customer relationship management.
**Key UI elements:**
- Customer table: name, email, phone, last purchase, lifetime value
- Search bar

**Connected API routes:** `/api/admin/customers`

---

## Customer Detail
**Path:** `/admin/customers/[id]`
**What it does:** 360-degree customer view -- all interactions in one place.
**Key UI elements:**
- Contact info
- Purchase history
- Service history
- Communication log
- Lifetime value display

**Connected API routes:** `/api/admin/customers/[id]`

---

## Compliance Checks
**Path:** `/admin/compliance/checks`
**What it does:** Run and review compliance checks.
**Key UI elements:**
- Check list with pass/fail status
- Run check button
- Review/override actions
- Compliance score

**Connected API routes:** `/api/admin/compliance/checks`, `/api/admin/compliance/checks/[id]`

---

## Compliance Dashboard
**Path:** `/admin/compliance`
**What it does:** Overall compliance status with OEM brand scoring.
**Key UI elements:**
- Overall score (0-100) with letter grade (A-F)
- Category scores: Brand Identity, Legal & Disclosures, Digital Presence, Lead Responsiveness
- Violation list with recommendations

**Connected API routes:** `/api/admin/compliance`

---

## Tasks
**Path:** `/admin/tasks`
**What it does:** Task management for dealer operations.
**Key UI elements:**
- Task list with assignments and due dates
- Status management
- Priority indicators

**Connected API routes:** `/api/admin/tasks`

---

## Comms Overview
**Path:** `/admin/comms`
**What it does:** Communication hub -- overview of messaging activity.
**Key UI elements:**
- Message volume stats
- Active sequences count
- Recent activity

**Connected API routes:** `/api/admin/comms`

---

## Comms Templates
**Path:** `/admin/comms/templates`
**What it does:** Create and manage email/SMS templates.
**Key UI elements:**
- Template list with performance metrics
- Template editor
- Merge tag reference

**Connected API routes:** `/api/admin/comms/templates`

---

## Comms Sequences
**Path:** `/admin/comms/sequences`
**What it does:** Build automated follow-up sequences.
**Key UI elements:**
- Sequence builder
- Trigger configuration
- Step editor (delay, message, condition)

**Connected API routes:** `/api/admin/comms/sequences`

---

## Message Log
**Path:** `/admin/comms/log`
**What it does:** Full log of all sent messages.
**Key UI elements:**
- Message table: recipient, subject, channel, status, sent date
- Delivery status indicators

**Connected API routes:** `/api/admin/comms/log`

---

## Rewards
**Path:** `/admin/rewards`
**What it does:** Staff incentive and rewards tracking.
**Key UI elements:**
- Leaderboard
- Points/achievements display
- Reward configuration

**Connected API routes:** `/api/admin/rewards`

---

## Analytics Overview
**Path:** `/admin/analytics`
**What it does:** Aggregated analytics dashboard with trends and charts.
**Key UI elements:**
- Key performance indicators
- Trend charts
- Source breakdown

**Connected API routes:** `/api/admin/analytics/dashboard`

---

## Lead Analytics
**Path:** `/admin/analytics/leads`
**What it does:** Lead-specific analytics and conversion funnels.
**Key UI elements:**
- Conversion funnel visualization
- Source performance comparison
- Response time metrics

**Connected API routes:** `/api/admin/analytics/dashboard`

---

## Inventory Analytics
**Path:** `/admin/analytics/inventory`
**What it does:** Inventory performance analytics.
**Key UI elements:**
- Days-on-lot distribution
- Turn rate metrics
- Pricing analysis charts

**Connected API routes:** `/api/admin/analytics/dashboard`

---

## Funnel Health
**Path:** `/admin/funnel-health`
**What it does:** Lead pipeline health dashboard with proactive alerts.
**Key UI elements:**
- Health score (0-100) with letter grade (A-F)
- SLA compliance gauges (24h and 1h)
- Funnel stage breakdown (new -> contacted -> qualified -> appointment -> sold)
- Alert cards (critical/warning/info)
- Source breakdown with per-source conversion rates

**Connected API routes:** `/api/admin/funnel-health`

---

## Analytics Brain
**Path:** `/admin/analytics-brain`
**What it does:** AI-powered behavioral analytics engine. Hydrates from PostgreSQL on cold start (serverless-friendly). Generates insights from real user sessions captured by EventCollector.
**Key UI elements:**
- Stats overview (active sessions, buffered events, insights, hot leads, alerts)
- Priority alerts (hot lead exits, frustrated buyers)
- Lead temperature board (real-time buyer intent scoring)
- Inventory intelligence (unmet demand, market signals)
- Top Insights — deduplicated, top 3 per category with "view all" link
- Event type distribution

**Sub-pages:**
- `/admin/analytics-brain/all` — full insight list with category filter pills

**Connected API routes:** `/api/analytics/events` (ingestion), `/api/analytics/insights` (query), `/api/admin/analytics/learning`, `/api/admin/analytics/health`

---

## Platform Health
**Path:** `/admin/analytics/platform-health`
**What it does:** Self-improving analytics dashboard that monitors the platform's own UX health. Shows friction hotspots (rage clicks, dead clicks, form abandonment), feature adoption rates (20 admin modules), form completion rates with top abandon fields, page engagement metrics, friction trend (improving/stable/worsening), health score (0-100), and automated plain-English recommendations.
**Key UI elements:**
- Friction hotspot cards (rage clicks, dead clicks, form abandonment)
- Feature adoption table (20 admin modules with usage rates)
- Form health with completion rates and top abandon fields
- Page engagement with bounce rates
- Friction trend indicator (improving/stable/worsening)
- Health score (0-100)
- Automated plain-English recommendations

**Connected API routes:** `/api/admin/analytics/platform-health`

---

## Marketing
**Path:** `/admin/marketing`
**What it does:** Marketing campaign management and performance tracking.
**Key UI elements:**
- Campaign list
- Performance metrics
- Campaign creation form

**Connected API routes:** `/api/admin/marketing`

---

## Competitive Intel
**Path:** `/admin/competitive`
**What it does:** Market competitive analysis and positioning.
**Key UI elements:**
- Competitive data display
- Pricing comparisons

**Connected API routes:** `/api/admin/competitive`

---

## Change Management
**Path:** `/admin/change-management`
**What it does:** Track platform changes and operational adjustments.
**Key UI elements:**
- Change log
- Impact assessment

**Connected API routes:** `/api/admin/change-management`

---

## Pricing
**Path:** `/admin/pricing`
**What it does:** Dynamic pricing recommendations based on days-on-lot and market position.
**Key UI elements:**
- Vehicle pricing table: VIN, current price, recommended price, adjustment, urgency
- Urgency indicators (immediate/soon/monitor/none)
- Projected revenue impact
- Stalled vehicle count (>60 days)

**Connected API routes:** `/api/admin/pricing`, `/api/admin/pricing/[vehicleId]`

---

## Reports
**Path:** `/admin/reports`
**What it does:** Report generation hub for various dealership reports.
**Key UI elements:**
- Report type selector
- Date range picker
- Export/download options

**Connected API routes:** Various analytics and data routes

---

## Onboarding
**Path:** `/admin/onboarding`
**What it does:** Step-by-step new dealer setup wizard.
**Key UI elements:**
- Progress stepper
- Configuration forms (branding, inventory, team, integrations)
- Completion checklist

**Connected API routes:** `/api/admin/onboarding`

---

## OEM Overview
**Path:** `/admin/oem`
**What it does:** OEM network dashboard for manufacturer-level administrators.
**Key UI elements:**
- Network stats
- Program compliance summary
- Dealer performance overview

**Connected API routes:** `/api/admin/oem`

---

## OEM Dealer Network
**Path:** `/admin/oem/dealers`
**What it does:** View and manage the OEM dealer network.
**Key UI elements:**
- Dealer directory
- Performance rankings
- Compliance status per dealer

**Connected API routes:** `/api/admin/oem/dealers`

---

## OEM Programs
**Path:** `/admin/oem/programs`
**What it does:** Manage OEM programs and dealer eligibility.
**Key UI elements:**
- Program list
- Enrollment status
- Program performance

**Connected API routes:** `/api/admin/oem/programs`

---

## OEM Cross-Dealer Analytics
**Path:** `/admin/oem/analytics`
**What it does:** Cross-dealer performance comparison and benchmarking.
**Key UI elements:**
- Benchmark comparisons
- Ranking tables
- Trend analysis

**Connected API routes:** `/api/admin/oem/analytics`

---

## Settings
**Path:** `/admin/settings`
**What it does:** Dealer configuration -- branding, contact info, team management.
**Key UI elements:**
- Branding section (logo, colors, tagline)
- Contact info (phone, email, address)
- Team management (add/remove users, role assignment)

**Connected API routes:** `/api/admin/settings`

---

## Settings: Integrations
**Path:** `/admin/settings/integrations`
**What it does:** Configure third-party integrations.
**Key UI elements:**
- DMS integration config
- CRM webhooks (Salesforce, HubSpot)
- Marketing tool connections

**Connected API routes:** `/api/admin/settings/integrations`

---

## Settings: MFA
**Path:** `/admin/settings/mfa`
**What it does:** Set up or manage multi-factor authentication.
**Key UI elements:**
- TOTP QR code for authenticator apps
- Backup codes display
- Enable/disable toggle

**Connected API routes:** `/api/admin/mfa/setup`, `/api/admin/mfa/enable`, `/api/admin/mfa/verify`, `/api/admin/mfa/status`, `/api/admin/mfa/disable`

---

## Settings: Notifications
**Path:** `/admin/settings/notifications`
**What it does:** Configure email and SMS notification preferences.
**Key UI elements:**
- Notification toggles by category
- Email/SMS channel selection

**Connected API routes:** `/api/admin/settings/notifications`

---

## Training
**Path:** `/admin/training`
**What it does:** Staff training materials and completion tracking.
**Key UI elements:**
- Training module list
- Completion status
- Progress tracking

**Connected API routes:** `/api/admin/training`

---

## Resources
**Path:** `/admin/resources`
**What it does:** Dealer resource library (documents, videos, guides).
**Key UI elements:**
- Resource list
- Category filters
- Download/view actions

**Connected API routes:** `/api/admin/resources`

---

## Billing
**Path:** `/admin/billing`
**What it does:** Subscription management and billing.
**Key UI elements:**
- Current plan display
- Invoice history
- Payment method management
- Upgrade/downgrade options

**Connected API routes:** `/api/admin/billing`

---

## Login
**Path:** `/admin/login`
**What it does:** Admin authentication page. This page does NOT show the sidebar.
**Key UI elements:**
- Email field
- Password field
- MFA token field (shown when MFA is required)
- "Sign In" button
- Error messages for rate limiting ("Too many login attempts. Please try again in 15 minutes.")

**Connected API routes:** `/api/auth/[...nextauth]`

---

## Accept Invite
**Path:** `/admin/accept-invite?token=...`
**What it does:** Password setup page for invited team members. Reached via email link. Sets password, activates the user account, redirects to login on success.
**Key UI elements:**
- Password input field (min 8 characters)
- Confirm password field
- "Set Password" button
- Error display for invalid/expired tokens

**Connected API routes:** `/api/admin/accept-invite`

---

## Reset Password
**Path:** `/admin/reset-password`
**What it does:** Two-step flow: without token shows email input form (request reset link), with `?token=...` shows new password form. Dark theme matching login page.
**Key UI elements:**
- Email input (request reset state)
- Password + confirm password inputs (token state)
- Submit button
- Success/error messages

**Connected API routes:** `POST /api/admin/reset-password`, `PUT /api/admin/reset-password`

---

## Security Dashboard

**Path:** `/admin/security`
**What it does:** Zero-token OWASP security scanner that analyzes the codebase for vulnerabilities across 10 categories.
**Key UI elements:**
- Stats cards: total findings, critical, high, medium, low
- Findings list grouped by category with severity badges
- Expandable recommendations per finding
- Filter by category and severity
- "Run Scan" button to trigger fresh analysis
**Connected API routes:** `GET/POST /api/admin/security/scan`

---

## System Health Dashboard

**Path:** `/admin/system`
**What it does:** Real-time monitoring of all platform dependencies.
**Key UI elements:**
- Status cards for: Database, Redis, Resend, Twilio, Sentry, Plausible, Qdrant
- Circuit breaker state badge (green/yellow/red)
- Analytics pipeline status (events flowing, learning active)
- Deployment info (commit, environment)
- Process uptime
- Auto-refresh every 15 seconds
**Connected API routes:** `GET /api/admin/system/health`
