/**
 * @jest-environment jsdom
 *
 * AnnouncementBar - the "resume where you left off" bar. It must show ONLY
 * when there is real recently-viewed history, never fabricate content, and
 * respect a session dismissal.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import AnnouncementBar from "../AnnouncementBar";

const KEY = "wolfpack_recently_viewed";

function mount(container: HTMLElement): Root {
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<AnnouncementBar />);
  });
  return root;
}

function seed(vin: string, make = "Tesla", model = "Model 3", year = 2024) {
  window.localStorage.setItem(
    KEY,
    JSON.stringify([{ vin, year, make, model, price: 46_990, viewedAt: Date.now() }]),
  );
}

let container: HTMLElement;
let root: Root | null = null;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
});

test("renders nothing when there is no history", () => {
  root = mount(container);
  expect(container.textContent).toBe("");
});

test("shows the resume bar linking to the most-recent vehicle", () => {
  seed("V9");
  root = mount(container);
  expect(container.textContent).toContain("Welcome back");
  expect(container.textContent).toContain("2024 Tesla Model 3");
  const link = container.querySelector<HTMLAnchorElement>('a[data-track="resume_search_click"]');
  expect(link).not.toBeNull();
  expect(link!.getAttribute("href")).toBe("/inventory/V9");
});

test("dismissing hides the bar and remembers the dismissal", () => {
  seed("V9");
  root = mount(container);
  const dismiss = container.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]');
  expect(dismiss).not.toBeNull();
  act(() => {
    dismiss!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(container.textContent).toBe("");
  expect(window.sessionStorage.getItem("wolfpack_resume_bar_dismissed")).toBe("1");
});

test("stays hidden when already dismissed this session", () => {
  seed("V9");
  window.sessionStorage.setItem("wolfpack_resume_bar_dismissed", "1");
  root = mount(container);
  expect(container.textContent).toBe("");
});
