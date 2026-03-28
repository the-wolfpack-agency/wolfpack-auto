# Wolfpack Auto: The Intelligent Dealer Operating System

**A platform that learns from every interaction and gets smarter the longer you use it.**

---

## The Problem

Automotive dealers today run their businesses on technology built in the 1990s. The average dealership uses 8 to 12 disconnected software systems: one for inventory, another for leads, a third for service scheduling, a fourth for accounting, and so on. These systems don't talk to each other. Data sits in silos. When a customer walks in for an oil change, the service advisor has no idea that the same customer browsed three SUVs on the website last night and submitted a trade-in estimate this morning.

This fragmentation costs dealers real money:

- **Lost revenue.** Sales opportunities fall through the cracks because lead data doesn't flow to the service department, and service data doesn't flow back to sales.
- **Compliance risk.** Regulatory requirements (Truth in Lending, FCRA, OFAC, Red Flags Rule) are managed through manual checklists and tribal knowledge. When something is missed, the dealership is liable.
- **Operational drag.** Staff spend hours re-entering data across systems, reconciling numbers, and generating reports that should take seconds.
- **Zero learning.** Nothing the dealership does today makes the system better tomorrow. Every deal, every appointment, every customer interaction is a one-time event that vanishes into a database row.

The industry needs a platform that unifies every dealership operation into a single system and then does something no legacy platform can: learn from the data and improve over time.

---

## The Solution

Wolfpack Auto is a Dealer Operating System built from the ground up as a single, unified platform. Every module shares the same data layer. Every user action feeds a central intelligence engine. The platform covers the full scope of dealership operations:

**Sales and Customer Management.** Lead capture across every channel (website, chat, phone, walk-in, third-party). Behavioral scoring that ranks leads by purchase intent based on 30+ signals. Pipeline tracking from first contact through delivery. Customer 360 views that combine purchase history, service records, communication logs, and behavioral data into one screen.

**Deal Structuring and F&I.** Full deal desking with payment calculators for retail, lease, and cash transactions. F&I product menus (extended warranties, GAP coverage, paint protection, tire and wheel, maintenance plans) with one-click attachment and running totals. Gross profit breakdown: front-end, back-end, and total. Lender submission tracking across multiple portals. Credit bureau integration with FCRA consent enforcement.

**Service and Parts.** Appointment scheduling with technician assignment and bay management. Repair order creation with line items, labor tracking, and parts cost rollup. Parts inventory with automated low-stock alerts and reorder points. Service history tied to VIN, accessible from any screen in the platform. Customer-facing self-scheduling that feeds directly into the service department's queue.

**Accounting and Financial Operations.** Daily sales log with complete gross breakdown per deal. Commission tracking by pay period, role, and gross basis. Floor plan management with daily interest accrual and curtailment alerts. QuickBooks IIF, Sage CSV, and standard CSV export for general ledger integration.

**Compliance and Document Management.** Automated compliance checking against 20+ regulatory rules spanning TILA Regulation Z, FCRA, ECOA, the FTC Used Car Rule, GLBA, and federal odometer disclosure requirements. Deal jacket readiness scoring that tells the F&I manager exactly which documents are missing, unsigned, or non-compliant before attempting to fund. OFAC screening and Red Flags Rule verification with audit trails. Document vault with e-signature capture and per-document compliance scoring.

**Marketing and Communications.** Email and SMS templates with variable personalization. Follow-up sequences triggered by events (new lead, appointment set, post-sale). Message delivery tracking with open rates, click rates, and bounce monitoring. Multi-platform review aggregation (Google, Yelp, Facebook) with response templates and sentiment tracking.

**Multi-Location and OEM Operations.** Multi-rooftop architecture with dealer groups and cross-location analytics. OEM program management with certification tracking, brand compliance scoring, and cross-dealer benchmarking. Network-level reporting across all locations.

---

## What Makes This Different

### The Learning Engine

Every interaction on the platform generates a structured event. Every deal closed, every appointment completed, every message opened, every review responded to, every credit pull executed. These events feed a learning aggregator that computes compound insights in real time:

