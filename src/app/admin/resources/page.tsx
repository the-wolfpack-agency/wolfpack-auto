"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type ResourceCategory =
  | "product_guide"
  | "competitive"
  | "cheat_sheet"
  | "process"
  | "compliance";

interface Resource {
  id: string;
  title: string;
  category: ResourceCategory;
  file_url: string;
  description: string;
  vehicles_applicable: string[];
  views: number;
  last_updated: string;
  tags: string[];
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const CATEGORY_LABELS: Record<ResourceCategory | "all", string> = {
  all: "All",
  product_guide: "Product Guides",
  competitive: "Competitive",
  cheat_sheet: "Cheat Sheets",
  process: "Process",
  compliance: "Compliance",
};

const CATEGORY_BADGE: Record<ResourceCategory, string> = {
  product_guide: "bg-brand-50 text-brand-800 ring-brand-700/20",
  competitive: "bg-purple-50 text-purple-700 ring-purple-600/20",
  cheat_sheet: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  process: "bg-teal-50 text-teal-700 ring-teal-600/20",
  compliance: "bg-red-50 text-red-700 ring-red-600/20",
};

type CategoryFilter = ResourceCategory | "all";

const CATEGORY_TABS: CategoryFilter[] = [
  "all",
  "product_guide",
  "competitive",
  "cheat_sheet",
  "process",
  "compliance",
];

function fmt(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isThisMonth(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [copyMsg, setCopyMsg] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // Form state
  const [fTitle, setFTitle] = useState("");
  const [fCategory, setFCategory] = useState<ResourceCategory>("product_guide");
  const [fUrl, setFUrl] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fVehicles, setFVehicles] = useState("");
  const [fTags, setFTags] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/resources");
      if (res.ok) {
        const json = await res.json();
        setResources(json.resources ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch resources:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtered resources
  const filtered = useMemo(() => {
    let list = resources;
    if (activeCategory !== "all") {
      list = list.filter((r) => r.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [resources, activeCategory, search]);

  // Derived stats
  const mostViewed = useMemo(
    () => resources.reduce((top, r) => (r.views > (top?.views ?? -1) ? r : top), resources[0]),
    [resources],
  );
  const updatedThisMonth = useMemo(
    () => resources.filter((r) => isThisMonth(r.last_updated)).length,
    [resources],
  );
  const categoryCount = useMemo(
    () => new Set(resources.map((r) => r.category)).size,
    [resources],
  );

  async function handleView(resource: Resource) {
    // Analytics
    try {
      await fetch("/api/admin/resources/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "resource_viewed",
          metadata: { category: resource.category, title: resource.title },
        }),
      });
    } catch {
      // non-blocking
    }
    window.open(resource.file_url, "_blank", "noopener,noreferrer");
  }

  async function handleCopy(resource: Resource) {
    try {
      await navigator.clipboard.writeText(resource.file_url);
      setCopyMsg(resource.id);
      setTimeout(() => setCopyMsg(""), 2000);
    } catch {
      // ignore
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fTitle || !fUrl || !fDesc) return;
    setSubmitLoading(true);
    try {
      const res = await fetch("/api/admin/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fTitle,
          category: fCategory,
          file_url: fUrl,
          description: fDesc,
          vehicles_applicable: fVehicles
            ? fVehicles.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
          tags: fTags
            ? fTags.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
        }),
      });
      if (res.ok) {
        setSuccessMsg("Resource added successfully.");
        setFTitle("");
        setFUrl("");
        setFDesc("");
        setFVehicles("");
        setFTags("");
        await fetchData();
        setTimeout(() => setSuccessMsg(""), 4000);
      }
    } catch (err) {
      console.error("Failed to add resource:", err);
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Resource Center</h1>
        <p className="mt-1 text-sm text-gray-500">
          Product guides, competitive battlecards, process docs, and compliance materials. Content is embedded in Qdrant for natural language search.
        </p>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Resources" value={resources.length} />
        <StatCard
          label="Most Viewed"
          value={mostViewed ? `${mostViewed.views} views` : "—"}
          sub={mostViewed?.title}
        />
        <StatCard label="Updated This Month" value={updatedThisMonth} />
        <StatCard label="Categories" value={categoryCount} />
      </div>

      {/* Search + category tabs */}
      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title or tag…"
          className="mb-4 w-full rounded-lg border border-surface-border bg-white px-4 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          style={{ fontSize: 16 }}
          aria-label="Search resources"
        />

        {/* Category tabs */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by category">
          {CATEGORY_TABS.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={activeCategory === cat}
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-brand-600 text-white shadow-sm"
                  : "border border-surface-border bg-white text-gray-600 hover:bg-surface-muted"
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Resource grid */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-500">Loading resources…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500">No resources match your filters.</div>
      ) : (
        <div
          className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          role="tabpanel"
        >
          {filtered.map((resource) => (
            <article
              key={resource.id}
              className="flex flex-col rounded-card border border-surface-border bg-white p-5 shadow-card transition-shadow hover:shadow-md"
            >
              {/* Category badge */}
              <div className="mb-3 flex items-center justify-between">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${CATEGORY_BADGE[resource.category]}`}
                >
                  {CATEGORY_LABELS[resource.category]}
                </span>
                <span className="text-xs text-gray-400">{resource.views} views</span>
              </div>

              <h3 className="mb-1 text-sm font-semibold text-gray-900 leading-snug">
                {resource.title}
              </h3>
              <p className="mb-3 flex-1 text-xs text-gray-500 leading-relaxed">
                {resource.description}
              </p>

              {/* Vehicles applicable */}
              {resource.vehicles_applicable.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {resource.vehicles_applicable.map((v) => (
                    <span
                      key={v}
                      className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                    >
                      {v}
                    </span>
                  ))}
                </div>
              )}

              {/* Tags */}
              {resource.tags.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {resource.tags.map((t) => (
                    <span key={t} className="text-xs text-gray-400">
                      #{t}
                    </span>
                  ))}
                </div>
              )}

              <p className="mb-4 text-xs text-gray-400">
                Updated {fmt(resource.last_updated)}
              </p>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleView(resource)}
                  className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
                >
                  View
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(resource)}
                  className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-surface-muted"
                >
                  {copyMsg === resource.id ? "Copied!" : "Copy Link"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Add resource form */}
      <section
        aria-labelledby="add-resource-heading"
        className="rounded-card border border-surface-border bg-white p-6 shadow-card"
      >
        <h2 id="add-resource-heading" className="mb-4 text-lg font-semibold text-gray-900">
          Add Resource
        </h2>

        {successMsg && (
          <div role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="r-title" className="mb-1 block text-xs font-medium text-gray-700">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="r-title"
              type="text"
              required
              value={fTitle}
              onChange={(e) => setFTitle(e.target.value)}
              placeholder="e.g. 2025 EV Lineup Product Guide"
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              style={{ fontSize: 16 }}
            />
          </div>

          <div>
            <label htmlFor="r-category" className="mb-1 block text-xs font-medium text-gray-700">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              id="r-category"
              required
              value={fCategory}
              onChange={(e) => setFCategory(e.target.value as ResourceCategory)}
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              style={{ fontSize: 16 }}
            >
              <option value="product_guide">Product Guide</option>
              <option value="competitive">Competitive</option>
              <option value="cheat_sheet">Cheat Sheet</option>
              <option value="process">Process</option>
              <option value="compliance">Compliance</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="r-url" className="mb-1 block text-xs font-medium text-gray-700">
              File URL <span className="text-red-500">*</span>
            </label>
            <input
              id="r-url"
              type="url"
              required
              value={fUrl}
              onChange={(e) => setFUrl(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              style={{ fontSize: 16 }}
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="r-desc" className="mb-1 block text-xs font-medium text-gray-700">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="r-desc"
              required
              rows={3}
              value={fDesc}
              onChange={(e) => setFDesc(e.target.value)}
              placeholder="Brief description of what this resource covers…"
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              style={{ fontSize: 16 }}
            />
          </div>

          <div>
            <label htmlFor="r-vehicles" className="mb-1 block text-xs font-medium text-gray-700">
              Vehicles Applicable
              <span className="ml-1 text-gray-400">(comma-separated)</span>
            </label>
            <input
              id="r-vehicles"
              type="text"
              value={fVehicles}
              onChange={(e) => setFVehicles(e.target.value)}
              placeholder="e.g. Model Y, Ioniq 6"
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              style={{ fontSize: 16 }}
            />
          </div>

          <div>
            <label htmlFor="r-tags" className="mb-1 block text-xs font-medium text-gray-700">
              Tags
              <span className="ml-1 text-gray-400">(comma-separated)</span>
            </label>
            <input
              id="r-tags"
              type="text"
              value={fTags}
              onChange={(e) => setFTags(e.target.value)}
              placeholder="e.g. EV, specs, objections"
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              style={{ fontSize: 16 }}
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitLoading}
              className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {submitLoading ? "Adding…" : "Add Resource"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900">{value}</p>
      {sub && (
        <p className="mt-0.5 truncate text-xs text-gray-400" title={sub}>
          {sub}
        </p>
      )}
    </div>
  );
}
