/**
 * Reusable stat card for the admin dashboard.
 *
 * Renders an icon, label, numeric value, and optional trend indicator.
 */

export interface StatsCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  /** Positive = improvement, negative = decline, zero/undefined = neutral */
  trend?: number;
  trendLabel?: string;
}

export function StatsCard({
  label,
  value,
  icon,
  trend,
  trendLabel,
}: StatsCardProps) {
  const trendColor =
    trend === undefined || trend === 0
      ? "text-gray-500"
      : trend > 0
        ? "text-green-600"
        : "text-red-600";

  const trendArrow =
    trend === undefined || trend === 0
      ? ""
      : trend > 0
        ? "\u2191"
        : "\u2193";

  return (
    <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <span
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600"
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
        {value}
      </p>
      {trend !== undefined && (
        <p className={`mt-1 text-sm font-medium ${trendColor}`}>
          <span aria-hidden="true">{trendArrow} </span>
          {Math.abs(trend)}%{trendLabel ? ` ${trendLabel}` : ""}
        </p>
      )}
    </div>
  );
}
