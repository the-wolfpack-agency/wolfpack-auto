"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchJson } from "@/lib/safe-fetch";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface HouseholdSummary {
  id: string;
  familyName: string;
  memberCount: number;
  vehicleCount: number;
  lifetimeValue: number;
  opportunityCount: number;
}

interface HouseholdMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  address: string;
  zip: string;
  joinedAt: string;
}

interface HouseholdVehicle {
  id: string;
  ownerId: string;
  year: number;
  make: string;
  model: string;
  vin: string;
  status: "current" | "traded" | "sold";
  purchaseDate: string;
  saleDate?: string;
  purchasePrice: number;
}

interface HouseholdOpportunity {
  type: string;
  description: string;
  memberId: string;
  memberName: string;
  priority: "high" | "medium" | "low";
}

interface HouseholdLifetimeValue {
  totalVehiclePurchases: number;
  totalFiRevenue: number;
  totalServiceRevenue: number;
  totalRevenue: number;
  memberCount: number;
  vehicleCount: number;
  firstPurchaseDate: string;
  latestActivityDate: string;
}

interface HouseholdDetail {
  id: string;
  familyName: string;
  members: HouseholdMember[];
  vehicles: HouseholdVehicle[];
  lifetimeValue: HouseholdLifetimeValue;
  opportunities: HouseholdOpportunity[];
  createdAt: string;
}

