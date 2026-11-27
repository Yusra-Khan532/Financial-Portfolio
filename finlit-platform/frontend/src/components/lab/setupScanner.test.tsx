// @vitest-environment jsdom
// Trading Lab > Order Flow > Setup scanner: the evening scan from /api/lab/scanner. Before the first run it says so; with a scan it shows the
// matches of all 23 rules in their list order (0 shown as 0), filters by rule, sector, "new today" and F&O, lists 15 rows then "Show N more",
// opens a stock in the Strategy backtest for that rule, shows hover cards, cards on a phone, a stopped-early note, and no advice wording.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TipLayer } from "./FlowTips";
import { SetupScanner } from "./SetupScanner";
import { ALL, NOTE, applyFilters, backtestLink, perRule, rowsOf, sectorsOf, since, type Match, type Scan, type ScanRule } from "../../lib/scanner";

const NAMES = ["20-day breakout", "55-day breakout (Turtle)", "52-week high + volume", "Pullback to 20 EMA", "Pullback to 50 SMA", "RSI(2) dip",
  "3 down days in uptrend", "Close under lower Bollinger", "Volatility squeeze break", "NR7 breakout", "Inside-day breakout", "Bull flag",
  "EMA20/SMA50 cross", "Golden cross", "MACD cross above zero", "Supertrend flip", "ADX trend, dip under 10 EMA", "Rising engulfing candle at 20 EMA",
  "Hammer at a moving average", "Pocket pivot", "Earnings-style gap and go", "VCP tightening break", "RS leader, dip under 10 EMA"];
const IDS = ["breakout20", "breakout55", "high52", "pullback20", "pullback50", "rsi2", "down3", "bblow", "squeeze", "nr7", "inside", "flag", "emacross",
  "golden", "macd", "supertrend", "adx", "engulf", "hammer", "pocket", "gapgo", "vcp", "rsleader"];
const match = (k: number, extra: Partial<Match> = {}): Match => ({
  symbol: `STK${String(k).padStart(2, "0")}`, name: `Stock ${k} Ltd`, sector: ["Financial Services", "Metals & Mining", null][k % 3], industry: "Industry",
  fno: k < 4, day: "2026-11-27", close: 1000 + k, lower: 950 + k, distPct: 4.9, volume: 1_250_000, volAvg: 1_000_000, volRatio: 1.25, bars: 1500,
  past: { trades: k === 0 ? 34 : 12, few: k !== 0, winRate: 58.3, avgR: 0.41, running: 0 }, flags: [], spark: Array.from({ length: 40 }, (_, i) => 960 + i + k),
  new: k % 2 === 0, streak: k % 2 === 0 ? 1 : 3, ...extra,
});
const rule = (i: number, matches: Match[]): ScanRule => ({
  id: IDS[i], name: NAMES[i], kind: [5, 6, 7].includes(i) ? "mean reversion" : "trend", trigger: `Trigger of ${NAMES[i]}.`, lowerRule: "Trigger close minus 2 ATR.",
  volumeRule: false, available: true, note: null, count: matches.length, matches,
});
const SCAN: Scan = {
  status: "ok", ready: true, note: NOTE, version: 1, scannedAt: "2026-11-27T14:20:05+00:00", barsDate: "2026-11-27", previousDate: "2026-11-26",
  universe: 2300, fno: 210, scanned: 2300, checked: 2178, skipped: { tooShort: 98, stale: 24, noData: 0, failed: 0 }, staleDays: {}, notReached: 0, seconds: 25.1,
  stoppedEarly: false, exit: "trail3", exitName: "Trailing 3 ATR", minBars: 400, nifty: true, fewTrades: 30,
  flags: { no_lower: "The lower exit level cannot be worked out.", lower_above: "At or above.", wide_risk: "The lower exit level is more than 25% under the close.", big_move: "A one-day move above 35%." },
  rules: NAMES.map((_, i) => rule(i, i === 0 ? Array.from({ length: 20 }, (_, k) => match(k)) : i === 5 ? [match(30, { new: null, flags: ["big_move"] }), match(31, { sector: "Healthcare", new: true })] : [])),
};
const EMPTY: Scan = { status: "empty", ready: false, note: NOTE, rules: SCAN.rules.map((r) => ({ ...r, count: 0, matches: [] })), flags: SCAN.flags,
  detail: "The scanner has not run yet. It runs each weekday evening once the day's candles are stored (from 19:40 IST)." };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const urls: string[] = [];
