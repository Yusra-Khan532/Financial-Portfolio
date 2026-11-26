// @vitest-environment jsdom
// Task #390 PR A (developer file 34, ETF portfolio): the calm top (cost card and three view cards), Since your last visit, Data as of, one section per step
// with the step in the address and remembered, Key figures in step 1 of every view, things to know as a pop-up, Record a sale, the ETF table's sorting,
// pinned heading and cap, Where your gain or loss came from, question-style Key figures, What changed in "updates" and "filings", phone folds, own i
// labels, "A, B and C" lists and the plan name from the plan list. Figures: a MADE-UP list (lib/__fixtures__/etf390-*.json: six ETFs with invented
// quantities in two invented accounts; prices and public figures from the public ETF pages), never a member's list.
import LIST from "../lib/__fixtures__/etf390-list.json";
import RISK from "../lib/__fixtures__/etf390-risk.json";
import INSIDE from "../lib/__fixtures__/etf390-inside.json";
import BOOK from "../lib/__fixtures__/etf390-book.json";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EtfPortfolio, EtfRisk, Inside } from "../lib/etfPortfolio";

const FX = <T,>(x: unknown): T => JSON.parse(JSON.stringify(x));
const CHANGES = { days: 90, events: ["order", "rating"], notPlaced: [{ s: "ZZCO", n: "Sample Holdings Limited" }, { s: "ZZCO2", n: "Example Traders Limited" }],
  companies: [{ s: "INFY", n: "Infosys Limited", ev: { order: { n: 4, d: "2026-11-20", t: "Order win", l: null, dates: ["2026-11-20"] } } },
    { s: "TCS", n: "Tata Consultancy Services Limited", ev: { rating: { n: 1, d: "2026-11-02", t: "Credit rating", l: null, dates: ["2026-11-02"] } } }] };
const st = vi.hoisted(() => ({ plan: "gold", phone: false, visit: null as string | null, list: null as unknown, risk: null as unknown }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ plan: st.plan, has: (t: string) => ({ basic: 0, silver: 1, gold: 2 } as Record<string, number>)[st.plan] >= ({ basic: 0, silver: 1, gold: 2 } as Record<string, number>)[t], upgrade: vi.fn(), toast: vi.fn() }) }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: { id: "u-sample" } }) }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()),
  apiGet: vi.fn(async (path: string) => {
    if (path.startsWith("/api/me/etf-portfolio/book")) return JSON.parse(JSON.stringify(BOOK));
    if (path.startsWith("/api/discovery/changes")) return JSON.parse(JSON.stringify(CHANGES));
    if (path.startsWith("/api/alerts")) return { alerts: [], limit: 300 };
    return {};
  }),
  apiSend: vi.fn(async (_m: string, p: string) => (p.startsWith("/api/visits/") ? { previous: st.visit } : { status: "saved" })) }));
vi.mock("../lib/etfPortfolio", async (orig) => {
  const m = await orig<typeof import("../lib/etfPortfolio")>();
  const mut = { mutateAsync: vi.fn(), isPending: false };
  return { ...m, useEtfPortfolio: (on: boolean) => ({ data: on ? st.list : undefined, isPending: false, isError: false }),
    useEtfRisk: () => ({ data: st.risk, isPending: false, isError: false }), useEtfInside: () => ({ data: FX(INSIDE), isPending: false, isError: false }),
    useEtfWrites: () => ({ add: mut, quantities: mut, preview: mut, commit: mut, clear: mut, undoClear: mut, remove: mut }) };
});
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
import { EtfPortfolioPage, readPlace } from "./EtfPortfolio";
import { CAP_ETFS, EtfsTable } from "../etf/pack/EtfList";
import { COST_BARS, EtfCards, EtfSince, costTip } from "../etf/pack/EtfTop";
import { etfCards, etfStepFromParam, etfStepsOf } from "../lib/etfTop";
import { companySizes, costCard, etfKeyFigures, underneath } from "../lib/etfKeyFigs";
import { gainLoss } from "../portfolio/shared";
import { ETF_PORTFOLIO_FAQ, etfLimitLine, setEtfLimit } from "../content/etfPortfolioFaqs";
import { planName } from "../lib/planNames";
import { PLAN_FOR_PORTFOLIO } from "../lib/planGates";

