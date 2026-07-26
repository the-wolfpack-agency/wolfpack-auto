"use client";

import { useCallback, useMemo, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type SuggestionType =
  | "rate_stack"
  | "payment_shape"
  | "msrp_discount"
  | "fi_product_attach"
  | "lender_swap"
  | "term_change"
  | "down_change";

interface Suggestion {
  id: string;
  session_id: string;
  suggestion_type: SuggestionType;
  generator: string;
  payload: Record<string, unknown>;
  evidence: { cite: string; signals: Record<string, unknown> };
  confidence: number;
  accepted: boolean | null;
  suggested_at: string;
}

interface Session {
  id: string;
  dealer_id: string;
  deal_id: string;
  opened_at: string;
  closed_at: string | null;
  outcome: "won" | "lost" | "pending" | null;
  total_suggestions: number;
  accepted_suggestions: number;
}

const TYPE_LABELS: Record<SuggestionType, string> = {
  rate_stack: "Better Rate Available",
  payment_shape: "Hit the Target Payment",
  msrp_discount: "Adjust Selling Price",
  fi_product_attach: "Add F&I Product",
  lender_swap: "Switch Lender",
  term_change: "Change Term",
  down_change: "Change Down Payment",
};

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function DealCopilotPage() {
  // Live deal state — mirrors the snapshot accepted by the API.
  const [dealId, setDealId] = useState("desk-001");
  const [sellingPrice, setSellingPrice] = useState(38500);
  const [msrp, setMsrp] = useState(40000);
  const [termMonths, setTermMonths] = useState(72);
  const [cashDown, setCashDown] = useState(2000);
  const [apr, setApr] = useState(7.9);
  const [lenderName, setLenderName] = useState("Capital One Auto");
  const [creditTier, setCreditTier] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [creditScore, setCreditScore] = useState(720);
  const [targetMonthly, setTargetMonthly] = useState(550);
  const [fiProducts, setFiProducts] = useState<string[]>([]);
  const [vehicleType, setVehicleType] = useState<"new" | "used" | "cpo">("new");

  // Session + suggestions
  const [session, setSession] = useState<Session | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // Outcome capture
  const [closeReason, setCloseReason] = useState("");
  const [grossProfit, setGrossProfit] = useState(0);

  const grouped = useMemo(() => {
    const out: Record<SuggestionType, Suggestion[]> = {
      rate_stack: [],
      payment_shape: [],
      msrp_discount: [],
      fi_product_attach: [],
      lender_swap: [],
      term_change: [],
      down_change: [],
    };
    for (const s of suggestions) out[s.suggestion_type].push(s);
    return out;
  }, [suggestions]);

  const openSession = useCallback(async () => {
    setBusy(true);
    setErrorMsg("");
    setStatusMsg("");
    try {
      const res = await fetch("/api/admin/deal-copilot/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_id: dealId }),
      });
      if (!res.ok) throw new Error(`Open session failed (${res.status})`);
      const data = await res.json();
      setSession(data.session);
      setSuggestions([]);
      setStatusMsg("Copilot session opened.");
    } catch (err) {
      setErrorMsg(`Could not open session: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [dealId]);

  const generate = useCallback(async () => {
    if (!session) {
      setErrorMsg("Open a session first.");
      return;
    }
    setBusy(true);
    setErrorMsg("");
    setStatusMsg("");
    try {
      const res = await fetch(
        `/api/admin/deal-copilot/sessions/${session.id}/suggest`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            snapshot: {
              selling_price: sellingPrice,
              msrp,
              term_months: termMonths,
              cash_down: cashDown,
              apr,
              lender_name: lenderName,
              credit_tier: creditTier,
              credit_score: creditScore,
              fi_products: fiProducts,
              vehicle_type: vehicleType,
              target_monthly: targetMonthly,
            },
          }),
        },
      );
      if (!res.ok) throw new Error(`Suggest failed (${res.status})`);
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
      setStatusMsg(`Generated ${data.count ?? 0} suggestion(s).`);
    } catch (err) {
      setErrorMsg(`Could not generate suggestions: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [
    session, sellingPrice, msrp, termMonths, cashDown, apr, lenderName,
    creditTier, creditScore, fiProducts, vehicleType, targetMonthly,
  ]);

  const accept = useCallback(async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/deal-copilot/suggestions/${id}/accept`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      if (!res.ok) throw new Error(`Accept failed (${res.status})`);
      setSuggestions((cur) => cur.map((s) => (s.id === id ? { ...s, accepted: true } : s)));
      setStatusMsg("Suggestion accepted.");
    } catch (err) {
      setErrorMsg(`Accept failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const reject = useCallback(async (id: string) => {
    const reason = window.prompt("Why is this suggestion not a fit?") ?? "";
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/deal-copilot/suggestions/${id}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      if (!res.ok) throw new Error(`Reject failed (${res.status})`);
      setSuggestions((cur) => cur.map((s) => (s.id === id ? { ...s, accepted: false } : s)));
      setStatusMsg("Suggestion dismissed.");
    } catch (err) {
      setErrorMsg(`Reject failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const closeSession = useCallback(
    async (outcome: "won" | "lost") => {
      if (!session) return;
      setBusy(true);
      try {
        const res = await fetch(
          `/api/admin/deal-copilot/sessions/${session.id}/close`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              outcome,
              close_reason: closeReason,
              gross_profit_cents: Math.round(grossProfit * 100),
            }),
          },
        );
        if (!res.ok) throw new Error(`Close failed (${res.status})`);
        setStatusMsg(
          outcome === "won"
            ? `Session closed as won. Learning loop updated.`
            : `Session closed as lost. Learning loop updated.`,
        );
        setSession((cur) => (cur ? { ...cur, outcome, closed_at: new Date().toISOString() } : cur));
      } catch (err) {
        setErrorMsg(`Close failed: ${(err as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [session, closeReason, grossProfit],
  );

  return (
    <div data-testid="deal-copilot-page" className="p-4 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold">Deal-Desk Copilot</h1>
        <p className="text-sm text-gray-600 mt-1">
          Live recommendations for the desk — every suggestion cites the evidence.
        </p>
      </header>

      {errorMsg && (
        <div data-testid="copilot-error" className="mb-4 p-3 rounded bg-red-50 text-red-800 text-sm">
          {errorMsg}
        </div>
      )}
      {statusMsg && (
        <div data-testid="copilot-status" className="mb-4 p-3 rounded bg-green-50 text-green-800 text-sm">
          {statusMsg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* LEFT: live deal state */}
        <section data-testid="copilot-deal-form" className="bg-white border rounded-lg p-4 md:p-6">
          <h2 className="text-lg font-semibold mb-4">Current deal</h2>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Deal ID">
              <input
                data-testid="deal-id-input"
                type="text"
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
                className="w-full border rounded px-2 py-1"
              />
            </Field>
            <Field label="Selling price">
              <input
                data-testid="selling-price-input"
                type="number"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(Number(e.target.value))}
                className="w-full border rounded px-2 py-1"
              />
            </Field>
            <Field label="MSRP">
              <input
                type="number"
                value={msrp}
                onChange={(e) => setMsrp(Number(e.target.value))}
                className="w-full border rounded px-2 py-1"
              />
            </Field>
            <Field label="Term (months)">
              <input
                type="number"
                value={termMonths}
                onChange={(e) => setTermMonths(Number(e.target.value))}
                className="w-full border rounded px-2 py-1"
              />
            </Field>
            <Field label="Cash down">
              <input
                type="number"
                value={cashDown}
                onChange={(e) => setCashDown(Number(e.target.value))}
                className="w-full border rounded px-2 py-1"
              />
            </Field>
            <Field label="APR (%)">
              <input
                type="number"
                step={0.1}
                value={apr}
                onChange={(e) => setApr(Number(e.target.value))}
                className="w-full border rounded px-2 py-1"
              />
            </Field>
            <Field label="Lender">
              <input
                type="text"
                value={lenderName}
                onChange={(e) => setLenderName(e.target.value)}
                className="w-full border rounded px-2 py-1"
              />
            </Field>
            <Field label="Credit tier">
              <select
                value={creditTier}
                onChange={(e) => setCreditTier(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                className="w-full border rounded px-2 py-1"
              >
                <option value={1}>1 (best)</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5 (subprime)</option>
              </select>
            </Field>
            <Field label="Credit score">
              <input
                type="number"
                value={creditScore}
                onChange={(e) => setCreditScore(Number(e.target.value))}
                className="w-full border rounded px-2 py-1"
              />
            </Field>
            <Field label="Target monthly">
              <input
                type="number"
                value={targetMonthly}
                onChange={(e) => setTargetMonthly(Number(e.target.value))}
                className="w-full border rounded px-2 py-1"
              />
            </Field>
            <Field label="Vehicle type">
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as "new" | "used" | "cpo")}
                className="w-full border rounded px-2 py-1"
              >
                <option value="new">New</option>
                <option value="cpo">CPO</option>
                <option value="used">Used</option>
              </select>
            </Field>
            <Field label="F&I products attached">
              <input
                type="text"
                value={fiProducts.join(",")}
                onChange={(e) =>
                  setFiProducts(
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                placeholder="warranty,gap"
                className="w-full border rounded px-2 py-1"
              />
            </Field>
          </div>

          <div className="mt-5 flex gap-3 flex-wrap">
            <button
              data-testid="open-session-btn"
              type="button"
              onClick={openSession}
              disabled={busy}
              className="px-4 py-2 rounded bg-gray-800 text-white text-sm disabled:opacity-50"
            >
              Open copilot session
            </button>
            <button
              data-testid="generate-btn"
              type="button"
              onClick={generate}
              disabled={busy || !session}
              className="px-4 py-2 rounded bg-brand-700 text-white text-sm disabled:opacity-50"
            >
              Generate suggestions
            </button>
          </div>

          {session && (
            <p data-testid="session-info" className="mt-4 text-xs text-gray-600">
              Session {session.id.slice(0, 8)}… opened {new Date(session.opened_at).toLocaleTimeString()}
              {session.outcome && session.outcome !== "pending" ? ` — closed: ${session.outcome}` : ""}
            </p>
          )}
        </section>

        {/* RIGHT: suggestions panel */}
        <section data-testid="copilot-suggestions-panel" className="bg-white border rounded-lg p-4 md:p-6">
          <h2 className="text-lg font-semibold mb-4">Copilot suggestions</h2>

          {suggestions.length === 0 ? (
            <p data-testid="copilot-empty" className="text-sm text-gray-500">
              No suggestions yet. Open a session and click Generate.
            </p>
          ) : (
            <div className="space-y-5">
              {(Object.keys(grouped) as SuggestionType[]).map((type) =>
                grouped[type].length === 0 ? null : (
                  <div key={type} data-testid={`copilot-group-${type}`}>
                    <h3 className="text-sm font-semibold uppercase text-gray-700 mb-2">
                      {TYPE_LABELS[type]}
                    </h3>
                    <div className="space-y-3">
                      {grouped[type].map((s) => (
                        <SuggestionCard
                          key={s.id}
                          suggestion={s}
                          onAccept={() => accept(s.id)}
                          onReject={() => reject(s.id)}
                          busy={busy}
                        />
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}

          <div data-testid="outcome-capture" className="mt-6 pt-6 border-t">
            <h3 className="text-sm font-semibold mb-3">Close session</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Close reason">
                <input
                  type="text"
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  placeholder="e.g. payment, rate, model availability"
                  className="w-full border rounded px-2 py-1"
                />
              </Field>
              <Field label="Gross profit ($)">
                <input
                  type="number"
                  value={grossProfit}
                  onChange={(e) => setGrossProfit(Number(e.target.value))}
                  className="w-full border rounded px-2 py-1"
                />
              </Field>
            </div>
            <div className="mt-3 flex gap-3 flex-wrap">
              <button
                data-testid="close-won-btn"
                type="button"
                onClick={() => closeSession("won")}
                disabled={busy || !session || session.outcome !== "pending"}
                className="px-4 py-2 rounded bg-green-600 text-white text-sm disabled:opacity-50"
              >
                Closed — Won
              </button>
              <button
                data-testid="close-lost-btn"
                type="button"
                onClick={() => closeSession("lost")}
                disabled={busy || !session || session.outcome !== "pending"}
                className="px-4 py-2 rounded bg-gray-500 text-white text-sm disabled:opacity-50"
              >
                Closed — Lost
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-gray-700">
      <span className="block mb-1">{label}</span>
      {children}
    </label>
  );
}

function SuggestionCard({
  suggestion,
  onAccept,
  onReject,
  busy,
}: {
  suggestion: Suggestion;
  onAccept: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const accepted = suggestion.accepted === true;
  const rejected = suggestion.accepted === false;
  const accent = accepted ? "border-green-400" : rejected ? "border-gray-300" : "border-brand-300";
  return (
    <div
      data-testid={`suggestion-${suggestion.id}`}
      className={`border-l-4 ${accent} bg-gray-50 rounded p-3`}
    >
      <p data-testid="suggestion-cite" className="text-sm text-gray-900">
        {suggestion.evidence.cite}
      </p>
      <details className="mt-2 text-xs text-gray-600">
        <summary className="cursor-pointer">Show numbers</summary>
        <pre className="mt-1 p-2 bg-white border rounded overflow-x-auto">
          {JSON.stringify(suggestion.payload, null, 2)}
        </pre>
      </details>
      <div className="mt-3 flex gap-2 items-center">
        {accepted && (
          <span className="text-xs font-semibold text-green-700">Accepted</span>
        )}
        {rejected && (
          <span className="text-xs font-semibold text-gray-500">Dismissed</span>
        )}
        {!accepted && !rejected && (
          <>
            <button
              data-testid="accept-btn"
              type="button"
              onClick={onAccept}
              disabled={busy}
              className="px-3 py-1 rounded bg-green-600 text-white text-xs disabled:opacity-50"
            >
              Accept
            </button>
            <button
              data-testid="reject-btn"
              type="button"
              onClick={onReject}
              disabled={busy}
              className="px-3 py-1 rounded bg-gray-300 text-gray-800 text-xs disabled:opacity-50"
            >
              Dismiss
            </button>
          </>
        )}
        <span className="ml-auto text-xs text-gray-500">
          confidence {(suggestion.confidence * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
