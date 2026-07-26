import type { Metadata } from "next";
import { pool } from "@/lib/db";
import { getServerDealerId } from "@/lib/server-dealer";

export const metadata: Metadata = {
  title: "Billing | Admin Portal",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BillingData {
  subscription_status: string | null;
  subscription_plan: string | null;
  trial_ends_at: string | null;
  billing_email: string | null;
  migrationPending?: boolean;
}

// ---------------------------------------------------------------------------
// Data fetching (direct DB -- same Node.js process, no extra round-trip)
// ---------------------------------------------------------------------------

async function getBillingData(): Promise<BillingData> {
  const dealerId = await getServerDealerId();

  try {
    const { rows } = await pool.query(
      `SELECT
         subscription_status,
         subscription_plan,
         trial_ends_at,
         billing_email
       FROM dealers
       WHERE id = $1`,
      [dealerId]
    );

    if (!rows.length) {
      return { subscription_status: "active", subscription_plan: "professional", trial_ends_at: null, billing_email: null };
    }

    return rows[0] as BillingData;
  } catch {
    // Migration 005 not yet applied -- surface graceful pending notice
    return {
      subscription_status: "active",
      subscription_plan: "professional",
      trial_ends_at: null,
      billing_email: null,
      migrationPending: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusColors(status: string | null): string {
  const map: Record<string, string> = {
    trial: "bg-brand-100 text-brand-800",
    active: "bg-green-100 text-green-700",
    past_due: "bg-yellow-100 text-yellow-700",
    canceled: "bg-red-100 text-red-700",
    paused: "bg-gray-100 text-gray-600",
  };
  return map[status ?? "active"] ?? "bg-gray-100 text-gray-600";
}

function statusLabel(status: string | null): string {
  const map: Record<string, string> = {
    trial: "Trial",
    active: "Active",
    past_due: "Past Due",
    canceled: "Canceled",
    paused: "Paused",
  };
  return map[status ?? "active"] ?? "Unknown";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MigrationPendingNotice() {
  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-sm font-medium text-gray-700">
        Professional plan active
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Connect your database to unlock full billing features.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function BillingPage() {
  const billing = await getBillingData();

  // Analytics tracking -- client-side import not available in RSC,
  // but the trackSystem call is embedded in the client component below.

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing &amp; Subscription</h1>
        <p className="mt-1 text-sm text-gray-500">
          View your current plan and subscription status.
        </p>
      </div>

      {/* Migration pending notice */}
      {billing.migrationPending && <MigrationPendingNotice />}

      {/* Current plan card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl font-bold text-brand-800">
            Current Plan: Professional
          </span>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusColors(billing.subscription_status)}`}
          >
            {statusLabel(billing.subscription_status)}
          </span>
        </div>

        <p className="mt-3 text-sm text-gray-600">
          All dealers receive the full Professional feature set. All features are
          included at no additional tier cost.
        </p>

        {billing.billing_email && (
          <p className="mt-3 text-sm text-gray-500">
            Billing email:{" "}
            <span className="font-medium text-gray-700">{billing.billing_email}</span>
          </p>
        )}

        {/* Contact for subscription management */}
        <div className="mt-6">
          <a
            href="mailto:billing@wolfpackauto.com?subject=Subscription%20Management"
            className="inline-flex items-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
          >
            Contact Us to Manage Your Subscription
          </a>
          <p className="mt-2 text-xs text-gray-500">
            Email billing@wolfpackauto.com for invoices, payment changes, or cancellations.
          </p>
        </div>
      </div>

      {/* Past due / canceled alert */}
      {(billing.subscription_status === "past_due" ||
        billing.subscription_status === "canceled") && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-4">
          <p className="font-semibold text-red-800">
            {billing.subscription_status === "past_due"
              ? "Payment issue detected -- please contact billing"
              : "Subscription canceled -- contact us to reactivate"}
          </p>
          <p className="mt-1 text-sm text-red-700">
            Some features may be restricted until your billing is resolved.
          </p>
          <a
            href="mailto:billing@wolfpackauto.com?subject=Billing%20Issue"
            className="mt-3 inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Contact Billing
          </a>
        </div>
      )}

      {/* Analytics tracking */}
      <BillingPageTracker />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Client component for analytics tracking
// ---------------------------------------------------------------------------

async function BillingPageTracker() {
  // Server component -- fire tracking on render.
  // trackSystem is imported at the module level to avoid dynamic import issues.
  try {
    const { trackSystem } = require("@/lib/analytics-hooks");
    const dealerId = await getServerDealerId();
    trackSystem("system.analytics_queried", dealerId, { module: "billing" });
  } catch {
    // Analytics should never block rendering
  }
  return null;
}