let loc = "";
function Where() { const l = useLocation(); loc = l.search; return null; }
beforeEach(() => {
  st.plan = "gold"; st.phone = false; st.visit = null; st.list = FX(LIST); st.risk = FX(RISK); loc = "";
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: st.phone && /max-width/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
const show = async (url = "/etf-portfolio") => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[url]}><EtfPortfolioPage /><Where /></MemoryRouter></QueryClientProvider>);
  await waitFor(() => expect(document.querySelector(".px-strip")).toBeTruthy());
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
const bar = () => screen.getByRole("navigation", { name: "Views and sections" });
const heads = () => [...document.querySelectorAll("#etp-panel h2")].map((h) => h.firstChild?.textContent ?? "");
const D = () => FX<EtfPortfolio>(LIST);

describe("Top of the page (T1–T6, F3)", () => {
  it("T1: Add to [select] sits in the add row after Import and ⋯; the full-width bar is gone", async () => {
    await show();
    const sel = await screen.findByRole("combobox", { name: "ETFs you add go to" }) as HTMLSelectElement;
    expect(sel.closest("label")!.className).toBe("px-addto");
    expect(sel.closest(".ptk-add")).toBeTruthy();
    expect([...sel.options].map((o) => o.textContent)).toEqual(["Zerodha", "Groww"]);
    expect(sel.closest("label")!.previousElementSibling!.textContent).toMatch(/⋯/);
    expect(document.querySelector(".acc-to")).toBeNull();
  });
  it("T2: a calm crowned cost card: the big yearly cost, one bar per ETF (five, then 'and N more in the table'), ₹ on ₹1 lakh and AMFI's date, an i", async () => {
    await show();
    const c = document.querySelector(".px-cost")!;
    expect(c.querySelector(".px-crown")).toBeTruthy();
    expect(c.querySelector(".px-k")!.firstChild!.textContent).toBe("What your ETFs cost");
    expect(c.querySelector(".px-v")!.textContent).toBe("0.42% a year");
    expect(c.querySelectorAll(".px-cb li")).toHaveLength(COST_BARS);
    expect(c.querySelector(".px-cb li")!.textContent).toBe("HNGSNGBEES0.98%");   // highest first
    expect(c.querySelector(".px-cbm")!.textContent).toBe("and 1 more in the table");
    expect(c.querySelector(".px-x")!.textContent).toBe("About ₹425 a year on ₹1 lakh. AMFI, 6 Nov.");
    expect(within(c as HTMLElement).getByRole("button", { name: "About “What your ETFs cost”" })).toBeTruthy();
    expect(costTip(costCard(D()))).toMatch(/what an ETF charges a year.*taken from the ETF's value each day, not charged to you separately/);
    expect(document.querySelector(".ptk-score")).toBeNull();   // the dark card is gone
  });
  it("T2c: five ETFs or fewer show every bar and no 'more' line", () => {
    const d = D(); d.items = d.items.slice(0, 5); d.count = 5;
    const c = costCard(d), r = render(<EtfCards cost={c} asOf="6 Nov" cards={[]} colors={{ etfs: "#000", inside: "#000", risk: "#000" }} view="etfs" onView={() => {}} weighted={false} />);
    expect(r.container.querySelectorAll(".px-cb li")).toHaveLength(5);
    expect(r.container.querySelector(".px-cbm")).toBeNull();
  });
  it("T3–T5, F3: the view cards say You are here / Open →; Your ETFs counts the ETFs (not the cost again); Risk reads 'Lower · moves 0.62×'", async () => {
    await show();
    const cards = [...document.querySelectorAll("button.px-vw")];
    expect(cards.map((b) => b.querySelector(".px-k em")!.textContent)).toEqual(["You are here", "Open →", "Open →"]);
    expect(cards.map((b) => b.querySelector(".px-v")!.textContent)).toEqual(["6 ETFs", "85 companies", "Lower · moves 0.62×"]);
    expect(cards[0].querySelector(".px-x")!.textContent).toBe("HNGSNGBEES trades 6.42% above its value");
    expect(cards[2].querySelector(".px-x")!.textContent).toBe("Swings 11.6% a year; the Nifty 500 14.4%");
    expect(document.body.textContent).not.toMatch(/seen three ways|Not opened yet|views opened|β/);
    expect(cards.filter((b) => b.querySelector(".px-v")!.textContent!.includes("% a year"))).toHaveLength(0);   // F3: the cost is on its own card only
    fireEvent.click(cards[2]);
    expect(loc).toBe("?view=risk");
    expect(document.querySelectorAll("button.px-vw")[2].querySelector(".px-k em")!.textContent).toBe("You are here");
  });
  it("T4: no ETF 0.1% or more from its value: the card says what the view holds", () => {
    const d = D(); d.items.forEach((e) => { e.premium = 0.02; });
    expect(etfCards(d, underneath(FX<Inside>(INSIDE), d), FX<EtfRisk>(RISK))[0].sub).toBe("What each tracks, costs and earned, and how it trades");
  });
  it("T6: Since your last visit: no visit yet, a visit with nothing new, and a visit with new filings and See what changed →", () => {
    const r1 = render(<EtfSince visit={null} fresh={0} onSee={() => {}} />);
    expect(r1.container.textContent).toBe("Since your last visit: what is new at the companies inside your ETFs shows from your next visit.");
    r1.unmount();
    const r2 = render(<EtfSince visit="20 Nov" fresh={0} onSee={() => {}} />);
    expect(r2.container.textContent).toBe("Since your last visit on 20 Nov: nothing new at the companies inside your ETFs.");
    expect(r2.container.querySelector("button")).toBeNull();
    r2.unmount();
    const go = vi.fn(), r3 = render(<EtfSince visit="20 Nov" fresh={3} onSee={go} />);
    expect(r3.container.textContent).toBe("Since your last visit on 20 Nov: 3 new filings at companies inside your ETFs.See what changed →");
    fireEvent.click(within(r3.container).getByRole("button", { name: "See what changed →" }));
    expect(go).toHaveBeenCalled();
  });
  it("T6b: on the page, See what changed → opens the What changed step", async () => {
    st.visit = "2026-11-10T10:00:00Z";
    await show();
    const since = await waitFor(() => { const s = document.querySelector(".px-since"); expect(s?.textContent).toMatch(/^Since your last visit on 10 Nov: 1 new filing at companies inside your ETFs\./); return s!; });
    fireEvent.click(within(since as HTMLElement).getByRole("button", { name: "See what changed →" }));
    expect(loc).toBe("?step=wc");
    await waitFor(() => expect(document.getElementById("what-changed")).toBeTruthy());
  });
});

describe("Data as of (T7)", () => {
  const asOf = () => document.querySelector(".px-asof")!.textContent;
  it("one line under the section bar, per view", async () => {
    await show();
    expect(document.querySelector(".px-asof")!.parentElement!.id).toBe("etp-panel");
    expect(asOf()).toBe("Data as ofPrices close of 23 Nov·Filings the last 90 days·Holdings each fund house’s 31 Oct 2026 file");
    fireEvent.click(document.querySelectorAll("button.px-vw")[1]);
    expect(asOf()).toBe("Data as ofPrices close of 23 Nov·Holdings each fund house’s 31 Oct 2026 file");
    fireEvent.click(document.querySelectorAll("button.px-vw")[2]);
    expect(asOf()).toBe("Data as ofPrices close of 23 Nov·Risk figures weekly prices, past year · swings and falls over 3 years");
  });
});

describe("One section per step (T8, T9, U1, RB7, RB8)", () => {
  it("T9: the steps of each view; Key figures is not a step (it sits in step 1)", () => {
    expect(etfStepsOf("etfs").map((s) => s.label)).toEqual(["Your ETFs", "What changed", "In short"]);
    expect(etfStepsOf("inside").map((s) => s.label)).toEqual(["What they own", "Money in", "Sectors in each", "Move together", "Shared stocks", "Company sizes", "Largest stocks", "In short"]);
    expect(etfStepsOf("risk").map((s) => s.label)).toEqual(["At a glance", "Beta build", "Against the Nifty 500", "If the market fell", "Risk share", "Each ETF", "In short"]);
  });
  it("U1c, RB7b: no step is step 1; a remembered Key figures opens step 1; an unknown step opens step 1; step=all is All sections", () => {
    const r = etfStepsOf("risk");
    expect(etfStepFromParam(r, null)).toBe("etp-glance");
    expect(etfStepFromParam(r, "kf-risk")).toBe("etp-glance");
    expect(etfStepFromParam(r, "nothing-like-this")).toBe("etp-glance");
    expect(etfStepFromParam(r, "each")).toBe("etp-each");
    expect(etfStepFromParam(r, "all")).toBe("all");
  });
  it("T8a, U1a: step 1 shows Your ETFs and Key figures only (file 39 v4 A1: gain or loss left the page); a step shows its section only; All sections shows them all", async () => {
    await show();
    expect(heads()).toEqual(["Your ETFs", "Key figures"]);
    fireEvent.click(within(bar()).getByRole("button", { name: /What changed/ }));
    expect(loc).toBe("?step=wc");
    await waitFor(() => expect(heads()).toEqual(["What changed at the companies inside your ETFs"]));
    fireEvent.click(within(bar()).getByRole("button", { name: "All sections" }));
    expect(loc).toBe("?step=all");
    expect(within(bar()).getByRole("button", { name: "All sections" }).getAttribute("aria-pressed")).toBe("true");
    expect(heads()).toEqual(["Your ETFs", "Key figures", "What changed at the companies inside your ETFs", "What this means, in short"]);
  });
  it("T8b, U1a: every view opens on its first step, with Key figures inside it", async () => {
    await show("/etf-portfolio?view=risk&step=each");
    expect(heads()).toEqual(["Each ETF's risk"]);
    fireEvent.click(document.querySelectorAll("button.px-vw")[1]);
    expect(loc).toBe("?view=inside");
    expect(heads().slice(0, 2)).toEqual(["What your ETFs own: macro sector and size", "Key figures"]);
    expect(heads()).not.toContain("Largest stocks underneath");
    fireEvent.click(document.querySelectorAll("button.px-vw")[2]);
    expect(heads()).toEqual(["Risk at a glance", "Key figures"]);
  });
  it("What's inside: a step opens its sub-view; a sub-view tab opens its first step", async () => {
    await show("/etf-portfolio?view=inside&step=shared");
    expect(heads()).toEqual(["Stocks they share"]);
    expect(screen.getByRole("tab", { name: /How ETFs move together/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: /Large, mid, small and micro/ }));
    await waitFor(() => expect(loc).toBe("?view=inside&step=sizes"));
    expect(heads()).toEqual(["Company sizes inside each share ETF"]);
  });
  it("RB8: the view and step are remembered for the member; a bare address opens there; an address that names a view wins", async () => {
    await show("/etf-portfolio?view=risk&step=fall");
    expect(readPlace("u-sample")).toEqual({ view: "risk", step: "etp-fall" });
    cleanup();
    await show("/etf-portfolio");
    await waitFor(() => expect(loc).toBe("?view=risk&step=fall"));
    cleanup();
    await show("/etf-portfolio?view=inside");
    expect(loc).toBe("?view=inside");
  });
  it("U1c: a remembered 'Key figures' step opens step 1", async () => {
    localStorage.setItem("finlit-etf-portfolio-place:u-sample", JSON.stringify({ view: "risk", step: "etp-kf-risk" }));
    await show("/etf-portfolio");
    await waitFor(() => expect(loc).toBe("?view=risk&step=kf-risk"));
    expect(heads()).toEqual(["Risk at a glance", "Key figures"]);
  });
  it("RB7a: ?pf= stays with the step", async () => {
    await show("/etf-portfolio?pf=zer&step=wc");
    fireEvent.click(within(bar()).getByRole("button", { name: /In short/ }));
    expect(loc).toBe("?pf=zer&step=short");
  });
});

describe("Things to know as a pop-up (U2)", () => {
  it("a pill at the right of the heading with one dot per note; it opens a pop-up with the box's title, Open all and ×; Esc and a change of view close it", async () => {
    await show();
    const pill = await screen.findByRole("button", { name: /1 thing to know/ });
    expect(pill.closest(".sp-sec-h, .pfx-h")).toBeTruthy();
    expect(pill.querySelectorAll(".eq8k-dots i")).toHaveLength(1);
    expect(document.querySelector(".eq-ins-h")).toBeNull();   // the quiet list on the page goes
    fireEvent.click(pill);
    const pop = screen.getByRole("dialog", { name: "One thing to know" });
    expect(within(pop).getByRole("button", { name: "Close" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "One thing to know" })).toBeNull();
    fireEvent.click(pill);
    fireEvent.click(document.querySelectorAll("button.px-vw")[1]);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "One thing to know" })).toBeNull());
  });
  it("every view's things to know are pills, not boxes", async () => {
    await show("/etf-portfolio?view=risk&step=all");
    expect(document.querySelectorAll(".eq8k-btn").length).toBeGreaterThan(0);
    expect(document.querySelector(".eq-ins-h")).toBeNull();
  });
});

