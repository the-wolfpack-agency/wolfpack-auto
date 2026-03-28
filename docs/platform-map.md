# Platform Map -- Single Source of Truth

This document maps every page, API route, analytics event, and feature in the Wolfpack Auto platform. Generated from the actual codebase.

---

## Module: Dashboard

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Admin Dashboard | `/admin` | Dealership performance overview | Stats cards (total vehicles, available, total leads, conversion rate, new leads, qualified leads, avg days on lot, vehicles sold), recent leads table |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/stats` | GET | Returns dashboard stats (vehicle counts, lead counts, conversion rate) | Yes |
| `/api/health` | GET | Health check endpoint | No |

---

## Module: Inventory

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Inventory List | `/admin/inventory` | All vehicles with filters | Vehicle table, search, filter by status/condition |
| Add Vehicle | `/admin/vehicles/new` | New vehicle form | VIN, year, make, model, trim, price, condition fields |
| Quick Add | `/admin/vehicles/quick-add` | Streamlined vehicle entry | Simplified form for fast inventory adds |
| Edit Vehicle | `/admin/inventory/[vin]/edit` | Edit existing vehicle | Pre-filled form, save/delete actions |
| Edit Vehicle (alt) | `/admin/vehicles/[vin]/edit` | Edit existing vehicle | Same as above, alternate URL path |
| Public Inventory | `/inventory` | Customer-facing vehicle listings | Search, filters, vehicle cards |
| Vehicle Detail | `/inventory/[vin]` | Single vehicle detail page | Photos, specs, price, contact form |
| Compare Vehicles | `/inventory/compare` | Side-by-side comparison | Select 2-3 vehicles, compare specs |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/inventory` | POST | Create a new vehicle (auth required, VIN validated) | No -- requires DB |
| `/api/admin/inventory/[vin]` | GET, PATCH, DELETE | Read/update/delete a vehicle by VIN | Yes (GET) |
| `/api/admin/vehicles` | GET, POST | List/create vehicles | Yes |
| `/api/admin/vehicles/[vin]` | GET, PATCH, DELETE | Read/update/delete vehicle | Yes |
| `/api/admin/vehicles/generate-listing` | POST | Generate listing description | Yes |
| `/api/admin/vehicles/index-all` | POST | Re-index all vehicles for search | No |
| `/api/admin/quick-add` | POST | Quick vehicle add | Yes |
| `/api/admin/vin-decode` | POST | Decode VIN to year/make/model | Yes |
| `/api/inventory` | GET | Public inventory search | Yes |
| `/api/inventory/[vin]` | GET | Public vehicle detail | Yes |
| `/api/inventory/feed` | GET | Inventory feed (third-party export) | Yes |
| `/api/inventory/spotlight` | GET | Featured/spotlight vehicles | Yes |
| `/api/vehicles/index` | POST | Index vehicles into search engine | No |

---

## Module: Intake

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Vehicle Intake | `/admin/intake` | Full intake pipeline dashboard | Photo upload, VIN decode, listing generator, recommendations |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/intake` | GET, POST | Intake pipeline management | Yes |
| `/api/admin/intake/recommendations` | GET | Smart pricing/listing recommendations | Yes |

### Learning System Connection
Intake data feeds into the pricing engine (`pricing-engine.ts`). Vehicle data added through intake enriches the market position analysis used by the pricing intelligence system.

---

## Module: Leads

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Lead Manager | `/admin/leads` | All leads with status pipeline | Lead table, status filters, assignment, temperature indicators |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/leads` | GET, POST | List/create leads | Yes |
| `/api/admin/leads/[id]` | GET, PATCH, DELETE | Read/update/delete lead | Yes |
| `/api/admin/leads/bulk` | POST | Bulk lead operations | Yes |
| `/api/admin/leads/score` | POST | Score a single lead's intent | Yes |
| `/api/admin/leads/score-all` | POST | Re-score all leads | Yes |
| `/api/leads` | POST | Public lead submission (contact form) | Yes |
| `/api/admin/export/leads` | GET | Export leads to CSV | Yes |

