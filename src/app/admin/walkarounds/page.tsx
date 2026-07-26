"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface VideoSegment {
  id: string;
  segmentType: string;
  url: string;
  thumbnailUrl: string | null;
  durationSeconds: number;
  addedAt: string;
}

interface WalkaroundVideo {
  id: string;
  vin: string;
  dealerId: string;
  status: string;
  segments: VideoSegment[];
  metadata: {
    totalDuration: number;
    segmentCount: number;
    completeness: number;
    lastUpdated: string;
  };
  createdAt: string;
  publishedAt: string | null;
  createdBy: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  recording: "bg-brand-50 text-brand-800",
  complete: "bg-amber-50 text-amber-700",
  published: "bg-emerald-50 text-emerald-700",
};

const SEGMENT_LABELS: Record<string, string> = {
  exterior_front: "Front",
  exterior_rear: "Rear",
  exterior_left: "Left",
  exterior_right: "Right",
  interior: "Interior",
  engine: "Engine",
  trunk: "Trunk",
  features: "Features",
};

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function WalkaroundsPage() {
  const [walkarounds, setWalkarounds] = useState<WalkaroundVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/walkarounds");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setWalkarounds(data.walkarounds);
      } catch {
        setError("Failed to load walkarounds");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Video Walkarounds</h1>
          <p className="mt-1 text-sm text-gray-500">
            Record and publish vehicle walkaround videos for VDP pages.
          </p>
        </div>
        <span className="text-sm text-gray-500">{walkarounds.length} walkarounds</span>
      </div>

      {/* Walkaround list */}
      <div className="space-y-4">
        {walkarounds.map((wk) => (
          <div
            key={wk.id}
            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  VIN: {wk.vin}
                </h3>
                <p className="mt-0.5 text-sm text-gray-500">
                  Created {formatDate(wk.createdAt)}
                  {wk.publishedAt && ` | Published ${formatDate(wk.publishedAt)}`}
                </p>
              </div>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  STATUS_COLORS[wk.status] ?? "bg-gray-100 text-gray-600"
                }`}
              >
                {wk.status}
              </span>
            </div>

            {/* Completeness */}
            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs text-gray-500">Completeness:</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-brand-600"
                  style={{ width: `${wk.metadata.completeness}%` }}
                />
              </div>
              <span className="text-xs font-medium text-gray-700">
                {wk.metadata.completeness}%
              </span>
            </div>

            {/* Stats */}
            <div className="mt-3 flex gap-4 text-xs text-gray-500">
              <span>{wk.metadata.segmentCount} segments</span>
              <span>{formatDuration(wk.metadata.totalDuration)} total</span>
            </div>

            {/* Segments */}
            {wk.segments.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {wk.segments.map((seg) => (
                  <div
                    key={seg.id}
                    className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                  >
                    <p className="text-xs font-medium text-gray-700">
                      {SEGMENT_LABELS[seg.segmentType] ?? seg.segmentType}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatDuration(seg.durationSeconds)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {walkarounds.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">
            No walkarounds yet. Create one from the inventory page.
          </p>
        )}
      </div>
    </div>
  );
}
