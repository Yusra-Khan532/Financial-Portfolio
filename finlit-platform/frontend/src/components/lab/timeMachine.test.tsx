// @vitest-environment jsdom
// Trading Lab > Order Flow > Time Machine: the tab, the form's checks (the server's rules, as you type), the outcome bar, the fan chart, the
// histogram, the past-session table (cards on a phone), the error and waiting states, hover cards, and describe-only words.
import { readFileSync } from "node:fs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = { ready: true, user: { id: "u1", email: "m@example.com", role: "investor" } as unknown, features: ["trading_lab"] as string[] };
vi.mock("../../lib/auth", () => ({ useAuth: () => auth }));
import { FLOW_TABS, OrderFlowPage } from "../../pages/OrderFlow";
import { TipLayer } from "./FlowTips";
import { TimeMachine } from "./TimeMachine";
import { checkPlan, istToday, nextWeekday, sampleLine, tick, type PlanForm, type TmResult } from "../../lib/timemachine";

const RESULT: TmResult = {
  status: "ok", version: "tm-1", seed: "1234567890123", cached: false, name: "Reliance Industries",
  plan: { symbol: "RELIANCE", date: "2026-11-27", start: "09:15", flatBy: "09:30", price: 1000, lower: 990, upper: 1010, lowerPct: -1, upperPct: 1 },
  sample: { sessions: 58, from: "2026-08-12", to: "2026-11-25", dropped: 1, replays: 10000, blockMinutes: 30, barMinutes: 5 },
  outcomes: { upper: 3412, lower: 2988, both: 100, neither: 3500 },
  medianBars: { any: 2, upper: 2, lower: 3 },
  histogram: { edges: [980, 990, 1000, 1010, 1020], counts: [1000, 4000, 4000, 1000], median: 1000.5 },
  fan: { times: ["09:15", "09:20", "09:25", "09:30"], p5: [1000, 994, 990, 986], p25: [1000, 998, 996, 995], p50: [1000, 1000, 1001, 1001],
    p75: [1000, 1002, 1004, 1006], p95: [1000, 1006, 1010, 1014] },
  past: {
    rows: [
      { date: "2026-11-21", start: 990, lower: 980.1, upper: 999.9, outcome: "upper", touchAt: "09:20", end: 1001, changePct: 1.11, bars: 75 },
      { date: "2026-11-24", start: 1000, lower: 990, upper: 1010, outcome: "neither", touchAt: null, end: 1002, changePct: 0.2, bars: 72 },
      { date: "2026-11-25", start: 1005, lower: 994.95, upper: 1015.05, outcome: "lower", touchAt: "09:25", end: 990, changePct: -1.49, bars: 75 },
    ],
    totals: { upper: 14, lower: 20, both: 2, neither: 22, sessions: 58 },
  },
  text: { labels: { upper: "Upper level first", lower: "Lower level first", both: "Both in one bar (order unknown)", neither: "Neither by 09:30" },
    note: "Describes how the stock moved in the past; not a forecast or a recommendation.", method: "Each replay walks the 5-minute bars in blocks of 30 minutes." },
};
const RSI = { ready: true, takenAt: "x", asOf: "x", stale: false, period: 14, minBars: 50, timeframes: [], sectors: [], counts: {}, note: "",
  stocks: [{ sym: "RELIANCE", name: "Reliance Industries", sector: "Energy", price: 1000.02 }] };
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
let answer: () => Response = () => json(200, RESULT);
let sent: unknown[] = [];
beforeEach(() => {
  sent = [];
  answer = () => json(200, RESULT);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/api/lab/access")) return json(200, { access: true, reason: "granted", expiresAt: null, signals: false });
    if (u.includes("/api/lab/rsi")) return json(200, RSI);
    if (u.includes("/api/lab/timemachine")) { sent.push(JSON.parse(String(init?.body))); return answer(); }
    return json(404, {});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><TipLayer><TimeMachine /></TipLayer></MemoryRouter></QueryClientProvider>);
const point = (el: Element) => { const e = new MouseEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 }); Object.defineProperty(e, "pointerType", { value: "mouse" }); fireEvent(el, e); };
const input = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
const type = (name: string, v: string) => { fireEvent.change(input(name), { target: { value: v } }); fireEvent.blur(input(name)); };
const fill = async () => {
  type("symbol", "RELIANCE");
  type("date", "2026-11-27");
  type("flatBy", "09:30");
  await settle();
};
const run = async () => { await fill(); fireEvent.click(screen.getByRole("button", { name: "Replay 10,000 times" })); await settle(); };
const phone = (on: boolean) => vi.stubGlobal("matchMedia", (q: string) => ({ matches: on && q.includes("560"), media: q, addEventListener: () => {}, removeEventListener: () => {} }));