### Analytics Events
| Event | When it fires | What it feeds |
|-------|--------------|--------------|
| (Lead events tracked via funnel-health metrics) | Lead created, status changed, assigned | Funnel health dashboard, conversion tracking |

### Learning System Connection
Leads are scored by `lead-scorer.ts` using behavioral signals (page views, VDP views, session time, return visits), data quality signals (phone provided, message length, vehicle interest), timing signals, and negative signals (disposable email detection). Scores produce tiers: hot (>=75), warm (>=50), cool (>=25), cold (<25) with recommended follow-up times and channels.

---

## Module: Engagement Reports

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Engagement Reports | `/admin/engagement-reports` | Lead engagement metrics and reports | Engagement timelines, response metrics |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/engagement-reports` | GET | Engagement report data | Yes |

---

## Module: Good Faith Estimates

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Good Faith | `/admin/good-faith` | Good faith estimate management | Estimate forms, calculation results |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/good-faith` | GET, POST | Good faith estimate CRUD | Yes |

---

## Module: Deal Desking / F&I

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Deal List | `/admin/deals` | All deal worksheets | Deal table, status filters (working/pending/funded/unwound) |
| Deal Detail | `/admin/deals/[dealId]` | Single deal worksheet | Payment calculator, F&I products, trade-in, lender submission |
| Deal Compliance | `/admin/deals/[dealId]/compliance` | Compliance check for a deal | Document checklist, compliance score |
| F&I Products | `/admin/fi-products` | Finance & Insurance product catalog | Product list, pricing, attachment rates |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/deals` | GET, POST | List/create deals | Yes |
| `/api/admin/deals/[dealId]` | GET, PATCH | Read/update deal | Yes |
| `/api/admin/deals/[dealId]/calculate` | POST | Calculate payment/financing | Yes |
| `/api/admin/deals/[dealId]/submit` | POST | Submit deal to lender | Yes |
| `/api/admin/deals/[dealId]/submissions` | GET | List lender submissions | Yes |
| `/api/admin/deals/sign` | POST | E-signature workflow | Yes |
| `/api/admin/fi-products` | GET, POST | F&I product catalog | Yes |

### Analytics Events
| Event | When it fires | What it feeds |
|-------|--------------|--------------|
| `deal.created` | New deal worksheet created | F&I attachment rate, conversion metrics |
| `deal.presented` | Deal presented to customer | Deal flow timing |
| `deal.accepted` | Customer accepts deal | Conversion tracking |
| `deal.funded` | Deal funded by lender | Revenue metrics |
| `deal.unwound` | Deal unwound/cancelled | Loss tracking |
| `deal.fi_product_added` | F&I product added to deal | F&I attachment rate |
| `deal.fi_product_removed` | F&I product removed | Product performance |
| `deal.payment_calculated` | Payment calculator used | Calculator usage |

### Learning System Connection
Deal events feed into `learning-aggregator.ts` which computes: F&I attachment rate, average F&I per deal, top F&I products, average days to close, conversion by source, and top salesperson.

---

## Module: Lenders

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Lender Portal | `/admin/lenders` | Lender management | Lender list, rate sheets, submission history |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/lenders` | GET, POST | List/create lenders | Yes |
| `/api/admin/lenders/[id]` | GET, PATCH, DELETE | Read/update/delete lender | Yes |

### Analytics Events
| Event | When it fires | What it feeds |
|-------|--------------|--------------|
| `lender.created` | Lender added | Lender network size |
| `lender.updated` | Lender info updated | Lender data quality |
| `deal.lender_submitted` | Deal submitted to lender | Submission volume |
| `deal.lender_response` | Lender responds to submission | Response time, approval rate |

---

