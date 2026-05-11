"use client";

import { useState, useMemo } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type Step = 1 | 2 | 3 | 4;

interface IdentityState {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  vehicle_interest_text: string;
}

interface CreditState {
  consent: boolean;
}

interface IncomeState {
  amount: string; // raw input
  cadence: "monthly" | "annual";
}

interface OfferSummary {
  lender_id: string;
  lender_name: string;
  max_amount_cents: number;
  apr_bps: number;
  term_months: number;
  expires_at: string;
  estimated_monthly_payment_cents: number;
  conditions: Record<string, string | number | boolean>;
}

interface OffersPayload {
  session_id: string;
  offers: OfferSummary[];
  offer_count: number;
  vehicle: { interest_text: string; estimated_price_cents: number };
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STEP_LABELS: Record<Step, string> = {
  1: "About you",
  2: "Soft credit check",
  3: "Income",
  4: "Your offers",
};

const TIER_LABEL: Record<string, string> = {
  super_prime: "Excellent credit",
  prime: "Good credit",
  near_prime: "Fair credit",
  subprime: "Building credit",
  deep_subprime: "Rebuilding credit",
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function fmtCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function fmtApr(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

interface Props {
  dealerId: string | null;
  dealerName: string;
}

export default function PreQualWizard({ dealerId, dealerName }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [identity, setIdentity] = useState<IdentityState>({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    vehicle_interest_text: "",
  });
  const [credit, setCredit] = useState<CreditState>({ consent: false });
  const [income, setIncome] = useState<IncomeState>({
    amount: "",
    cadence: "monthly",
  });
  const [creditResult, setCreditResult] = useState<{
    tier: string;
    score_range_min: number;
    score_range_max: number;
    is_mock: boolean;
    bureau_used: string;
  } | null>(null);
  const [offers, setOffers] = useState<OffersPayload | null>(null);
  const [continueToken, setContinueToken] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  /* ------------------ Validation ------------------ */
  const identityValid = useMemo(() => {
    return (
      identity.customer_name.trim().length >= 2 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.customer_email) &&
      identity.vehicle_interest_text.trim().length >= 1
    );
  }, [identity]);

  const incomeValid = useMemo(() => {
    const n = parseFloat(income.amount);
    return Number.isFinite(n) && n > 0;
  }, [income.amount]);

  /* ------------------ API helpers ------------------ */

  async function callJson(
    url: string,
    init: RequestInit,
  ): Promise<{ ok: boolean; status: number; data: unknown }> {
    const res = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  }

  /* ------------------ Step transitions ------------------ */

  async function submitStep1() {
    if (!dealerId) {
      setErrorBanner(
        "We could not detect a dealer. Please reach out so we can finish your pre-qualification.",
      );
      return;
    }
    setErrorBanner(null);
    setLoading(true);
    try {
      const { ok, data, status } = await callJson("/api/prequal/start", {
        method: "POST",
        body: JSON.stringify({
          dealer_id: dealerId,
          customer_name: identity.customer_name.trim(),
          customer_email: identity.customer_email.trim().toLowerCase(),
          customer_phone: identity.customer_phone.trim() || null,
          vehicle_interest_text: identity.vehicle_interest_text.trim(),
        }),
      });
      if (!ok || typeof data !== "object" || data === null) {
        setErrorBanner(
          status === 429
            ? "Too many attempts. Please try again in a few minutes."
            : "We could not start your pre-qualification. Please try again.",
        );
        return;
      }
      const payload = data as { session_id: string };
      setSessionId(payload.session_id);
      setStep(2);
    } finally {
      setLoading(false);
    }
  }

  async function submitStep2() {
    if (!sessionId) return;
    setErrorBanner(null);
    setLoading(true);
    try {
      const { ok, data, status } = await callJson(
        `/api/prequal/${sessionId}/credit`,
        { method: "POST", body: JSON.stringify({ consent: true }) },
      );
      if (!ok || typeof data !== "object" || data === null) {
        setErrorBanner(
          status === 429
            ? "Too many attempts. Please try again in a few minutes."
            : "We could not complete the soft credit check. Please try again.",
        );
        return;
      }
      const payload = data as {
        tier: string;
        score_range_min: number;
        score_range_max: number;
        bureau_used: string;
        is_mock: boolean;
      };
      setCreditResult(payload);
      setStep(3);
    } finally {
      setLoading(false);
    }
  }

  async function submitStep3() {
    if (!sessionId) return;
    setErrorBanner(null);
    setLoading(true);
    try {
      const amount = Math.round(parseFloat(income.amount) * 100);
      const { ok, data, status } = await callJson(
        `/api/prequal/${sessionId}/income`,
        {
          method: "POST",
          body: JSON.stringify({
            amount_cents: amount,
            cadence: income.cadence,
          }),
        },
      );
      if (!ok || typeof data !== "object" || data === null) {
        setErrorBanner(
          status === 429
            ? "Too many attempts. Please try again in a few minutes."
            : "We could not record your income. Please try again.",
        );
        return;
      }

      // Fetch offers
      const off = await callJson(`/api/prequal/${sessionId}/offers`, {
        method: "GET",
      });
      if (!off.ok || typeof off.data !== "object" || off.data === null) {
        setErrorBanner(
          "We could not generate offers. Please try again or contact the dealership.",
        );
        return;
      }
      setOffers(off.data as OffersPayload);
      // Generate a continue-at-dealership token (signed-ish: session id + ts).
      // Real impl would sign via crypto/sign.ts on the server; this is just a
      // human-readable copy for the front desk to look up the session by id.
      setContinueToken(`PREQUAL-${sessionId.slice(0, 8).toUpperCase()}`);
      setStep(4);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyContinue() {
    if (!continueToken) return;
    try {
      await navigator.clipboard.writeText(continueToken);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      // No clipboard access -- ignore
    }
  }

  const offersExpired = useMemo(() => {
    if (!offers || offers.offers.length === 0) return false;
    const earliest = Math.min(
      ...offers.offers.map((o) => new Date(o.expires_at).getTime()),
    );
    return earliest <= Date.now();
  }, [offers]);

  /* ------------------ Render ------------------ */

  return (
    <main
      className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-white py-8 px-4 sm:py-12"
      data-testid="prequal-wizard"
    >
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            Get Pre-Qualified
          </h1>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">
            Real lender offers in under a minute. Soft credit check, no impact
            to your score.
          </p>
          <p className="mt-1 text-xs text-slate-500">From {dealerName}</p>
        </header>

        {/* Progress bar */}
        <nav
          aria-label="Pre-qualification progress"
          className="mb-6"
          data-testid="prequal-stepper"
        >
          <ol className="flex items-center justify-between gap-2">
            {([1, 2, 3, 4] as Step[]).map((s) => (
              <li key={s} className="flex-1">
                <div
                  data-testid={`prequal-step-${s}-indicator`}
                  data-active={step === s}
                  data-complete={step > s}
                  className={`h-2 rounded-full transition-colors ${
                    step > s
                      ? "bg-emerald-500"
                      : step === s
                        ? "bg-blue-600"
                        : "bg-slate-200"
                  }`}
                  aria-current={step === s ? "step" : undefined}
                />
                <p className="mt-2 text-center text-xs font-medium text-slate-700">
                  {STEP_LABELS[s]}
                </p>
              </li>
            ))}
          </ol>
        </nav>

        {errorBanner && (
          <div
            role="alert"
            data-testid="prequal-error-banner"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {errorBanner}
          </div>
        )}

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-7">
          {step === 1 && (
            <div data-testid="prequal-step-1">
              <h2 className="text-xl font-semibold text-slate-900">
                Tell us a bit about you
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                We need this to match you with real lender offers.
              </p>

              <div className="mt-4 space-y-4">
                <Field
                  label="Full name"
                  required
                  htmlFor="prequal-name"
                  testId="prequal-field-name"
                >
                  <input
                    id="prequal-name"
                    data-testid="prequal-input-name"
                    type="text"
                    autoComplete="name"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    value={identity.customer_name}
                    onChange={(e) =>
                      setIdentity({ ...identity, customer_name: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label="Email"
                  required
                  htmlFor="prequal-email"
                  testId="prequal-field-email"
                >
                  <input
                    id="prequal-email"
                    data-testid="prequal-input-email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    value={identity.customer_email}
                    onChange={(e) =>
                      setIdentity({ ...identity, customer_email: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label="Phone (optional)"
                  htmlFor="prequal-phone"
                  testId="prequal-field-phone"
                >
                  <input
                    id="prequal-phone"
                    data-testid="prequal-input-phone"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    value={identity.customer_phone}
                    onChange={(e) =>
                      setIdentity({ ...identity, customer_phone: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label="Vehicle of interest"
                  required
                  htmlFor="prequal-vehicle"
                  testId="prequal-field-vehicle"
                  hint='Examples: "2023 Toyota Tacoma", "midsize SUV under $40k"'
                >
                  <input
                    id="prequal-vehicle"
                    data-testid="prequal-input-vehicle"
                    type="text"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    value={identity.vehicle_interest_text}
                    onChange={(e) =>
                      setIdentity({
                        ...identity,
                        vehicle_interest_text: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  data-testid="prequal-step-1-continue"
                  onClick={submitStep1}
                  disabled={!identityValid || loading}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {loading ? "Working..." : "Continue"}
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div data-testid="prequal-step-2">
              <h2 className="text-xl font-semibold text-slate-900">
                Soft credit check
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                We use a soft pull -- it will NOT affect your credit score.
                You can stop any time.
              </p>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p>
                  <strong>What we will do:</strong> request a soft credit
                  inquiry to estimate your credit tier. This does not commit
                  you to a loan and does not affect your score.
                </p>
              </div>

              <label className="mt-4 flex items-start gap-3">
                <input
                  type="checkbox"
                  data-testid="prequal-credit-consent"
                  checked={credit.consent}
                  onChange={(e) =>
                    setCredit({ consent: e.target.checked })
                  }
                  className="mt-1 h-5 w-5 rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">
                  I authorize {dealerName} to run a soft credit inquiry to
                  show me estimated financing offers. I understand this does
                  not affect my credit score.
                </span>
              </label>

              <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
                <button
                  type="button"
                  data-testid="prequal-step-2-back"
                  onClick={() => setStep(1)}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  data-testid="prequal-step-2-continue"
                  onClick={submitStep2}
                  disabled={!credit.consent || loading}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {loading ? "Checking..." : "Run soft check"}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div data-testid="prequal-step-3">
              <h2 className="text-xl font-semibold text-slate-900">
                Your income
              </h2>
              {creditResult && (
                <div
                  className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
                  data-testid="prequal-credit-tier-banner"
                >
                  <strong>{TIER_LABEL[creditResult.tier] ?? creditResult.tier}</strong>
                  {" - "}estimated score range {creditResult.score_range_min}
                  {" to "}
                  {creditResult.score_range_max}
                  {creditResult.is_mock && (
                    <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-900">
                      Demo data
                    </span>
                  )}
                </div>
              )}

              <p className="mt-3 text-sm text-slate-600">
                Lenders need to know your income. You can self-report for
                now, or connect your bank for instant verification (coming
                soon).
              </p>

              <div className="mt-4 space-y-4">
                <Field
                  label="Gross income amount"
                  required
                  htmlFor="prequal-income-amount"
                  testId="prequal-field-income-amount"
                >
                  <div className="flex items-stretch gap-2">
                    <span className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-3 text-base text-slate-600">
                      $
                    </span>
                    <input
                      id="prequal-income-amount"
                      data-testid="prequal-input-income-amount"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      className="w-full rounded-r-lg border border-slate-300 px-3 py-2 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      value={income.amount}
                      onChange={(e) =>
                        setIncome({ ...income, amount: e.target.value })
                      }
                    />
                  </div>
                </Field>
                <Field
                  label="Cadence"
                  htmlFor="prequal-income-cadence"
                  testId="prequal-field-income-cadence"
                >
                  <select
                    id="prequal-income-cadence"
                    data-testid="prequal-input-income-cadence"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    value={income.cadence}
                    onChange={(e) =>
                      setIncome({
                        ...income,
                        cadence: e.target.value as "monthly" | "annual",
                      })
                    }
                  >
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual</option>
                  </select>
                </Field>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <p>
                    <strong>Coming soon:</strong> connect your bank with Plaid
                    for instant, verified income. Plaid integration is on the
                    roadmap.
                  </p>
                  <button
                    type="button"
                    disabled
                    aria-disabled
                    data-testid="prequal-plaid-placeholder"
                    className="mt-2 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-500"
                  >
                    Connect your bank (coming soon)
                  </button>
                </div>
              </div>

              <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
                <button
                  type="button"
                  data-testid="prequal-step-3-back"
                  onClick={() => setStep(2)}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  data-testid="prequal-step-3-continue"
                  onClick={submitStep3}
                  disabled={!incomeValid || loading}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {loading ? "Getting offers..." : "Get my offers"}
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div data-testid="prequal-step-4">
              <h2 className="text-xl font-semibold text-slate-900">
                You qualify with these lenders
              </h2>

              {offersExpired && (
                <div
                  data-testid="prequal-offers-expired"
                  className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                >
                  These offers have expired. Please restart your pre-qualification.
                </div>
              )}

              {!offers || offers.offers.length === 0 ? (
                <p
                  data-testid="prequal-no-offers"
                  className="mt-3 text-sm text-slate-700"
                >
                  We could not match you with a lender right now. Reach out to
                  {" "}{dealerName} so we can find another path.
                </p>
              ) : (
                <ul
                  className="mt-4 space-y-3"
                  data-testid="prequal-offers-list"
                >
                  {offers.offers.map((o) => (
                    <li
                      key={o.lender_id}
                      data-testid={`prequal-offer-${o.lender_id}`}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-base font-semibold text-slate-900">
                            {o.lender_name}
                          </p>
                          <p className="text-xs text-slate-500">
                            Expires {new Date(o.expires_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-right sm:text-left">
                          <Stat
                            label="APR"
                            value={fmtApr(o.apr_bps)}
                            testId={`prequal-offer-${o.lender_id}-apr`}
                          />
                          <Stat
                            label="Term"
                            value={`${o.term_months} mo`}
                            testId={`prequal-offer-${o.lender_id}-term`}
                          />
                          <Stat
                            label="Up to"
                            value={fmtCurrency(o.max_amount_cents)}
                            testId={`prequal-offer-${o.lender_id}-amount`}
                          />
                        </div>
                      </div>
                      <p
                        className="mt-2 text-sm text-slate-700"
                        data-testid={`prequal-offer-${o.lender_id}-payment`}
                      >
                        Estimated payment:{" "}
                        <strong>
                          {fmtCurrency(o.estimated_monthly_payment_cents)}/mo
                        </strong>
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {continueToken && (
                <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-medium text-blue-900">
                    Continue at {dealerName}
                  </p>
                  <p className="mt-1 text-sm text-blue-800">
                    Show this code to the front desk. We will pick up exactly
                    where you left off. We also emailed a copy.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <code
                      data-testid="prequal-continue-token"
                      className="rounded-lg bg-white px-3 py-2 text-lg font-mono tracking-wider text-blue-900 ring-1 ring-blue-200"
                    >
                      {continueToken}
                    </code>
                    <button
                      type="button"
                      data-testid="prequal-continue-copy"
                      onClick={handleCopyContinue}
                      className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      {copyState === "copied" ? "Copied" : "Copy code"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <footer className="mt-6 text-center text-xs text-slate-500">
          Soft credit check only. No impact to your credit score. Offers shown
          are estimates and not a guaranteed loan offer.
        </footer>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Small UI helpers                                                           */
/* -------------------------------------------------------------------------- */

function Field({
  label,
  required,
  htmlFor,
  testId,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  htmlFor: string;
  testId: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-testid={testId}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-slate-700"
      >
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Stat({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div data-testid={testId}>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}
