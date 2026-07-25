"use client";

import { useState } from "react";

/**
 * Brand-agnostic site logo. Renders the dealer's logo image when it loads;
 * falls back to a clean wordmark if there is no logo or the image 404s (which
 * is exactly what produced the broken icon in production).
 */
export default function SiteLogo({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  const [broken, setBroken] = useState(false);

  if (logoUrl && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={logoUrl}
        alt={name}
        className="h-6 w-auto sm:h-7"
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <span className="text-base font-semibold uppercase tracking-[0.25em] text-brand-950 sm:text-lg">
      {name}
    </span>
  );
}
