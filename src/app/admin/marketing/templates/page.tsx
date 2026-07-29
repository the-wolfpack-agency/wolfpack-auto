"use client";

import { useCallback, useEffect, useState } from "react";
import MarketingTemplatePreview from "@/components/MarketingTemplatePreview";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface TemplateSize {
  label: string;
  width: number;
  height: number;
}

interface TemplateField {
  name: string;
  label: string;
  type: string;
  default?: string;
  required?: boolean;
}

interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  sizes: TemplateSize[];
  thumbnail: string;
  fields: TemplateField[];
  tags: string[];
}

interface Vehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  price: number;
  photo_url?: string;
  features?: string[];
}

interface PerformanceRecord {
  template_id: string;
  template_name: string;
  total_uses: number;
  uses_by_channel: Record<string, number>;
  avg_engagement_rate: number;
  top_performer: boolean;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const CATEGORY_TABS = [
  { key: "all", label: "All" },
  { key: "social_post", label: "Social" },
  { key: "email_banner", label: "Email" },
  { key: "flyer", label: "Flyer" },
  { key: "price_tag", label: "Price Tag" },
  { key: "sale_banner", label: "Sale" },
  { key: "new_arrival", label: "New Arrival" },
  { key: "sold_celebration", label: "Sold" },
  { key: "testimonial", label: "Testimonial" },
] as const;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    social_post: "bg-brand-50 text-brand-800 ring-brand-700/20",
    email_banner: "bg-purple-50 text-purple-700 ring-purple-600/20",
    flyer: "bg-orange-50 text-orange-700 ring-orange-600/20",
    price_tag: "bg-red-50 text-red-700 ring-red-600/20",
    sale_banner: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    new_arrival: "bg-brand-50 text-brand-800 ring-brand-700/20",
    sold_celebration: "bg-amber-50 text-amber-700 ring-amber-600/20",
    testimonial: "bg-pink-50 text-pink-700 ring-pink-600/20",
  };
  return colors[category] || "bg-gray-50 text-gray-700 ring-gray-400/20";
}

