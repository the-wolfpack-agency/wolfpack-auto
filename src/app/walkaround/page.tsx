"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function WalkaroundLandingPage() {
  const [vin, setVin] = useState("");
  const router = useRouter();

  function handleStart(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = vin.trim().toUpperCase();
    if (cleaned.length >= 5) {
      router.push(`/walkaround/${cleaned}`);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo mark */}
        <div className="mb-8 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 shadow-lg">
            <CarIcon />
          </div>
        </div>

        <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">
          Vehicle Walkaround
        </h1>
        <p className="mb-8 text-center text-sm text-gray-500">
          Enter a VIN to launch the interactive flip-card presentation for your customer.
        </p>

        <form onSubmit={handleStart} className="space-y-4">
          <div>
            <label htmlFor="vin-input" className="mb-1 block text-sm font-medium text-gray-700">
              VIN
            </label>
            <input
              id="vin-input"
              type="text"
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase())}
              placeholder="e.g. 1GNKRHKD0PJ123456"
              minLength={5}
              maxLength={17}
              required
              autoComplete="off"
              autoCapitalize="characters"
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3.5 text-base font-mono tracking-widest shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              style={{ fontSize: 18, letterSpacing: "0.08em" }}
            />
          </div>

          <button
            type="submit"
            disabled={vin.trim().length < 5}
            className="w-full rounded-xl bg-brand-600 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-40"
          >
            Start Walkaround
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          Tap any card to flip it during the presentation.
        </p>
      </div>
    </main>
  );
}

function CarIcon() {
  return (
    <svg
      className="h-8 w-8 text-white"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
      />
    </svg>
  );
}
