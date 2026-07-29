/**
 * @jest-environment jsdom
 *
 * Homepage section components - render contract + interactivity that the
 * homepage E2E depends on (card links, "View Details", exactly-3 testimonials,
 * the financing CTA, and live price switching in the payment calculator).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import FeaturedCarousel from "../FeaturedCarousel";
import TestimonialsCarousel, { type Testimonial } from "../TestimonialsCarousel";
import PaymentCalculatorSection from "../PaymentCalculatorSection";
import type { FeaturedVehicle } from "@/lib/data";

function mount(container: HTMLElement, node: React.ReactElement): Root {
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(node);
  });
  return root;
}

let container: HTMLElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
});

const vehicles: FeaturedVehicle[] = [
  { vin: "V1", year: 2024, make: "Honda", model: "CR-V EX-L", price: 34_250, mileage: 1_283, gradient: "from-brand-400 to-brand-600", tag: "New Arrival", photo: "", bodyStyle: "SUV" },
  { vin: "V2", year: 2025, make: "Tesla", model: "Model 3", price: 46_990, mileage: 5, gradient: "from-brand-400 to-brand-600", tag: "Certified", photo: "", bodyStyle: "Sedan" },
];

test("FeaturedCarousel renders cards with the E2E contract", () => {
  root = mount(container, <FeaturedCarousel vehicles={vehicles} />);
  const link = container.querySelector<HTMLAnchorElement>('a[href="/inventory/V1"]');
  expect(link).not.toBeNull();
  expect(link!.querySelector("h3")!.textContent).toContain("2024 Honda CR-V EX-L");
  expect(container.textContent).toContain("$34,250");
  expect(container.textContent).toMatch(/miles/i);
  expect(container.textContent).toContain("SUV");
  expect(container.textContent).toContain("Details");
  expect(container.textContent).toContain("New Arrival");
  // Carousel controls exist
  expect(container.querySelector('button[aria-label="Next vehicles"]')).not.toBeNull();
});

const testimonials: Testimonial[] = [
  { name: "Sarah M.", location: "Denver, CO", text: "Seamless.", rating: 5 },
  { name: "James R.", location: "Boulder, CO", text: "Transparent.", rating: 5 },
  { name: "Maria L.", location: "Aurora, CO", text: "Financed easily.", rating: 5 },
];

test("TestimonialsCarousel renders exactly three named quotes", () => {
  root = mount(container, <TestimonialsCarousel testimonials={testimonials} />);
  expect(container.querySelectorAll("blockquote")).toHaveLength(3);
  expect(container.textContent).toContain("Sarah M.");
  expect(container.textContent).toContain("James R.");
  expect(container.textContent).toContain("Maria L.");
});

test("PaymentCalculatorSection switches the vehicle price by preset", () => {
  const presets = [
    { label: "Honda CR-V", price: 34_250, msrp: null },
    { label: "Tesla Model 3", price: 46_990, msrp: null },
  ];
  root = mount(container, <PaymentCalculatorSection vehicles={presets} />);

  expect(container.textContent).toContain("Payment Calculator.");
  // Initial vehicle price from the first preset
  expect(container.textContent).toContain("$34,250");

  // Switching preset updates the live calculator price (real interactivity)
  const teslaBtn = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Tesla Model 3"),
  );
  expect(teslaBtn).toBeTruthy();
  act(() => {
    teslaBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(container.textContent).toContain("$46,990");
});
