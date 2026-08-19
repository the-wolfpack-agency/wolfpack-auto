"use client";

import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <p className="text-gray-400">Loading...</p>
      </div>
    }>
      <AcceptInviteForm />
    </Suspense>
  );
}

function AcceptInviteForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!token) {
      setError("Invalid invitation link.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to accept invitation.");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token, password, confirmPassword]);

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
            <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">You're all set!</h1>
          <p className="text-gray-400">Your account is ready. You can now sign in.</p>
          <a
            href="/admin/login"
            className="inline-block rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Accept Invitation</h1>
          <p className="mt-2 text-sm text-gray-400">
            Set your password to complete your account setup.
          </p>
        </div>

        {/* NO TOKEN IS A DEAD END, AND IT WAS THE WHOLE SCREEN.
            Reported 2026-08-19 by the CEO, with a screenshot: a red box saying
            "check your email for the correct link" and nothing else. Every
            reason to land here is ordinary. The link wrapped in their mail
            client and only half of it hyperlinked. They opened the page from
            history, or from a bookmark. They already accepted, and the account
            exists. Or the invitation genuinely expired, since these last seven
            days.

            In every one of those cases there is something useful to do, and
            the page offered none of it. Somebody who already has an account
            needs the sign-in link. Somebody whose link is stale needs to know
            who to ask, and that asking again works, rather than being told to
            go and re-read an email that did not work the first time. */}
        {!token && (
          <div className="space-y-4" data-testid="accept-invite-no-token">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              <p className="font-semibold text-amber-100">This link is missing its invitation code.</p>
              <p className="mt-2 text-amber-200/90">
                That usually means the link was cut short by an email app, or it was opened from
                history rather than from the invitation itself. Invitations also expire after seven
                days.
              </p>
            </div>
            <div className="space-y-3 text-sm text-gray-300">
              <p>
                <span className="font-medium text-white">Already set a password?</span>{" "}
                <a href="/admin/login" className="text-brand-400 underline hover:text-brand-300">
                  Sign in instead
                </a>
                .
              </p>
              <p>
                <span className="font-medium text-white">Still need access?</span> Ask whoever
                invited you to send it again from Team in the admin portal. A fresh invitation
                works even if this one has expired.
              </p>
              <p className="text-gray-400">
                Opening the invitation email and clicking <span className="text-gray-200">Accept
                Invitation</span> is the surest route: the full link is also printed underneath that
                button, so it can be copied and pasted whole.
              </p>
            </div>
          </div>
        )}

        {token && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading || !password || !confirmPassword}
              className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Setting up..." : "Set Password & Join"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
