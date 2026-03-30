"use client";

import { useState, useCallback, useRef } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface IntakeResult {
  vin: string;
  status: "created" | "updated" | "skipped" | "error";
  description_generated: boolean;
  photos_processed: number;
  indexed_in_qdrant: boolean;
  indexed_in_neo4j: boolean;
  errors: string[];
}

interface IntakeSummary {
  total_received: number;
  total_normalized: number;
  normalization_errors: number;
  normalization_warnings: number;
  created: number;
  updated: number;
  skipped: number;
  errored: number;
  descriptions_generated: number;
  total_photos_processed: number;
  indexed_in_qdrant: number;
  indexed_in_neo4j: number;
}

interface IntakeResponse {
  success: boolean;
  summary: IntakeSummary;
  results: IntakeResult[];
  normalization_errors?: Array<{ index: number; vin: string | null; errors: string[] }>;
  error?: string;
}

interface Recommendation {
  gaps: Array<{ category: string; demand_signals: number; suggestion: string }>;
  slow_movers: Array<{ vin: string; days_on_lot: number; suggestion: string }>;
  pricing_opportunities: Array<{
    vin: string;
    current_price: number;
    suggested_price: number;
    reasoning: string;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEALER_ID = process.env.NEXT_PUBLIC_DEALER_ID ?? "default";

const DMS_PROVIDERS = [
  { value: "GENERIC_CSV", label: "CSV / Generic" },
  { value: "CDK", label: "CDK Global" },
  { value: "REYNOLDS", label: "Reynolds & Reynolds" },
  { value: "DEALERTRACK", label: "DealerTrack" },
  { value: "TEKION", label: "Tekion" },
  { value: "DEALERSOCKET", label: "DealerSocket" },
  { value: "ROUTEONE", label: "RouteOne" },
  { value: "GENERIC_XML", label: "XML" },
] as const;

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function IntakePage() {
  // Upload state
  const [provider, setProvider] = useState("GENERIC_CSV");
  const [inputData, setInputData] = useState("");
  const [uploading, setUploading] = useState(false);
  const [response, setResponse] = useState<IntakeResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Recommendations state
  const [recommendations, setRecommendations] = useState<Recommendation | null>(null);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [recsError, setRecsError] = useState<string | null>(null);

  // File drop
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ----------------------------------------------------------------
  // File handling
  // ----------------------------------------------------------------

  const handleFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();

      if (file.name.endsWith(".csv")) {
        // Parse CSV into JSON array
        const parsed = parseCSV(text);
        setInputData(JSON.stringify(parsed, null, 2));
      } else if (file.name.endsWith(".json")) {
        setInputData(text);
      } else if (file.name.endsWith(".xml")) {
        // Show raw XML -- server will handle parsing
        setInputData(text);
      } else {
        setInputData(text);
      }
    } catch (err) {
      setUploadError(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragActive(false), []);

  // ----------------------------------------------------------------
  // Submit intake
  // ----------------------------------------------------------------

  const handleSubmit = useCallback(async () => {
    setUploading(true);
    setResponse(null);
    setUploadError(null);

    try {
      let vehicles: unknown[];

      try {
        const parsed = JSON.parse(inputData);
        vehicles = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        setUploadError("Invalid JSON. Paste a JSON array of vehicle records or upload a CSV file.");
        setUploading(false);
        return;
      }

      const res = await fetch("/api/admin/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicles,
          dealer_id: DEALER_ID,
          provider,
        }),
      });

      const data = (await res.json()) as IntakeResponse;

      if (!res.ok) {
        setUploadError(data.error ?? `Server error: ${res.status}`);
        if (data.results) setResponse(data);
      } else {
        setResponse(data);
      }
    } catch (err) {
      setUploadError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  }, [inputData, provider]);

  // ----------------------------------------------------------------
  // Load recommendations
  // ----------------------------------------------------------------

  const loadRecommendations = useCallback(async () => {
    setLoadingRecs(true);
    setRecsError(null);

    try {
      const res = await fetch(
        `/api/admin/intake/recommendations?dealer_id=${encodeURIComponent(DEALER_ID)}`,
      );
      const data = await res.json();

      if (!res.ok) {
        setRecsError(data.error ?? `Error: ${res.status}`);
      } else {
        setRecommendations(data as Recommendation);
      }
    } catch (err) {
      setRecsError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingRecs(false);
    }
  }, []);

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------

