"use client";

import { useEffect, useState, useCallback } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface IngestedDocument {
  document_id: string;
  doc_type: string;
  name: string;
  ingested_at: string;
  size_chars: number;
}

interface QueryResult {
  document_id: string;
  doc_type: string;
  relevance_score: number;
  excerpt: string;
  title: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

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

const DOC_TYPE_OPTIONS = Object.entries(DOC_TYPE_LABELS).map(([value, label]) => ({ value, label }));

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSize(chars: number): string {
  if (chars < 1000) return `${chars} chars`;
  return `${(chars / 1000).toFixed(1)}K chars`;
}

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

function RelevanceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 85 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-500" : "bg-gray-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-gray-200">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600">{pct}%</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function KnowledgeBasePage() {
  const [documents, setDocuments] = useState<IngestedDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [lastIngested, setLastIngested] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Ingest form
  const [showIngestForm, setShowIngestForm] = useState(false);
  const [ingestDocType, setIngestDocType] = useState("other");
  const [ingestName, setIngestName] = useState("");
  const [ingestContent, setIngestContent] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [ingestMessage, setIngestMessage] = useState<string | null>(null);

  // Query
  const [queryText, setQueryText] = useState("");
  const [queryResults, setQueryResults] = useState<QueryResult[]>([]);
  const [querying, setQuerying] = useState(false);
  const [queryTotal, setQueryTotal] = useState(0);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/knowledge/ingest");
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents ?? []);
        setTotal(data.total ?? 0);
        setLastIngested(data.last_ingested_at ?? null);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  async function handleIngest(e: React.FormEvent) {
    e.preventDefault();
    setIngesting(true);
    setIngestMessage(null);
    try {
      const res = await fetch("/api/admin/knowledge/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: `kb-${Date.now()}`,
          doc_type: ingestDocType,
          content_text: ingestContent,
          metadata: { name: ingestName },
        }),
      });
      if (res.ok) {
        setIngestMessage("Document ingested successfully.");
        setIngestName("");
        setIngestContent("");
        setIngestDocType("other");
        setShowIngestForm(false);
        await loadDocuments();
      } else {
        const data = await res.json();
        setIngestMessage(data.error ?? "Failed to ingest document.");
      }
    } catch {
      setIngestMessage("Network error.");
    } finally {
      setIngesting(false);
    }
  }

  async function handleQuery(e: React.FormEvent) {
    e.preventDefault();
    if (!queryText.trim()) return;
    setQuerying(true);
    setQueryResults([]);
    try {
      const res = await fetch("/api/admin/knowledge/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryText, limit: 5 }),
      });
      if (res.ok) {
        const data = await res.json();
        setQueryResults(data.results ?? []);
        setQueryTotal(data.total ?? 0);
      }
    } catch {} finally {
      setQuerying(false);
    }
  }

  // Doc type breakdown
  const typeBreakdown: Record<string, number> = {};
  for (const doc of documents) {
    typeBreakdown[doc.doc_type] = (typeBreakdown[doc.doc_type] ?? 0) + 1;
  }
  const sortedTypes = Object.entries(typeBreakdown).sort((a, b) => b[1] - a[1]);

  return (
    <>
      {/* Header */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
          <p className="mt-1 text-sm text-gray-500">
            Ingest documents and query the compliance knowledge store for RAG-powered answers.
          </p>
        </div>
        <button
          onClick={() => setShowIngestForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {showIngestForm ? "Cancel" : "+ Ingest Document"}
        </button>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Documents Ingested" value={loading ? "..." : total} color="text-brand-600" />
        <StatCard label="Last Ingested" value={lastIngested ? formatDate(lastIngested) : "---"} />
        <StatCard label="Document Types" value={Object.keys(typeBreakdown).length} />
      </div>

      {/* Success message */}
      {ingestMessage && (
        <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${ingestMessage.includes("success") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {ingestMessage}
        </div>
      )}

      {/* Ingest Form */}
      {showIngestForm && (
        <div className="mb-8 rounded-card border border-surface-border bg-white p-6 shadow-card">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Ingest Document</h2>
          <form onSubmit={(e) => { void handleIngest(e); }} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Document Name</label>
                <input
                  type="text"
                  required
                  value={ingestName}
                  onChange={(e) => setIngestName(e.target.value)}
                  placeholder="TILA Regulation Z Reference Guide"
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Document Type</label>
                <select
                  value={ingestDocType}
                  onChange={(e) => setIngestDocType(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {DOC_TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Content Text</label>
              <textarea
                required
                value={ingestContent}
                onChange={(e) => setIngestContent(e.target.value)}
                rows={6}
                placeholder="Paste document text content here. This will be embedded and stored for future RAG queries."
                className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div className="flex justify-end gap-3 border-t border-surface-border pt-4">
              <button
                type="button"
                onClick={() => setShowIngestForm(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={ingesting}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {ingesting ? "Ingesting..." : "Ingest Document"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Query Interface */}
      <div className="mb-8 rounded-card border border-surface-border bg-white p-6 shadow-card">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Query Knowledge Base</h2>
        <form onSubmit={(e) => { void handleQuery(e); }} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Search: e.g., 'TILA disclosure requirements for purchase agreements'"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <button
            type="submit"
            disabled={querying || !queryText.trim()}
            className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 whitespace-nowrap"
          >
            {querying ? "Searching..." : "Search"}
          </button>
        </form>

        {/* Query Results */}
        {queryResults.length > 0 && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-gray-500">{queryTotal} result{queryTotal !== 1 ? "s" : ""} found</p>
            {queryResults.map((r, i) => (
              <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-gray-900">{r.title}</span>
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-700/20">
                    {DOC_TYPE_LABELS[r.doc_type] ?? r.doc_type}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{r.excerpt}</p>
                <RelevanceBar score={r.relevance_score} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Document Type Breakdown */}
      {sortedTypes.length > 0 && (
        <div className="mb-8 rounded-card border border-surface-border bg-white p-6 shadow-card">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Document Type Breakdown</h2>
          <div className="space-y-2">
            {sortedTypes.map(([type, count]) => {
              const maxCount = sortedTypes[0][1];
              const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
              return (
                <div key={type} className="flex items-center gap-3">
                  <span className="w-36 text-sm text-gray-700 truncate">{DOC_TYPE_LABELS[type] ?? type}</span>
                  <div className="flex-1 h-4 rounded-full bg-gray-100">
                    <div
                      className="h-4 rounded-full bg-brand-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-900 w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ingested Documents Table */}
      <div className="rounded-card border border-surface-border bg-white shadow-card overflow-x-auto">
        <div className="px-4 py-3 border-b border-surface-border">
          <h2 className="text-base font-semibold text-gray-900">Ingested Documents</h2>
        </div>
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            No documents ingested yet. Use the form above to add documents to the knowledge base.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-gray-50 text-gray-500">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Size</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Ingested</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.document_id} className="border-b border-surface-border last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 truncate max-w-[280px]">{doc.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-700/20">
                      {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{formatSize(doc.size_chars)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell whitespace-nowrap">{formatDate(doc.ingested_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
