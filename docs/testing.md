# Testing Guide

## Commands

All test commands from `package.json`:

| Command | What it runs |
|---------|-------------|
| `npm test` | All Playwright tests (default config) |
| `npm run test:unit` | Jest unit tests (`jest --no-coverage`) |
| `npm run test:ui` | Playwright interactive UI mode |
| `npm run test:headed` | Playwright with visible browser |
| `npm run test:smoke` | Smoke tests only (`tests/smoke.spec.ts`) |
| `npm run test:shadow` | Shadow mode verification (`scripts/shadow-test.sh`) |
| `npm run test:e2e` | E2E tests with dedicated config (`tests/e2e/playwright.e2e.config.ts`) |
| `npm run test:predeploy` | Pre-deploy test suite (`playwright.predeploy.config.ts`) |
| `npm run predeploy` | Full pre-deploy gate (`scripts/predeploy-gate.sh`) -- type-check + lint + tests |
| `npm run predeploy:quick` | Quick pre-deploy gate (`scripts/predeploy-gate.sh --quick`) -- type-check + lint only |
| `npm run nightly:safety-check` | Nightly safety net (`scripts/nightly-safety-net-check.sh`) |

## Test File Inventory

### Smoke Tests
| File | What it covers |
|------|---------------|
| `tests/smoke.spec.ts` | Core platform smoke test -- verifies the app starts and key pages load |

### Page Tests (`tests/pages/`)
| File | What it covers |
|------|---------------|
| `homepage.spec.ts` | Homepage renders, hero section, navigation |
| `about.spec.ts` | About page content |
| `contact.spec.ts` | Contact page and form |
| `financing.spec.ts` | Financing page content |
| `inventory.spec.ts` | Inventory listing page |
| `inventory-expanded.spec.ts` | Inventory with expanded filters |
| `vdp.spec.ts` | Vehicle detail page (VDP) |
| `hero-search.spec.ts` | Hero search functionality |
| `dealer-subpages.spec.ts` | Dealer sub-page rendering |
| `dealer-subpages-full.spec.ts` | Full dealer sub-page verification |
| `analytics-brain.spec.ts` | Analytics brain page |
| `medium-impact.spec.ts` | Medium-impact page tests |
| `production-readiness.spec.ts` | Production readiness checks |

### API Tests (`tests/api/`)
| File | What it covers |
|------|---------------|
| `analytics-events.spec.ts` | Analytics event ingestion API |
| `analytics-insights.spec.ts` | Analytics insights API |
| `analytics-pipeline.spec.ts` | Full analytics pipeline |
| `analytics-tier2-signals.spec.ts` | Tier 2 analytics signals |
| `analytics-tier3-insights.spec.ts` | Tier 3 insight computation |
| `analytics-tier3-pipeline.spec.ts` | Tier 3 pipeline end-to-end |
| `analytics-tier3-signals.spec.ts` | Tier 3 signal types |
| `analytics-tier4-dataflow.spec.ts` | Tier 4 data flow verification |
| `analytics-chat-integration.spec.ts` | Chat + analytics integration |
| `analytics-datastore-verification.spec.ts` | Analytics data store verification |
| `chat.spec.ts` | Chat API |
| `contact.spec.ts` | Contact form API |

### Component Tests (`tests/components/`)
| File | What it covers |
|------|---------------|
| `chat.spec.ts` | Chat widget component |
| `mobile-menu.spec.ts` | Mobile menu component |