describe("Your ETFs (E1–E4, F6, IB1)", () => {
  it("E1, RB1: the row button reads Record a sale; no Sell anywhere on the page", async () => {
    await show();
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Record a sale of / }).length).toBe(6));
    expect([...document.querySelectorAll("button")].filter((b) => /^Sell\b/.test(b.textContent ?? ""))).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Record a sale of BANKBEES" }));
    expect(screen.getByRole("dialog", { name: "Record a sale of BANKBEES" })).toBeTruthy();
  });
  it("E2: every column sorts, again to reverse; a dash sorts last both ways", async () => {
    await show();
    await waitFor(() => expect(document.querySelector("td.x-qty")).toBeTruthy());
    const order = () => [...document.querySelectorAll("tbody .mfp-fund")].map((a) => a.textContent);
    const ths = [...document.querySelectorAll("table.x-grp thead tr:last-child th")];
    expect(ths.every((t) => t.querySelector("button.mff-sort") && t.getAttribute("aria-sort"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Qty/ }));
    expect(order().at(-1)).toBe("PHARMABEES");    // no quantity: last
    fireEvent.click(screen.getByRole("button", { name: /^Qty/ }));
    expect(order().at(-1)).toBe("PHARMABEES");    // still last when reversed
    expect(order()[0]).toBe("HNGSNGBEES");
  });
  it("E3, F6: the heading row is pinned (FrozenTable); each heading holds one label and its sort state in aria-sort; the column i has its own label", async () => {
    await show();
    expect(document.querySelector(".eqs-frz table.mff-t.x-grp")).toBeTruthy();
    const ths = [...document.querySelectorAll("table.x-grp thead tr:last-child th")];
    for (const t of ths) expect(t.querySelectorAll("button.mff-sort")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "About “Expense ratio”" })).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: "What does this mean?" })).toHaveLength(0);
  });
  it("E4, B1: 27 ETFs show in full; 28 show 25 rows, then Show all 28 ETFs ▾", () => {
    const many = (n: number) => { const d = D(); d.items = Array.from({ length: n }, (_, i) => ({ ...d.items[i % 6], symbol: `SAMPLE${String(i).padStart(2, "0")}` })); d.count = n; return d; };
    const draw = (d: EtfPortfolio) => render(<MemoryRouter><EtfsTable d={d} rk={undefined} rows={d.items} view="returns" sort={{ k: "name", dir: 1 }} setSort={() => {}} tools={null} actions={() => null} gone={() => null} /></MemoryRouter>);
    const a = draw(many(27));
    expect(a.container.querySelectorAll("tbody tr")).toHaveLength(27);
    expect(within(a.container).queryByRole("button", { name: /Show all/ })).toBeNull();
    a.unmount();
    const b = draw(many(28));
    expect(b.container.querySelectorAll("tbody tr")).toHaveLength(CAP_ETFS.keep);
    fireEvent.click(within(b.container).getByRole("button", { name: /^Show all 28 ETFs/ }));
    expect(b.container.querySelectorAll("tbody tr")).toHaveLength(28);
  });
});

