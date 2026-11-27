// @vitest-environment jsdom
// Sector Rotation as the "FinLit final pages" pack draws it (docs/design/finlit-final-pages/08 and 09), on the 6 Nov 2026 weekly close: the header with The yardstick, the
// Simple view's sections in the pack's order, the map's box toggles, the Full table view (?view=full) with its filters and the opened industry, and the not-loaded sentence.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useParams } from "react-router";
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

// Task #332 (developer file 31): the shorter page. The section bar, the three boxes with a switch, the six additions, the four fixes, the faults and the wording.
const tabsOf = (name: string) => within(screen.getByRole("tablist", { name })).getAllByRole("tab").map((t) => (t.textContent ?? "").replace(/^\d/, ""));
const WN = { from: "2026-05-15", to: "2026-11-06", from_label: "15 May 2026", to_label: "6 Nov 2026", weeks: 26, groups: 38, caption: "x",
  cards: [{ box: "behind_gaining", box_name: "Behind but gaining", entered: 19, ended: 15, typical_weeks: 3, now: 4, next: [{ box: "behind_slipping", box_name: "Behind and slipping", n: 9 }, { box: "ahead_gaining", box_name: "Ahead and gaining", n: 6 }] },
    { box: "ahead_gaining", box_name: "Ahead and gaining", entered: 21, ended: 16, typical_weeks: 1, now: 0, next: [{ box: "ahead_slowing", box_name: "Ahead but slowing", n: 16 }] }] };

describe("Sector Rotation, the header (developer file 31)", () => {
  it("has the title, the weekly date line, why Oil has a box and no rank (fault 3), the yardstick and the disclaimer", () => {
    at();
    expect(screen.getByRole("heading", { level: 1, name: "Sector Rotation" })).toBeTruthy();
    expect(document.body.textContent).toContain("Updated after the weekly close, Fri 6 Nov 2026 · 37 groups ranked");
    expect(document.body.textContent).toContain("Oil has a box but no rank yet: a rank needs a full year of readings");
    expect(document.body.textContent).not.toContain("too small to rank");
    expect(screen.getByLabelText("The yardstick").textContent).toContain("All 38 groups counted equally.");
    expect(within(screen.getByRole("navigation", { name: "Sector pages" })).getByRole("link", { name: "Sector Rotation" }).getAttribute("aria-current")).toBe("page");
    expect(document.querySelector(".sp-disclaimer")?.textContent).toBe("Describes past prices of NSE industry groups against the average group; not a forecast and not a recommendation to buy, sell or hold any security. NSE daily data, equal-weighted industry groups, the same counted stocks as Sector Pulse. Data as of Fri 6 Nov 2026, after the close.");
  });
  it("the guide names the same yardstick as the box and no scoring rule (fault 2, error 6)", () => {
    at();
    fireEvent.click(screen.getByRole("button", { name: /How to read and use this page/ }));
    const g = document.querySelector(".sp-guide")?.textContent ?? "";
    expect(g).toContain("measures each of the 37 ranked groups against one yardstick, the average group (all 38 industry groups counted equally)");
    expect(document.body.textContent).not.toMatch(/50-day|\b\d+-day average/);
    expect(document.body.textContent).toContain("above their medium-term trend");
  });
});

