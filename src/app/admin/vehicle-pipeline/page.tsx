"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface VehicleDeliveryStatus {
  vin: string;
  currentStage: string;
  acquiredAt: string;
  lastUpdated: string;
  vehicleInfo?: {
    year: number;
    make: string;
    model: string;
    stockNumber?: string;
  };
}

interface PipelineData {
  stages: Record<string, VehicleDeliveryStatus[]>;
  totalVehicles: number;
  averageTimeToList: number;
  averageTimeToDeliver: number;
}

interface SlowMover {
  vin: string;
  currentStage: string;
  daysInStage: number;
  thresholdDays: number;
  vehicleInfo?: VehicleDeliveryStatus["vehicleInfo"];
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const STAGE_ORDER = [
  "acquired",
  "in_transit",
  "arrived",
  "inspection",
  "reconditioning",
  "photos",
  "listed",
  "sold",
  "delivered",
];

const STAGE_LABELS: Record<string, string> = {
  acquired: "Acquired",
  in_transit: "In Transit",
  arrived: "Arrived",
  inspection: "Inspection",
  reconditioning: "Recon",
  photos: "Photos",
  listed: "Listed",
  sold: "Sold",
  delivered: "Delivered",
};

const STAGE_COLORS: Record<string, string> = {
  acquired: "border-gray-300 bg-gray-50",
  in_transit: "border-blue-300 bg-blue-50",
  arrived: "border-indigo-300 bg-indigo-50",
  inspection: "border-purple-300 bg-purple-50",
  reconditioning: "border-amber-300 bg-amber-50",
  photos: "border-pink-300 bg-pink-50",
  listed: "border-emerald-300 bg-emerald-50",
  sold: "border-teal-300 bg-teal-50",
  delivered: "border-green-300 bg-green-50",
};

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function VehiclePipelinePage() {
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [slowMovers, setSlowMovers] = useState<SlowMover[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/vehicle-pipeline");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setPipeline(data.pipeline);
        setSlowMovers(data.slowMovers);
      } catch {
        setError("Failed to load vehicle pipeline");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!pipeline) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Vehicle Delivery Pipeline</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track vehicles from acquisition through customer delivery.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Total in Pipeline</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{pipeline.totalVehicles}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Avg Days to List</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{pipeline.averageTimeToList}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Avg Days to Deliver</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{pipeline.averageTimeToDeliver}</p>
        </div>
      </div>

      {/* Slow mover alerts */}
      {slowMovers.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="text-sm font-semibold text-red-800">Slow Movers Detected</h3>
          <div className="mt-2 space-y-1">
            {slowMovers.map((sm) => (
              <p key={sm.vin} className="text-sm text-red-700">
                {sm.vehicleInfo
                  ? `${sm.vehicleInfo.year} ${sm.vehicleInfo.make} ${sm.vehicleInfo.model}`
                  : sm.vin}{" "}
                — stuck in <strong>{STAGE_LABELS[sm.currentStage]}</strong> for{" "}
                <strong>{sm.daysInStage} days</strong> (threshold: {sm.thresholdDays}d)
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Kanban board */}
      <div className="overflow-x-auto">
        <div className="flex gap-3" style={{ minWidth: `${STAGE_ORDER.length * 180}px` }}>
          {STAGE_ORDER.map((stage) => {
            const vehicles = pipeline.stages[stage] ?? [];
            return (
              <div
                key={stage}
                className={`w-44 flex-shrink-0 rounded-lg border-2 p-3 ${
                  STAGE_COLORS[stage] ?? "border-gray-200 bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-gray-700">
                    {STAGE_LABELS[stage]}
                  </h3>
                  <span className="rounded-full bg-white px-1.5 py-0.5 text-xs font-medium text-gray-600 shadow-sm">
                    {vehicles.length}
                  </span>
                </div>
                <div className="mt-2 space-y-2">
                  {vehicles.map((v) => (
                    <div
                      key={v.vin}
                      className="rounded-md border border-white bg-white p-2 shadow-sm"
                    >
                      {v.vehicleInfo ? (
                        <>
                          <p className="text-xs font-medium text-gray-900">
                            {v.vehicleInfo.year} {v.vehicleInfo.make}
                          </p>
                          <p className="text-xs text-gray-500">{v.vehicleInfo.model}</p>
                          {v.vehicleInfo.stockNumber && (
                            <p className="text-xs text-gray-400">
                              #{v.vehicleInfo.stockNumber}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs font-mono text-gray-600">
                          {v.vin.slice(-8)}
                        </p>
                      )}
                    </div>
                  ))}
                  {vehicles.length === 0 && (
                    <p className="text-center text-xs text-gray-400 py-4">Empty</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