### E2E Tests (`tests/e2e/`)
| File | What it covers |
|------|---------------|
| `admin-crud-contract.spec.ts` | Admin CRUD operations contract |
| `admin-features-api.spec.ts` | Admin feature API contracts |
| `admin-workflow.spec.ts` | Admin workflow end-to-end |
| `auth-flow.spec.ts` | Authentication flow |
| `buyer-journey.spec.ts` | Customer buyer journey |
| `customer-journey.spec.ts` | Full customer journey |
| `customer360.spec.ts` | Customer 360 view |
| `data-integrity.spec.ts` | Data integrity checks |
| `deals-fi.spec.ts` | Deal desking and F&I flow |
| `digital-retail.spec.ts` | Digital retail tools |
| `document-compliance.spec.ts` | Document compliance analysis |
| `document-vault.spec.ts` | Document vault operations |
| `comms-automation.spec.ts` | Communications automation |
| `compliance-checks.spec.ts` | Compliance check flow |
| `credit-bureau.spec.ts` | Credit bureau integration |
| `floor-plan.spec.ts` | Floor plan operations |
| `form-validation.spec.ts` | Form validation rules |
| `lender-portal.spec.ts` | Lender portal flow |
| `mfa-flow.spec.ts` | MFA setup and verification |
| `oem-portal.spec.ts` | OEM portal operations |
| `pii-and-security.spec.ts` | PII handling and security |
| `public-flows.spec.ts` | Public page flows |
| `reviews.spec.ts` | Review management flow |
| `security-contracts.spec.ts` | Security contract verification |
| `service-booking.spec.ts` | Service booking flow |
| `service-parts.spec.ts` | Service and parts operations |
| `trade-in-wizard.spec.ts` | Trade-in wizard flow |
| `accounting.spec.ts` | Accounting operations |
| `accounting-export.spec.ts` | Accounting export |
| `full-platform-smoke.spec.ts` | Full platform smoke test |

### E2E Flow Tests (`tests/e2e/flows/`)
| File | What it covers |
|------|---------------|
| `accounting-flows.spec.ts` | Accounting workflow flows |
| `comms-flows.spec.ts` | Communications flows |
| `compliance-floor-plan-flows.spec.ts` | Compliance + floor plan flows |
| `deal-desking-flows.spec.ts` | Deal desking flows |
| `document-flows.spec.ts` | Document management flows |
| `inventory-leads-flows.spec.ts` | Inventory + leads flows |
| `lender-credit-flows.spec.ts` | Lender + credit flows |
| `review-customer-flows.spec.ts` | Review + customer flows |
| `service-flows.spec.ts` | Service department flows |
| `settings-admin-flows.spec.ts` | Settings + admin flows |

### E2E UI Element Tests (`tests/e2e/ui-elements/`)
| File | What it covers |
|------|---------------|
| `admin-elements.spec.ts` | Admin UI element presence |
| `public-elements.spec.ts` | Public UI element presence |

### Shadow Hardening Tests (`tests/shadow-hardening/`)
| File | What it covers |
|------|---------------|
| `accessibility.spec.ts` | Accessibility (WCAG) checks |
| `analytics-instrumentation.spec.ts` | Analytics event instrumentation |
| `api-health.spec.ts` | API health across all routes |
| `compliance-scoring.spec.ts` | Compliance scoring accuracy |
| `dependency-check.spec.ts` | Dependency audit |
| `email-delivery.spec.ts` | Email delivery in shadow mode |
| `ev-readiness.spec.ts` | EV-specific field support |
| `form-validation.spec.ts` | Form validation behavior |
| `funnel-health.spec.ts` | Funnel health metrics |
| `inventory-fallback.spec.ts` | Inventory shadow data fallback |
| `lead-scoring.spec.ts` | Lead scoring accuracy |
| `link-integrity.spec.ts` | Internal link integrity |
| `mobile-responsiveness.spec.ts` | Mobile responsive layout |
| `new-features.spec.ts` | New feature coverage |
| `new-features-coverage.spec.ts` | Extended new feature coverage |
| `oem-coverage.spec.ts` | OEM portal coverage |
| `performance-baseline.spec.ts` | Performance baseline metrics |
| `pricing-intelligence.spec.ts` | Pricing engine accuracy |
| `public-coverage.spec.ts` | Public page coverage |
| `route-health.spec.ts` | Route health across all routes |
| `security-headers.spec.ts` | Security header verification |
| `seo-structured-data.spec.ts` | SEO structured data |
| `seo-validation.spec.ts` | SEO validation |
| `trade-in.spec.ts` | Trade-in functionality |
| `trade-in-ui.spec.ts` | Trade-in UI |
| `unit-coverage.spec.ts` | Unit test coverage |
| `xss-injection.spec.ts` | XSS injection prevention |