describe("Sector Rotation, Simple view (developer file 31)", () => {
  it("the section bar has the final short names, one per part, in order; the old 8-step strip is gone", () => {
    at();
    const nav = screen.getByRole("navigation", { name: "On this page" });
    expect(nav.classList.contains("sp-secbar") && nav.classList.contains("sx-nav")).toBe(true);
    expect(within(nav).getAllByRole("link").map((a) => (a.textContent ?? "").replace(/^\d/, ""))).toEqual(["Today", "Your groups", "All 38 groups", "What changed", "Ranking checks", "Inside an industry", "Words explained"]);
    expect(document.querySelectorAll("nav.sp-secbar").length).toBe(1);
    for (const id of ["sx-today", "sx-yours", "sx-all", "sx-chg", "sx-chk", "sx-inside", "sx-words"]) expect(document.getElementById(id)).toBeTruthy();
  });
  it("orders the parts: Today, Your sectors, the three boxes, Inside, Words; never advises", () => {
    at();
    const want = ["Today in one minute", "How your groups compare", "The four boxes, in the order groups usually move", "Changed box this week · 8", "Price against results"];
    const got = h2(), idx = want.map((t) => got.findIndex((x) => x.startsWith(t)));
    expect(idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])), JSON.stringify(got)).toBe(true);
    expect(got.at(-1)).toMatch(/^Inside an industry: its strongest stocks, with FinLit Prism/);
    expect(said()).not.toMatch(BANNED);
  });
  it("Today: the headline is a coloured chip, the counts are four tiles and the callouts are cut to two", () => {
    at();
    const chip = document.querySelector("#sx-today .sp-lead .sx-hl");
    expect(chip?.textContent).toBe("Leadership is shifting.");
    expect(chip?.className).toMatch(/sx-hl-(bad|watch|good)/);
    expect(document.querySelectorAll("#sx-today .sx-tile").length).toBe(4);
    expect(document.querySelectorAll("#sx-today .sp-card").length).toBeLessThanOrEqual(2);
    expect(document.querySelector("#sx-today table")).toBeNull();
  });
  it("the three boxes use the views bar with numbered tabs, and box 1 opens on tab 1", () => {
    at();
    expect(tabsOf("All 38 groups")).toEqual(["Four boxes", "Map", "Who is ahead", "Rank moves"]);
    expect(tabsOf("What changed")).toEqual(["Changed this week8", "May change next week7"]);
    expect(tabsOf("Two checks on the ranking")).toEqual(["Against resultsnew", "What happened nextnew"]);
    expect(within(screen.getByRole("tablist", { name: "All 38 groups" })).getByRole("tab", { name: /Four boxes/ }).getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector("#sx-all .ctabs.sx-bar")).toBeTruthy();
  });
  it("&tab=map opens box 1 on the Map, and the box remembers its tab for the member", () => {
    at("/sectors/rotation?tab=map");
    expect(within(screen.getByRole("tablist", { name: "All 38 groups" })).getByRole("tab", { name: /Map/ }).getAttribute("aria-selected")).toBe("true");
    cleanup();
    at();
    fireEvent.click(within(screen.getByRole("tablist", { name: "All 38 groups" })).getByRole("tab", { name: /Rank moves/ }));
    expect(localStorage.getItem("finlit-rotation-tab-all")).toBe("moves");
    cleanup();
    at();
    expect(within(screen.getByRole("tablist", { name: "All 38 groups" })).getByRole("tab", { name: /Rank moves/ }).getAttribute("aria-selected")).toBe("true");
  });
  it("the four box cards show at most six names each, with Show all N under a longer list, and the real rank count", () => {
    at();
    for (const ul of document.querySelectorAll("#sx-all .rp-fb-l")) expect(ul.children.length).toBeLessThanOrEqual(6);
    const more = within(document.getElementById("sx-all")!).getByRole("button", { name: "Show all 12" });
    fireEvent.click(more);
    expect(Math.max(...[...document.querySelectorAll("#sx-all .rp-fb-l")].map((u) => u.children.length))).toBe(12);
    expect(document.body.textContent).toContain("The number is each industry's rank, 1 to 37.");
  });
  it("the map's box buttons still work, and playback steps through the 8 weekly closes, hiding names off the latest week", () => {
    at("/sectors/rotation?tab=map");
    const dots = () => document.querySelectorAll(".rp-map .rp-hit").length;
    expect(dots()).toBe(37);
    fireEvent.click(screen.getByRole("button", { name: "Ahead but slowing · 9" }));
    expect(dots()).toBe(28);
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect([slider.min, slider.max, slider.value]).toEqual(["0", "7", "7"]);
    expect(document.querySelector(".sx-pd")?.textContent).toBe("6 Nov 2026");
    const labels = () => document.querySelectorAll(".rp-map .rp-dl").length;
    expect(labels()).toBeGreaterThan(0);
    fireEvent.change(slider, { target: { value: "2" } });
    expect(labels()).toBe(0);
    expect(document.querySelector(".sx-pd")?.textContent).not.toBe("6 Nov 2026");
    fireEvent.change(slider, { target: { value: "7" } });
    expect(labels()).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Play the weeks" }).className).toContain("sx-pb");
    expect(document.querySelectorAll("#sx-all .ctab-panel:not([hidden]) .sp-card").length).toBe(1);   // Map: one callout
  });
  it("pointing at a dot shows the hover card (also on keyboard focus)", () => {
    at("/sectors/rotation?tab=map");
    const hit = document.querySelector(".rp-map .rp-hit")!;
    fireEvent.focus(hit);
    const hc = document.querySelector(".sx-hc");
    expect(hc?.textContent).toMatch(/Stocks rising.*Below its 1-year high.*Rank.*6 months vs average/);
    fireEvent.blur(hit);
    expect(document.querySelector(".sx-hc")).toBeNull();
  });
  it("with no shares and no watchlist: the prompt shows and nothing is tinted gold or tagged Yours", () => {
    at();
    expect(document.querySelector("#sx-yours .sx-empty")?.textContent).toContain("Your groups will show here");
    expect(document.querySelectorAll("tr.sx-mine").length).toBe(0);
    expect(document.querySelectorAll(".sp-yours, .rp-yours").length).toBe(0);
  });
  it("What happened next: cards from the server's count, the window and the not-a-forecast line, '1 week' singular", () => {
    st.map = { ...M, what_next: WN };
    at();
    fireEvent.click(within(screen.getByRole("tablist", { name: "Two checks on the ranking" })).getByRole("tab", { name: /What happened next/ }));
    const cap = document.querySelector("#sx-chk .ctab-panel:not([hidden]) .sx-cap")?.textContent ?? "";
    expect(cap).toContain("15 May 2026 to 6 Nov 2026");
    expect(cap).toContain("38 groups");
    expect(cap).toContain("It shows what did happen, not what will.");
    const cards = document.querySelectorAll(".sx-nxc");
    expect(cards.length).toBe(2);
    expect(cards[0].classList.contains("sx-nxnow") && cards[0].textContent!.includes("4 in it now")).toBe(true);
    expect(cards[1].classList.contains("sx-nxnow")).toBe(false);
    expect(cards[1].textContent).toContain("1 week");
    expect(cards[1].textContent).not.toContain("1 weeks");
    expect(document.getElementById("sx-chk")!.textContent).not.toMatch(/chance|likely|will move|%/);
  });
  it("What happened next says why it is blank when the feed has no count", () => {
    at();
    fireEvent.click(within(screen.getByRole("tablist", { name: "Two checks on the ranking" })).getByRole("tab", { name: /What happened next/ }));
    expect(document.getElementById("sx-chk")!.textContent).toContain("Not counted yet");
  });
  it("when the data is not loaded it says why, with Try again", () => {
    st.map = new ApiError(503, { status: "not_loaded", reason: "Rotation data is not loaded yet: the weekly job has not run on this server." } as never);
    at();
    expect(screen.getByText(/Rotation data is not loaded yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

describe("Sector Rotation, Full table view (developer file 31)", () => {
  it("one box with a switch, the ranking first; two callouts; no Download CSV", () => {
    at("/sectors/rotation?view=full");
    expect(tabsOf("Full table")).toEqual(["Ranking", "Six months of ranks", "12-week change", "May change next week7"]);
    expect(document.querySelectorAll(".sx-box-full ~ .sp-cards, .sp-cards").length).toBeGreaterThan(0);
    expect(document.querySelector(".sx-new > .sp-cards")?.querySelectorAll(".sp-card").length).toBeLessThanOrEqual(2);
    expect(screen.queryByText("Download CSV")).toBeNull();
    expect(document.querySelectorAll("nav.sp-secbar").length).toBe(0);              // the 4-step section strip is removed
  });
  it("opens on Key figures; All columns adds Weeks, 3 months and the rank line; 'best · worst' on one line; the bell carries the name", () => {
    at("/sectors/rotation?view=full");
    const t = document.querySelector("table.sx-ft")!;
    expect(t.classList.contains("sx-key")).toBe(true);
    const heads = [...t.querySelectorAll("thead tr:last-child th")].filter((th) => !th.classList.contains("sx-cx")).map((th) => (th.textContent ?? "").replace(/i$/, ""));
    expect(heads).toEqual(["Now", "1W / 4W", "Industry", "Box now", "1 month", "6 months", "Taking part", "Sector Pulse", "Alert"]);
    fireEvent.click(screen.getByRole("button", { name: "All columns" }));
    expect(t.classList.contains("sx-key")).toBe(false);
    expect(t.textContent).toMatch(/best \d+ · worst \d+/);
    expect(t.textContent).not.toMatch(/highest|lowest/);
    const bell = t.querySelector("td.sx-alc button")!;
    expect(bell.getAttribute("aria-label")).toMatch(/^Alert me about [A-Z]/);
    expect(bell.getAttribute("aria-label")).not.toMatch(/about \d/);
  });
  it("the other tabs draw six months of ranks and the 12-week change", () => {
    at("/sectors/rotation?view=full");
    fireEvent.click(within(screen.getByRole("tablist", { name: "Full table" })).getByRole("tab", { name: /Six months of ranks/ }));
    expect(screen.getByRole("img", { name: /Ranks of 37 groups at 26 weekly closes/ })).toBeTruthy();
  });
});

// ------------------------------------------------------------------------------------------------ task #332, the two points the lead decided
// The three levels: the Industries view says "groups" for its 38 rows and "industry" for one row. "industries" is left only where it means NSE's own industries.
const ALLOWED_INDUSTRIES = /\b(Industries view|industry groups?|small(?:er)? industries|NSE industries|its industries)\b/gi;
function pluralIndustries(): string[] {
  const body = document.body.cloneNode(true) as HTMLElement;
  body.querySelectorAll('[aria-label="Show sectors or industries"], .sp-disclaimer').forEach((n) => n.remove());
  const text = (body.textContent ?? "").replace(ALLOWED_INDUSTRIES, "");
  return text.match(/[^.]{0,40}\bindustries\b[^.]{0,20}/gi) ?? [];
}
describe("Industries view: 'groups' for the 38, never 'industries' (three levels)", () => {
  it("Simple view, every tab, the guide and the words", () => {
    at("/sectors/rotation?show=industries");
    fireEvent.click(screen.getByRole("button", { name: /How to read and use this page/ }));
    expect(pluralIndustries()).toEqual([]);
    expect(document.body.textContent).toContain("How your groups compare");
    expect(document.body.textContent).toContain("The four boxes, in the order groups usually move");
  });
  it("Full table view, every tab", () => {
    at("/sectors/rotation?show=industries&view=full");
    for (const t of ["Six months of ranks", "12-week change", "May change next week", "Ranking"]) fireEvent.click(within(screen.getByRole("tablist", { name: "Full table" })).getByRole("tab", { name: new RegExp(t) }));
    expect(pluralIndustries()).toEqual([]);
  });
});

// Second polish pass 1: "Pressing still opens the sector's page."
function Opened() { const { slug } = useParams(); return <p data-testid="opened">{slug}</p>; }
const atMap = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/sectors/rotation?tab=map"]}>
  <Routes><Route path="/sectors/rotation" element={<SectorRotationPage />} /><Route path="/sectors/:slug" element={<Opened />} /></Routes></MemoryRouter></QueryClientProvider>);
describe("pressing a dot on the map opens its page", () => {
  it("a press navigates to the group's page (the same link as the summary line)", () => {
    atMap();
    const hit = document.querySelector(".rp-map .rp-hit")!;
    const label = hit.getAttribute("aria-label")!;
    fireEvent.click(hit);
    const slug = screen.getByTestId("opened").textContent!;
    const row = M.rows.find((r) => r.slug === slug)!;
    expect(row).toBeTruthy();
    expect(label.startsWith("Open ")).toBe(true);
    expect(hit.getAttribute("role")).toBe("link");
  });
  it("Enter on a focused dot navigates too; the hover card shows on focus first", () => {
    atMap();
    const hit = document.querySelectorAll(".rp-map .rp-hit")[3]!;
    fireEvent.focus(hit);
    expect(document.querySelector(".sx-hc")?.textContent).toContain("Press to open its page.");
    fireEvent.keyDown(hit, { key: "Enter" });
    expect(M.rows.map((r) => r.slug)).toContain(screen.getByTestId("opened").textContent);
  });
});
