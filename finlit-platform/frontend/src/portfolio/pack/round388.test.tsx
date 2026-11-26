// @vitest-environment jsdom
// Task #388 part A (developer file 36, Equity portfolio round 2): Against their peers as one chart, things to know as a pill and a pop-up, no List average,
// "N accounts ▾", two-line group rows, the Diversification card and the whole card opening its view, the "past year" Nifty 50 lines, name casing, plan names
// from the plan list, no "click a column heading to sort" on a phone, the trend label down the side and the phone folds. Sample data only (made up).
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../components/CoLogo", () => ({ CoLogo: () => null }));
vi.mock("../../lib/auth", async (orig) => ({ ...(await orig<typeof import("../../lib/auth")>()), useAuth: () => ({ user: { id: "u-sample" }, plan: "gold", limits: null, seesAll: false }) }));
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
import type { Holding } from "../../lib/portfolio";
import type { Line, Ready } from "../../lib/portfolioOverview";
import type { LotsProps } from "../HoldingCells";
import type { Share } from "../../lib/equityPack";
import type { Card } from "../../lib/pulsePack";
import { SharesTable, accountList } from "../SharesTable";
import { ScoreCards, SixParts, type CardsInput } from "./EqTop385";
import { Step, StepCtx } from "./EqSteps385";
import { Insights, PeersSection, TrendSection } from "./EquityPack";
import { KnowPop, PEERS_FIRST, closePops, peerPos, ptsText, sortPeers } from "./Round388";
import { nameCase, shortCo } from "../shared";
import { PLAN_LIST, planName, plansFrom, plansFromText } from "../../lib/planNames";
import { TIER } from "../../lib/ui";
import { MY_PORTFOLIO_FAQ } from "../../content/myPortfolioFaqs";
import { PHONE_Q } from "../../components/PhoneFold";
import type { ScoreAnswer, Choices } from "../useScore";
import type { TrendRead } from "../../lib/mfPortfolio";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = (ui: React.ReactNode, pop = true) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><KnowPop.Provider value={pop}>{ui}</KnowPop.Provider></MemoryRouter></QueryClientProvider>);
const phone = (on: boolean) => vi.stubGlobal("matchMedia", (q: string) => ({ matches: on && q === PHONE_Q, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));

// ------------------------------------------------------------------------------------------------ sample shares (made up)
type Pk = NonNullable<Share["peer"]>;
const sh = (symbol: string, name: string, peer: Partial<Pk> | null): Share => ({ symbol, name, peer: peer ? { label: "in_line", raw: null, rank: 1, of: 5, group: "Sample group", vs: 0, bench: "NIFTY Sample", direction: null, ...peer } : null } as unknown as Share);
const S: Share[] = [
  sh("ALPHA", "Alpha Gears Ltd", { label: "leader", rank: 1, of: 24, group: "Gears", vs: 46.6, bench: "NIFTY Auto", direction: "gaining" }),
  sh("BETA", "Bank Of Samplepur Ltd", { label: "leader", rank: 5, of: 20, group: "PSU bank", vs: 12.3, bench: "peer average" }),
  sh("GAMMA", "Gamma Labs Ltd", { label: "in_line", rank: 11, of: 30, group: "Pharma", vs: -5.5, bench: "NIFTY Pharma", direction: "weakening" }),
  sh("DELTA", "Delta Power Ltd", { label: "laggard", rank: 28, of: 30, group: "Power", vs: -34.6, bench: "NIFTY Energy" }),
  sh("SOLO", "Solo Works Ltd", { label: "leader", rank: 1, of: 1, group: "Alone", vs: 3 }),
  sh("NOPE", "Nope Traders Ltd", null)];

describe("Change 1: Against their peers as one chart", () => {
  it("dot position: (N − rank) ÷ (N − 1); 1st of N at strongest, a group of one at strongest, no rank in the middle", () => {
    expect(peerPos(1, 24)).toBe(1); expect(peerPos(24, 24)).toBe(0); expect(peerPos(28, 30)).toBeCloseTo(2 / 29); expect(peerPos(1, 1)).toBe(1); expect(peerPos(null, 5)).toBe(0.5);
    expect(ptsText(46.6)).toBe("+46.6"); expect(ptsText(-5.5)).toBe("−5.5"); expect(ptsText(null)).toBe("−");
  });
  it("heading line, i holding Why it matters and the points note, the sub line; the old lead, columns and points note are gone", () => {
    wrap(<PeersSection shares={S} />);
    expect(screen.getByRole("heading", { name: /Against their peers/ })).toBeTruthy();
    expect(document.querySelector(".sp-sub")!.textContent).toBe("Each share against similar companies, over the last 12 months.");
    expect(document.querySelector(".eq-pcs")).toBeNull(); expect(document.querySelector(".eq-lead")).toBeNull(); expect(document.querySelector(".eq-ptn")).toBeNull(); expect(document.querySelector(".sp-why")).toBeNull();
    const i = document.querySelector("#eq-peers .sp-i") as HTMLButtonElement; fireEvent.click(i);
    expect(document.body.textContent).toContain("Why it matters:"); expect(document.body.textContent).toContain("Points are percentage points");
  });
  it("count bar Lead · In line · Lag · Not compared adds up to the list; each colour filters (aria-pressed, others dim) and pressing again shows all", () => {
    wrap(<PeersSection shares={S} />);
    const segs = [...document.querySelectorAll(".eq8p-seg")].map((x) => x.textContent);
    expect(segs).toEqual(["3 Lead", "1 In line", "1 Lag", "1 Not compared"]);
    const lead = screen.getByRole("button", { name: "3 Lead" });
    fireEvent.click(lead);
    expect(lead.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".eq8p-seg.mid")!.className).toContain("dim");
    expect([...document.querySelectorAll(".eq8p-gh b")].map((b) => b.textContent)).toEqual(["Leaders"]);
    fireEvent.click(lead);
    expect([...document.querySelectorAll(".eq8p-gh b")].map((b) => b.textContent)).toEqual(["Leaders", "In line", "Laggards"]);
  });
  it("rows: name and peer group, rank 'x of N' on the track, signed points and 'vs …', Lately arrows; strongest first inside each group", () => {
    wrap(<PeersSection shares={S} />);
    const rows = [...document.querySelectorAll(".eq8p-g.good .eq8p-r")];
    expect(rows.map((r) => r.querySelector(".eq8p-n a")!.textContent)).toEqual(["Alpha Gears", "Solo Works", "Bank of Samplepur"]);
    expect(rows[0].querySelector(".eq8p-k small")!.textContent).toBe("1 of 24");
    expect((rows[0].querySelector(".eq8p-trk i") as HTMLElement).style.left).toBe("100%");
    expect(rows[0].querySelector(".eq8p-pt")!.textContent).toBe("+46.6vs Nifty Auto");
    expect(rows[2].querySelector(".eq8p-pt small")!.textContent).toBe("vs peer average");
    expect(rows[0].querySelector(".eq8p-lt")!.textContent).toContain("↗");
    expect(document.querySelector(".eq8p-g.mid .eq8p-lt")!.textContent).toContain("↘");
    expect(document.querySelector(".eq8p-g.bad .eq8p-pt")!.className).toContain("dn");
  });
  it("find matches the name, the peer group and the index; nothing left says so", () => {
    wrap(<PeersSection shares={S} />);
    const q = screen.getByRole("searchbox", { name: "Find a share or peer group" });
    fireEvent.change(q, { target: { value: "bank" } });
    expect([...document.querySelectorAll(".eq8p-n a")].map((a) => a.textContent)).toEqual(["Bank of Samplepur"]);
    fireEvent.change(q, { target: { value: "energy" } });
    expect([...document.querySelectorAll(".eq8p-n a")].map((a) => a.textContent)).toEqual(["Delta Power"]);
    fireEvent.change(q, { target: { value: "zzz" } });
    expect(screen.getByText("No share in this list matches.")).toBeTruthy();
  });
  it("every heading sorts inside each group: Share A to Z, Rank strongest first, Points most ahead; again reverses; aria-sort and the arrow follow", () => {
    wrap(<PeersSection shares={S} />);
    const names = () => [...document.querySelectorAll(".eq8p-g.good .eq8p-n a")].map((a) => a.textContent);
    const h = (n: RegExp) => screen.getByRole("button", { name: n });
    expect(h(/^Rank in its peer group/).closest("[role=columnheader]")!.getAttribute("aria-sort")).toBe("descending");
    fireEvent.click(h(/^Share and peer group/)); expect(names()).toEqual(["Alpha Gears", "Bank of Samplepur", "Solo Works"]);
    expect(h(/^Share and peer group/).closest("[role=columnheader]")!.getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(h(/^Share and peer group/)); expect(names()).toEqual(["Solo Works", "Bank of Samplepur", "Alpha Gears"]);
    fireEvent.click(h(/^Points ahead or behind/)); expect(names()).toEqual(["Alpha Gears", "Bank of Samplepur", "Solo Works"]);
    expect(h(/^Points ahead or behind/).textContent).toContain("↓");
    fireEvent.click(h(/^Points ahead or behind/)); expect(names()).toEqual(["Solo Works", "Bank of Samplepur", "Alpha Gears"]); expect(h(/^Points ahead or behind/).textContent).toContain("↑");
    // the phone's Sort menu
    fireEvent.change(screen.getByRole("combobox", { name: "Sort the shares" }), { target: { value: "n" } }); expect(names()).toEqual(["Alpha Gears", "Bank of Samplepur", "Solo Works"]);
    expect(sortPeers(S.filter((s) => s.peer?.label === "leader"), "pos", -1).map((s) => s.symbol)).toEqual(["ALPHA", "SOLO", "BETA"]);
  });
  it("above 12 compared shares each group shows its first 5 and Show all N ▾ / Show fewer ▴; a filter or a search shows every match; the hint says so", () => {
    const many = Array.from({ length: 30 }, (_, i) => sh("S" + i, `Sample ${String(i).padStart(2, "0")} Ltd`, { label: i < 10 ? "leader" : i < 25 ? "in_line" : "laggard", rank: i + 1, of: 40, vs: i }));
    wrap(<PeersSection shares={many} />);
    expect(screen.getByText(`Top ${PEERS_FIRST} in each group shown · tap a colour for one group`)).toBeTruthy();
    expect(document.querySelectorAll(".eq8p-g.good .eq8p-r")).toHaveLength(5); expect(document.querySelectorAll(".eq8p-g.mid .eq8p-r")).toHaveLength(5); expect(document.querySelectorAll(".eq8p-g.bad .eq8p-r")).toHaveLength(5);
    const more = screen.getByRole("button", { name: "Show all 10 ▾" }); fireEvent.click(more);
    expect(document.querySelectorAll(".eq8p-g.good .eq8p-r")).toHaveLength(10); expect(screen.getByRole("button", { name: "Show fewer ▴" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "15 In line" })); expect(document.querySelectorAll(".eq8p-g.mid .eq8p-r")).toHaveLength(15);
  });
  it("pinned headings: the heading row and the group labels stick under the section bar, and the frame clips with overflow: clip, not hidden", () => {
    const css = readFileSync(join(__dirname, "round388.css"), "utf8");
    expect(css).toMatch(/\.eq8p-tab \{[^}]*overflow: clip/);
    expect(css).toMatch(/\.eq8p-rh \{[^}]*position: sticky; top: var\(--eq-bar-b/);
    expect(css).toMatch(/\.eq8p-gh \{[^}]*position: sticky; top: calc\(var\(--eq-bar-b[^)]*\) \+ var\(--eq8p-hh/);
    expect(css).toMatch(/\.eq \.pfx-tools\.pfh \{ top: var\(--eq-bar-b/);   // F1: the tools row too
  });
  it("the Watchlists page (voice list) keeps its three columns", () => {
    wrap(<PeersSection shares={S} voice="list" />, false);
    expect(document.querySelector(".eq-pcs")).toBeTruthy(); expect(document.querySelector(".eq8p")).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------ things to know
const CARDS: Card[] = [{ kind: "good", title: "Two rise on both", text: "Sample text one." }, { kind: "watch", title: "One trails", text: "Sample text two." }, { kind: "insight", title: "A plain note", text: "Sample text three." }];
describe("Change 3: things to know leave the page, a pill and a pop-up", () => {
  it("the pill sits in the section's heading row: one dot per note by kind, '3 things to know'; no box on the page", () => {
    wrap(<section className="sp-sec"><div className="sp-sec-h"><div><h2>Sample section</h2></div></div><p>Body</p><Insights items={CARDS} scope="t.a" /></section>);
    const b = screen.getByRole("button", { name: "3 things to know" });
    expect(b.parentElement!.className).toBe("sp-sec-h");
    expect([...b.querySelectorAll(".eq8k-dots i")].map((i) => i.className)).toEqual(["g", "w", "n"]);
    expect(b.getAttribute("aria-expanded")).toBe("false"); expect(document.querySelector(".eq-ins-h")).toBeNull();
  });
  it("one note reads '1 thing to know'", () => {
    wrap(<section><div className="sp-sec-h" /><Insights items={CARDS.slice(0, 1)} scope="t.b" /></section>);
    expect(screen.getByRole("button", { name: "1 thing to know" })).toBeTruthy();
  });
  it("the pop-up: role dialog, the caption as title, Open all and ×; closes on ×, Esc, a tap outside and a change of view; one open at a time", () => {
    wrap(<><section><div className="sp-sec-h" /><Insights items={CARDS} scope="t.c" /></section><section><div className="sp-sec-h" /><Insights items={CARDS.slice(0, 2)} scope="t.d" /></section><p>outside</p></>);
    const a = screen.getByRole("button", { name: "3 things to know" }), b = screen.getByRole("button", { name: "2 things to know" });
    fireEvent.click(a);
    const d = screen.getByRole("dialog", { name: "Three things to know" });
    expect(a.getAttribute("aria-expanded")).toBe("true");
    expect(d.textContent).toContain("Two rise on both"); expect(screen.getByRole("button", { name: "Open all" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open all" })); expect(d.querySelectorAll(".dsh-ic.open")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Close" })); expect(screen.queryByRole("dialog")).toBeNull(); expect(a.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(a); fireEvent.keyDown(document, { key: "Escape" }); expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(a); fireEvent.mouseDown(screen.getByText("outside")); expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(a); fireEvent.click(b);
    expect(screen.getAllByRole("dialog")).toHaveLength(1); expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Two things to know");
    act(() => closePops()); expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("outside the Equity portfolio (MF and ETF pages) the box stays as it was", () => {
    wrap(<Insights items={CARDS} scope="t.e" />, false);
    expect(document.querySelector(".eq-ins-h")!.textContent).toContain("three things to know"); expect(document.querySelector(".eq8k-btn")).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------ change 2: the trend label down the side
describe("Change 2: Long-term trend down the left side", () => {
  it("the label, its arrow and its i sit in the side cell; the CSS turns it to run top to bottom beside the rows", () => {
    const cell = { n: 1, share: 1, name: "Rising", symbols: ["ALPHA"] };
    const t = { rated: 1, n: 1, grid: { "1,1": cell }, business: { strong_up: { n: 0, share: 0, symbols: [] }, strong_down: { n: 0, share: 0, symbols: [] }, weak_up: { n: 0, share: 0, symbols: [] }, weak_down: { n: 0, share: 0, symbols: [] } }, between: 0, direction: { improving: 0, weakening: 0, steady: 1 }, breadth: { up: 1, down: 0 }, coverage: 1, average: null, words: { longTerm: "", shortAgainstLong: "", businessAndPrice: "" } } as unknown as TrendRead;
    wrap(<TrendSection t={t} shares={S} />);
    const y = document.querySelector(".eq-tm-y")!;
    expect(y.textContent).toMatch(/^Long-term trend ↓/); expect(y.querySelector(".sp-i")).toBeTruthy();
    expect(document.querySelector(".eq-tm-x")!.textContent).toMatch(/^Short-term trend →/);
    const css = readFileSync(join(__dirname, "round388.css"), "utf8");
    expect(css).toMatch(/\.eq \.eq-tm > \.eq-tm-y \{[^}]*grid-column: 1; grid-row: 2;[^}]*writing-mode: vertical-rl/);
  });
});

// ------------------------------------------------------------------------------------------------ the shares table
const H: Holding[] = [
  { id: "1", symbol: "AAA", pf: "main", date: "2025-01-02", qty: 30, price: 100, owned: true }, { id: "2", symbol: "AAA", pf: "acc2", date: "2025-02-02", qty: 20, price: 110, owned: true },
  { id: "5", symbol: "AAA", pf: "acc3", date: "2025-02-09", qty: 15, price: 105, owned: true },
  { id: "3", symbol: "BBB", pf: "main", date: "2025-01-05", qty: 10, price: 500, owned: true }, { id: "4", symbol: "CCC", pf: "acc2", date: "2025-03-05", qty: 5, price: 900, owned: true }];
const PX: Record<string, number> = { AAA: 120, BBB: 450, CCC: 1000 };
const fig = (v: number) => ({ value: v });
const ready = (symbol: string, ind: string, cap: number): Ready => ({ symbol, status: "ready", name: { AAA: "Alpha Gears Ltd", BBB: "Bank Of Samplepur Ltd", CCC: "Gamma Labs Ltd" }[symbol] ?? symbol, sector: ind, industry: ind, isBank: false, basis: "consolidated",
  reportAt: null, price: PX[symbol], changePct: 1.2, priceAsOf: "2026-11-23", marketCapCr: cap, ratios: { pe: fig(1), pb: fig(1), roe: fig(1), dividend_yield: fig(1), debt_to_equity: fig(1) },
  financials: { year: { available: true, period: "FY26", periodEnd: "2026-03-31" }, quarter: { available: true, period: "Q2", periodEnd: "2026-09-30" } },
  prism: { state: "rated", final: 60, label: "AVERAGE", status: "RATED", parts: { fundamental: 60, valuation: 40, quality: 60, risk: 40 }, shortTerm: { score: 30, word: "x" }, longTerm: { score: 40, word: "y" }, at: null, reason: null } } as unknown as Ready);
const LINES: Line[] = [{ symbol: "AAA", name: "Alpha Gears Ltd", ov: ready("AAA", "Banks", 90000) }, { symbol: "BBB", name: "Bank Of Samplepur Ltd", ov: ready("BBB", "Banks", 30000) }, { symbol: "CCC", name: "Gamma Labs Ltd", ov: ready("CCC", "Pharma", 4000) }];
const NAMES: Record<string, string> = { main: "Main account", acc2: "Second broker", acc3: "Third broker" };
const lots = (cur = "all", n = 3): LotsProps => ({ holdings: H, cur, pfName: (id) => NAMES[id] ?? id, nPortfolios: n, priceOf: (s) => PX[s], changeOf: () => 1,
  add: vi.fn(), edit: vi.fn(), remove: vi.fn(), goTo: "main", open: new Set(), onOpen: vi.fn(), focus: null });
const PAGE = { order: ["AAA", "BBB", "CCC"], corr: [[1, 0.43, 0.1], [0.43, 1, 0.2], [0.1, 0.2, 1]], short_history: [] } as never;
const table = (tab: "overview" | "sector" | "size" = "overview", l = lots()) => wrap(<SharesTable lots={l} editSell={{ onEdit: () => {}, onSell: () => {} }} lines={LINES} meta={{}} page={PAGE} mode="eq" colors={{}} model="prism" tab={tab} period="year" limit={50}
  state="ready" onTab={() => {}} onPeriod={() => {}} actions={() => null} qtyOf={() => null} onQty={() => {}} peerOf={(s) => S.find((x) => x.symbol === s)} day="Monday" />);

describe("Your shares: changes 4, 5 and 6, part B items 4 and 9", () => {
  it("change 4: no List average row; the Total row stays", () => {
    table();
    expect(document.body.textContent).not.toContain("List average"); expect(document.querySelector("tr.pfx-avg")).toBeNull();
    expect(document.querySelector("tfoot")!.textContent).toMatch(/^Total/);
  });
  it("change 5: '3 accounts ▾' under a share in three accounts opens By account (name and quantity, adding up to the share's quantity); one account shows nothing", () => {
    table();
    const b = screen.getByRole("button", { name: "3 accounts" });
    expect(document.querySelector('tr[data-sym="BBB"] .eq8a-btn')).toBeNull(); expect(document.querySelector(".pfs-acc")).toBeNull();
    fireEvent.click(b);
    const d = screen.getByRole("dialog", { name: "By account" });
    const rows = [...d.querySelectorAll("li")].map((li) => [li.querySelector("span")!.textContent, Number(li.querySelector("b")!.textContent)]);
    expect(rows).toEqual([["Main account", 30], ["Second broker", 20], ["Third broker", 15]]);
    expect(rows.reduce((a, r) => a + (r[1] as number), 0)).toBe(65);
    fireEvent.keyDown(document, { key: "Escape" }); expect(screen.queryByRole("dialog")).toBeNull();
    expect(accountList(lots("main"), "AAA")).toEqual([]);   // one account open: nothing to split
  });
  it("change 6: group rows are two lines: the name (full name on hover), then 'N shares · ▬ x% of money'; moving together in the tooltip only", () => {
    table("sector");
    const r = [...document.querySelectorAll("tr.eqs-sub")].find((x) => /2 shares/.test(x.textContent ?? ""))!;
    const btn = r.querySelector("td.pfx-name > button") as HTMLButtonElement;
    expect(btn.querySelector(":scope > b")!.textContent).toBe("Financial Services");
    expect(btn.querySelector(".m")!.textContent).toBe("71.1% of money");   // AAA 65 × 120 = 7,800 and BBB 10 × 450 = 4,500 of 17,300
    expect((btn.querySelector(".eq8-gbar b") as HTMLElement).style.width).toMatch(/^71\.0\d+%$/);
    expect(r.textContent).not.toMatch(/of 3 shares|move together/);
    expect(btn.title).toBe("Financial Services · Moves together partly (0.43)");
    expect(r.querySelector(".eqs-subbar")).toBeNull();
  });
  it("B9: 'Of', 'And' and 'The' inside a name are lower case unless they come first, in the table's full name too", () => {
    expect(nameCase("Bank Of Samplepur Ltd")).toBe("Bank of Samplepur Ltd"); expect(nameCase("The Sample Bank")).toBe("The Sample Bank");
    expect(nameCase("Bank Of The Sample And Trust")).toBe("Bank of the Sample and Trust"); expect(shortCo("Bank Of Samplepur Ltd")).toBe("Bank of Samplepur");
    expect(shortCo("The Sample And Trust Company")).toBe("The Sample and Trust");
    table();
    expect(document.querySelector('tr[data-sym="BBB"] .pfs-full')!.textContent).toBe("Bank of Samplepur Ltd");
  });
  it("B4: 'click a column heading to sort' sits in a part the phone hides", () => {
    table();
    const sub = document.querySelector("#pf-shares .sp-sub")!;
    expect(sub.textContent).toBe("3 shares · up to 50 on your plan · click a column heading to sort");
    expect(sub.querySelector(".eq8-desk")!.textContent).toBe(" · click a column heading to sort");
    expect(readFileSync(join(__dirname, "round388.css"), "utf8")).toMatch(/@media \(max-width: 760px\) \{ \.eq \.eq8-desk \{ display: none; \} \}/);
  });
});

// ------------------------------------------------------------------------------------------------ the cards (change 7), the Nifty 50 windows (B7)
const CARD_IN: CardsInput = { locked: false, score: { total: 61, band: "Average" }, strength: { avg: 64, word: "Average", byValue: true, counts: [["Strong", 1], ["Average", 2]] },
  spread: { score: 58, word: "Fairly spread", byCount: 63 }, risk: { beta: 1.08, swing: 21.2, swingIndex: 14.3, bench: "NIFTY 50", byValue: true, to: "2026-11-20" } };
describe("Change 7 and part B item 7: the view cards", () => {
  it("the second card is called Diversification; the whole card opens its view, its i keeps its own action", () => {
    const onView = vi.fn();
    wrap(<ScoreCards c={CARD_IN} view="portfolio" onView={onView} sixOpen={false} onSix={() => {}} />);
    const ks = [...document.querySelectorAll(".eqc-v .eqc-k")].map((k) => k.textContent);
    expect(ks[1]).toMatch(/^Diversification/); expect(document.body.textContent).not.toMatch(/\bSpread\b(?! )/);
    const div = document.querySelectorAll(".eqc-v")[1] as HTMLElement;
    fireEvent.click(div.querySelector(".eqc-x")!); expect(onView).toHaveBeenLastCalledWith("diversification");
    onView.mockClear(); fireEvent.click(div.querySelector(".sp-i")!); expect(onView).not.toHaveBeenCalled();
    fireEvent.click(document.querySelectorAll(".eqc-v")[0].querySelector(".eqc-x")!); expect(onView).not.toHaveBeenCalled();   // "You are here"
    fireEvent.click(screen.getByRole("button", { name: "Open the Risk view" })); expect(onView).toHaveBeenLastCalledWith("risk");
  });
  it("B7: the Risk card says 'past year of weekly closes to …'; the six parts' risk row starts 'Past year:'", () => {
    wrap(<ScoreCards c={CARD_IN} view="portfolio" onView={() => {}} sixOpen={false} onSix={() => {}} />);
    expect(document.querySelectorAll(".eqc-v")[2].textContent).toContain("Typical swing in a year, by what you hold now · past year of weekly closes to 20 Nov");
    cleanup();
    const R = { strength: { figure: 60, word: "Average", scoredShare: 1 }, spread: { figure: 58, word: "Fairly spread" }, risk: { beta: 1.08, swing: 21.2, swingIndex: 14.3, worstFall: -19, worstFallIndex: -14.8, word: "Above", against: null, benchmark: "NIFTY 50" },
      trend: { word: "Rising", upShare: 0.5, downShare: 0.2, term: "long" }, valuation: { word: "Fair" }, concentration: { word: "Low", largest: 0.2, largestName: "ALPHA", topFive: 0.8 } };
    const s = { total: 61, of: 3, basis: "value", readings: R } as unknown as ScoreAnswer;
    wrap(<SixParts s={s} choices={{ horizon: "3-5", risk: "medium", goal: "grow", benchmark: "NIFTY 50" } as unknown as Choices} onChoices={() => {}} nameOf={(x) => x} open />);
    expect(document.body.textContent).toContain("Past year: moves 1.08× as much as the Nifty 50 · swing 21.2% a year vs 14.3% · worst fall −19.0% vs −14.8%");
  });
});

// ------------------------------------------------------------------------------------------------ part B item 2: plan names from the plan list
describe("Part B item 2: plan names come from the plan list", () => {
  it("one list: Basic, Silver, Gold; the lock card's TIER names and the Questions answer read it", () => {
    expect(PLAN_LIST.map((p) => p.name)).toEqual(["Basic", "Silver", "Gold"]);
    expect(planName("silver")).toBe("Silver"); expect(plansFrom("silver")).toEqual(["Silver", "Gold"]); expect(plansFromText("silver")).toBe("Silver and Gold"); expect(plansFromText("gold")).toBe("Gold");
    expect(TIER.silver.n).toBe(planName("silver")); expect(TIER.gold.n).toBe(planName("gold"));
    const a = MY_PORTFOLIO_FAQ.items.find((x) => /broker/.test(x.q))!.a;
    expect(a).toContain(`on ${plansFromText("silver")} they are also saved`);
  });
  it("no fixed plan name is left in the lock card, the Gold locks or the Questions source", () => {
    const src = (f: string) => readFileSync(join(__dirname, f), "utf8");
    expect(src("../../content/myPortfolioFaqs.ts")).not.toMatch(/on Silver and Gold/);
    expect(src("./EquityPack.tsx")).not.toMatch(/Available on Gold\.|>Gold and up</);
    expect(src("../../pages/Holdings.tsx")).not.toMatch(/"Gold and up"|share you own \(Gold\)/);
  });
});

// ------------------------------------------------------------------------------------------------ part B item 10: the phone folds in All sections
describe("Part B item 10: on a phone, All sections folds every step after the first", () => {
  it("first step open; the others fold to heading, one line and Open ▾; tapping opens with Close ▴; on a laptop nothing folds", () => {
    phone(true);
    wrap(<StepCtx.Provider value={{ step: "all", firstStep: "a" }}><Step id="a" title="First" line="one"><p>First body</p></Step><Step id="b" title="Second" line="2 of 5 lead their peers"><p>Second body</p></Step></StepCtx.Provider>);
    expect(screen.getByText("First body")).toBeTruthy();
    const sum = screen.getByRole("button", { name: /2 of 5 lead their peers/ });
    expect(sum.textContent).toContain("Open ▾"); expect(screen.getByRole("heading", { name: "Second" })).toBeTruthy();
    expect((screen.getByText("Second body").closest("[hidden]"))).toBeTruthy();
    fireEvent.click(sum); expect(screen.getByRole("button", { name: /Close/ }).textContent).toBe("Close ▴");
    cleanup(); phone(false);
    wrap(<StepCtx.Provider value={{ step: "all", firstStep: "a" }}><Step id="b" title="Second" line="x"><p>Second body</p></Step></StepCtx.Provider>);
    expect(document.querySelector(".eqf")).toBeNull();
  });
});

// Audit of 26 Nov (file 38, Your shares in every column set): the Against peers line runs through the group rows (By sector, By company size) and the
// heading labels stay on two lines
describe("audit of 26 Nov: Your shares in By sector and By company size", () => {
  for (const tab of ["sector", "size"] as const) it(`${tab}: the group row has the Against peers line under its heading; long labels are two set lines`, () => {
    table(tab);
    const t = document.querySelector("#pf-shares table") as HTMLTableElement;
    let col = 0, at = -1; for (const c of Array.from(t.tHead!.rows[0].cells)) { if (/Against peers/.test(c.textContent ?? "")) at = col; col += c.colSpan; }
    expect(at).toBeGreaterThan(0);
    const sub = t.querySelector("tr.eqs-sub")!; let k = 0; const cell = Array.from(sub.children).find((c) => { const hit = k === at; k += (c as HTMLTableCellElement).colSpan; return hit; })!;
    expect(cell.classList.contains("eq-div2")).toBe(true);
    const avg = Array.from(t.tHead!.rows[1].cells).find((c) => /^Avg buy/.test(c.textContent ?? ""))!;
    expect(avg.querySelector(".pfx-l2")!.innerHTML).toBe("Avg buy <br>price");
  });
});
