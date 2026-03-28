"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Document {
  id: string;
  deal_id: string | null;
  lead_id: string | null;
  vehicle_vin: string | null;
  doc_type: string;
  name: string;
  file_url: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  uploaded_by: string;
  signed: boolean;
  signed_at: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "---";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  purchase_agreement: "Purchase Agreement",
  title: "Title",
  registration: "Registration",
  insurance: "Insurance",
  disclosure: "Disclosure",
  credit_app: "Credit App",
  trade_title: "Trade Title",
  lien_release: "Lien Release",
  inspection: "Inspection",
  other: "Other",
};

const DOC_TYPE_STYLES: Record<string, string> = {
  purchase_agreement: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
  title: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20",
  registration: "bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-600/20",
  insurance: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20",
  disclosure: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20",
  credit_app: "bg-cyan-50 text-cyan-700 ring-1 ring-inset ring-cyan-600/20",
  trade_title: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20",
  lien_release: "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20",
  inspection: "bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-600/20",
  other: "bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-400/20",
};

const ALL_DOC_TYPES = Object.keys(DOC_TYPE_LABELS);

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

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState("");
  const [filterDeal, setFilterDeal] = useState("");

  // Form state
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("other");
  const [formDealId, setFormDealId] = useState("");
  const [formLeadId, setFormLeadId] = useState("");
  const [formVin, setFormVin] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Signing
  const [signingId, setSigningId] = useState<string | null>(null);

  async function loadDocuments() {
    try {
      const params = new URLSearchParams();
      if (filterType) params.set("doc_type", filterType);
      if (filterDeal) params.set("deal_id", filterDeal);
      const res = await fetch(`/api/admin/documents?${params}`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = (await res.json()) as { documents: Document[] };
      setDocuments(data.documents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterDeal]);

  const unsigned = documents.filter((d) => !d.signed).length;
  const dealIds = [...new Set(documents.map((d) => d.deal_id).filter(Boolean))];
  const dealsWithAllSigned = dealIds.filter((dealId) => {
    const dealDocs = documents.filter((d) => d.deal_id === dealId);
    return dealDocs.length > 0 && dealDocs.every((d) => d.signed);
  });
  const dealsWithMissing = dealIds.length - dealsWithAllSigned.length;

  async function handleSign(docId: string) {
    setSigningId(docId);
    try {
      await fetch(`/api/admin/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signed: true, signature_data: btoa(`e-sig-${Date.now()}`) }),
      });
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === docId ? { ...d, signed: true, signed_at: new Date().toISOString() } : d,
        ),
      );
    } catch {} finally {
      setSigningId(null);
    }
  }

  async function handleDelete(docId: string) {
    try {
      await fetch(`/api/admin/documents/${docId}`, { method: "DELETE" });
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch {}
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/admin/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          doc_type: formType,
          deal_id: formDealId.trim() || null,
          lead_id: formLeadId.trim() || null,
          vehicle_vin: formVin.trim() || null,
          notes: formNotes.trim() || null,
          mime_type: "application/pdf",
          file_size_bytes: null,
          tags: [],
        }),
      });

      const data = (await res.json()) as { error?: string; document?: Document };
      if (!res.ok) {
        setFormError(data.error ?? "Failed to upload document.");
        return;
      }

      // Refresh
      await loadDocuments();

      setShowForm(false);
      setFormName("");
      setFormType("other");
      setFormDealId("");
      setFormLeadId("");
      setFormVin("");
      setFormNotes("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document Vault</h1>
          <p className="mt-1 text-sm text-gray-500">
            {loading ? "Loading..." : `${documents.length} document${documents.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {showForm ? "Cancel" : "+ Upload Document"}
        </button>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Documents" value={documents.length} />
        <StatCard label="Unsigned" value={unsigned} color={unsigned > 0 ? "text-amber-600" : "text-emerald-600"} />
        <StatCard label="Deals with Docs" value={dealIds.length} />
        <StatCard label="Missing Signatures" value={dealsWithMissing} color={dealsWithMissing > 0 ? "text-red-500" : "text-emerald-600"} />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Upload form */}
      {showForm && (
        <div className="mb-8 rounded-card border border-surface-border bg-white p-6 shadow-card">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Upload Document</h2>

          {formError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>
          )}

          <form onSubmit={(e) => { void handleUpload(e); }} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Document Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Purchase Agreement - Smith 2025 Camry"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Document Type</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {ALL_DOC_TYPES.map((t) => (
                    <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Deal ID <span className="font-normal text-gray-400">(optional)</span></label>
                <input
                  type="text"
                  value={formDealId}
                  onChange={(e) => setFormDealId(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="deal-2026-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Lead ID <span className="font-normal text-gray-400">(optional)</span></label>
                <input
                  type="text"
                  value={formLeadId}
                  onChange={(e) => setFormLeadId(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="lead-101"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">VIN <span className="font-normal text-gray-400">(optional)</span></label>
                <input
                  type="text"
                  value={formVin}
                  onChange={(e) => setFormVin(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="1HGBH41JXMN109186"
                />
              </div>
            </div>

            {/* File picker placeholder */}
            <div>
              <label className="block text-sm font-medium text-gray-700">File</label>
              <div className="mt-1.5 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 px-6 py-8 text-center">
                <div>
                  <p className="text-sm text-gray-500">Drag and drop a file, or click to browse</p>
                  <p className="mt-1 text-xs text-gray-400">PDF, JPG, PNG up to 25MB. File upload requires Vercel Blob in production.</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Notes <span className="font-normal text-gray-400">(optional)</span></label>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
                className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Additional notes about this document"
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-surface-border pt-4">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {submitting ? "Uploading..." : "Upload Document"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All Types</option>
          {ALL_DOC_TYPES.map((t) => (
            <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
          ))}
        </select>
        <input
          type="text"
          value={filterDeal}
          onChange={(e) => setFilterDeal(e.target.value)}
          placeholder="Filter by Deal ID"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {/* Document table */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-card bg-gray-100" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-card border border-surface-border bg-white py-16 text-center shadow-card">
          <p className="text-sm text-gray-500">No documents found. Upload your first document to get started.</p>
        </div>
      ) : (
        <div className="rounded-card border border-surface-border bg-white shadow-card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-gray-50 text-gray-500">
                <th className="px-4 py-3 font-medium">Document</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Deal / Lead</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Uploaded By</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Date</th>
                <th className="px-4 py-3 font-medium">Signed</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-b border-surface-border last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 truncate max-w-[240px]">{doc.name}</p>
                    {doc.file_size_bytes && (
                      <p className="text-xs text-gray-400">{formatFileSize(doc.file_size_bytes)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${DOC_TYPE_STYLES[doc.doc_type] ?? DOC_TYPE_STYLES.other}`}>
                      {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <div className="text-xs space-y-0.5">
                      {doc.deal_id && (
                        <a href={`/admin/deals?id=${doc.deal_id}`} className="text-brand-600 hover:underline block">{doc.deal_id}</a>
                      )}
                      {doc.lead_id && (
                        <a href={`/admin/leads?id=${doc.lead_id}`} className="text-brand-600 hover:underline block">{doc.lead_id}</a>
                      )}
                      {!doc.deal_id && !doc.lead_id && <span className="text-gray-400">---</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{doc.uploaded_by}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell whitespace-nowrap">{formatDate(doc.created_at)}</td>
                  <td className="px-4 py-3">
                    {doc.signed ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        Signed
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Unsigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {!doc.signed && (
                        <button
                          onClick={() => { void handleSign(doc.id); }}
                          disabled={signingId === doc.id}
                          className="rounded px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50"
                        >
                          {signingId === doc.id ? "..." : "Sign"}
                        </button>
                      )}
                      <button
                        onClick={() => { void handleDelete(doc.id); }}
                        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
