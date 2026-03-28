"use client";

import { useEffect, useState, useCallback } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ComplianceRule {
  id: string;
  doc_types: string[];
  severity: string;
  category: string;
  check: string;
  description: string;
  regulatory_ref?: string;
  recommendation: string;
}

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

const DOC_TYPES = [
  { value: "purchase_agreement", label: "Purchase Agreement" },
  { value: "credit_app", label: "Credit Application" },
  { value: "disclosure", label: "Disclosure" },
  { value: "title", label: "Title" },
  { value: "registration", label: "Registration" },
  { value: "insurance", label: "Insurance" },
  { value: "marketing", label: "Marketing" },
  { value: "trade_title", label: "Trade Title" },
  { value: "lien_release", label: "Lien Release" },
  { value: "inspection", label: "Inspection" },
  { value: "deal_jacket", label: "Deal Jacket" },
  { value: "other", label: "Other" },
];

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-600/20",
  high: "bg-orange-100 text-orange-800 ring-1 ring-inset ring-orange-600/20",
  medium: "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-600/20",
  low: "bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-600/20",
  info: "bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-400/20",
};

/* -------------------------------------------------------------------------- */
/* Shadow mock recent analyses                                                */
/* -------------------------------------------------------------------------- */

const MOCK_RECENT: AnalysisResult[] = [
  {
    document_id: "doc-pa-2026-042",
    doc_type: "purchase_agreement",
    analyzed_at: "2026-03-28T09:15:00Z",
    issues: [{ rule_id: "PA-007", severity: "medium", category: "Signatures", description: "Missing co-buyer signature", recommendation: "Ensure all signature lines are completed" }],
    score: 92,
    passed: true,
    summary: "1 issue: 0 critical, 0 high.",
    recommendations: [],
  },
  {
    document_id: "doc-ca-2026-038",
    doc_type: "credit_app",
    analyzed_at: "2026-03-28T08:45:00Z",
    issues: [
      { rule_id: "CA-001", severity: "critical", category: "FCRA Compliance", description: "FCRA authorization missing", recommendation: "Obtain FCRA consent signature", regulatory_ref: "FCRA \u00a7604" },
    ],
    score: 75,
    passed: false,
    summary: "1 critical issue. Blocking.",
    recommendations: ["[CA-001] Obtain FCRA consent signature"],
  },
  {
    document_id: "doc-dc-2026-015",
    doc_type: "disclosure",
    analyzed_at: "2026-03-27T16:30:00Z",
    issues: [],
    score: 100,
    passed: true,
    summary: "All checks passed.",
    recommendations: [],
  },
  {
    document_id: "doc-ins-2026-009",
    doc_type: "insurance",
    analyzed_at: "2026-03-27T14:20:00Z",
    issues: [],
    score: 100,
    passed: true,
    summary: "All checks passed.",
    recommendations: [],
  },
  {
    document_id: "doc-mk-2026-003",
    doc_type: "marketing",
    analyzed_at: "2026-03-27T11:05:00Z",
    issues: [{ rule_id: "MK-001", severity: "high", category: "Advertising", description: "Monthly payment advertised without APR disclosure", recommendation: "Include APR with payment terms", regulatory_ref: "TILA Reg Z \u00a7226.24" }],
    score: 85,
    passed: false,
    summary: "1 high issue. Blocking.",
    recommendations: ["[MK-001] Include APR with payment terms"],
  },
];

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${color ?? "text-gray-900"}`}>{value}</p>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.info}`}>
      {severity}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 90 ? "text-emerald-600" : score >= 70 ? "text-amber-600" : "text-red-600";
  return <span className={`font-bold ${color}`}>{score}</span>;
}

