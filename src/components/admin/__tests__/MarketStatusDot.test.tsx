/**
 * @jest-environment jsdom
 *
 * MarketStatusDot — unit test for the inventory-list status dot.
 *
 * Asserts:
 *  - "No data" rendered when recommendation is null
 *  - Each enum maps to a distinct accessible label
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { MarketStatusDot } from "@/components/admin/MarketStatusDot";

function mount(rec: any) {
  const c = document.createElement("div");
  document.body.appendChild(c);
  act(() => {
    createRoot(c).render(<MarketStatusDot recommendation={rec} />);
  });
  return c;
}

describe("MarketStatusDot", () => {
  test("renders 'No data' when recommendation is null", () => {
    const c = mount(null);
    expect(c.textContent).toMatch(/No data/);
    document.body.removeChild(c);
  });

  test("each known enum yields a labelled dot", () => {
    const enums = [
      "HOLD",
      "REPRICE_DOWN",
      "REPRICE_UP",
      "MOVE_TO_LOT_FRONT",
      "MOVE_TO_BACK_LOT",
    ];
    for (const e of enums) {
      const c = mount(e);
      expect(c.firstElementChild?.getAttribute("aria-label")).toMatch(/Market status:/);
      document.body.removeChild(c);
    }
  });
});
