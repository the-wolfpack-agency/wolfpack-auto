"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ContractDocument {
  type: string;
  name: string;
  status: "pending" | "sent" | "signed" | "declined";
  signed_at: string | null;
}

interface Contract {
  id: string;
  deal_id: string;
  customer_name: string;
  customer_email: string;
  vehicle_description: string;
  provider: "docusign" | "hellosign" | "internal";
  status: "draft" | "sent" | "partially_signed" | "completed" | "voided" | "expired";
  documents: ContractDocument[];
  envelope_id: string | null;
  sent_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "partially_signed", label: "Partially Signed" },
  { value: "completed", label: "Completed" },
  { value: "voided", label: "Voided" },
  { value: "expired", label: "Expired" },
];

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 ring-gray-400/20",
  sent: "bg-blue-50 text-blue-700 ring-blue-600/20",
  partially_signed: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  completed: "bg-green-50 text-green-700 ring-green-600/20",
  voided: "bg-red-50 text-red-700 ring-red-600/20",
  expired: "bg-orange-50 text-orange-700 ring-orange-600/20",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_signed: "Partially Signed",
  completed: "Completed",
  voided: "Voided",
  expired: "Expired",
};

const PROVIDER_LABEL: Record<string, string> = {
  docusign: "DocuSign",
  hellosign: "HelloSign",
  internal: "Internal",
};

const DOCUMENT_TYPES = [
  { value: "purchase_agreement", label: "Purchase Agreement" },
  { value: "buyers_guide", label: "Buyer's Guide" },
  { value: "odometer_disclosure", label: "Odometer Disclosure" },
  { value: "title_application", label: "Title Application" },
  { value: "insurance_verification", label: "Insurance Verification" },
  { value: "arbitration_agreement", label: "Arbitration Agreement" },
  { value: "privacy_notice", label: "Privacy Notice" },
  { value: "credit_application", label: "Credit Application" },
];