## Module: Credit Bureau

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Credit Bureau | `/admin/credit` | Credit pull management | Pull history, consent tracking |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/credit/pull` | POST | Initiate credit pull | Yes |
| `/api/admin/credit/history` | GET | Credit pull history | Yes |

### Analytics Events
| Event | When it fires | What it feeds |
|-------|--------------|--------------|
| `credit.pulled` | Credit report pulled | Credit pull volume, compliance |
| `credit.consent_recorded` | Customer consent captured | FCRA compliance tracking |

---

## Module: Service & Parts

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Service Dashboard | `/admin/service` | Service department overview | Appointment stats, RO counts, revenue |
| Appointments | `/admin/service/appointments` | Appointment calendar | Schedule, status management |
| Repair Orders | `/admin/service/repair-orders` | Repair order list | RO table, status, totals |
| Parts | `/admin/service/parts` | Parts inventory | Stock levels, orders, low-stock alerts |
| Technicians | `/admin/service/technicians` | Technician management | Tech list, hours, productivity |
| Public Booking | `/service-booking` | Customer-facing service booking | Date/time picker, service type selection |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/service/appointments` | GET, POST | List/create appointments | Yes |
| `/api/admin/service/appointments/[id]` | GET, PATCH, DELETE | Manage single appointment | Yes |
| `/api/admin/service/repair-orders` | GET, POST | List/create repair orders | Yes |
| `/api/admin/service/repair-orders/[id]` | GET, PATCH | Manage single RO | Yes |
| `/api/admin/service/parts` | GET, POST | Parts inventory | Yes |
| `/api/admin/service/technicians` | GET, POST | Technician management | Yes |
| `/api/admin/service/history/[vin]` | GET | Service history by VIN | Yes |
| `/api/service/schedule` | POST | Public service scheduling | Yes |
| `/api/service/schedule/slots` | GET | Available time slots | Yes |

### Analytics Events
| Event | When it fires | What it feeds |
|-------|--------------|--------------|
| `service.appointment_created` | Appointment booked | Appointment volume |
| `service.appointment_completed` | Appointment completed | Show rate |
| `service.appointment_no_show` | Customer no-show | No-show tracking |
| `service.self_scheduled` | Customer self-booked online | Self-service adoption |
| `service.ro_created` | Repair order opened | RO volume |
| `service.ro_completed` | Repair order completed | Revenue, avg RO value |
| `service.part_ordered` | Part ordered | Parts demand |
| `service.part_low_stock` | Part below threshold | Inventory alerts |

### Learning System Connection
Service events feed into: appointment show rate, average RO value, parts turn rate.

---

## Module: Accounting

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Accounting Dashboard | `/admin/accounting` | Financial overview | Revenue totals, commission summary |
| Commissions | `/admin/accounting/commissions` | Commission tracking | Commission table by salesperson, pay periods |
| Export / GL | `/admin/accounting/export` | General ledger export | Export format selection, date range, download |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/accounting/summary` | GET | Financial summary | Yes |
| `/api/admin/accounting/sales-log` | GET | Sales log entries | Yes |
| `/api/admin/accounting/commissions` | GET, POST | Commission records | Yes |
| `/api/admin/accounting/export` | GET | GL export download | Yes |
| `/api/admin/accounting/chart-of-accounts` | GET | Chart of accounts | Yes |

### Analytics Events
| Event | When it fires | What it feeds |
|-------|--------------|--------------|
| `accounting.sale_logged` | Sale recorded in accounting | Revenue tracking |
| `accounting.commission_paid` | Commission paid out | Commission metrics |
| `accounting.floor_plan_added` | Vehicle added to floor plan | Financing costs |
| `accounting.floor_plan_payoff` | Floor plan paid off | Inventory turn tracking |
| `accounting.exported` | GL exported | Export frequency |

---

## Module: Floor Plan

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Floor Plan | `/admin/floor-plan` | Floor plan financing dashboard | Vehicles on plan, daily costs, payoff tracking |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/floor-plan` | GET, POST | Floor plan records | Yes |
| `/api/admin/floor-plan/[id]` | GET, PATCH | Single floor plan record | Yes |

