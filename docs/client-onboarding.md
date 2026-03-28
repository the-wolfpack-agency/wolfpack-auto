# Client Onboarding Guide

Everything a new dealer client needs to go live on Wolfpack Auto.

---

## Pre-Onboarding Checklist (What We Need From the Client)

### Required Before Day 1
| Item | Who Provides | Example |
|------|-------------|---------|
| Dealership name | Client | "Summit Auto Group" |
| Street address, city, state, ZIP | Client | "4500 W Colfax Ave, Denver, CO 80204" |
| Phone number | Client | (303) 555-0100 |
| Email address | Client | info@summitautogroup.com |
| Logo (PNG, JPG, or SVG, up to 2MB) | Client | summit-logo.png |
| Primary brand color (hex) | Client | #0070C7 |
| Sales hours (Mon-Sun) | Client | Mon-Fri 9-7, Sat 9-5, Sun 12-5 |
| Domain name (if custom) | Client | www.summitautogroup.com |

### Required Before Going Live
| Item | Who Provides | Notes |
|------|-------------|-------|
| Vehicle inventory (CSV, JSON, or DMS feed) | Client | Can be imported via admin portal or DMS integration |
| Admin user email + name | Client | For the primary admin account |
| DMS provider (if any) | Client | For automated inventory sync |
| Insurance certificate | Client | Required before listing vehicles |

### Optional (Enables Additional Features)
| Item | Feature It Enables | Notes |
|------|-------------------|-------|
| Lender portal credentials | Deal submission to lenders | Client gets from their lender rep |
| Credit bureau agreement | Credit pulls | Client signs with 700Credit/Equifax |
| Google Business Profile access | Review aggregation | For pulling Google reviews |
| Social media accounts | Review management | Yelp, Facebook pages |
| Stripe account | Online payments/billing | For customer-facing transactions |
| Twilio account | SMS automation | For text message follow-ups |

---

## Onboarding Steps (What We Do)

### Step 1: Provision the Dealer (15 minutes)
1. Create Neon database branch for the dealer (or add to existing)
2. Run migrations: `npm run db:migrate`
3. Seed dealer record with their info
4. Set environment variables in Vercel:
   - `DEALER_ID` — the dealer's UUID
   - `DEALER_NAME` — display name
   - `DATABASE_URL` — already set (shared or per-dealer)

### Step 2: Configure Branding (10 minutes)
1. Log in to admin portal as the dealer admin
2. Navigate to Settings → upload logo, set colors, set hours
3. Preview the public site to confirm branding looks correct

### Step 3: Import Inventory (15-60 minutes)
Option A: **Manual entry** — use Add Vehicle in admin portal
Option B: **CSV upload** — upload via Intake page
Option C: **DMS feed** — configure in Settings → Integrations

### Step 4: Create Admin Users (5 minutes)
1. Navigate to Settings → Team
2. Add admin users with email addresses
3. Each user receives an email to set up their password + MFA

### Step 5: Configure Integrations (as needed)
| Integration | Where to Configure | Time |
|------------|-------------------|------|
| Email notifications | Vercel env: `RESEND_API_KEY` | 2 min |
| SMS automation | Vercel env: `TWILIO_*` vars | 5 min |
| Lender portals | Admin → Lenders | 10 min per lender |
| Credit bureau | Vercel env: `CREDIT_BUREAU_*` | 5 min |
| Custom domain | Vercel → Settings → Domains | 10 min |

### Step 6: Training (30-60 minutes)
Walk the client through:
- Dashboard overview and key metrics
- Lead management workflow
- Inventory management
- Deal desking basics
- Service scheduling
- Reports and exports

### Step 7: Go Live
1. Point domain to Vercel (DNS update)
2. Verify SSL certificate (automatic via Vercel)
3. Run the pre-deploy gate: `npm run predeploy`
4. Client confirms the public site looks correct
5. Enable in production

---

## Post-Launch Support

### First 7 Days
- Daily check of analytics health: `/admin/system`
- Monitor lead flow and conversion
- Address any UI/UX feedback
- Verify email/SMS delivery

### First 30 Days
- Review analytics insights at `/admin/analytics-brain`
- Adjust follow-up sequence timing based on learning data
- Review compliance scores
- First monthly report

### Ongoing
- Platform learns and improves automatically
- Monthly analytics review recommended
- Quarterly compliance audit via `/admin/compliance`
- Update inventory and pricing as needed

---

## Environment Variables Reference

### Required
| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...@neon.tech/...` |
| `NEXTAUTH_SECRET` | Session encryption key | `openssl rand -base64 32` |

### Recommended
| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Email delivery (lead notifications) |
| `SENTRY_DSN` | Error monitoring |
| `DEMO_MODE` | Set to `"true"` to enable demo login |

### Optional
| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Production rate limiting |
| `TWILIO_ACCOUNT_SID` | SMS automation |
| `TWILIO_AUTH_TOKEN` | SMS automation |
| `TWILIO_PHONE_NUMBER` | SMS sender number |
| `STRIPE_SECRET_KEY` | Payment processing |
| `QDRANT_URL` | Knowledge base vector store |
| `CREDIT_BUREAU_API_KEY` | Credit pulls |
| `CRON_SECRET` | Secure cron endpoint access |
| `WEBHOOK_SECRET` | DMS webhook signature verification |

---

## Frequently Asked Questions

**Q: How long does onboarding take?**
A: Typically 2-4 hours for a basic setup. Full integration with lenders and credit bureau adds 1-2 days for credential provisioning.

**Q: Can we use our existing domain?**
A: Yes. Point your DNS to Vercel and add the domain in project settings. SSL is automatic.

**Q: What if our DMS isn't supported?**
A: The platform supports CSV, JSON, and XML import. Any DMS that can export to these formats works. Custom integrations can be built.

**Q: Is our data isolated from other dealers?**
A: Yes. Every database query is scoped by dealer_id. Row-level security policies enforce isolation at the database level.

**Q: What happens if the database goes down?**
A: The platform has a circuit breaker that automatically switches to shadow data within seconds. Users see cached/default data instead of error pages. The system self-recovers when the database comes back.

**Q: How do we get support?**
A: Contact the Wolfpack Auto team. The system health dashboard at `/admin/system` provides real-time status of all dependencies.
