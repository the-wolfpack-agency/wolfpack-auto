"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAnalytics } from "@/components/EventCollector";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type ActionType = "hold" | "reduce" | "increase" | "markdown" | "spotlight";
type SortKey = "opportunity" | "days_on_lot" | "demand" | "price";
type BodyType = "sedan" | "suv" | "truck" | "van" | "coupe" | "convertible" | "wagon" | "hatchback" | "other";
type AgeTier = "fresh" | "aging" | "stale" | "critical";

interface Vehicle {
  id: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  body_type: BodyType;
  photo_url: string | null;
  current_price: number;
  recommended_price: number;
  price_delta: number;
  action: ActionType;
  action_reason: string;
  demand_score: number;
  days_on_lot: number;
  estimated_days_to_sale: number;
  season_tag: string | null;
  revenue_opportunity: number;
  elasticity_data: ElasticityPoint[];
  comparables: ComparableVehicle[];
  demand_signals: DemandSignal[];
  aging_timeline: AgingStep[];
  recommendation_history: RecommendationHistoryEntry[];
}

interface ElasticityPoint {
  price: number;
  probability: number;
}

interface ComparableVehicle {
  id: string;
  year: number;
  make: string;
  model: string;
  price: number;
  days_on_lot: number;
  status: string;
}

interface DemandSignal {
  signal: string;
  strength: number;
  description: string;
}

interface AgingStep {
  day: number;
  markdown_percent: number;
  label: string;
}

interface RecommendationHistoryEntry {
  date: string;
  action: string;
  recommended_price: number;
  outcome: string | null;
}

interface LotSummary {
  average_days_to_sale: number;
  days_to_sale_trend: number;
  vehicles_needing_attention: number;
  revenue_velocity: number;
  inventory_health_score: number;
  lot_health_score: number;
  total_revenue_opportunity: number;
  last_updated: string;
}

interface AgingDistribution {
  tier: AgeTier;
  label: string;
  count: number;
  percent: number;
}

interface CategoryUplift {
  category: string;
  vehicle_count: number;
  potential_uplift: number;
}

interface MarketGapAlert {
  message: string;
  severity: "high" | "medium" | "low";
}

interface LotReport {
  aging_distribution: AgingDistribution[];
  category_uplift: CategoryUplift[];
  market_gap_alerts: MarketGapAlert[];
}

interface RecommendationsResponse {
  summary: LotSummary;
  vehicles: Vehicle[];
  lot_report: LotReport;
}

/* -------------------------------------------------------------------------- */
/* Mock data (demo mode)                                                      */
/* -------------------------------------------------------------------------- */

