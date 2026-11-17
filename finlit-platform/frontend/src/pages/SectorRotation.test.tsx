// @vitest-environment jsdom
// Sector Rotation as the "FinLit final pages" pack draws it (docs/design/finlit-final-pages/08 and 09), on the 6 Nov 2026 weekly close: the header with The yardstick, the
// Simple view's sections in the pack's order, the map's box toggles, the Full table view (?view=full) with its filters and the opened industry, and the not-loaded sentence.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import rot from "../lib/__fixtures__/rotation-6nov.json";
import board from "../lib/__fixtures__/pulse-board-6nov.json";
import { ApiError } from "../lib/api";
import type { RotationMap } from "../lib/rotation";

const st = vi.hoisted(() => ({ map: null as unknown }));
const q = (d: unknown) => (d instanceof Error ? { data: undefined, isLoading: false, isError: true, error: d, refetch: () => {} } : { data: d, isLoading: false, isError: false, error: null, refetch: () => {} });
vi.mock("../lib/rotation", async (orig) => ({ ...(await orig<typeof import("../lib/rotation")>()), useRotationMap: () => q(st.map) }));
vi.mock("../lib/sectors", async (orig) => ({ ...(await orig<typeof import("../lib/sectors")>()), useSectorBoard: () => q(board) }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: vi.fn(() => new Promise(() => {})), useSearchIndex: () => ({ data: undefined }) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn(), plan: "gold", upgrade: vi.fn(), has: () => true }), TIER: { basic: { n: "Basic", ic: "sprout", tc: "--t-basic" }, silver: { n: "Silver", ic: "medal", tc: "--t-silver" }, gold: { n: "Gold", ic: "crown", tc: "--t-gold" } } }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
import { SectorRotationPage } from "./SectorRotation";

const M = rot as unknown as RotationMap;
beforeEach(() => { localStorage.clear(); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); st.map = M; });
afterEach(cleanup);
const at = (path = "/sectors/rotation") => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}><SectorRotationPage /></MemoryRouter></QueryClientProvider>);
const h2 = () => screen.getAllByRole("heading", { level: 2 }).map((h) => (h.textContent ?? "").replace(/i$/, ""));
// CLAUDE.md: describe, never advise. The disclaimer itself names buy, sell and hold, so it is left out of the scan.
const BANNED = /\b(buy|sell|hold|reduce|avoid|accumulate|target|best|multibagger|top pick)\b/i;
const said = () => (document.body.textContent ?? "").replace(document.querySelector(".sp-disclaimer")?.textContent ?? "", "");

describe("Sector Rotation, the pack's header", () => {
  it("has the title, the weekly date line, the unranked industry, The yardstick and the two views", () => {
    at();
    expect(screen.getByRole("heading", { level: 1, name: "Sector Rotation" })).toBeTruthy();
    expect(document.body.textContent).toContain("Updated after the weekly close, Fri 6 Nov 2026 · 37 groups ranked");
    expect(document.body.textContent).toContain("Oil is too small to rank");
    expect(screen.getByLabelText("The yardstick").textContent).toContain("All 38 groups counted equally.");
    expect(within(screen.getByRole("navigation", { name: "Sector pages" })).getByRole("link", { name: "Sector Rotation" }).getAttribute("aria-current")).toBe("page");
    expect((screen.getByRole("combobox") as HTMLInputElement).placeholder).toBe("An industry, e.g. Banks");
    expect(document.querySelector(".sp-disclaimer")?.textContent).toBe("Describes past prices of NSE industry groups against the average group; not a forecast and not a recommendation to buy, sell or hold any security. NSE daily data, equal-weighted industry groups, the same counted stocks as Sector Pulse. Data as of Fri 6 Nov 2026, after the close.");
  });
});