---

## Module: Digital Retail

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Digital Retail | `/admin/digital-retail` | Online buying tools dashboard | Calculator metrics, credit app stats |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/digital-retail/calculator` | POST | Payment calculator | Yes |
| `/api/admin/digital-retail/credit-app` | GET, POST | Credit application management | Yes |

### Analytics Events
| Event | When it fires | What it feeds |
|-------|--------------|--------------|
| `retail.calculator_used` | Payment calculator used | Calculator engagement |
| `retail.credit_app_submitted` | Credit application submitted | Application volume |
| `retail.credit_app_approved` | Credit application approved | Approval rate |

---

## Module: Reviews & Reputation

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Reviews | `/admin/reviews` | Review aggregation dashboard | Reviews list, ratings, response management |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/reviews` | GET | List reviews | Yes |
| `/api/admin/reviews/[id]/respond` | POST | Respond to a review | Yes |
| `/api/admin/reviews/templates` | GET, POST | Response templates | Yes |

### Analytics Events
| Event | When it fires | What it feeds |
|-------|--------------|--------------|
| `review.received` | New review ingested | Average rating, volume |
| `review.responded` | Response posted | Response rate |
| `review.flagged` | Review flagged for attention | Alert system |

### Learning System Connection
Review events feed into: average rating, response rate, sentiment trend (improving/stable/declining based on 30-day rolling comparison).

---

## Module: Customers

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Customer List | `/admin/customers` | All customers | Customer table, search, lifetime value |
| Customer Detail | `/admin/customers/[id]` | 360-degree customer view | Purchase history, service history, communications, LTV |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/customers` | GET, POST | List/create customers | Yes |
| `/api/admin/customers/[id]` | GET, PATCH | Customer detail/update | Yes |

### Analytics Events
| Event | When it fires | What it feeds |
|-------|--------------|--------------|
| `customer.viewed_360` | Staff views customer 360 page | CRM engagement |
| `customer.ltv_milestone` | Customer reaches LTV milestone | Retention tracking |

---

## Module: Comms (Communications)

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Comms Overview | `/admin/comms` | Communication hub | Message stats, active sequences |
| Templates | `/admin/comms/templates` | Email/SMS templates | Template editor, performance metrics |
| Sequences | `/admin/comms/sequences` | Automated follow-up sequences | Sequence builder, trigger configuration |
| Message Log | `/admin/comms/log` | All sent messages | Message history, delivery status |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/comms` | GET | Comms overview stats | Yes |
| `/api/admin/comms/send` | POST | Send a message | Yes |
| `/api/admin/comms/templates` | GET, POST | Template CRUD | Yes |
| `/api/admin/comms/sequences` | GET, POST | Sequence CRUD | Yes |
| `/api/admin/comms/log` | GET | Message log | Yes |

### Analytics Events
| Event | When it fires | What it feeds |
|-------|--------------|--------------|
| `comms.message_sent` | Message sent | Send volume |
| `comms.message_opened` | Email opened | Open rate |
| `comms.message_clicked` | Link clicked in message | Click rate |
| `comms.message_bounced` | Message bounced | Deliverability |
| `comms.sequence_started` | Sequence activated for a lead | Automation adoption |
| `comms.sequence_completed` | Sequence finished | Sequence completion rate |
| `comms.template_created` | New template created | Template library growth |

### Learning System Connection
Comms events feed into: email open rate, SMS response rate, best performing template, optimal follow-up delay hours.

---