let phone = false, body: Scan = SCAN;
beforeEach(() => {
  urls.length = 0; phone = false; body = SCAN;
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: phone && q.includes("560"), addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => { urls.push(String(url)); return json(body); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><TipLayer><SetupScanner /></TipLayer></MemoryRouter></QueryClientProvider>);
const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
const point = (el: Element) => { const e = new MouseEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 }); Object.defineProperty(e, "pointerType", { value: "mouse" }); fireEvent(el, e); };
const rows = () => [...document.querySelectorAll<HTMLElement>(".lsc-table tbody tr")];
const BANNED = [/\bbuy/, /\bsell/, /\bhold\b/, /\btarget/, /\bbest\b/, /\btop\b/, /top pick/, /\bwinning\b/, /forecast/, /recommend/, /\blikely\b/,
  /will (rise|fall)/, /bullish/, /bearish/, /\bsignals?\b/, /\bstop\b/, /stop-loss/];

describe("Setup scanner, the helpers", () => {
  it("rows keep the rules' list order and then the symbol; filters combine; every rule is counted, 0 included", () => {
    const r = rowsOf(SCAN);
    expect(r).toHaveLength(22);
    expect(r[0].rule.id).toBe("breakout20"); expect(r[20].rule.id).toBe("rsi2");
    expect(applyFilters(r, { ...ALL, rule: "rsi2" })).toHaveLength(2);
    expect(applyFilters(r, { ...ALL, fresh: true }).every((x) => x.new === true)).toBe(true);
    expect(applyFilters(r, { ...ALL, fno: true, sector: "Financial Services" }).map((x) => x.symbol)).toEqual(["STK00", "STK03"]);
    const per = perRule(SCAN, r);
    expect(per).toHaveLength(23); expect(per.map((p) => p.count)).toEqual(SCAN.rules.map((x) => x.count)); expect(per[1].count).toBe(0);
    expect(sectorsOf(r)).toEqual(["Financial Services", "Healthcare", "Metals & Mining", "Sector not stated"]);
    expect(since(match(1), "2026-11-26").label).toBe("Also yesterday");
    expect(since(match(0), "2026-11-26").label).toBe("New today");
    expect(since(match(5, { new: null }), null).title).toBe("No earlier session is stored to compare with.");
    expect(backtestLink("M&M", "rsi2")).toBe("/lab/flow?view=backtest&symbol=M%26M&rule=rsi2");
  });
});

