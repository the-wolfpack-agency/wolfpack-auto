"use client";

import { useState } from "react";
import SignaturePad from "./SignaturePad";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Vehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  exterior_color?: string;
  mileage?: number;
}

interface Customer {
  name: string;
  email: string;
  phone: string;
}

interface DealSheetProps {
  vehicle: Vehicle;
  customer: Customer;
  price: number;
  signature?: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function DealSheet({
  vehicle,
  customer,
  price,
  signature: initialSignature,
}: DealSheetProps) {
  const [signature, setSignature] = useState<string | undefined>(initialSignature);
  const [showSignPad, setShowSignPad] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const estimatedTax = Math.round(price * 0.07);
  const estimatedFees = 499;
  const total = price + estimatedTax + estimatedFees;

  /* ------------------------------------------------------------------ */
  /*  Sign handler                                                       */
  /* ------------------------------------------------------------------ */

  const handleSign = async (dataUrl: string) => {
    setSignature(dataUrl);
    setShowSignPad(false);
    setSaving(true);

    try {
      await fetch("/api/admin/deals/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: `lead-${Date.now()}`,
          vehicle_vin: vehicle.vin,
          signature_data: dataUrl,
          agreed_price: price,
        }),
      });
      setSaved(true);
    } catch {
      console.error("Failed to save signed deal");
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <>
      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #deal-sheet,
          #deal-sheet * {
            visibility: visible;
          }
          #deal-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
            padding: 2rem;
          }
          #deal-sheet .no-print {
            display: none !important;
          }
          #deal-sheet .print-black {
            color: black !important;
            border-color: #ccc !important;
          }
        }
      `}</style>

      <div
        id="deal-sheet"
        className="mx-auto max-w-2xl space-y-6 rounded-2xl border border-gray-700 bg-gray-900 p-6"
      >
        {/* Header */}
        <div className="border-b border-gray-700 pb-4 print-black">
          <h2 className="text-2xl font-bold text-white print-black">
            Buyer&apos;s Order
          </h2>
          <p className="mt-1 text-sm text-gray-400 print-black">
            Date: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* Vehicle details */}
        <div className="rounded-xl border border-gray-700 p-4 print-black">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400 print-black">
            Vehicle Information
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <span className="text-gray-500 print-black">Vehicle</span>
              <p className="font-medium text-white print-black">
                {vehicle.year} {vehicle.make} {vehicle.model}
                {vehicle.trim ? ` ${vehicle.trim}` : ""}
              </p>
            </div>
            <div>
              <span className="text-gray-500 print-black">VIN</span>
              <p className="font-mono font-medium text-white print-black">{vehicle.vin}</p>
            </div>
            {vehicle.exterior_color && (
              <div>
                <span className="text-gray-500 print-black">Color</span>
                <p className="font-medium text-white print-black">{vehicle.exterior_color}</p>
              </div>
            )}
            {vehicle.mileage !== undefined && (
              <div>
                <span className="text-gray-500 print-black">Mileage</span>
                <p className="font-medium text-white print-black">
                  {vehicle.mileage.toLocaleString()} mi
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Customer info */}
        <div className="rounded-xl border border-gray-700 p-4 print-black">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400 print-black">
            Customer Information
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <span className="text-gray-500 print-black">Name</span>
              <p className="font-medium text-white print-black">{customer.name}</p>
            </div>
            <div>
              <span className="text-gray-500 print-black">Email</span>
              <p className="font-medium text-white print-black">{customer.email}</p>
            </div>
            <div>
              <span className="text-gray-500 print-black">Phone</span>
              <p className="font-medium text-white print-black">{customer.phone}</p>
            </div>
          </div>
        </div>

        {/* Price breakdown */}
        <div className="rounded-xl border border-gray-700 p-4 print-black">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400 print-black">
            Price Breakdown
          </h3>
          <dl className="divide-y divide-gray-700 text-sm print-black">
            <div className="flex justify-between py-2">
              <dt className="text-gray-400 print-black">Vehicle Price</dt>
              <dd className="font-medium text-white print-black">{fmt(price)}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-400 print-black">Estimated Tax (7%)</dt>
              <dd className="font-medium text-white print-black">{fmt(estimatedTax)}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-400 print-black">Estimated Fees</dt>
              <dd className="font-medium text-white print-black">{fmt(estimatedFees)}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-base font-bold text-white print-black">Total</dt>
              <dd className="text-base font-bold text-green-400 print-black">{fmt(total)}</dd>
            </div>
          </dl>
        </div>

        {/* Signature area */}
        <div className="rounded-xl border border-gray-700 p-4 print-black">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400 print-black">
            Customer Signature
          </h3>

          {signature ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signature}
                alt="Customer signature"
                className="h-24 rounded border border-gray-600 bg-gray-800 p-2"
              />
              <p className="text-xs text-gray-500 print-black">
                Signed electronically on{" "}
                {new Date().toLocaleString("en-US", {
                  dateStyle: "long",
                  timeStyle: "short",
                })}
              </p>
              {saved && (
                <p className="text-xs font-medium text-green-400">
                  Deal recorded successfully
                </p>
              )}
            </div>
          ) : (
            <div className="border-b border-dashed border-gray-600 pb-8 pt-4">
              <span className="text-xs text-gray-600 print-black">
                X ___________________________________________
              </span>
            </div>
          )}
        </div>

        {/* Signature pad modal */}
        {showSignPad && (
          <div className="no-print rounded-xl border border-brand-600 bg-gray-800 p-4">
            <SignaturePad onSign={handleSign} />
            <button
              type="button"
              onClick={() => setShowSignPad(false)}
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-600"
              style={{ fontSize: "16px" }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div className="no-print flex flex-col gap-3 sm:flex-row">
          {!signature && (
            <button
              type="button"
              onClick={() => setShowSignPad(true)}
              disabled={saving}
              className="flex-1 rounded-xl bg-green-600 px-4 py-3 text-base font-semibold text-white shadow-lg transition-colors hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-400"
              style={{ fontSize: "16px" }}
            >
              {saving ? "Saving..." : "Sign & Accept"}
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 rounded-xl border border-gray-600 bg-gray-800 px-4 py-3 text-base font-medium text-gray-300 transition-colors hover:bg-gray-700"
            style={{ fontSize: "16px" }}
          >
            Print
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 rounded-xl border border-gray-600 bg-gray-800 px-4 py-3 text-base font-medium text-gray-300 transition-colors hover:bg-gray-700"
            style={{ fontSize: "16px" }}
          >
            Download PDF
          </button>
        </div>

        {/* Disclaimer */}
        <p className="text-xs leading-relaxed text-gray-500 print-black">
          This document constitutes a binding agreement between the buyer and
          dealership for the purchase of the above-described vehicle at the
          agreed-upon price. Taxes and fees are estimates and may vary by
          jurisdiction. Final amounts will be calculated at time of closing.
          All sales are subject to credit approval and vehicle availability.
        </p>
      </div>
    </>
  );
}
