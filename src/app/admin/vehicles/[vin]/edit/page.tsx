"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import VehicleForm, { type VehicleFormData } from "@/components/VehicleForm";
import RecallsPanel from "@/components/service/RecallsPanel";

export default function EditVehiclePage() {
  const params = useParams<{ vin: string }>();
  const router = useRouter();
  const vin = params.vin;

  const [initialData, setInitialData] = useState<VehicleFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ---- Load existing vehicle ---- */
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/vehicles/${vin}`);
        if (res.status === 401 || res.status === 403) return;
        if (!res.ok) {
          if (res.status === 404) {
            setError("Vehicle not found");
          } else {
            setError("Failed to load vehicle");
          }
          return;
        }

        const vehicle = await res.json();
        setInitialData({
          vin: vehicle.vin,
          stock_number: vehicle.stock_number ?? "",
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          trim: vehicle.trim ?? "",
          body_style: vehicle.body_style ?? "",
          exterior_color: vehicle.exterior_color ?? "",
          interior_color: vehicle.interior_color ?? "",
          engine: vehicle.engine ?? "",
          transmission: vehicle.transmission ?? "automatic",
          drivetrain: vehicle.drivetrain ?? "fwd",
          fuel_type: vehicle.fuel_type ?? "gasoline",
          mpg_city: vehicle.mpg_city ?? null,
          mpg_highway: vehicle.mpg_highway ?? null,
          msrp: vehicle.msrp ? Number(vehicle.msrp) : null,
          price: Number(vehicle.price) || 0,
          internet_price: vehicle.internet_price ? Number(vehicle.internet_price) : null,
          condition: vehicle.condition ?? "used",
          mileage: vehicle.mileage ?? 0,
          status: vehicle.status ?? "available",
          photos: vehicle.photos ?? [],
          description: vehicle.description ?? "",
          features: vehicle.features ?? [],
        });
      } catch (err) {
        setError("Failed to load vehicle data");
      } finally {
        setLoading(false);
      }
    }

    if (vin) load();
  }, [vin]);

  /* ---- Save handler ---- */
  const handleSubmit = async (data: VehicleFormData) => {
    const res = await fetch(`/api/admin/vehicles/${vin}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

        if (res.status === 401 || res.status === 403) return;
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to update vehicle" }));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }

    router.push("/admin/inventory");
  };

  /* ---- Render ---- */

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <p className="text-sm text-gray-500">Loading vehicle data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-lg font-semibold text-gray-900">{error}</p>
          <a
            href="/admin/inventory"
            className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            Back to Inventory
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <nav className="mb-4 text-sm text-gray-500" aria-label="Breadcrumb">
          <a href="/admin" className="hover:text-gray-700">
            Admin
          </a>
          <span className="mx-2">/</span>
          <a href="/admin/inventory" className="hover:text-gray-700">
            Inventory
          </a>
          <span className="mx-2">/</span>
          <span className="text-gray-900">
            Edit {initialData?.year} {initialData?.make} {initialData?.model}
          </span>
        </nav>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Edit Vehicle</h1>
            <p className="mt-1 font-mono text-sm text-gray-500">VIN: {vin}</p>
          </div>
          <a
            href={`/inventory/${vin}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            View Live Listing
            <ExternalIcon className="h-4 w-4" />
          </a>
        </div>
      </div>

      {initialData && (
        <div className="space-y-6">
          <RecallsPanel vehicleId={vin} title="Recalls and service bulletins" />
          <VehicleForm
            initialData={initialData}
            onSubmit={handleSubmit}
            isEditing
          />
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline SVG icon                                                            */
/* -------------------------------------------------------------------------- */

function ExternalIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
      />
    </svg>
  );
}