describe("Where your gain or loss came from (E5, L1–L6, B2)", () => {
  it("file 39 v4 A1: the section left the page and the Your ETFs step, with All sections too; the shared figures stay tested here", async () => {
    await show("/etf-portfolio?step=all");
    await waitFor(() => expect(document.getElementById("etp-etfs")).toBeTruthy());
    expect(document.getElementById("etp-gl")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Where your gain or loss came from/);
    expect(etfStepsOf("etfs")[0].secs).not.toContain("etp-gl");
  });
  it("L3b, L6a: two ETFs explain the whole loss; each (−₹N) stays with its name", () => {
    const g = gainLoss([{ symbol: "A", name: "SAMPLEA", gain: -1500, pct: -15 }, { symbol: "B", name: "SAMPLEB", gain: -900, pct: -9 }, { symbol: "C", name: "SAMPLEC", gain: 300, pct: 3 }], 0, "ETF", true);
    expect(`${g.lead!.bold} ${g.lead!.rest}`).toBe("Two ETFs explain the whole loss. SAMPLEA (−₹1,500) and SAMPLEB (−₹900) are down ₹2,400 between them; the other ETF is up ₹300.");
  });
  it("L4: a loss three ETFs cannot explain is spread out, counting the ETFs in loss", () => {
    const rows = [-400, -300, -200, -150, 120, -100].map((g, i) => ({ symbol: `S${i}`, name: `SAMPLE${i}`, gain: g, pct: null }));
    const g = gainLoss(rows, 0, "ETF", true);
    expect(`${g.lead!.bold} ${g.lead!.rest}`).toBe("The loss is spread out. The three biggest losses, SAMPLE0, SAMPLE1 and SAMPLE2, come to ₹900; 5 of your 6 ETFs are in loss.");
  });
  it("L5, B2: above 12 ETFs, the 5 biggest gains, the 5 biggest losses and any named one, then Show all", () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ symbol: `S${i}`, name: `SAMPLE${i}`, gain: (i - 7) * 100 + 13, pct: null }));
    const g = gainLoss(rows, 0, "ETF", true);
    expect(g.capped).toBe(true);
    expect(g.shown(false).length).toBe(10 + [...g.key].filter((k) => !g.rows.slice(0, 5).concat(g.rows.slice(-5)).some((r) => r.symbol === k)).length);
    expect(g.shown(true)).toHaveLength(15);
  });
});