- **F&I attachment rate** tells you which products sell and which don't, by salesperson, by vehicle type, by customer segment.
- **Optimal follow-up timing** shows you that leads who receive an SMS within 2 hours of inquiry convert at 3x the rate of leads who receive email the next morning.
- **Service show rate** reveals which appointment types have the highest no-show rates, so you can adjust reminder cadences.
- **Average repair order value** trends by technician, by service type, by day of week.
- **Review sentiment trajectory** correlates customer satisfaction with specific deal experiences and service interactions.

The platform doesn't just store data. It watches how the data moves, measures what works, and surfaces the patterns that drive revenue. A dealership that has been on the platform for 90 days has a fundamentally different experience than one on day one, because the system has learned their business.

### Document Intelligence

The compliance engine doesn't wait for a human to notice a missing disclosure. Every document uploaded to the platform is analyzed against the applicable regulatory framework. A purchase agreement is checked for APR disclosure (TILA Reg Z §226.18), total finance charge, payment schedule, and buyer cancellation rights. A credit application is checked for FCRA authorization, ECOA notice, and GLBA privacy disclosure. Marketing materials are checked for trigger term compliance.

When a deal is ready for funding, the platform runs a jacket readiness check. It verifies that every required document is present, signed, and compliant. If something is missing or deficient, the F&I manager sees exactly what needs to be fixed, with the specific regulatory reference, before the deal goes to the lender.

### Knowledge Base

Every document ingested into the platform becomes searchable. A service advisor can query "What warranty coverage applies to the 2024 RAV4 drivetrain?" and get an answer drawn from the actual documents in the system. A compliance officer can search "FCRA consent requirements" and see every relevant disclosure, policy, and form. The knowledge base grows with the business.

### Shadow Mode Architecture

The entire platform operates in shadow mode: every API route returns realistic mock data when no database is connected. This means three things for the business:

1. **Demos never break.** A sales presentation works perfectly without provisioning infrastructure.
2. **Development velocity is unlimited.** Engineers can build and test features without a database dependency.
3. **Resilience is built in.** If the database goes down, the platform degrades gracefully instead of showing error pages.

---

## Technology

The platform is built on modern, proven infrastructure:

- **Next.js 15** on Vercel for the application layer
- **PostgreSQL** (Neon) with row-level security for multi-tenant data isolation
- **Qdrant** vector database for knowledge base and semantic search
- **Sentry** for real-time error monitoring with source maps, session replay on errors, and CSP-compliant browser reporting
- **Resend** for transactional email (lead notifications, customer confirmations, inventory alerts)
- **PII encryption** using AES-256-GCM for all customer data at rest (emails, phone numbers)
- **2,400+ automated tests** including true integration tests that authenticate as real users and verify database writes end-to-end
- **GitHub Actions** running a 4-phase CI pipeline on every commit: preflight validation, security scanning, quality testing, and shadow mode verification
- **Zero-token security scanner** with 298 patterns across 5 languages, analyzing 10 OWASP categories
- **Circuit breaker** on database connections: after 3 consecutive failures, the platform automatically switches to shadow data and recovers after 30 seconds, so users never see error pages
- **Safe-fetch wrapper** with 10-second timeouts and automatic retry for all external HTTP calls
- **System health dashboard** monitoring all dependencies (database, cache, email, error tracking, analytics) in real-time with auto-refresh
- **Auto-rollback script** for failed deployments: detects unhealthy state and reverts to the last known-good release
- **Analytics event persistence** to PostgreSQL: every user action is durably stored with module attribution, powering the learning engine directly

A nightly mutation testing suite intentionally injects 6 different types of code defects, verifies the test suite catches each one, and reports whether the safety net is intact. A separate nightly pentest suite runs 126 automated penetration tests covering IDOR, authentication bypass, business logic abuse, injection attacks, API abuse, data exposure, and file upload security. The engineering team knows, every morning, that both the deploy pipeline and the security posture are functioning correctly.

