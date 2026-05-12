"use client";

import { useCallback, useEffect, useState } from "react";
import ExternalCredentialsPanel from "@/components/admin/ExternalCredentialsPanel";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type Provider = "hubspot" | "salesforce" | "zapier" | "custom";

interface WebhookConfig {
  id: string;
  dealer_id: string;
  provider: Provider;
  url: string;
  api_key?: string;
  events: string[];
  active: boolean;
}

const ALL_EVENTS = [
  { value: "lead.created", label: "Lead Created" },
  { value: "lead.status_changed", label: "Lead Status Changed" },
  { value: "vehicle.added", label: "Vehicle Added" },
] as const;

const PROVIDERS: {
  value: Provider;
  label: string;
  description: string;
  urlPlaceholder: string;
}[] = [
  {
    value: "hubspot",
    label: "HubSpot",
    description:
      "Sync leads directly to HubSpot CRM contacts with mapped properties.",
    urlPlaceholder: "https://api.hubapi.com/crm/v3/objects/contacts",
  },
  {
    value: "salesforce",
    label: "Salesforce",
    description:
      "Push leads to Salesforce as Lead objects with field mapping.",
    urlPlaceholder: "https://your-instance.salesforce.com/services/data/v59.0/sobjects/Lead",
  },
  {
    value: "zapier",
    label: "Zapier",
    description:
      "Trigger Zapier workflows on lead and inventory events.",
    urlPlaceholder: "https://hooks.zapier.com/hooks/catch/...",
  },
  {
    value: "custom",
    label: "Custom Webhook",
    description:
      "Send raw JSON payloads to any endpoint.",
    urlPlaceholder: "https://your-server.com/webhook",
  },
];

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function IntegrationsPage() {
  const [configs, setConfigs] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, "success" | "error" | null>>({});
  const [toast, setToast] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Load existing configs
  // -----------------------------------------------------------------------
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/settings/integrations");
        if (res.ok) {
          const data = await res.json();
          setConfigs(data.configs ?? []);
        }
      } catch {
        // No configs yet — that's fine
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  // -----------------------------------------------------------------------
  // Helpers: find or create a config for a provider
  // -----------------------------------------------------------------------
  const getConfig = useCallback(
    (provider: Provider): WebhookConfig => {
      const existing = configs.find((c) => c.provider === provider);
      if (existing) return existing;
      return {
        id: `wh_${provider}_${Date.now()}`,
        dealer_id: "",
        provider,
        url: "",
        api_key: "",
        events: [],
        active: false,
      };
    },
    [configs],
  );

  const updateConfig = useCallback(
    (provider: Provider, patch: Partial<WebhookConfig>) => {
      setConfigs((prev) => {
        const idx = prev.findIndex((c) => c.provider === provider);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...patch };
          return updated;
        }
        // Create new entry
        const base = getConfig(provider);
        return [...prev, { ...base, ...patch }];
      });
    },
    [getConfig],
  );

  // -----------------------------------------------------------------------
  // Save
  // -----------------------------------------------------------------------
  const handleSave = useCallback(
    async (provider: Provider) => {
      const config = configs.find((c) => c.provider === provider) ?? getConfig(provider);
      setSaving(provider);
      try {
        const res = await fetch("/api/admin/settings/integrations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        });
        if (res.ok) {
          setToast(`${provider} integration saved.`);
        } else {
          const err = await res.json().catch(() => ({ error: "Save failed" }));
          setToast(`Error: ${err.error ?? "Save failed"}`);
        }
      } catch {
        setToast("Network error saving integration.");
      } finally {
        setSaving(null);
        setTimeout(() => setToast(null), 3000);
      }
    },
    [configs, getConfig],
  );

  // -----------------------------------------------------------------------
  // Test connection
  // -----------------------------------------------------------------------
  const handleTest = useCallback(
    async (provider: Provider) => {
      const config = configs.find((c) => c.provider === provider) ?? getConfig(provider);
      if (!config.url) {
        setToast("Please enter a webhook URL first.");
        setTimeout(() => setToast(null), 3000);
        return;
      }
      setTesting(provider);
      setTestResults((prev) => ({ ...prev, [provider]: null }));
      try {
        const res = await fetch(config.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.api_key ? { Authorization: `Bearer ${config.api_key}` } : {}),
          },
          body: JSON.stringify({
            event: "test.ping",
            timestamp: new Date().toISOString(),
            data: { message: "Wolfpack Auto webhook test" },
          }),
        });
        setTestResults((prev) => ({
          ...prev,
          [provider]: res.ok ? "success" : "error",
        }));
      } catch {
        setTestResults((prev) => ({ ...prev, [provider]: "error" }));
      } finally {
        setTesting(null);
      }
    },
    [configs, getConfig],
  );

  // -----------------------------------------------------------------------
  // Event toggle
  // -----------------------------------------------------------------------
  const toggleEvent = useCallback(
    (provider: Provider, event: string) => {
      const config = getConfig(provider);
      const current = configs.find((c) => c.provider === provider)?.events ?? config.events;
      const next = current.includes(event)
        ? current.filter((e) => e !== event)
        : [...current, event];
      updateConfig(provider, { events: next });
    },
    [configs, getConfig, updateConfig],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed right-4 top-4 z-50 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect your CRM, automation tools, and custom webhooks to sync lead
          and inventory data in real time.
        </p>
      </div>

      <div className="mb-8">
        <ExternalCredentialsPanel />
      </div>

      <div className="space-y-6">
        {PROVIDERS.map((prov) => {
          const config =
            configs.find((c) => c.provider === prov.value) ??
            getConfig(prov.value);
          const testResult = testResults[prov.value];

          return (
            <section
              key={prov.value}
              className="rounded-card border border-surface-border bg-white p-6 shadow-card"
            >
              {/* Header row */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {prov.label}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {prov.description}
                  </p>
                </div>

                {/* Toggle */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={config.active}
                  onClick={() =>
                    updateConfig(prov.value, { active: !config.active })
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                    config.active ? "bg-brand-600" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                      config.active ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Config fields */}
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {/* Webhook URL */}
                <div className="sm:col-span-2">
                  <label
                    htmlFor={`url-${prov.value}`}
                    className="block text-sm font-medium text-gray-700"
                  >
                    Webhook URL
                  </label>
                  <input
                    id={`url-${prov.value}`}
                    type="url"
                    value={config.url}
                    onChange={(e) =>
                      updateConfig(prov.value, { url: e.target.value })
                    }
                    placeholder={prov.urlPlaceholder}
                    className="mt-1 block w-full rounded-lg border border-surface-border px-4 py-2 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>

                {/* API Key */}
                <div className="sm:col-span-2">
                  <label
                    htmlFor={`key-${prov.value}`}
                    className="block text-sm font-medium text-gray-700"
                  >
                    API Key / Access Token
                  </label>
                  <input
                    id={`key-${prov.value}`}
                    type="password"
                    value={config.api_key ?? ""}
                    onChange={(e) =>
                      updateConfig(prov.value, { api_key: e.target.value })
                    }
                    placeholder="Paste your API key"
                    className="mt-1 block w-full rounded-lg border border-surface-border px-4 py-2 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>

                {/* Events */}
                <fieldset className="sm:col-span-2">
                  <legend className="text-sm font-medium text-gray-700">
                    Events
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-4">
                    {ALL_EVENTS.map((evt) => (
                      <label
                        key={evt.value}
                        className="flex items-center gap-2 text-sm text-gray-700"
                      >
                        <input
                          type="checkbox"
                          checked={config.events.includes(evt.value)}
                          onChange={() => toggleEvent(prov.value, evt.value)}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                        {evt.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>

              {/* Actions */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleSave(prov.value)}
                  disabled={saving === prov.value}
                  className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50"
                >
                  {saving === prov.value ? "Saving..." : "Save"}
                </button>

                <button
                  type="button"
                  onClick={() => handleTest(prov.value)}
                  disabled={testing === prov.value}
                  className="rounded-lg border border-surface-border bg-white px-5 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50"
                >
                  {testing === prov.value ? "Testing..." : "Test Connection"}
                </button>

                {testResult === "success" && (
                  <span className="text-sm font-medium text-green-600">
                    Connected successfully
                  </span>
                )}
                {testResult === "error" && (
                  <span className="text-sm font-medium text-red-600">
                    Connection failed
                  </span>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