describe("Key figures: a question and one big figure (E6, K1–K10, F5, W14, W18)", () => {
  const cards = (v: "etfs" | "inside" | "risk") => etfKeyFigures(v, { d: D(), ins: FX<Inside>(INSIDE), rk: FX<EtfRisk>(RISK) }).map((c) => `${c.q} | ${c.big} | ${c.ans}`);
  it("Your ETFs: K1, K2, K3", () => {
    expect(cards("etfs")).toEqual([
      "What do your ETFs cost a year? | 0.42% a year | on average: about ₹425 on ₹1 lakh",
      "Which ETF trades furthest from its value? | 6.42% | HNGSNGBEES traded above its value on 23 Nov, the furthest of the six",
      "How did they do over the past year? | +1.93% | on average over the past year, price only"]);
  });
  it("What's inside: K4, K5, K6", () => {
    const c = cards("inside");
    expect(c[0]).toBe("What does your money hold? | 66.6% | Indian shares. Gold 16.7%, shares abroad 16.6%, debt and cash under 1%");
    expect(c[1]).toMatch(/^Where is most of your money underneath\? \| \d+\.\d% \| of your list is in [A-Z].*, (just )?ahead of .* at \d+\.\d%$/);
    expect(c[2]).toMatch(/^How big are the companies underneath\? \| \d+\.\d% \| of your list is in large companies$/);
  });
  it("Risk: K7, K8, K9 (no 'Beta' word, 0.62×)", () => {
    expect(cards("risk")).toEqual([
      "How much does your list move with the market? | 0.62× | it has moved about 6% when the Nifty 500 moved 10%",
      "Which ETF brings the most swing? | 23% | of the swings come from HNGSNGBEES, 17% of the list",
      "How much does it swing in a year? | 11.6% | in a typical year, against 14.4% for the Nifty 500"]);
  });
  it("F5: 'Mostly' only above 50% of the list", () => {
    const at = (w: number) => { const ins = FX<Inside>(INSIDE); ins.knownShares = 1;
      ins.lookThrough = { macro: { "Financial Services|Large": { w, stocks: [] }, "Financial Services|Mid": { w: 0.2, stocks: [] } } } as unknown as Inside["lookThrough"];
      const c = companySizes({ d: D(), ins })!; return c.lead + c.rest; };
    expect(at(0.499)).toBe("49.9% of your list is in large companies.");
    expect(at(0.501)).toBe("Mostly large companies: 50.1% of your list.");
  });
  it("E6b: on the page each card has a numbered question, the big figure, and its method behind its own i", async () => {
    await show();
    fireEvent.click(await screen.findByRole("button", { name: "Show: Key figures" }));   // file 39 v4 A2: closed until clicked
    const c = [...document.querySelectorAll(".ptk-kf-c")];
    expect(c.map((x) => x.querySelector(".ptk-kf-qn")!.textContent)).toEqual(["1", "2", "3"]);
    expect(c.map((x) => x.querySelector(".ptk-kf-big > b")!.textContent)).toEqual(["0.42% a year", "6.42%", "+1.93%"]);
    expect(document.querySelectorAll(".ptk-kf-f")).toHaveLength(0);
    expect(c.map((x) => x.querySelector(".ptk-kf-q .sp-i")!.getAttribute("aria-label"))).toEqual(["About “What do your ETFs cost a year?”", "About “Which ETF trades furthest from its value?”", "About “How did they do over the past year?”"]);
  });
});

