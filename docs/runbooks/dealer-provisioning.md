# Dealer Provisioning Runbook

This runbook covers the end-to-end process for onboarding a new dealer onto
the Wolfpack Auto platform — from database record creation through subdomain
verification and initial inventory load.

---

## Quick Start

```bash
export DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"

./scripts/run_provision.sh \
  --name   "Summit Auto Group" \
  --slug   "summit-auto" \
  --email  "admin@summitauto.com" \
  --phone  "(303) 555-0100" \
  --city   "Denver" \
  --state  "CO"
```

That's it for a basic setup. Continue below for the full checklist.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| `DATABASE_URL` env var | Neon (or any PostgreSQL) connection string |
| Migrations applied | Run `./scripts/migrate.sh` first on a fresh database |
| `pg` npm package | `npm install pg` in `wolfpack-auto/` |
| `ts-node` installed | `npm install --save-dev ts-node` |
| Vercel CLI | `npm install -g vercel` for subdomain/domain steps |

Verify the DB is reachable before starting:

```bash
psql "$DATABASE_URL" -c "SELECT count(*) FROM dealers;"
```

---

## Step 1: Provision the dealer record

### Dry run first (recommended)

Always preview the SQL before executing:

```bash
./scripts/run_provision.sh \
  --name   "Summit Auto Group" \
  --slug   "summit-auto" \
  --email  "admin@summitauto.com" \
  --phone  "(303) 555-0100" \
  --city   "Denver" \
  --state  "CO" \
  --zip    "80203" \
  --address "500 Broadway" \
  --tagline "Denver's Trusted Auto Group" \
  --primary-color "#1a3c6b" \
  --dry-run
```

### Execute the provisioning

Remove `--dry-run` to write to the database:

```bash
./scripts/run_provision.sh \
  --name   "Summit Auto Group" \
  --slug   "summit-auto" \
  --email  "admin@summitauto.com" \
  --phone  "(303) 555-0100" \
  --city   "Denver" \
  --state  "CO" \
  --zip    "80203" \
  --address "500 Broadway" \
  --tagline "Denver's Trusted Auto Group" \
  --primary-color "#1a3c6b"
```

On success, the script prints:

```
  Name       : Summit Auto Group
  Dealer ID  : <uuid>
  Slug       : summit-auto
  Subdomain  : summit-auto.wolfpackauto.com
```

**Save the Dealer ID** — you will need it for subsequent steps.

### CLI argument reference

| Flag | Required | Description |
|---|---|---|
| `--name` | Yes | Dealer display name |
| `--slug` | Yes | URL slug (lowercase, hyphens only, must be unique) |
| `--email` | Yes | Primary contact email |
| `--phone` | Yes | Dealer phone number |
| `--city` | Yes | City |
| `--state` | Yes | Two-letter state abbreviation |
| `--zip` | No | ZIP code (default: `80201`) |
| `--address` | No | Street address |
| `--tagline` | No | Marketing tagline |
| `--primary-color` | No | Brand hex color (default: `#0070c7`) |
| `--dry-run` | No | Print SQL, do not execute |

---

## Step 2: Configure subdomain (Vercel)

The dealer's default URL is `{slug}.wolfpackauto.com`. Add it to your Vercel
project so the Next.js middleware can route requests correctly.

```bash
# Add the subdomain to Vercel
vercel domains add summit-auto.wolfpackauto.com

# Link it to your production deployment
vercel alias set <deployment-url> summit-auto.wolfpackauto.com
```

Verify routing:

```bash
curl -I https://summit-auto.wolfpackauto.com/
# Expect: HTTP/2 200
```

The middleware reads `app.current_dealer_id` from the `dealers.subdomain` column.
New dealers are active immediately after the INSERT.

---

## Step 3: Apply OEM migration (if OEM dealer)

For franchise dealers (Toyota, Ford, Honda, etc.) who participate in OEM
incentive programs:

```bash
# Run all migrations to include the OEM schema (004_oem_program_management.sql)
DATABASE_URL="$DATABASE_URL" ./scripts/migrate.sh
```

Then link the dealer to their OEM record:

```sql
-- Find the OEM id
SELECT id, name, brand_code FROM oems WHERE brand_code = 'TOYOTA';

-- Link the dealer
UPDATE dealers
SET oem_id = '<oem-uuid>', franchise_code = 'TMS-12345'
WHERE id = '<dealer-uuid>';
```

