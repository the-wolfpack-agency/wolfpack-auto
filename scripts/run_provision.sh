#!/bin/bash
# run_provision.sh
# Wrapper: ensures DATABASE_URL is set and runs the dealer provisioning script.
#
# Usage:
#   DATABASE_URL=<url> ./scripts/run_provision.sh \
#     --name "Summit Auto Group" \
#     --slug "summit-auto" \
#     --email "admin@summitauto.com" \
#     --phone "(303) 555-0100" \
#     --city "Denver" \
#     --state "CO"
#
# All extra arguments are forwarded to provision_dealer.ts verbatim.
# Pass --dry-run to print the SQL without touching the database.

set -e

cd "$(dirname "$0")/.."

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL must be set before running this script."
  echo ""
  echo "  export DATABASE_URL='postgresql://user:password@host/dbname?sslmode=require'"
  echo "  ./scripts/run_provision.sh --name \"My Dealer\" --slug my-dealer ..."
  exit 1
fi

# Confirm ts-node is available
if ! npx ts-node --version > /dev/null 2>&1; then
  echo "ERROR: ts-node is not available. Run: npm install --save-dev ts-node"
  exit 1
fi

exec npx ts-node scripts/provision_dealer.ts "$@"