function PassedBadge({ passed }: { passed: boolean }) {
  return passed ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
      Passed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
      Failed
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function DocumentCompliancePage() {
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [recentAnalyses, setRecentAnalyses] = useState<AnalysisResult[]>(MOCK_RECENT);
  const [loading, setLoading] = useState(true);

  // Single doc analysis form
  const [docType, setDocType] = useState("purchase_agreement");
  const [docId, setDocId] = useState("");
  const [hasSigned, setHasSigned] = useState(false);
  const [hasVin, setHasVin] = useState(true);
  const [hasDisclosure, setHasDisclosure] = useState(true);
  const [contentText, setContentText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  // Deal jacket form
  const [dealId, setDealId] = useState("");
  const [jacketDocs, setJacketDocs] = useState([
    { id: "doc-pa-1", doc_type: "purchase_agreement", name: "Purchase Agreement", signed: true },
    { id: "doc-ca-1", doc_type: "credit_app", name: "Credit Application", signed: true },
    { id: "doc-dc-1", doc_type: "disclosure", name: "Disclosures Package", signed: false },
    { id: "doc-ins-1", doc_type: "insurance", name: "Proof of Insurance", signed: true },
  ]);
  const [analyzingJacket, setAnalyzingJacket] = useState(false);
  const [jacketResult, setJacketResult] = useState<DealJacketResult | null>(null);

  const loadRules = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/documents/analyze");
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules ?? []);
        setCategories(data.categories ?? []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  async function handleAnalyzeDoc(e: React.FormEvent) {
    e.preventDefault();
    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const res = await fetch("/api/admin/documents/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: docId || `doc-${Date.now()}`,
          doc_type: docType,
          metadata: {
            signed: hasSigned,
            has_signatures: hasSigned,
            has_vin: hasVin,
            has_disclosure: hasDisclosure,
            content_text: contentText || undefined,
          },
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setAnalysisResult(result);
        setRecentAnalyses((prev) => [result, ...prev].slice(0, 10));
      }
    } catch {} finally {
      setAnalyzing(false);
    }
  }

  async function handleAnalyzeJacket(e: React.FormEvent) {
    e.preventDefault();
    setAnalyzingJacket(true);
    setJacketResult(null);
    try {
      const res = await fetch("/api/admin/documents/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: dealId || `deal-${Date.now()}`,
          documents: jacketDocs,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setJacketResult(result);
      }
    } catch {} finally {
      setAnalyzingJacket(false);
    }
  }

  function toggleJacketDocSigned(idx: number) {
    setJacketDocs((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, signed: !d.signed } : d)),
    );
  }

  // Stats
  const avgScore = recentAnalyses.length > 0
    ? Math.round(recentAnalyses.reduce((s, a) => s + a.score, 0) / recentAnalyses.length)
    : 0;
  const criticalIssues = recentAnalyses.reduce(
    (c, a) => c + a.issues.filter((i) => i.severity === "critical").length,
    0,
  );
  const readyDeals = recentAnalyses.filter((a) => a.passed).length;

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Document Compliance</h1>
        <p className="mt-1 text-sm text-gray-500">
          Analyze documents for regulatory compliance, review rules, and track deal readiness.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Analyzed Today" value={recentAnalyses.length} />
        <StatCard label="Avg Compliance Score" value={avgScore} color={avgScore >= 90 ? "text-emerald-600" : avgScore >= 70 ? "text-amber-600" : "text-red-600"} />
        <StatCard label="Critical Issues" value={criticalIssues} color={criticalIssues > 0 ? "text-red-600" : "text-emerald-600"} />
        <StatCard label="Deals Ready to Fund" value={readyDeals} color="text-brand-600" />
      </div>

      {/* Analyze Document Form */}
      <div className="mb-8 rounded-card border border-surface-border bg-white p-6 shadow-card">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Analyze Document</h2>
        <form onSubmit={(e) => { void handleAnalyzeDoc(e); }} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Document Type</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Document ID <span className="font-normal text-gray-400">(optional)</span></label>
              <input
                type="text"
                value={docId}
                onChange={(e) => setDocId(e.target.value)}
                placeholder="doc-pa-2026-001"
                className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={hasSigned} onChange={(e) => setHasSigned(e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                Signed
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={hasVin} onChange={(e) => setHasVin(e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                Has VIN
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={hasDisclosure} onChange={(e) => setHasDisclosure(e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                Disclosure
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Content Text <span className="font-normal text-gray-400">(optional - for text-based checks)</span></label>
            <textarea
              value={contentText}
              onChange={(e) => setContentText(e.target.value)}
              rows={3}
              placeholder="Paste document text for content-based compliance checks (e.g., TILA trigger terms in marketing materials)"
              className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={analyzing}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {analyzing ? "Analyzing..." : "Analyze Document"}
            </button>
          </div>
        </form>

        {/* Analysis Result */}
        {analysisResult && (
          <div className="mt-6 rounded-lg border border-surface-border bg-gray-50 p-4">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Analysis Result</h3>
              <ScoreBadge score={analysisResult.score} />
              <PassedBadge passed={analysisResult.passed} />
            </div>
            <p className="text-sm text-gray-600 mb-3">{analysisResult.summary}</p>
            {analysisResult.issues.length > 0 && (
              <div className="space-y-2">
                {analysisResult.issues.map((issue, i) => (
                  <div key={i} className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-3">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={issue.severity} />
                      <span className="text-xs font-medium text-gray-500">{issue.rule_id}</span>
                      {issue.regulatory_ref && <span className="text-xs text-gray-400">{issue.regulatory_ref}</span>}
                    </div>
                    <p className="text-sm text-gray-800">{issue.description}</p>
                    <p className="text-xs text-gray-500">{issue.recommendation}</p>
                  </div>
                ))}
              </div>
            )}
            {analysisResult.recommendations.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Recommendations:</p>
                <ul className="list-disc pl-5 text-xs text-gray-600 space-y-0.5">
                  {analysisResult.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Analyze Deal Jacket */}
      <div className="mb-8 rounded-card border border-surface-border bg-white p-6 shadow-card">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Analyze Deal Jacket</h2>
        <form onSubmit={(e) => { void handleAnalyzeJacket(e); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Deal ID</label>
            <input
              type="text"
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
              placeholder="deal-2026-042"
              className="mt-1.5 block w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Documents in Jacket</p>
            <div className="space-y-2">
              {jacketDocs.map((doc, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={doc.signed}
                      onChange={() => toggleJacketDocSigned(i)}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    Signed
                  </label>
                  <span className="text-sm text-gray-900 font-medium">{doc.name}</span>
                  <span className="text-xs text-gray-400">({doc.doc_type})</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={analyzingJacket}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {analyzingJacket ? "Analyzing..." : "Analyze Deal Jacket"}
            </button>
          </div>
        </form>

        {/* Jacket Result */}
        {jacketResult && (
          <div className="mt-6 rounded-lg border border-surface-border bg-gray-50 p-4">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Deal Jacket Result</h3>
              <ScoreBadge score={jacketResult.overall_score} />
              {jacketResult.ready_to_fund ? (
                <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
                  Ready to Fund
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800 ring-1 ring-inset ring-red-600/20">
                  Not Ready
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 mb-2">
              {jacketResult.total_documents} documents analyzed. Overall score: {jacketResult.overall_score}/100.
            </p>
            {jacketResult.missing_documents.length > 0 && (
              <p className="text-sm text-red-600 mb-2">
                Missing: {jacketResult.missing_documents.join(", ")}
              </p>
            )}
            {jacketResult.blockers.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-red-700 mb-1">Blockers:</p>
                <ul className="list-disc pl-5 text-xs text-red-600 space-y-0.5">
                  {jacketResult.blockers.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent Analyses */}
      <div className="mb-8 rounded-card border border-surface-border bg-white shadow-card overflow-x-auto">
        <div className="px-4 py-3 border-b border-surface-border">
          <h2 className="text-base font-semibold text-gray-900">Recent Analyses</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-gray-50 text-gray-500">
              <th className="px-4 py-3 font-medium">Document</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Issues</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Date</th>
            </tr>
          </thead>
          <tbody>
            {recentAnalyses.map((a, i) => (
              <tr key={i} className="border-b border-surface-border last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900 truncate max-w-[200px]">{a.document_id}</td>
                <td className="px-4 py-3 text-gray-600 capitalize">{a.doc_type.replace(/_/g, " ")}</td>
                <td className="px-4 py-3"><ScoreBadge score={a.score} /></td>
                <td className="px-4 py-3 hidden sm:table-cell text-gray-600">{a.issues.length}</td>
                <td className="px-4 py-3"><PassedBadge passed={a.passed} /></td>
                <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell whitespace-nowrap">{formatDate(a.analyzed_at)}</td>
              </tr>
            ))}
            {recentAnalyses.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No analyses yet. Use the form above to analyze a document.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Compliance Rules Reference */}
      <div className="rounded-card border border-surface-border bg-white shadow-card overflow-x-auto">
        <div className="px-4 py-3 border-b border-surface-border">
          <h2 className="text-base font-semibold text-gray-900">Compliance Rules Reference</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {loading ? "Loading..." : `${rules.length} rules across ${categories.length} categories`}
          </p>
        </div>
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-gray-50 text-gray-500">
                <th className="px-4 py-3 font-medium">Rule ID</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Description</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Regulatory Ref</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-surface-border last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">{rule.id}</td>
                  <td className="px-4 py-3 text-gray-700">{rule.category}</td>
                  <td className="px-4 py-3"><SeverityBadge severity={rule.severity} /></td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell max-w-xs truncate">{rule.description}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell">{rule.regulatory_ref ?? "---"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