function formatCategory(cat: string): string {
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* -------------------------------------------------------------------------- */
/* Page Component                                                              */
/* -------------------------------------------------------------------------- */

export default function MarketingTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [performance, setPerformance] = useState<PerformanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);

  /* Fetch templates, vehicles, and performance on mount */
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [tplRes, vehRes, perfRes] = await Promise.all([
          fetch("/api/admin/marketing/templates"),
          fetch("/api/admin/inventory?limit=20"),
          fetch("/api/admin/marketing/templates/performance"),
        ]);

        if (tplRes.ok) {
          const tplData = await tplRes.json();
          setTemplates(tplData.templates || []);
        }
        if (vehRes.ok) {
          const vehData = await vehRes.json();
          setVehicles(vehData.vehicles || []);
        }
        if (perfRes.ok) {
          const perfData = await perfRes.json();
          setPerformance(perfData.performance || []);
        }
      } catch (err) {
        console.error("[templates] Failed to load:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  /* Filter templates by category */
  const filteredTemplates =
    activeCategory === "all"
      ? templates
      : templates.filter((t) => t.category === activeCategory);

  /* Generate preview */
  const generatePreview = useCallback(async () => {
    if (!selectedTemplate) return;
    setGenerating(true);

    const data: Record<string, unknown> = {
      dealer: {
        name: "Your Dealership",
        logo_url: "/logo.png",
        primary_color: "#1e40af",
        secondary_color: "#f59e0b",
        phone: "(555) 123-4567",
        website: "https://yourdealership.com",
      },
      custom: customFields,
    };

    if (selectedVehicle) {
      data.vehicle = {
        photo: selectedVehicle.photo_url || "/placeholder-vehicle.jpg",
        year: selectedVehicle.year,
        make: selectedVehicle.make,
        model: selectedVehicle.model,
        price: selectedVehicle.price,
        features: selectedVehicle.features || [],
      };
    }

    try {
      const res = await fetch(`/api/admin/marketing/templates/${selectedTemplate.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
      if (res.ok) {
        const result = await res.json();
        setPreviewHtml(result.html);
      }
    } catch (err) {
      console.error("[templates] Preview generation failed:", err);
    } finally {
      setGenerating(false);
    }
  }, [selectedTemplate, selectedVehicle, customFields]);

  /* Open in Canva */
  const openInCanva = useCallback(async () => {
    if (!selectedTemplate) return;
    try {
      const res = await fetch(`/api/admin/marketing/templates/${selectedTemplate.id}/canva`);
      if (res.ok) {
        const result = await res.json();
        if (result.canva_connected) {
          window.open(result.url, "_blank");
        } else {
          window.open(result.url, "_self");
        }
      }
    } catch (err) {
      console.error("[templates] Canva link failed:", err);
    }
  }, [selectedTemplate]);

  /* Select a template and init custom fields */
  const selectTemplate = useCallback((template: Template) => {
    setSelectedTemplate(template);
    setPreviewHtml(null);
    const defaults: Record<string, string> = {};
    for (const field of template.fields) {
      defaults[field.name] = field.default || "";
    }
    setCustomFields(defaults);
  }, []);

  /* Get performance for a template */
  const getPerf = useCallback(
    (templateId: string): PerformanceRecord | undefined => {
      return performance.find((p) => p.template_id === templateId);
    },
    [performance],
  );

  /* -------------------------------------------------------------------- */
  /* Render                                                                 */
  /* -------------------------------------------------------------------- */

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-700" />
          <p className="text-sm text-gray-500">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marketing Templates</h1>
          <p className="mt-1 text-sm text-gray-500">
            Professional designs for social media, email, flyers, and more.
            Customize with your branding and vehicle data.
          </p>
        </div>
        <button
          onClick={() => setShowPerformance(!showPerformance)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
        >
          {showPerformance ? "Hide" : "Show"} Performance
        </button>
      </div>

      {/* Performance metrics (collapsible) */}
      {showPerformance && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Template Performance</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-2 font-medium text-gray-500">Template</th>
                  <th className="pb-2 font-medium text-gray-500">Uses</th>
                  <th className="pb-2 font-medium text-gray-500">Engagement</th>
                  <th className="pb-2 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {performance.map((p) => (
                  <tr key={p.template_id} className="border-b border-gray-50">
                    <td className="py-2 font-medium text-gray-900">{p.template_name}</td>
                    <td className="py-2 text-gray-600">{p.total_uses}</td>
                    <td className="py-2 text-gray-600">
                      {p.avg_engagement_rate > 0 ? `${p.avg_engagement_rate.toFixed(1)}%` : "--"}
                    </td>
                    <td className="py-2">
                      {p.top_performer && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                          Top Performer
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveCategory(tab.key)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeCategory === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Template gallery */}
        <div className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            {filteredTemplates.map((tpl) => {
              const perf = getPerf(tpl.id);
              return (
                <button
                  key={tpl.id}
                  onClick={() => selectTemplate(tpl)}
                  className={`rounded-lg border bg-white p-4 text-left shadow-sm transition-all hover:shadow-md ${
                    selectedTemplate?.id === tpl.id
                      ? "border-brand-600 ring-2 ring-brand-200"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${getCategoryColor(tpl.category)}`}
                    >
                      {formatCategory(tpl.category)}
                    </span>
                    {perf?.top_performer && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                        Top Performer
                      </span>
                    )}
                  </div>
                  <h3 className="mb-1 text-sm font-semibold text-gray-900">{tpl.name}</h3>
                  <p className="mb-2 text-xs text-gray-500 line-clamp-2">{tpl.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {tpl.sizes.map((s) => (
                      <span
                        key={s.label}
                        className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500"
                      >
                        {s.label}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {filteredTemplates.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center">
              <p className="text-sm text-gray-500">No templates in this category.</p>
            </div>
          )}
        </div>

        {/* Sidebar: template editor & preview */}
        <div className="space-y-4">
          {selectedTemplate ? (
            <>
              {/* Template info */}
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <h3 className="mb-1 text-base font-semibold text-gray-900">
                  {selectedTemplate.name}
                </h3>
                <p className="mb-3 text-xs text-gray-500">{selectedTemplate.description}</p>

                {/* Vehicle picker */}
                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Feature a Vehicle
                  </label>
                  <select
                    value={selectedVehicle?.vin || ""}
                    onChange={(e) => {
                      const v = vehicles.find((veh) => veh.vin === e.target.value);
                      setSelectedVehicle(v || null);
                    }}
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  >
                    <option value="">None (use placeholder)</option>
                    {vehicles.map((v) => (
                      <option key={v.vin} value={v.vin}>
                        {v.year} {v.make} {v.model} — ${v.price.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Editable fields */}
                {selectedTemplate.fields.map((field) => (
                  <div key={field.name} className="mb-2">
                    <label className="mb-0.5 block text-xs font-medium text-gray-700">
                      {field.label}
                      {field.required && <span className="text-red-500"> *</span>}
                    </label>
                    {field.type === "text" ? (
                      <input
                        type="text"
                        value={customFields[field.name] || ""}
                        onChange={(e) =>
                          setCustomFields((prev) => ({
                            ...prev,
                            [field.name]: e.target.value,
                          }))
                        }
                        placeholder={field.default || ""}
                        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                      />
                    ) : (
                      <input
                        type="number"
                        value={customFields[field.name] || ""}
                        onChange={(e) =>
                          setCustomFields((prev) => ({
                            ...prev,
                            [field.name]: e.target.value,
                          }))
                        }
                        placeholder={field.default || ""}
                        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                      />
                    )}
                  </div>
                ))}

                {/* Action buttons */}
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    onClick={generatePreview}
                    disabled={generating}
                    className="w-full rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-800 disabled:opacity-50 transition-colors"
                  >
                    {generating ? "Generating..." : "Generate Preview"}
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={openInCanva}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
                    >
                      Open in Canva
                    </button>
                    <button
                      onClick={() => {
                        if (previewHtml) {
                          navigator.clipboard.writeText(previewHtml).catch(() => {});
                        }
                      }}
                      disabled={!previewHtml}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40 transition-colors"
                    >
                      Copy HTML
                    </button>
                  </div>
                </div>
              </div>

              {/* Preview */}
              {previewHtml && (
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-3 text-sm font-semibold text-gray-900">Preview</h3>
                  <MarketingTemplatePreview html={previewHtml} size="social" showControls />
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center">
              <p className="text-sm text-gray-500">Select a template to customize and preview.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