### Shadow Hardening Auto-Generated Tests (`tests/shadow-hardening/auto/`)
Auto-generated tests for individual API routes -- one test file per route.

### Shadow Integration Tests (`tests/shadow/`)
| File | What it covers |
|------|---------------|
| `shadow-api.spec.ts` | Shadow mode API behavior |
| `shadow-auth.spec.ts` | Shadow mode auth |
| `shadow-integration.spec.ts` | Shadow mode integration |
| `shadow-multitenant.spec.ts` | Shadow mode multi-tenancy |
| `shadow-performance.spec.ts` | Shadow mode performance |
| `shadow-prerelease.spec.ts` | Pre-release shadow verification |
| `shadow-spotlight.spec.ts` | Spotlight feature in shadow mode |
| `shadow-visual.spec.ts` | Visual consistency in shadow mode |

### RLS Tests (`tests/rls/`)
| File | What it covers |
|------|---------------|
| `multi-tenant-isolation.spec.ts` | Row-level security isolation between tenants |

### Load Tests (`tests/load/`)
| File | What it covers |
|------|---------------|
| `k6-smoke.js` | k6 smoke load test |
| `k6-inventory-search.js` | k6 inventory search load test |
| `k6-leads.js` | k6 leads API load test |

### Unit Tests (`src/lib/__tests__/`)
| File | What it covers |
|------|---------------|
| `security-regressions.test.ts` | Security regression tests |
| `mfa.test.ts` | MFA library unit tests |

### Other Tests
| File | What it covers |
|------|---------------|
| `tests/uniform-features.spec.ts` | Uniform feature presence across dealer sub-pages |
| `tests/analytics-ui.spec.ts` | Analytics UI rendering |

---

## Pre-Deploy Gate

The pre-deploy gate (`npm run predeploy`) runs before every deployment. It executes:

1. **Type checking** -- `tsc --noEmit` to catch TypeScript errors
2. **Linting** -- `next lint` to enforce ESLint rules
3. **Test suite** -- Playwright tests to verify critical functionality

The quick version (`npm run predeploy:quick`) skips the test suite and runs only type-check + lint.

Script location: `scripts/predeploy-gate.sh`

---

## Nightly Safety Net

The nightly safety net (`npm run nightly:safety-check`) runs automated checks on a schedule to catch regressions:

- Verifies all routes return expected status codes
- Checks shadow mode data consistency
- Validates security headers
- Runs compliance scoring

Script location: `scripts/nightly-safety-net-check.sh`

---

## How to Add New Tests

### Adding a Playwright Test

1. Create a new `.spec.ts` file in the appropriate directory:
   - `tests/e2e/` for end-to-end flows
   - `tests/pages/` for page-level tests
   - `tests/api/` for API tests
   - `tests/shadow-hardening/` for shadow mode verification

2. Import Playwright test utilities:
   ```typescript
   import { test, expect } from "@playwright/test";
   ```

3. Use shared page checks from `tests/shared/page-checks.ts` for common assertions.

### Adding a Jest Unit Test

1. Create a `.test.ts` file alongside the module (e.g., `src/lib/__tests__/my-module.test.ts`)
2. Run with `npm run test:unit`

### Adding an API Route Test

For each new API route, create a corresponding test in `tests/shadow-hardening/auto/` that verifies:
- Route returns a response (not 500)
- Shadow mode data is valid
- Auth guard is enforced

---

## Related Documentation

- [Architecture](./architecture.md) -- shadow mode pattern, auth flow
- [API Reference](./api-reference.md) -- all API routes
- [Platform Map](./platform-map.md) -- what each module does
