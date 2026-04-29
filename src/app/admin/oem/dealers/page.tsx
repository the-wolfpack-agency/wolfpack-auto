import type { Metadata } from "next";
import Link from "next/link";
import { getOemNetworkDealers } from "@/db/queries/oem";
import DealerRow from "./DealerRow";

export const metadata: Metadata = { title: "Dealer Network" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ScorePill({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="text-gray-400">—</span>;
  }
  const color =
    score >= 80
      ? "text-green-700 bg-green-50"
      : score >= 60
      ? "text-yellow-700 bg-yellow-50"
      : "text-red-700 bg-red-50";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      {score.toFixed(1)}%
    </span>
  );
}

export default async function OemDealersPage() {
  const dealers = await getOemNetworkDealers(undefined, 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Link href="/admin/oem" className="hover:text-brand-600">OEM Network</Link>
            <span>/</span>
            <span>Dealer Network</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Dealer Network</h1>
          <p className="mt-1 text-sm text-gray-500">
            {dealers.length > 0
              ? `${dealers.length} dealer${dealers.length !== 1 ? "s" : ""} in network`
              : "Manage franchise dealers, program enrollments, and performance benchmarks."}
          </p>
        </div>
        <Link
          href="/admin/oem/programs"
          className="self-start rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          Manage Programs
        </Link>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {dealers.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <svg
              className="mx-auto h-10 w-10 text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
            <p className="mt-3 text-sm font-medium text-gray-600">No dealers found</p>
            <p className="mt-1 text-xs text-gray-400">
              Add dealers to your network to see them listed here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">Dealer</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">Franchise</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 text-right">Vehicles</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 text-right">Leads</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 text-right">Programs</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 text-right">Avg Score</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dealers.map((d) => (
                  <DealerRow key={d.id} dealerId={d.id} testId={`dealer-row-${d.id}`}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{d.name}</p>
                      <p className="text-xs text-gray-400">{d.subdomain}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {d.franchise_code ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700">{d.vehicle_count}</td>
                    <td className="px-5 py-3 text-right text-gray-700">{d.lead_count}</td>
                    <td className="px-5 py-3 text-right text-gray-700">{d.enrolled_programs}</td>
                    <td className="px-5 py-3 text-right">
                      <ScorePill score={d.avg_program_score} />
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          d.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {d.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{formatDate(d.created_at)}</td>
                  </DealerRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
