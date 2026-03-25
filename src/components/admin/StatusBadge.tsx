/**
 * Colored status badge for vehicle and lead statuses.
 */

const STATUS_STYLES: Record<string, string> = {
  // Vehicle statuses
  available: "bg-green-50 text-green-700 ring-green-600/20",
  pending: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  sold: "bg-gray-100 text-gray-600 ring-gray-500/20",
  in_transit: "bg-blue-50 text-blue-700 ring-blue-600/20",

  // Lead statuses
  new: "bg-blue-50 text-blue-700 ring-blue-600/20",
  contacted: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  qualified: "bg-purple-50 text-purple-700 ring-purple-600/20",
  appointment_set: "bg-cyan-50 text-cyan-700 ring-cyan-600/20",
  converted: "bg-green-50 text-green-700 ring-green-600/20",
  lost: "bg-red-50 text-red-700 ring-red-600/20",
};

const DISPLAY_LABELS: Record<string, string> = {
  available: "Available",
  pending: "Pending",
  sold: "Sold",
  in_transit: "In Transit",
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  appointment_set: "Appointment Set",
  converted: "Converted",
  lost: "Lost",
};

export interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const styles =
    STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600 ring-gray-500/20";
  const label = DISPLAY_LABELS[status] ?? status;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${styles}`}
    >
      {label}
    </span>
  );
}
