// @vitest-environment jsdom
// Task #448 (Sector Pulse, developer file 42), part 3: All sectors (the By state lead and tabs, the map's ring key), Price checks (the three lists of Against
// other sectors, the results summary and the dividers of Against results) and step 6 (Standout stocks: every column sorts over all of them, the Sorted by
// line, the phone Sort by select). The 6 Nov board, with made-up standout stocks and made-up results groups. Describes, never advises.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import board from "../../../lib/__fixtures__/pulse-board-6nov.json";
import type { Board, LeaderFlag } from "../../../lib/sectors";
import { byState, keyOf } from "../../../lib/pulsePack";

const RESULTS = { industries: [
  { name: "Banks", companies: 30, declared: 30, vsMarket: "Ahead", medianRevenueYoY: 12, medianProfitYoY: 15 },
  { name: "Insurance", companies: 10, declared: 10, vsMarket: "In line" },
  { name: "Capital Markets", companies: 20, declared: 18, vsMarket: "Behind" },
], quarter: { label: "Q2 FY27" } };
vi.mock("../../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../../lib/api")>()), apiGet: vi.fn((url: string) => url.startsWith("/api/results/quarter") ? Promise.resolve(RESULTS) : new Promise(() => {})) }));
vi.mock("../../../lib/ui", () => ({ useUI: () => ({ plan: "gold" }) }));
vi.mock("../../../lib/auth", () => ({ useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("../../../lib/watchlist", () => ({ useWatchlist: () => ({ lists: [], meta: {} }) }));
import { ByState, Momentum, Standouts, mxList, stateLead } from "./PulseSimple";
import { PriceVsResults } from "./PulseChecks";
import { StandoutsFull } from "./PulseTable";
import { useShowWords } from "../../../lib/groupWords";

afterEach(cleanup);
const wrap = (n: ReactNode) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{n}</MemoryRouter></QueryClientProvider>);
const B = board as unknown as Board;

describe("task #448 part 3: All sectors, by state", () => {
  it("the lead names the largest state first, then the rest", () => {
    const l = stateLead([{ key: "sold_off", rows: [1, 2, 3] }, { key: "crash", rows: [1, 2] }, { key: "losing", rows: [1] }, { key: "rising", rows: [] }], "sectors")!;
    expect(l.b + l.rest).toBe("3 sectors are sold off. 2 are bouncing back after a crash and 1 is losing steam.");
    expect(stateLead([{ key: "no_signal", rows: [1] }], "industries")!.b).toBe("1 industry shows no clear signal.");
    expect(stateLead([], "sectors")).toBeNull();
  });
  it("one state at a time, opening on the largest; How to read a row folds into the title row", () => {
    wrap(<ByState b={B} mine={new Set(["finance"])} />);
    const tabs = screen.getByRole("group", { name: "State" });
    const biggest = [...byState(B.rows)].sort((a, c) => c.rows.length - a.rows.length)[0];
    const on = within(tabs).getAllByRole("button").find((x) => x.getAttribute("aria-pressed") === "true")!;
    expect(on.querySelector("small")!.textContent).toBe(String(biggest.rows.length));
    expect(screen.getByText(/^\d+ industries are /)).toBeTruthy();
    expect(document.getElementById("sp-howrow")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "How to read a row ▾" }));
    expect(document.getElementById("sp-howrow")).toBeTruthy();
    const show = screen.getByRole("group", { name: "Show" });
    fireEvent.click(within(show).getByRole("button", { name: /My industries 1/ }));
    expect(within(tabs).getAllByRole("button")).toHaveLength(1);      // only Finance's state is left
  });
});

describe("task #448 part 3: Against other sectors, three lists", () => {
  it("every sector with a box sits in exactly one list; strong needs Ahead, weak needs Behind; a group opens its sectors", () => {
    const withBox = B.rows.filter((r) => r.rotation?.corner && r.rotation.corner !== "middle");
    for (const r of withBox) {
      const l = mxList(r), ahead = r.rotation!.corner.startsWith("ahead");
      if (l === "strong") expect(ahead && ["rising", "bouncing", "crash"].includes(keyOf(r))).toBe(true);
      if (l === "weak") expect(!ahead && ["sold_off", "losing"].includes(keyOf(r))).toBe(true);
    }
    wrap(<Momentum b={B} mine={new Set()} />);
    const n = (id: string) => Number(document.querySelector(`#sx-mx3-${id} .sx-cnt`)!.textContent);
    expect(n("strong") + n("mixed") + n("weak")).toBe(withBox.length);
    const dd = document.querySelector<HTMLButtonElement>(".sx-dd-h")!;
    expect(dd.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(dd);
    expect(dd.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(dd.getAttribute("aria-controls")!)!.querySelectorAll("li").length).toBe(Number(dd.querySelector(".sx-cnt")!.textContent));
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect(document.querySelector(".sx-mx3")).toBeNull();
  });
});

describe("task #448 part 3: Against results", () => {
  it("with 2 or more industries one summary line shows, and the industries open from 'N industries ▾'; short dividers, no coloured column", async () => {
    const fin = { ...B.rows[0], industries: ["Banks", "Insurance", "Capital Markets"] };
    const InSectors = ({ children }: { children: ReactNode }) => { useShowWords("sectors"); return <>{children}</>; };
    wrap(<InSectors><PriceVsResults b={{ ...B, rows: [fin] } as Board} mine={new Set()} /></InSectors>);
    const sum = await screen.findByText((_, el) => el?.className === "sx-rsum-l");
    expect([...sum.querySelectorAll("i")].map((x) => x.textContent)).toEqual(["1 Ahead", "1 In line", "1 Behind"]);
    const btn = screen.getByRole("button", { name: "3 industries ▾" });
    expect(document.querySelector(".sx-rsum .sx-inds")).toBeNull();
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(btn.getAttribute("aria-controls")!)!.querySelectorAll("li")).toHaveLength(3);
    expect([...document.querySelectorAll("thead th")].map((h) => h.classList.contains("sx-div"))).toEqual([false, false, true, true]);
  });
});

