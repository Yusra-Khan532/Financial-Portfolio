// @vitest-environment jsdom
// Task #333 part D (developer file 30: addition 4, polish 3 and 4, second pass 1 and 8, final 4 and 6): the map's filters and playback, the hover card, and the mood
// chart week by week.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import board from "../../../lib/__fixtures__/pulse-board-6nov.json";
import history from "../../../../public/demo/sector-history.json";
import type { Board } from "../../../lib/sectors";
import type { IndustryMap } from "../../../lib/sectorExtra";
import type { SectorHistory } from "../../../lib/sectorHistory";

const B = board as unknown as Board, H = history as unknown as SectorHistory;
const M: IndustryMap = { words: {} as never, insights: [], rows: B.rows.slice(0, 6).map((r, i) => ({ name: r.name, slug: r.slug, state: (["crash", "bouncing", "sold_off", "sold_off", "losing", "rising"] as const)[i], state_word: "x", rising: 20 + i * 12, below_high: -5 - i * 4, corner: null })) };
const PLAY = { weeks: ["2026-10-23", "2026-10-30", "2026-11-06"], groups: M.rows.map((r, i) => ({ slug: r.slug, name: r.name, rising: [10 + i, 15 + i, r.rising], below_high: [-30, -25, r.below_high], state: ["washout", "washout", "thrust_c"] })) };
vi.mock("../../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../../lib/api")>()), apiGet: vi.fn((url: string) => url.startsWith("/api/sector-playback") ? Promise.resolve(PLAY) : new Promise(() => {})) }));
import { MoodWeeks, SectorMap } from "./PulseMap";
import { TodayMinute } from "./PulseSimple";

afterEach(cleanup);
const wrap = (el: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>);
const dots = () => document.querySelectorAll("svg[data-testid=map-chart] a circle");
const labels = () => document.querySelectorAll("svg[data-testid=map-chart] text.sp-dotl");

describe("The map: filters (polish 4, final 6)", () => {
  it("one tick button per state with its count, in a fixed order; Only my industries; Names", () => {
    wrap(<SectorMap m={M} b={B} mine={new Set([M.rows[0].slug])} />);
    const f = screen.getByRole("group", { name: "Show on the map" });
    expect(within(f).getAllByRole("button").map((b) => b.textContent!.replace("✓", ""))).toEqual(["Bouncing back after a crash 1", "Bouncing back 1", "Rising together 1", "No clear signal 0", "Losing steam 1", "Sold off 2", "Only my industries", "Names"]);
    expect(dots()).toHaveLength(6);
    fireEvent.click(within(f).getByRole("button", { name: /Sold off/ }));
    expect(dots()).toHaveLength(4);
    expect(within(f).getByRole("button", { name: /Sold off/ }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(within(f).getByRole("button", { name: /Only my industries/ }));
    expect(dots()).toHaveLength(1);
    expect(dots()[0].getAttribute("class")).toBe("sx-mdot");                 // the member's own dot is ringed
    fireEvent.click(within(f).getByRole("button", { name: /Only my industries/ }));
    expect(labels().length).toBeGreaterThan(0);
    fireEvent.click(within(f).getByRole("button", { name: /Names/ }));
    expect(labels()).toHaveLength(0);
  });
});

describe("The map: playback (addition 4)", () => {
  it("opens on the latest close; the slider moves every dot to that week, colours it by its reading then and hides the names", async () => {
    wrap(<SectorMap m={M} b={B} mine={new Set()} />);
    const slider = await screen.findByRole("slider");
    expect((slider as HTMLInputElement).value).toBe("2");
    expect(screen.getByText("6 Nov 2026")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    const before = dots()[0].getAttribute("cx");
    fireEvent.change(slider, { target: { value: "0" } });
    expect(screen.getByText("23 Oct 2026")).toBeTruthy();
    expect(dots()[0].getAttribute("cx")).not.toBe(before);
    expect(dots()[0].getAttribute("fill")).toBe("#E9B949");                   // Sold off at that close
    expect(labels()).toHaveLength(0);
    fireEvent.change(slider, { target: { value: "2" } });
    expect(labels().length).toBeGreaterThan(0);
  });
  it("Play runs through the weeks and stops at the latest", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    wrap(<SectorMap m={M} b={B} mine={new Set()} />);
    await waitFor(() => expect(screen.getByRole("slider")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("2");
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    vi.useRealTimers();
  });
});

describe("The hover card (second pass 1)", () => {
  it("pointing at a square shows its name, Yours, its chips, stocks rising, below its high, rank and 6 months against the average", () => {
    wrap(<TodayMinute b={B} h={H} mine={new Set([B.rows[0].slug])} />);
    const sq = document.querySelector(`.sp-squares a[href^="/sectors/${B.rows[0].slug}"]`)!;
    fireEvent.mouseEnter(sq);
    const card = screen.getByRole("tooltip");
    expect(card.textContent).toContain("Yours");
    for (const t of ["Stocks rising", "Below its 1-year high", "Rank", "6 months against the average", "Press to open its page."]) expect(card.textContent).toContain(t);
    fireEvent.mouseLeave(document.querySelector(".sx-today")!);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("The market's mood, week by week (polish 3)", () => {
  it("one column per weekly close; Simple: 3 groups by default, All 6 states on the switch; a pressed column's counts and change show under the chart", () => {
    wrap(<MoodWeeks h={H} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/^The market's mood, week by week/);
    expect(document.querySelectorAll(".sx-col")).toHaveLength(H.week_ends!.length);
    expect(document.querySelectorAll(".sx-lg li")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "All 6 states" }));
    expect(document.querySelectorAll(".sx-lg li")).toHaveLength(6);
    const cols = document.querySelectorAll(".sx-col");
    fireEvent.click(cols[3]);
    expect(cols[3].getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".sx-mr")!.textContent).toContain("In brackets: the change on the week before.");
  });
});
