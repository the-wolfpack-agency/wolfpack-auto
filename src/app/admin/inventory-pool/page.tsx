"use client";

import { useEffect, useState } from "react";

type Tab = "visible" | "reservations" | "swaps";

interface PoolInventory {
  vin: string;
  year: number;
  make: string;
  model: string;
  owning_dealer_id: string;
  price: number | null;
  days_on_lot: number | null;
}

interface ReservationRow {
  id: string;
  vin: string;
  requesting_dealer_id: string;
  owning_dealer_id: string;
  status: string;
  requested_at: string;
  expires_at: string;
  notes: string | null;
}

interface SwapRow {
  id: string;
  vin_a: string;
  dealer_a_id: string;
  vin_b: string;
  dealer_b_id: string;
  rationale: string | null;
  expected_velocity_lift: number;
  status: string;
}

export default function InventoryPoolPage() {
  const [tab, setTab] = useState<Tab>("visible");
  const [inventory, setInventory] = useState<PoolInventory[]>([]);
  const [incoming, setIncoming] = useState<ReservationRow[]>([]);
  const [outgoing, setOutgoing] = useState<ReservationRow[]>([]);
  const [swaps, setSwaps] = useState<SwapRow[]>([]);

  const [groupId, setGroupId] = useState("");

  useEffect(() => {
    fetch("/api/admin/inventory-pool/visible")
      .then((r) => r.json())
      .then((d) => setInventory(d.inventory ?? []))
      .catch(() => {});
    fetch("/api/admin/inventory-pool/reserve")
      .then((r) => r.json())
      .then((d) => {
        setIncoming(d.incoming ?? []);
        setOutgoing(d.outgoing ?? []);
      })
      .catch(() => {});
  }, []);

  async function loadSwaps() {
    if (!groupId) return;
    const res = await fetch(`/api/admin/inventory-pool/swaps?dealer_group_id=${groupId}`);
    const data = await res.json();
    setSwaps(data.swaps ?? []);
  }

  async function reserve(vin: string, owningDealerId: string) {
    const res = await fetch("/api/admin/inventory-pool/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vin, owning_dealer_id: owningDealerId }),
    });
    if (res.ok) {
      const data = await res.json();
      setOutgoing((prev) => [
        {
          id: data.reservation_id ?? `local-${Date.now()}`,
          vin, requesting_dealer_id: "you", owning_dealer_id: owningDealerId,
          status: "pending", requested_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86_400_000).toISOString(), notes: null,
        },
        ...prev,
      ]);
    }
  }

  async function actReservation(id: string, action: "approve" | "reject" | "fulfill") {
    const res = await fetch(`/api/admin/inventory-pool/reservations/${id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (res.ok) {
      const targetStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "fulfilled";
      setIncoming((prev) => prev.map((r) => (r.id === id ? { ...r, status: targetStatus } : r)));
      setOutgoing((prev) => prev.map((r) => (r.id === id ? { ...r, status: targetStatus } : r)));
    }
  }

  async function actSwap(id: string, action: "accept" | "reject" | "complete") {
    const res = await fetch(`/api/admin/inventory-pool/swaps/${id}/${action}`, { method: "POST" });
    if (res.ok) {
      const targetStatus = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "completed";
      setSwaps((prev) => prev.map((s) => (s.id === id ? { ...s, status: targetStatus } : s)));
    }
  }

  return (
    <div className="p-6" data-testid="admin-inventory-pool-page">
      <h1 className="text-2xl font-bold mb-4">Inventory Pool / Swap</h1>
      <div className="flex gap-2 mb-4">
        <button data-testid="pool-tab-visible" onClick={() => setTab("visible")}
                className={`px-4 py-2 rounded ${tab === "visible" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
          Visible Inventory
        </button>
        <button data-testid="pool-tab-reservations" onClick={() => setTab("reservations")}
                className={`px-4 py-2 rounded ${tab === "reservations" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
          Reservations
        </button>
        <button data-testid="pool-tab-swaps" onClick={() => setTab("swaps")}
                className={`px-4 py-2 rounded ${tab === "swaps" ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
          Swaps
        </button>
      </div>

      {tab === "visible" && (
        <section data-testid="pool-visible-section">
          {inventory.length === 0 ? (
            <p data-testid="pool-visible-empty">No pooled inventory visible yet.</p>
          ) : (
            <table className="w-full text-sm" data-testid="pool-visible-table">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">VIN</th>
                  <th>Vehicle</th>
                  <th>Owning Rooftop</th>
                  <th>Price</th>
                  <th>Days on lot</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((row) => (
                  <tr key={row.vin} className="border-b" data-testid={`pool-row-${row.vin}`}>
                    <td className="p-2 font-mono">{row.vin}</td>
                    <td>{row.year} {row.make} {row.model}</td>
                    <td className="font-mono text-xs">{row.owning_dealer_id}</td>
                    <td>{row.price !== null ? `$${row.price.toLocaleString()}` : "—"}</td>
                    <td>{row.days_on_lot ?? "—"}</td>
                    <td>
                      <button data-testid={`pool-reserve-${row.vin}`}
                              onClick={() => reserve(row.vin, row.owning_dealer_id)}
                              className="px-2 py-1 bg-green-600 text-white rounded text-xs">
                        Reserve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === "reservations" && (
        <section data-testid="pool-reservations-section">
          <h2 className="font-semibold mt-2">Incoming</h2>
          {incoming.length === 0 ? (
            <p data-testid="incoming-empty" className="text-gray-600">No incoming reservations.</p>
          ) : (
            <table className="w-full text-sm mb-4" data-testid="incoming-table">
              <thead><tr className="text-left border-b"><th>VIN</th><th>Requested by</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {incoming.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="font-mono">{r.vin}</td>
                    <td className="font-mono text-xs">{r.requesting_dealer_id}</td>
                    <td>{r.status}</td>
                    <td className="space-x-1">
                      <button data-testid={`approve-${r.id}`} onClick={() => actReservation(r.id, "approve")} className="px-2 py-1 bg-green-500 text-white rounded text-xs">Approve</button>
                      <button data-testid={`reject-${r.id}`} onClick={() => actReservation(r.id, "reject")} className="px-2 py-1 bg-red-500 text-white rounded text-xs">Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2 className="font-semibold mt-2">Outgoing</h2>
          {outgoing.length === 0 ? (
            <p data-testid="outgoing-empty" className="text-gray-600">No outgoing reservations.</p>
          ) : (
            <table className="w-full text-sm" data-testid="outgoing-table">
              <thead><tr className="text-left border-b"><th>VIN</th><th>Owning rooftop</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {outgoing.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="font-mono">{r.vin}</td>
                    <td className="font-mono text-xs">{r.owning_dealer_id}</td>
                    <td>{r.status}</td>
                    <td>
                      {r.status === "approved" && (
                        <button data-testid={`fulfill-${r.id}`} onClick={() => actReservation(r.id, "fulfill")} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Mark fulfilled</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === "swaps" && (
        <section data-testid="pool-swaps-section">
          <div className="flex gap-2 mb-3">
            <input value={groupId} onChange={(e) => setGroupId(e.target.value)} placeholder="Dealer group ID" className="border p-2 rounded" data-testid="swap-group-id" />
            <button onClick={loadSwaps} className="px-3 py-2 bg-blue-600 text-white rounded" data-testid="swap-load">Load swaps</button>
          </div>

          {swaps.length === 0 ? (
            <p data-testid="swaps-empty" className="text-gray-600">No swap proposals yet.</p>
          ) : (
            <table className="w-full text-sm" data-testid="swaps-table">
              <thead><tr className="text-left border-b"><th>VIN A</th><th>Rooftop A</th><th>VIN B</th><th>Rooftop B</th><th>Rationale</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {swaps.map((s) => (
                  <tr key={s.id} className="border-b">
                    <td className="font-mono">{s.vin_a}</td>
                    <td className="font-mono text-xs">{s.dealer_a_id}</td>
                    <td className="font-mono">{s.vin_b}</td>
                    <td className="font-mono text-xs">{s.dealer_b_id}</td>
                    <td>{s.rationale ?? "—"}</td>
                    <td>{s.status}</td>
                    <td className="space-x-1">
                      <button data-testid={`swap-accept-${s.id}`} onClick={() => actSwap(s.id, "accept")} className="px-2 py-1 bg-green-600 text-white rounded text-xs">Accept</button>
                      <button data-testid={`swap-reject-${s.id}`} onClick={() => actSwap(s.id, "reject")} className="px-2 py-1 bg-red-500 text-white rounded text-xs">Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