The built-in security scanner runs without any external API calls or tokens. It checks for hardcoded secrets, missing rate limiting, input validation gaps, SSRF vectors, SQL injection risk, and sensitive data exposure across every source file. Results are surfaced in the admin portal's Security dashboard, and every rate limit trigger feeds the learning system so the platform tracks which endpoints are under pressure.

---

## Market Opportunity

The automotive dealer management system market generates approximately $4.2 billion in annual revenue (2024). The market is dominated by legacy platforms that were architected before cloud computing, before mobile, and before machine learning. Dealers are locked into multi-year contracts with providers whose technology has not meaningfully evolved in over a decade.

The shift to cloud-native, AI-powered platforms is accelerating. Dealers under 45 years old are increasingly unwilling to accept the status quo. They want software that works like the consumer applications they use every day: fast, intuitive, and intelligent.

Wolfpack Auto enters this market with a platform that matches the incumbents feature-for-feature on day one and then pulls ahead every day after, because the learning engine creates a compounding advantage that static platforms cannot replicate.

---

## Business Model

The platform operates on a SaaS subscription model with three tiers:

| Tier | Target | Includes |
|------|--------|----------|
| **Starter** | Independent dealers (1-2 locations) | Core CRM, inventory, service, basic analytics |
| **Professional** | Multi-rooftop groups (3-10 locations) | Full DOS, F&I, compliance, learning engine, cross-location analytics |
| **Enterprise** | Large dealer groups and OEMs | Custom integrations, dedicated support, network-level intelligence, white-label options |

Additional revenue from:
- **Lender integrations** (per-submission fees)
- **Credit bureau pulls** (per-pull fees, passed through with margin)
- **Communication volume** (email/SMS beyond included tiers)
- **Professional services** (data migration, custom workflows, training)

---

## Traction

- **Platform built in 4 days** from zero to complete DOS with 55+ admin pages, 80+ API routes, and 2,400+ automated tests
- **Live client demo** completed successfully during build (March 27, 2026)
- **Production infrastructure live**: Neon PostgreSQL (46 tables), Sentry error monitoring (verified), Resend email (configured), PII encryption (AES-256-GCM)
- **Full regulatory compliance engine** covering TILA, FCRA, ECOA, FTC, GLBA with 20+ rules
- **35 database migrations** covering the complete data model
- **Closed-loop learning system** operational from day one, verified with 259+ events across 11 modules
- **4-layer deploy pipeline** ensuring production quality on every release
- **System health dashboard** with real-time dependency monitoring (database, email, error tracking, analytics pipeline)

---

## Team

The Wolfpack Auto platform was developed using a proprietary multi-agent software engineering pipeline that orchestrates specialized AI agents for security analysis, compliance verification, performance testing, and full-stack development. This approach enables the team to build, test, and harden software at a pace that traditional development teams cannot match.

Every new feature, every bug fix, and every compliance update goes through a rigorous automated pipeline before reaching production. The platform improves continuously without scaling the engineering team linearly.

---

## The Ask

We are raising capital to:

1. **Connect production integrations** (lender portals, credit bureaus, DMS data feeds, payment processing)
2. **Onboard first 10 dealer clients** with white-glove migration from legacy systems
3. **Build the sales team** to execute on a pipeline of interested dealers
4. **Expand the learning engine** with predictive models for inventory pricing, lead conversion, and service demand forecasting

The automotive dealer technology market is ripe for disruption. The incumbents are slow, fragmented, and unable to deliver intelligence. Wolfpack Auto is the platform that dealers have been waiting for.

---

*For more information, contact the Wolfpack Auto team.*

### Client Onboarding

A new dealer can be fully onboarded in under 4 hours:
- 15 minutes to provision infrastructure
- 15-60 minutes to import inventory
- 30-60 minutes for training
- Go-live same day

The platform requires no custom development per client. Configuration is done entirely through the admin portal and environment variables. Every dealer gets the same software with the same learning engine, but their data, branding, and settings are completely isolated.
