# Analytics and Learning System

The Wolfpack Auto platform includes a behavioral analytics engine that tracks user actions, computes insights, and feeds them back into the system so the platform gets smarter over time. This document covers the event types, learning aggregator, and closed-loop architecture.

---

## Analytics Event Types

All events are defined in `src/lib/analytics-hooks.ts`. Every event is fire-and-forget -- analytics must never break the primary request flow.

### Deal Events (`DealEvent`)
| Event | When it fires |
|-------|--------------|
| `deal.created` | New deal worksheet created |
| `deal.presented` | Deal presented to customer |
| `deal.accepted` | Customer accepts deal |
| `deal.funded` | Deal funded by lender |
| `deal.unwound` | Deal cancelled/unwound |
| `deal.fi_product_added` | F&I product attached to deal |
| `deal.fi_product_removed` | F&I product removed from deal |
| `deal.payment_calculated` | Payment calculator used on a deal |

### Service Events (`ServiceEvent`)
| Event | When it fires |
|-------|--------------|
| `service.appointment_created` | Service appointment booked |
| `service.appointment_completed` | Appointment completed |
| `service.appointment_no_show` | Customer no-show |
| `service.self_scheduled` | Customer booked online (self-service) |
| `service.ro_created` | Repair order opened |
| `service.ro_completed` | Repair order completed |
| `service.part_ordered` | Part ordered |
| `service.part_low_stock` | Part inventory below threshold |

### Comms Events (`CommsEvent`)
| Event | When it fires |
|-------|--------------|
| `comms.message_sent` | Email/SMS sent |
| `comms.message_opened` | Email opened |
| `comms.message_clicked` | Link clicked in message |
| `comms.message_bounced` | Message bounced |
| `comms.sequence_started` | Automated sequence started |
| `comms.sequence_completed` | Sequence completed all steps |
| `comms.template_created` | New message template created |

### Accounting Events (`AccountingEvent`)
| Event | When it fires |
|-------|--------------|
| `accounting.sale_logged` | Sale recorded in accounting |
| `accounting.commission_paid` | Commission paid out |
| `accounting.floor_plan_added` | Vehicle added to floor plan |
| `accounting.floor_plan_payoff` | Floor plan paid off |
| `accounting.exported` | GL data exported |

### Review Events (`ReviewEvent`)
| Event | When it fires |
|-------|--------------|
| `review.received` | New customer review ingested |
| `review.responded` | Response posted to review |
| `review.flagged` | Review flagged for attention |

### Retail Events (`RetailEvent`)
| Event | When it fires |
|-------|--------------|
| `retail.calculator_used` | Payment calculator used |
| `retail.credit_app_submitted` | Credit application submitted |
| `retail.credit_app_approved` | Credit application approved |

### Customer Events (`CustomerEvent`)
| Event | When it fires |
|-------|--------------|
| `customer.viewed_360` | Staff views customer 360 page |
| `customer.ltv_milestone` | Customer reaches LTV milestone |

### Lender Events (`LenderEvent`)
| Event | When it fires |
|-------|--------------|
| `lender.created` | Lender added to system |
| `lender.updated` | Lender info updated |
| `deal.lender_submitted` | Deal submitted to lender |
| `deal.lender_response` | Lender responds to submission |

### Credit Events (`CreditEvent`)
| Event | When it fires |
|-------|--------------|
| `credit.pulled` | Credit report pulled |
| `credit.consent_recorded` | Customer consent captured |

### Compliance Events (`ComplianceEvent`)
| Event | When it fires |
|-------|--------------|
| `compliance.check_run` | Compliance check executed |
| `compliance.check_reviewed` | Check result reviewed by staff |
| `compliance.check_overridden` | Check result overridden |

### Document Events (`DocumentEvent`)
| Event | When it fires |
|-------|--------------|
| `document.uploaded` | Document uploaded to vault |
| `document.signed` | Document signed |
| `document.deleted` | Document deleted |
| `document.analyzed` | Single document analyzed |
| `document.deal_jacket_analyzed` | Full deal jacket analyzed |

### Knowledge Events (`KnowledgeEvent`)
| Event | When it fires |
|-------|--------------|
| `knowledge.document_ingested` | Document added to knowledge base |
| `knowledge.queried` | Knowledge base searched |

---

## Tracking Helpers

Each event category has a typed helper function in `src/lib/analytics-hooks.ts`:

| Helper | Category |
|--------|----------|
| `trackDeal()` | Deal events |
| `trackService()` | Service events |
| `trackComms()` | Comms events |
| `trackAccounting()` | Accounting events |
| `trackReview()` | Review events |
| `trackRetail()` | Digital retail events |
| `trackCustomer()` | Customer events |
| `trackLender()` | Lender events |
| `trackCredit()` | Credit events |
| `trackCompliance()` | Compliance events |
| `trackDocument()` | Document events |
| `trackKnowledge()` | Knowledge events |

