"use client";

import { useRouter } from "next/navigation";
import type { ReactNode, MouseEvent } from "react";

interface DealerRowProps {
  dealerId: string;
  testId?: string;
  children: ReactNode;
}

export default function DealerRow({ dealerId, testId, children }: DealerRowProps) {
  const router = useRouter();
  const href = `/admin/oem/dealers/${encodeURIComponent(dealerId)}`;
  const onRowClick = (e: MouseEvent<HTMLTableRowElement>) => {
    /* Allow inner anchors / form controls to handle their own clicks. */
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, label, select, textarea")) return;
    router.push(href);
  };
  return (
    <tr
      className="cursor-pointer hover:bg-gray-50"
      onClick={onRowClick}
      data-testid={testId}
    >
      {children}
    </tr>
  );
}
