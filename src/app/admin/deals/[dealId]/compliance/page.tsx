"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface DocumentIssue {
  rule_id: string;
  severity: string;
  category: string;
  description: string;
  recommendation: string;
  regulatory_ref?: string;
}

interface AnalysisResult {
  document_id: string;
  doc_type: string;
  analyzed_at: string;
  issues: DocumentIssue[];
  score: number;
  passed: boolean;
  summary: string;
  recommendations: string[];
}

interface DealJacketResult {
  deal_id: string;
  analyzed_at: string;
  total_documents: number;
  missing_documents: string[];
  document_results: AnalysisResult[];
  overall_score: number;
  ready_to_fund: boolean;
  blockers: string[];
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-600/20",
  high: "bg-orange-100 text-orange-800 ring-1 ring-inset ring-orange-600/20",
  medium: "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-600/20",
  low: "bg-brand-100 text-brand-900 ring-1 ring-inset ring-brand-700/20",
  info: "bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-400/20",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  purchase_agreement: "Purchase Agreement",
  credit_app: "Credit Application",
  disclosure: "Disclosure",
  title: "Title",
  registration: "Registration",
  insurance: "Insurance",
  marketing: "Marketing",
  trade_title: "Trade Title",
  lien_release: "Lien Release",
  inspection: "Inspection",
  deal_jacket: "Deal Jacket",
  other: "Other",
};

const REQUIRED_DOC_TYPES = [
  { type: "purchase_agreement", label: "Purchase Agreement" },
  { type: "credit_app", label: "Credit Application" },
  { type: "disclosure", label: "Disclosures" },
  { type: "insurance", label: "Proof of Insurance" },
  { type: "title", label: "Vehicle Title" },
];

/* -------------------------------------------------------------------------- */
/* Shadow mock data                                                           */
/* -------------------------------------------------------------------------- */

function getMockDealInfo(dealId: string) {
  return {
    deal_id: dealId,
    vehicle: "2025 Toyota Camry XSE",
    vin: "4T1BZ1HK5RU012345",
    customer: "Robert Chen",
    customer_email: "robert.chen@email.com",
    deal_type: "Retail Finance",
    created_at: "2026-03-26T10:00:00Z",
  };
}

