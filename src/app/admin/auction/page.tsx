"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/safe-fetch";

type Tab = "opportunities" | "benchmarks";

interface Opportunity {
  id: string;
  listing: {
    vin: string;
    year: number;
    make: string;
    model: string;
    trim: string | null;
    mileage: number;
    condition_grade: number | null;
    reserve_price_cents: number;
    sale_at: string;
    location: string | null;
  };
  opportunity_score: number;
  suggested_max_bid_cents: number;
  predicted_retail_cents: number;
  predicted_gross_cents: number;
  status: string;
}

interface Benchmark {
  vin_pattern: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  mileage_band: string;
  p25_cents: number;
  p50_cents: number;
  p75_cents: number;
  sample_size: number;
  last_updated_at: string;
}

function dollars(cents: number): string {
  if (!cents && cents !== 0) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function AuctionAdminPage() {
  const [tab, setTab] = useState<Tab>("opportunities");
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Benchmark search state
  const [benchVin, setBenchVin] = useState("");
  const [benchYear, setBenchYear] = useState("");
  const [benchMake, setBenchMake] = useState("");
  const [benchModel, setBenchModel] = useState("");
  const [benchMileage, setBenchMileage] = useState("");
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [benchErr, setBenchErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchJson<{ opportunities?: Opportunity[] }>("/api/admin/auction/opportunities")
      .then((d) => { if (alive) { setOpps(d.opportunities ?? []); setLoading(false); }})
      .catch((e) => { if (alive) { setErr(String(e)); setLoading(false); }});
    return () => { alive = false; };
  }, []);

  async function act(id: string, action: string) {
    const res = await fetch(`/api/admin/auction/opportunities/${id}/${action}`, { method: "POST" });
    if (res.ok) {
      setOpps((prev) => prev.map((o) => (o.id === id ? { ...o, status: action === "dismiss" ? "dismissed" : action === "bid" ? "bidding" : action } : o)));
    }
  }

  async function lookupBenchmark() {
    setBenchErr(null);
    setBenchmark(null);
    const params = new URLSearchParams();
    if (benchVin) params.set("vin", benchVin);
    if (benchYear) params.set("year", benchYear);
    if (benchMake) params.set("make", benchMake);
    if (benchModel) params.set("model", benchModel);
    if (benchMileage) params.set("mileage", benchMileage);
    const res = await fetch(`/api/admin/auction/benchmarks?${params}`);
    const data = await res.json();
    if (!res.ok) {
      setBenchErr(data.error ?? "Lookup failed");
      return;
    }
    setBenchmark(data.benchmark);
  }

  return (
    <div className="p-6" data-testid="admin-auction-page">
      <h1 className="text-2xl font-bold mb-4">Auction Live Feed</h1>

      <div className="flex gap-2 mb-4">
        <button
          data-testid="auction-tab-opportunities"
          onClick={() => setTab("opportunities")}
          className={`px-4 py-2 rounded ${tab === "opportunities" ? "bg-brand-700 text-white" : "bg-gray-200"}`}
        >
          Opportunities
        </button>
        <button
          data-testid="auction-tab-benchmarks"
          onClick={() => setTab("benchmarks")}
          className={`px-4 py-2 rounded ${tab === "benchmarks" ? "bg-brand-700 text-white" : "bg-gray-200"}`}
        >
          Benchmarks
        </button>
      </div>

      {tab === "opportunities" && (
        <section data-testid="opportunities-section">
          {loading && <p>Loading opportunities…</p>}
          {err && <p className="text-red-600">Error: {err}</p>}
          {!loading && opps.length === 0 && (
            <p data-testid="opportunities-empty">No auction opportunities scored yet.</p>
          )}
          {opps.length > 0 && (
            <table className="w-full text-sm" data-testid="opportunities-table">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">VIN</th>
                  <th>Vehicle</th>
                  <th>Score</th>
                  <th>Max Bid</th>
                  <th>Retail</th>
                  <th>Gross</th>
                  <th>Sale</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {opps.map((o) => (
                  <tr key={o.id} className="border-b" data-testid={`opp-row-${o.id}`}>
                    <td className="p-2 font-mono">{o.listing.vin}</td>
                    <td>{o.listing.year} {o.listing.make} {o.listing.model} {o.listing.trim ?? ""}</td>
                    <td>{o.opportunity_score.toFixed(1)}</td>
                    <td>{dollars(o.suggested_max_bid_cents)}</td>
                    <td>{dollars(o.predicted_retail_cents)}</td>
                    <td>{dollars(o.predicted_gross_cents)}</td>
                    <td>{new Date(o.listing.sale_at).toLocaleString()}</td>
                    <td>{o.status}</td>
                    <td className="space-x-1">
                      <button data-testid={`opp-bid-${o.id}`} onClick={() => act(o.id, "bid")} className="px-2 py-1 bg-brand-600 text-white rounded text-xs">Bid</button>
                      <button data-testid={`opp-won-${o.id}`} onClick={() => act(o.id, "won")} className="px-2 py-1 bg-green-500 text-white rounded text-xs">Won</button>
                      <button data-testid={`opp-lost-${o.id}`} onClick={() => act(o.id, "lost")} className="px-2 py-1 bg-yellow-500 text-white rounded text-xs">Lost</button>
                      <button data-testid={`opp-dismiss-${o.id}`} onClick={() => act(o.id, "dismiss")} className="px-2 py-1 bg-gray-500 text-white rounded text-xs">Dismiss</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === "benchmarks" && (
        <section data-testid="benchmarks-section">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
            <input data-testid="bench-vin" value={benchVin} onChange={(e) => setBenchVin(e.target.value)} placeholder="VIN" className="border p-2 rounded" />
            <input data-testid="bench-year" value={benchYear} onChange={(e) => setBenchYear(e.target.value)} placeholder="Year" className="border p-2 rounded" />
            <input data-testid="bench-make" value={benchMake} onChange={(e) => setBenchMake(e.target.value)} placeholder="Make" className="border p-2 rounded" />
            <input data-testid="bench-model" value={benchModel} onChange={(e) => setBenchModel(e.target.value)} placeholder="Model" className="border p-2 rounded" />
            <input data-testid="bench-mileage" value={benchMileage} onChange={(e) => setBenchMileage(e.target.value)} placeholder="Mileage" className="border p-2 rounded" />
          </div>
          <button data-testid="bench-lookup" onClick={lookupBenchmark} className="px-4 py-2 bg-brand-700 text-white rounded">
            Look up benchmark
          </button>

          {benchErr && <p className="text-red-600 mt-3">Error: {benchErr}</p>}
          {benchmark === null && !benchErr && (
            <p className="mt-4 text-gray-600" data-testid="bench-empty">Enter VIN or YMM + mileage above and click look up.</p>
          )}
          {benchmark && (
            <div className="mt-4 grid grid-cols-3 gap-4" data-testid="bench-result">
              <div className="p-3 bg-gray-100 rounded">
                <div className="text-xs uppercase text-gray-600">P25</div>
                <div className="text-xl font-bold">{dollars(benchmark.p25_cents)}</div>
              </div>
              <div className="p-3 bg-gray-100 rounded">
                <div className="text-xs uppercase text-gray-600">P50 (median)</div>
                <div className="text-xl font-bold">{dollars(benchmark.p50_cents)}</div>
              </div>
              <div className="p-3 bg-gray-100 rounded">
                <div className="text-xs uppercase text-gray-600">P75</div>
                <div className="text-xl font-bold">{dollars(benchmark.p75_cents)}</div>
              </div>
              <div className="col-span-3 text-sm text-gray-600">
                Sample size: {benchmark.sample_size} • Updated: {new Date(benchmark.last_updated_at).toLocaleString()}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
