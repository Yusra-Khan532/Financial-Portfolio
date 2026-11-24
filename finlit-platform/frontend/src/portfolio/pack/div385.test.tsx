// @vitest-environment jsdom
// Task #385 phase 2 (developer file 33, Diversification view): the view's sections as drawn. Made-up sample lists only (codes S1…Sn, invented names).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
import { DivSubTabs, ShareGrid, SpreadPack, WhereSitsGrid, type DivInput } from "./DivPack";
import { StyleTiltPack } from "./EquityPack";
import { bannedIn } from "../shared";
import { PAGE_BANNED } from "../wordingRules";
import type { PageObject } from "../types";
import { prefs } from "../../lib/prefs";

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); prefs.set({ hiddenBlocks: [] }, true); });
afterEach(cleanup);

const MACROS = ["Consumer Discretionary", "Financial Services", "Industrials", "Information Technology", "Healthcare", "Energy", "Utilities", "Commodities", "Services", "Telecommunication", "Diversified", "Fast Moving Consumer Goods"];
const SIZES = ["Large", "Mid", "Small", "Micro"] as const;
/** A made-up list of n shares: S1…Sn, `macroOf` by index, a deterministic correlation matrix, groups as given. */
function sample(n: number, macroOf: (i: number) => string = (i) => MACROS[i % 4], groups: { members: string[]; avg_corr: number; letter: string }[] = []): DivInput {
  const order = Array.from({ length: n }, (_, i) => "S" + (i + 1));
  const corr = order.map((_, i) => order.map((__, j) => (i === j ? 1 : 0.05 + (((Math.min(i, j) * 37 + Math.max(i, j) * 11) % 60) / 100))));
  const rest = Object.fromEntries(order.map((s, i) => [s, corr[i].reduce((a, v, j) => a + (j === i ? 0 : v), 0) / Math.max(1, n - 1)]));
  const page = { order, corr, groups, avg_with_rest: rest, weeks: 104, score: { score: 62, band: "Fairly spread", comovement: 65, sector_spread: 58, effective_stocks: Math.min(n, 5.7), effective_sectors: 3.3 } } as unknown as PageObject;
  const at = (s: string) => +s.slice(1) - 1;
  return { page, symbols: order, levelOf: (s, l) => (l === "macro" ? macroOf(at(s)) : l === "sector" ? macroOf(at(s)) + " sector" : macroOf(at(s)) + " industry " + (at(s) % 3)),
    sizeOf: (s) => SIZES[at(s) % 4], band: () => "g", gold: true, nameOf: (s) => `Sample Company ${s.slice(1)} Ltd` };
}
const view = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
const iLabels = () => Array.from(document.querySelectorAll("button.sp-i, [aria-label^='About “']")).map((b) => b.getAttribute("aria-label"));