## Module: Compliance

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Compliance Dashboard | `/admin/compliance` | Overall compliance status | Score, grade, violation list |
| Compliance Checks | `/admin/compliance/checks` | Individual compliance checks | Check list, run/review/override actions |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/compliance` | GET | Compliance summary (OEM brand scorer) | Yes |
| `/api/admin/compliance/checks` | GET, POST | List/create compliance checks | Yes |
| `/api/admin/compliance/checks/[id]` | GET, PATCH | Individual check detail | Yes |

### Analytics Events
| Event | When it fires | What it feeds |
|-------|--------------|--------------|
| `compliance.check_run` | Compliance check executed | Check frequency |
| `compliance.check_reviewed` | Check result reviewed by staff | Review rate |
| `compliance.check_overridden` | Check result overridden | Override audit trail |

### Learning System Connection
The compliance scorer (`compliance-scorer.ts`) produces a 0-100 score across four categories: Brand Identity (25 pts), Legal & Disclosures (30 pts), Digital Presence (25 pts), Lead Responsiveness (20 pts). See [Compliance](./compliance.md) for full rule details.

---

## Module: Documents

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Document Vault | `/admin/documents` | All dealer documents | Document list, upload, categorization |
| Document Compliance | `/admin/documents/compliance` | Document compliance analysis | Analysis results, issue list, scores |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/documents` | GET, POST | List/upload documents | Yes |
| `/api/admin/documents/[id]` | GET, DELETE | Read/delete document | Yes |
| `/api/admin/documents/analyze` | POST | Analyze document for compliance | Yes |
| `/api/admin/documents/scan-all` | POST | Scan all documents | Yes |

### Analytics Events
| Event | When it fires | What it feeds |
|-------|--------------|--------------|
| `document.uploaded` | Document uploaded | Document volume |
| `document.signed` | Document signed | Signature completion |
| `document.deleted` | Document deleted | Deletion audit |
| `document.analyzed` | Single document analyzed | Analysis frequency |
| `document.deal_jacket_analyzed` | Full deal jacket analyzed | Deal readiness |

---

## Module: Knowledge Base

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Knowledge Base | `/admin/knowledge` | Internal knowledge repository | Document list, search, ingest |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/knowledge/ingest` | POST | Ingest document into knowledge base | Yes |
| `/api/admin/knowledge/query` | POST | Query knowledge base | Yes |

### Analytics Events
| Event | When it fires | What it feeds |
|-------|--------------|--------------|
| `knowledge.document_ingested` | Document added to KB | KB growth |
| `knowledge.queried` | KB searched | Query patterns |

---

## Module: Trade-In

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Admin Trade-In | `/admin/trade-in` | Trade-in appraisal management | Appraisal list, valuations |
| Public Trade-In | `/trade-in` | Customer trade-in estimator | VIN entry, condition form, instant estimate |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/trade-in` | GET, POST | Trade-in records | Yes |
| `/api/trade-in/submit` | POST | Public trade-in submission | Yes |
| `/api/trade-in/estimate` | POST | Get trade-in estimate | Yes |
| `/api/trade-in/decode-vin` | POST | Decode VIN for trade-in | Yes |

### Learning System Connection
Trade-in valuations use `trade-in-valuator.ts` -- a deterministic, explainable algorithm that produces low/mid/high estimates with itemized valuation factors (age depreciation, mileage, condition, accident history, title status, ownership count).

---

