// @vitest-environment jsdom
// Trading Lab > Order Flow > Strategy backtest: market-lab's 23 rules on one stock's daily prices from /api/lab/backtest/{symbol}. Every rule
// is shown in its list order (sortable, never sorted by result by default), net of costs with a gross switch, the chosen rule's running total
// in R and its past triggers on the daily chart, hover cards, cards on a phone, 15 triggers then "Show N more", and no advice wording (page and source).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipLayer } from "./FlowTips";
import { StrategyBacktest } from "./StrategyBacktest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LIST_ORDER, NOTE, equity, sortRules, type Backtest, type Figures, type Rule, type Trade } from "../../lib/backtest";

const NAMES = ["20-day breakout", "55-day breakout (Turtle)", "52-week high + volume", "Pullback to 20 EMA", "Pullback to 50 SMA", "RSI(2) dip",
  "3 down days in uptrend", "Close under lower Bollinger", "Volatility squeeze break", "NR7 breakout", "Inside-day breakout", "Bull flag",
  "EMA20/SMA50 cross", "Golden cross", "MACD cross above zero", "Supertrend flip", "ADX trend, dip under 10 EMA", "Rising engulfing candle at 20 EMA",
  "Hammer at a moving average", "Pocket pivot", "Earnings-style gap and go", "VCP tightening break", "RS leader, dip under 10 EMA"];
const days = (n: number) => { const out: string[] = []; const d = new Date("2021-01-04T00:00:00Z"); while (out.length < n) { if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } return out; };
const T = days(600);
const trade = (k: number, r: number): Trade => ({ trigger: T[300 + 10 * k], entry: T[301 + 10 * k], exit: T[305 + 10 * k], entryPrice: 100 + k, lower: 95 + k, upper: null,
  exitPrice: 100 + k + 5 * r, days: 5, how: r > 0 ? "rule" : "lower", riskPct: 5, pctGross: 5 * r, pctNet: 5 * r - 0.34, rGross: r, rNet: Math.round((r - 0.07) * 1000) / 1000 });