interface HouseholdStats {
  totalHouseholds: number;
  avgLifetimeValue: number;
  avgVehiclesPerHousehold: number;
  totalOpportunities: number;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function priorityBadge(priority: string): string {
  if (priority === "high") return "bg-red-100 text-red-800 border-red-200";
  if (priority === "medium") return "bg-yellow-100 text-yellow-800 border-yellow-200";
  return "bg-gray-100 text-gray-800 border-gray-200";
}

function roleBadge(role: string): string {
  if (role === "primary") return "bg-blue-100 text-blue-800";
  if (role === "spouse") return "bg-purple-100 text-purple-800";
  if (role === "child") return "bg-green-100 text-green-800";
  return "bg-gray-100 text-gray-800";
}

function vehicleStatusBadge(status: string): string {
  if (status === "current") return "bg-green-100 text-green-800";
  if (status === "traded") return "bg-yellow-100 text-yellow-800";
  return "bg-gray-100 text-gray-800";
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function HouseholdsPage() {
  const [households, setHouseholds] = useState<HouseholdSummary[]>([]);
  const [stats, setStats] = useState<HouseholdStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<HouseholdDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchHouseholds = useCallback(() => {
    setLoading(true);
    fetchJson<{ households?: HouseholdSummary[]; stats?: HouseholdStats | null }>("/api/admin/households")
      .then((data) => {
        setHouseholds(data.households ?? []);
        setStats(data.stats ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchHouseholds();
  }, [fetchHouseholds]);

  const handleDetect = () => {
    setDetecting(true);
    fetchJson("/api/admin/households", { method: "POST" })
      .then(() => {
        fetchHouseholds();
      })
      .catch(() => {})
      .finally(() => setDetecting(false));
  };

  const toggleExpand = (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(id);
    setDetailLoading(true);
    fetchJson<{ household?: HouseholdDetail | null }>(`/api/admin/households?householdId=${id}`)
      .then((data) => setDetail(data.household ?? null))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Customer Households</h1>
            <p className="text-gray-500 mt-1">
              Group family members and vehicles for a complete Customer 360 view
            </p>
          </div>
          <button
            onClick={handleDetect}
            disabled={detecting}
            className="mt-4 md:mt-0 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm font-medium"
          >
            {detecting ? "Detecting..." : "Detect Households"}
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-500">Total Households</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalHouseholds}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-500">Avg Lifetime Value</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(stats.avgLifetimeValue)}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-500">Avg Vehicles / Household</p>
              <p className="text-2xl font-bold text-gray-900">{stats.avgVehiclesPerHousehold}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-500">Open Opportunities</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalOpportunities}</p>
            </div>
          </div>
        )}

        {/* Household list */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
          </div>
        ) : households.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">No households found</p>
            <p className="mt-2">Click &quot;Detect Households&quot; to automatically group customers by family.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {households.map((hh) => (
              <div key={hh.id} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Summary row */}
                <button
                  onClick={() => toggleExpand(hh.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg font-bold text-gray-600">
                      {hh.familyName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">The {hh.familyName} Family</p>
                      <p className="text-sm text-gray-500">
                        {hh.memberCount} members &middot; {hh.vehicleCount} vehicles
                        {hh.opportunityCount > 0 && (
                          <span className="ml-2 text-orange-600">
                            &middot; {hh.opportunityCount} opportunities
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">
                      {formatCurrency(hh.lifetimeValue)}
                    </p>
                    <p className="text-xs text-gray-500">lifetime value</p>
                  </div>
                </button>

                {/* Expanded detail */}
                {expanded === hh.id && (
                  <div className="border-t border-gray-200 bg-gray-50 p-4">
                    {detailLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900" />
                      </div>
                    ) : detail ? (
                      <div className="space-y-6">
                        {/* Members */}
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                            Members
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {detail.members.map((m) => (
                              <div
                                key={m.id}
                                className="bg-white border border-gray-200 rounded-lg p-3"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <p className="font-medium text-gray-900">
                                    {m.firstName} {m.lastName}
                                  </p>
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded-full ${roleBadge(m.role)}`}
                                  >
                                    {m.role}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-500">{m.email}</p>
                                <p className="text-sm text-gray-500">{m.phone}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Vehicles */}
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                            Vehicles
                          </h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-gray-500 border-b border-gray-200">
                                  <th className="pb-2 font-medium">Vehicle</th>
                                  <th className="pb-2 font-medium">Owner</th>
                                  <th className="pb-2 font-medium">Status</th>
                                  <th className="pb-2 font-medium">Purchase Date</th>
                                  <th className="pb-2 font-medium text-right">Price</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.vehicles.map((v) => {
                                  const owner = detail.members.find((m) => m.id === v.ownerId);
                                  return (
                                    <tr
                                      key={v.id}
                                      className="border-b border-gray-100 last:border-0"
                                    >
                                      <td className="py-2 font-medium text-gray-900">
                                        {v.year} {v.make} {v.model}
                                      </td>
                                      <td className="py-2 text-gray-600">
                                        {owner ? owner.firstName : "Unknown"}
                                      </td>
                                      <td className="py-2">
                                        <span
                                          className={`text-xs px-2 py-0.5 rounded-full ${vehicleStatusBadge(v.status)}`}
                                        >
                                          {v.status}
                                        </span>
                                      </td>
                                      <td className="py-2 text-gray-600">
                                        {new Date(v.purchaseDate).toLocaleDateString()}
                                      </td>
                                      <td className="py-2 text-right text-gray-900">
                                        {formatCurrency(v.purchasePrice)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Lifetime Value Breakdown */}
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                            Lifetime Value Breakdown
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-xs text-gray-500">Vehicle Purchases</p>
                              <p className="text-lg font-bold text-gray-900">
                                {formatCurrency(detail.lifetimeValue.totalVehiclePurchases)}
                              </p>
                            </div>
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-xs text-gray-500">F&I Revenue</p>
                              <p className="text-lg font-bold text-gray-900">
                                {formatCurrency(detail.lifetimeValue.totalFiRevenue)}
                              </p>
                            </div>
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-xs text-gray-500">Service Revenue</p>
                              <p className="text-lg font-bold text-gray-900">
                                {formatCurrency(detail.lifetimeValue.totalServiceRevenue)}
                              </p>
                            </div>
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-xs text-gray-500">Total Revenue</p>
                              <p className="text-lg font-bold text-green-700">
                                {formatCurrency(detail.lifetimeValue.totalRevenue)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Opportunities */}
                        {detail.opportunities.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                              Opportunities
                            </h4>
                            <div className="space-y-2">
                              {detail.opportunities.map((opp, i) => (
                                <div
                                  key={i}
                                  className={`border rounded-lg p-3 flex items-start gap-3 ${priorityBadge(opp.priority)}`}
                                >
                                  <div className="flex-1">
                                    <p className="font-medium">{opp.description}</p>
                                    <p className="text-sm mt-0.5 opacity-75">
                                      {opp.memberName} &middot; {opp.type.replace("_", " ")}
                                    </p>
                                  </div>
                                  <span className="text-xs font-semibold uppercase">
                                    {opp.priority}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-500 py-4 text-center">Failed to load details</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