---

## Step 4: Add initial inventory

### Option A: Seed demo data (new dealer onboarding / testing)

```bash
psql "$DATABASE_URL" -f scripts/seed_demo_data.sql
```

This inserts 5 realistic vehicles and 3 sample leads for the demo dealer
(`wolfpack-motors`). Safe to run multiple times (uses `ON CONFLICT DO NOTHING`).

### Option B: Index real vehicles from a CSV/DMS

```bash
DEALER_ID=<dealer-uuid> npx ts-node scripts/index-vehicles.ts
```

### Option C: DMS feed (CDK, Reynolds, DealerTrack, Tekion)

Insert a `dms_feed_configs` record to activate automated syncing:

```sql
INSERT INTO dms_feed_configs (dealer_id, provider, endpoint_url, api_key, poll_interval_minutes, status)
VALUES ('<dealer-uuid>', 'CDK', 'https://api.cdkdrive.com/...', '<key>', 60, 'active');
```

---

## Step 5: Configure custom domain (optional)

For dealers who want `www.summitautogroup.com` instead of the subdomain:

```bash
# 1. Add domain to Vercel
vercel domains add www.summitautogroup.com

# 2. Record the DNS verification record shown by Vercel

# 3. Insert into dealer_domains
psql "$DATABASE_URL" <<'SQL'
INSERT INTO dealer_domains (dealer_id, domain, ssl_status, verified, dns_txt_record)
VALUES (
  '<dealer-uuid>',
  'www.summitautogroup.com',
  'provisioning',
  false,
  '<dns-txt-value-from-vercel>'
);
SQL

# 4. Have the dealer add the TXT record at their DNS registrar, then verify:
vercel domains verify www.summitautogroup.com

# 5. Mark verified in DB
psql "$DATABASE_URL" -c "
  UPDATE dealer_domains
  SET verified = true, ssl_status = 'active', ssl_expiry = now() + interval '90 days'
  WHERE domain = 'www.summitautogroup.com';
"
```

---

## Step 6: Verify

Run these checks after provisioning to confirm everything is working:

```bash
# 1. Dealer record exists
psql "$DATABASE_URL" -c "SELECT id, name, slug, subdomain, is_active FROM dealers WHERE slug = 'summit-auto';"

# 2. Subdomain responds
curl -s -o /dev/null -w "%{http_code}" https://summit-auto.wolfpackauto.com/
# Expected: 200

# 3. Inventory page renders (no blank/error page)
curl -s https://summit-auto.wolfpackauto.com/inventory | grep -c "<html"
# Expected: 1

# 4. Leads API responds
curl -s https://summit-auto.wolfpackauto.com/api/leads | python3 -m json.tool | head -5

# 5. RLS isolation — confirm vehicles are tenant-scoped
psql "$DATABASE_URL" -c "
  SET app.current_dealer_id = '<dealer-uuid>';
  SELECT count(*) FROM vehicles;
"
```

---

## Troubleshooting

### "slug already exists" error

A dealer with that slug was already provisioned (or a previous failed attempt
left a partial record). Check what's there:

```sql
SELECT id, name, slug, is_active, created_at FROM dealers WHERE slug = 'summit-auto';
```

If it's a failed partial record you want to remove:

```sql
DELETE FROM dealers WHERE slug = 'summit-auto' AND is_active = false;
```

Then re-run the provisioning script.

### DATABASE_URL not set

```bash
export DATABASE_URL="postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

For Neon: copy the connection string from your Neon project dashboard under
**Connection Details**.

### Subdomain returns 404

The Next.js middleware uses the `Host` header to look up the dealer. Check:

1. The Vercel domain assignment: `vercel domains ls`
2. The `dealers.subdomain` column matches the slug exactly: `SELECT subdomain FROM dealers WHERE slug = 'summit-auto';`
3. Vercel deployment is live: `vercel ls`

### Vehicles not showing on inventory page

Check RLS: the middleware must set `app.current_dealer_id` before querying.
Test with:

```sql
SET app.current_dealer_id = '<dealer-uuid>';
SELECT count(*) FROM vehicles WHERE dealer_id = '<dealer-uuid>';
```

If count is 0, vehicles haven't been loaded yet. Run Step 4.

### ts-node not found

```bash
npm install --save-dev ts-node typescript @types/node
```
