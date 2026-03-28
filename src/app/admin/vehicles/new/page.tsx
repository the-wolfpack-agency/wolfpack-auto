"use client";

import { useRouter } from "next/navigation";
import VehicleForm, { type VehicleFormData } from "@/components/VehicleForm";

export default function AddVehiclePage() {
  const router = useRouter();

  const handleSubmit = async (data: VehicleFormData) => {
    const res = await fetch("/api/admin/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

        if (res.status === 401 || res.status === 403) return;
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to create vehicle" }));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }

    const created = await res.json();
    router.push(`/admin/vehicles/${created.vin}/edit`);
  };

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
          <span className="text-gray-900">Add Vehicle</span>
        </nav>
        <h1 className="text-2xl font-bold text-gray-900">Add Vehicle</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enter vehicle details, upload photos, and generate a listing.
        </p>
      </div>

      <VehicleForm onSubmit={handleSubmit} />
    </>
  );
}