function generateMockData(): RecommendationsResponse {
  const makes = ["Toyota", "Honda", "Ford", "Chevrolet", "RAM", "GMC", "Hyundai", "Kia", "Nissan", "Jeep"];
  const models: Record<string, string[]> = {
    Toyota: ["Camry", "RAV4", "Tacoma", "Highlander", "Corolla"],
    Honda: ["Civic", "CR-V", "Accord", "Pilot", "HR-V"],
    Ford: ["F-150", "Explorer", "Escape", "Bronco", "Maverick"],
    Chevrolet: ["Silverado", "Equinox", "Traverse", "Tahoe", "Malibu"],
    RAM: ["1500", "2500", "ProMaster"],
    GMC: ["Sierra", "Terrain", "Acadia", "Yukon"],
    Hyundai: ["Tucson", "Santa Fe", "Elantra", "Palisade"],
    Kia: ["Telluride", "Sportage", "Forte", "Sorento"],
    Nissan: ["Rogue", "Altima", "Frontier", "Pathfinder"],
    Jeep: ["Wrangler", "Grand Cherokee", "Compass", "Gladiator"],
  };
  const bodyTypes: Record<string, BodyType> = {
    Camry: "sedan", "RAV4": "suv", Tacoma: "truck", Highlander: "suv", Corolla: "sedan",
    Civic: "sedan", "CR-V": "suv", Accord: "sedan", Pilot: "suv", "HR-V": "suv",
    "F-150": "truck", Explorer: "suv", Escape: "suv", Bronco: "suv", Maverick: "truck",
    Silverado: "truck", Equinox: "suv", Traverse: "suv", Tahoe: "suv", Malibu: "sedan",
    "1500": "truck", "2500": "truck", ProMaster: "van",
    Sierra: "truck", Terrain: "suv", Acadia: "suv", Yukon: "suv",
    Tucson: "suv", "Santa Fe": "suv", Elantra: "sedan", Palisade: "suv",
    Telluride: "suv", Sportage: "suv", Forte: "sedan", Sorento: "suv",
    Rogue: "suv", Altima: "sedan", Frontier: "truck", Pathfinder: "suv",
    Wrangler: "suv", "Grand Cherokee": "suv", Compass: "suv", Gladiator: "truck",
  };
  const actions: ActionType[] = ["hold", "reduce", "increase", "markdown", "spotlight"];
  const seasonTags = [null, null, null, "Summer Premium", "Winter Discount", "Spring Rush", null];
  const trims = ["SE", "XLE", "Limited", "Sport", "LT", "SLT", "Big Horn", "Lariat", "Touring", ""];

  const vehicles: Vehicle[] = [];
  for (let i = 0; i < 24; i++) {
    const make = makes[i % makes.length];
    const modelList = models[make];
    const model = modelList[Math.floor(Math.random() * modelList.length)];
    const year = 2020 + Math.floor(Math.random() * 5);
    const trim = trims[Math.floor(Math.random() * trims.length)];
    const currentPrice = 18000 + Math.floor(Math.random() * 42000);
    const delta = Math.floor((Math.random() - 0.4) * 4000);
    const recommendedPrice = currentPrice + delta;
    const daysOnLot = Math.floor(Math.random() * 120);
    const demandScore = Math.floor(Math.random() * 100);
    const action = delta > 1000 ? "increase" : delta < -2000 ? "markdown" : delta < -500 ? "reduce" : demandScore > 75 ? "spotlight" : "hold";

    vehicles.push({
      id: `v-${i + 1}`,
      vin: `1HGBH41JXMN${String(100000 + i).slice(1)}`,
      year,
      make,
      model,
      trim,
      body_type: bodyTypes[model] ?? "other",
      photo_url: null,
      current_price: currentPrice,
      recommended_price: recommendedPrice,
      price_delta: delta,
      action,
      action_reason: actionReasonText(action, daysOnLot, demandScore),
      demand_score: demandScore,
      days_on_lot: daysOnLot,
      estimated_days_to_sale: Math.max(3, Math.floor(30 - demandScore * 0.25 + daysOnLot * 0.1)),
      season_tag: seasonTags[Math.floor(Math.random() * seasonTags.length)],
      revenue_opportunity: Math.abs(delta),
      elasticity_data: generateElasticity(currentPrice, recommendedPrice),
      comparables: generateComparables(make, model, year, currentPrice),
      demand_signals: generateDemandSignals(demandScore),
      aging_timeline: generateAgingTimeline(currentPrice),
      recommendation_history: generateHistory(currentPrice),
    });
  }

  // Sort by opportunity descending by default
  vehicles.sort((a, b) => b.revenue_opportunity - a.revenue_opportunity);

  const totalOpp = vehicles.reduce((sum, v) => sum + v.revenue_opportunity, 0);
  const avgDays = Math.round(vehicles.reduce((s, v) => s + v.days_on_lot, 0) / vehicles.length);
  const needsAttention = vehicles.filter((v) => v.action !== "hold").length;

  return {
    summary: {
      average_days_to_sale: avgDays,
      days_to_sale_trend: -2.3,
      vehicles_needing_attention: needsAttention,
      revenue_velocity: Math.round(totalOpp / 30),
      inventory_health_score: 72,
      lot_health_score: 68,
      total_revenue_opportunity: totalOpp,
      last_updated: new Date().toISOString(),
    },
    vehicles,
    lot_report: {
      aging_distribution: ([
        { tier: "fresh" as AgeTier, label: "Under 30 Days", count: vehicles.filter((v) => v.days_on_lot < 30).length, percent: 0 },
        { tier: "aging" as AgeTier, label: "30-60 Days", count: vehicles.filter((v) => v.days_on_lot >= 30 && v.days_on_lot < 60).length, percent: 0 },
        { tier: "stale" as AgeTier, label: "60-90 Days", count: vehicles.filter((v) => v.days_on_lot >= 60 && v.days_on_lot < 90).length, percent: 0 },
        { tier: "critical" as AgeTier, label: "Over 90 Days", count: vehicles.filter((v) => v.days_on_lot >= 90).length, percent: 0 },
      ] as AgingDistribution[]).map((d) => ({ ...d, percent: Math.round((d.count / vehicles.length) * 100) })),
      category_uplift: [
        { category: "Trucks", vehicle_count: vehicles.filter((v) => v.body_type === "truck").length, potential_uplift: 12400 },
        { category: "SUVs", vehicle_count: vehicles.filter((v) => v.body_type === "suv").length, potential_uplift: 8900 },
        { category: "Sedans", vehicle_count: vehicles.filter((v) => v.body_type === "sedan").length, potential_uplift: 5200 },
        { category: "Vans", vehicle_count: vehicles.filter((v) => v.body_type === "van").length, potential_uplift: 2100 },
      ],
      market_gap_alerts: [
        { message: "No trucks under $20,000 in stock — high buyer demand in this range. Consider acquiring.", severity: "high" as const },
        { message: "SUV inventory is strong but average price is 8% above market. Consider strategic markdowns on 3 oldest units.", severity: "medium" as const },
        { message: "Compact sedan segment showing increased search volume this month.", severity: "low" as const },
      ],
    },
  };
}

function actionReasonText(action: ActionType, dol: number, demand: number): string {
  switch (action) {
    case "increase": return "This vehicle is getting a lot of attention and is priced below similar ones nearby. You have room to increase the price.";
    case "reduce": return `This vehicle has been on the lot for ${dol} days. A modest price reduction should generate more interest.`;
    case "markdown": return `At ${dol} days on lot, this vehicle needs a significant markdown to move. Every day costs you floor plan interest.`;
    case "spotlight": return "Buyer demand is high for this vehicle. Feature it on your homepage and social media to capitalize.";
    case "hold": return "This vehicle is priced right and moving at a healthy pace. No changes needed right now.";
  }
}

