# Database Backup and Restore Runbook

This runbook covers backup and recovery procedures for the Wolfpack Auto
PostgreSQL database hosted on Neon (or any compatible PostgreSQL provider).

---

## Recovery Objectives

| Metric | Target | Method |
|---|---|---|
| Recovery Time Objective (RTO) | ~30 minutes | Neon PITR branch promotion |
| Recovery Point Objective (RPO) | ~5 minutes | Neon continuous WAL shipping |
| Manual restore RTO | ~60 minutes | `restore_neon.sh` from local backup |
| Manual restore RPO | Time of last manual backup | `backup_neon.sh` on schedule |

---

## Backup Methods

Two complementary approaches are used:

1. **Neon built-in PITR** — continuous, automatic, no action required. Provides the best RPO.
2. **Manual `pg_dump` backups** — portable `.sql.gz` files stored locally or in object storage. Required before every migration and as a weekly safety net.

---

## Method 1: Neon Point-in-Time Recovery (PITR)

Neon continuously ships WAL (Write-Ahead Log) to object storage, enabling
recovery to any second within your retention window.

### How it works

- Neon captures a base snapshot of your database on project creation.
- Continuous WAL streaming provides near-zero RPO (typically under 5 minutes lag).
- The Neon console allows branch creation from any historical point.
- Retention window: depends on your Neon plan (Free: 7 days, Pro: 30 days).

### When to use PITR

- Accidental data deletion or corruption.
- Rolling back a bad migration.
- Recovering from an application bug that wrote bad data.
- Creating a point-in-time snapshot for audit or debugging purposes.

### Recovery procedure (Neon PITR)

**Step 1:** Open the Neon console at `https://console.neon.tech`.

**Step 2:** Select your project and navigate to **Branches**.

**Step 3:** Click **Create Branch** and choose:
- **Branch from**: your primary branch (e.g. `main`)
- **Point in time**: select the date and time to recover to

**Step 4:** Note the connection string for the new branch. Verify the data:

```bash
psql "<new-branch-connection-string>" -c "SELECT count(*) FROM dealers;"
psql "<new-branch-connection-string>" -c "SELECT count(*) FROM vehicles;"
```

**Step 5:** If the branch looks correct, promote it or update your application's
`DATABASE_URL` to point to the recovery branch.

For a full branch promotion, use the Neon CLI:

```bash
# Install Neon CLI
npm install -g neonctl

# Set the recovery branch as primary
neonctl branches set-primary <recovery-branch-name> --project-id <project-id>
```

**Step 6:** Update the `DATABASE_URL` in Vercel:

```bash
vercel env rm DATABASE_URL production
vercel env add DATABASE_URL production
# Paste the new connection string when prompted

vercel --prod  # redeploy to pick up new env
```

**Estimated RTO with Neon PITR: 20-30 minutes.**

---

## Method 2: Manual Backup with `backup_neon.sh`

Portable `pg_dump` backups stored as `.sql.gz` files. These are your safety
net and are required before every schema migration.

### Create a backup

```bash
DATABASE_URL="postgresql://..." ./scripts/backup_neon.sh

# Optional: specify output directory
DATABASE_URL="postgresql://..." ./scripts/backup_neon.sh ./backups/pre-migration
```

Output: `./backups/wolfpack_backup_YYYYMMDD_HHMMSS.sql.gz`

### Backup before every migration

```bash
# Always run this before ./scripts/migrate.sh
DATABASE_URL="$DATABASE_URL" ./scripts/backup_neon.sh ./backups/pre-migration

# Then apply migrations
DATABASE_URL="$DATABASE_URL" ./scripts/migrate.sh
```

### Offsite storage (recommended)

After each backup, copy to a cloud bucket for durability:

```bash
# Vercel Blob (via CLI)
npx vercel blob upload ./backups/wolfpack_backup_20260327_120000.sql.gz

# AWS S3
aws s3 cp ./backups/wolfpack_backup_20260327_120000.sql.gz \
  s3://wolfpack-backups/db/

# Cloudflare R2
rclone copy ./backups/wolfpack_backup_20260327_120000.sql.gz \
  r2:wolfpack-backups/db/
```

### Backup retention policy

