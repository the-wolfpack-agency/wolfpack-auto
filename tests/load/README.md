# Load Tests

Uses [k6](https://k6.io) for load testing.

## Install
brew install k6  # macOS
# or: https://k6.io/docs/get-started/installation/

## Run smoke test (local dev)
k6 run tests/load/k6-smoke.js

## Run against shadow/staging
BASE_URL=http://localhost:3100 k6 run tests/load/k6-smoke.js

## Run lead submission stress test
k6 run tests/load/k6-leads.js

## Run inventory search under load
k6 run tests/load/k6-inventory-search.js

## CI / GitHub Actions
k6 run --out json=results.json tests/load/k6-smoke.js