describe("Where your list sits (rows 143–147)", () => {
  it("counts by number of shares or by money; the money column and footer add to 100%", () => {
    const d = sample(13), worth = (s: string) => 1000 * +s.slice(1);
    view(<WhereSitsGrid d={d} worth={worth} />);
    expect(screen.getByText("Each share counts once. Darker cells carry more of your shares.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "By money" }));
    expect(screen.getByText("By what each share is worth now. Darker cells carry more of your money.")).toBeTruthy();
    const ofList = Array.from(document.querySelectorAll(".eqd-ws tbody .eqd-of b")).map((b) => parseFloat(b.textContent!));
    expect(ofList.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
    const foot = Array.from(document.querySelectorAll(".eqd-ws tfoot td")).slice(0, -1).map((td) => parseFloat(td.textContent!.split("· ")[1]));
    expect(foot.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
    expect(document.querySelector(".eqd-ws tbody .eqd-of small")!.textContent).toMatch(/^\d+ shares? · ₹[\d,.]+( L)?$/);
  });
  it("hides the switch when a share has no value now, and writes macro sectors out with a note", () => {
    view(<WhereSitsGrid d={sample(4)} worth={(s) => (s === "S2" ? null : 10)} />);
    expect(screen.queryByRole("button", { name: "By money" })).toBeNull();
    expect(document.querySelector(".eqd-ws tbody th")!.textContent).toMatch(/^Consumer DiscretionaryCars, auto parts/);
    expect(document.body.textContent).not.toMatch(/Cons\. Disc\./);
  });
  it("shows 4 chips and '+N more' in a cell of more than 5 shares, which opens the cell; chips use short names", () => {
    view(<WhereSitsGrid d={sample(28)} />);   // 7 shares in each macro sector and size pair (index % 4)
    const cell = document.querySelector(".eqd-ws tbody td")!;
    expect(within(cell as HTMLElement).getAllByText(/^Sample Company \d+$/)).toHaveLength(4);
    fireEvent.click(within(cell as HTMLElement).getByRole("button", { name: "+3 more" }));
    expect(within(cell as HTMLElement).getAllByText(/^Sample Company \d+$/)).toHaveLength(7);
  });
  it("tells the page its folded summary line", () => {
    const on = vi.fn();
    view(<WhereSitsGrid d={sample(13)} onLine={on} />);
    expect(on).toHaveBeenLastCalledWith("Most of it in Consumer Discretionary: 30.8% of your shares");
  });
});

describe("How spread out is the list? (rows 141–142, open items 7, 11, 12)", () => {
  const bv = { score: 58, band: "Fairly spread", comovement: 60, sector_spread: 55, effective_stocks: 5.1, effective_sectors: 3.0 };
  it("reads by what you own now by default, with Equal amounts as a switch and the note tying it to the Diversification card", () => {
    view(<SpreadPack d={sample(13)} byValue={bv} />);
    expect(document.querySelector(".spx-n b")!.textContent).toBe("58");
    expect(document.querySelector(".spx-note")!.textContent).toMatch(/^This score counts each share by what you own now/);
    fireEvent.click(screen.getByRole("button", { name: "Equal amounts" }));
    expect(document.querySelector(".spx-n b")!.textContent).toBe("62");
    expect(document.querySelector(".spx-note")!.textContent).toBe("This score counts each share equally. By what you own now it reads 58, moving like 5.1 of 13 shares: the figures on the Diversification card.");
  });
  it("chips read the singular for one, the good sign stays off with one macro sector, and the 26 is explained", () => {
    const d = sample(2, () => "Industrials");
    d.page.score = { score: 18, band: "Concentrated", comovement: 26, sector_spread: 0, effective_stocks: 2.0, effective_sectors: 1 };
    view(<SpreadPack d={d} />);
    expect(document.querySelector(".spx-chips")!.textContent).toMatch(/^1 macro sector1 sector2 industries/);
    expect(document.body.textContent).not.toMatch(/Spread across 1 macro/);
    expect(document.body.textContent).toMatch(/Reads 26 although your 2 shares move like 2\.0/);
    expect(screen.queryByRole("button", { name: "Equal amounts" })).toBeNull();
  });
});

describe("Do your macro sectors move together? (rows 151–153, item 4)", () => {
  it("gives each figure its word, folds the grid above 20 rows, and caps Tied to the rest above 10 rows", () => {
    view(<DivSubTabs d={sample(12, (i) => MACROS[i])} />);
    expect(document.querySelectorAll(".eqd-kpi .eqv-cw").length).toBe(1);   // one share per macro sector: no same-sector pairs, so only the different-sector figure
    expect(screen.getByRole("button", { name: "Hide the grid" })).toBeTruthy();
    expect(document.querySelectorAll(".eqd-ties li")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: /Show all 12 macro sectors/ }));
    expect(document.querySelectorAll(".eqd-ties li")).toHaveLength(12);
    document.querySelectorAll(".eqd-ties li b").forEach((b) => expect(b.textContent).toMatch(/^\d\.\d\d(barely|loosely|partly|closely)$/));
    document.querySelectorAll(".eqd-pairs li").forEach((li) => expect(li.textContent).toMatch(/(barely|loosely|partly|closely)\d\.\d\d$/));
  });
});

describe("Share by share (rows 154–163)", () => {
  it("draws one dot per pair with the band counts and reads a tapped dot", () => {
    view(<ShareGrid d={sample(13)} />);
    expect(screen.getByText(/How tightly your 78 pairs move together/)).toBeTruthy();
    const dots = document.querySelectorAll(".eqv-pc circle");
    expect(dots).toHaveLength(78);
    fireEvent.click(dots[0]);
    expect(document.querySelector(".eqv-pcr")!.textContent).toMatch(/^Sample Company \d+ · Sample Company \d+ · \d\.\d\d · (barely|loosely|partly|closely) linked, about \d+% of their weekly moves in common$/);
    expect(screen.getByRole("button", { name: "Grouped by sector" })).toBeTruthy(); expect(screen.getByRole("button", { name: "Alike shares side by side" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide the grid" })).toBeTruthy();
    expect(document.querySelectorAll(".eqv-rp > .eqv-rc")).toHaveLength(3);
    expect(document.querySelectorAll(".eqv-pl li")).toHaveLength(4);
    expect(document.querySelectorAll(".eqv-rest li")).toHaveLength(8); expect(screen.getByRole("button", { name: /Show all 13 shares/ })).toBeTruthy();
  });
  it("a 100-share list: the grid is open on load (task #388), the chart draws bars", () => {
    view(<ShareGrid d={sample(100)} />);
    // task #388 (file 36, change 9): open at any list size unless the member hid it; the old "closed above 20 shares" is gone
    expect(document.querySelector(".eqv-gfb")!.textContent).toBe("Hide the grid");
    expect(document.querySelectorAll(".eqd-sheat tbody tr")).toHaveLength(100);
    expect(document.querySelector(".eqv-gx")!.textContent).toBe("Expand ⤢");
    expect(document.querySelectorAll(".eqv-pc rect").length).toBeGreaterThan(5); expect(document.querySelectorAll(".eqv-pc circle")).toHaveLength(0);
    fireEvent.click(document.querySelector(".eqv-pc rect")!);
    expect(document.querySelector(".eqv-pcr")!.textContent).toMatch(/^\d+ pairs? between \d\.\d\d and \d\.\d\d · the (closest of them|pair): /);
  }, 60_000);   // 9,900 grid cells: slow in jsdom on a busy machine
  it("Hide the grid is remembered with the member's settings, across views and visits; Show brings it back (task #388, change 9)", () => {
    const first = view(<ShareGrid d={sample(13)} />);
    fireEvent.click(document.querySelector(".eqv-gfb")!);
    expect(prefs.get().hiddenBlocks).toEqual(["eq:grid"]);
    expect(document.querySelector(".eqd-sheat")).toBeNull(); expect(document.querySelector(".eqv-gx")).toBeNull();   // Expand hides with the grid
    first.unmount();                                                   // another view, then back: the grid stays hidden
    view(<ShareGrid d={sample(13)} />);
    expect(document.querySelector(".eqv-gfb")!.textContent).toMatch(/^Show the grid/);
    fireEvent.click(document.querySelector(".eqv-gfb")!);
    expect(prefs.get().hiddenBlocks).toEqual([]);
    expect(document.querySelector(".eqd-sheat")).toBeTruthy();
  });
  it("Expand opens the grid on its own screen: title, line, Close × and Esc, bigger cells, taps work as on the page (task #388, change 9)", () => {
    view(<ShareGrid d={sample(13)} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    const dlg = screen.getByRole("dialog", { name: "Share by share" });
    expect(dlg.textContent).toMatch(/^Share by shareEvery pair of your 13 shares · darker cells move together moreClose ×/);
    expect(document.documentElement.classList.contains("eqv-noscroll")).toBe(true);
    expect(dlg.querySelector("table.eqd-sheat.eqd-sheat-big")).toBeTruthy();
    expect(document.activeElement?.className).toBe("eqv-ovlx");
    fireEvent.click(within(dlg).getByRole("button", { name: /^S1 and S2: / }));
    expect(document.querySelector(".eqv-rc1")!.textContent).toMatch(/Sample Company 1 and Sample Company 2/);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull(); expect(document.documentElement.classList.contains("eqv-noscroll")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("grid figures: two decimals with the 0, the word in each cell's label, ink that reads on the cell (task #388, part B item 5, F3)", () => {
    view(<ShareGrid d={sample(5)} />);
    const cells = Array.from(document.querySelectorAll<HTMLButtonElement>(".eqd-sheat td button"));
    expect(cells.every((b) => /^0\.\d\d$/.test(b.textContent!))).toBe(true);
    cells.forEach((b) => { expect(b.getAttribute("aria-label")).toMatch(new RegExp(`^S\\d and S\\d: ${b.textContent!.replace(".", "\\.")}, (barely|loosely|partly|closely) linked$`)); expect(b.title).toBe(b.getAttribute("aria-label")); });
    cells.forEach((b) => { expect(b.style.getPropertyValue("--eqd-ink-l")).toMatch(/^#(10201c|fff)$/); expect(b.style.getPropertyValue("--eqd-ink-d")).toMatch(/^#(10201c|fff)$/); });
    // Each share against the rest: the word after each figure
    expect(Array.from(document.querySelectorAll(".eqv-rest .v")).every((v) => /^0\.\d\d (barely|loosely|partly|closely)$/.test(v.textContent!))).toBe(true);
  });
  it("tapping a cell, a name or a line reads it in the panel", () => {
    view(<ShareGrid d={sample(5)} />);
    fireEvent.click(screen.getByRole("button", { name: /^S1 and S2: / }));
    expect(document.querySelector(".eqv-rc1")!.textContent).toMatch(/Sample Company 1 and Sample Company 2/);
    expect(document.querySelector(".eqv-rc1")!.textContent).toMatch(/About \d+% of their weekly moves in common/);
    fireEvent.click(within(document.querySelector(".eqd-sheat tbody")!).getByRole("button", { name: "S3" }));
    expect(document.querySelector(".eqv-rc1")!.textContent).toMatch(/Sample Company 3 · Consumer Discretionary|Sample Company 3 · \w/);
    expect(document.querySelector(".eqv-rc1")!.textContent).toMatch(/linked with the rest/);
  });
});

describe("Style tilt (row 164)", () => {
  it("says which way is better under Valuation and Risk", () => {
    view(<StyleTiltPack tilt={{ parts: [{ part: "Valuation", avgPercentile: 59, band: "typical" }, { part: "Risk", avgPercentile: 86, band: "high" }, { part: "Quality", avgPercentile: 71, band: "high" }], notRated: [], sentence: "The list leans towards quality. Valuation is typical." } as never} />);
    expect(screen.getByText("higher = cheaper")).toBeTruthy(); expect(screen.getByText("higher = safer")).toBeTruthy();
  });
});

describe("the whole view's words and i buttons", () => {
  it("each i has its own label, and no banned or advice words", () => {
    const d = sample(13, (i) => MACROS[i % 4], [{ members: ["S1", "S2"], avg_corr: 0.61, letter: "A" }]);
    view(<><SpreadPack d={d} /><WhereSitsGrid d={d} worth={() => 10} /><DivSubTabs d={d} /><ShareGrid d={d} /></>);
    const labels = iLabels();
    expect(labels.length).toBeGreaterThan(10);
    expect(new Set(labels).size).toBe(labels.length);
    const text = document.body.textContent!;
    expect(bannedIn(text)).toEqual([]);
    expect(text.match(PAGE_BANNED)).toBeNull();
  });
});
