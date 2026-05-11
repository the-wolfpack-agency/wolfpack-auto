/**
 * Structural tests for PreQualWizard.
 *
 * Without @testing-library/react in deps, we exercise structure by
 * server-rendering with different starting props + static markup
 * assertions. Real wizard behavior is covered by the Playwright E2E.
 */

import { renderToStaticMarkup } from "react-dom/server";
import PreQualWizard from "../PreQualWizard";

const DEALER_ID = "11111111-2222-3333-4444-555555555555";

describe("PreQualWizard", () => {
  test("renders step 1 fields by default", () => {
    const html = renderToStaticMarkup(
      <PreQualWizard dealerId={DEALER_ID} dealerName="ACME Motors" />,
    );
    expect(html).toContain('data-testid="prequal-wizard"');
    expect(html).toContain('data-testid="prequal-step-1"');
    expect(html).toContain('data-testid="prequal-input-name"');
    expect(html).toContain('data-testid="prequal-input-email"');
    expect(html).toContain('data-testid="prequal-input-phone"');
    expect(html).toContain('data-testid="prequal-input-vehicle"');
    expect(html).toContain('data-testid="prequal-step-1-continue"');
  });

  test("renders the four progress indicators", () => {
    const html = renderToStaticMarkup(
      <PreQualWizard dealerId={DEALER_ID} dealerName="ACME Motors" />,
    );
    expect(html).toContain('data-testid="prequal-step-1-indicator"');
    expect(html).toContain('data-testid="prequal-step-2-indicator"');
    expect(html).toContain('data-testid="prequal-step-3-indicator"');
    expect(html).toContain('data-testid="prequal-step-4-indicator"');
  });

  test("renders the dealer name", () => {
    const html = renderToStaticMarkup(
      <PreQualWizard dealerId={DEALER_ID} dealerName="ACME Motors" />,
    );
    expect(html).toContain("ACME Motors");
  });

  test("CTA button starts disabled (no name/email/vehicle filled)", () => {
    const html = renderToStaticMarkup(
      <PreQualWizard dealerId={DEALER_ID} dealerName="ACME Motors" />,
    );
    // The continue button is rendered with `disabled` since validation fails initially.
    expect(html).toMatch(
      /data-testid="prequal-step-1-continue"[^>]*disabled/,
    );
  });

  test("does not render step 2/3/4 markers before transition", () => {
    const html = renderToStaticMarkup(
      <PreQualWizard dealerId={DEALER_ID} dealerName="ACME Motors" />,
    );
    expect(html).not.toContain('data-testid="prequal-step-2"');
    expect(html).not.toContain('data-testid="prequal-step-3"');
    expect(html).not.toContain('data-testid="prequal-step-4"');
  });

  test("renders the soft-credit disclaimer footer", () => {
    const html = renderToStaticMarkup(
      <PreQualWizard dealerId={DEALER_ID} dealerName="ACME Motors" />,
    );
    expect(html).toContain("Soft credit check only");
    expect(html).toContain("No impact to your credit score");
  });
});
