"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface DripStep {
  stepNumber: number;
  subject: string;
  bodyTemplate: string;
  delayHours: number;
}

interface DripCampaign {
  id: string;
  dealerId: string;
  name: string;
  trigger: string;
  steps: DripStep[];
  active: boolean;
  createdAt: string;
  stats: {
    totalEnrolled: number;
    totalConverted: number;
    totalUnsubscribed: number;
    emailsSent: number;
    conversionRate: number;
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const TRIGGER_LABELS: Record<string, string> = {
  lead_created: "New Lead Created",
  vehicle_viewed_3x: "Vehicle Viewed 3+ Times",
  form_abandoned: "Form Abandoned",
  no_activity_7d: "No Activity (7 Days)",
  price_drop_on_viewed_vehicle: "Price Drop on Viewed Vehicle",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function DripCampaignsPage() {
  const [campaigns, setCampaigns] = useState<DripCampaign[]>([]);
  const [totalEnrolled, setTotalEnrolled] = useState(0);
  const [totalConverted, setTotalConverted] = useState(0);
  const [overallRate, setOverallRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/drip-campaigns");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setCampaigns(data.campaigns);
        setTotalEnrolled(data.totalEnrolled);
        setTotalConverted(data.totalConverted);
        setOverallRate(data.overallConversionRate);
      } catch {
        setError("Failed to load drip campaigns");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Drip Campaigns</h1>
        <p className="mt-1 text-sm text-gray-500">
          Automated behavior-triggered email sequences to nurture leads.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Active Campaigns</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {campaigns.filter((c) => c.active).length}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Total Enrolled</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{totalEnrolled}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Conversions</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{totalConverted}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Conversion Rate</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{overallRate}%</p>
        </div>
      </div>

      {/* Campaign list */}
      <div className="space-y-4">
        {campaigns.map((campaign) => (
          <div
            key={campaign.id}
            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-gray-900">
                    {campaign.name}
                  </h3>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      campaign.active
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {campaign.active ? "Active" : "Paused"}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-gray-500">
                  Trigger: {TRIGGER_LABELS[campaign.trigger] ?? campaign.trigger}
                </p>
                <p className="text-xs text-gray-400">
                  Created {formatDate(campaign.createdAt)} | {campaign.steps.length} steps
                </p>
              </div>
              <button
                onClick={() =>
                  setExpandedId(expandedId === campaign.id ? null : campaign.id)
                }
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                {expandedId === campaign.id ? "Collapse" : "Details"}
              </button>
            </div>

            {/* Stats row */}
            <div className="mt-3 flex gap-6 text-xs text-gray-500">
              <span>
                <strong className="text-gray-700">{campaign.stats.totalEnrolled}</strong> enrolled
              </span>
              <span>
                <strong className="text-emerald-600">{campaign.stats.totalConverted}</strong> converted
              </span>
              <span>
                <strong className="text-gray-700">{campaign.stats.emailsSent}</strong> emails sent
              </span>
              <span>
                <strong className="text-red-600">{campaign.stats.totalUnsubscribed}</strong> unsubscribed
              </span>
              <span>
                <strong className="text-gray-700">{campaign.stats.conversionRate}%</strong> conv. rate
              </span>
            </div>

            {/* Expanded: steps */}
            {expandedId === campaign.id && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <h4 className="text-sm font-semibold text-gray-900">Email Steps</h4>
                <div className="mt-2 space-y-2">
                  {campaign.steps.map((step) => (
                    <div
                      key={step.stepNumber}
                      className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                        {step.stepNumber}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{step.subject}</p>
                        <p className="text-xs text-gray-400">
                          Delay: {step.delayHours}h after previous step
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