const DOC_STATUS_BADGE: Record<string, string> = {
  pending: "bg-gray-100 text-gray-500",
  sent: "bg-blue-50 text-blue-600",
  signed: "bg-green-50 text-green-600",
  declined: "bg-red-50 text-red-600",
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function fmtDate(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function signedCount(docs: ContractDocument[]): number {
  return docs.filter((d) => d.status === "signed").length;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function EContractingPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Filters */
  const [statusFilter, setStatusFilter] = useState("");

  /* Expanded row */
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* New Contract modal */
  const [showNewContract, setShowNewContract] = useState(false);
  const [newForm, setNewForm] = useState({
    deal_id: "",
    signer_name: "",
    signer_email: "",
    vehicle_description: "",
    provider: "docusign" as "docusign" | "hellosign" | "internal",
    document_types: ["purchase_agreement", "buyers_guide"] as string[],
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  /* Action loading */
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  /* Fetch contracts */
  const fetchContracts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/admin/econtracting?${params.toString()}`);
      if (!res.ok) {
        setError("Failed to load contracts");
        return;
      }
      const data = await res.json();
      setContracts(data.contracts ?? []);
    } catch (err) {
      console.error("Failed to fetch contracts:", err);
      setError("Failed to load contracts");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  /* Stats */
  const stats = useMemo(() => {
    const total = contracts.length;
    const pending = contracts.filter((c) =>
      ["sent", "partially_signed"].includes(c.status),
    ).length;
    const completed = contracts.filter((c) => c.status === "completed").length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Avg time to sign (completed contracts only)
    const completedContracts = contracts.filter(
      (c) => c.status === "completed" && c.sent_at && c.completed_at,
    );
    let avgTimeHours = 0;
    if (completedContracts.length > 0) {
      const totalMs = completedContracts.reduce((sum, c) => {
        return sum + (new Date(c.completed_at!).getTime() - new Date(c.sent_at!).getTime());
      }, 0);
      avgTimeHours = Math.round(totalMs / completedContracts.length / (1000 * 60 * 60) * 10) / 10;
    }

    return { total, pending, completionRate, avgTimeHours };
  }, [contracts]);

  /* Create new contract */
  const handleCreate = async () => {
    if (!newForm.deal_id || !newForm.signer_name || !newForm.signer_email || newForm.document_types.length === 0) {
      setCreateError("Please fill in all required fields and select at least one document type.");
      return;
    }
    if (!newForm.signer_email.includes("@")) {
      setCreateError("Please enter a valid email address.");
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/admin/econtracting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      });
      if (!res.ok) {
        const data = await res.json();
        setCreateError(data.error || "Failed to create contract");
        return;
      }
      setShowNewContract(false);
      setNewForm({
        deal_id: "",
        signer_name: "",
        signer_email: "",
        vehicle_description: "",
        provider: "docusign",
        document_types: ["purchase_agreement", "buyers_guide"],
      });
      fetchContracts();
    } catch (err) {
      console.error("Create contract failed:", err);
      setCreateError("Failed to create contract");
    } finally {
      setCreating(false);
    }
  };

  /* Send envelope */
  const handleSend = async (contractId: string) => {
    setActionLoading(contractId);
    try {
      const res = await fetch(`/api/admin/econtracting/${contractId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send" }),
      });
      if (res.ok) {
        fetchContracts();
      }
    } catch (err) {
      console.error("Send failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  /* Void contract */
  const handleVoid = async (contractId: string) => {
    if (!confirm("Are you sure you want to void this contract? This cannot be undone.")) return;
    setActionLoading(contractId);
    try {
      const res = await fetch(`/api/admin/econtracting/${contractId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "void" }),
      });
      if (res.ok) {
        fetchContracts();
      }
    } catch (err) {
      console.error("Void failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  /* Sign document (simulation) */
  const handleSign = async (contractId: string, documentType: string) => {
    setActionLoading(`${contractId}:${documentType}`);
    try {
      const res = await fetch("/api/admin/econtracting/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contract_id: contractId, document_type: documentType }),
      });
      if (res.ok) {
        fetchContracts();
      }
    } catch (err) {
      console.error("Sign failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  /* Toggle doc type in new form */
  const toggleDocType = (type: string) => {
    setNewForm((prev) => ({
      ...prev,
      document_types: prev.document_types.includes(type)
        ? prev.document_types.filter((t) => t !== type)
        : [...prev.document_types, type],
    }));
  };

  return (
    <div className="min-h-screen bg-surface-muted">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">eContracting</h1>
            <p className="mt-1 text-sm text-gray-500">
              Digital contracts, e-signatures, and deal packet management
            </p>
          </div>
          <button
            onClick={() => setShowNewContract(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Contract
          </button>
        </div>

        {/* Stats cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Contracts" value={String(stats.total)} sub="all time" color="brand" />
          <StatCard label="Pending Signatures" value={String(stats.pending)} sub="awaiting action" color="yellow" />
          <StatCard label="Completion Rate" value={`${stats.completionRate}%`} sub="of all contracts" color="green" />
          <StatCard label="Avg Time to Sign" value={stats.avgTimeHours > 0 ? `${stats.avgTimeHours}h` : "--"} sub="send to complete" color="purple" />
        </div>

        {/* Filter bar */}
        <div className="mt-6 flex flex-col gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:flex-row sm:items-end">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-gray-500">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-1 block w-full rounded-md border border-surface-border bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="mt-6 rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Contract table */}
        <div className="mt-6 overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-border">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Customer / Vehicle
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                    Documents
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">
                    Provider
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell">
                    Sent
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                      Loading contracts...
                    </td>
                  </tr>
                ) : contracts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                      No contracts found. Click &quot;New Contract&quot; to create one.
                    </td>
                  </tr>
                ) : (
                  contracts.map((contract) => (
                    <ContractRow
                      key={contract.id}
                      contract={contract}
                      expanded={expandedId === contract.id}
                      onToggle={() => setExpandedId(expandedId === contract.id ? null : contract.id)}
                      onSend={handleSend}
                      onVoid={handleVoid}
                      onSign={handleSign}
                      actionLoading={actionLoading}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* New Contract Modal */}
      {showNewContract && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-t-2xl sm:rounded-card bg-white p-6 shadow-xl max-h-[95dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">New Contract Envelope</h2>
              <button
                onClick={() => { setShowNewContract(false); setCreateError(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {createError && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {createError}
              </div>
            )}

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-500">Deal ID *</label>
                <input
                  type="text"
                  value={newForm.deal_id}
                  onChange={(e) => setNewForm({ ...newForm, deal_id: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="deal-001"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Signer Name *</label>
                <input
                  type="text"
                  value={newForm.signer_name}
                  onChange={(e) => setNewForm({ ...newForm, signer_name: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="John Smith"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Signer Email *</label>
                <input
                  type="email"
                  value={newForm.signer_email}
                  onChange={(e) => setNewForm({ ...newForm, signer_email: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="john@example.com"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-500">Vehicle Description</label>
                <input
                  type="text"
                  value={newForm.vehicle_description}
                  onChange={(e) => setNewForm({ ...newForm, vehicle_description: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="2025 Honda CR-V Hybrid"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-500">Signing Provider</label>
                <select
                  value={newForm.provider}
                  onChange={(e) => setNewForm({ ...newForm, provider: e.target.value as "docusign" | "hellosign" | "internal" })}
                  className="mt-1 block w-full rounded-md border border-surface-border bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="docusign">DocuSign</option>
                  <option value="hellosign">HelloSign</option>
                  <option value="internal">Internal</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-2">Document Types *</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DOCUMENT_TYPES.map((dt) => (
                    <label
                      key={dt.value}
                      className="flex items-center gap-2 rounded-md border border-surface-border px-3 py-2 text-sm cursor-pointer hover:bg-surface-subtle transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={newForm.document_types.includes(dt.value)}
                        onChange={() => toggleDocType(dt.value)}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="text-gray-700">{dt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setShowNewContract(false); setCreateError(null); }}
                className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-surface-subtle"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newForm.deal_id || !newForm.signer_name || !newForm.signer_email || newForm.document_types.length === 0}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Contract"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Contract row subcomponent                                                  */
/* -------------------------------------------------------------------------- */

function ContractRow({
  contract,
  expanded,
  onToggle,
  onSend,
  onVoid,
  onSign,
  actionLoading,
}: {
  contract: Contract;
  expanded: boolean;
  onToggle: () => void;
  onSend: (id: string) => void;
  onVoid: (id: string) => void;
  onSign: (contractId: string, docType: string) => void;
  actionLoading: string | null;
}) {
  const signed = signedCount(contract.documents);
  const total = contract.documents.length;

  return (
    <>
      <tr
        className="transition-colors hover:bg-surface-muted cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <p className="text-sm font-medium text-gray-900">{contract.customer_name}</p>
          <p className="mt-0.5 text-xs text-gray-500">{contract.vehicle_description}</p>
          <p className="mt-0.5 text-xs text-gray-400 sm:hidden">
            {signed}/{total} signed
          </p>
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[contract.status] || "bg-gray-100 text-gray-600 ring-gray-400/20"}`}
          >
            {STATUS_LABEL[contract.status] || contract.status}
          </span>
        </td>
        <td className="hidden px-4 py-3 sm:table-cell">
          <span className="text-sm text-gray-700">
            {signed}/{total} signed
          </span>
          {/* Progress bar */}
          <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${total > 0 ? (signed / total) * 100 : 0}%` }}
            />
          </div>
        </td>
        <td className="hidden px-4 py-3 md:table-cell">
          <span className="text-xs font-medium text-gray-600">
            {PROVIDER_LABEL[contract.provider] || contract.provider}
          </span>
        </td>
        <td className="hidden px-4 py-3 text-xs text-gray-400 lg:table-cell">
          {fmtDate(contract.sent_at)}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            {contract.status === "draft" && (
              <button
                onClick={() => onSend(contract.id)}
                disabled={actionLoading === contract.id}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {actionLoading === contract.id ? "Sending..." : "Send"}
              </button>
            )}
            {["draft", "sent", "partially_signed"].includes(contract.status) && (
              <button
                onClick={() => onVoid(contract.id)}
                disabled={actionLoading === contract.id}
                className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                Void
              </button>
            )}
            <button
              onClick={onToggle}
              className="rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-surface-subtle"
            >
              {expanded ? "Hide" : "Details"}
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded document detail */}
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-surface-subtle px-4 py-4">
            <div className="rounded-lg border border-surface-border bg-white p-4">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Document Details</p>
                  <p className="text-xs text-gray-500">
                    Envelope: {contract.envelope_id || "Not yet assigned"}
                    {contract.expires_at && (
                      <span className="ml-2 text-orange-600">Expires: {fmtDate(contract.expires_at)}</span>
                    )}
                  </p>
                </div>
                {contract.completed_at && (
                  <p className="text-xs text-green-600 font-medium">
                    Completed: {fmtDate(contract.completed_at)}
                  </p>
                )}
              </div>
              <div className="divide-y divide-surface-border">
                {contract.documents.map((doc) => (
                  <div
                    key={doc.type}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${DOC_STATUS_BADGE[doc.status] || ""}`}>
                        {doc.status === "signed" ? "Signed" : doc.status === "sent" ? "Awaiting" : doc.status === "declined" ? "Declined" : "Pending"}
                      </span>
                      <span className="text-sm text-gray-800">{doc.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {doc.signed_at && (
                        <span className="text-xs text-gray-400">
                          Signed {fmtDate(doc.signed_at)}
                        </span>
                      )}
                      {(doc.status === "sent" || doc.status === "pending") &&
                        !["completed", "voided", "expired"].includes(contract.status) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSign(contract.id, doc.type);
                            }}
                            disabled={actionLoading === `${contract.id}:${doc.type}`}
                            className="rounded-md bg-green-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                          >
                            {actionLoading === `${contract.id}:${doc.type}` ? "Signing..." : "Sign"}
                          </button>
                        )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Stat card subcomponent                                                     */
/* -------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    brand: "border-l-brand-500",
    green: "border-l-green-500",
    purple: "border-l-purple-500",
    yellow: "border-l-yellow-500",
    accent: "border-l-accent-500",
  };

  return (
    <div
      className={`rounded-card border border-surface-border border-l-4 bg-white p-4 shadow-card ${colorMap[color] || colorMap.brand}`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs text-gray-400">{sub}</p>
    </div>
  );
}
