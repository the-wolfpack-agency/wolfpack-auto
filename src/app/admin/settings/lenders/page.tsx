/**
 * /admin/settings/lenders -- dealer lender contact list (prequal routing).
 *
 * Stream B (migration 070). The page itself is a thin server component
 * that renders the LenderContactsPanel client component. All CRUD happens
 * through `/api/admin/dealer/lenders/*`.
 */

import type { Metadata } from "next";
import LenderContactsPanel from "@/components/admin/LenderContactsPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lender contacts",
  description:
    "Manage the lenders your dealership routes pre-qualified buyers to. Stream B (migration 070).",
};

export default function LendersSettingsPage() {
  return (
    <main className="max-w-3xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Lender contacts</h1>
        <p className="text-sm text-gray-600 mt-1">
          Wolfpack routes every pre-qualified buyer to your own lender stack.
          Add your lender contacts here so the prequal packet lands in the
          right inbox.
        </p>
      </header>
      <LenderContactsPanel />
    </main>
  );
}