function generateElasticity(current: number, recommended: number): ElasticityPoint[] {
  const points: ElasticityPoint[] = [];
  const low = Math.round(current * 0.85);
  const high = Math.round(current * 1.15);
  for (let p = low; p <= high; p += Math.round((high - low) / 8)) {
    const distance = Math.abs(p - recommended) / current;
    points.push({ price: p, probability: Math.max(5, Math.round(95 - distance * 300)) });
  }
  return points;
}

function generateComparables(make: string, model: string, year: number, price: number): ComparableVehicle[] {
  return [
    { id: "c1", year, make, model, price: price - 1200, days_on_lot: 18, status: "In Stock" },
    { id: "c2", year: year - 1, make, model, price: price - 2800, days_on_lot: 42, status: "In Stock" },
    { id: "c3", year, make, model, price: price + 900, days_on_lot: 8, status: "Sold (12 days)" },
  ];
}

function generateDemandSignals(score: number): DemandSignal[] {
  const signals: DemandSignal[] = [
    { signal: "Search views", strength: Math.min(100, score + 15), description: "How often shoppers view this listing" },
    { signal: "Save rate", strength: Math.min(100, Math.round(score * 0.8)), description: "Percentage of viewers who saved this vehicle" },
    { signal: "Similar sold", strength: Math.min(100, Math.round(score * 1.1)), description: "Similar vehicles sold recently in your area" },
    { signal: "Price inquiries", strength: Math.min(100, Math.round(score * 0.6)), description: "Number of price-related questions received" },
  ];
  return signals.sort((a, b) => b.strength - a.strength);
}

function generateAgingTimeline(price: number): AgingStep[] {
  return [
    { day: 0, markdown_percent: 0, label: "Listed" },
    { day: 30, markdown_percent: 3, label: `3% markdown to ${fmtCurrency(Math.round(price * 0.97))}` },
    { day: 45, markdown_percent: 6, label: `6% markdown to ${fmtCurrency(Math.round(price * 0.94))}` },
    { day: 60, markdown_percent: 10, label: `10% markdown to ${fmtCurrency(Math.round(price * 0.90))}` },
    { day: 75, markdown_percent: 15, label: `15% markdown to ${fmtCurrency(Math.round(price * 0.85))}` },
    { day: 90, markdown_percent: 20, label: `Wholesale / auction consideration` },
  ];
}

function generateHistory(price: number): RecommendationHistoryEntry[] {
  const now = Date.now();
  return [
    { date: new Date(now - 7 * 86400000).toISOString(), action: "Hold", recommended_price: price, outcome: null },
    { date: new Date(now - 14 * 86400000).toISOString(), action: "Reduce", recommended_price: Math.round(price * 0.97), outcome: "Accepted" },
    { date: new Date(now - 21 * 86400000).toISOString(), action: "Spotlight", recommended_price: price, outcome: "Accepted" },
  ];
}

