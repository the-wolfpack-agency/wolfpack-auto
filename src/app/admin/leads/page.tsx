"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import LeadDetailPanel from "@/components/LeadDetailPanel";
import type {
  Lead,
  LeadStatus,
  LeadTemperature,
} from "@/types/lead";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STATUS_OPTIONS: { value: LeadStatus | ""; label: string }[] = [
  { value: "", label: "All Statuses" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "appointment_set", label: "Appointment Set" },
  { value: "sold", label: "Sold" },
  { value: "lost", label: "Lost" },
];

const TEMP_OPTIONS: { value: LeadTemperature | ""; label: string }[] = [
  { value: "", label: "All Temps" },
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cool", label: "Cool" },
  { value: "cold", label: "Cold" },
];

const SORT_OPTIONS = [
  { value: "date", label: "Date" },
  { value: "temperature", label: "Temperature" },
  { value: "status", label: "Status" },
  { value: "name", label: "Name" },
];

const STATUS_BADGE: Record<LeadStatus, string> = {
  new: "bg-blue-50 text-blue-700 ring-blue-600/20",
  contacted: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  qualified: "bg-green-50 text-green-700 ring-green-600/20",
  appointment_set: "bg-purple-50 text-purple-700 ring-purple-600/20",
  sold: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  lost: "bg-gray-100 text-gray-500 ring-gray-400/20",
};

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  appointment_set: "Appointment Set",
  sold: "Sold",
  lost: "Lost",
};

const TEMP_BADGE: Record<LeadTemperature, string> = {
  hot: "bg-red-50 text-red-700 ring-red-600/20",
  warm: "bg-orange-50 text-orange-700 ring-orange-600/20",
  cool: "bg-blue-50 text-blue-700 ring-blue-600/20",
  cold: "bg-gray-100 text-gray-500 ring-gray-400/20",
};

