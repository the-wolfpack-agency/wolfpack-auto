"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            fontFamily: "sans-serif",
            padding: "16px",
            textAlign: "center",
          }}
        >
          <h1 style={{ color: "#dc2626", marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p style={{ color: "#6b7280", marginBottom: 24 }}>
            Our team has been notified. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "10px 24px",
              background: "#0c8de9",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
