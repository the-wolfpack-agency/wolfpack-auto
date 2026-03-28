import type { Metadata } from "next";
import { pool } from "@/lib/db";

export const metadata: Metadata = {
  title: "Billing | Admin | Wolfpack Auto",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BillingData {
  subscription_status: string | null;
  subscription_plan: string | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  billing_email: string | null;
  migrationPending?: boolean;
}

// ---------------------------------------------------------------------------
// Data fetching (direct DB — same Node.js process, no extra round-trip)
// ---------------------------------------------------------------------------

async function getBillingData(): Promise<BillingData> {
  const dealerId =
    process.env.DEALER_ID ?? "00000000-0000-4000-a000-000000000001";

  try {
    const { rows } = await pool.query(
      `SELECT
         subscription_status,
         subscription_plan,
         trial_ends_at,
         stripe_customer_id,
         billing_email
       FROM dealers
       WHERE id = $1`,
      [dealerId]
    );

    if (!rows.length) {
      return { subscription_status: "trial", subscription_plan: "starter", trial_ends_at: null, stripe_customer_id: null, billing_email: null };
    }

    return rows[0] as BillingData;
  } catch {
    // Migration 005 not yet applied — surface graceful pending notice
    return {
      subscription_status: "trial",
      subscription_plan: "starter",
      trial_ends_at: null,
      stripe_customer_id: null,
      billing_email: null,
      migrationPending: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trialDaysRemaining(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function planLabel(plan: string | null): string {
  const map: Record<string, string> = {
    starter: "Starter",
    professional: "Professional",
    enterprise: "Enterprise",
  };
  return map[plan ?? "starter"] ?? "Starter";
}

function statusColors(status: string | null): string {
  const map: Record<string, string> = {
    trial: "bg-blue-100 text-blue-700",
    active: "bg-green-100 text-green-700",
    past_due: "bg-yellow-100 text-yellow-700",
    canceled: "bg-red-100 text-red-700",
    paused: "bg-gray-100 text-gray-600",
  };
  return map[status ?? "trial"] ?? "bg-gray-100 text-gray-600";
}

function statusLabel(status: string | null): string {
  const map: Record<string, string> = {
    trial: "Trial",
    active: "Active",
    past_due: "Past Due",
    canceled: "Canceled",
    paused: "Paused",
  };
  return map[status ?? "trial"] ?? "Unknown";
}

function planAccent(plan: string | null): string {
  const map: Record<string, string> = {
    starter: "text-gray-800",
    professional: "text-blue-700",
    enterprise: "text-purple-700",
  };
  return map[plan ?? "starter"] ?? "text-gray-800";
}

// ---------------------------------------------------------------------------
// Plan comparison data
// ---------------------------------------------------------------------------

const PLANS = [
  { key: "starter", label: "Starter", price: "$99/mo" },
  { key: "professional", label: "Professional", price: "$299/mo" },
  { key: "enterprise", label: "Enterprise", price: "Custom" },
] as const;

const FEATURES: { label: string; starter: string; professional: string; enterprise: string }[] = [
  { label: "Dealers", starter: "1", professional: "Up to 5", enterprise: "Unlimited" },
  { label: "Vehicles", starter: "200", professional: "1,000", enterprise: "Unlimited" },
  { label: "OEM Portal", starter: "No", professional: "Yes", enterprise: "Yes" },
  { label: "Analytics", starter: "Basic", professional: "Advanced", enterprise: "Custom" },
  { label: "Support", starter: "Email", professional: "Priority", enterprise: "Dedicated" },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MigrationPendingNotice() {
  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-sm font-medium text-gray-700">
        Trial plan active
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Connect your database to unlock full billing features and manage your subscription.
      </p>
    </div>
  );
}

function PlanBadge({ plan, status }: { plan: string | null; status: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className={`text-2xl font-bold ${planAccent(plan)}`}>
        {planLabel(plan)} Plan
      </span>
      <span
        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusColors(status)}`}
      >
        {statusLabel(status)}
      </span>
    </div>
  );
}

function TrialBanner({ daysRemaining }: { daysRemaining: number | null }) {
  if (daysRemaining === null) return null;

  const urgent = daysRemaining <= 7;
  return (
    <div
      className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
        urgent
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-blue-200 bg-blue-50 text-blue-800"
      }`}
    >
      {daysRemaining === 0 ? (
        <span className="font-semibold">Your trial has ended. Please upgrade to continue.</span>
      ) : (
        <>
          <span className="font-semibold">{daysRemaining} day{daysRemaining !== 1 ? "s" : ""}</span> remaining in your free trial.
          {urgent && " Upgrade now to avoid interruption."}
        </>
      )}
    </div>
  );
}

function PlanComparison({ currentPlan }: { currentPlan: string | null }) {
  const check = "✓";
  const cross = "✗";

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              Feature
            </th>
            {PLANS.map((p) => (
              <th
                key={p.key}
                className={`px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider ${
                  currentPlan === p.key ? "bg-blue-50 text-blue-700" : "text-gray-500"
                }`}
              >
                <div>{p.label}</div>
                <div className="mt-0.5 font-bold text-base normal-case text-gray-800">
                  {p.price}
                </div>
                {currentPlan === p.key && (
                  <div className="mt-1">
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
                      Current
                    </span>
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {FEATURES.map((f) => (
            <tr key={f.label} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-700">{f.label}</td>
              {(["starter", "professional", "enterprise"] as const).map((plan) => {
                const val = f[plan];
                const isCheck = val === "Yes";
                const isCross = val === "No";
                return (
                  <td
                    key={plan}
                    className={`px-4 py-3 text-center ${
                      currentPlan === plan ? "bg-blue-50" : ""
                    } ${
                      isCheck
                        ? "font-semibold text-green-600"
                        : isCross
                        ? "text-gray-400"
                        : "text-gray-700"
                    }`}
                  >
                    {isCheck ? check : isCross ? cross : val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function BillingPage() {
  const billing = await getBillingData();

  const daysRemaining =
    billing.subscription_status === "trial"
      ? trialDaysRemaining(billing.trial_ends_at)
      : null;

  const stripePortalUrl = process.env.NEXT_PUBLIC_STRIPE_BILLING_URL ?? "#";
  const upgradeUrl = stripePortalUrl !== "#" ? stripePortalUrl : "#";

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing &amp; Subscription</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your plan, view usage limits, and update payment details.
        </p>
      </div>

      {/* Migration pending notice */}
      {billing.migrationPending && <MigrationPendingNotice />}

      {/* Current plan card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <PlanBadge plan={billing.subscription_plan} status={billing.subscription_status} />
        <TrialBanner daysRemaining={daysRemaining} />

        {billing.billing_email && (
          <p className="mt-3 text-sm text-gray-500">
            Billing email:{" "}
            <span className="font-medium text-gray-700">{billing.billing_email}</span>
          </p>
        )}

        {/* CTA buttons */}
        <div className="mt-6 flex flex-wrap gap-3">
          {billing.subscription_status !== "active" ||
          billing.subscription_plan === "starter" ||
          billing.subscription_plan === "professional" ? (
            <a
              href={upgradeUrl}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              target={upgradeUrl !== "#" ? "_blank" : undefined}
              rel={upgradeUrl !== "#" ? "noopener noreferrer" : undefined}
            >
              Upgrade Plan
            </a>
          ) : null}

          {billing.stripe_customer_id && (
            <a
              href={stripePortalUrl}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              Manage Billing
            </a>
          )}
        </div>
      </div>

      {/* Plan comparison */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Plan Comparison</h2>
        <PlanComparison currentPlan={billing.subscription_plan} />
      </div>

      {/* Past due / canceled alert */}
      {(billing.subscription_status === "past_due" ||
        billing.subscription_status === "canceled") && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-4">
          <p className="font-semibold text-red-800">
            {billing.subscription_status === "past_due"
              ? "Payment failed — please update your payment method"
              : "Subscription canceled — reactivate to restore access"}
          </p>
          <p className="mt-1 text-sm text-red-700">
            Some features may be restricted until your billing is resolved.
          </p>
          <a
            href={stripePortalUrl}
            className="mt-3 inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            target={stripePortalUrl !== "#" ? "_blank" : undefined}
            rel={stripePortalUrl !== "#" ? "noopener noreferrer" : undefined}
          >
            Resolve Billing
          </a>
        </div>
      )}
    </div>
  );
}
