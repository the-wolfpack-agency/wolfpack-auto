/**
 * /admin/oem/dealers/[id] — dealer detail view inside the OEM admin
 *
 * Renders summary stats + activity for a single dealer from the OEM
 * network. Pulls from `getOemNetworkDealers()` (the same source as the
 * list page) and filters to the matching id; no separate query yet so
 * we don't double the SQL surface area for a read-only view.
 *
 * The page links back to /admin/oem/dealers and surfaces the four
 * stats already in the list (vehicle_count, lead_count,
 * enrolled_programs, avg_program_score) plus contact + status meta
 * the list omits. When the dealer can't be located, a friendly empty
 * state lets the operator click back to the network table.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOemNetworkDealers } from "@/db/queries/oem";

export const metadata: Metadata = { title: "Dealer Details — OEM Network" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DealerDetailPage({ params }: PageProps) {
  const { id } = await params;
  const dealers = await getOemNetworkDealers(undefined, 500);
  const dealer = dealers.find((d) => d.id === id);

  if (!dealer) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin/oem" className="hover:text-brand-600">
          OEM Network
        </Link>
        <span>/</span>
        <Link href="/admin/oem/dealers" className="hover:text-brand-600">
          Dealer Network
        </Link>
        <span>/</span>
        <span className="text-gray-700">{dealer.name}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{dealer.name}</h1>
          <p className="text-sm text-gray-400">
            {dealer.subdomain}
            {dealer.franchise_code ? <> · franchise {dealer.franchise_code}</> : null}
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
            dealer.is_active
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {dealer.is_active ? "Active" : "Inactive"}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Vehicles" value={String(dealer.vehicle_count)} />
        <Stat label="Leads" value={String(dealer.lead_count)} />
        <Stat label="Enrolled Programs" value={String(dealer.enrolled_programs)} />
        <Stat
          label="Avg Program Score"
          value={
            dealer.avg_program_score !== null
              ? dealer.avg_program_score.toFixed(1)
              : "—"
          }
        />
      </div>

      {/* Meta */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Contact</h2>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-gray-400">Phone</dt>
            <dd className="text-gray-700">{dealer.phone || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Email</dt>
            <dd className="text-gray-700">{dealer.email || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Slug</dt>
            <dd className="font-mono text-gray-700">{dealer.slug}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400">Joined</dt>
            <dd className="text-gray-700">{formatDate(dealer.created_at)}</dd>
          </div>
        </dl>
      </div>

      {/* Quick links into the dealer's records on the OEM admin */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Quick links</h2>
        <ul className="space-y-1 text-sm">
          <li>
            <Link
              href={`/admin/oem/programs?dealer=${encodeURIComponent(dealer.id)}`}
              className="text-brand-700 hover:underline"
            >
              View programs this dealer is enrolled in →
            </Link>
          </li>
          <li>
            <Link
              href={`/dealers/${encodeURIComponent(dealer.slug)}`}
              className="text-brand-700 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Open the dealer's public storefront →
            </Link>
          </li>
        </ul>
      </div>

      <div>
        <Link
          href="/admin/oem/dealers"
          className="text-sm text-brand-700 hover:underline"
        >
          ← Back to dealer network
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}