const FORM: PlanForm = { symbol: "RELIANCE", date: "2026-11-27", start: "09:15", flatBy: "15:15", price: "1000", lower: "990", upper: "1010" };
const TODAY = "2026-11-26";

describe("Time Machine, the checks (the server's rules)", () => {
  it("a good plan has no fault; prices go to the 0.05 step", () => {
    expect(checkPlan(FORM, TODAY)).toEqual({});
    expect([tick(1000.02), tick(99.03), tick(101.08)]).toEqual([1000, 99.05, 101.1]);
    expect(nextWeekday("2026-11-28")).toBe("2026-11-30");
    expect(istToday(new Date("2026-11-26T20:00:00Z"))).toBe("2026-11-27");          // 01:30 in India
  });
  it.each([
    [{ symbol: "" }, "symbol"], [{ date: "2026-11-28" }, "date"], [{ date: "2026-12-07" }, "date"], [{ start: "09:10" }, "start"], [{ start: "09:17" }, "start"],
    [{ flatBy: "09:15" }, "flatBy"], [{ flatBy: "15:35" }, "flatBy"], [{ flatBy: "15:17" }, "flatBy"], [{ price: "0" }, "price"], [{ lower: "1001" }, "lower"],
    [{ upper: "999" }, "upper"], [{ lower: "999.5" }, "lower"], [{ upper: "1210" }, "upper"],
  ] as [Partial<PlanForm>, keyof PlanForm][])("%j is a fault of %s", (kw, field) => {
    expect(Object.keys(checkPlan({ ...FORM, ...kw }, TODAY))).toEqual([field]);
  });
  it("a stock outside the list is a fault once the list is known", () => {
    expect(checkPlan({ ...FORM, symbol: "ZZZ" }, TODAY, new Set(["RELIANCE"])).symbol).toMatch(/not in the F&O list/);
  });
  it("the sample line", () => {
    expect(sampleLine(RESULT)).toBe("58 sessions, 12 Aug–25 Nov 2026 (1 left out for a corporate action); 10,000 replays; seed 1234567890123");
  });
});

