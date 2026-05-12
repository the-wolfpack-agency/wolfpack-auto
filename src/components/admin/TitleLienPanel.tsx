"use client";

/**
 * TitleLienPanel — vehicle-detail card for state title/lien lookups.
 *
 * Surfaces four UI branches per Stream E spec:
 *   1. Loading
 *   2. Valid (supported state, response in hand, no lien)
 *   3. Lien present (supported state, has_lien === true)
 *   4. Not supported (state not yet in the registered set, or paid-only API)
 *
 * Mobile-first responsive per `feedback_mobile_first.md`. No em dashes per
 * `feedback_no_em_dashes.md`. Copy uses plain dealership language per
 * `feedback_non_technical_ui.md` — "Lien on file" beats "encumbrance".
 */

import { useCallback, useEffect, useState } from "react";

interface ApiPayload {
  vehicle_id: string;
  vin: string;
  state_code: string;
  supported: boolean;
  reason?: string;
  has_lien: boolean | null;
  lienholder_name: string | null;
  title_status: string | null;
  source: string;
  looked_up_at: string;
  supported_states: string[];
}

interface Props {
  /** Vehicle UUID (or VIN — the API accepts either). */
  vehicleId: string;
  /** Two-letter state code. Defaults to "FL". Provided by the parent page. */
  defaultState?: string;
}

export function TitleLienPanel({
  vehicleId,
  defaultState = "FL",
}: Props): JSX.Element {
  const [stateCode, setStateCode] = useState(defaultState);
  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (state: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/vehicles/${encodeURIComponent(vehicleId)}/title-lien?state=${encodeURIComponent(state)}`,
        );
        if (res.status === 401) {
          // Auth required — redirect rather than render blank
          window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const payload = (await res.json()) as ApiPayload;
        setData(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lookup failed");
      } finally {
        setLoading(false);
      }
    },
    [vehicleId],
  );

  useEffect(() => {
    void fetchData(stateCode);
  }, [fetchData, stateCode]);

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      aria-label="Title and lien status"
      data-testid="title-lien-panel"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">
          Title and lien status
        </h2>
        <label className="text-xs text-slate-600">
          State{" "}
          <select
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value)}
            className="ml-1 rounded border border-slate-300 px-2 py-1 text-xs"
            aria-label="Look up state"
          >
            {(data?.supported_states ?? ["CA", "TX", "FL"]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {/* Allow any 2-letter for honest "not supported yet" rendering */}
            {!(data?.supported_states ?? ["CA", "TX", "FL"]).includes(
              stateCode,
            ) ? (
              <option value={stateCode}>{stateCode}</option>
            ) : null}
          </select>
        </label>
      </header>

      {loading ? (
        <p
          className="text-sm text-slate-500"
          data-testid="title-lien-loading"
        >
          Checking title and lien status…
        </p>
      ) : error ? (
        <p
          className="text-sm text-red-700"
          data-testid="title-lien-error"
        >
          We could not look up title status right now. Try again in a moment.
        </p>
      ) : !data ? null : !data.supported ? (
        <div data-testid="title-lien-not-supported">
          <p className="text-sm font-medium text-slate-800">
            Title check not available for {data.state_code}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {data.reason === "paid_subscription_required"
              ? "This state only releases title data through a paid records subscription. We are not pulling fake data here."
              : "We have not added a free title check for this state yet. We will not show made-up information."}
          </p>
        </div>
      ) : data.has_lien ? (
        <div data-testid="title-lien-has-lien">
          <p className="text-sm font-semibold text-amber-800">
            Lien on file
          </p>
          {data.lienholder_name ? (
            <p className="mt-1 text-xs text-slate-700">
              Lienholder: {data.lienholder_name}
            </p>
          ) : null}
          {data.title_status ? (
            <p className="mt-0.5 text-xs text-slate-600">
              Title status: {data.title_status}
            </p>
          ) : null}
        </div>
      ) : (
        <div data-testid="title-lien-valid">
          <p className="text-sm font-semibold text-emerald-800">
            No lien recorded
          </p>
          {data.title_status ? (
            <p className="mt-1 text-xs text-slate-600">
              Title status: {data.title_status}
            </p>
          ) : null}
        </div>
      )}

      {data ? (
        <footer className="mt-3 text-[10px] text-slate-400">
          Source: {data.source}. Looked up{" "}
          {new Date(data.looked_up_at).toLocaleString()}.
        </footer>
      ) : null}
    </section>
  );
}

export default TitleLienPanel;