const FLAGS: LeaderFlag[] = [
  { symbol: "ZEB", name: "Zebra Ltd", group: "Banks", group_slug: "banks", tier: "Full", tier_code: 2, sessions_ago: 3, new_today: false, quarter: null, state: "Sold off" as never },
  { symbol: "ALP", name: "Alpha Ltd", group: "Power", group_slug: "power", tier: "Partial", tier_code: 1, sessions_ago: 0, new_today: true, quarter: null, state: "Sold off" as never },
  { symbol: "MID", name: "Mid Ltd", group: "Finance", group_slug: "finance", tier: "Full", tier_code: 2, sessions_ago: 1, new_today: false, quarter: null, state: "Sold off" as never },
  ...Array.from({ length: 9 }, (_, i) => ({ symbol: "Q" + i, name: "Q " + i, group: "Realty", group_slug: "realty", tier: "Partial", tier_code: 1, sessions_ago: 5 + i, new_today: false, quarter: null, state: "Sold off" as never })),
];
const SB = { ...B, leader_flags: FLAGS } as Board;
const names = () => [...document.querySelectorAll(".sp-stand tbody tr")].map((r) => r.querySelector("b")!.textContent);

describe("task #448 part 3: Standout stocks, every column sorts over all of them", () => {
  it("first press: the column's natural order over all 12 (opening the rest), second the reverse, third the site's order; the Sorted by line and Clear sort", () => {
    wrap(<Standouts b={SB} mine={new Set(["power"])} />);
    expect(names()).toHaveLength(8);
    expect(document.body.textContent).not.toContain("Press a column heading");
    const head = (n: string) => screen.getByRole("button", { name: `Sort by ${n}` });
    const th = (n: string) => head(n).closest("th")!;
    expect(th("Stock").getAttribute("aria-sort")).toBe("none");
    expect(head("Stock").querySelector(".sx-arr")!.textContent).toBe("↕");
    fireEvent.click(head("New high"));
    expect(names()).toHaveLength(12);                                        // sorting first opens "Show the other 4"
    expect(names().slice(0, 3)).toEqual(["ALP", "MID", "ZEB"]);              // newest first: today, 1d, 3d
    expect(screen.getByRole("status").textContent).toBe("Sorted by New high, newest first. Clear sort");
    fireEvent.click(head("New high"));
    expect(names()[11]).toBe("ALP");
    expect(th("New high").getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(head("New high"));
    expect(names()).toHaveLength(8); expect(names()[0]).toBe("ZEB");        // back to the site's order
    fireEvent.click(head("How strong"));
    expect(names().slice(0, 2)).toEqual(["ZEB", "MID"]);                     // Strong first, the site's order kept inside
    expect(th("How strong").getAttribute("aria-sort")).toBe("descending");
    fireEvent.click(screen.getByRole("button", { name: "Clear sort" }));
    expect(screen.queryByRole("status")).toBeNull();
    const sel = screen.getByRole("combobox", { name: "Sort by" }) as HTMLSelectElement;
    expect([...sel.options].map((o) => o.textContent)).toEqual(["Default order", "Stock: A to Z", "Its industry: A to Z", "How strong: Strong first", "New high: newest first", "Its industry is: high to low",
      "Stock: Z to A", "Its industry: Z to A", "How strong: Early first", "New high: oldest first", "Its industry is: low to high"]);
    fireEvent.change(sel, { target: { value: "stock:first" } });
    expect(names()[0]).toBe("ALP"); expect(names()).toHaveLength(12);
    // the site's own filters stay
    fireEvent.click(within(screen.getByRole("group", { name: "Show" })).getByRole("button", { name: /In my industries 1/ }));
    expect(names()).toEqual(["ALP"]);
  });
  it("the Full table's third tab: 'Standout stocks: 12' with the same table, sorting and filters", () => {
    wrap(<StandoutsFull b={SB} mine={new Set()} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("Standout stocks: 12");
    expect(names()).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: "Sort by Stock" }));
    fireEvent.click(screen.getByRole("button", { name: "Sort by Stock" }));
    expect(names()[0]).toBe("ZEB");
    fireEvent.click(within(screen.getByRole("group", { name: "Show" })).getByRole("button", { name: /^Strong/ }));
    expect(names()).toEqual(["ZEB", "MID"]);
  });
});