describe("What changed (E7, E8, E10)", () => {
  it("counts say updates, a note says what an update is, rows say '· N filings', short names, a closed Not in Discover yet list", async () => {
    await show("/etf-portfolio?step=wc");
    const sec = await waitFor(() => { const s = document.getElementById("what-changed"); expect(s?.querySelector(".wc-rows li")).toBeTruthy(); return s!; });
    expect(within(sec).getByRole("button", { name: /Order wins/ }).textContent).toBe("Order wins1update");
    expect(sec.textContent).toMatch(/An update is one kind of news from one company\. Some bundle several filings; the row then says how many\./);
    const infy = [...sec.querySelectorAll(".wc-rows li")].find((r) => /Infosys/.test(r.textContent ?? ""))!;
    expect(infy.querySelector(".wc-k")!.textContent).toBe("Order win · 4 filings");
    expect(infy.querySelector(".wc-cow")!.textContent).toMatch(/^Infosys\d/);   // no "Limited"
    const np = sec.querySelector("details.wc-np") as HTMLDetailsElement;
    expect(np.open).toBe(false);
    expect(np.querySelector("summary")!.textContent).toMatch(/^Not in Discover yet · 2/);
    expect(np.textContent).toMatch(/Sample Holdings, Example Traders\./);
  });
  it("P2d: on a phone with All sections, What changed folds to 'N companies filed in the last 90 days'", async () => {
    st.phone = true;
    await show("/etf-portfolio?step=all");
    const fold = await waitFor(() => { const f = document.querySelector("[data-fold=etp-wc] .eqf-sum .s"); expect(f?.textContent).toMatch(/filed/); return f!; });
    expect(fold.textContent).toBe("2 companies filed in the last 90 days");
  });
});

