"use client";

import { useEffect } from "react";
import { recordRecentlyViewed } from "@/lib/recently-viewed";

/**
 * Mount on a vehicle detail page to record the vehicle into recently-viewed
 * session memory (drives the homepage resume bar). Renders nothing.
 */
export default function RecentlyViewedTracker({
  vin,
  year,
  make,
  model,
  price,
  bodyStyle,
}: {
  vin: string;
  year: number;
  make: string;
  model: string;
  price: number;
  bodyStyle?: string;
}) {
  useEffect(() => {
    if (!vin) return;
    recordRecentlyViewed({ vin, year, make, model, price, bodyStyle });
  }, [vin, year, make, model, price, bodyStyle]);

  return null;
}