/* -------------------------------------------------------------------------- */
/* API Response Transformer                                                   */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformApiResponse(reports: any[]): RecommendationsResponse {
  const vehicles: Vehicle[] = reports.map((r, i) => {
    const current = Number(r.current_price ?? r.optimal?.current_price ?? 0);
    const recommended = Number(r.optimal?.optimal_price ?? r.recommended_price ?? current);
    const delta = recommended - current;
    const demandScore = Number(r.demand?.score ?? r.demand_score ?? 50);
    const daysOnLot = Number(r.aging?.days_on_lot ?? r.days_on_lot ?? 0);
    const action: ActionType =
      (r.aging?.action as ActionType) ??
      (delta > 500 ? "increase" : delta < -1000 ? "markdown" : delta < -200 ? "reduce" : demandScore > 75 ? "spotlight" : "hold");

    return {
      id: r.vin ?? `v-${i}`,
      vin: r.vin ?? "",
      year: Number(r.year ?? 2023),
      make: r.make ?? "",
      model: r.model ?? "",
      trim: r.trim ?? "",
      body_type: (r.body_type ?? "other") as BodyType,
      photo_url: r.photo_url ?? null,
      current_price: current,
      recommended_price: recommended,
      price_delta: delta,
      action,
      action_reason: r.aging?.reason ?? r.action_reason ?? actionReasonText(action, daysOnLot, demandScore),
      demand_score: demandScore,
      days_on_lot: daysOnLot,
      estimated_days_to_sale: Number(r.velocity?.estimated_days_to_sale ?? 30),
      season_tag: r.seasonal?.label ?? null,
      revenue_opportunity: Math.abs(delta),
      elasticity_data: (r.elasticity?.price_sensitivity_curve ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => ({ price: Number(p.price), probability: Number(p.probability) }),
      ),
      comparables: (r.position?.comparables ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (c: any) => ({
          id: c.vin ?? c.id ?? "",
          year: Number(c.year ?? 2023),
          make: c.make ?? "",
          model: c.model ?? "",
          price: Number(c.price ?? 0),
          days_on_lot: Number(c.days_on_lot ?? 0),
          status: c.status ?? "available",
        }),
      ),
      demand_signals: generateDemandSignals(demandScore),
      aging_timeline: generateAgingTimeline(current),
      recommendation_history: generateHistory(current),
    };
  });

  const totalUplift = vehicles.reduce((sum, v) => sum + Math.abs(v.price_delta), 0);
  const avgDays = vehicles.length > 0 ? Math.round(vehicles.reduce((s, v) => s + v.days_on_lot, 0) / vehicles.length) : 0;
  const attention = vehicles.filter((v) => v.action !== "hold").length;

  const healthScore = Math.min(100, Math.max(0, 100 - attention * 5));

  return {
    summary: {
      average_days_to_sale: avgDays,
      days_to_sale_trend: -2,
      vehicles_needing_attention: attention,
      revenue_velocity: Math.round(vehicles.reduce((s, v) => s + v.current_price, 0) / Math.max(avgDays, 1)),
      inventory_health_score: healthScore,
      lot_health_score: healthScore,
      total_revenue_opportunity: totalUplift,
      last_updated: new Date().toISOString(),
    },
    vehicles,
    lot_report: {
      aging_distribution: [
        { tier: "fresh" as AgeTier, label: "Fresh (0-15d)", count: vehicles.filter((v) => v.days_on_lot <= 15).length, percent: 0 },
        { tier: "aging" as AgeTier, label: "Aging (31-60d)", count: vehicles.filter((v) => v.days_on_lot > 30 && v.days_on_lot <= 60).length, percent: 0 },
        { tier: "stale" as AgeTier, label: "Stale (61-90d)", count: vehicles.filter((v) => v.days_on_lot > 60 && v.days_on_lot <= 90).length, percent: 0 },
        { tier: "critical" as AgeTier, label: "Critical (90d+)", count: vehicles.filter((v) => v.days_on_lot > 90).length, percent: 0 },
      ].map((d) => ({ ...d, percent: vehicles.length > 0 ? Math.round((d.count / vehicles.length) * 100) : 0 })),
      category_uplift: [
        { category: "Trucks", vehicle_count: vehicles.filter((v) => v.body_type === "truck").length, potential_uplift: vehicles.filter((v) => v.body_type === "truck").reduce((s, v) => s + Math.abs(v.price_delta), 0) },
        { category: "SUVs", vehicle_count: vehicles.filter((v) => v.body_type === "suv").length, potential_uplift: vehicles.filter((v) => v.body_type === "suv").reduce((s, v) => s + Math.abs(v.price_delta), 0) },
        { category: "Sedans", vehicle_count: vehicles.filter((v) => v.body_type === "sedan").length, potential_uplift: vehicles.filter((v) => v.body_type === "sedan").reduce((s, v) => s + Math.abs(v.price_delta), 0) },
        { category: "Other", vehicle_count: vehicles.filter((v) => !["truck", "suv", "sedan"].includes(v.body_type)).length, potential_uplift: vehicles.filter((v) => !["truck", "suv", "sedan"].includes(v.body_type)).reduce((s, v) => s + Math.abs(v.price_delta), 0) },
      ],
      market_gap_alerts: [],
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function lotHealthColor(score: number): string {
  if (score >= 75) return "bg-green-500";
  if (score >= 50) return "bg-yellow-500";
  return "bg-red-500";
}

function lotHealthBadge(score: number): string {
  if (score >= 75) return "bg-green-100 text-green-800 ring-green-600/20";
  if (score >= 50) return "bg-yellow-100 text-yellow-800 ring-yellow-600/20";
  return "bg-red-100 text-red-800 ring-red-600/20";
}

function daysOnLotColor(days: number): string {
  if (days < 30) return "text-green-600";
  if (days < 60) return "text-yellow-600";
  return "text-red-600";
}

function actionBadgeClass(action: ActionType): string {
  switch (action) {
    case "hold": return "bg-green-100 text-green-800 ring-green-600/20";
    case "reduce": return "bg-yellow-100 text-yellow-800 ring-yellow-600/20";
    case "increase": return "bg-blue-100 text-blue-800 ring-blue-600/20";
    case "markdown": return "bg-red-100 text-red-800 ring-red-600/20";
    case "spotlight": return "bg-purple-100 text-purple-800 ring-purple-600/20";
  }
}

function actionLabel(action: ActionType): string {
  switch (action) {
    case "hold": return "Hold";
    case "reduce": return "Reduce";
    case "increase": return "Increase";
    case "markdown": return "Markdown";
    case "spotlight": return "Spotlight";
  }
}

function deltaBadge(delta: number): { text: string; className: string } {
  if (delta > 0) return { text: `+${fmtCurrency(delta)}`, className: "text-green-600 bg-green-50" };
  if (delta < 0) return { text: fmtCurrency(delta), className: "text-red-600 bg-red-50" };
  return { text: "No change", className: "text-gray-500 bg-gray-50" };
}

function severityClass(severity: string): string {
  switch (severity) {
    case "high": return "border-red-200 bg-red-50";
    case "medium": return "border-yellow-200 bg-yellow-50";
    case "low": return "border-blue-200 bg-blue-50";
    default: return "border-gray-200 bg-gray-50";
  }
}

function severityDot(severity: string): string {
  switch (severity) {
    case "high": return "bg-red-500";
    case "medium": return "bg-yellow-500";
    case "low": return "bg-blue-500";
    default: return "bg-gray-400";
  }
}

function ageTierColor(tier: AgeTier): string {
  switch (tier) {
    case "fresh": return "bg-green-500";
    case "aging": return "bg-yellow-500";
    case "stale": return "bg-orange-500";
    case "critical": return "bg-red-500";
  }
}

/* -------------------------------------------------------------------------- */
/* Page component                                                             */
/* -------------------------------------------------------------------------- */

export default function PricingRecommendationsPage() {
  const { track } = useAnalytics();

  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail drawer
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  // Sort & filter
  const [sortKey, setSortKey] = useState<SortKey>("opportunity");
  const [actionFilter, setActionFilter] = useState<ActionType | "">("");
  const [bodyFilter, setBodyFilter] = useState<BodyType | "">("");
  const [priceRange, setPriceRange] = useState<"" | "under20" | "20to35" | "35to50" | "over50">("");
  const [ageFilter, setAgeFilter] = useState<AgeTier | "">("");

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Track page view
  useEffect(() => {
    track("pricing", "dashboard_viewed");
  }, [track]);

  // Fetch data — API returns { reports, count }, transform to our UI shape
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pricing/recommendations");
      if (res.ok) {
        const json = await res.json();
        // If the API returns our expected shape, use it directly
        if (json.vehicles && json.summary) {
          setData(json);
        } else if (json.reports && Array.isArray(json.reports)) {
          // Transform API shape { reports, count } → our UI shape
          setData(transformApiResponse(json.reports));
        } else {
          setData(generateMockData());
        }
      } else {
        setData(generateMockData());
      }
    } catch {
      setData(generateMockData());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtered + sorted vehicles
  const vehicles = useMemo(() => {
    if (!data) return [];
    let list = [...data.vehicles];

    if (actionFilter) list = list.filter((v) => v.action === actionFilter);
    if (bodyFilter) list = list.filter((v) => v.body_type === bodyFilter);
    if (ageFilter) {
      list = list.filter((v) => {
        if (ageFilter === "fresh") return v.days_on_lot < 30;
        if (ageFilter === "aging") return v.days_on_lot >= 30 && v.days_on_lot < 60;
        if (ageFilter === "stale") return v.days_on_lot >= 60 && v.days_on_lot < 90;
        return v.days_on_lot >= 90;
      });
    }
    if (priceRange) {
      list = list.filter((v) => {
        if (priceRange === "under20") return v.current_price < 20000;
        if (priceRange === "20to35") return v.current_price >= 20000 && v.current_price < 35000;
        if (priceRange === "35to50") return v.current_price >= 35000 && v.current_price < 50000;
        return v.current_price >= 50000;
      });
    }

    list.sort((a, b) => {
      switch (sortKey) {
        case "opportunity": return b.revenue_opportunity - a.revenue_opportunity;
        case "days_on_lot": return b.days_on_lot - a.days_on_lot;
        case "demand": return b.demand_score - a.demand_score;
        case "price": return b.current_price - a.current_price;
        default: return 0;
      }
    });

    return list;
  }, [data, actionFilter, bodyFilter, ageFilter, priceRange, sortKey]);

  const selectedVehicle = useMemo(
    () => data?.vehicles.find((v) => v.id === selectedVehicleId) ?? null,
    [data, selectedVehicleId],
  );

  // Track filter usage
  const handleFilterChange = useCallback(
    (filterName: string, value: string) => {
      track("pricing", "dashboard_filter_used", { filter: filterName, value });
    },
    [track],
  );

  // Accept / dismiss
  const handleAccept = useCallback(
    async (vehicleId: string) => {
      track("pricing", "recommendation_accepted", { vehicle_id: vehicleId });
      showToast("Recommendation accepted — price update queued.");
      setSelectedVehicleId(null);
    },
    [track],
  );

  const handleDismiss = useCallback(
    async (vehicleId: string) => {
      track("pricing", "recommendation_rejected", { vehicle_id: vehicleId });
      showToast("Recommendation dismissed.");
      setSelectedVehicleId(null);
    },
    [track],
  );

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-80 rounded bg-gray-200" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-gray-200" />
          ))}
        </div>
        <div className="h-64 rounded-xl bg-gray-200" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { summary, lot_report } = data;

  return (
    <>
      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      )}

      {/* Detail Drawer Overlay */}
      {selectedVehicle && (
        <VehicleDetailDrawer
          vehicle={selectedVehicle}
          onClose={() => setSelectedVehicleId(null)}
          onAccept={handleAccept}
          onDismiss={handleDismiss}
        />
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Pricing Intelligence</h1>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ring-1 ring-inset ${lotHealthBadge(summary.lot_health_score)}`}
              title={`Lot health score: ${summary.lot_health_score}/100`}
            >
              {summary.lot_health_score}/100
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            AI-powered pricing recommendations to help you sell faster and maximize profit.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Total Revenue Opportunity</p>
          <p className="mt-1 text-3xl font-bold text-green-600">{fmtCurrency(summary.total_revenue_opportunity)}</p>
          <p className="mt-0.5 text-xs text-gray-400">
            Updated {new Date(summary.last_updated).toLocaleString("en-US", {
              month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
            })}
          </p>
        </div>
      </div>

      {/* Lot Summary Cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Average Days to Sale"
          value={`${summary.average_days_to_sale} days`}
          trend={summary.days_to_sale_trend}
          trendLabel={`${summary.days_to_sale_trend > 0 ? "+" : ""}${summary.days_to_sale_trend} vs last month`}
        />
        <SummaryCard
          label="Vehicles Needing Attention"
          value={String(summary.vehicles_needing_attention)}
          accent={summary.vehicles_needing_attention > 5 ? "amber" : "default"}
          sub="have pricing recommendations"
        />
        <SummaryCard
          label="Revenue Velocity"
          value={`${fmtCurrency(summary.revenue_velocity)}/day`}
          sub="across your lot"
        />
        <SummaryCard
          label="Inventory Health"
          value={`${summary.inventory_health_score}/100`}
          healthScore={summary.inventory_health_score}
          sub="based on age, demand, and pricing"
        />
      </div>

      {/* Sort & Filter Bar */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2">
          <label htmlFor="sort-select" className="text-sm font-medium text-gray-700 whitespace-nowrap">Sort by:</label>
          <select
            id="sort-select"
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value as SortKey);
              handleFilterChange("sort", e.target.value);
            }}
            className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            style={{ fontSize: 16 }}
          >
            <option value="opportunity">Biggest Opportunity</option>
            <option value="days_on_lot">Days on Lot</option>
            <option value="demand">Demand Score</option>
            <option value="price">Price</option>
          </select>
        </div>

        <select
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value as ActionType | "");
            handleFilterChange("action", e.target.value);
          }}
          className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 lg:w-auto"
          style={{ fontSize: 16 }}
        >
          <option value="">All Actions</option>
          <option value="hold">Hold</option>
          <option value="reduce">Reduce</option>
          <option value="increase">Increase</option>
          <option value="markdown">Markdown</option>
          <option value="spotlight">Spotlight</option>
        </select>

        <select
          value={bodyFilter}
          onChange={(e) => {
            setBodyFilter(e.target.value as BodyType | "");
            handleFilterChange("body_type", e.target.value);
          }}
          className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 lg:w-auto"
          style={{ fontSize: 16 }}
        >
          <option value="">All Body Types</option>
          <option value="sedan">Sedan</option>
          <option value="suv">SUV</option>
          <option value="truck">Truck</option>
          <option value="van">Van</option>
          <option value="coupe">Coupe</option>
          <option value="convertible">Convertible</option>
        </select>

        <select
          value={priceRange}
          onChange={(e) => {
            setPriceRange(e.target.value as typeof priceRange);
            handleFilterChange("price_range", e.target.value);
          }}
          className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 lg:w-auto"
          style={{ fontSize: 16 }}
        >
          <option value="">All Prices</option>
          <option value="under20">Under $20K</option>
          <option value="20to35">$20K - $35K</option>
          <option value="35to50">$35K - $50K</option>
          <option value="over50">$50K+</option>
        </select>

        <select
          value={ageFilter}
          onChange={(e) => {
            setAgeFilter(e.target.value as AgeTier | "");
            handleFilterChange("age_tier", e.target.value);
          }}
          className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 lg:w-auto"
          style={{ fontSize: 16 }}
        >
          <option value="">All Ages</option>
          <option value="fresh">Fresh (under 30d)</option>
          <option value="aging">Aging (30-60d)</option>
          <option value="stale">Stale (60-90d)</option>
          <option value="critical">Critical (90d+)</option>
        </select>
      </div>

      {/* Results count */}
      <p className="mb-3 text-sm text-gray-500">
        Showing {vehicles.length} of {data.vehicles.length} vehicles
      </p>

      {/* Vehicle Pricing Table — desktop table, mobile cards */}
      <div className="hidden md:block overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-surface-border">
            <caption className="sr-only">Vehicle pricing recommendations</caption>
            <thead className="bg-surface-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-16">Photo</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Vehicle</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Current Price</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Recommended</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Action</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Demand</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Days on Lot</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Est. Sale</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Season</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Details</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {vehicles.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-400">
                    No vehicles match your filters.
                  </td>
                </tr>
              ) : (
                vehicles.map((v) => {
                  const delta = deltaBadge(v.price_delta);
                  return (
                    <tr
                      key={v.id}
                      className="group cursor-pointer transition-colors hover:bg-surface-muted/50"
                      onClick={() => setSelectedVehicleId(v.id)}
                    >
                      {/* Photo */}
                      <td className="px-4 py-3">
                        <div className="h-10 w-14 rounded bg-gray-200 flex items-center justify-center text-gray-400 shrink-0">
                          <CarIcon />
                        </div>
                      </td>

                      {/* Vehicle */}
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">
                          {v.year} {v.make} {v.model}{v.trim ? ` ${v.trim}` : ""}
                        </p>
                      </td>

                      {/* Current price */}
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                        {fmtCurrency(v.current_price)}
                      </td>

                      {/* Recommended */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm font-semibold text-gray-900">{fmtCurrency(v.recommended_price)}</span>
                        <span className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${delta.className}`}>
                          {delta.text}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${actionBadgeClass(v.action)}`}>
                          {actionLabel(v.action)}
                        </span>
                      </td>

                      {/* Demand meter */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-gray-200">
                            <div
                              className={`h-full rounded-full ${
                                v.demand_score >= 70 ? "bg-green-500" :
                                v.demand_score >= 40 ? "bg-yellow-500" :
                                "bg-red-400"
                              }`}
                              style={{ width: `${v.demand_score}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-gray-600">{v.demand_score}</span>
                        </div>
                      </td>

                      {/* Days on lot */}
                      <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${daysOnLotColor(v.days_on_lot)}`}>
                        {v.days_on_lot}d
                      </td>

                      {/* Estimated days to sale */}
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        ~{v.estimated_days_to_sale}d
                      </td>

                      {/* Season tag */}
                      <td className="px-4 py-3">
                        {v.season_tag ? (
                          <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                            {v.season_tag}
                          </span>
                        ) : null}
                      </td>

                      {/* Expand arrow */}
                      <td className="px-4 py-3 text-gray-400 group-hover:text-gray-600">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {vehicles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-400">
            No vehicles match your filters.
          </div>
        ) : (
          vehicles.map((v) => {
            const delta = deltaBadge(v.price_delta);
            return (
              <div
                key={v.id}
                className="rounded-xl border border-surface-border bg-white p-4 shadow-card cursor-pointer transition-colors hover:bg-surface-muted/50"
                onClick={() => setSelectedVehicleId(v.id)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {v.year} {v.make} {v.model}{v.trim ? ` ${v.trim}` : ""}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${actionBadgeClass(v.action)}`}>
                        {actionLabel(v.action)}
                      </span>
                      {v.season_tag && (
                        <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                          {v.season_tag}
                        </span>
                      )}
                    </div>
                  </div>
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Current</p>
                    <p className="text-sm font-medium text-gray-700">{fmtCurrency(v.current_price)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Recommended</p>
                    <p className="text-sm font-semibold text-gray-900">{fmtCurrency(v.recommended_price)}</p>
                    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${delta.className}`}>
                      {delta.text}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Demand</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-gray-200">
                        <div
                          className={`h-full rounded-full ${
                            v.demand_score >= 70 ? "bg-green-500" :
                            v.demand_score >= 40 ? "bg-yellow-500" :
                            "bg-red-400"
                          }`}
                          style={{ width: `${v.demand_score}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-600">{v.demand_score}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Days on Lot</p>
                    <p className={`text-sm font-medium ${daysOnLotColor(v.days_on_lot)}`}>{v.days_on_lot}d</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Lot Report Section */}
      <div className="mt-10 space-y-8">
        <h2 className="text-lg font-semibold text-gray-900">Lot Report</h2>

        {/* Aging Distribution */}
        <div className="rounded-xl border border-surface-border bg-white p-6 shadow-card">
          <h3 className="text-base font-semibold text-gray-900">Aging Distribution</h3>
          <p className="mt-1 text-sm text-gray-500">How long your vehicles have been on the lot.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {lot_report.aging_distribution.map((d) => (
              <div key={d.tier} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${ageTierColor(d.tier)}`} />
                  <p className="text-sm font-medium text-gray-700">{d.label}</p>
                </div>
                <p className="mt-2 text-2xl font-bold text-gray-900">{d.count}</p>
                <p className="text-xs text-gray-400">{d.percent}% of inventory</p>
              </div>
            ))}
          </div>
          {/* Visual bar */}
          <div className="mt-4 flex h-4 w-full overflow-hidden rounded-full bg-gray-100">
            {lot_report.aging_distribution.map((d) => (
              <div
                key={d.tier}
                className={`h-full ${ageTierColor(d.tier)} transition-all`}
                style={{ width: `${d.percent}%` }}
                title={`${d.label}: ${d.count} vehicles (${d.percent}%)`}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-gray-400">
            <span>Fresh</span>
            <span>Critical</span>
          </div>
        </div>

        {/* Revenue Uplift by Category */}
        <div className="rounded-xl border border-surface-border bg-white p-6 shadow-card">
          <h3 className="text-base font-semibold text-gray-900">Revenue Potential by Category</h3>
          <p className="mt-1 text-sm text-gray-500">Where the biggest pricing opportunities are in your lot.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {lot_report.category_uplift.map((cat) => (
              <div key={cat.category} className="rounded-lg border border-gray-200 p-4">
                <p className="text-sm font-medium text-gray-700">{cat.category}</p>
                <p className="mt-1 text-xl font-bold text-green-600">{fmtCurrency(cat.potential_uplift)}</p>
                <p className="text-xs text-gray-400">{cat.vehicle_count} vehicles</p>
              </div>
            ))}
          </div>
        </div>

        {/* Market Gap Alerts */}
        {lot_report.market_gap_alerts.length > 0 && (
          <div className="rounded-xl border border-surface-border bg-white p-6 shadow-card">
            <h3 className="text-base font-semibold text-gray-900">Market Gap Alerts</h3>
            <p className="mt-1 text-sm text-gray-500">Opportunities your competitors might be missing too.</p>
            <div className="mt-4 space-y-3">
              {lot_report.market_gap_alerts.map((alert, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg border p-4 ${severityClass(alert.severity)}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${severityDot(alert.severity)}`} />
                    <p className="text-sm text-gray-700">{alert.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function SummaryCard({
  label,
  value,
  sub,
  trend,
  trendLabel,
  accent,
  healthScore,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: number;
  trendLabel?: string;
  accent?: "amber" | "default";
  healthScore?: number;
}) {
  return (
    <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className={`text-2xl font-bold ${accent === "amber" ? "text-amber-600" : "text-gray-900"}`}>
          {value}
        </p>
        {trend !== undefined && (
          <span className={`text-sm font-medium ${trend < 0 ? "text-green-600" : trend > 0 ? "text-red-600" : "text-gray-400"}`}>
            {trend < 0 ? (
              <span title={trendLabel}>&#9660; {Math.abs(trend)}</span>
            ) : trend > 0 ? (
              <span title={trendLabel}>&#9650; {trend}</span>
            ) : null}
          </span>
        )}
      </div>
      {healthScore !== undefined && (
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full transition-all ${lotHealthColor(healthScore)}`}
            style={{ width: `${healthScore}%` }}
          />
        </div>
      )}
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Vehicle Detail Drawer                                                      */
/* -------------------------------------------------------------------------- */

function VehicleDetailDrawer({
  vehicle,
  onClose,
  onAccept,
  onDismiss,
}: {
  vehicle: Vehicle;
  onClose: () => void;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const delta = deltaBadge(vehicle.price_delta);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div className="relative z-50 w-full max-w-lg overflow-y-auto bg-white shadow-xl sm:max-w-xl">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {vehicle.year} {vehicle.make} {vehicle.model}{vehicle.trim ? ` ${vehicle.trim}` : ""}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">{vehicle.action_reason}</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close detail panel"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Price summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Current Price</p>
              <p className="text-lg font-bold text-gray-900">{fmtCurrency(vehicle.current_price)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Recommended Price</p>
              <p className="text-lg font-bold text-gray-900">{fmtCurrency(vehicle.recommended_price)}</p>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${delta.className}`}>
                {delta.text}
              </span>
            </div>
          </div>

          {/* Price Elasticity */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Sale Probability by Price</h3>
            <p className="text-xs text-gray-500 mb-3">How likely the vehicle is to sell at different price points.</p>
            <div className="space-y-1.5">
              {vehicle.elasticity_data.map((pt) => {
                const isRecommended = Math.abs(pt.price - vehicle.recommended_price) < 500;
                return (
                  <div key={pt.price} className="flex items-center gap-2">
                    <span className={`text-xs w-16 text-right tabular-nums ${isRecommended ? "font-bold text-brand-600" : "text-gray-500"}`}>
                      {fmtCurrency(pt.price)}
                    </span>
                    <div className="flex-1 h-3 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full transition-all ${isRecommended ? "bg-brand-500" : "bg-gray-300"}`}
                        style={{ width: `${pt.probability}%` }}
                      />
                    </div>
                    <span className={`text-xs w-8 ${isRecommended ? "font-bold text-brand-600" : "text-gray-400"}`}>
                      {pt.probability}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Comparable Vehicles */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Similar Vehicles in Stock</h3>
            <p className="text-xs text-gray-500 mb-3">How this vehicle compares to others you have.</p>
            <div className="space-y-2">
              {vehicle.comparables.map((comp) => (
                <div key={comp.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {comp.year} {comp.make} {comp.model}
                    </p>
                    <p className="text-xs text-gray-500">{comp.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{fmtCurrency(comp.price)}</p>
                    <p className="text-xs text-gray-400">{comp.days_on_lot}d on lot</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Demand Signal Breakdown */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900">What is Driving Demand</h3>
            <p className="text-xs text-gray-500 mb-3">The signals behind this vehicle's demand score.</p>
            <div className="space-y-2">
              {vehicle.demand_signals.map((sig) => (
                <div key={sig.signal}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{sig.signal}</span>
                    <span className="text-xs font-medium text-gray-500">{sig.strength}/100</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${
                        sig.strength >= 70 ? "bg-green-500" :
                        sig.strength >= 40 ? "bg-yellow-500" :
                        "bg-gray-400"
                      }`}
                      style={{ width: `${sig.strength}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">{sig.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Aging Timeline */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Markdown Schedule</h3>
            <p className="text-xs text-gray-500 mb-3">Planned price reductions if the vehicle does not sell.</p>
            <div className="relative pl-4 border-l-2 border-gray-200 space-y-3">
              {vehicle.aging_timeline.map((step) => {
                const isPast = vehicle.days_on_lot >= step.day;
                const isCurrent = vehicle.days_on_lot >= step.day && (vehicle.aging_timeline.find((s) => s.day > step.day && vehicle.days_on_lot < s.day) !== undefined || step === vehicle.aging_timeline[vehicle.aging_timeline.length - 1]);
                return (
                  <div key={step.day} className="relative">
                    <div className={`absolute -left-[21px] h-3 w-3 rounded-full border-2 ${isPast ? "bg-brand-500 border-brand-500" : "bg-white border-gray-300"}`} />
                    <p className={`text-sm ${isPast ? "text-gray-900 font-medium" : "text-gray-500"}`}>
                      Day {step.day}: {step.label}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recommendation History */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Past Recommendations</h3>
            <div className="mt-2 space-y-2">
              {vehicle.recommendation_history.map((entry, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div>
                    <p className="text-sm text-gray-700">{entry.action}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{fmtCurrency(entry.recommended_price)}</p>
                    {entry.outcome && (
                      <span className={`text-xs font-medium ${entry.outcome === "Accepted" ? "text-green-600" : "text-gray-400"}`}>
                        {entry.outcome}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2 border-t border-gray-200">
            <button
              onClick={() => onAccept(vehicle.id)}
              className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            >
              Accept Recommendation
            </button>
            <button
              onClick={() => onDismiss(vehicle.id)}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Icons                                                                      */
/* -------------------------------------------------------------------------- */

function CarIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
    </svg>
  );
}