describe("Sector Rotation, Simple view (pack 08)", () => {
  it("shows the pack's sections in its order and never advises", () => {
    at();
    // task #192 (SECTOR-PAGES.md 7): 1 Today → 2 The four boxes → 3 Map → 4 Who is ahead → 5 Changed box → 6 May change → 7 Rank moves → 8 Your industries
    const want = ["Today in one minute", "The four boxes, in the order industries usually move", "The map: where every industry stands", "Who is ahead, and which way they are moving", "Changed box this week · 8", "May change box next week · 7", "Biggest rank moves in 4 weeks", "How your industries compare"];
    const got = h2(), idx = want.map((t) => got.indexOf(t));
    expect(idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1]))).toBe(true);
    expect(document.body.textContent).toContain("Leadership is shifting.");
    expect(said()).not.toMatch(BANNED);
  });
  it("the map's box buttons hide and show their dots, with the ranked count in each", () => {
    at();
    const btn = screen.getByRole("button", { name: "Ahead but slowing · 9" });
    const dots = () => document.querySelectorAll(".rp-map .rp-hit").length;
    expect(dots()).toBe(37);
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(dots()).toBe(28);
    expect(screen.getByRole("button", { name: "Show 8-week paths" }).getAttribute("aria-pressed")).toBe("false");
  });
  it("says how to see your industries when there are none", () => {
    at();
    expect(screen.getByText(/Sign in and add shares to your portfolio to see how their industries compare/)).toBeTruthy();
  });
  it("when the data is not loaded it says why, with Try again", () => {
    st.map = new ApiError(503, { status: "not_loaded", reason: "Rotation data is not loaded yet: the weekly job has not run on this server." } as never);
    at();
    expect(screen.getByText(/Rotation data is not loaded yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

describe("Sector Rotation, Full table view (pack 09)", () => {
  it("groups the ranking by box and the filters narrow it", () => {
    at("/sectors/rotation?view=full");
    expect(h2()).toEqual(expect.arrayContaining(["Ranking of every industry", "Six months of ranks", "How the ranking changed over 12 weeks", "May change box next week · 7"]));
    const rows = () => document.querySelectorAll(".rp-full .rp-row").length;
    expect(rows()).toBe(38);
    expect(document.querySelectorAll(".rp-full .rp-gh").length).toBe(4);
    const show = screen.getByRole("group", { name: "Show" });
    fireEvent.click(within(show).getByRole("button", { name: "Behind but gaining · 6" }));
    expect(rows()).toBe(6);
    fireEvent.click(within(show).getByRole("button", { name: "May change next week · 7" }));
    expect(rows()).toBe(7);
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeTruthy();
    expect(said()).not.toMatch(BANNED);
  });
  it("an industry opens to its summary", () => {
    at("/sectors/rotation?view=full");
    const row = [...document.querySelectorAll(".rp-full .rp-row")].find((r) => r.textContent?.includes("Automobiles"))!;
    fireEvent.click(within(row as HTMLElement).getByRole("button"));
    expect(document.body.textContent).toContain("Automobiles is rank 4 of 37, in Ahead and gaining for 1 week. Against the average group it is +9.0% over 6 months and +10.8% over the last month. Most of its stocks are taking part in the move.");
  });
  it("draws six months of ranks, one row per ranked industry", () => {
    at("/sectors/rotation?view=full");
    const heat = screen.getByRole("img", { name: /Ranks of 37 groups at 26 weekly closes/ });
    expect(heat.querySelectorAll("g").length).toBe(37);
    expect(document.querySelectorAll(".rp-12 tbody tr").length).toBe(37);
  });
});

describe("task #192 round 4a-2 (SECTOR-PAGES.md 2 to 8), Sector Rotation", () => {
  it("has the guide, closed, with the ranked count and the four boxes word for word as their i texts", () => {
    at();
    fireEvent.click(screen.getByRole("button", { name: /How to read and use this page/ }));
    expect(document.body.textContent).toContain("measures each of the 37 ranked groups against one yardstick, the average group (all 38 counted equally)");
    const first = document.querySelector(".sp-guide-t tbody tr")!;
    expect(first.children[1].textContent).toBe("Doing better than the average group over the longer run, and still pulling ahead lately.");
    expect(document.body.textContent).not.toContain("How to read this page");
  });
  it("numbers the sections in the pack's order and adds Hide where the pack says", () => {
    at();
    const bar = screen.getByRole("navigation", { name: "Sections on this page" });
    expect(within(bar).getAllByRole("link").map((a) => a.textContent)).toEqual(["1Today", "2Four boxes", "3Map", "4Who is ahead", "5Changed box", "6May change", "7Rank moves", "8Your industries"]);
    const hide = screen.getAllByRole("button", { name: /^Hide: / }).map((b) => b.getAttribute("aria-label"));
    expect(hide).toEqual(expect.arrayContaining(["Hide: How your industries compare", "Hide: The map: where every industry stands", "Hide: Changed box this week · 8", "Hide: May change box next week · 7"]));
    expect(screen.getByRole("button", { name: "About “Today in one minute”" })).toBeTruthy();
  });
  it("starts Changed box and May change at 4 rows and Who is ahead at 10 bars", () => {
    at();
    expect(document.querySelectorAll(".rp-ah-row")).toHaveLength(10);
    expect(screen.getAllByRole("button", { name: /^Show all \d+ ▾$/ }).map((b) => b.textContent)).toEqual(expect.arrayContaining(["Show all 38 ▾", "Show all 8 ▾", "Show all 7 ▾"]));
    const tables = [...document.querySelectorAll(".rp-chg tbody")].map((t) => t.children.length);
    expect(tables).toEqual([4, 4]);
  });
  it("Full table: 1 Ranking → 2 May change → 3 Six months of ranks → 4 12-week change, with Hide on May change", () => {
    at("/sectors/rotation?view=full");
    const bar = screen.getByRole("navigation", { name: "Sections on this page" });
    expect(within(bar).getAllByRole("link").map((a) => a.textContent)).toEqual(["1Ranking", "2May change", "3Six months of ranks", "412-week change"]);
    expect(screen.getByRole("button", { name: "About “Ranking of every industry”" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide: May change box next week · 7" })).toBeTruthy();
  });
});