All helpers accept: `(event, dealer_id, metadata)`. Metadata is a `Record<string, string | number | boolean>`. Every call is fire-and-forget with swallowed errors.

---

## Analytics Engine

The analytics engine (`src/lib/analytics-engine.ts`) is the "brain" of the platform. It implements triple-write:

1. **In-memory buffer** -- events are buffered in memory for batch processing
2. **PostgreSQL** -- raw events stored for SQL queries and aggregation
3. **Qdrant** -- events are embedded as vectors for semantic search and similarity
4. **Neo4j** -- events are stored as a graph for relationship analysis

### Event Structure

```typescript
interface AnalyticsEvent {
  event_type: string;      // page_view, click, scroll, form_submit, chat_message
  action: string;          // submit_contact_form, click_inventory_card, etc.
  page: string;            // URL path where event occurred
  session_id: string;      // Session fingerprint
  user_fingerprint: string; // Anonymous user fingerprint (no PII)
  timestamp: string;       // ISO timestamp
  metadata: Record<string, unknown>;
}
```

### Behavioral Insights

The engine computes `BehavioralInsight` objects:

```typescript
interface BehavioralInsight {
  id: string;
  insight: string;         // Human-readable text for RAG retrieval
  category: string;        // conversion, engagement, search, navigation, chat
  confidence: number;      // 0-1
  sample_size: number;     // Number of events contributing
  generated_at: string;    // ISO timestamp
  data: Record<string, unknown>;
}
```

---

## Learning Aggregator

The learning aggregator (`src/lib/learning-aggregator.ts`) computes actionable insights from tracked events. It queries the database when available and falls back to realistic shadow data when not.

### Computed Insights (`LearningInsights`)

| Insight | Source Data | What it tells you |
|---------|------------|-------------------|
| `fi_attachment_rate` | Deal events | Percentage of deals with at least one F&I product |
| `avg_fi_per_deal` | Deal events | Average F&I revenue per deal (dollars) |
| `top_fi_products` | Deal events | Top 5 most-selected F&I products |
| `appointment_show_rate` | Service events | Percentage of appointments that are not no-shows |
| `avg_ro_value` | Service events | Average repair order total (dollars) |
| `parts_turn_rate` | Service events | Parts inventory turn rate (orders per week) |
| `email_open_rate` | Comms events | Email open rate (opened / sent) |
| `sms_response_rate` | Comms events | SMS response rate |
| `best_performing_template` | Comms events | Template with highest engagement |
| `optimal_follow_up_delay_hours` | Comms events | Optimal hours between follow-up messages |
| `avg_days_to_close` | Deal + Lead events | Average days from lead creation to deal close |
| `conversion_by_source` | Lead events | Conversion rate broken down by lead source |
| `top_salesperson` | Deal events | Top salesperson by total gross |
| `avg_rating` | Review events | Average review rating across all platforms |
| `response_rate` | Review events | Percentage of reviews responded to |
| `sentiment_trend` | Review events | "improving", "stable", or "declining" (30-day rolling comparison) |

### How It Works

1. `getLearningInsights(dealerId)` is called by the analytics learning API
2. If `DATABASE_URL` is set, it runs SQL queries against deals, service_appointments, repair_orders, reviews, and sales_log tables
3. If no database, it returns realistic shadow data
4. Results are served to the analytics dashboard and brain

### Shadow Insights (Default Values)

When running without a database, the aggregator returns these realistic defaults:

- F&I attachment rate: 78%
- Avg F&I per deal: $2,180
- Top products: extended warranty, GAP insurance, paint protection, tire/wheel, maintenance plan
- Appointment show rate: 87%
- Avg RO value: $654.07
- Email open rate: 42%
- Avg days to close: 5.2
- Average rating: 4.13
- Sentiment: improving

---

## Closed-Loop Architecture

The analytics and learning system forms a closed loop:

```
User Actions
    |
    v
Analytics Hooks (fire-and-forget)
    |
    v
Analytics Engine (triple-write: PG + Qdrant + Neo4j)
    |
    v
Learning Aggregator (computes insights from raw events)
    |
    v
Learning Insights (served to dashboards + API)
    |
    v
Actionable Intelligence (lead scoring, pricing recommendations, follow-up timing)
    |
    v
Better User Experience (faster follow-ups, smarter pricing, targeted comms)
    |
    v
More User Actions (loop repeats)
```

### How Data Compounds Over Time

