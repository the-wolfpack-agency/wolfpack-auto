# Mobile-first principle

Every user-facing surface in Wolfpack Auto must work on mobile. A dealer employee never needs a computer to do their job in the platform.

## Rules (enforced by CI)

1. Every E2E spec runs at three viewports: mobile portrait (390x844), tablet (768x1024), desktop (1440x900). All three must pass.
2. Every new admin or public page must render with no horizontal scroll at 390px viewport width.
3. Touch targets minimum 44x44px per WCAG.
4. Forms must work with mobile keyboards (input modes, autocomplete, autocapitalize set correctly).
5. Tables that would overflow on mobile must collapse to card layouts.
6. Hover-only interactions are forbidden. Every hover state must have a tap equivalent.

## Review checklist for any PR adding UI

- [ ] Renders on mobile portrait without horizontal scroll
- [ ] Touch targets >= 44x44px
- [ ] Forms use correct input modes
- [ ] Tables collapse to cards or have horizontal-scroll affordance
- [ ] No hover-only interactions
- [ ] E2E spec includes mobile viewport assertions

## Why this is a hard rule

Dealer employees split their time between desk, lot, and shop floor. A platform that requires a desktop is a platform employees only use at their desk. The product loses 60-70% of its potential use sessions when desktop-only.

This principle is non-negotiable. PRs that violate it fail review.