| Backup type | Keep for | Notes |
|---|---|---|
| Pre-migration | 90 days | Keep until migration is confirmed stable |
| Daily automated | 30 days | Delete older than 30 days automatically |
| Weekly | 6 months | Keep one per week for longer-term recovery |
| Monthly | 1 year | Keep one per month |

Prune old backups:

```bash
# Delete backups older than 30 days
find ./backups -name "wolfpack_backup_*.sql.gz" -mtime +30 -delete
```

---

## Method 2: Restore from Manual Backup

### When to use

- Neon PITR is unavailable or the retention window has expired.
- You need to restore into a different environment (staging, local dev).
- You need a portable snapshot for a client or audit.

### Restore procedure

**Step 1:** Confirm which backup to restore:

```bash
ls -lht ./backups/wolfpack_backup_*.sql.gz | head -5
```

**Step 2:** Dry-run the restore target (verify the connection string):

```bash
psql "$DATABASE_URL" -c "\conninfo"
```

**Step 3:** Run the restore:

```bash
DATABASE_URL="<target-url>" ./scripts/restore_neon.sh \
  ./backups/wolfpack_backup_20260327_120000.sql.gz
```

The script will ask you to type `yes` to confirm before making any changes.
It streams the decompressed SQL directly into `psql` with `ON_ERROR_STOP=1`.

**Step 4:** Verify the restore:

```bash
psql "$DATABASE_URL" -c "SELECT count(*) FROM dealers;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM vehicles;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM leads;"
```

**Step 5:** If restoring to production, update `DATABASE_URL` in Vercel and
redeploy (same as Neon PITR Step 6 above).

**Estimated RTO with manual restore: 45-60 minutes.**

---

## Backup Schedule Recommendation

| Trigger | Action | Method |
|---|---|---|
| Before every migration | Manual backup | `./scripts/backup_neon.sh ./backups/pre-migration` |
| Daily at 02:00 UTC | Automated backup | Vercel Cron Job (see below) |
| Weekly (Sunday) | Offload to cold storage | S3/R2 lifecycle rule |
| New dealer provisioned | Snapshot | `./scripts/backup_neon.sh ./backups/pre-provision` |

### Automated daily backup via Vercel Cron

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/admin/backup",
      "schedule": "0 2 * * *"
    }
  ]
}
```

Implement `app/api/admin/backup/route.ts` to shell out to the backup script
or call `pg_dump` via a serverless function. Requires a machine with `pg_dump`
or a backup microservice — Vercel Functions are stateless so the output file
must be written directly to Vercel Blob or S3.

---

## Testing Your Backup and Restore

Test your backup procedure monthly on a staging database:

```bash
# 1. Back up production
DATABASE_URL="$PROD_DATABASE_URL" ./scripts/backup_neon.sh ./backups/test

# 2. Restore to staging
DATABASE_URL="$STAGING_DATABASE_URL" ./scripts/restore_neon.sh \
  ./backups/test/wolfpack_backup_<timestamp>.sql.gz

# 3. Verify row counts match
psql "$PROD_DATABASE_URL"    -c "SELECT count(*) FROM vehicles;" # baseline
psql "$STAGING_DATABASE_URL" -c "SELECT count(*) FROM vehicles;" # must match

# 4. Run smoke tests against staging
NEXT_PUBLIC_BASE_URL="https://staging.wolfpackauto.com" npm run test:e2e
```

---

## Troubleshooting

### `pg_dump: error: connection to server failed`

- Confirm `DATABASE_URL` is correct: `psql "$DATABASE_URL" -c "SELECT 1;"`
- Neon requires `?sslmode=require` in the connection string
- Check Neon project status at `https://console.neon.tech`

### Restore fails with `ERROR: relation already exists`

The target database already has tables. Options:

1. Use a fresh empty database for the restore.
2. Drop the existing schema first:

```bash
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
```

Then re-run `restore_neon.sh`.

### `gunzip: not in gzip format`

The backup file may be corrupted or was not created by `backup_neon.sh`. Verify:

```bash
file ./backups/wolfpack_backup_<timestamp>.sql.gz
# Expected: gzip compressed data
```

### Backup file is 0 bytes

`pg_dump` failed silently. Run manually to see the error:

```bash
pg_dump "$DATABASE_URL" --no-owner --no-acl --format=plain | head -5
```

Common cause: `DATABASE_URL` has a bad password or the Neon project is suspended.