## Module: Pricing Intelligence

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Pricing | `/admin/pricing` | Pricing recommendations dashboard | Price analysis by vehicle, urgency indicators, projected revenue impact |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/pricing` | GET | Pricing report for all inventory | Yes |
| `/api/admin/pricing/[vehicleId]` | GET | Single vehicle pricing analysis | Yes |

### Learning System Connection
The pricing engine (`pricing-engine.ts`) analyzes each vehicle's days-on-lot to recommend price changes. Urgency levels: immediate (>60 days), soon (31-60 days), monitor (16-30 days), none (<=15 days). Market position is calculated relative to the dealer's own inventory median for the same make/year.

---

## Module: Analytics

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Analytics Overview | `/admin/analytics` | Aggregated analytics dashboard | Key metrics, charts, trends |
| Lead Analytics | `/admin/analytics/leads` | Lead-specific analytics | Conversion funnels, source breakdown |
| Inventory Analytics | `/admin/analytics/inventory` | Inventory-specific analytics | Days on lot, turn rates, pricing |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/analytics/dashboard` | GET | Dashboard analytics data | Yes |
| `/api/admin/analytics/learning` | GET | Learning insights from aggregator | Yes |
| `/api/admin/analytics/query` | POST | Custom analytics query | Yes |
| `/api/admin/export/analytics` | GET | Export analytics data | Yes |
| `/api/analytics/events` | POST | Ingest analytics events | Yes |
| `/api/analytics/insights` | GET | Retrieve computed insights | Yes |

---

## Module: Funnel Health

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Funnel Health | `/admin/funnel-health` | Lead pipeline health dashboard | Health score (0-100, A-F grade), SLA compliance, funnel stages, alerts |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/funnel-health` | GET | Funnel health metrics | Yes |

### Learning System Connection
The funnel health engine (`funnel-health.ts`) computes: lead volume trends, SLA compliance (24h and 1h), average response time, overdue leads, funnel stage counts (new/contacted/qualified/appointment_set/sold/lost), conversion rate, source breakdown. Health score is weighted: SLA compliance (40%), lead trend (20%), conversion rate (25%), response speed (15%).

---

## Module: Analytics Brain

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Brain | `/admin/analytics-brain` | AI-powered analytics brain | Behavioral insights, session analysis, recommendations |

### Learning System Connection
The analytics brain (`analytics-engine.ts`) implements triple-write: events go to PostgreSQL (raw storage), Qdrant (vector embeddings for semantic search), and Neo4j (relationship graph). It computes behavioral insights with confidence scores and sample sizes.

---

## Module: Marketing

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Marketing | `/admin/marketing` | Marketing campaign management | Campaign list, performance metrics |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/marketing` | GET, POST | Marketing campaigns | Yes |

---

## Module: Competitive Intel

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Competitive Intel | `/admin/competitive` | Market competitive analysis | Competitor data, pricing comparisons |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/competitive` | GET | Competitive intelligence data | Yes |

---

## Module: Change Management

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Change Management | `/admin/change-management` | Platform change tracking | Change log, rollback options |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/change-management` | GET, POST | Change management records | Yes |

---

## Module: Rewards

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Rewards | `/admin/rewards` | Staff rewards/incentives | Points, leaderboard, achievements |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/rewards` | GET, POST | Rewards management | Yes |

---

## Module: Tasks

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Tasks | `/admin/tasks` | Task management | Task list, assignments, due dates |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/tasks` | GET, POST | Task CRUD | Yes |

---

## Module: Training

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Training | `/admin/training` | Staff training materials | Training modules, completion tracking |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/training` | GET, POST | Training management | Yes |

---

## Module: Resources

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Resources | `/admin/resources` | Dealer resources library | Document/video library |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/resources` | GET, POST | Resource management | Yes |

---

