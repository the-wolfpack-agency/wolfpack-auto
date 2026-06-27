"use client";

import { useState, Suspense, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchJson } from "@/lib/safe-fetch";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-gray-950 flex items-center justify-center"><div className="text-gray-400">Loading...</div></div>}>
      <LoginForm />
    </Suspense>
  );
}

type LoginStep = "credentials" | "mfa";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<LoginStep>("credentials");
  const [mfaUserId, setMfaUserId] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [mfaToken, setMfaToken] = useState("");
  const [isBackupCode, setIsBackupCode] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const callbackUrl = searchParams.get("callbackUrl") ?? "/admin";

  // -------------------------------------------------------------------------
  // Step 1: password authentication
  // -------------------------------------------------------------------------
  async function handleCredentialsSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (!result) {
        setError("An unexpected error occurred. Please try again.");
        return;
      }

      if (result.error) {
        // NextAuth surfaces our thrown error message here
        if (result.error.includes("Too many login attempts")) {
          setError(result.error);
        } else {
          setError("Invalid email or password. Please try again.");
        }
        return;
      }

      if (result.ok) {
        // Check whether the session requires MFA verification.
        // We do this by fetching the session and inspecting mfaVerified.
        const session = await fetchJson<{ mfaVerified?: boolean; user?: { id?: string } } | null>("/api/auth/session");

        if (session?.mfaVerified === false && session?.user?.id) {
          // MFA pending — show TOTP step
          setMfaUserId(session.user.id);
          setStep("mfa");
        } else {
          // No MFA required — redirect
          window.location.href = callbackUrl;
        }
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Step 2: MFA verification
  // -------------------------------------------------------------------------
  async function handleMfaSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Sign in again with the MFA second-step credentials.
      // The NextAuth authorize() function checks mfa_user_id + mfa_token.
      const result = await signIn("credentials", {
        mfa_user_id: mfaUserId,
        mfa_token: mfaToken,
        mfa_is_backup_code: isBackupCode ? "true" : "false",
        redirect: false,
        callbackUrl,
      });

      if (!result || result.error) {
        setError(
          isBackupCode
            ? "Invalid backup code. Please check and try again."
            : "Invalid authentication code. Please check your app and try again.",
        );
        return;
      }

      if (result.ok) {
        window.location.href = callbackUrl;
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo / branding */}
        <div className="mb-8 text-center">
          <span
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white"
            aria-hidden="true"
          >
            W
          </span>
          <h1 className="mt-4 text-xl font-semibold text-white">
            {step === "credentials"
              ? "Sign in to your dealership"
              : "Two-factor authentication"}
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            {step === "credentials"
              ? "Enter your credentials to access the admin panel."
              : "Enter the 6-digit code from your authenticator app."}
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-800/50 bg-red-900/30 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Step 1: credentials                                              */}
        {/* ---------------------------------------------------------------- */}
        {step === "credentials" && (
          <form onSubmit={handleCredentialsSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-300"
              >
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                style={{ fontSize: "16px" }}
                placeholder="you@dealership.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-300"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                style={{ fontSize: "16px" }}
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-gray-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <svg
                    className="-ml-1 mr-2 h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Step 2: TOTP / backup code                                       */}
        {/* ---------------------------------------------------------------- */}
        {step === "mfa" && (
          <form onSubmit={handleMfaSubmit} className="space-y-5">
            {!isBackupCode ? (
              <div>
                <label
                  htmlFor="mfa-token"
                  className="block text-sm font-medium text-gray-300"
                >
                  Authentication code
                </label>
                <input
                  id="mfa-token"
                  name="mfa-token"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={6}
                  value={mfaToken}
                  onChange={(e) =>
                    setMfaToken(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="mt-1.5 block w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-center font-mono text-xl tracking-[0.5em] text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  style={{ fontSize: "24px" }}
                  placeholder="000000"
                  autoFocus
                />
              </div>
            ) : (
              <div>
                <label
                  htmlFor="backup-code"
                  className="block text-sm font-medium text-gray-300"
                >
                  Backup code
                </label>
                <input
                  id="backup-code"
                  name="backup-code"
                  type="text"
                  autoComplete="off"
                  required
                  maxLength={8}
                  value={mfaToken}
                  onChange={(e) =>
                    setMfaToken(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))
                  }
                  className="mt-1.5 block w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-center font-mono text-lg tracking-widest text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  style={{ fontSize: "20px" }}
                  placeholder="XXXXXXXX"
                  autoFocus
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading || mfaToken.length < (isBackupCode ? 8 : 6)}
              className="flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-gray-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <svg
                    className="-ml-1 mr-2 h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Verifying...
                </>
              ) : (
                "Verify"
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsBackupCode(!isBackupCode);
                setMfaToken("");
                setError("");
              }}
              className="w-full text-center text-sm text-gray-400 underline hover:text-gray-200 focus:outline-none"
            >
              {isBackupCode
                ? "Use authenticator app instead"
                : "Use a backup code instead"}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("credentials");
                setMfaToken("");
                setMfaUserId("");
                setError("");
              }}
              className="w-full text-center text-sm text-gray-500 hover:text-gray-300 focus:outline-none"
            >
              Back to sign in
            </button>
          </form>
        )}

        {step === "credentials" && (
          <p className="mt-6 text-center">
            <a
              href="/admin/reset-password"
              className="text-sm text-gray-400 underline hover:text-gray-200"
            >
              Forgot password?
            </a>
          </p>
        )}

        <p className="mt-4 text-center text-xs text-gray-500">
          Contact your dealership administrator if you need access.
        </p>
      </div>
    </div>
  );
}
