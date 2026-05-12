"use client";

/**
 * ExternalCredentialsPanel — settings/integrations section for BYO
 * external API credentials (KBB / vAuto / MMR / Carfax / AutoCheck /
 * Plaid / Edmunds). Lists existing credentials, accepts new entries,
 * supports rotate + revoke. Plaintext is sent to the route, encrypted
 * server-side via src/lib/external-credentials/crypto-vault, never
 * stored client-side past the form submission.
 *
 * Honesty note rendered inline: KBB does not issue per-dealer credentials
 * in practice today — the slot exists for future-partnership shape but
 * real valuations should use Edmunds (free).
 */

import { useCallback, useEffect, useState } from "react";

interface CredentialRecord {
  id: string;
  dealerId: string;
  provider: ExternalProvider;
  label: string | null;
  status: "active" | "revoked" | "rotating";
  createdAt: string;
  rotatedAt: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
}

type ExternalProvider =
  | "kbb"
  | "vauto"
  | "mmr"
  | "carfax"
  | "autocheck"
  | "plaid"
  | "edmunds";

interface ProviderMeta {
  value: ExternalProvider;
  label: string;
  description: string;
  realToday: boolean;
}

const PROVIDERS: ProviderMeta[] = [
  {
    value: "carfax",
    label: "Carfax for Dealers",
    description:
      "Per-vehicle history reports. Requires Carfax-for-Dealers subscription.",
    realToday: true,
  },
  {
    value: "autocheck",
    label: "AutoCheck (Experian)",
    description:
      "Per-vehicle history + AutoCheck score. Requires AutoCheck dealer portal credentials.",
    realToday: true,
  },
  {
    value: "edmunds",
    label: "Edmunds (free)",
    description:
      "Public valuation API. No credentials required — listed here for future parity.",
    realToday: true,
  },
  {
    value: "kbb",
    label: "Kelley Blue Book",
    description:
      "Per-dealer KBB credentials are not self-serve today. Slot stored for forward compatibility; use Edmunds for real valuations.",
    realToday: false,
  },
  {
    value: "vauto",
    label: "vAuto",
    description:
      "Cox Automotive vAuto. Stored for future enterprise partnership.",
    realToday: false,
  },
  {
    value: "mmr",
    label: "Manheim MMR",
    description:
      "Manheim Market Report. Stored for future enterprise partnership.",
    realToday: false,
  },
  {
    value: "plaid",
    label: "Plaid (income verification)",
    description:
      "Plaid Link tokens used during pre-qualification. Stored for the BYO flow.",
    realToday: false,
  },
];

