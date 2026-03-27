#!/bin/bash
# generate_secrets.sh — Generate production-safe secrets for wolfpack-auto.
#
# Usage:
#   bash scripts/generate_secrets.sh
#
# Copy the output into Vercel: Settings → Environment Variables
# NEVER commit these values to git.

set -euo pipefail

echo "=== Wolfpack Auto Production Secrets ==="
echo ""
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "PII_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo ""
echo "Add these to Vercel: Settings → Environment Variables"
echo "NEVER commit these to git."
echo ""
echo "─────────────────────────────────────────────────────"
echo "Set these manually from your service dashboards:"
echo "─────────────────────────────────────────────────────"
echo "DATABASE_URL=postgresql://...          # Neon → Connection → Pooled"
echo "NEXTAUTH_URL=https://yourdomain.com    # Your Vercel production domain"
echo "REDIS_URL=redis://...                  # Upstash → REST URL"
echo "DEALER_ID=<uuid>                       # Your dealer UUID from DB"
echo "RESEND_API_KEY=re_...                  # Resend → API Keys"
echo "RESEND_FROM_EMAIL=leads@yourdomain.com"
echo ""
echo "Use: vercel env add <NAME> to set them via CLI if preferred."
