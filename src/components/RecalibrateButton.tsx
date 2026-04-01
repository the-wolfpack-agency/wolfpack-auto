"use client";

import { useState } from "react";

export default function RecalibrateButton() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const label = {
    idle: "Recalibrate",
    loading: "Calibrating...",
    done: "Done!",
    error: "Failed — retry",
  }[state];

  return (
    <button
      onClick={async () => {
        setState("loading");
        try {
          const res = await fetch("/api/admin/analytics/calibration", { method: "POST" });
          if (res.ok) {
            setState("done");
            setTimeout(() => window.location.reload(), 1000);
          } else {
            setState("error");
          }
        } catch {
          setState("error");
        }
      }}
      disabled={state === "loading" || state === "done"}
      className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50 disabled:opacity-50"
      data-track="brain_recalibrate"
    >
      {label}
    </button>
  );
}