  return (
    <>
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vehicle Intake</h1>
          <p className="mt-1 text-sm text-gray-500">
            Bulk upload vehicles from DMS feeds, CSV files, or JSON data.
          </p>
        </div>
        <button
          onClick={loadRecommendations}
          disabled={loadingRecs}
          className="inline-flex items-center rounded-lg border border-surface-border bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {loadingRecs ? "Loading..." : "View Recommendations"}
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* ============================================================ */}
        {/* Left column: Upload                                          */}
        {/* ============================================================ */}
        <section aria-labelledby="upload-heading">
          <h2 id="upload-heading" className="mb-4 text-lg font-semibold text-gray-900">
            Bulk Upload
          </h2>

          {/* Provider select */}
          <div className="mb-4">
            <label htmlFor="dms-provider" className="mb-1 block text-sm font-medium text-gray-700">
              DMS Provider
            </label>
            <select
              id="dms-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              {DMS_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Drag-drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Drop a CSV, JSON, or XML file here, or click to browse"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
            className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragActive
                ? "border-brand-500 bg-brand-50"
                : "border-surface-border bg-surface-muted hover:border-brand-400 hover:bg-brand-50/50"
            }`}
          >
            <UploadIcon />
            <p className="mt-2 text-sm font-medium text-gray-700">
              Drop CSV, JSON, or XML file here
            </p>
            <p className="mt-1 text-xs text-gray-500">or click to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,.xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>

          {/* JSON textarea */}
          <div className="mb-4">
            <label htmlFor="vehicle-data" className="mb-1 block text-sm font-medium text-gray-700">
              Vehicle Data (JSON)
            </label>
            <textarea
              id="vehicle-data"
              value={inputData}
              onChange={(e) => setInputData(e.target.value)}
              rows={12}
              placeholder={`[\n  {\n    "vin": "1HGCM82633A123456",\n    "year": 2024,\n    "make": "Honda",\n    "model": "Accord",\n    "price": 28995,\n    "condition": "new"\n  }\n]`}
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 font-mono text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={uploading || !inputData.trim()}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {uploading ? "Processing..." : "Process Intake"}
          </button>

          {/* Error */}
          {uploadError && (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              {uploadError}
            </div>
          )}
        </section>

        {/* ============================================================ */}
        {/* Right column: Results                                        */}
        {/* ============================================================ */}
        <section aria-labelledby="results-heading">
          <h2 id="results-heading" className="mb-4 text-lg font-semibold text-gray-900">
            Results
          </h2>

          {!response && !uploading && (
            <div className="flex h-64 items-center justify-center rounded-lg border border-surface-border bg-white text-sm text-gray-500">
              Upload vehicle data to see results here.
            </div>
          )}

          {uploading && (
            <div className="flex h-64 items-center justify-center rounded-lg border border-surface-border bg-white">
              <div className="text-center">
                <Spinner />
                <p className="mt-2 text-sm text-gray-500">Processing vehicles...</p>
              </div>
            </div>
          )}

          {response && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryCard label="Created" value={response.summary.created} color="green" />
                <SummaryCard label="Updated" value={response.summary.updated} color="blue" />
                <SummaryCard label="Skipped" value={response.summary.skipped} color="yellow" />
                <SummaryCard label="Errors" value={response.summary.errored} color="red" />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryCard label="Descriptions" value={response.summary.descriptions_generated} color="purple" />
                <SummaryCard label="Photos" value={response.summary.total_photos_processed} color="indigo" />
                <SummaryCard label="Qdrant" value={response.summary.indexed_in_qdrant} color="cyan" />
                <SummaryCard label="Neo4j" value={response.summary.indexed_in_neo4j} color="orange" />
              </div>

              {/* Per-vehicle results */}
              <div className="overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-surface-border">
                    <caption className="sr-only">Intake results per vehicle</caption>
                    <thead className="bg-surface-muted">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                          VIN
                        </th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Status
                        </th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Details
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {response.results.map((r, i) => (
                        <tr key={`${r.vin}-${i}`} className="transition-colors hover:bg-surface-muted/50">
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-gray-700">
                            {r.vin || "N/A"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm">
                            <StatusPill status={r.status} />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            <div className="flex flex-wrap gap-2">
                              {r.description_generated && <Tag label="AI Desc" />}
                              {r.photos_processed > 0 && (
                                <Tag label={`${r.photos_processed} photos`} />
                              )}
                              {r.indexed_in_qdrant && <Tag label="Qdrant" />}
                              {r.indexed_in_neo4j && <Tag label="Neo4j" />}
                            </div>
                            {r.errors.length > 0 && (
                              <ul className="mt-1 list-disc pl-4 text-xs text-red-600">
                                {r.errors.map((e, j) => (
                                  <li key={j}>{e}</li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ============================================================== */}
      {/* Recommendations section (full width below)                     */}
      {/* ============================================================== */}
      {(recommendations || recsError) && (
        <section aria-labelledby="recs-heading" className="mt-10">
          <h2 id="recs-heading" className="mb-4 text-lg font-semibold text-gray-900">
            Inventory Recommendations
          </h2>

          {recsError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {recsError}
            </div>
          )}

          {recommendations && (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Gaps */}
              <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
                  Inventory Gaps
                </h3>
                {recommendations.gaps.length === 0 ? (
                  <p className="text-sm text-gray-500">No gaps detected.</p>
                ) : (
                  <ul className="space-y-3">
                    {recommendations.gaps.map((g, i) => (
                      <li key={i} className="rounded-lg bg-amber-50 p-3 text-sm">
                        <p className="font-medium text-amber-800">{g.category}</p>
                        <p className="mt-1 text-xs text-amber-700">
                          {g.demand_signals} searches | {g.suggestion}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Slow movers */}
              <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
                  Slow Movers
                </h3>
                {recommendations.slow_movers.length === 0 ? (
                  <p className="text-sm text-gray-500">No slow-moving inventory detected.</p>
                ) : (
                  <ul className="space-y-3">
                    {recommendations.slow_movers.map((s, i) => (
                      <li key={i} className="rounded-lg bg-orange-50 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs text-orange-800">{s.vin}</span>
                          <span className="rounded bg-orange-200 px-2 py-0.5 text-xs font-semibold text-orange-800">
                            {s.days_on_lot}d
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-orange-700">{s.suggestion}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Pricing */}
              <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
                  Pricing Opportunities
                </h3>
                {recommendations.pricing_opportunities.length === 0 ? (
                  <p className="text-sm text-gray-500">No pricing adjustments suggested.</p>
                ) : (
                  <ul className="space-y-3">
                    {recommendations.pricing_opportunities.map((p, i) => (
                      <li key={i} className="rounded-lg bg-blue-50 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs text-blue-800">{p.vin}</span>
                          <span className="text-xs font-semibold text-blue-800">
                            ${p.current_price.toLocaleString()} &rarr; ${p.suggested_price.toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-blue-700">{p.reasoning}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    green: "bg-green-50 text-green-800 border-green-200",
    blue: "bg-blue-50 text-blue-800 border-blue-200",
    yellow: "bg-yellow-50 text-yellow-800 border-yellow-200",
    red: "bg-red-50 text-red-800 border-red-200",
    purple: "bg-purple-50 text-purple-800 border-purple-200",
    indigo: "bg-indigo-50 text-indigo-800 border-indigo-200",
    cyan: "bg-cyan-50 text-cyan-800 border-cyan-200",
    orange: "bg-orange-50 text-orange-800 border-orange-200",
  };

  return (
    <div className={`rounded-lg border p-3 text-center ${colorMap[color] ?? colorMap.blue}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium uppercase tracking-wider">{label}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    created: "bg-green-100 text-green-800",
    updated: "bg-blue-100 text-blue-800",
    skipped: "bg-yellow-100 text-yellow-800",
    error: "bg-red-100 text-red-800",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        styles[status] ?? "bg-gray-100 text-gray-800"
      }`}
    >
      {status}
    </span>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded bg-surface-muted px-2 py-0.5 text-xs font-medium text-gray-600">
      {label}
    </span>
  );
}

function Spinner() {
  return (
    <svg
      className="mx-auto h-8 w-8 animate-spin text-brand-600"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      className="h-10 w-10 text-gray-400"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  CSV parser                                                         */
/* ------------------------------------------------------------------ */

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const record: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j].trim()] = values[j]?.trim() ?? "";
    }
    records.push(record);
  }

  return records;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }

  result.push(current);
  return result;
}
