/**
 * @jest-environment jsdom
 */
import { pollWhileVisible } from "@/lib/poll-while-visible";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

describe("pollWhileVisible", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("calls fn on each tick while the tab is visible", () => {
    setVisibility("visible");
    const fn = jest.fn();
    const id = pollWhileVisible(fn, 1000);
    jest.advanceTimersByTime(3000);
    expect(fn).toHaveBeenCalledTimes(3);
    clearInterval(id);
  });

  it("does NOT call fn while the tab is hidden (no DB egress)", () => {
    setVisibility("hidden");
    const fn = jest.fn();
    const id = pollWhileVisible(fn, 1000);
    jest.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
    clearInterval(id);
  });

  it("pauses when hidden and resumes when visible again", () => {
    setVisibility("visible");
    const fn = jest.fn();
    const id = pollWhileVisible(fn, 1000);
    jest.advanceTimersByTime(2000); // 2 calls while visible
    setVisibility("hidden");
    jest.advanceTimersByTime(5000); // 0 calls while hidden
    expect(fn).toHaveBeenCalledTimes(2);
    setVisibility("visible");
    jest.advanceTimersByTime(2000); // 2 more calls
    expect(fn).toHaveBeenCalledTimes(4);
    clearInterval(id);
  });
});
