# Wolfpack Auto — Infrastructure Cost Report

**Prepared for:** Hoxsie / Wolfpack Agency
**Date:** March 29, 2026
**Purpose:** Complete monthly cost breakdown for production deployment and scaling

---

## Executive Summary

Wolfpack Auto is designed with graceful degradation — every service falls back gracefully if unavailable. The platform runs for **$0/month in demo mode** and scales incrementally as dealer count grows. No big-bang infrastructure spend required.

| Stage | Dealers | Monthly Cost | What You Get |
|-------|---------|-------------|-------------|
| Demo (now) | 0 | **$0** | Full platform on free tiers, DEMO_MODE |
| Launch | 1-3 | **$130-250** | Production database, email, error monitoring |
| Growth | 5-20 | **$400-600** | + SMS, caching, analytics, image storage |
| Scale | 50-100 | **$1,500-2,500** | + search engine, AI features, dedicated infra |
| Enterprise | 100+ | **$3,000-5,000** | Full stack, dedicated support, HA |

---

## Phase 1: Launch (1-3 Dealers) — $130-250/mo

These are the only services needed to go live with real customer data.

| Service | What It Does | Monthly Cost | Notes |
|---------|-------------|-------------|-------|
| **Neon PostgreSQL** | All dealer data, leads, deals, inventory, analytics | $50-150 | Free tier covers dev; Pro starts at $19/mo, scales with compute |
| **Vercel Pro** | Hosting, eliminates cold starts, custom domains | $20 | Per-seat pricing; needed for production performance |
| **Resend** | Lead notification emails, customer confirmations | $20-50 | Free tier: 100 emails/day; Pro: $20/mo for 50k/mo |
| **Sentry** | Error monitoring, crash reporting, source maps | $29 | Team plan; free tier covers 5k events/mo |
| **Custom Domain** | wolfpackauto.com or dealer-specific domain | $12/year | One-time via any registrar |

**Total: ~$130-250/mo**

### What's NOT needed yet (free fallbacks active)

| Service | Fallback | When to Add |
|---------|----------|-------------|
| Redis | In-memory rate limiting | When concurrent users exceed 50 |
| Elasticsearch | PostgreSQL keyword search | When inventory exceeds 5,000 vehicles |
| Cloudflare R2 | No image uploads yet | When dealers upload vehicle photos |
| Twilio | No SMS | When dealers want text message campaigns |
| OpenAI | Local trigram embeddings | When AI listing generation is needed |
| Qdrant | Disabled | When knowledge base / semantic search is needed |

---

## Phase 2: Growth (5-20 Dealers) — $400-600/mo

Add these as dealer count and traffic grow.

| Service | What It Does | Monthly Cost | Trigger to Add |
|---------|-------------|-------------|---------------|
| **Everything from Phase 1** | | $130-250 | |
| **Cloudflare R2** | Vehicle photo storage, document vault | $10-30 | First dealer uploads photos |
| **Redis (Upstash)** | Production rate limiting, session cache | $10-20 | Traffic exceeds 50 concurrent users |
| **Twilio** | SMS for lead follow-up, appointment reminders | $50-100 | Dealer requests SMS campaigns |
| **Plausible Analytics** | Privacy-friendly website analytics (no cookies) | $9-19 | Marketing team wants traffic data |
| **Resend upgrade** | Higher email volume | $50 | Email volume exceeds 50k/mo |
| **Sentry upgrade** | More error events, session replay | $50 | Error volume exceeds 5k/mo |

**Total: ~$400-600/mo**

---

## Phase 3: Scale (50-100 Dealers) — $1,500-2,500/mo

Professional infrastructure for multi-location dealer groups.

| Service | What It Does | Monthly Cost | Why Now |
|---------|-------------|-------------|---------|
| **Everything from Phase 2** | | $400-600 | |
| **Neon Pro (scaled)** | Dedicated compute, connection pooling | $200-500 | Database connections from 50+ dealers |
| **Elasticsearch** | Sub-50ms inventory search across all dealers | $95-200 | Inventory exceeds 10k vehicles total |
| **Qdrant Cloud** | Vector search for knowledge base | $25-50 | Knowledge base and semantic search active |
| **OpenAI API** | AI vehicle listing generation, smart descriptions | $20-50 | Dealers want auto-generated listings |
| **Vercel Pro (team)** | Multiple team members, preview deployments | $20/seat | Engineering team grows |

**Total: ~$1,500-2,500/mo**

---

## Phase 4: Enterprise (100+ Dealers) — $3,000-5,000/mo

Full enterprise stack with dedicated resources.