1. **Week 1:** System uses shadow defaults. Baseline metrics visible.
2. **Month 1:** Real event data replaces shadow data. Initial patterns emerge (best lead sources, popular F&I products).
3. **Month 3:** Trend data becomes meaningful. Sentiment trends (improving/stable/declining) based on 30-day rolling averages. Lead source conversion rates stabilize.
4. **Month 6+:** System has deep knowledge of the dealer's patterns. Optimal follow-up timing is data-driven. Pricing recommendations reflect real turn rates. F&I product recommendations are based on actual attachment rates.

### Serverless Resilience

On Vercel (serverless), the in-memory event buffer resets on every cold start. To ensure the analytics brain always has data:

- **`hydrateBufferFromDb()`** loads the last 24 hours of events from PostgreSQL into the in-memory buffer on first access
- Hydration runs once per process — subsequent calls are no-ops
- Events are always persisted to PostgreSQL (fire-and-forget) so nothing is lost between cold starts
- The brain page calls hydration before generating insights

### Validation & Trend Tracking

- **Platform integrity validation** (`npm run validate`) runs 252 e2e tests across 7 suites
- **Nightly load test** (`npm run nightly:load-test`) runs k6 against production and compares to previous baseline
- Results logged to `.agenticqa/validation_history.jsonl` and `.agenticqa/load_test_history.jsonl`
- Sidebar section toggles and insight "view all" clicks feed into EventCollector for usage pattern analysis

### Integration Points

- **Lead Scorer** (`lead-scorer.ts`) uses behavioral signals to score purchase intent
- **Pricing Engine** (`pricing-engine.ts`) uses days-on-lot and market position for pricing recommendations
- **Funnel Health** (`funnel-health.ts`) uses lead pipeline data for health scoring and alerts
- **Compliance Scorer** (`compliance-scorer.ts`) uses dealer configuration and response time data
- **Document Analyzer** (`document-analyzer.ts`) feeds analysis results back into the compliance system
- **Sidebar Analytics** — section expand/collapse events tracked via EventCollector for navigation pattern analysis

---

## Platform Health — Self-Improving UX Monitoring

The platform monitors its own user experience through the Platform Health dashboard (`/admin/analytics/platform-health`). This closes the feedback loop between user behavior and product improvement.

**Friction Detection:** Aggregates rage clicks, dead clicks, and form abandonment events by page. Each hotspot is classified by severity (critical/high/medium/low) and compared week-over-week to track improvement trends.

**Feature Adoption:** Tracks usage of all 20 admin modules. Surfaces unused features for onboarding improvement or removal consideration.

**Form Health:** Measures start-to-completion rates for every form. Identifies the specific field that causes the most abandonment.

**Automated Recommendations:** Generates plain-English suggestions based on friction patterns, adoption gaps, bounce rates, and form health. Examples: "High rage clicks on Deal Desking page — a UI element may be unresponsive" or "Trade-In Wizard has 35% abandonment — mileage field may need an auto-estimate helper."

**Health Score:** Composite 0-100 score based on friction events, bounce rate, feature adoption, session depth, and trend direction.

---

## Related Documentation

- [Platform Map](./platform-map.md) -- analytics events per module
- [Compliance](./compliance.md) -- compliance rules and scoring
- [Architecture](./architecture.md) -- triple-write pattern, database schema

---

## Security Events

| Event | Trigger | What it feeds |
|-------|---------|--------------|
| `security.scan_completed` | After security scanner finishes | Scan frequency, finding trends |
| `security.rate_limit_triggered` | Any rate-limited route returns 429 | Attack pressure monitoring |
| `security.finding_resolved` | Finding marked resolved | Resolution velocity tracking |

**Tracking helper:** `trackSecurity(event, dealerId, metadata)`

---

## Analytics Persistence (March 28 fix)

Events are now written to the PostgreSQL `analytics_events` table as PRIMARY storage. Previously, events were only forwarded to Plausible (external analytics) which was not configured, causing all events to be silently dropped.

### How it works
1. `track()` in `analytics-hooks.ts` calls `persistEvent()` first (DB write)
2. Then calls `trackServerEvent()` second (Plausible, optional)
3. Both are fire-and-forget — neither can break the request
4. `persistEvent()` checks `DATABASE_URL` — skips in shadow mode

### Analytics Health Endpoint
`GET /api/admin/analytics/health` returns:
- `db_connected`: boolean
- `events_last_hour/day/week`: counts
- `modules_reporting`: which modules have fired events
- `modules_silent`: which modules haven't (potential pipeline break)
- `healthy`: true if events received in last 24 hours

### System Events
| Event | Trigger |
|-------|---------|
| `system.circuit_breaker_opened` | DB circuit breaker opens |
| `system.circuit_breaker_closed` | DB circuit breaker recovers |
| `system.health_check` | Health endpoint queried |
| `system.health_degraded` | System enters degraded state |
| `system.health_critical` | System enters critical state |
| `system.auto_rollback` | Auto-rollback triggers |

**Tracking helper:** `trackSystem(event, dealerId, metadata)`
