"use client";

import { useEffect, useState, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days: number): void {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

// ---------------------------------------------------------------------------
// Visitor ID
// ---------------------------------------------------------------------------

function getOrCreateVisitorId(): string {
  const COOKIE_NAME = "wolfpack_vid";
  let vid = getCookie(COOKIE_NAME);
  if (!vid) {
    // Deterministic-ish fallback using crypto.randomUUID (available in all
    // modern browsers). Not truly deterministic across devices, but stable
    // per-browser once set.
    vid = crypto.randomUUID();
    setCookie(COOKIE_NAME, vid, 365);
  }
  return vid;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ABTestProps {
  /** Unique test name, e.g. "hero-cta" */
  name: string;
  /** Variant A element */
  a: ReactNode;
  /** Variant B element */
  b: ReactNode;
}

/**
 * A/B test wrapper. Renders variant A or B based on deterministic visitor
 * assignment. Tracks impressions automatically on mount.
 *
 * Usage:
 * ```tsx
 * <ABTest name="hero-cta" a={<ButtonA />} b={<ButtonB />} />
 * ```
 */
export default function ABTest({ name, a, b }: ABTestProps) {
  const [variant, setVariant] = useState<"a" | "b" | null>(null);

  useEffect(() => {
    const vid = getOrCreateVisitorId();

    fetch(`/api/ab/assign?test=${encodeURIComponent(name)}&visitor_id=${encodeURIComponent(vid)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`assign failed: ${res.status}`);
        return res.json() as Promise<{ variant: "a" | "b"; visitor_id: string }>;
      })
      .then((data) => {
        setVariant(data.variant);
      })
      .catch((err) => {
        // Fallback: show variant A if the API is unreachable
        console.warn("[ABTest] Assignment failed, defaulting to A:", err);
        setVariant("a");
      });
  }, [name]);

  // Render nothing until variant is resolved to avoid layout shift
  if (variant === null) return null;

  return <>{variant === "a" ? a : b}</>;
}