| Service | What It Does | Monthly Cost |
|---------|-------------|-------------|
| **Neon Enterprise** | Dedicated Postgres, read replicas | $500-1,000 |
| **Vercel Enterprise** | SLA, dedicated support, WAF | $500+ |
| **Elasticsearch Cloud** | Dedicated cluster, cross-dealer search | $150-300 |
| **Redis (Upstash Pro)** | High-throughput rate limiting | $50-100 |
| **Qdrant Cloud Pro** | Dedicated vector cluster | $50-100 |
| **Resend Business** | 100k+ emails/mo, custom domains per dealer | $100-200 |
| **Twilio** | High-volume SMS, MMS, WhatsApp | $200-500 |
| **Sentry Business** | Extended retention, performance monitoring | $80-200 |
| **OpenAI** | Batch listing generation, chat intelligence | $50-200 |
| **Plausible Business** | Per-dealer analytics, custom events | $50-100 |
| **Cloudflare Pro** | Advanced WAF, image optimization | $20-50 |
| **Neo4j Cloud** | Graph analytics for relationship modeling | $50-100 |

**Total: ~$3,000-5,000/mo**

---

## Third-Party Integrations (Future — Requires Partnerships)

These are not infrastructure costs — they're integration fees paid to access dealer industry APIs.

| Integration | What It Does | Estimated Cost | Timeline to Integrate |
|-------------|-------------|---------------|----------------------|
| **RouteOne** | Lender deal submission (required for F&I) | $50-200/mo per dealer | 3-6 months (partnership required) |
| **DealerTrack** | Alternative lender submission network | $50-200/mo per dealer | 3-6 months (partnership required) |
| **700Credit** | Credit bureau pulls (Equifax/TransUnion/Experian) | $5-15 per pull | 3-6 months (credentialing required) |
| **CDK/Reynolds DMS** | Inventory sync from existing dealer management systems | $100-500/mo per dealer | 6+ months (API access gated) |
| **Carfax / AutoCheck** | Vehicle history reports | $3-5 per report | 1-2 months |
| **KBB / Black Book** | Market pricing data for trade-in valuations | $200-500/mo | 2-3 months |

**Note:** These costs are per-dealer and would be passed through or included in the dealer's subscription price.

---

## One-Time Costs

| Item | Cost | Notes |
|------|------|-------|
| Custom domain registration | $12-50/year | wolfpackauto.com or similar |
| SSL certificate | $0 | Let's Encrypt (automated, free) |
| Playwright browsers | $0 | Open source, included in dev dependencies |
| k6 load testing | $0 | Open source CLI tool |

---

## Stripe Transaction Costs (Revenue-Based)

If using Stripe for dealer subscription billing:

| MRR | Stripe Fee (2.9% + $0.30) | Net After Fees |
|-----|---------------------------|----------------|
| $500/mo | ~$15 | $485 |
| $5,000/mo | ~$145 | $4,855 |
| $50,000/mo | ~$1,450 | $48,550 |

---

## Cost per Dealer (Unit Economics)

At different scales, the infrastructure cost per dealer:

| Dealers | Total Infra Cost | Cost per Dealer | Target Price per Dealer | Gross Margin |
|---------|-----------------|----------------|----------------------|-------------|
| 3 | $200/mo | $67 | $299-499/mo | 78-87% |
| 10 | $500/mo | $50 | $299-499/mo | 83-90% |
| 50 | $2,000/mo | $40 | $299-499/mo | 87-92% |
| 100 | $4,000/mo | $40 | $299-499/mo | 87-92% |

**SaaS-healthy margins at every scale.** Infrastructure costs grow sub-linearly because most services are shared (one Postgres, one ES cluster, one Sentry project).

---

## Current Production Status

| Service | Status | Current Tier | Monthly Cost |
|---------|--------|-------------|-------------|
| PostgreSQL (Neon) | Active | Free | $0 |
| Vercel | Active | Hobby (free) | $0 |
| Resend | Active | Free tier | $0 |
| Sentry | Active | Free tier | $0 |
| PII Encryption | Active | Built-in (AES-256-GCM) | $0 |
| Redis | Not configured | In-memory fallback | $0 |
| Elasticsearch | Not configured | Postgres fallback | $0 |
| Twilio | Not configured | Disabled | $0 |
| Stripe | Not configured | Disabled | $0 |
| Qdrant | Not configured | Disabled | $0 |
| OpenAI | Not configured | Local fallback | $0 |
| **Current total** | | | **$0/mo** |

---

## Recommended Next Steps (In Order)

1. **Vercel Pro** ($20/mo) — eliminates cold starts, adds custom domain support
2. **Neon Pro** ($19-50/mo) — production database with connection pooling
3. **Custom domain** ($12/year) — professional URL for dealer demos
4. **Resend Pro** ($20/mo) — enable real email notifications
5. **Sentry Team** ($29/mo) — production error monitoring with alerting

**Day 1 total to go live: ~$100/mo**

Everything else can be added incrementally as specific dealers request features (SMS, AI listings, credit pulls, etc.).

---

*Report generated from codebase analysis of wolfpack-auto (commit 21f63ff).*
*All prices based on published pricing as of March 2026.*
*Run `python3 scripts/product_audit.py` for latest product health score.*