function getMockDocuments(dealId: string) {
  return [
    { id: `${dealId}-pa`, doc_type: "purchase_agreement", name: "Purchase Agreement - Chen", signed: true, present: true, uploaded_at: "2026-03-26T10:15:00Z" },
    { id: `${dealId}-ca`, doc_type: "credit_app", name: "Credit Application - Chen", signed: true, present: true, uploaded_at: "2026-03-26T10:20:00Z" },
    { id: `${dealId}-dc`, doc_type: "disclosure", name: "Disclosures Package", signed: false, present: true, uploaded_at: "2026-03-26T10:25:00Z" },
    { id: `${dealId}-ins`, doc_type: "insurance", name: "Insurance Binder - State Farm", signed: false, present: true, uploaded_at: "2026-03-26T11:00:00Z" },
    { id: `${dealId}-ti`, doc_type: "title", name: "Vehicle Title", signed: false, present: false, uploaded_at: "" },
  ];
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.info}`}>
      {severity}
    </span>
  );
}

function ProgressRing({ score }: { score: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 90 ? "#059669" : score >= 70 ? "#d97706" : "#dc2626";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
        <circle
          cx="50" cy="50" r={radius}
          fill="none" stroke="#e5e7eb" strokeWidth="8"
        />
        <circle
          cx="50" cy="50" r={radius}
          fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-xl font-bold" style={{ color }}>{score}</span>
        <span className="text-[10px] text-gray-400">/ 100</span>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "---";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function DealCompliancePage() {
  const params = useParams();
  const dealId = typeof params.dealId === "string" ? params.dealId : "unknown";

  const [dealInfo] = useState(getMockDealInfo(dealId));
  const [documents] = useState(getMockDocuments(dealId));
  const [analysisResult, setAnalysisResult] = useState<DealJacketResult | null>(null);
  const [loading, setLoading] = useState(false);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/documents/scan-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_id: dealId }),
      });
      if (res.ok) {
        const result = await res.json();
        setAnalysisResult(result);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [dealId]);

  // Auto-run on mount
  useEffect(() => {
    void runAnalysis();
  }, [runAnalysis]);

  const presentDocs = documents.filter((d) => d.present);
  const missingDocs = documents.filter((d) => !d.present);
  const unsignedDocs = documents.filter((d) => d.present && !d.signed);

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <a href="/admin/deals" className="text-sm text-brand-600 hover:underline">Deals</a>
              <span className="text-sm text-gray-400">/</span>
              <a href={`/admin/deals/${dealId}`} className="text-sm text-brand-600 hover:underline">{dealId}</a>
              <span className="text-sm text-gray-400">/</span>
              <span className="text-sm text-gray-500">Compliance</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Deal Jacket Compliance</h1>
          </div>
          <button
            onClick={() => { void runAnalysis(); }}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? "Scanning..." : "Run Analysis"}
          </button>
        </div>
      </div>

      {/* Deal Info */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
          <p className="text-xs font-medium text-gray-500">Deal ID</p>
          <p className="mt-1 text-sm font-bold text-gray-900">{dealInfo.deal_id}</p>
        </div>
        <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
          <p className="text-xs font-medium text-gray-500">Vehicle</p>
          <p className="mt-1 text-sm font-bold text-gray-900">{dealInfo.vehicle}</p>
          <p className="text-xs text-gray-400">{dealInfo.vin}</p>
        </div>
        <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
          <p className="text-xs font-medium text-gray-500">Customer</p>
          <p className="mt-1 text-sm font-bold text-gray-900">{dealInfo.customer}</p>
          <p className="text-xs text-gray-400">{dealInfo.customer_email}</p>
        </div>
        <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
          <p className="text-xs font-medium text-gray-500">Deal Type</p>
          <p className="mt-1 text-sm font-bold text-gray-900">{dealInfo.deal_type}</p>
          <p className="text-xs text-gray-400">Created {formatDate(dealInfo.created_at)}</p>
        </div>
      </div>

      {/* Ready to Fund Indicator + Progress Ring */}
      <div className="mb-8 flex flex-col sm:flex-row gap-6">
        {/* Progress ring */}
        <div className="flex flex-col items-center justify-center rounded-card border border-surface-border bg-white p-6 shadow-card sm:min-w-[180px]">
          <ProgressRing score={analysisResult?.overall_score ?? 0} />
          <p className="mt-2 text-xs font-medium text-gray-500">Overall Readiness</p>
        </div>

        {/* Ready to fund */}
        <div className="flex-1 rounded-card border border-surface-border bg-white p-6 shadow-card">
          {analysisResult ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                {analysisResult.ready_to_fund ? (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 ring-1 ring-inset ring-emerald-600/20">
                    <svg className="h-6 w-6 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <span className="text-lg font-bold text-emerald-800">Ready to Fund</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 ring-1 ring-inset ring-red-600/20">
                    <svg className="h-6 w-6 text-red-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    <span className="text-lg font-bold text-red-800">Not Ready to Fund</span>
                  </div>
                )}
              </div>
              {analysisResult.blockers.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Blockers to resolve:</p>
                  <ul className="space-y-1.5">
                    {analysisResult.blockers.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-red-700">
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {analysisResult.blockers.length === 0 && (
                <p className="text-sm text-emerald-600">All documents are compliant. This deal is cleared for funding.</p>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-gray-400">{loading ? "Running compliance scan..." : "Click 'Run Analysis' to check deal readiness."}</p>
            </div>
          )}
        </div>
      </div>

      {/* Document Checklist */}
      <div className="mb-8 rounded-card border border-surface-border bg-white shadow-card">
        <div className="px-4 py-3 border-b border-surface-border">
          <h2 className="text-base font-semibold text-gray-900">Deal Jacket Checklist</h2>
          <p className="text-xs text-gray-500">Required documents for funding</p>
        </div>
        <div className="divide-y divide-surface-border">
          {REQUIRED_DOC_TYPES.map((req) => {
            const doc = documents.find((d) => d.doc_type === req.type);
            const present = doc?.present ?? false;
            const signed = doc?.signed ?? false;
            return (
              <div key={req.type} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  {present ? (
                    <svg className="h-5 w-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  ) : (
                    <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900">{req.label}</p>
                    {doc && <p className="text-xs text-gray-400">{doc.name}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {present ? (
                    <>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Present</span>
                      {signed ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Signed</span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Unsigned</span>
                      )}
                    </>
                  ) : (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Missing</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-4 py-3 border-t border-surface-border bg-gray-50 text-xs text-gray-500">
          {presentDocs.length} of {REQUIRED_DOC_TYPES.length} required documents present.
          {unsignedDocs.length > 0 && ` ${unsignedDocs.length} unsigned.`}
          {missingDocs.length > 0 && ` ${missingDocs.length} missing.`}
        </div>
      </div>

      {/* Per-Document Analysis Results */}
      {analysisResult && analysisResult.document_results.length > 0 && (
        <div className="rounded-card border border-surface-border bg-white shadow-card">
          <div className="px-4 py-3 border-b border-surface-border">
            <h2 className="text-base font-semibold text-gray-900">Document Analysis Details</h2>
          </div>
          <div className="divide-y divide-surface-border">
            {analysisResult.document_results.map((result, i) => (
              <div key={i} className="px-4 py-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-gray-900">
                    {DOC_TYPE_LABELS[result.doc_type] ?? result.doc_type}
                  </span>
                  <span className={`text-sm font-bold ${result.score >= 90 ? "text-emerald-600" : result.score >= 70 ? "text-amber-600" : "text-red-600"}`}>
                    {result.score}/100
                  </span>
                  {result.passed ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Passed</span>
                  ) : (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">Failed</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-2">{result.summary}</p>
                {result.issues.length > 0 && (
                  <div className="space-y-1.5">
                    {result.issues.map((issue, j) => (
                      <div key={j} className="flex items-start gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2">
                        <SeverityBadge severity={issue.severity} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-800">{issue.description}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{issue.recommendation}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
