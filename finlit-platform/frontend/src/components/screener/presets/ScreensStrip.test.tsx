// @vitest-environment jsdom
// The Ready-made screens strip on Basic and Advanced (task #64, 14 Nov file v4, N-38).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ScreensStrip, isTop10 } from "./ScreensStrip";
import type { Preset, PresetGroup } from "../../../lib/presets";
import type { PresetRoute } from "./usePresetRoute";

vi.mock("../../../lib/ui", () => ({ useUI: () => ({ upgrade: vi.fn() }) }));
afterEach(cleanup);

const p = (id: string, name: string, extra: Partial<Preset> = {}): Preset => ({ id, name, group: "", cardText: "", count: 19, asOf: "2026-11-12", status: "live", blockedReason: null, chips: [], howItWorks: [], locked: false, ...extra });
const first = [{ symbol: "A", name: "Indrav Infotech", value: 90 }, { symbol: "B", name: "Kovrik Infraworks", value: 88 }, { symbol: "C", name: "Parvik Bank", value: 88 }];
const groups: PresetGroup[] = [
  { id: "top-rated", name: "Top rated", presets: [p("t1", "Top 10 large caps", { listText: "Top 10 of 19 that pass", joined: 3, first, figure: "score" }), p("t2", "Strong on both", { count: 25, joined: 0, first, figure: "score" })] },
  { id: "setups", name: "New highs", presets: [p("n1", "Near the high", { count: 23, joined: 4, figure: "from_high", first: [{ symbol: "L", name: "Lorvik", value: 0 }, { symbol: "Q", name: "Quinra", value: 1.6 }] })] },
  { id: "top-gainers", name: "Top gainers", presets: [p("g1", "Top gainers: Today", { count: 20, figure: "since", first: [{ symbol: "X", name: "Xalvo", value: 4.83 }] })] },
];
const route = (id: string | null = null, tab: "basic" | "advanced" = "basic") => {
  const choose = vi.fn();
  return { r: { tab, id, preset: null, chips: [], groups, list: { data: { asOf: "2026-11-12", groups }, isError: false, isLoading: false }, choose, toggleChip: vi.fn(), clear: vi.fn() } as unknown as PresetRoute, choose };
};

describe("Ready-made screens strip (N-38)", () => {
  it("has the header, the line and the close it was built on, with Top rated first and open", () => {
    render(<ScreensStrip route={route().r} />);
    const s = screen.getByRole("region", { name: "Ready-made screens" });
    expect(within(s).getByRole("heading", { name: "Ready-made screens" })).toBeTruthy();
    expect(s.textContent).toContain("Lists FinLit builds after every close. Pick one to see the companies that made it, and who joined since yesterday.");
    expect(s.textContent).toContain("Updated after the 12 Nov close");
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].textContent).toMatch(/Top rated\s*2/); expect(tabs[0].className).toContain("is-top"); expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs.slice(1).every((t) => t.querySelector(".rms-ti svg"))).toBe(true);          // every other group has its icon
  });
  it("a Top 10 card is deep green with the crown badge, TOP 10 tag, count, joined and the first three with the page's score; the first card says Start here", () => {
    render(<ScreensStrip route={route().r} />);
    const card = screen.getByRole("button", { name: /Top 10 large caps/ });
    expect(card.className).toContain("is-top10"); expect(card.querySelector(".rms-badge .rms-crown")).toBeTruthy();
    expect(card.textContent).toContain("Start here");
    expect(card.textContent).toContain("Top 10 of 19 that pass"); expect(card.textContent).toContain("+3 joined since yesterday");
    expect(card.textContent).toMatch(/First 3\s*FinLit IQ/); expect([...card.querySelectorAll(".rms-fn")].map((n) => n.textContent)).toEqual(["Indrav Infotech", "Kovrik Infraworks", "Parvik Bank"]);
    expect(card.textContent).toContain("See the 10 →");
    const other = screen.getByRole("button", { name: /Strong on both/ });
    expect(other.className).toContain("is-toprated"); expect(other.querySelector(".rms-star")).toBeTruthy(); expect(other.textContent).toContain("25 match");
    expect(other.textContent).not.toContain("joined since yesterday");                 // hidden at 0
    expect(other.textContent).toContain("See all 25 →"); expect(other.textContent).not.toContain("Start here");
  });
  it("New highs shows the distance from the high (at high, −1.6%) and Top gainers the change since joining; the score heading names Prism on Advanced", () => {
    render(<ScreensStrip route={route(null, "advanced").r} />);
    expect(screen.getByRole("button", { name: /Top 10 large caps/ }).textContent).toMatch(/First 3\s*FinLit Prism/);
    fireEvent.click(screen.getByRole("tab", { name: /New highs/ }));
    const nh = screen.getByRole("button", { name: /Near the high/ });
    expect(nh.textContent).toMatch(/From 52-week high/); expect(nh.textContent).toContain("at high"); expect(nh.textContent).toContain("−1.6%"); expect(nh.className).toContain("is-plain");
    expect(nh.querySelector(".rms-gi svg")).toBeTruthy(); expect(nh.textContent).not.toContain("Start here");      // only the strip's first card says it
    fireEvent.click(screen.getByRole("tab", { name: /Top gainers/ }));
    const tg = screen.getByRole("button", { name: /Top gainers: Today/ });
    expect(tg.textContent).toMatch(/Since it joined/); expect(tg.textContent).toContain("+4.8%");
  });
  it("a click opens the screen, and the chosen card says Showing below", () => {
    const a = route(); render(<ScreensStrip route={a.r} />);
    fireEvent.click(screen.getByRole("button", { name: /Strong on both/ }));
    expect(a.choose).toHaveBeenCalledWith("t2");
    cleanup(); render(<ScreensStrip route={route("t1").r} />);
    const on = screen.getByRole("button", { name: /Top 10 large caps/ });
    expect(on.getAttribute("aria-pressed")).toBe("true"); expect(on.textContent).toContain("✓ Showing below"); expect(on.textContent).toContain("Showing below ↓");
    expect(document.body.textContent).not.toContain("Start here");
  });
  it("names the Top 10 and Highest-rated lists only, and never uses advice words", () => {
    expect([isTop10({ name: "Top 10 mid caps" }), isTop10({ name: "Highest-rated small caps" }), isTop10({ name: "Strong on both" })]).toEqual([true, true, false]);
    render(<ScreensStrip route={route().r} />);
    expect(document.body.textContent).not.toMatch(/\b(best|top picks?|buy|winners?)\b/i);
  });
});
