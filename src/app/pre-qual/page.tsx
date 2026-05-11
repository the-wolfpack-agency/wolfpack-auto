import type { Metadata } from "next";
import PreQualWizard from "./PreQualWizard";
import { getDealerConfig } from "@/lib/dealer-config";

// Render at request time so a DB hiccup during build doesn't 404 the page.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Get Pre-Qualified | Real lender offers in under a minute",
  description:
    "Find out exactly what you qualify for. Soft credit check, no impact to your score, no obligation. Arrive at the lot already approved.",
  openGraph: {
    title: "Get Pre-Qualified",
    description:
      "Real lender pre-approvals in under 60 seconds. Soft credit check, no score impact.",
    type: "website",
  },
  alternates: {
    canonical: "/pre-qual",
  },
};

export default async function PreQualPage() {
  const config = await getDealerConfig();
  const dealerId = config?.id ?? null;
  const dealerName = config?.name ?? "Our Dealership";

  return <PreQualWizard dealerId={dealerId} dealerName={dealerName} />;
}
