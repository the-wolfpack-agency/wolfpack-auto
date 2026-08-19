"use client";

import { Suspense, useState, type FormEvent } from "react";
import { safeCallbackUrl } from "@/lib/safe-callback-url";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export default function OperatorLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 flex items-center justify-center bg-gray-950">
          <div className="text-gray-400">Loading...</div>
        </div>
      }
    >
      <OperatorLoginForm />
    </Suspense>
  );
}

function OperatorLoginForm() {
  const searchParams = useSearchParams();
  /* Same hazard as the admin login, same rule. This is assigned to
     window.location.href once the operator has authenticated, so an unchecked
     value sends somebody who has just typed a password to a copy of this page
     on another domain. Found by sweeping every redirect in the estate after
     the admin one, 2026-08-19: fixing the reported instance and leaving its
     twin is how a class of bug survives being fixed. */
  const next = safeCallbackUrl(searchParams.get("next"), "/operator");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signIn("wolfpack-staff", {
        email,
        password,
        redirect: false,
        callbackUrl: next,
      });
      if (!result || result.error) {
        if (result?.error?.includes("Too many")) {
          setError(result.error);
        } else {
          setError("Invalid email or password.");
        }
        return;
      }
      window.location.href = next;
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-brand-900 via-gray-950 to-brand-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent-500 text-lg font-bold text-white"
            aria-hidden="true"
          >
            W
          </span>
          <h1 className="mt-4 text-xl font-semibold text-white">Wolfpack Operator Console</h1>
          <p className="mt-1 text-sm text-brand-200">Agency staff access. Invite-only.</p>
        </div>

        {error && (
          <div
            role="alert"
            data-testid="operator-login-error"
            className="mb-4 rounded-lg border border-red-800/50 bg-red-900/30 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-5" data-testid="operator-login-form">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300">
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
              className="mt-1.5 block w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              style={{ fontSize: "16px" }}
              placeholder="you@thewolfpack.agency"
              data-testid="operator-email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300">
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
              className="mt-1.5 block w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              style={{ fontSize: "16px" }}
              placeholder="Enter your password"
              data-testid="operator-password"
            />
          </div>

          <button
            type="submit"
            data-testid="operator-login-submit"
            disabled={loading || !email || !password}
            className="flex w-full items-center justify-center rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-2 focus:ring-offset-gray-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-500">
          This console is internal-only. No public signup.
        </p>
      </div>
    </div>
  );
}