const figs = (ts: Trade[], key: "rNet" | "rGross"): Figures => {
  const rs = ts.map((t) => t[key]); const n = rs.length;
  return { trades: n, few: n < 30, winRate: n ? Math.round(1000 * rs.filter((x) => x > 0).length / n) / 10 : null, avgR: n ? rs.reduce((a, b) => a + b, 0) / n : null,
    medianR: n ? [...rs].sort((a, b) => a - b)[Math.floor(n / 2)] : null, totalR: rs.reduce((a, b) => a + b, 0), avgDays: n ? 5 : null,
    worstRun: { count: n ? 2 : 0, from: n ? ts[0].entry : null, to: n ? ts[Math.min(1, n - 1)].exit : null, r: -2 }, drawdown: { r: n ? 1.5 : 0, from: n ? ts[0].exit : null, to: n ? ts[n - 1].exit : null } };
};
const rule = (i: number): Rule => {
  const n = i === 2 ? 32 : i === 20 ? 0 : (i * 7) % 11 + 2;               // rule 3 has 32 trades; rule 21 none
  const ts = Array.from({ length: n }, (_, k) => trade(k, ((k + i) % 3) - 0.6 + i * 0.05));
  return { id: `r${i}`, name: NAMES[i], kind: [5, 6, 7].includes(i) ? "mean reversion" : "trend", trigger: `Trigger of ${NAMES[i]}.`, entry: "The next session's open.",
    lower: "Trigger close minus 2 ATR.", source: `market-lab lab/swing.py s_${i}`, available: i !== 22, note: i === 22 ? "Nifty 50's daily closes could not be read, so this rule could not be tested." : null,
    exitApplies: true, net: figs(ts, "rNet"), gross: figs(ts, "rGross"), running: i === 0 ? 1 : 0, trades: ts, shown: n };
};
const BT: Backtest = {
  status: "ok", symbol: "RELIANCE", version: 1, exit: "trail3",
  exits: [{ id: "trail3", name: "Trailing 3 ATR", rule: "Trails.", meanReversionOnly: false }, { id: "rr3_40", name: "3R or 40 sessions", rule: "3R.", meanReversionOnly: false }],
  coverage: { first: T[0], last: T[599], bars: 600, years: 2.3, testedFrom: T[260], exchangeFrom: T[100], text: "2.3 years of daily prices, 4 Jan 2021 – 15 Apr 2023 (600 sessions).", source: "Sources: exchange candles." },
  costs: { roundTripPct: 0.341, entryPct: 0.1686, exitPct: 0.1724, parts: { entry: [{ name: "STT", pct: 0.1 }], exit: [{ name: "STT", pct: 0.1 }] }, text: "Delivery costs. Net results take the round trip off each trade; gross results do not." },
  fewTrades: 30, prices: { t: T, o: T.map((_, i) => 100 + i / 10), h: T.map((_, i) => 102 + i / 10), l: T.map((_, i) => 98 + i / 10), c: T.map((_, i) => 101 + i / 10) },
  rules: NAMES.map((_, i) => rule(i)), computeMs: 40, cached: false, note: NOTE,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const urls: string[] = [];
let phone = false;
beforeEach(() => {
  urls.length = 0; phone = false;
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: phone && q.includes("560"), addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => { urls.push(String(url));
    if (String(url).includes("/underlyings")) return json({ indices: [], stocks: [{ key: "TATAMOTORS", name: "Tata Motors", securityId: 1, lotSize: 1 }, { key: "NOPE", name: "Delisted Ltd", securityId: 2, lotSize: 1 }], connected: true });
    if (String(url).includes("/NOPE")) return json({ status: "not_found", symbol: "NOPE", detail: "FinLit has no stored daily prices for NOPE." }, 404);
    const exit = new URL(String(url), "http://x").searchParams.get("exit") ?? "trail3";
    return json({ ...BT, exit, symbol: String(url).split("/").pop()!.split("?")[0] }); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><TipLayer><StrategyBacktest /></TipLayer></MemoryRouter></QueryClientProvider>);
const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const point = (el: Element, x = 10) => { const e = new MouseEvent("pointermove", { bubbles: true, clientX: x, clientY: 10 }); Object.defineProperty(e, "pointerType", { value: "mouse" }); fireEvent(el, e); };
const BANNED = [/\bbuy/, /\bsell/, /\bhold\b/, /\btarget/, /\bbest\b/, /\btop\b/, /top pick/, /\bwinning\b/, /forecast/, /recommend/, /\blikely\b/,
  /will (rise|fall)/, /bullish/, /bearish/, /\bsignals?\b/, /\bstop\b/, /stop-loss/];
const ruleNames = () => [...document.querySelectorAll(".bt-table tbody th .bt-pick")].map((b) => b.textContent);

describe("Strategy backtest, the helpers", () => {
  it("keeps the list order by default and sorts any column both ways, rules without trades last", () => {
    expect(sortRules(BT.rules, "net", LIST_ORDER).map((r) => r.name)).toEqual(NAMES);
    const byTrades = sortRules(BT.rules, "net", { key: "trades", dir: "desc" });
    expect(byTrades[0].name).toBe("52-week high + volume");
    const byAvg = sortRules(BT.rules, "net", { key: "avgR", dir: "asc" });
    expect(byAvg[byAvg.length - 1].net.avgR).toBeNull();
  });
  it("the running total starts at 0 and adds each trade's R", () => {
    const e = equity(BT.rules[1].trades, "gross");
    expect(e[0].r).toBe(0);
    expect(e[e.length - 1].r).toBeCloseTo(BT.rules[1].gross.totalR, 2);
  });
});

describe("Strategy backtest, the tab", () => {
  it("reads the Lab's backtest route and lists all 23 rules in their list order, with the note", async () => {
    wrap(); await settle();
    expect(urls.some((u) => u.endsWith("/api/lab/backtest/RELIANCE?exit=trail3"))).toBe(true);
    expect(document.querySelectorAll(".bt-table tbody tr")).toHaveLength(23);
    expect(ruleNames()).toEqual(NAMES);
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /#/ }).getAttribute("aria-sort")).toBe("ascending");
    expect(screen.getAllByText(/2\.3 years of daily prices/).length).toBeGreaterThan(0);
  });
  it("flags fewer than 30 trades plainly and shows an untested rule's reason", async () => {
    wrap(); await settle();
    expect(document.querySelectorAll(".bt-few").length).toBe(21);   // every rule but the one with 32 trades and the untested one
    expect(screen.getByText(/Not tested: Nifty 50's daily closes/)).toBeTruthy();
  });
  it("sorts by a column, flips it, and goes back to the list order", async () => {
    wrap(); await settle();
    const head = screen.getByRole("button", { name: /^Trades/ });
    fireEvent.click(head);
    expect(head.closest("th")!.getAttribute("aria-sort")).toBe("descending");
    expect(ruleNames()[0]).toBe("52-week high + volume");
    fireEvent.click(head);
    expect(head.closest("th")!.getAttribute("aria-sort")).toBe("ascending");
    expect(ruleNames()[0]).toBe("Earnings-style gap and go");
    fireEvent.click(screen.getByRole("button", { name: /^#/ }));
    expect(ruleNames()).toEqual(NAMES);
  });
  it("switches between net and gross results", async () => {
    wrap(); await settle();
    const net = screen.getByRole("button", { name: "Net of costs" }), gross = screen.getByRole("button", { name: "Gross (before costs)" });
    expect(net.getAttribute("aria-pressed")).toBe("true");
    const row = () => document.querySelectorAll(".bt-table tbody tr")[1].textContent;
    const before = row();
    fireEvent.click(gross);
    expect(gross.getAttribute("aria-pressed")).toBe("true"); expect(net.getAttribute("aria-pressed")).toBe("false");
    expect(row()).not.toBe(before);
    expect(screen.getByText(/Gross: before costs/)).toBeTruthy();
  });
  it("draws the chosen rule's trades on the daily chart and its running total, and choosing another rule redraws them", async () => {
    wrap(); await settle();
    expect(document.querySelectorAll(".bt-px .bt-in")).toHaveLength(BT.rules[0].trades.length);
    expect(document.querySelectorAll(".bt-px .bt-out")).toHaveLength(BT.rules[0].trades.length);
    expect(document.querySelectorAll(".bt-eq .bt-eq-dot")).toHaveLength(BT.rules[0].trades.length);
    const pick = screen.getByRole("button", { name: "52-week high + volume" });
    fireEvent.click(pick);
    expect(pick.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll(".bt-px .bt-in")).toHaveLength(32);
    expect(screen.getByRole("heading", { name: /52-week high \+ volume rule 3 of 23/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /with 32 past 52-week high \+ volume trades marked/ })).toBeTruthy();
  });
  it("pointing at a marker, a row or the chart shows its detail", async () => {
    wrap(); await settle();
    point(document.querySelectorAll(".bt-px .bt-in")[0]);
    let pop = screen.getByRole("tooltip");
    expect(within(pop).getByText("Lower exit level")).toBeTruthy(); expect(within(pop).getByText("₹95.00")).toBeTruthy();
    point(document.querySelectorAll(".bt-table tbody tr")[5]);
    pop = screen.getByRole("tooltip");
    expect(within(pop).getByText("RSI(2) dip")).toBeTruthy(); expect(within(pop).getByText(/Rule 6 of 23/)).toBeTruthy();
    point(document.querySelector(".bt-px")!, 400);
    expect(within(screen.getByRole("tooltip")).getByText("Daily candle")).toBeTruthy();
  });
  it("lists 15 past triggers first, then the rest on request", async () => {
    wrap(); await settle();
    fireEvent.click(screen.getByRole("button", { name: "52-week high + volume" }));
    expect(document.querySelectorAll(".bt-sig")).toHaveLength(15);
    fireEvent.click(screen.getByRole("button", { name: "Show 17 more" }));
    expect(document.querySelectorAll(".bt-sig")).toHaveLength(32);
    expect(screen.queryByRole("button", { name: /Show \d+ more/ })).toBeNull();
  });
  it("asks again for another exit and another stock, and says plainly when a stock has no prices", async () => {
    wrap(); await settle();
    fireEvent.click(screen.getByRole("button", { name: "3R or 40 sessions" }));
    await settle();
    expect(urls.some((u) => u.endsWith("/api/lab/backtest/RELIANCE?exit=rr3_40"))).toBe(true);
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a stock" }), { target: { value: "delis" } });
    await settle();
    fireEvent.click(within(screen.getByRole("list", { name: "Matching stocks" })).getByRole("button"));
    await settle();
    expect(screen.getByRole("alert").textContent).toBe("FinLit has no stored daily prices for NOPE.");
  });
  it("on a phone shows a card per rule instead of the table, still in list order", async () => {
    phone = true;
    wrap(); await settle();
    expect(document.querySelector(".bt-table")).toBeNull();
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(23);
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual(NAMES);
    expect(within(cards[2]).getByText("32")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Order of the rules" }), { target: { value: "trades:desc" } });
    expect(screen.getAllByRole("article")[0].getAttribute("aria-label")).toBe("52-week high + volume");
  });
  it("never tells anyone to trade", async () => {
    wrap(); await settle();
    fireEvent.click(document.querySelector(".oflow-how summary")!);
    const text = document.body.textContent!.replaceAll(NOTE, "").toLowerCase();
    for (const w of BANNED) expect(w.test(text), String(w)).toBe(false);
  });
  it("no string in the tab's source or its helpers uses advice wording", () => {
    for (const f of ["components/lab/StrategyBacktest.tsx", "lib/backtest.ts"]) {
      const src = readFileSync(join(process.cwd(), "src", f), "utf8").replaceAll("Past results of fixed rules on past prices; not a forecast or a recommendation.", "");
      // the words people read: quoted strings, template text and JSX text (not identifiers or field names)
      const shown = [...src.matchAll(/"([^"\n]*)"|`([^`]*)`|>([^<>{}\n]+)</g)].map((m) => (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " ")).join(" \n ").toLowerCase();
      for (const w of BANNED) expect(w.test(shown), `${f}: ${w}`).toBe(false);
    }
  });
});
