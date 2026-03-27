"use client";

/**
 * /admin/settings/mfa
 *
 * MFA settings page for admin users.
 *   - Shows current MFA status
 *   - Set up MFA: generates QR + shows secret → confirm TOTP → enables MFA
 *   - Displays backup codes once after enabling (never again)
 *   - Admin-only: disable MFA button
 */

import { useState, useEffect, type FormEvent } from "react";
import { useSession } from "next-auth/react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface MfaSetupData {
  qrDataUrl: string;
  secret: string;
  backupCodes: string[];
}

type PageState =
  | "loading"
  | "idle-disabled"
  | "idle-enabled"
  | "setup-qr"
  | "setup-confirm"
  | "setup-done"
  | "error";

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function MfaSettingsPage() {
  const { data: session, status } = useSession();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [setupData, setSetupData] = useState<MfaSetupData | null>(null);
  const [confirmToken, setConfirmToken] = useState("");
  const [displayedBackupCodes, setDisplayedBackupCodes] = useState<string[]>([]);
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const isAdmin = session?.user?.role === "admin";

  // -------------------------------------------------------------------------
  // Load current MFA status on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (status !== "authenticated") return;

    async function loadStatus() {
      try {
        // We detect the current state by calling the setup endpoint would
        // overwrite any existing secret, so instead we rely on the session
        // data and a lightweight status endpoint.
        const res = await fetch("/api/admin/mfa/status");
        if (res.ok) {
          const data = await res.json() as { mfa_enabled: boolean };
          setPageState(data.mfa_enabled ? "idle-enabled" : "idle-disabled");
        } else {
          // If no status endpoint, default to disabled so user can set up.
          setPageState("idle-disabled");
        }
      } catch {
        setPageState("idle-disabled");
      }
    }

    void loadStatus();
  }, [status]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async function handleSetupStart() {
    setActionError("");
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/mfa/setup", { method: "POST" });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "Setup failed.");
      }
      const data = await res.json() as MfaSetupData;
      setSetupData(data);
      setConfirmToken("");
      setPageState("setup-qr");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Setup failed.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSetupConfirm(e: FormEvent) {
    e.preventDefault();
    if (!setupData) return;

    setActionError("");
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/mfa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: confirmToken,
          backupCodes: setupData.backupCodes,
        }),
      });

      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "Verification failed.");
      }

      setDisplayedBackupCodes(setupData.backupCodes);
      setPageState("setup-done");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDisable() {
    if (!confirm("Disable MFA for your account? This reduces your account security.")) return;

    setActionError("");
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/mfa/disable", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "Disable failed.");
      }
      setSetupData(null);
      setPageState("idle-disabled");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Disable failed.");
    } finally {
      setActionLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  if (status === "loading" || pageState === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Two-Factor Authentication
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Add an extra layer of security to your account using a TOTP
          authenticator app (Google Authenticator, Authy, 1Password, etc.).
        </p>
      </div>

      {/* Error banner */}
      {actionError && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Status: disabled                                                    */}
      {/* ------------------------------------------------------------------ */}
      {pageState === "idle-disabled" && (
        <div className="rounded-card border border-surface-border bg-white p-6 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <LockIcon />
            </span>
            <div>
              <p className="font-semibold text-gray-900">MFA is not enabled</p>
              <p className="text-sm text-gray-500">
                Your account is protected by password only.
              </p>
            </div>
            <span className="ml-auto rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
              Not enabled
            </span>
          </div>

          <div className="mt-6">
            <button
              onClick={handleSetupStart}
              disabled={actionLoading}
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-60"
            >
              {actionLoading ? "Starting setup…" : "Set up MFA"}
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Status: enabled                                                     */}
      {/* ------------------------------------------------------------------ */}
      {pageState === "idle-enabled" && (
        <div className="rounded-card border border-surface-border bg-white p-6 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600">
              <ShieldCheckIcon />
            </span>
            <div>
              <p className="font-semibold text-gray-900">MFA is enabled</p>
              <p className="text-sm text-gray-500">
                Your account is protected by password + TOTP.
              </p>
            </div>
            <span className="ml-auto rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
              Active
            </span>
          </div>

          {isAdmin && (
            <div className="mt-6 border-t border-surface-border pt-6">
              <p className="mb-3 text-sm text-gray-500">
                Administrator action — disabling MFA reduces account security.
              </p>
              <button
                onClick={handleDisable}
                disabled={actionLoading}
                className="rounded-lg border border-red-300 bg-red-50 px-5 py-2 text-sm font-semibold text-red-700 shadow-sm transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 disabled:opacity-60"
              >
                {actionLoading ? "Disabling…" : "Disable MFA"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Setup step 1: show QR                                              */}
      {/* ------------------------------------------------------------------ */}
      {pageState === "setup-qr" && setupData && (
        <div className="rounded-card border border-surface-border bg-white p-6 shadow-card">
          <h2 className="mb-1 text-lg font-semibold text-gray-900">
            Scan QR code
          </h2>
          <p className="mb-6 text-sm text-gray-500">
            Open your authenticator app and scan the QR code below.
            If you can&rsquo;t scan it, enter the secret key manually.
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {/* QR code */}
            <img
              src={setupData.qrDataUrl}
              alt="TOTP QR code — scan with your authenticator app"
              className="h-48 w-48 rounded-lg border border-surface-border"
            />

            <div className="flex-1">
              <p className="mb-1 text-sm font-medium text-gray-700">
                Manual entry key
              </p>
              <code className="block break-all rounded-lg bg-gray-50 px-3 py-2 font-mono text-sm text-gray-800">
                {setupData.secret}
              </code>
              <p className="mt-2 text-xs text-gray-500">
                Issuer: WolfpackAuto &bull; Algorithm: SHA1 &bull; Period: 30 s
              </p>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setPageState("setup-confirm")}
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            >
              I&rsquo;ve scanned it — continue
            </button>
            <button
              onClick={() => {
                setSetupData(null);
                setPageState("idle-disabled");
              }}
              className="rounded-lg border border-surface-border px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Setup step 2: confirm TOTP                                         */}
      {/* ------------------------------------------------------------------ */}
      {pageState === "setup-confirm" && setupData && (
        <div className="rounded-card border border-surface-border bg-white p-6 shadow-card">
          <h2 className="mb-1 text-lg font-semibold text-gray-900">
            Confirm your authenticator
          </h2>
          <p className="mb-6 text-sm text-gray-500">
            Enter the 6-digit code currently shown in your authenticator app to
            confirm setup.
          </p>

          <form onSubmit={handleSetupConfirm} className="space-y-4">
            <div>
              <label
                htmlFor="confirm-token"
                className="block text-sm font-medium text-gray-700"
              >
                Authentication code
              </label>
              <input
                id="confirm-token"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={confirmToken}
                onChange={(e) =>
                  setConfirmToken(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="mt-1.5 block w-40 rounded-lg border border-surface-border px-3 py-2 text-center font-mono text-xl tracking-[0.4em] shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                placeholder="000000"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={actionLoading || confirmToken.length !== 6}
                className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-60"
              >
                {actionLoading ? "Verifying…" : "Enable MFA"}
              </button>
              <button
                type="button"
                onClick={() => setPageState("setup-qr")}
                className="rounded-lg border border-surface-border px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
              >
                Back
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Setup done: show backup codes                                       */}
      {/* ------------------------------------------------------------------ */}
      {pageState === "setup-done" && (
        <div className="space-y-6">
          <div className="rounded-card border border-green-200 bg-green-50 p-6 shadow-card">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600">
                <ShieldCheckIcon />
              </span>
              <div>
                <p className="font-semibold text-green-900">MFA is now enabled!</p>
                <p className="text-sm text-green-700">
                  Your account is now protected with two-factor authentication.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-card border border-amber-200 bg-amber-50 p-6 shadow-card">
            <h2 className="mb-1 text-lg font-semibold text-amber-900">
              Save your backup codes
            </h2>
            <p className="mb-4 text-sm text-amber-800">
              These codes can be used to access your account if you lose your
              authenticator app. <strong>Store them somewhere safe.</strong>{" "}
              Each code can only be used once, and they will not be shown again.
            </p>

            <div className="grid grid-cols-2 gap-2 rounded-lg bg-white p-4 font-mono text-sm sm:grid-cols-4">
              {displayedBackupCodes.map((code) => (
                <div
                  key={code}
                  className="rounded border border-amber-200 px-2 py-1.5 text-center tracking-widest text-gray-800"
                >
                  {code}
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                const text = displayedBackupCodes.join("\n");
                void navigator.clipboard.writeText(text);
              }}
              className="mt-4 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2"
            >
              Copy codes to clipboard
            </button>
          </div>

          <button
            onClick={() => {
              setDisplayedBackupCodes([]);
              setPageState("idle-enabled");
            }}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Icons (inline SVG — no dependency needed)                                  */
/* -------------------------------------------------------------------------- */

function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M12.516 2.17a.75.75 0 0 0-1.032 0 11.209 11.209 0 0 1-7.877 3.08.75.75 0 0 0-.722.515A12.74 12.74 0 0 0 2.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 0 0 .374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 0 0-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08Zm3.094 8.016a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
