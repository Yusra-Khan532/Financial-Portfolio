// @vitest-environment jsdom
// Task #389 reopened (developer file 40 v4, 25 Nov, MF portfolio): A1 "Where your gain or loss came from" leaves the page and the Your funds step; A2 Key
// figures closed on every visit, open for the visit once opened; M2 every column group of the funds table has its line; M5 the heading pins under the
// LOWEST bar and again when a bar changes state (shared HScroll; the Equity tools row keeps its line); D1 the page has the Equity width (pfx); D2 and the
// with-funds spacing (18 / 28 / 12); D3 and E1 the shared page bottom inside the page column. Figures are made-up sample funds.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Holding, Line, MfPortfolio } from "../lib/mfPortfolio";

const st = vi.hoisted(() => ({ data: null as unknown, phone: false }));
vi.mock("../lib/mfPortfolio", async (orig) => ({
  ...(await orig<typeof import("../lib/mfPortfolio")>()),
  useMfSpread: () => ({ data: undefined, isPending: false, isError: false, error: null }),
  useMfPortfolio: () => ({ data: st.data, isPending: false, isError: false, error: null, refetch: () => {} }),
  useMfWrites: () => new Proxy({}, { get: () => ({ mutateAsync: vi.fn(), isPending: false }) }),
}));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()),
  apiGet: vi.fn(async (p: string) => (p.endsWith("/book") ? { portfolios: [{ id: "groww", name: "Groww", broker: "Groww" }] } : Promise.reject(Object.assign(new Error("not stood in"), { status: 503 })))),
  apiSend: vi.fn(async () => ({ status: "saved", previous: null })) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn(), plan: "gold", upgrade: vi.fn(), has: () => true }), TIER: { basic: { n: "Basic", ic: "sprout", tc: "--t-basic" }, silver: { n: "Silver", ic: "medal", tc: "--t-silver" }, gold: { n: "Gold", ic: "crown", tc: "--t-gold" } } }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: { id: 1 } }) }));
import { MfPortfolioPage } from "./MfPortfolio";
import { mfSteps, stepFromParam } from "../lib/mfTop";
import { KeyFigsBox } from "../portfolio/kit/KeyFigsBox";
import { VisitFolds } from "../portfolio/shared";
import { HScroll, pinLine, watchBars } from "../components/HScroll";
import { PageFaqs } from "../components/PageFaqs";
import type { KfCard } from "../portfolio/kit/keyFigs";

const src = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const css = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, "");
const ln = (id: string, units: number, nav: number, pf: string): Line => ({ id, units, invested: Math.round(units * nav * 100) / 100, boughtOn: "2024-08-12", pf, side: "buy" });
const sc = (final: number) => ({ locked: false, final, label: "AVERAGE", status: "RATED", reason: null, runDate: null, inherited: null,
  parts: { performance: 55, risk: 50, cost: 60, quality: 70 }, words: { performance: "Fair", risk: "Fair", cost: "Fair", quality: "Strong" } });
const H = (id: string, name: string, nav: number, lines: Line[]): Holding => ({
  id, code: 100 + id.length, folio: "", units: 10, lots: [], lines, name, amc: "A", plan: "Direct", option: "Growth", category: "Equity Scheme - Flexi Cap Fund", categoryLabel: "Flexi Cap", active: true,
  nav, navDate: "2026-11-24", navStale: false, navNote: null, invested: null, investedWhy: null, current: 1000, currentWhy: null, gain: null, gainPct: null, gainWhy: null, xirr: null, xirrWhy: null,
  xirrKind: "cagr", returns: { r1y: 5, r3y: null, r5y: null, asOf: null, why: null }, ter: 0.5, terDate: null, terWhy: null, aum: 100, aumAsOf: null, aumWhy: null, weight: 50, weightWhy: null,
  score: sc(60) as unknown as Holding["score"],
});
const FUNDS = [H("aaa", "Sample Flexi Cap Fund", 94.93, [ln("p1", 320, 78.2, "groww")]), H("bbb", "Sample Midcap Fund", 144.19, [ln("a1", 180, 152.8, "groww")])];
const summary = (n: number) => ({ funds: n, valued: n, withCost: n, gainFunds: n, invested: null, current: null, gain: null, gainPct: null, navFrom: null, navTo: null, notes: [], xirr: null, xirrFunds: 0, xirrWhy: null, score: { locked: false, value: 59, label: "AVERAGE", why: null } });
const DATA = (hs: Holding[]) => ({ plan: "gold", scoreLocked: false, limit: 500, count: hs.length, dataDate: "2026-11-24", holdings: hs, sold: [], summary: summary(hs.length),
  allocation: { byCategory: [], byAmc: [] }, concentration: { level: null, text: "", top1Pct: null, top3Pct: null }, disclaimer: "", scoreDisclaimer: "" }) as unknown as MfPortfolio;

