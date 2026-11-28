// @vitest-environment jsdom
// CI fix (27 Nov 2026): the Stress Lab's section-bar re-measures (task #401, 400 and 1500 ms after drawing) must stop when the lab is destroyed,
// and the test helper destroys every lab it drew, so no timer fires after a test file's page is gone ("document is not defined" in CI).
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../../public/demo/stress-page.json";
import { draw } from "./harness";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = ""; });
const HEADER = "body > header, #root header, header";
const measures = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter((c) => c[0] === HEADER).length;

describe("Stress Lab timers", () => {
  it("re-measure the bar at 400 and 1500 ms while the lab is drawn", () => {
    vi.useFakeTimers();
    draw(JSON.parse(JSON.stringify(fixture)));
    const spy = vi.spyOn(document, "querySelector");
    vi.advanceTimersByTime(2000);
    expect(measures(spy)).toBe(2);
  });
  it("never fire once the lab is destroyed", () => {
    vi.useFakeTimers();
    const { h } = draw(JSON.parse(JSON.stringify(fixture)));
    (h as { destroy: () => void }).destroy();
    const spy = vi.spyOn(document, "querySelector");
    vi.advanceTimersByTime(2000);
    expect(measures(spy)).toBe(0);
  });
});