const TEMP_LABEL: Record<LeadTemperature, string> = {
  hot: "Hot",
  warm: "Warm",
  cool: "Cool",
  cold: "Cold",
};

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function LeadsManagementPage() {
  // Data state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [teamMembers, setTeamMembers] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "">("");
  const [tempFilter, setTempFilter] = useState<LeadTemperature | "">("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // UI state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"assign" | "status">("status");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  // Fetch leads
  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (tempFilter) params.set("temperature", tempFilter);
    if (assignedFilter) params.set("assigned_to", assignedFilter);
    if (search) params.set("search", search);
    params.set("sort", sort);
    params.set("dir", sortDir);
    params.set("page", String(page));
    params.set("page_size", String(pageSize));

    try {
      const res = await fetch(`/api/admin/leads?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads ?? []);
        setTotal(data.total ?? 0);
        setTeamMembers(data.team_members ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch leads:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, tempFilter, assignedFilter, search, sort, sortDir, page]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, tempFilter, assignedFilter, search, sort, sortDir]);

  const totalPages = Math.ceil(total / pageSize);

  // Local lead update
  function handleLeadUpdate(leadId: string, updates: Partial<Lead>) {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, ...updates } : l)),
    );
  }

  // Toggle sort direction
  function handleSort(col: string) {
    if (sort === col) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSort(col);
      setSortDir("desc");
    }
  }

  // Select all / none
  function toggleSelectAll() {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map((l) => l.id)));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Bulk operations
  async function handleBulk() {
    if (selectedIds.size === 0 || !bulkValue) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/admin/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: bulkAction,
          lead_ids: Array.from(selectedIds),
          value: bulkValue,
        }),
      });
      if (res.ok) {
        // Optimistic update
        setLeads((prev) =>
          prev.map((l) => {
            if (!selectedIds.has(l.id)) return l;
            if (bulkAction === "status") return { ...l, status: bulkValue as LeadStatus };
            if (bulkAction === "assign") return { ...l, assigned_to: bulkValue };
            return l;
          }),
        );
        setSelectedIds(new Set());
        setBulkValue("");
      }
    } catch (err) {
      console.error("Bulk operation failed:", err);
    } finally {
      setBulkLoading(false);
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  // Unique assigned-to values for filter
  const assignedOptions = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => {
      if (l.assigned_to) set.add(l.assigned_to);
    });
    return Array.from(set).sort();
  }, [leads]);

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Lead Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track, assign, and convert customer inquiries.
        </p>
      </div>

      {/* Summary stats */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Total" value={total} />
        <MiniStat
          label="Hot Leads"
          value={leads.filter((l) => l.temperature === "hot").length}
          color="text-red-600"
        />
        <MiniStat
          label="Unassigned"
          value={leads.filter((l) => !l.assigned_to).length}
          color="text-amber-600"
        />
        <MiniStat
          label="New Today"
          value={
            leads.filter(
              (l) =>
                l.status === "new" &&
                new Date(l.created_at).toDateString() ===
                  new Date().toDateString(),
            ).length
          }
          color="text-blue-600"
        />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Search */}
        <div className="flex-1">
          <label htmlFor="lead-search" className="sr-only">
            Search leads
          </label>
          <input
            id="lead-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, or phone..."
            className="w-full rounded-lg border border-surface-border bg-white px-4 py-2.5 text-sm shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            style={{ fontSize: 16 }}
          />
        </div>

        {/* Status */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "")}
          className="w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 lg:w-auto"
          style={{ fontSize: 16 }}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {/* Temperature */}
        <select
          value={tempFilter}
          onChange={(e) => setTempFilter(e.target.value as LeadTemperature | "")}
          className="w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 lg:w-auto"
          style={{ fontSize: 16 }}
        >
          {TEMP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {/* Assigned */}
        <select
          value={assignedFilter}
          onChange={(e) => setAssignedFilter(e.target.value)}
          className="w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 lg:w-auto"
          style={{ fontSize: 16 }}
        >
          <option value="">All Team</option>
          <option value="__unassigned">Unassigned</option>
          {(teamMembers.length > 0 ? teamMembers : assignedOptions).map(
            (m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ),
          )}
        </select>

        {/* Sort */}
        <div className="flex items-stretch gap-1">
          <select
            value={sort}
            onChange={(e) => handleSort(e.target.value)}
            className="flex-1 rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 lg:flex-none"
            style={{ fontSize: 16 }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            className="flex items-center rounded-lg border border-surface-border bg-white px-2.5 text-sm text-gray-600 shadow-sm transition-colors hover:bg-surface-muted"
            aria-label={`Sort ${sortDir === "desc" ? "ascending" : "descending"}`}
          >
            {sortDir === "desc" ? "\u2193" : "\u2191"}
          </button>
        </div>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 p-3">
          <span className="text-sm font-medium text-brand-700">
            {selectedIds.size} selected
          </span>
          <select
            value={bulkAction}
            onChange={(e) => {
              setBulkAction(e.target.value as "assign" | "status");
              setBulkValue("");
            }}
            className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
            style={{ fontSize: 16 }}
          >
            <option value="status">Change Status</option>
            <option value="assign">Assign To</option>
          </select>

          {bulkAction === "status" ? (
            <select
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
              style={{ fontSize: 16 }}
            >
              <option value="">Select status...</option>
              {STATUS_OPTIONS.filter((o) => o.value).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
              style={{ fontSize: 16 }}
            >
              <option value="">Select person...</option>
              {(teamMembers.length > 0 ? teamMembers : assignedOptions).map(
                (m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ),
              )}
            </select>
          )}

          <button
            type="button"
            onClick={handleBulk}
            disabled={bulkLoading || !bulkValue}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {bulkLoading ? "Updating..." : "Apply"}
          </button>

          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-surface-border">
            <caption className="sr-only">Lead management table</caption>
            <thead className="bg-surface-muted">
              <tr>
                <th scope="col" className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={
                      leads.length > 0 && selectedIds.size === leads.length
                    }
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    aria-label="Select all leads"
                  />
                </th>
                <Th label="Name" sortKey="name" current={sort} dir={sortDir} onSort={handleSort} />
                <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                  Contact
                </th>
                <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell">
                  Vehicle Interest
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <Th label="Temp" sortKey="temperature" current={sort} dir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
                <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                  Score
                </th>
                <th scope="col" className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 md:table-cell">
                  Assigned
                </th>
                <Th label="Date" sortKey="date" current={sort} dir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Expand</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-500">
                    Loading leads...
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-500">
                    No leads match your filters.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <>
                    <tr
                      key={lead.id}
                      className={`group cursor-pointer transition-colors hover:bg-surface-muted/50 ${
                        expandedId === lead.id ? "bg-surface-muted/30" : ""
                      }`}
                      onClick={() =>
                        setExpandedId((prev) =>
                          prev === lead.id ? null : lead.id,
                        )
                      }
                    >
                      <td
                        className="w-10 px-3 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(lead.id)}
                          onChange={() => toggleSelect(lead.id)}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          aria-label={`Select ${lead.first_name} ${lead.last_name}`}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">
                          {lead.first_name} {lead.last_name}
                        </p>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <p className="text-sm text-gray-700">{lead.email}</p>
                        {lead.phone && (
                          <p className="text-xs text-gray-500">{lead.phone}</p>
                        )}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-gray-700 lg:table-cell">
                        {lead.vehicle_interest || "\u2014"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                            STATUS_BADGE[lead.status] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {STATUS_LABEL[lead.status] ?? lead.status}
                        </span>
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-sm sm:table-cell">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                            TEMP_BADGE[lead.temperature] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {TEMP_LABEL[lead.temperature] ?? lead.temperature}
                        </span>
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-sm sm:table-cell">
                        {lead.intent_score != null ? (
                          <IntentScoreBadge score={lead.intent_score} />
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-gray-700 md:table-cell">
                        {lead.assigned_to ?? (
                          <span className="text-gray-400">Unassigned</span>
                        )}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-gray-500 md:table-cell">
                        {formatDate(lead.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">
                        <span
                          className={`inline-block transition-transform ${
                            expandedId === lead.id ? "rotate-90" : ""
                          }`}
                        >
                          &#9654;
                        </span>
                      </td>
                    </tr>
                    {expandedId === lead.id && (
                      <LeadDetailPanel
                        key={`detail-${lead.id}`}
                        lead={lead}
                        teamMembers={teamMembers}
                        onUpdate={handleLeadUpdate}
                      />
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <nav
            aria-label="Leads pagination"
            className="flex items-center justify-between border-t border-surface-border px-4 py-3"
          >
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages} ({total} leads)
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <button
                  type="button"
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-md border border-surface-border px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-surface-muted"
                >
                  Previous
                </button>
              )}
              {page < totalPages && (
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-md border border-surface-border px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-surface-muted"
                >
                  Next
                </button>
              )}
            </div>
          </nav>
        )}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${color ?? "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}

function Th({
  label,
  sortKey,
  current,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: string;
  current: string;
  dir: "asc" | "desc";
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = current === sortKey;
  return (
    <th
      scope="col"
      className={`cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-900 ${className ?? ""}`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {active && (
        <span className="ml-1">{dir === "desc" ? "\u2193" : "\u2191"}</span>
      )}
    </th>
  );
}

function IntentScoreBadge({ score }: { score: number }) {
  let colorClass: string;
  if (score >= 75) {
    colorClass = "bg-green-50 text-green-700 ring-green-600/20";
  } else if (score >= 50) {
    colorClass = "bg-yellow-50 text-yellow-700 ring-yellow-600/20";
  } else if (score >= 25) {
    colorClass = "bg-orange-50 text-orange-700 ring-orange-600/20";
  } else {
    colorClass = "bg-red-50 text-red-700 ring-red-600/20";
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${colorClass}`}
      title={`Intent score: ${score}/100`}
    >
      {score}
    </span>
  );
}