beforeEach(() => {
  st.data = DATA(FUNDS); st.phone = false;
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: st.phone ? /max-width/.test(q) : /min-width/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
const show = async (url = "/mf-portfolio", empty = false) => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[url]}><MfPortfolioPage /></MemoryRouter></QueryClientProvider>);
  await waitFor(() => expect(document.querySelector(empty ? ".mfp-empty" : ".px-strip")).toBeTruthy());
};

describe("A1: Where your gain or loss came from leaves the MF page", () => {
  it("no section on the page, in any step", async () => {
    await show("/mf-portfolio?step=all");
    expect(document.getElementById("mfp-gl")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Where your gain or loss came from/);
  });
  it("the Your funds step lists no mfp-gl or eq-gl and still lands on the funds table", async () => {
    const funds = mfSteps("funds");
    expect(funds[0]).toEqual({ id: "mfp-funds", label: "Your funds", secs: ["mfp-funds", "mfp-kf-funds", "mfp-sold"] });
    expect(JSON.stringify(funds)).not.toMatch(/mfp-gl|eq-gl/);
    expect(stepFromParam(funds, "gl")).toBe("mfp-funds");   // an old address with the section's step opens Your funds
    await show("/mf-portfolio?step=funds");
    expect(document.querySelector("#mfp-funds")).toBeTruthy();
    expect(document.querySelector(".mff-t")).toBeTruthy();
  });
  it("no dead code is left on the page; the ETF page dropped it too (task #390, file 39 v4 A1)", () => {
    const page = src("pages/MfPortfolio.tsx");
    expect(page).not.toMatch(/GainLossSection|glRows|codeOfKey|GLRow|holdingFigs/);
    expect(src("pages/EtfPortfolio.tsx")).not.toMatch(/GainLossSection|etp-gl|glRows/);
  });
});

