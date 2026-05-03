"use client";

import { useEffect } from "react";

const MAPS_EMBED_URL =
  "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3236.0!2d-78.6414!3d35.8428!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzXCsDUwJzM0LjEiTiA3OMKwMzgnMjkuMCJX!5e0!3m2!1sen!2sus!4v1";

const DIRECTIONS_URL =
  "https://www.google.com/maps/dir//4200+Six+Forks+Rd,+Raleigh,+NC+27609";

interface GoogleMapsEmbedProps {
  dealerName: string;
  dealerCity: string;
  dealerState: string;
  dealerId: string;
}

export default function GoogleMapsEmbed({
  dealerName,
  dealerCity,
  dealerState,
  dealerId,
}: GoogleMapsEmbedProps) {
  useEffect(() => {
    // Bug fix 2026-05-02: was passing `page: dealerId` which polluted
    // analytics_events.page with raw UUIDs (444 garbage rows in prod
    // before this fix). The page column is the URL path; dealer_id
    // belongs in metadata.
    fetch("/api/analytics/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            event_type: "system",
            action: "system.analytics_queried",
            page:
              typeof window !== "undefined"
                ? window.location.pathname
                : "/",
            session_id:
              typeof window !== "undefined"
                ? window.sessionStorage?.getItem("session_id") ?? "anon"
                : "anon",
            user_fingerprint: "client",
            metadata: { module: "google_maps", dealer_id: dealerId },
          },
        ],
      }),
    }).catch(() => {
      /* analytics must never break the UI */
    });
  }, [dealerId]);

  return (
    <div className="overflow-hidden rounded-2xl border border-surface-border shadow-card">
      <iframe
        src={MAPS_EMBED_URL}
        className="w-full border-0 rounded-t-2xl h-[300px] sm:h-[400px]"
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title={`${dealerName} location - ${dealerCity}, ${dealerState}`}
      />
      <div className="bg-white p-4 text-center">
        <a
          href={DIRECTIONS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
        >
          Get Directions &rarr;
        </a>
      </div>
    </div>
  );
}
