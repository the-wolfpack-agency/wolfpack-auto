"use client";

import { useEffect, useState, useCallback } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface SecurityFinding {
  category: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  file: string;
  line: number;
  description: string;
  recommendation: string;
}

interface ScanResult {
  timestamp: string;
  duration_ms: number;
  total_findings: number;
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
  findings: SecurityFinding[];
  files_scanned: number;
}

/* -------------------------------------------------------------------------- */
/* Severity helpers                                                           */
/* -------------------------------------------------------------------------- */

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-yellow-500 text-black",
  low: "bg-blue-500 text-white",
  info: "bg-gray-400 text-white",
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const CATEGORY_LABELS: Record<string, string> = {
  hardcoded_secrets: "Hardcoded Secrets",
  rate_limiting: "Rate Limiting",
  input_validation: "Input Validation",
  shadow_mode: "Shadow Mode",
  ssrf: "SSRF Vectors",
  auth_guard: "Auth Guard",
  csrf: "CSRF Protection",
  content_length: "Content-Length Limits",
  sql_injection: "SQL Injection",
  sensitive_data: "Sensitive Data Exposure",
};

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function SecurityPage() {
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");

  const fetchScan = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/security/scan");
      if (res.status === 401 || res.status === 403) return; if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setScan(data.scan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch scan results");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScan();
  }, [fetchScan]);

  const runScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/security/scan", { method: "POST" });
      if (res.status === 401 || res.status === 403) return; if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
      const data = await res.json();
      setScan(data.scan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Security Hardening</h1>
        <div className="animate-pulse space-y-4">
          <div className="h-20 bg-gray-200 rounded" />
          <div className="h-40 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  const findings = scan?.findings ?? [];
  const filtered = findings
    .filter((f) => filterCategory === "all" || f.category === filterCategory)
    .filter((f) => filterSeverity === "all" || f.severity === filterSeverity)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  // Group findings by category
  const groupedByCategory: Record<string, SecurityFinding[]> = {};
  for (const f of filtered) {
    if (!groupedByCategory[f.category]) groupedByCategory[f.category] = [];
    groupedByCategory[f.category].push(f);
  }

  const categories = Object.keys(scan?.by_category ?? {}).filter(
    (c) => (scan?.by_category[c] ?? 0) > 0,
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Security Hardening Scanner</h1>
          <p className="text-sm text-gray-500 mt-1">
            Zero-token static analysis across 10 security categories
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {scanning ? "Scanning..." : "Run Scan"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
          {error}
        </div>
      )}

      {scan && (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard
              label="Total Findings"
              value={scan.total_findings}
              color="text-gray-900"
            />
            <StatCard
              label="Critical"
              value={scan.by_severity.critical ?? 0}
              color="text-red-600"
            />
            <StatCard
              label="High"
              value={scan.by_severity.high ?? 0}
              color="text-orange-500"
            />
            <StatCard
              label="Medium"
              value={scan.by_severity.medium ?? 0}
              color="text-yellow-600"
            />
            <StatCard
              label="Low / Info"
              value={(scan.by_severity.low ?? 0) + (scan.by_severity.info ?? 0)}
              color="text-blue-500"
            />
          </div>

          {/* Scan metadata */}
          <div className="text-xs text-gray-400">
            Scanned {scan.files_scanned} files in {scan.duration_ms}ms |
            Last scan: {new Date(scan.timestamp).toLocaleString()}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <select
              className="border rounded-lg px-3 py-2 text-sm w-full sm:w-auto"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c] ?? c} ({scan.by_category[c]})
                </option>
              ))}
            </select>
            <select
              className="border rounded-lg px-3 py-2 text-sm w-full sm:w-auto"
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
          </div>

          {/* Findings grouped by category */}
          {Object.keys(groupedByCategory).length === 0 ? (
            <div className="bg-green-50 border border-green-200 text-green-800 p-6 rounded-lg text-center">
              No findings match the current filters.
            </div>
          ) : (
            Object.entries(groupedByCategory).map(([category, categoryFindings]) => (
              <div key={category} className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b">
                  <h3 className="font-semibold text-gray-800">
                    {CATEGORY_LABELS[category] ?? category}
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({categoryFindings.length} finding{categoryFindings.length !== 1 ? "s" : ""})
                    </span>
                  </h3>
                </div>
                <div className="divide-y">
                  {categoryFindings.map((finding, idx) => (
                    <FindingRow key={`${category}-${idx}`} finding={finding} />
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white border rounded-lg p-4 text-center">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1 uppercase tracking-wide">
        {label}
      </div>
    </div>
  );
}

function FindingRow({ finding }: { finding: SecurityFinding }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="px-4 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded(!expanded)}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <span
          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[finding.severity] ?? "bg-gray-300"}`}
        >
          {finding.severity.toUpperCase()}
        </span>
        <span className="text-sm text-gray-800 flex-1">{finding.description}</span>
        <span className="text-xs text-gray-400 font-mono whitespace-nowrap">
          {finding.file}:{finding.line}
        </span>
      </div>
      {expanded && (
        <div className="mt-3 ml-0 sm:ml-16 p-3 bg-blue-50 border border-blue-100 rounded text-sm text-blue-800">
          <strong>Recommendation:</strong> {finding.recommendation}
        </div>
      )}
    </div>
  );
}