describe("A2: Key figures closed on every visit, open for the visit once opened", () => {
  const cards: KfCard[] = [{ id: "a", tone: "info", k: "Stocks underneath", lead: "120 stocks.", rest: " Some sit in two funds.", go: { kind: "jump", arg: "mfp-biggest", label: "See the biggest" } } as unknown as KfCard];
  const box = (k = 0) => <KeyFigsBox key={k} id="mfp-kf-mix" sub="What sits inside." cards={cards} onGo={() => {}} visit />;
  it("arrives closed with the page's Show ▾, even after an old Hide choice of 'shown' in this browser", () => {
    localStorage.setItem("finlit.hide.pack.mfp-kf-mix", "0");
    render(<VisitFolds>{box()}</VisitFolds>);
    expect(screen.getByRole("button", { name: "Show: Key figures" }).textContent).toBe("Show ▾");
    expect(document.querySelector(".ptk-hz")).toBeTruthy();
    expect(screen.queryByText("Stocks underneath")).toBeNull();
  });
  it("once opened it stays open when the view is drawn again, for this visit only; nothing is kept in the browser", () => {
    const { rerender, unmount } = render(<VisitFolds>{box(1)}</VisitFolds>);
    fireEvent.click(screen.getByRole("button", { name: "Show: Key figures" }));
    expect(screen.getByText("Stocks underneath")).toBeTruthy();
    rerender(<VisitFolds>{box(2)}</VisitFolds>);                       // the view drawn again (a new KeyFigsBox) in the same visit
    expect(screen.getByText("Stocks underneath")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide: Key figures" })).toBeTruthy();
    expect(localStorage.getItem("finlit.hide.pack.mfp-kf-mix")).toBeNull();
    unmount();
    render(<VisitFolds>{box(3)}</VisitFolds>);                         // a new visit
    expect(screen.queryByText("Stocks underneath")).toBeNull();
  });
  it("the page wraps itself in VisitFolds and every view's Key figures passes `visit`; the ETF page does the same (task #390, file 39 v4 A2)", () => {
    const page = src("pages/MfPortfolio.tsx");
    expect(page).toMatch(/<KnowPop\.Provider value=\{true\}><VisitFolds><div className="wrap ipo mp sp mfp pfx">/);
    expect(page).toMatch(/<KeyFigsBox id=\{`mfp-kf-\$\{v\}`\}[^\n]*onGo=\{onGo\} visit \/>/);
    expect(src("pages/EtfPortfolio.tsx")).toMatch(/KeyFigsBox[^\n]* visit \/>/);
  });
});

describe("M2: every column group of the funds table has its line", () => {
  it("Mutual Fund Score and Score carry mff-div on the group heading, the column heading and the body column, as Score parts does", async () => {
    await show();
    const t = document.querySelector(".mff-t")!;
    const groups = [...t.querySelectorAll("thead tr.mff-groups th")];
    for (const name of ["Mutual Fund Score", "Score parts", "Score"]) {
      const g = groups.find((x) => x.textContent === name || x.textContent!.startsWith(name + "About") || (name === "Score parts" && x.textContent!.startsWith("Score parts")))!;
      expect(g, name).toBeTruthy();
      expect(g.className, name).toMatch(/mff-div/);
      // the column under the group's left edge, in the column heading row and the first body row
      let col = 0; for (const x of groups) { if (x === g) break; col += (x as HTMLTableCellElement).colSpan; }
      const at = (row: HTMLTableRowElement) => { let k = 0; for (const c of row.cells) { if (k === col) return c; k += c.colSpan; } return null; };
      expect(at(t.querySelector("thead tr:last-child") as HTMLTableRowElement)!.className, name + " heading").toMatch(/mff-div/);
      expect(at(t.querySelector("tbody tr") as HTMLTableRowElement)!.className, name + " body").toMatch(/mff-div/);
    }
    expect(groups.filter((g) => g.textContent!.trim() && !/x-g/.test(g.className)).every((g) => /mff-div/.test(g.className))).toBe(true);
  });
  it("the table without units (no money groups) has the same lines", () => {
    const f = src("mf/pack/MfFunds.tsx");
    expect(f).toContain('{th(cols[3], "mff-sc mff-div")}');
    expect(f).toContain('{th(cols[8], "mff-div")}');
    expect(f).toContain('<th className="mff-gh mff-div">Mutual Fund Score</th>');
    expect(f).toContain('<th className="mff-gh mff-div">Score</th>');
  });
});

describe("M5: the heading pins under the LOWEST visible bar, and again when a bar changes state", () => {
  const rect = (top: number, bottom: number) => ({ top, bottom, height: bottom - top, left: 0, right: 500, width: 500, x: 0, y: top, toJSON() {} }) as DOMRect;
  const bar = (cls: string, top: number, bottom: number) => { const el = document.createElement("div"); el.className = cls; el.getBoundingClientRect = () => rect(top, bottom); document.body.appendChild(el); return el; };
  afterEach(() => { document.body.innerHTML = ""; });
  it("the MF / ETF bars: the filter row (126) below the section bar (122) wins, whatever their order in the page", () => {
    bar("ptk-bar", 70, 122); bar("ptk-frow stuck", 74, 126);
    expect(pinLine(".ptk-frow.stuck, .ptk-bar:not(.away)")).toBe(126);
    document.body.innerHTML = "";
    bar("ptk-frow stuck", 74, 126); bar("ptk-bar", 70, 122);
    expect(pinLine(".ptk-frow.stuck, .ptk-bar:not(.away)")).toBe(126);
  });
  it("a bar that is away, hidden, empty or scrolled off counts for nothing", () => {
    bar("ptk-bar away", -80, -20); bar("ptk-frow", 0, 0);
    const hid = bar("ptk-frow stuck", 74, 126); hid.style.visibility = "hidden";
    expect(pinLine(".ptk-frow.stuck, .ptk-bar:not(.away)")).toBe(0);
  });
  it("Equity: one bar (the tools row) gives the same line as before (its bottom)", () => {
    bar("pfx-tools pfh", 120, 177);
    expect(pinLine(".pfx-tools.pfh")).toBe(177);
    expect(pinLine(".nothing-here")).toBe(0);
  });
  it("watchBars re-pins when a bar's class changes (stuck / away), not only on the next scroll", async () => {
    const a = bar("ptk-bar", 70, 122), f = bar("ptk-frow", 300, 340);
    const repin = vi.fn(); const stop = watchBars(".ptk-bar, .ptk-frow", repin);
    a.classList.add("away"); await Promise.resolve();
    expect(repin).toHaveBeenCalledTimes(1);
    f.classList.add("stuck"); await Promise.resolve();
    expect(repin).toHaveBeenCalledTimes(2);
    a.dispatchEvent(new Event("transitionend"));                         // the bar's slide ends: work it out again with the bar where it now is
    expect(repin).toHaveBeenCalledTimes(3);
    stop(); a.classList.remove("away"); a.dispatchEvent(new Event("transitionend")); await Promise.resolve();
    expect(repin).toHaveBeenCalledTimes(3);
  });
  it("HScroll places the heading under the lowest bar and moves it when the section bar turns away", async () => {
    let frame: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { frame = cb; return 1; });
    vi.stubGlobal("cancelAnimationFrame", () => { frame = null; });
    const sec = bar("ptk-bar", 70, 140), row = bar("ptk-frow", 74, 126);
    const { container } = render(<HScroll pinBelow=".ptk-frow.stuck, .ptk-bar:not(.away)" pinWatch=".ptk-bar, .ptk-frow" pinCells controls={false} zoom={false}><table><thead><tr><th>Fund</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table></HScroll>);
    const tw = container.querySelector(".tw") as HTMLElement, head = container.querySelector("thead") as HTMLElement;
    tw.getBoundingClientRect = () => rect(-400, 1600); head.getBoundingClientRect = () => rect(-400, -360);
    await act(async () => { dispatchEvent(new Event("scroll")); frame?.(0); });
    expect(head.style.getPropertyValue("--pin")).toBe("540px");            // 140 (the section bar) + 400
    await act(async () => { sec.classList.add("away"); row.classList.add("stuck"); await Promise.resolve(); frame?.(0); });   // no scroll event
    expect(head.style.getPropertyValue("--pin")).toBe("526px");            // 126 (the filter row) + 400
    expect(head.classList.contains("is-pinned")).toBe(true);
  });
  it("the MF table watches both bars; the ETF table uses the same pin line; Equity keeps its tools row", () => {
    expect(src("mf/pack/MfFunds.tsx")).toContain('pinBelow=".ptk-frow.stuck, .ptk-bar:not(.away)" pinWatch=".ptk-bar, .ptk-frow"');
    expect(src("etf/pack/EtfList.tsx")).toContain('pinBelow=".ptk-frow.stuck, .ptk-bar:not(.away)"');
    expect(src("portfolio/SharesTable.tsx")).toContain('pinBelow={p.editSell ? "#pf-shares .pfx-tools.pfh" : undefined}');
    expect(src("components/HScroll.tsx")).not.toMatch(/document\.querySelector\(pinBelow\)/);
  });
});

