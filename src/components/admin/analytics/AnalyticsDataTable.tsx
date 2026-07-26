"use client";

import { ReactNode } from "react";

/**
 * Shared analytics data table — used by trim-velocity and lead-source-ROI.
 *
 * Generic over row type. Renders empty state + loading state. Stays
 * presentational; all sorting/filtering happens at the API layer.
 */

export interface AnalyticsTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}

interface Props<T> {
  rows: T[];
  columns: AnalyticsTableColumn<T>[];
  loading?: boolean;
  emptyMessage?: string;
  emptyHint?: string;
  onRowClick?: (row: T) => void;
  testId?: string;
  rowKey?: (row: T, index: number) => string;
}

export function AnalyticsDataTable<T>({
  rows,
  columns,
  loading = false,
  emptyMessage = "No data available yet.",
  emptyHint,
  onRowClick,
  testId,
  rowKey,
}: Props<T>) {
  if (loading) {
    return (
      <div
        data-testid={testId ? `${testId}-loading` : undefined}
        className="rounded-lg border border-gray-200 bg-white p-12 text-center text-sm text-gray-500"
      >
        Loading...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        data-testid={testId ? `${testId}-empty` : undefined}
        className="rounded-lg border border-gray-200 bg-white p-12 text-center"
      >
        <p className="text-sm font-medium text-gray-700">{emptyMessage}</p>
        {emptyHint && (
          <p className="mt-1 text-xs text-gray-500">{emptyHint}</p>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid={testId}
      className="overflow-x-auto rounded-lg border border-gray-200 bg-white"
    >
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500 ${
                  col.align === "right"
                    ? "text-right"
                    : col.align === "center"
                    ? "text-center"
                    : "text-left"
                } ${col.className ?? ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((row, idx) => (
            <tr
              key={rowKey ? rowKey(row, idx) : idx}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? "cursor-pointer hover:bg-brand-50" : ""}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-3 ${
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                      ? "text-center"
                      : "text-left"
                  } ${col.className ?? ""}`}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