## Module: OEM Network

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| OEM Overview | `/admin/oem` | OEM network dashboard | Network stats, program compliance |
| Dealer Network | `/admin/oem/dealers` | OEM dealer directory | Dealer list, performance rankings |
| Programs | `/admin/oem/programs` | OEM program management | Active programs, eligibility, enrollment |
| Cross-Dealer Analytics | `/admin/oem/analytics` | Cross-dealer performance comparison | Benchmarks, rankings, trends |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/oem` | GET | OEM overview data | Yes |
| `/api/admin/oem/dealers` | GET | Dealer network list | Yes |
| `/api/admin/oem/programs` | GET, POST | Program management | Yes |
| `/api/admin/oem/analytics` | GET | Cross-dealer analytics | Yes |

---

## Module: Settings

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Settings | `/admin/settings` | Dealer settings | Branding, contact, team management |
| Integrations | `/admin/settings/integrations` | Third-party integrations | DMS, CRM, marketing tool connections |
| MFA | `/admin/settings/mfa` | Multi-factor authentication setup | TOTP QR code, backup codes |
| Notifications | `/admin/settings/notifications` | Notification preferences | Email/SMS notification toggles |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/settings` | GET, PATCH | Dealer settings | Yes |
| `/api/admin/settings/integrations` | GET, PATCH | Integration config | Yes |
| `/api/admin/settings/notifications` | GET, PATCH | Notification prefs | Yes |
| `/api/admin/mfa/setup` | POST | Begin MFA setup (generates TOTP secret) | No |
| `/api/admin/mfa/enable` | POST | Enable MFA after TOTP verification | No |
| `/api/admin/mfa/verify` | POST | Verify TOTP code | No |
| `/api/admin/mfa/status` | GET | Check MFA status | No |
| `/api/admin/mfa/disable` | POST | Disable MFA | No |
| `/api/admin/domains` | GET, POST | Custom domain management | Yes |

---

## Module: Reports

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Reports | `/admin/reports` | Report generation hub | Report types, date ranges, export |

---

## Module: Billing

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Billing | `/admin/billing` | Subscription and billing | Plan details, invoices, payment method |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/billing` | GET, POST | Billing management | Yes |
| `/api/webhooks/stripe` | POST | Stripe webhook handler | No |

---

## Module: Onboarding

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Onboarding | `/admin/onboarding` | New dealer setup wizard | Step-by-step dealer configuration |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/admin/onboarding` | GET, POST | Onboarding state management | Yes |

---

## Module: Login / Auth

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Login | `/admin/login` | Admin login form | Email, password, MFA token fields |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth.js endpoints (login, logout, session) | N/A |

---

## Module: Public Pages

### Pages
| Page | Path | What the user sees | Key elements |
|------|------|--------------------|--------------|
| Homepage | `/` | Dealer landing page | Hero search, featured inventory, call-to-action |
| About | `/about` | About the dealership | History, team, mission |
| Contact | `/contact` | Contact form | Name, email, phone, message fields |
| Financing | `/financing` | Financing information | Pre-qualification form, rate info |
| Privacy Policy | `/privacy` | Privacy policy | Legal text |
| Terms of Service | `/terms` | Terms of service | Legal text |
| Accessibility | `/accessibility` | Accessibility statement | WCAG compliance info |
| Dealer Sub-pages | `/dealers/mile-high-motors` | Individual dealer landing | Dealer-specific branding and inventory |
| Dealer Sub-pages | `/dealers/summit-auto` | Individual dealer landing | Dealer-specific branding and inventory |
| Walkaround | `/walkaround` | Vehicle walkaround videos | Video list |
| Walkaround Detail | `/walkaround/[vin]` | Single vehicle walkaround | Video player, vehicle info |
| Catch-all | `/[...slug]` | Dynamic content pages | CMS-driven content |

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/contact` | POST | Contact form submission (CSRF protected) | Yes |
| `/api/chat` | POST | Chat endpoint | Yes |
| `/api/images/upload` | POST | Image upload | No |
| `/api/images/[key]` | GET | Image retrieval | No |
| `/api/dms/upload` | POST | DMS data upload | No |
| `/api/dms/webhook` | POST | DMS webhook receiver | No |
| `/api/privacy/delete-data` | POST | GDPR data deletion request | Yes |
| `/api/walkaround` | POST | Walkaround video management | Yes |

---

## Module: A/B Testing

### API Routes
| Route | Method | What it does | Shadow mode? |
|-------|--------|-------------|--------------|
| `/api/ab/assign` | POST | Assign user to A/B test variant | Yes |
| `/api/ab/convert` | POST | Record A/B conversion | Yes |
| `/api/ab/results` | GET | A/B test results | Yes |