describe("D1: the page has the Equity and ETF width, with funds and without", () => {
  it("the wrap carries pfx (with funds and empty), and the MF page's own width rule", async () => {
    await show();
    expect(document.querySelector(".wrap.mfp")!.className).toBe("wrap ipo mp sp mfp pfx");
    cleanup(); st.data = DATA([]);
    await show("/mf-portfolio", true);
    expect(document.querySelector(".wrap.mfp")!.className).toBe("wrap ipo mp sp mfp pfx");
    expect(css("mf/pack/spacing389.css")).toMatch(/\.wrap\.mfp:not\(\.efp\), \.wrap\.mfp:not\(\.efp\) \.gate, \.wrap\.mfp:not\(\.efp\) \.gate > div \{ min-width: 0; max-width: 100%; \}/);
  });
});

describe("D2 and the spacing with funds (SP3, SP6, SP7), scoped to the MF page", () => {
  const c = css("mf/pack/spacing389.css");
  it("18 px under the top card (to Add your first fund) and between the boxes; 28 above the view cards; 12 side by side", () => {
    expect(c).toMatch(/\.wrap\.mfp:not\(\.efp\) \{ --pf-gap: 18px; --pf-gap-x: 12px; --pf-crown: 10px; \}/);
    expect(c).toContain(".wrap.mfp:not(.efp) .ptk-head { margin-bottom: var(--pf-gap); }");
    expect(c).toContain(".wrap.mfp:not(.efp) .px-strip { margin-top: calc(var(--pf-gap) + var(--pf-crown)); margin-bottom: var(--pf-gap); }");
    for (const sel of [".ptk-bar", ".ptk-hz", ".mfm-subtabs"]) expect(c).toContain(`.wrap.mfp:not(.efp) ${sel} { margin-bottom: var(--pf-gap); }`);
    expect(c).toMatch(/\.wrap\.mfp:not\(\.efp\) :is\([^)]*\.eqr-tiles[^)]*\) \{ gap: var\(--pf-gap-x\); \}/);
  });
  it("every rule is scoped to the MF page (not the ETF page, which shares .mfp)", () => {
    const rules = c.split("}").map((r) => r.replace(/@media[^{]*\{/, "").trim()).filter((r) => r.includes("{"));
    for (const r of rules) for (const s of r.split("{")[0].split(/,(?![^(]*\))/)) expect(s.trim(), s).toMatch(/^\.wrap\.mfp:not\(\.efp\)/);
    expect(src("pages/MfPortfolio.tsx")).toContain('import "../mf/pack/spacing389.css";');
    expect(src("pages/EtfPortfolio.tsx")).not.toContain("spacing389");
  });
});

