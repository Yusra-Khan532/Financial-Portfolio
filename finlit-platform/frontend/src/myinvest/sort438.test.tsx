// @vitest-environment jsdom
// Task #438 (developer pack of 28 Nov 2026, "All my investments · Sort by any column"): each test names the pack's point it proves (README "What it adds",
// spec section 8's acceptance list, 02 Held key, 03 no side effects). The list is the repo's made-up sample (sample-qty.json); no member's figures.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AllInvestments } from "../lib/myInvest";
import QTY from "./sample-qty.json";

const st = vi.hoisted(() => ({ plan: "gold" as "silver" | "gold", answer: null as unknown }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: null }) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()),
  apiSend: vi.fn(async (_m: string, p: string) => (p === "/api/me/all-investments" ? st.answer : p.startsWith("/api/visits/") ? { previous: null } : {})),
  apiGet: vi.fn(async () => ({ holdings: [] })) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ has: (p: string) => (p === "gold" ? st.plan === "gold" : true), upgrade: vi.fn(), toast: vi.fn() }), TIER: { silver: { name: "Silver" }, gold: { name: "Gold" } } }));
vi.mock("../components/Gate", () => ({ Gate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
import { MyInvestmentsPage } from "../pages/MyInvestments";
import { EquityTab, EtfTab, MfTab } from "./KindTabs";
import { compareValues, heldValue, nextState, parseNumber, PinnedSortChip, PinnedSortCols, sortData, STORE, useTableSort, valueOf, type Col } from "./sort438";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
Element.prototype.scrollIntoView = vi.fn();
const D = () => structuredClone(QTY) as unknown as AllInvestments;
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const mount = (path: string) => render(<QueryClientProvider client={qc()}><MemoryRouter initialEntries={[path]}><MyInvestmentsPage /></MemoryRouter></QueryClientProvider>);
const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
const table = (name: RegExp | string) => screen.getAllByRole("table").find((t) => t.closest(".tw")?.getAttribute("aria-label")?.match(name) || t.querySelector("thead")?.textContent?.match(name))!;
const heading = (t: HTMLElement, name: string) => within(t).getAllByRole("columnheader").find((h) => h.textContent?.trim() === name)!;
const press = (t: HTMLElement, name: string) => fireEvent.click(within(heading(t, name)).getByRole("button"));
const col = (t: HTMLElement, name: string) => { const i = within(t).getAllByRole("columnheader").indexOf(heading(t, name)); return [...t.querySelectorAll("tbody tr")].map((r) => (r.children[i] as HTMLElement).textContent!.trim()); };
const firstCol = (t: HTMLElement) => [...t.querySelectorAll("tbody tr")].map((r) => r.children[0].textContent!.trim());
const everyCo = async () => { mount("/my-investments?step=every"); await screen.findByText("Every company you own, counted once"); return document.querySelector<HTMLTableElement>("table.mi-co")!; };
const showAll = () => fireEvent.click(screen.getByRole("button", { name: /^Show all \d+ companies/ }));

beforeEach(() => { st.plan = "gold"; st.answer = D(); sessionStorage.clear(); localStorage.clear(); });
afterEach(() => cleanup());

describe("the sort rules (spec sections 2 and 5)", () => {
  it("first click by type: text A to Z, numbers high to low, scores highest first, size Large → Micro, peers Leader first, held most ways first", () => {
    const rows = [{ v: "b" }, { v: "a" }, { v: null }, { v: "C" }];
    expect(sortData(rows, (r) => r.v, "text", "asc").map((r) => r.v)).toEqual(["a", "b", "C", null]);
    expect(sortData([3, null, 10, -2], (x) => x, "num", "desc")).toEqual([10, 3, -2, null]);
    expect(sortData(["Micro", "Listed abroad", "Large", "Mid", "Small"], (x) => x, "size", "desc")).toEqual(["Large", "Mid", "Small", "Micro", "Listed abroad"]);
    expect(sortData(["Laggard", "Not compared", "Leader", "Not on your list", "In line"], (x) => x, "peer", "desc")).toEqual(["Leader", "In line", "Laggard", "Not compared", "Not on your list"]);
    expect(sortData(["E", "", "DE", "D", "DFE", "F"], (x) => x, "held", "desc")).toEqual(["DFE", "DE", "D", "F", "E", ""]);
  });
  it("blanks always sort last, whichever way the column is sorted", () => {
    for (const dir of ["asc", "desc"] as const) {
      expect(sortData([null, 1, "—", 5], (x) => x, "num", dir).slice(-2)).toEqual([null, "—"]);
      expect(sortData(["Listed abroad", "Large", "Micro"], (x) => x, "size", dir).at(-1)).toBe("Listed abroad");
    }
  });
  it("ties keep FinLit's order (a stable sort)", () => {
    const rows = [{ n: 1, v: 5 }, { n: 2, v: 5 }, { n: 3, v: 9 }, { n: 4, v: 5 }];
    expect(sortData(rows, (r) => r.v, "num", "desc").map((r) => r.n)).toEqual([3, 1, 2, 4]);
    expect(sortData(rows, (r) => r.v, "num", "asc").map((r) => r.n)).toEqual([1, 2, 4, 3]);
  });
  it("₹ in L and Cr is compared by real size; − is negative; the first number in a cell wins", () => {
    expect(parseNumber("₹2.50 L")).toBe(250000);
    expect(parseNumber("₹1.50 Cr")).toBe(15000000);
    expect(parseNumber("−₹12.40 L")).toBe(-1240000);
    expect(parseNumber("+2.1%")).toBe(2.1);
    expect(parseNumber("₹1,47,064 Cr")).toBe(1470640000000);
    expect(parseNumber("₹3.20 L107 of 108 with a buy price")).toBe(320000);
    expect(parseNumber("—")).toBeNull();
    expect(valueOf("num", "Not rated: listed abroad")).toBeNull();
    expect(compareValues(parseNumber("₹1.10 Cr"), parseNumber("₹95.00 L"), "num", "desc")).toBeLessThan(0);   // crore above lakh
  });
  it("Held: ways × 10, then D > F > E", () => {
    expect(heldValue("DE")! > heldValue("D")!).toBe(true);
    expect(heldValue("D")! > heldValue("E")!).toBe(true);
    expect(heldValue("")).toBeNull();
  });
  it("the click cycle: sort → reverse → FinLit's order; a different heading starts fresh", () => {
    let s = nextState(null, "prism", "prism");
    expect(s).toEqual({ key: "prism", dir: "desc" });
    s = nextState(s, "prism", "prism"); expect(s).toEqual({ key: "prism", dir: "asc" });
    expect(nextState(s, "prism", "prism")).toBeNull();
    expect(nextState({ key: "prism", dir: "asc" }, "company", "text")).toEqual({ key: "company", dir: "asc" });
  });
});

describe("Every company you own, counted once", () => {
  it("point 3: every data heading is a real button with the faint arrow pair and aria-sort=none", async () => {
    const t = await everyCo();
    const ths = within(t).getAllByRole("columnheader");
    expect(ths.map((h) => h.textContent)).toEqual(["Company", "All together", "Held", "Direct", "Through funds", "Through ETFs", "Size", "FinLit Prism", "Against peers"]);
    for (const h of ths) { expect(h.getAttribute("aria-sort")).toBe("none"); expect(h.querySelector("button.fl-sort .fl-sort-ar svg")).not.toBeNull(); }
    expect(screen.getAllByText("Click any heading to sort this table.").length).toBeGreaterThan(0);
  });
  it("point 4: FinLit Prism puts the highest score first; the not-rated rows (listed abroad) stay last after the 2nd click too", async () => {
    const t = await everyCo(); showAll();
    press(t, "FinLit Prism");
    const scores = col(t, "FinLit Prism");
    expect(scores[0]).toMatch(/^81/);
    expect(scores.slice(-5).every((x) => x === "Not rated: listed abroad")).toBe(true);
    press(t, "FinLit Prism");
    const up = col(t, "FinLit Prism");
    expect(up[0]).toMatch(/^44/);
    expect(up.slice(-5).every((x) => x === "Not rated: listed abroad")).toBe(true);
    expect(heading(t, "FinLit Prism").getAttribute("aria-sort")).toBe("ascending");
  });
  it("point 5: Size runs Large, Mid, Small, Micro, then Listed abroad", async () => {
    const t = await everyCo(); showAll();
    press(t, "Size");
    const z = col(t, "Size"), order = ["Large", "Mid", "Small", "Micro", "Listed abroad"];
    expect(z.map((x) => order.indexOf(x))).toEqual([...z.map((x) => order.indexOf(x))].sort((a, b) => a - b));
    expect(z.at(-1)).toBe("Listed abroad");
  });
  it("point 6: Against peers runs Leader, In line, Laggard, then Not compared / Not on your list", async () => {
    const t = await everyCo(); showAll();
    press(t, "Against peers");
    const p = col(t, "Against peers");
    expect(p.slice(0, 5)).toEqual(["Leader", "In line", "In line", "Laggard", "Laggard"]);
    expect(p.slice(5).every((x) => x === "Not compared" || x === "Not on your list")).toBe(true);
  });
  it("point 9 and 10: the 3rd click and Reset both give back the original order, row for row", async () => {
    const t = await everyCo(); showAll();
    const before = firstCol(t);
    press(t, "Held"); expect(firstCol(t)).not.toEqual(before);
    press(t, "Held"); press(t, "Held");
    expect(firstCol(t)).toEqual(before);
    expect(heading(t, "Held").getAttribute("aria-sort")).toBe("none");
    press(t, "Direct");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(firstCol(t)).toEqual(before);
  });
  it("point 11: sort, then Show all: the full list is in the sorted order; the first rows shown are the top of the sort", async () => {
    const t = await everyCo();
    press(t, "Company");
    const top = firstCol(t);
    expect(top.length).toBe(10);
    showAll();
    const all = firstCol(t);
    expect(all.length).toBe(18);
    expect(all.slice(0, 10)).toEqual(top);
    expect([...all].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base", numeric: true }))).toEqual(all);
    expect(screen.getByText("18 companies")).toBeTruthy();   // the count line does not change with sorting
  });
  it("point 12: sort, then search: the sort holds and only matching rows show", async () => {
    const t = await everyCo();
    press(t, "All together");
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a company you own" }), { target: { value: "a" } });
    const rows = firstCol(t), pcts = col(t, "All together").map((x) => parseFloat(x));
    expect(rows.every((r) => /a/i.test(r))).toBe(true);
    expect(pcts).toEqual([...pcts].sort((a, b) => b - a));
    expect(document.querySelector(".fl-sort-on")!.textContent).toContain("Sorted by All together, high to low");
  });
  it("point 13: remembered for the browser session per table (sessionStorage finlit-mi-sort), not in localStorage or the address", async () => {
    let t = await everyCo();
    const local = JSON.stringify({ ...localStorage }), path = window.location.href;
    press(t, "Size"); press(t, "Size");
    expect(JSON.parse(sessionStorage.getItem(STORE)!)).toEqual({ "mi-every": { key: "size", dir: "asc" } });
    expect(JSON.stringify({ ...localStorage })).toBe(local);
    expect(window.location.href).toBe(path);
    cleanup();
    t = await everyCo();
    expect(heading(t, "Size").getAttribute("aria-sort")).toBe("ascending");
    sessionStorage.clear(); cleanup();          // a new tab: back to FinLit's order
    t = await everyCo();
    expect(heading(t, "Size").getAttribute("aria-sort")).toBe("none");
  });
  it("point 14: each heading is a button, so Enter and Space sort; focus stays on the heading after sorting", async () => {
    const t = await everyCo();
    const b = within(heading(t, "Direct")).getByRole("button");
    b.focus(); fireEvent.click(b);
    expect(document.activeElement).toBe(within(heading(t, "Direct")).getByRole("button"));
    expect(b.getAttribute("type")).toBe("button");
  });
  it("point 15: aria-sort on the heading, and a polite announcement of the change", async () => {
    const t = await everyCo();
    press(t, "FinLit Prism");
    expect(heading(t, "FinLit Prism").getAttribute("aria-sort")).toBe("descending");
    const live = document.querySelector(".fl-sortbar .fl-sr[aria-live=polite]")!;
    expect(live.textContent).toBe("Sorted by FinLit Prism, highest score first");
    expect(within(heading(t, "FinLit Prism")).getByRole("button").getAttribute("title")).toBe("Sorted highest score first. Press to reverse.");
    press(t, "FinLit Prism"); press(t, "FinLit Prism");
    expect(live.textContent).toBe("Back to FinLit’s order");
    expect(within(heading(t, "Size")).getByRole("button").getAttribute("title")).toBe("Sort by Size, large to micro");
  });
  it("the chip reads 'Sorted by X, direction' with Reset, and the hint 'Click the heading again to reverse.'", async () => {
    const t = await everyCo();
    press(t, "Size");
    const bar = document.querySelector(".fl-sortbar")!;
    expect(bar.querySelector(".fl-sort-on")!.textContent).toBe("Sorted by Size, large to microReset");
    expect(bar.querySelector(".fl-sort-hint")!.textContent).toBe("Click the heading again to reverse.");
    expect(t.getAttribute("data-fl-col")).toBe("7");   // the sorted column's cells are tinted
  });
  it("point 18: company links in rows still open as before", async () => {
    const t = await everyCo(); press(t, "Company");
    const a = t.querySelector<HTMLAnchorElement>("tbody tr th a")!;
    expect(a.getAttribute("href")).toMatch(/^\/stocks\//);
  });
  it("without Gold the FinLit Prism heading is not there, and a remembered Prism sort is ignored", async () => {
    sessionStorage.setItem(STORE, JSON.stringify({ "mi-every": { key: "prism", dir: "desc" } }));
    const d = D(); d.plan = "silver" as AllInvestments["plan"]; st.answer = d; st.plan = "silver";
    const t = await everyCo();
    expect(within(t).getAllByRole("columnheader").map((h) => h.textContent)).not.toContain("FinLit Prism");
    expect(document.querySelector(".fl-sort-on")).toBeNull();
  });
});

describe("point 2: the Held key and the letter tooltips (02_held-key-and-tooltips.md)", () => {
  it("one key line above the table, with the site's own D / F / E boxes and the team's words", async () => {
    await everyCo();
    const keys = document.querySelectorAll(".fl-held-key");
    expect(keys.length).toBe(1);
    expect(keys[0].textContent).toBe("HeldDdirectly, in your Equity portfolioFthrough your mutual fundsEthrough your ETFsPale letter: not held that way. Point at or tap a letter to see which ETF or fund.");
    expect([...keys[0].querySelectorAll(".mi-held i.on")].map((i) => i.className)).toEqual(["on mD", "on mF", "on mE"]);
    // it sits just above the sort line, which sits above the table's scroll box
    expect(keys[0].nextElementSibling!.classList.contains("fl-sortbar")).toBe(true);
    expect(keys.length).toBe(document.querySelectorAll("table.mi-co").length);
  });
  it("each Held box reads as one sentence; each letter's tooltip names the fund or ETF and the % held that way", async () => {
    const t = await everyCo();
    const d = D(), c = d.companies[0];   // held D, F and E
    const row = [...t.querySelectorAll("tbody tr")][0];
    const box = row.querySelector(".mi-held")!;
    expect(box.getAttribute("role")).toBe("img");
    expect(box.getAttribute("aria-label")).toMatch(/^Held directly, through mutual funds \(.+\), through ETFs \(.+\)$/);
    const f = box.querySelector<HTMLElement>("i.mF")!;
    expect(f.hasAttribute("data-tip")).toBe(true);
    fireEvent.mouseOver(f);
    const tip = document.getElementById("fl-held-tip")!;
    expect(tip.getAttribute("role")).toBe("tooltip");
    expect(tip.textContent).toMatch(/^Held through your mutual funds: .+ · \d+\.\d\d%$/);
    expect(tip.textContent).toContain(c.via.filter((v) => d.funds.some((x) => x.short === v))[0]);
    fireEvent.mouseOut(f);
    expect(document.getElementById("fl-held-tip")).toBeNull();
    fireEvent.mouseOver(box.querySelector<HTMLElement>("i.mD")!);
    expect(document.getElementById("fl-held-tip")!.textContent).toMatch(/^Held directly, in your Equity portfolio · \d+\.\d\d%$/);
  });
  it("a pale letter says it is not held that way; a tap shows the tooltip and it hides after 2.5 seconds or on scroll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const t = await everyCo();
      const row = [...t.querySelectorAll("tbody tr")].find((r) => r.querySelector(".mi-held i.mD:not(.on), .mi-held i:not(.on)"))!;
      const pale = [...row.querySelectorAll<HTMLElement>(".mi-held i")].find((i) => !i.classList.contains("on"))!;
      fireEvent.click(pale);
      expect(document.getElementById("fl-held-tip")!.textContent).toMatch(/^Not held /);
      fireEvent.mouseOut(pale);                                     // a touch screen sends a mouseout right after the tap: it stays
      expect(document.getElementById("fl-held-tip")).not.toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(2600); });
      expect(document.getElementById("fl-held-tip")).toBeNull();
      fireEvent.mouseOver(pale);
      expect(document.getElementById("fl-held-tip")).not.toBeNull();
      fireEvent.scroll(window);
      expect(document.getElementById("fl-held-tip")).toBeNull();
    } finally { vi.useRealTimers(); }
  });
});

describe("the other tables", () => {
  it("point 7: Where your money sits sorts; the All together row (tfoot) stays last and unchanged; (Open its tab) has no arrows", async () => {
    mount("/my-investments"); await screen.findByText("Where your money sits");
    const t = document.querySelector<HTMLTableElement>("table.mi-tb")!;
    const foot = t.tFoot!.outerHTML;
    const open = within(t).getAllByRole("columnheader").at(-1)!;
    expect(open.getAttribute("aria-label")).toBe("Open its tab");
    expect(open.querySelector("button")).toBeNull();
    expect(open.hasAttribute("aria-sort")).toBe(false);
    press(t, "Invested");
    const inv = col(t, "Invested").map((x) => parseNumber(x)).filter((x) => x != null) as number[];
    expect(inv).toEqual([...inv].sort((a, b) => b - a));
    press(t, "Kind");
    expect(t.tFoot!.outerHTML).toBe(foot);
    expect(t.lastElementChild).toBe(t.tFoot);
  });
  it("What it is made of and How risky it is: every heading sorts; Worst fall's first click shows the smaller fall first", async () => {
    mount("/my-investments?step=all"); await screen.findByText("What it is made of");
    const made = table("Asset");
    expect(within(made).getAllByRole("columnheader").every((h) => h.getAttribute("aria-sort") === "none")).toBe(true);
    const risk = table("Worst fall from a high");
    press(risk, "Worst fall from a high");
    const f = col(risk, "Worst fall from a high").map((x) => parseNumber(x)).filter((x) => x != null) as number[];
    expect(f).toEqual([...f].sort((a, b) => b - a));   // −21.7% before −43.2%
  });
  it("point 8: Your shares → 1 year, 2nd click: lowest first, a blank (—) last; sorted before Show all", () => {
    const d = D(); d.shares[2] = { ...d.shares[2], chg1y: null };
    wrap(<EquityTab d={d} />);
    const t = table("Macro sector");
    press(t, "1 year"); press(t, "1 year");
    const y = col(t, "1 year");
    expect(y.at(-1)).toBe("—");
    const n = y.slice(0, -1).map((x) => parseNumber(x)!);
    expect(n).toEqual([...n].sort((a, b) => a - b));
  });
  it("Your shares: every heading has arrows; Also inside your funds and ETFs sorts by the % and its Held by by the first chip", () => {
    const d = D();
    wrap(<EquityTab d={d} />);
    const t = table("Macro sector");
    expect(within(t).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Share", "Macro sector", "Size", "FinLit Prism", "Against peers", "1 day", "1 year", "Value", "Of everything"]);
    expect(within(t).getAllByRole("columnheader").every((h) => h.querySelector(".fl-sort-ar"))).toBe(true);
    const also = table("Held by");
    press(also, "All together");
    const a = col(also, "All together").map((x) => parseNumber(x)!);
    expect(a).toEqual([...a].sort((x, y) => y - x));
    expect(document.querySelectorAll(".fl-sortbar").length).toBe(2);
  });
  it("Your ETFs and Your funds sort the same way (Mutual Fund Score highest first)", () => {
    const d = D();
    wrap(<EtfTab d={d} />);
    let t = table("Tracks");
    press(t, "Price");
    const p = col(t, "Price").map((x) => parseNumber(x)).filter((x) => x != null) as number[];
    expect(p).toEqual([...p].sort((a, b) => b - a));
    expect(t.querySelector("tbody a")!.getAttribute("href")).toMatch(/^\/etfs\//);   // ETF links still open as before
    cleanup();
    wrap(<MfTab d={d} />);
    t = table("Mutual Fund Score");
    press(t, "Mutual Fund Score");
    const s = col(t, "Mutual Fund Score").map((x) => parseNumber(x)).filter((x) => x != null) as number[];
    expect(s).toEqual([...s].sort((a, b) => b - a));
  });
});

// Task #438 rework: the founder's signed-in check of 28 Nov 2026 found two faults (workspace task 438).
describe("rework 1: mid-list, the pinned column names sort like the heading row", () => {
  type R = { n: string; v: number | null };
  const COLS: Col<R>[] = [{ key: "n", label: "Company", text: "Company", type: "text", get: (r) => r.n }, { key: "v", label: "Value", text: "Value", type: "num", r: true, get: (r) => r.v },
    { key: "open", type: "none", label: "(Open its tab)" }];
  const ROWS: R[] = [{ n: "B", v: 2 }, { n: "A", v: null }, { n: "C", v: 9 }];
  const PIN = COLS.map((_, i) => ({ i, t: ["Company", "Value", "(Open its tab)"][i], l: i * 100, w: 100, r: i === 1 }));
  function Harness() {
    const s = useTableSort<R>("pin-test", COLS);
    return <div><PinnedSortChip s={s} /><PinnedSortCols s={s} cols={PIN} /><ol>{s.sort(ROWS).map((r) => <li key={r.n}>{r.n}</li>)}</ol></div>;
  }
  const order = () => [...document.querySelectorAll("li")].map((l) => l.textContent).join("");
  it("each pinned name is a sort button with the arrow; pressing it sorts, reverses and goes back exactly like the heading", () => {
    wrap(<Harness />);
    const group = screen.getByRole("group", { name: "Sort the table by a column" });
    const value = within(group).getByRole("button", { name: "Value" });
    expect(value.querySelector(".fl-sort-ar svg")).toBeTruthy();
    expect(within(group).queryByRole("button", { name: /Open its tab/ })).toBeNull();         // "(Open its tab)" is not a sort button there either
    fireEvent.click(value);
    expect(order()).toBe("CBA");                                                               // high to low, the blank last
    const on = within(group).getByRole("button", { name: "Value, sorted high to low" });
    expect(on.className).toContain("on");
    expect(on.style.left).toBe("100px"); expect(on.style.width).toBe("100px");                // over its own column
    fireEvent.click(on); expect(order()).toBe("BCA");                                          // reversed, the blank still last
    fireEvent.click(within(group).getByRole("button", { name: /^Value, sorted low to high/ })); expect(order()).toBe("BAC");   // FinLit's order again
  });
  it("the stuck row shows 'Sorted by …' with Reset while the line above the table has scrolled away", () => {
    wrap(<Harness />);
    expect(document.querySelector(".fl-pin-chip")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Company" }));
    expect(document.querySelector(".fl-pin-chip")!.textContent).toBe("Sorted by Company, A to ZReset");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(document.querySelector(".fl-pin-chip")).toBeNull(); expect(order()).toBe("BAC");
  });
  it("Every company passes its sort to the filter row, which uses the sort buttons when it carries the column names", () => {
    expect(readFileSync(join(__dirname, "AllTogether.tsx"), "utf8")).toMatch(/<FilterRow [^>]*sort=\{sort\} \/>/);
    const fr = readFileSync(join(__dirname, "EveryFilters.tsx"), "utf8");
    expect(fr).toMatch(/sort \? <PinnedSortCols s=\{sort\} cols=\{cols\} \/>/);
    expect(fr).toMatch(/stuck && sort && <PinnedSortChip s=\{sort\} \/>/);
  });
});

describe("rework 2: the arrows add 2px to a heading, not 18px", () => {
  const css = readFileSync(join(__dirname, "..", "styles", "sort438.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  it("a 9×12 arrow inside the heading's own end padding (10px → 12px), not after the words (it was a 12px arrow and a 6px gap)", () => {
    expect(css).toMatch(/th\.fl-sortable \.fl-sort-ar \{[^}]*width: 9px; height: 12px;/);
    expect(css).toMatch(/th\.fl-sortable \.fl-sort \{ position: relative; gap: 0; padding-inline-end: 12px; \}/);
    expect(css).toMatch(/th\.fl-sortable \.fl-sort-ar \{ position: absolute; right: 2px; top: 50%; margin-top: -6px; \}/);
    const src = readFileSync(join(__dirname, "sort438.tsx"), "utf8");
    expect(src).not.toMatch(/width="12" height="14"/);
    expect((src.match(/width="9" height="12"/g) || []).length).toBe(3);
    // the arrow (right 2px + 9px wide = 11px) fits in the 12px end padding; the heading is 12 - 10 = 2px wider than the table's 8px 10px padding
    expect(2 + 9).toBeLessThanOrEqual(12);
  });
  it("the arrows stay visible (no hover-only rule): touch screens have no hover", () => {
    expect(css).not.toMatch(/\.fl-sort-ar[^{]*\{[^}]*(display: none|visibility: hidden|opacity: 0[;\s])/);
  });
});

describe("03 no side effects", () => {
  const css = readFileSync(join(__dirname, "..", "styles", "sort438.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  it("the CSS has no tag, :root, body or html rules of its own: every selector targets only what the feature adds", () => {
    const sels = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1].trim()).filter((s) => !s.startsWith("@"))
      .flatMap((s) => s.split(",").map((x) => x.trim().replace(/^@media[^{]*\{\s*/, "")));
    expect(sels.length).toBeGreaterThan(20);
    for (const s of sels) expect(s, s).toMatch(/\.fl-|#fl-|data-fl-col|th\.fl-sortable|i\[data-tip\]/);
    expect(css).not.toMatch(/(^|[\s,}])(body|html|:root)\s*\{/);
  });
  it("only the All my investments tables use it: no other page imports the sort", () => {
    const files: string[] = [];
    const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f) && !/\.test\./.test(f)) files.push(p); } };
    walk(join(__dirname, ".."));
    const users = files.filter((f) => /from "\.\/sort438"|from "\.\.\/myinvest\/sort438"/.test(readFileSync(f, "utf8"))).map((f) => f.split("/src/")[1]).sort();
    // EveryFilters.tsx: the filter row's stuck column names over Every company are the same sort buttons (task #438 rework, 28 Nov 2026)
    expect(users).toEqual(["myinvest/AllTogether.tsx", "myinvest/EveryFilters.tsx", "myinvest/KindTabs.tsx"]);
  });
  it("row contents never change, only their order; filters' counts and the Show all button stay as before", async () => {
    const t = await everyCo(); showAll();
    const rows = () => [...t.querySelectorAll("tbody tr")].map((r) => r.innerHTML).sort();
    const before = rows();
    for (const h of ["Company", "All together", "Held", "Direct", "Through funds", "Through ETFs", "Size", "FinLit Prism", "Against peers"]) { press(t, h); expect(rows()).toEqual(before); press(t, h); expect(rows()).toEqual(before); }
  });
  it("no buy / sell wording in what the feature adds", () => {
    const src = readFileSync(join(__dirname, "sort438.tsx"), "utf8");
    const words = [...src.matchAll(/"([^"\n]*)"|`([^`\n]*)`|>([^<>{}\n]+)</g)].map((m) => m[1] ?? m[2] ?? m[3]).filter((x) => !/[()]/.test(x)).join(" | ");   // what a member reads
    expect(words).toContain("Click any heading to sort this table.");
    expect(words).not.toMatch(/\b(buy|sell|hold|accumulate|avoid|target|best)\b/i);
  });
});