describe("Setup scanner, the tab", () => {
  it("before the first run it says so plainly", async () => {
    body = EMPTY;
    wrap(); await settle();
    expect(urls.some((u) => u.endsWith("/api/lab/scanner"))).toBe(true);
    expect(screen.getByRole("heading", { name: "No scan yet" })).toBeTruthy();
    expect(screen.getByText(/has not run yet/)).toBeTruthy();
    expect(document.querySelector(".lsc-table")).toBeNull();
    expect(screen.getByText(NOTE)).toBeTruthy();
  });
  it("shows every rule's matches in list order, zero as 0, with the scan's coverage", async () => {
    wrap(); await settle();
    const bars = within(screen.getByRole("list", { name: "Matches per rule" })).getAllByRole("button");
    expect(bars).toHaveLength(23);
    expect(bars.map((b) => b.querySelector(".lsc-bar-n")!.textContent)).toEqual(NAMES);
    expect(bars.map((b) => b.querySelector(".lsc-bar-c")!.textContent)).toEqual(SCAN.rules.map((r) => String(r.count)));
    expect(bars[1].getAttribute("aria-label")).toBe("55-day breakout (Turtle): 0 stocks");
    expect(screen.getByText(/Universe: 2,300 NSE stocks with stored daily candles \(210 F&O\)/)).toBeTruthy();
    expect(screen.getByText(/skipped 98 with fewer than 400 sessions of daily prices, 24 with no candle on 27 Nov 2026/)).toBeTruthy();
  });
  it("lists 15 rows first, then the rest on request", async () => {
    wrap(); await settle();
    expect(rows()).toHaveLength(15);
    fireEvent.click(screen.getByRole("button", { name: "Show 7 more" }));
    expect(rows()).toHaveLength(22);
    expect(screen.queryByRole("button", { name: /Show \d+ more/ })).toBeNull();
  });
  it("filters by rule (from the select or the summary), sector, new today and F&O", async () => {
    wrap(); await settle();
    fireEvent.change(screen.getByRole("combobox", { name: "Rule" }), { target: { value: "rsi2" } });
    expect(rows().map((r) => r.querySelector(".lsc-stock")!.textContent)).toEqual(["STK30", "STK31"]);
    const bar = screen.getByRole("button", { name: "RSI(2) dip: 2 stocks" });
    expect(bar.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(bar);
    expect(bar.getAttribute("aria-pressed")).toBe("false");
    expect(rows()).toHaveLength(15);
    fireEvent.change(screen.getByRole("combobox", { name: "Sector" }), { target: { value: "Healthcare" } });
    expect(rows().map((r) => r.querySelector(".lsc-stock")!.textContent)).toEqual(["STK31"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    const fresh = screen.getByRole("button", { name: "New today" });
    fireEvent.click(fresh);
    expect(fresh.getAttribute("aria-pressed")).toBe("true");
    expect(rows().every((r) => r.textContent!.includes("New today"))).toBe(true);
    fireEvent.click(fresh);
    fireEvent.click(screen.getByRole("button", { name: "F&O only" }));
    expect(rows()).toHaveLength(4);
    fireEvent.change(screen.getByRole("combobox", { name: "Rule" }), { target: { value: "golden" } });
    expect(screen.getByText("No match with these filters.")).toBeTruthy();
  });
  it("a stock opens the Strategy backtest for that rule; fewer than 30 trades is said plainly", async () => {
    wrap(); await settle();
    const link = screen.getByRole("link", { name: "STK00: 20-day breakout in the Strategy backtest" });
    expect(link.getAttribute("href")).toBe("/lab/flow?view=backtest&symbol=STK00&rule=breakout20");
    expect(within(rows()[0]).queryByText("fewer than 30 trades")).toBeNull();          // 34 trades
    expect(within(rows()[1]).getByText("fewer than 30 trades")).toBeTruthy();
    expect(within(rows()[1]).getByText("Also yesterday")).toBeTruthy();
    expect(within(rows()[1]).getByText("3 sessions in a row")).toBeTruthy();
    expect(rows()[0].querySelector("svg[data-chart='lsc-spark']")!.getAttribute("aria-label")).toMatch(/STK00: last 40 closes, ₹960.00 to ₹999.00; lower exit level ₹950.00/);
  });
  it("pointing at a row or a rule shows its detail", async () => {
    wrap(); await settle();
    point(rows()[0]);
    let pop = screen.getByRole("tooltip");
    expect(within(pop).getByText("Lower exit level")).toBeTruthy(); expect(within(pop).getByText("₹950.00")).toBeTruthy();
    expect(within(pop).getByText(/This rule's past results on STK00/)).toBeTruthy();
    point(screen.getByRole("button", { name: "RSI(2) dip: 2 stocks" }));
    pop = screen.getByRole("tooltip");
    expect(within(pop).getByText(/Rule 6 of 23/)).toBeTruthy(); expect(within(pop).getByText(/1 of 2 new today/)).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Rule" }), { target: { value: "rsi2" } });
    point(rows()[0]);
    expect(within(screen.getByRole("tooltip")).getByText("A one-day move above 35%.")).toBeTruthy();       // a flag says why plainly
  });
  it("on a phone shows a card per match instead of the table", async () => {
    phone = true;
    wrap(); await settle();
    expect(document.querySelector(".lsc-table")).toBeNull();
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(15);
    expect(cards[0].getAttribute("aria-label")).toBe("STK00, 20-day breakout");
    expect(within(cards[0]).getByRole("link", { name: "Open in Strategy backtest" }).getAttribute("href")).toBe("/lab/flow?view=backtest&symbol=STK00&rule=breakout20");
  });
  it("a scan stopped at its time limit says how far it got", async () => {
    body = { ...SCAN, status: "partial", stoppedEarly: true, scanned: 1200, notReached: 1100, stoppedNote: "Stopped early after 1,200 of 2,300 stocks: the scan reached its 12-minute time limit." };
    wrap(); await settle();
    expect(screen.getByText(/Stopped early after 1,200 of 2,300 stocks/)).toBeTruthy();
  });
  it("never tells anyone to trade", async () => {
    wrap(); await settle();
    fireEvent.click(document.querySelector(".oflow-how summary")!);
    point(rows()[0]);
    const text = document.body.textContent!.replaceAll(NOTE, "").toLowerCase();
    for (const w of BANNED) expect(w.test(text), String(w)).toBe(false);
  });
  it("no string in the tab's source or its helpers uses advice wording", () => {
    for (const f of ["components/lab/SetupScanner.tsx", "lib/scanner.ts"]) {
      const src = readFileSync(join(process.cwd(), "src", f), "utf8").replaceAll(NOTE, "");
      const shown = [...src.matchAll(/"([^"\n]*)"|`([^`]*)`|>([^<>{}\n]+)</g)].map((m) => (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " ")).join(" \n ").toLowerCase();
      for (const w of BANNED) expect(w.test(shown), `${f}: ${w}`).toBe(false);
    }
  });
});