describe("D3 and E1: the shared page bottom inside the page column", () => {
  it("Questions (closed, at desktop width), then the Disclaimer fold, then the sources line, inside the page's wrap", async () => {
    await show();
    const wrap = document.querySelector(".wrap.mfp")!, pgb = wrap.querySelector(":scope > .pgb")!;
    expect(pgb).toBeTruthy();
    const kids = [...pgb.children];
    expect(kids[0].id).toBe("faq");
    expect(kids[0].querySelector("details.pfq-fold")!.hasAttribute("open")).toBe(false);
    expect(kids[0].querySelector("summary")!.textContent).toMatch(/^Questions about this page · \d+$/);
    expect(kids[1].matches("details.sp-fold.pgb-disc")).toBe(true);
    expect(kids[1].hasAttribute("open")).toBe(false);
    expect(kids[1].querySelector("summary")!.textContent).toMatch(/Disclaimer.*What this page is, and is not.*Show ▾/);
    expect(kids[2].matches("p.pgb-src")).toBe(true);
    expect(kids[2].textContent).toMatch(/AMFI.*fund house's monthly portfolio file.*Mutual Fund Score.*Information only, not investment advice\.$/);
    expect(document.querySelectorAll("#faq")).toHaveLength(1);
    expect(document.querySelector("details.mfp-disc")).toBeNull();
  });
  it("with no funds the bottom is inside the column too, right after the empty card", async () => {
    st.data = DATA([]);
    await show("/mf-portfolio", true);
    const pgb = document.querySelector(".wrap.mfp > .pgb")!;
    expect(pgb.querySelector("#faq")).toBeTruthy();
    expect(pgb.previousElementSibling!.querySelector(".mfp-empty, #mfp-top") ?? pgb.previousElementSibling).toBeTruthy();
  });
  it("the layout no longer adds its own Questions box below the MF page", () => {
    render(<MemoryRouter initialEntries={["/mf-portfolio"]}><PageFaqs /></MemoryRouter>);
    expect(document.getElementById("faq")).toBeNull();
  });
  it("the disclaimer and the questions keep their text", () => {
    expect(src("components/PortfolioDisclaimer.tsx")).toContain("mf");
    expect(src("portfolio/shared/PageBottom.tsx")).toContain("<PortfolioDisclaimer kind={kind} />");
  });
});