describe("Phone (P1–P3)", () => {
  it("P2a, P2c: with All sections on a phone, every step after the first folds to its heading and one line with Open ▾; Open shows it with Close ▴", async () => {
    st.phone = true;
    await show("/etf-portfolio?view=risk&step=all");
    const folds = [...document.querySelectorAll("section.eqf")];
    expect(folds.map((f) => f.querySelector(".eqf-h")!.textContent)).toEqual(["How your list's beta is built", "Each ETF against the Nifty 500", "If the Nifty 500 fell 10%", "Share of the list vs share of the risk", "Each ETF's risk", "What this means, in short"]);
    await waitFor(() => expect(folds[0].querySelector(".eqf-sum .s")!.textContent!.length).toBeGreaterThan(10));
    expect(folds[0].querySelector(".eqf-sum .s")!.textContent!.length).toBeLessThanOrEqual(140);
    fireEvent.click(within(folds[0] as HTMLElement).getByRole("button", { name: /Open/ }));
    expect(screen.getByRole("button", { name: /Close/ })).toBeTruthy();
    expect(heads()).toContain("Risk at a glance");   // step 1 never folds
  });
  it("P3: with one section chosen in the bar, nothing folds", async () => {
    st.phone = true;
    await show("/etf-portfolio?view=risk&step=build");
    expect(document.querySelector("section.eqf")).toBeNull();
    expect(heads()).toEqual(["How your list's beta is built"]);
  });
});

describe("i buttons (IB1, IB2)", () => {
  it("every i on Your ETFs and What's inside has its own label; Key figure cards and the cost card have one", async () => {
    await show("/etf-portfolio?step=all");
    const labels = [...document.querySelectorAll(".wrap.efp .sp-i")].map((b) => b.getAttribute("aria-label")!);
    expect(labels).not.toContain("What does this mean?");
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain("About “What your ETFs cost”");
    expect(labels).not.toContain("About “Where your gain or loss came from”");   // file 39 v4 A1: the section left the page
    expect(labels).toContain("About “What changed at the companies inside your ETFs”");
    cleanup();
    await show("/etf-portfolio?view=inside&step=all");
    const ins = [...document.querySelectorAll(".wrap.efp .sp-i")].map((b) => b.getAttribute("aria-label")!);
    expect(ins).not.toContain("What does this mean?");
    expect(new Set(ins).size).toBe(ins.length);
  });
});