export default function ExternalCredentialsPanel() {
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<ExternalProvider, { plaintext: string; label: string }>
  >({} as Record<ExternalProvider, { plaintext: string; label: string }>);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/credentials");
      if (res.status === 401) {
        setError("Authentication required");
        setCredentials([]);
      } else if (!res.ok) {
        setError(`Failed to load credentials (${res.status})`);
      } else {
        const data = await res.json();
        setCredentials(Array.isArray(data.credentials) ? data.credentials : []);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setDraft = useCallback(
    (provider: ExternalProvider, patch: Partial<{ plaintext: string; label: string }>) => {
      setDrafts((prev) => ({
        ...prev,
        [provider]: {
          plaintext: prev[provider]?.plaintext ?? "",
          label: prev[provider]?.label ?? "",
          ...patch,
        },
      }));
    },
    [],
  );

  const handleAdd = useCallback(
    async (provider: ExternalProvider) => {
      const draft = drafts[provider];
      if (!draft || draft.plaintext.length === 0) {
        setToast("Enter the credential before saving.");
        setTimeout(() => setToast(null), 3000);
        return;
      }
      setBusy(`add-${provider}`);
      try {
        const res = await fetch("/api/admin/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            label: draft.label || null,
            plaintext: draft.plaintext,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setToast(body.error ?? `Failed (${res.status})`);
        } else {
          setToast(`${provider} credential saved.`);
          setDraft(provider, { plaintext: "", label: "" });
          await load();
        }
      } catch (err) {
        setToast((err as Error).message);
      } finally {
        setBusy(null);
        setTimeout(() => setToast(null), 3500);
      }
    },
    [drafts, load, setDraft],
  );

  const handleRevoke = useCallback(
    async (cred: CredentialRecord) => {
      setBusy(`revoke-${cred.id}`);
      try {
        const res = await fetch(`/api/admin/credentials/${cred.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setToast(body.error ?? `Failed (${res.status})`);
        } else {
          setToast(`${cred.provider} credential revoked.`);
          await load();
        }
      } catch (err) {
        setToast((err as Error).message);
      } finally {
        setBusy(null);
        setTimeout(() => setToast(null), 3500);
      }
    },
    [load],
  );

  return (
    <section
      aria-labelledby="byo-credentials-heading"
      className="rounded-card border border-surface-border bg-white p-6 shadow-card"
      data-testid="external-credentials-panel"
    >
      <header className="mb-4">
        <h2
          id="byo-credentials-heading"
          className="text-lg font-semibold text-gray-900"
        >
          External Credentials (BYO)
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Bring your own Carfax / AutoCheck / valuation provider keys. Stored
          encrypted at rest (AES-256-GCM) and only ever sent to the upstream
          provider on your behalf.
        </p>
      </header>

      {toast && (
        <div className="mb-4 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
          {toast}
        </div>
      )}

      {loading && (
        <div data-testid="credentials-loading" className="py-4 text-sm text-gray-500">
          Loading credentials...
        </div>
      )}

      {!loading && error && (
        <div
          data-testid="credentials-error"
          className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {!loading && !error && credentials.length === 0 && (
        <div
          data-testid="credentials-empty"
          className="mb-4 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600"
        >
          No external credentials saved yet. Add one below to enable Carfax /
          AutoCheck / paid valuation pulls per VIN.
        </div>
      )}

      {!loading && !error && credentials.length > 0 && (
        <ul
          data-testid="credentials-list"
          className="mb-6 divide-y divide-gray-100 rounded-lg border border-gray-100"
        >
          {credentials.map((cred) => (
            <li
              key={cred.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
              data-testid={`credential-row-${cred.provider}`}
            >
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {cred.provider}
                  {cred.label ? ` — ${cred.label}` : ""}
                </div>
                <div className="text-xs text-gray-500">
                  status: {cred.status} · added{" "}
                  {new Date(cred.createdAt).toLocaleDateString()}
                  {cred.lastError ? ` · last error: ${cred.lastError}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRevoke(cred)}
                disabled={busy === `revoke-${cred.id}` || cred.status === "revoked"}
                className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {cred.status === "revoked"
                  ? "Revoked"
                  : busy === `revoke-${cred.id}`
                  ? "Revoking..."
                  : "Revoke"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-4">
        {PROVIDERS.map((prov) => {
          const draft = drafts[prov.value] ?? { plaintext: "", label: "" };
          return (
            <div
              key={prov.value}
              className="rounded-lg border border-gray-100 p-4"
              data-testid={`provider-add-${prov.value}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    {prov.label}
                    {!prov.realToday && (
                      <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        Future partnership
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {prov.description}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <input
                  type="text"
                  placeholder="Label (optional)"
                  value={draft.label}
                  onChange={(e) => setDraft(prov.value, { label: e.target.value })}
                  className="rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  data-testid={`label-input-${prov.value}`}
                />
                <input
                  type="password"
                  placeholder="Paste API key or JSON credential"
                  value={draft.plaintext}
                  onChange={(e) =>
                    setDraft(prov.value, { plaintext: e.target.value })
                  }
                  className="rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 sm:col-span-2"
                  data-testid={`plaintext-input-${prov.value}`}
                />
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleAdd(prov.value)}
                  disabled={busy === `add-${prov.value}` || draft.plaintext.length === 0}
                  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                  data-testid={`save-button-${prov.value}`}
                >
                  {busy === `add-${prov.value}` ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