describe("Time Machine, the tab", () => {
  it("is a ready tab after the RSI heatmap and opens from /lab/flow?view=timemachine", async () => {
    const ids = FLOW_TABS.map((t) => t.id);
    expect(ids.indexOf("timemachine")).toBe(ids.indexOf("rsi") + 1);
    expect(ids.indexOf("timemachine")).toBeLessThan(ids.indexOf("journal"));
    expect(FLOW_TABS.find((t) => t.id === "timemachine")).toEqual({ id: "timemachine", name: "Time Machine", ready: true });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/lab/flow?view=timemachine"]}><OrderFlowPage /></MemoryRouter></QueryClientProvider>);
    await settle();
    expect(screen.getByRole("heading", { name: "Time Machine", level: 2 })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Time Machine" }).getAttribute("aria-current")).toBe("page");
  });

  it("checks the form as you type and sends nothing with a fault", async () => {
    wrap(); await settle();
    fireEvent.click(screen.getByRole("button", { name: "Replay 10,000 times" }));
    expect(screen.getByText("Choose an NSE F&O stock.")).toBeTruthy();
    expect(input("symbol").getAttribute("aria-invalid")).toBe("true");
    type("symbol", "RELIANCE"); await settle();
    expect(input("price").value).toBe("1000");                                     // the latest price, levels 1% either side
    expect([input("lower").value, input("upper").value]).toEqual(["990", "1010"]);
    type("upper", "990");
    expect(screen.getByText("The upper level is above the start price.")).toBeTruthy();
    type("upper", "1300");
    expect(screen.getByText(/0.1% to 20% from the start price \(this one is 30.00%\)/)).toBeTruthy();
    type("upper", "1010");
    type("date", "2026-11-28");
    expect(screen.getByText(/Choose a weekday/)).toBeTruthy();
    type("start", "09:10");
    expect(screen.getByText(/09:15 or later/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Replay 10,000 times" }));
    expect(sent).toEqual([]);
  });

  it("sends the rounded plan and shows the outcome bar, the fan, the histogram and every past session", async () => {
    phone(false);
    wrap(); await settle();
    await run();
    expect(sent).toEqual([{ symbol: "RELIANCE", date: "2026-11-27", start: "09:15", flatBy: "09:30", price: 1000, lower: 990, upper: 1010 }]);
    expect(screen.getByText("Upper level first in 3,412 of 10,000 replays")).toBeTruthy();
    expect(screen.getByText("Both in one bar (order unknown) in 100 of 10,000 replays")).toBeTruthy();
    expect(screen.getByText("Neither by 09:30 in 3,500 of 10,000 replays")).toBeTruthy();
    expect(screen.getByText(/58 sessions, 12 Aug–25 Nov 2026.*10,000 replays; seed 1234567890123/)).toBeTruthy();
    const segs = document.querySelectorAll(".tm-seg");
    expect(segs.length).toBe(4);
    expect((segs[0] as HTMLElement).style.flexGrow).toBe("3412");
    // the fan: two bands, the median, dashed start and levels, a time axis
    const fan = document.querySelector("svg.tm-fan")!;
    expect(fan.getAttribute("role")).toBe("img");
    expect(fan.querySelectorAll(".tm-band").length).toBe(2);
    expect(fan.querySelector(".tm-mid")).toBeTruthy();
    expect([...fan.querySelectorAll(".tm-lvl text")].map((t) => t.textContent)).toEqual(["Upper ₹1,010.00", "Start ₹1,000.00", "Lower ₹990.00"]);
    expect([...fan.querySelectorAll(".tm-tx")].map((t) => t.textContent)).toEqual(["09:15", "09:20", "09:25", "09:30"]);
    point(fan);
    const t = screen.getByRole("tooltip");
    expect(within(t).getByText("95th percentile")).toBeTruthy();
    expect(within(t).getByText("09:15")).toBeTruthy();
    fireEvent.pointerLeave(fan);
    expect(screen.queryByRole("tooltip")).toBeNull();
    // the histogram
    const bins = document.querySelectorAll(".tm-bin");
    expect(bins.length).toBe(4);
    expect(bins[0].getAttribute("class")).toMatch(/loss/);
    expect(bins[3].getAttribute("class")).toMatch(/gain/);
    point(bins[1]);
    expect(within(screen.getByRole("tooltip")).getByText("₹990.00 to ₹1,000.00")).toBeTruthy();
    fireEvent.pointerLeave(bins[1]);
    // every past session: newest first, the totals, a card on a row
    expect(screen.getByText("Upper first on 14 of 58 past sessions")).toBeTruthy();
    const rows = [...document.querySelectorAll(".tm-table tbody tr")];
    expect(rows.map((r) => r.querySelector("th")!.textContent)).toEqual(["25 Nov 2026", "24 Nov 2026", "21 Nov 2026"]);
    expect(rows[0].textContent).toContain("Lower first");
    expect(rows[0].textContent).toContain("09:25");
    expect(rows[0].textContent).toContain("−1.49%");
    point(rows[0]);
    expect(within(screen.getByRole("tooltip")).getByText("75 of 75")).toBeTruthy();
    expect(within(screen.getByRole("tooltip")).getByText("Lower level first at 09:25")).toBeTruthy();
  });

  it("lists the latest 15 past sessions first, then 15 more at a time", async () => {
    phone(false);
    const rows = Array.from({ length: 40 }, (_, i) => ({ date: `2026-10-${String(i % 28 + 1).padStart(2, "0")}`.replace(/10-(\d+)$/, (_m, d) => (i < 28 ? `10-${d}` : `11-${String(i - 27).padStart(2, "0")}`)),
      start: 1000, lower: 990, upper: 1010, outcome: "neither", touchAt: null, end: 1000, changePct: 0, bars: 75 }));
    answer = () => json(200, { ...RESULT, past: { ...RESULT.past, rows } });
    wrap(); await settle();
    await run();
    expect(document.querySelectorAll(".tm-table tbody tr")).toHaveLength(15);
    fireEvent.click(screen.getByRole("button", { name: "Show 15 more of 40 sessions" }));
    expect(document.querySelectorAll(".tm-table tbody tr")).toHaveLength(30);
    fireEvent.click(screen.getByRole("button", { name: "Show 10 more of 40 sessions" }));
    expect(document.querySelectorAll(".tm-table tbody tr")).toHaveLength(40);
    expect(screen.queryByRole("button", { name: /more of 40 sessions/ })).toBeNull();
  });
  it("every chart and the table carry the enlarge button", async () => {
    phone(false);
    wrap(); await settle();
    await run();
    expect(screen.getByRole("button", { name: "Enlarge chart: Time Machine replays" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enlarge chart: Time Machine price at the flat-by time" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enlarge table: Time Machine past sessions" })).toBeTruthy();
  });

  it("on a phone the past sessions are cards, not a table", async () => {
    phone(true);
    wrap(); await settle();
    await run();
    expect(document.querySelector(".tm-table")).toBeNull();
    const cards = document.querySelectorAll(".tm-card");
    expect(cards.length).toBe(3);
    expect(cards[0].textContent).toContain("25 Nov 2026");
    expect(cards[0].textContent).toContain("Lower first");
  });

  it("shows the server's field fault at its field, and the waiting and busy states", async () => {
    answer = () => json(422, { status: "invalid", field: "date", detail: "Choose a weekday after 2026-09-01: the replays need 20 full sessions before the date." });
    wrap(); await settle();
    await run();
    expect(screen.getByText(/Choose a weekday after 2026-09-01/)).toBeTruthy();
    expect(input("date").getAttribute("aria-invalid")).toBe("true");
    cleanup();
    answer = () => json(200, { status: "no_history", symbol: "RELIANCE", sessions: 12, needed: 20, detail: "12 full sessions of 5-minute bars stored before 2026-11-27; the replays need 20. The 60-session store fills after the close each weekday." });
    wrap(); await settle();
    await run();
    expect(screen.getByText("Not enough past sessions yet")).toBeTruthy();
    expect(screen.getByText(/The 60-session store fills after the close each weekday/)).toBeTruthy();
    cleanup();
    answer = () => json(429, { status: "rate_limited", detail: "At most 6 new replays a minute and 30 an hour.", retryAfter: 40 }, { "Retry-After": "40" });
    wrap(); await settle();
    await run();
    expect(screen.getByRole("alert").textContent).toMatch(/Try again in 40 seconds/);
    cleanup();
    answer = () => json(404, { status: "not_listed", detail: "RELIANCE is not in the NSE F&O list our intraday source carries." });
    wrap(); await settle();
    await run();
    expect(screen.getByText(/not in the NSE F&O list/)).toBeTruthy();
    expect(input("symbol").getAttribute("aria-invalid")).toBe("true");
    cleanup();
    answer = () => json(500, {});
    wrap(); await settle();
    await run();
    expect(screen.getByRole("alert").textContent).toMatch(/could not be worked out/);
  });

  it("says it describes the past, and never tells anyone what to do", async () => {
    phone(false);
    wrap(); await settle();
    await run();
    const note = "Describes how the stock moved in the past; not a forecast or a recommendation.";
    expect(document.body.textContent).toContain(note);
    expect(document.querySelector("details.oflow-how")).toBeTruthy();
    const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
    const text = [document.body.textContent ?? "", strip(readFileSync("src/components/lab/TimeMachine.tsx", "utf8")), strip(readFileSync("src/lib/timemachine.ts", "utf8"))]
      .join(" ").split(note).join(" ").replace(/e\.target/g, "").toLowerCase();
    for (const w of [/\blikely\b/, /\bprobab/, /\bbest\b/, /\btarget/, /\bbuy\b/, /\bsell\b/, /\bshould\b/, /forecast/, /signal/, /\bodds\b/, /\brecommend/]) expect(text).not.toMatch(w);
  });

  it("the styles use tokens, an opaque pop-up, and room for the enlarge button; reduced motion stays the last motion block", () => {
    const css = readFileSync("src/styles/orderflow.css", "utf8");
    const tm = css.slice(css.indexOf("/* ---- Time Machine"));
    expect(tm.length).toBeGreaterThan(1000);
    expect(tm).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|font-weight: 800|prefers-reduced-motion/i);
    for (const m of tm.matchAll(/border-radius: ([^;]+);/g)) expect(m[1]).toMatch(/^(var\(--(ui-r-mark|r-ctl|r-card|ui-r-pill)\)|0)$/);
    for (const m of tm.matchAll(/font-size: ([^;]+);/g)) expect(m[1]).toMatch(/^var\(--fs-\d+\)$/);
    expect(tm).toMatch(/\.cz:not\(\.cz-boxed\) > \.cz-slot \.tm-chart \{ padding-right: 46px; \}/);
    expect(tm).toMatch(/\.cz:not\(\.cz-boxed\) > \.cz-slot \.tm-chart \{ padding-right: 0; padding-top: 44px; \}/);
    expect(tm).toMatch(/\.tm-block-h \{ padding-right: 46px;/);
    expect(css.match(/\.oflow-pop \{([^}]*)\}/)![1]).toMatch(/background: var\(--ov-surface\)/);
    expect(css.lastIndexOf("@media (prefers-reduced-motion: reduce)")).toBeLessThan(css.indexOf("/* ---- Time Machine"));
  });
});