describe("Words and faults (F1, F4)", () => {
  it("F1, RB5: the questions box reads the plan name from the plan list; the ETF limit is said for the plans that have the page", () => {
    expect(ETF_PORTFOLIO_FAQ.plan).toBe(planName(PLAN_FOR_PORTFOLIO));
    expect(ETF_PORTFOLIO_FAQ.plan).not.toMatch(/Mutual Fund \+ ETF|Platinum/);
    setEtfLimit(null);                                                  // a visitor, or a plan without the page: never "your plan" (fault 1)
    expect(etfLimitLine()).toBe("Silver and Gold hold up to 15 ETFs.");
    expect(JSON.stringify(ETF_PORTFOLIO_FAQ)).not.toMatch(/Your plan holds up to/);
    // task #390 (developer file 39 v4, C1c): once the member's list has loaded, their own limit from /api/me/etf-portfolio, and no plan name
    setEtfLimit(15);
    expect(etfLimitLine()).toBe("Your plan holds up to 15 ETFs.");
    expect(ETF_PORTFOLIO_FAQ.items[0].a).toMatch(/Your plan holds up to 15 ETFs\.$/);
    expect(ETF_PORTFOLIO_FAQ.items[0].a).not.toMatch(/Silver|Gold/);
    setEtfLimit(25);
    expect(ETF_PORTFOLIO_FAQ.items[0].a).toMatch(/Your plan holds up to 25 ETFs\.$/);
    setEtfLimit(null);
  });
  it("F4, W17: no list in the ETF page's files is joined as 'A and B and C'", () => {
    const root = resolve(__dirname, "..");
    const files = [...readdirSync(resolve(root, "etf/pack")).filter((f) => /\.tsx?$/.test(f) && !/test/.test(f)).map((f) => resolve(root, "etf/pack", f)),
      resolve(root, "pages/EtfPortfolio.tsx"), resolve(root, "lib/etfTop.ts"), resolve(root, "lib/etfKeyFigs.ts")];
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/join\(" and "\)|join\("'s and "\)/);
  });
  it("E9: the What changed foot names three share ETFs as 'A, B and C'", async () => {
    await show("/etf-portfolio?step=wc");
    const sec = await waitFor(() => { const s = document.getElementById("what-changed"); expect(s).toBeTruthy(); return s!; });
    expect([...sec.querySelectorAll(".wc-note")].at(-1)!.textContent).toMatch(/^BANKBEES, ITBEES, JUNIORBEES and PHARMABEES hold 85 companies between them/);
    expect(sec.querySelector(".wp-sub")!.textContent).toMatch(/HDFCGOLD and HNGSNGBEES hold no companies\.|HDFCGOLD holds no companies\./);
  });
});

describe("Plans (G4)", () => {
  it("Basic sees the plan gate, not the page", () => {
    st.plan = "basic";
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><EtfPortfolioPage /></MemoryRouter></QueryClientProvider>);
    expect(document.querySelector(".px-strip")).toBeNull();
    expect(screen.getByText("Track your ETFs")).toBeTruthy();
  });
  it("Silver sees the calm top and the steps", async () => {
    st.plan = "silver";
    await show();
    expect(document.querySelectorAll("button.px-vw")).toHaveLength(3);
    expect(document.querySelector(".ptk-plan")!.textContent).toBe("Silver");
  });
});

describe("Task #390 reopened (developer file 39 v4): A2 Key figures closed until clicked, E1 the shared bottom", () => {
  it("A2: in each view Key figures arrives closed with Show ▾, even after an old 'shown' choice in this browser; Show opens it", async () => {
    for (const [url, id] of [["/etf-portfolio", "etp-kf-etfs"], ["/etf-portfolio?view=inside", "etp-kf-inside"], ["/etf-portfolio?view=risk", "etp-kf-risk"]] as const) {
      cleanup(); localStorage.setItem(`finlit.hide.pack.${id}`, "0");
      await show(url);
      const btn = await screen.findByRole("button", { name: "Show: Key figures" });
      expect(btn.textContent).toBe("Show ▾");
      expect(document.querySelectorAll(".ptk-kf-c")).toHaveLength(0);
      fireEvent.click(btn);
      await waitFor(() => expect(document.querySelectorAll(".ptk-kf-c").length).toBeGreaterThan(0));
      expect(document.getElementById(id)).toBeTruthy();
    }
  });
  it("E1: Questions in its folded form, closed on arrival; then the Disclaimer fold, closed; then the sources line", async () => {
    await show();
    const q = await waitFor(() => { const x = document.querySelector("details.pfq-fold.pfq-card") as HTMLDetailsElement; expect(x).toBeTruthy(); return x; });
    const disc = document.querySelector(".pgb details.pgb-disc") as HTMLDetailsElement, src = document.querySelector(".pgb .pgb-src")!;
    expect(q.open).toBe(false); expect(disc.open).toBe(false);
    expect(q.compareDocumentPosition(disc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(disc.compareDocumentPosition(src) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(disc.textContent).toMatch(/Information only, not investment advice/);
    expect(document.querySelector(".mfp-disc")).toBeNull();
  });
});
