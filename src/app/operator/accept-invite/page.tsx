"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function AcceptOperatorInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-gray-950">
          <p className="text-gray-300">Loading...</p>
        </div>
      }
    >
      <AcceptOperatorInviteForm />
    </Suspense>
  );
}

function AcceptOperatorInviteForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [valid, setValid] = useState<boolean | null>(null);

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Preview the invite to get the email + role.
  useEffect(() => {
    if (!token) {
      setValid(false);
      return;
    }
    fetch(`/api/operator/invites/accept?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: { valid?: boolean; email?: string; role?: string }) => {
        setValid(!!data.valid);
        if (data.email) setEmail(data.email);
        if (data.role) setRole(data.role);
      })
      .catch(() => setValid(false));
  }, [token]);

  const submit = useCallback(async () => {
    setError("");
    if (!fullName.trim() || fullName.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }
    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/operator/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, full_name: fullName, password }),
      });
      const data = (await res.json()) as { error?: string; errors?: string[] };
      if (!res.ok) {
        setError(data.errors?.join(" ") ?? data.error ?? "Failed to accept invitation.");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token, fullName, password, confirmPassword]);

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-gray-950 px-4">
        <div className="w-full max-w-md text-center" data-testid="operator-accept-success">
          <h1 className="text-2xl font-bold text-white">You&apos;re in.</h1>
          <p className="mt-2 text-gray-300">Your operator account is ready. Sign in below.</p>
          <a
            href="/operator/login"
            className="mt-6 inline-block rounded-lg bg-accent-500 px-6 py-3 text-sm font-semibold text-white hover:bg-accent-600"
          >
            Go to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-gray-950 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Accept your operator invitation</h1>
          <p className="mt-2 text-sm text-gray-300">
            Set a password to activate your Wolfpack staff account.
          </p>
        </div>

        {valid === false && (
          <div
            data-testid="operator-accept-invalid"
            className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-center text-sm text-red-300"
          >
            This invitation link is invalid, already used, or expired. Ask a Wolfpack admin to resend it.
          </div>
        )}

        {valid && (
          <div className="space-y-4 rounded-xl border border-brand-800/40 bg-gray-900/60 p-6">
            <div>
              <label className="block text-sm font-medium text-gray-300">Email</label>
              <input
                type="email"
                value={email}
                readOnly
                data-testid="operator-accept-email"
                className="mt-1 block w-full cursor-not-allowed rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-300"
              />
              <p className="mt-1 text-xs text-gray-500">Role: {role}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300">Full name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                data-testid="operator-accept-name"
                className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 12 characters, mixed case + digit + symbol"
                data-testid="operator-accept-password"
                className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300">Confirm password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                data-testid="operator-accept-confirm"
                className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>

            {error && (
              <div
                role="alert"
                data-testid="operator-accept-error"
                className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
              >
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={loading || !fullName || !password || !confirmPassword}
              data-testid="operator-accept-submit"
              className="w-full rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Activating..." : "Activate account"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
