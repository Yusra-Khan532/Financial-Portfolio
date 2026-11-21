// FinLit AI without a language model (task #138, founder, 14 Nov 2026: "remove the work of this Gemini key and only put whatever the question we have
// mentioned ... within seconds the answer what we have given"). Every listed question answers at once:
//   - general questions (concepts, platform, market, the explorer topics) from written text (askFlow.writtenAnswer);
//   - company questions from the company's own FinLit figures (the same stored report sections the company page reads), filled into a fixed sentence,
//     with the period and source of every figure. A figure FinLit does not have is never guessed: the answer says plainly that it is not held.
// Nothing here advises: figures are described, never judged as a reason to buy or sell.
import { apiGet } from "./api";
import { capSize, cr, dateIN, MINUS, nf } from "./format";
import suggestions from "../content/questionSuggestions.json";
import { STARTERS, SECOND } from "./questionBank";
import { RETIRED_SCORE_ANSWER, asksRetiredScore } from "./retiredScore";
import { MARKET_QUESTIONS, writtenAnswer, type Q } from "./askFlow";
import { EXPLORER_ANSWERS, TOPICS } from "./askExplorer";
import { LEVELS, LEVEL_LABEL, fetchClassification, type Classification } from "./taxonomy";

/** Every company question of the question bank: the company list and every group's questions, typed once (TypeScript 7 no longer widens the two JSON shapes to one). */
export type BankQuestion = { id: string; text: string; needsSecondCompany?: boolean; lendersOnly?: boolean };
export const COMPANY_QUESTIONS: readonly BankQuestion[] = [...suggestions.company, ...suggestions.groups.flatMap((g): readonly BankQuestion[] => g.items)];

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;
export type Answer = { text: string; link?: { to: string; label: string } };

export const COMPANY_DISCLAIMER = "Describes the company's financial health from its filings and prices; not a recommendation. Information only, not investment advice.";

// ---------------------------------------------------------------------------------------------------------------- data (cached for the visit)
const cache = new Map<string, Promise<J | null>>();
export const clearAnswerCache = () => cache.clear();
const get = (sym: string, path: string): Promise<J | null> => {
  const key = sym + path;
  if (!cache.has(key)) cache.set(key, apiGet<J>(`/api/stocks/${encodeURIComponent(sym)}${path}`).catch(() => { cache.delete(key); return null; }));
  return cache.get(key)!;
};
type Part = "summary" | "fin" | "ratios" | "own" | "events" | "peers" | "price" | "stats" | "scores" | "max" | "cls";
const PATH: Record<Exclude<Part, "cls">, string> = { summary: "", fin: "/financials", ratios: "/ratios", own: "/ownership", events: "/events", peers: "/peers", price: "/price?range=1Y",
  stats: "/stats", scores: "/score-history", max: "/price?range=MAX" };
type D = Partial<Record<Part, J | null>>;
/** NSE's four levels of a company (task #192), cached like the report parts; null when it is not classified yet. */
const classified = (sym: string): Promise<J | null> => {
  const key = sym + "|cls";
  if (!cache.has(key)) cache.set(key, fetchClassification(sym).then((c) => c as unknown as J).catch(() => { cache.delete(key); return null; }));
  return cache.get(key)!;
};
async function load(sym: string, parts: Part[]): Promise<D> {
  const got = await Promise.all(parts.map((p) => (p === "cls" ? classified(sym) : get(sym, PATH[p]))));
  return Object.fromEntries(parts.map((p, i) => [p, got[i]]));
}

// ---------------------------------------------------------------------------------------------------------------- formatting
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const sgn = (v: number, d = 1) => (v > 0 ? "+" : v < 0 ? MINUS : "") + nf(Math.abs(v), d);
const p1 = (v: number | null | undefined, d = 1) => (isNum(v) ? (v < 0 ? MINUS : "") + nf(Math.abs(v), d) + "%" : "not available");
const x2 = (v: number | null | undefined) => (isNum(v) ? (v < 0 ? MINUS : "") + nf(Math.abs(v), 2) + "×" : "not available");
const rs = (v: number | null | undefined) => (isNum(v) ? (v < 0 ? MINUS : "") + "₹" + cr(Math.abs(v)) + " Cr" : "not available");
const days = (v: number | null | undefined) => (isNum(v) ? (v < 0 ? MINUS : "") + nf(Math.abs(v), 0) + " days" : "not available");
/** A change in percent with its sign (+4.2%, −3.1%). */
const pc = (v: number | null | undefined, d = 1) => (isNum(v) ? sgn(v, d) + "%" : "not available");
/** An ISO date as the site writes it (5 Jun 2026); anything else as it came. */
const day = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? dateIN(iso.slice(0, 10)) : iso || "–");
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);
/** The last n (period, value) pairs of a table row that have a value. */
function last(table: J, row: string, n: number): { p: string; v: number }[] {
  const ps: string[] = table?.periods ?? [], vs: (number | null)[] = table?.rows?.[row] ?? [];
  return ps.map((p, i) => ({ p, v: vs[i] as number })).filter((x) => isNum(x.v)).slice(-n);
}
const seq = (xs: { p: string; v: number }[], f: (v: number) => string) => xs.map((x) => `${x.p} ${f(x.v)}`).join(", ");
const trendWord = (xs: { v: number }[]) => {
  if (xs.length < 2) return "";
  const a = xs[0].v, b = xs[xs.length - 1].v;
  return b > a ? "up" : b < a ? "down" : "unchanged";
};
const latest = (r: J, key: string): { value: number; period: string } | null => (isNum(r?.latest?.[key]?.value) ? r.latest[key] : null);
const basis = (fin: J) => (fin?.meta?.statement === "standalone" ? "standalone" : "consolidated");
const srcFin = (fin: J, kind = "statements") => `Source: FinLit, the company's ${basis(fin)} ${kind}.`;
const priceAsOf = (s: J) => { const a = s?.quote?.asOf; return a ? new Date(a).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : null; };
const notHeld = (what: string, sym: string, to: string, label: string): Answer => ({ text: `FinLit does not have ${what} for ${sym} yet, so this cannot be answered from its data. ${COMPANY_DISCLAIMER}`, link: { to, label } });
const out = (lines: (string | number | false | null | undefined)[], link?: Answer["link"]): Answer => ({ text: [...lines.filter((l): l is string => typeof l === "string" && l.length > 0), COMPANY_DISCLAIMER].join("\n"), link });
const cagr = (a: number, b: number, years: number) => (a > 0 && b > 0 && years > 0 ? (Math.pow(b / a, 1 / years) - 1) * 100 : null);
const report = (sym: string, hash = "") => `/stocks/${encodeURIComponent(sym)}${hash}`;

// ---------------------------------------------------------------------------------------------------------------- the company questions
type Fn = (sym: string, d: D, extra: { second?: string; d2?: D; quarter?: number; fy?: string }) => Answer;
type Rule = { parts: Part[]; fn: Fn };

const revenueYears: Fn = (sym, d) => {
  const y = last(d.fin?.yearly?.pl, "revenue", 5), q = last(d.fin?.quarterly?.pl, "revenue", 8);
  if (!y.length && !q.length) return notHeld("revenue figures", sym, report(sym, "#financials"), "Open the company's financials");
  return out([`${sym}'s revenue, last ${y.length} years: ${seq(y, rs)}.`, q.length && `Last ${q.length} quarters: ${seq(q, rs)}.`, srcFin(d.fin)], { to: report(sym, "#financials"), label: "See the Profit & Loss" });
};
const revenueCagr: Fn = (sym, d) => {
  const r3 = latest(d.ratios, "revenue_cagr_3y"), r5 = latest(d.ratios, "revenue_cagr_5y"), y = last(d.fin?.yearly?.pl, "revenue", 11);
  const ten = y.length >= 11 ? cagr(y[0].v, y[10].v, 10) : null;
  return out([`${sym}'s revenue grew ${p1(r3?.value)} a year over 3 years and ${p1(r5?.value)} a year over 5 years.`,
    ten != null ? `Over 10 years: ${p1(ten)} a year (${y[0].p} to ${y[10].p}).` : `A 10-year rate needs 11 years of revenue; FinLit has ${last(d.fin?.yearly?.pl, "revenue", 99).length}.`, srcFin(d.fin)]);
};
const ebitdaTrend: Fn = (sym, d) => {
  const op = last(d.fin?.yearly?.pl, "operating_profit", 5), m = last(d.ratios?.history, "operating_margin", 5);
  if (!op.length) return notHeld("operating profit", sym, report(sym, "#financials"), "Open the company's financials");
  return out([`${sym}'s operating profit (EBITDA): ${seq(op, rs)}.`, m.length && `Operating margin: ${seq(m, (v) => p1(v))} (${trendWord(m)} over the period).`, srcFin(d.fin)]);
};
const profitCagr: Fn = (sym, d) => {
  const a = latest(d.ratios, "profit_cagr_3y"), b = latest(d.ratios, "profit_cagr_5y"), np = last(d.fin?.yearly?.pl, "net_profit", 6);
  return out([`${sym}'s net profit grew ${p1(a?.value)} a year over 3 years and ${p1(b?.value)} a year over 5 years.`, np.length && `Net profit by year: ${seq(np, rs)}.`, srcFin(d.fin)]);
};
function quarterLine(sym: string, d: D, want?: number, fy?: string): string[] {
  const q = d.fin?.quarterly?.pl; const ps: string[] = q?.periods ?? [];
  if (!ps.length) return [];
  let i = ps.length - 1;
  if (want) {   // Indian financial year: Q1 ends Jun, Q2 Sep, Q3 Dec, Q4 Mar; FY27 Q1 = Jun 2026
    const month = ["Jun", "Sep", "Dec", "Mar"][want - 1], fyEnd = fy ? 2000 + Number(fy.slice(2)) : null;
    const year = fyEnd == null ? null : want === 4 ? fyEnd : fyEnd - 1;
    const found = ps.findIndex((p) => p.startsWith(month) && (year == null || p.endsWith(String(year))));
    const lastOfMonth = ps.map((p, k) => (p.startsWith(month) ? k : -1)).filter((k) => k >= 0).pop();
    i = found >= 0 ? found : year == null && lastOfMonth != null ? lastOfMonth : -1;
    if (i < 0) return [`FinLit has no results for Q${want}${fy ? " " + fy : ""} of ${sym}; its latest quarter is ${ps[ps.length - 1]}.`];
  }
  const v = (row: string, k: number) => (k >= 0 ? (q.rows?.[row]?.[k] as number | null) : null);
  const yo = i - 4, qo = i - 1;
  const ch = (a: number | null, b: number | null) => (isNum(a) && isNum(b) && b !== 0 ? sgn(((a - b) / Math.abs(b)) * 100) + "%" : "n/a");
  return [`${sym}, quarter ending ${ps[i]}: revenue ${rs(v("revenue", i))} (${ch(v("revenue", i), v("revenue", yo))} on the year-ago quarter${yo >= 0 ? " " + ps[yo] : ""}, ${ch(v("revenue", i), v("revenue", qo))} on the previous quarter); `
    + `operating profit ${rs(v("operating_profit", i))} (${ch(v("operating_profit", i), v("operating_profit", yo))} year on year); net profit ${rs(v("net_profit", i))} (${ch(v("net_profit", i), v("net_profit", yo))} year on year, ${ch(v("net_profit", i), v("net_profit", qo))} on the previous quarter).`];
}
const latestQuarter: Fn = (sym, d, e) => {
  const lines = quarterLine(sym, d, e.quarter, e.fy);
  return lines.length ? out([...lines, srcFin(d.fin, "quarterly results")], { to: report(sym, "#financials"), label: "See the quarterly results" }) : notHeld("quarterly results", sym, report(sym, "#financials"), "Open the company's financials");
};
const quarterTrend: Fn = (sym, d) => {
  const q = last(d.fin?.quarterly?.pl, "revenue", 8), p = last(d.fin?.quarterly?.pl, "net_profit", 8);
  if (!q.length) return notHeld("quarterly results", sym, report(sym, "#financials"), "Open the company's financials");
  return out([`${sym}'s revenue by quarter: ${seq(q, rs)}.`, p.length && `Net profit by quarter: ${seq(p, rs)}.`, srcFin(d.fin, "quarterly results")]);
};
const otherIncome: Fn = (sym, d) => {
  const pl = d.fin?.yearly?.pl, oi = last(pl, "other_income", 1)[0], pbt = last(pl, "profit_before_tax", 1)[0], ex = last(pl, "exceptional_items", 3);
  if (!oi || !pbt) return notHeld("other income and profit before tax", sym, report(sym, "#financials"), "Open the company's financials");
  const share = pbt.v !== 0 ? (oi.v / pbt.v) * 100 : null;
  const exNon = ex.filter((x) => x.v !== 0);
  return out([`In ${pbt.p}, ${sym}'s other income was ${rs(oi.v)}, ${p1(share)} of its profit before tax (${rs(pbt.v)}).`,
    exNon.length ? `Exceptional items: ${seq(exNon, rs)}.` : `No exceptional items in ${ex.map((x) => x.p).join(", ") || "the years on record"}.`, srcFin(d.fin)]);
};
const borrowings: Fn = (sym, d) => {
  const b = last(d.fin?.yearly?.bs, "borrowings", 5), de = last(d.ratios?.history, "debt_to_equity", 5);
  if (!b.length) return notHeld("borrowings", sym, report(sym, "#financials"), "Open the balance sheet");
  return out([`${sym}'s total borrowings: ${seq(b, rs)}.`, de.length && `Debt to equity: ${seq(de, x2)}.`, srcFin(d.fin)]);
};
const netWorth: Fn = (sym, d) => {
  const e = last(d.fin?.yearly?.bs, "total_equity", 6), sh = last(d.fin?.yearly?.pl, "diluted_shares_cr", 6);
  if (!e.length) return notHeld("net worth", sym, report(sym, "#financials"), "Open the balance sheet");
  const g = e.length >= 2 ? cagr(e[0].v, e[e.length - 1].v, e.length - 1) : null;
  const shLine = sh.length >= 2 ? (Math.abs(sh[sh.length - 1].v - sh[0].v) / sh[0].v < 0.005 ? `The share count was unchanged at about ${nf(sh[sh.length - 1].v, 2)} crore shares (${sh[0].p} to ${sh[sh.length - 1].p}).`
    : `Shares went from ${nf(sh[0].v, 2)} crore in ${sh[0].p} to ${nf(sh[sh.length - 1].v, 2)} crore in ${sh[sh.length - 1].p} (${sgn(((sh[sh.length - 1].v - sh[0].v) / sh[0].v) * 100)}%), from issues, bonuses, splits or buybacks.`) : "FinLit has too few years of share count to tell.";
  return out([`${sym}'s net worth: ${seq(e, rs)}${g != null ? ` (${p1(g)} a year)` : ""}.`, shLine, srcFin(d.fin)]);
};
const netDebt: Fn = (sym, d) => {
  const bs = d.fin?.yearly?.bs, b = last(bs, "borrowings", 1)[0], c = last(bs, "cash", 1)[0], op = last(d.fin?.yearly?.pl, "operating_profit", 1)[0];
  if (!b || !c) return notHeld("borrowings and cash", sym, report(sym, "#financials"), "Open the balance sheet");
  const net = b.v - c.v;
  return out([`At the end of ${b.p}, ${sym} had borrowings of ${rs(b.v)} and cash of ${rs(c.v)}: ${net > 0 ? `net debt of ${rs(net)}` : `net cash of ${rs(-net)}`}.`,
    op && op.v > 0 ? `Debt to EBITDA: ${x2(b.v / op.v)} (borrowings over ${op.p} operating profit).` : "Debt to EBITDA cannot be worked out: operating profit is not positive or not held.", srcFin(d.fin)]);
};
const workingCapital: Fn = (sym, d) => {
  const h = d.ratios?.history, r = last(h, "debtor_days", 5), inv = last(h, "inventory_days", 5), pay = last(h, "payable_days", 5), ccc = last(h, "cash_conversion_cycle", 5);
  if (!r.length && !ccc.length) return notHeld("working-capital days", sym, report(sym, "#ratios"), "Open the ratios");
  return out([r.length && `${sym}'s receivable days: ${seq(r, days)}.`, inv.length && `Inventory days: ${seq(inv, days)}.`, pay.length && `Payable days: ${seq(pay, days)}.`,
    ccc.length && `Cash conversion cycle: ${seq(ccc, days)} (${trendWord(ccc) === "up" ? "longer" : trendWord(ccc) === "down" ? "shorter" : "unchanged"} over the period).`, srcFin(d.fin)]);
};
const assetsVsRevenue: Fn = (sym, d) => {
  const a = last(d.fin?.yearly?.bs, "total_assets", 6), r = last(d.fin?.yearly?.pl, "revenue", 6);
  if (a.length < 2 || r.length < 2) return notHeld("enough years of assets and revenue", sym, report(sym, "#financials"), "Open the balance sheet");
  const ga = cagr(a[0].v, a[a.length - 1].v, a.length - 1), gr = cagr(r[0].v, r[r.length - 1].v, r.length - 1);
  return out([`From ${a[0].p} to ${a[a.length - 1].p}, ${sym}'s total assets grew ${p1(ga)} a year and its revenue ${p1(gr)} a year: assets grew ${isNum(ga) && isNum(gr) ? (ga > gr ? "faster than" : ga < gr ? "slower than" : "as fast as") : "at a rate that cannot be compared with"} revenue.`, srcFin(d.fin)]);
};
const cfo: Fn = (sym, d) => {
  const o = last(d.fin?.yearly?.cf, "operating", 5), np = d.fin?.yearly?.pl;
  if (!o.length) return notHeld("operating cash flow", sym, report(sym, "#financials"), "Open the cash flow");
  const ratio = o.map((x) => { const i = (np?.periods ?? []).indexOf(x.p), p = i >= 0 ? np.rows?.net_profit?.[i] : null; return isNum(p) && p > 0 ? `${x.p} ${nf(x.v / p, 2)}×` : `${x.p} n/a`; });
  return out([`${sym}'s operating cash flow: ${seq(o, rs)}.`, `Operating cash flow to net profit (CFO/PAT): ${ratio.join(", ")}.`, srcFin(d.fin, "cash flow statements")]);
};
const capex: Fn = (sym, d) => {
  const c = last(d.fin?.yearly?.cf, "capex", 5), rev = d.fin?.yearly?.pl;
  if (!c.length) return notHeld("capital expenditure", sym, report(sym, "#financials"), "Open the cash flow");
  const pctS = c.map((x) => { const i = (rev?.periods ?? []).indexOf(x.p), s = i >= 0 ? rev.rows?.revenue?.[i] : null; return isNum(s) && s > 0 ? `${x.p} ${nf((Math.abs(x.v) / s) * 100, 1)}%` : `${x.p} n/a`; });
  return out([`${sym}'s capital expenditure: ${seq(c, (v) => rs(Math.abs(v)))}.`, `As a share of sales: ${pctS.join(", ")}.`, srcFin(d.fin, "cash flow statements")]);
};
const fcf: Fn = (sym, d) => {
  const f = last(d.fin?.yearly?.cf, "free_cash_flow", 10), mc = d.summary?.quote?.marketCapCr ?? latest(d.ratios, "market_cap")?.value;
  if (!f.length) return notHeld("free cash flow", sym, report(sym, "#financials"), "Open the cash flow");
  const lastF = f[f.length - 1], pos = f.filter((x) => x.v > 0).length;
  return out([`${sym}'s free cash flow: ${seq(f.slice(-5), rs)}.`, isNum(mc) && mc > 0 ? `FCF yield (${lastF.p} free cash flow over today's market cap of ${rs(mc)}): ${p1((lastF.v / mc) * 100, 2)}.` : "FCF yield cannot be worked out: the market cap is not held.",
    `Free cash flow was positive in ${pos} of the ${f.length} years FinLit has${f.length < 10 ? " (fewer than 10)" : ""}.`, srcFin(d.fin, "cash flow statements")]);
};
const returnsOnCapital: Fn = (sym, d) => {
  const h = d.ratios?.history, roe = last(h, "roe", 5), roce = last(h, "roce", 5), roa = last(h, "roa", 5);
  if (!roe.length) return notHeld("return ratios", sym, report(sym, "#ratios"), "Open the ratios");
  return out([`${sym}'s ROE: ${seq(roe, (v) => p1(v))}.`, roce.length && `ROCE: ${seq(roce, (v) => p1(v))}.`, roa.length && `ROA: ${seq(roa, (v) => p1(v))}.`,
    "FinLit does not have a sector median for these ratios, so no comparison is given.", srcFin(d.fin)], { to: report(sym, "#ratios"), label: "See the ratios" });
};
const coverage: Fn = (sym, d) => {
  const h = d.ratios?.history, ic = last(h, "interest_coverage", 5), cur = last(h, "current_ratio", 5);
  if (!ic.length && !cur.length) return notHeld("interest coverage and current ratio", sym, report(sym, "#ratios"), "Open the ratios");
  return out([ic.length && `${sym}'s interest coverage: ${seq(ic, x2)} (${trendWord(ic) === "up" ? "improving" : trendWord(ic) === "down" ? "weakening" : "unchanged"} over the period).`,
    cur.length && `Current ratio: ${seq(cur, x2)} (${trendWord(cur) === "up" ? "improving" : trendWord(cur) === "down" ? "weakening" : "unchanged"}).`, srcFin(d.fin)]);
};
const dupont: Fn = (sym, d) => {
  const nm = latest(d.ratios, "net_margin"), at = latest(d.ratios, "asset_turnover"), lev = latest(d.ratios, "financial_leverage"), roe = latest(d.ratios, "roe");
  if (!nm || !at || !lev) return notHeld("the three DuPont parts", sym, report(sym, "#ratios"), "Open the ratios");
  return out([`${sym}'s ROE of ${p1(roe?.value)} breaks down into net margin ${p1(nm.value)} × asset turnover ${x2(at.value)} × financial leverage ${x2(lev.value)} (= ${p1((nm.value * at.value * lev.value))}, ${nm.period}).`,
    "A higher margin, a faster asset turnover or more borrowing each raise ROE; the parts show which one carries it.", srcFin(d.fin)]);
};
const bankRatios: Fn = (sym) => notHeld("NIM, GNPA, NNPA and CASA ratios", sym, report(sym, "#ratios"), "Open the company report");
const valuation: Fn = (sym, d) => {
  const pe = latest(d.ratios, "pe"), pb = latest(d.ratios, "pb"), ps = latest(d.ratios, "ps"), ev = latest(d.ratios, "ev_ebitda");
  if (!pe && !pb) return notHeld("valuation ratios", sym, report(sym, "#ratios"), "Open the ratios");
  return out([`${sym} trades at a P/E of ${x2(pe?.value)}, P/B of ${x2(pb?.value)}, P/S of ${x2(ps?.value)} and EV/EBITDA of ${x2(ev?.value)}.`,
    `P/E, P/B and P/S ${pe?.period ? pe.period.replace(/^As of/, "as of") : ""}; EV/EBITDA on trailing-twelve-month EBITDA. Source: FinLit valuation data.`]);
};
const peHistory: Fn = (sym, d) => {
  const v = d.ratios?.valuationHistory, pe = last(v, "pe", 99), now = latest(d.ratios, "pe");
  if (!pe.length || !now) return notHeld("a P/E history", sym, report(sym, "#ratios"), "Open the ratios");
  const avg = (n: number) => (pe.length >= n ? pe.slice(-n).reduce((s, x) => s + x.v, 0) / n : null);
  const below = pe.filter((x) => x.v < now.value).length, pctile = Math.round((below / pe.length) * 100);
  const a3 = avg(3), a5 = avg(5), a10 = avg(10);
  return out([`${sym}'s P/E today is ${x2(now.value)}. Its yearly average P/E: last 3 years ${x2(a3)}, last 5 years ${x2(a5)}, ${a10 != null ? `last 10 years ${x2(a10)}` : `10 years not available (FinLit has ${pe.length} years, ${pe[0].p} to ${pe[pe.length - 1].p})`}.`,
    `Today's P/E is above ${pctile}% of those ${pe.length} yearly figures.`, "Source: FinLit valuation history (yearly P/E on each year's average price)."]);
};
const peersValuation: Fn = (sym, d) => {
  const items: J[] = (d.peers?.items ?? []).filter((x: J) => isNum(x.pe) && x.pe > 0), pe = latest(d.ratios, "pe");
  if (!items.length || !pe) return notHeld("peer valuations", sym, report(sym, "#peers"), "Open the peers");
  const s = items.map((x) => x.pe).sort((a, b) => a - b), med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return out([`${sym}'s P/E is ${x2(pe.value)}; the median P/E of its ${s.length} listed peers (${items.map((x) => x.symbol).join(", ")}) is ${x2(med)}, so it trades ${pe.value > med ? "above" : pe.value < med ? "below" : "at"} that median.`,
    "FinLit has the peers' P/E, not their P/B, and no full-sector median, so only P/E against these peers is given.", "Source: FinLit peer data."], { to: report(sym, "#peers"), label: "See the peers" });
};
const dividends: Fn = (sym, d) => {
  const y = latest(d.ratios, "dividend_yield") ?? (isNum(d.events?.dividendYieldTtm) ? { value: d.events.dividendYieldTtm, period: "TTM" } : null), pay = latest(d.ratios, "dividend_payout");
  const byFy = d.events?.dividendsByFY, dps: { p: string; v: number }[] = (byFy?.periods ?? []).map((p: string, i: number) => ({ p, v: byFy.dps?.[i] as number })).filter((x: { v: number }) => isNum(x.v));
  let run = 0; for (let i = dps.length - 1; i >= 0 && dps[i].v > 0; i--) run++;
  return out([`${sym}'s dividend yield is ${p1(y?.value, 2)} (last 12 months) and its payout ratio ${p1(pay?.value)}${pay ? ` (${pay.period})` : ""}.`,
    dps.length ? `It paid a dividend in each of the last ${run} financial years FinLit has (${dps.slice(-run || -1).map((x) => `${x.p} ₹${nf(x.v, 2)}`).join(", ")}; per share, adjusted for splits and bonuses).` : "FinLit has no dividend history for it.", "Source: FinLit corporate actions."]);
};
const marketCapChange: Fn = (sym, d) => {
  const mc = d.summary?.quote?.marketCapCr, r: J[] = d.summary?.returns ?? [];
  const at = (p: string) => r.find((x) => x.period === p)?.price;
  return out([`${sym}'s market cap is ${rs(mc)}${priceAsOf(d.summary) ? ` (as of ${priceAsOf(d.summary)})` : ""}.`,
    `It moves with the share price, which changed ${pc(at("1Y"))} over 1 year, ${pc(at("3Y"))} over 3 years and ${pc(at("5Y"))} over 5 years (the market cap also changes when shares are issued or bought back).`, "Source: FinLit prices."]);
};
const promoter: Fn = (sym, d) => {
  const s = d.own?.series?.promoters ?? [], ps: string[] = d.own?.periods ?? [];
  const xs = ps.map((p, i) => ({ p, v: s[i] as number })).filter((x) => isNum(x.v)).slice(-8);
  if (!xs.length) return notHeld("shareholding", sym, report(sym), "Open the shareholding");
  return out([`Promoter holding in ${sym}, last ${xs.length} quarters: ${seq(xs, (v) => p1(v, 2))} (${sgn(xs[xs.length - 1].v - xs[0].v, 2)} points).`, `Source: FinLit shareholding filings to ${d.own?.asOf ?? xs[xs.length - 1].p}.`]);
};
const pledge: Fn = (sym) => notHeld("the share of promoter holding that is pledged", sym, report(sym), "Open the shareholding");
const institutions: Fn = (sym, d) => {
  const ps: string[] = d.own?.periods ?? [], pick = (k: string) => ps.map((p, i) => ({ p, v: d.own?.series?.[k]?.[i] as number })).filter((x) => isNum(x.v)).slice(-5);
  const f = pick("fii"), dd = pick("dii");
  if (!f.length) return notHeld("shareholding", sym, report(sym), "Open the shareholding");
  return out([`Foreign institutions (FII) in ${sym}: ${seq(f, (v) => p1(v, 2))} (${sgn(f[f.length - 1].v - f[0].v, 2)} points).`,
    dd.length && `Domestic institutions (DII), which include mutual funds: ${seq(dd, (v) => p1(v, 2))} (${sgn(dd[dd.length - 1].v - dd[0].v, 2)} points).`,
    "FinLit has mutual funds inside DII, not as a separate figure.", `Source: FinLit shareholding filings to ${d.own?.asOf ?? f[f.length - 1].p}.`]);
};
const holders: Fn = (sym) => notHeld("the number of shareholders and the names of top holders", sym, report(sym), "Open the shareholding");
const fromHighs: Fn = (sym, d) => {
  const q = d.summary?.quote, c: (number | null)[] = d.max?.series?.c ?? [];
  if (!q || !isNum(q.price)) return notHeld("the share price", sym, report(sym), "Open the company report");
  const ath = c.reduce<number | null>((m, v) => (isNum(v) && (m == null || v > m) ? v : m), null);
  const off = (ref: number | null | undefined) => { if (!isNum(ref) || ref <= 0) return "not available"; const v = ((q.price - ref) / ref) * 100; return Math.abs(v) < 0.05 ? "at" : `${nf(Math.abs(v), 1)}% ${v < 0 ? "below" : "above"}`; };
  return out([`${sym} last traded at ₹${nf(q.price, 2)}${priceAsOf(d.summary) ? ` (${priceAsOf(d.summary)})` : ""}.`,
    `That is ${off(q.high52)} its 52-week high of ₹${isNum(q.high52) ? nf(q.high52, 2) : "–"}, ${off(q.low52)} its 52-week low of ₹${isNum(q.low52) ? nf(q.low52, 2) : "–"}, and ${off(ath)} the highest close on record${isNum(ath) ? ` (₹${nf(ath, 2)}, prices since ${day(d.max?.startsAt) === "–" ? "its first price" : day(d.max?.startsAt)})` : ""}.`, "Source: FinLit prices."]);
};
const priceReturns: Fn = (sym, d) => {
  const r: J[] = d.summary?.returns ?? [], at = (p: string) => r.find((x) => x.period === p);
  if (!r.length) return notHeld("returns", sym, report(sym), "Open the company report");
  return out([`${sym}'s share price return: 1 month ${pc(at("1M")?.price)}, 3 months ${pc(at("3M")?.price)}, 1 year ${pc(at("1Y")?.price)}, 3 years ${pc(at("3Y")?.price)}, 5 years ${pc(at("5Y")?.price)}.`,
    "FinLit does not have the index or sector return for the same periods here, so no comparison is given.", `Source: FinLit prices${priceAsOf(d.summary) ? " to " + priceAsOf(d.summary) : ""}.`]);
};
const averages: Fn = (sym, d) => {
  const t = d.price?.technical;
  if (!t || !isNum(t.price)) return notHeld("moving averages", sym, report(sym), "Open the company report");
  const where = (v: number | null | undefined, n: string, pct: number | null | undefined) => (isNum(v) ? `${isNum(pct) ? (pct >= 0 ? "above" : "below") : t.price >= v ? "above" : "below"} its ${n}-day average (₹${nf(v, 2)}${isNum(pct) ? `, ${sgn(pct)}%` : ""})` : `its ${n}-day average is not held`);
  return out([`${sym} at ₹${nf(t.price, 2)} is ${where(t.ema20, "20", t.vsEma20Pct)}, ${where(t.ema50, "50", t.vsEma50Pct)} and ${where(t.ema200, "200", t.vsEma200Pct)}.`,
    "FinLit uses exponential averages (20, 50 and 200 days); it does not have a 100-day average or a MACD signal.", "Source: FinLit prices. It describes past prices only."]);
};
const rsi: Fn = (sym, d) => {
  const t = d.price?.technical;
  if (!t || !isNum(t.rsi14)) return notHeld("an RSI reading", sym, report(sym), "Open the company report");
  const zone = t.rsi14 >= 70 ? "in the range usually called overbought (70 or more)" : t.rsi14 <= 30 ? "in the range usually called oversold (30 or less)" : "between the oversold (30) and overbought (70) levels";
  return out([`${sym}'s 14-day RSI is ${nf(t.rsi14, 1)}, ${zone}.`, "RSI measures how strongly the price has moved recently; it describes past prices only. Source: FinLit prices."]);
};
const risk: Fn = (sym, d) => {
  const s = d.stats;
  if (!s?.available) return notHeld("price-risk figures", sym, report(sym), "Open the company report");
  return out([`${sym}'s volatility (yearly, from the last ${s.volatility?.window ?? 60} sessions) is ${p1(s.volatility?.current)}, against a median of ${p1(s.volatility?.median)} since ${day(s.from)}.`,
    `Its largest fall from a high was ${p1(isNum(s.drawdown?.max?.pct) ? Math.abs(s.drawdown.max.pct) : null)} (low on ${day(s.drawdown?.max?.date)}); today it is ${p1(isNum(s.drawdown?.current) ? Math.abs(s.drawdown.current) : null)} below its high.`,
    "FinLit does not have a beta for it.", `Source: FinLit prices, ${day(s.from)} to ${day(s.to)}.`]);
};
// Task #283: FinLit Prism is FinLit's only company score. The score questions point to the company's Prism rating (Gold); no other score is quoted.
const prismPage = (sym: string) => `/prism/${encodeURIComponent(sym)}`;
const scoreNow: Fn = (sym) => out([`${sym}'s company score on FinLit is FinLit Prism: a score out of 100 for its financial health, built from four parts (Growth & Profitability, Valuation, Quality and Risk), with two technical views shown beside it.`,
  "FinLit Prism comes with a plan that has it (Gold); its rating, parts and status are on the company's Prism page."], { to: prismPage(sym), label: "Open its FinLit Prism rating" });
const scoreChange: Fn = (sym) => out([`How ${sym}'s FinLit Prism score has moved is on its company report, under "How the scores have moved", on a plan that has FinLit Prism (Gold).`,
  "Each stored Prism rating carries its date, so the change is read from one stored rating to the next."], { to: report(sym, "#prism"), label: "See how the scores have moved" });
const actions: Fn = (sym, d) => {
  const a: J[] = d.events?.actions ?? [];
  const pick = (re: RegExp) => a.filter((x) => re.test(x.type ?? ""));
  const divs = pick(/dividend/), others = a.filter((x) => /split|bonus|buyback|rights/.test(x.type ?? ""));
  const nextResult = (d.events?.announcements ?? []).find((x: J) => /board meeting|financial results|results/i.test(`${x.category} ${x.description}`) && new Date(x.date) >= new Date(new Date().toDateString()));
  return out([divs.length ? `${sym}'s latest dividends: ${divs.slice(0, 4).map((x) => `${x.title} (${day(x.date)})`).join("; ")}.` : `FinLit has no dividends for ${sym}.`,
    others.length ? `Splits, bonuses, rights and buybacks: ${others.slice(0, 5).map((x) => `${x.title} (${day(x.date)})`).join("; ")}.` : "No split, bonus, rights issue or buyback is on record.",
    nextResult ? `Next board meeting on results: ${day(nextResult.date)}.` : "No upcoming results date is on record yet; the Results calendar lists dates as companies announce them.", "Source: FinLit corporate actions and announcements."],
    { to: "/results", label: "Open the Results calendar" });
};
const compare: Fn = (sym, d, e) => {
  const b = e.second, d2 = e.d2;
  if (!b || !d2) return { text: `Name the second company in the question (replace XYZ) to compare it with ${sym}. ${COMPANY_DISCLAIMER}` };
  const row = (r: J, k: string) => latest(r, k)?.value;
  const line = (label: string, k: string, f: (v: number | null | undefined) => string) => `${label}: ${sym} ${f(row(d.ratios, k))}, ${b} ${f(row(d2.ratios, k))}`;
  return out([`${sym} and ${b} on FinLit's latest figures:`, line("3-year sales growth (a year)", "revenue_cagr_3y", p1), line("3-year profit growth (a year)", "profit_cagr_3y", p1),
    line("Operating margin", "opm", p1), line("Net margin", "net_margin", p1), line("ROE", "roe", p1), line("ROCE", "roce", p1), line("P/E", "pe", x2), line("P/B", "pb", x2),
    "Source: FinLit ratios for both companies."], { to: `/compare?c=${encodeURIComponent(sym)},${encodeURIComponent(b)}`, label: "Compare them side by side" });
};
const redFlags: Fn = (sym, d) => {
  const h = d.ratios?.history, de = last(h, "debt_to_equity", 4), om = last(h, "operating_margin", 4), rd = last(h, "debtor_days", 4), roce = last(h, "roce", 4);
  const o = last(d.fin?.yearly?.cf, "operating", 1)[0], np = last(d.fin?.yearly?.pl, "net_profit", 1)[0];
  const falling = (xs: { v: number }[]) => xs.length >= 4 && xs.every((x, i) => i === 0 || x.v < xs[i - 1].v);
  const checks: [string, boolean | null][] = [
    ["Rising debt with falling margins over the last 3 years", de.length >= 2 && om.length >= 2 ? de[de.length - 1].v > de[0].v && om[om.length - 1].v < om[0].v : null],
    ["Receivable days rising every year for 3 years", rd.length >= 4 ? rd.every((x, i) => i === 0 || x.v > rd[i - 1].v) : null],
    [`Operating cash flow below net profit in ${o?.p ?? "the latest year"}`, o && np ? o.v < np.v : null],
    ["ROCE falling every year for 3 years", roce.length >= 4 ? falling(roce) : null],
  ];
  const seen = checks.filter(([, v]) => v === true).map(([k]) => k), clear = checks.filter(([, v]) => v === false).map(([k]) => k), unknown = checks.filter(([, v]) => v == null).map(([k]) => k);
  return out([seen.length ? `Flags present for ${sym}: ${list(seen)}.` : `None of these flags is present for ${sym}: ${list(clear)}.`, seen.length && clear.length && `Not present: ${list(clear)}.`,
    unknown.length && `Not enough data to check: ${list(unknown)}.`, "Promoter pledge is not checked: FinLit does not have pledge figures.", srcFin(d.fin)]);
};
const identity: Fn = (sym, d) => {
  const p = d.summary?.profile, mc = d.summary?.quote?.marketCapCr;
  if (!p) return notHeld("a company profile", sym, report(sym), "Open the company report");
  const c = d.cls as unknown as Classification | null | undefined;
  const named = c ? LEVELS.filter((l) => c[l]).map((l) => `${LEVEL_LABEL[l].toLowerCase()} ${c[l]}`) : [];
  return out([named.length ? `${sym} (${p.name ?? sym}) is in NSE's ${named.slice(0, -1).join(", ")}${named.length > 1 ? " and " : ""}${named[named.length - 1]}.`
    : `${sym} (${p.name ?? sym}): its NSE classification is not known.`,
    c?.note && c.source ? c.note : c?.note ? c.note.replace(/^Not classified: /, "Not classified by NSE's lists: ") : null,
    isNum(mc) ? `With a market cap of ${rs(mc)} it is a ${(capSize(mc) ?? "–").toLowerCase()} company (Large above ₹75,000 Cr, Mid ₹25,000–75,000 Cr, Small ₹10,000–25,000 Cr, Micro below ₹10,000 Cr).` : "Its market cap is not held.", "Source: FinLit company profile and prices."]);
};
const sectorRank: Fn = (sym, d) => {
  const items: J[] = (d.peers?.items ?? []).filter((x: J) => isNum(x.market_cap)), mc = d.summary?.quote?.marketCapCr;
  if (!items.length || !isNum(mc)) return notHeld("peer market caps", sym, report(sym, "#peers"), "Open the peers");
  const all = [...items.map((x) => ({ s: x.symbol, v: x.market_cap })), { s: sym, v: mc }].sort((a, b) => b.v - a.v), rank = all.findIndex((x) => x.s === sym) + 1;
  return out([`By market cap, ${sym} ranks ${rank} of ${all.length} among itself and its listed peers (${items.map((x) => x.symbol).join(", ")}).`,
    "FinLit does not have a full-sector ranking by revenue or profit, so only the market-cap rank among these peers is given.", "Source: FinLit peer data."], { to: report(sym, "#peers"), label: "See the peers" });
};
const sectorGrowth: Fn = (sym, d) => { const r3 = latest(d.ratios, "revenue_cagr_3y"); return { ...notHeld("a sector median revenue growth", sym, "/sectors", "Open Sector Pulse"), text: `${sym}'s revenue grew ${p1(r3?.value)} a year over 3 years. FinLit does not have a sector median revenue growth to compare it with. ${COMPANY_DISCLAIMER}` }; };

/** Every listed company question, by its id in the question bank (content/questionSuggestions.json). */
export const COMPANY_RULES: Record<string, Rule> = {
  "C.1.Q1": { parts: ["summary", "cls"], fn: identity }, "C.1.Q2": { parts: ["summary", "peers"], fn: sectorRank },
  "C.2.Q3": { parts: ["fin"], fn: revenueYears }, "C.2.Q4": { parts: ["fin", "ratios"], fn: revenueCagr }, "C.2.1.3": { parts: ["fin", "ratios"], fn: revenueCagr },
  "C.2.Q5": { parts: ["ratios"], fn: sectorGrowth }, "C.2.Q6": { parts: ["fin", "ratios"], fn: ebitdaTrend }, "C.2.2.1": { parts: ["fin", "ratios"], fn: ebitdaTrend },
  "C.2.Q7": { parts: ["fin", "ratios"], fn: profitCagr }, "C.2.Q8": { parts: ["fin"], fn: latestQuarter }, "C.2.5.1": { parts: ["fin"], fn: latestQuarter }, "C.2.1.2": { parts: ["fin"], fn: latestQuarter },
  "C.2.Q9": { parts: ["fin"], fn: otherIncome }, "C.3.Q10": { parts: ["fin", "ratios"], fn: borrowings }, "C.3.Q11": { parts: ["fin"], fn: netWorth },
  "C.3.Q12": { parts: ["fin"], fn: netDebt }, "C.3.5.1": { parts: ["fin"], fn: netDebt }, "C.3.Q13": { parts: ["fin", "ratios"], fn: workingCapital }, "C.3.Q14": { parts: ["fin"], fn: assetsVsRevenue },
  "C.4.Q15": { parts: ["fin"], fn: cfo }, "C.4.Q16": { parts: ["fin"], fn: capex }, "C.4.Q17": { parts: ["fin", "summary", "ratios"], fn: fcf },
  "C.5.Q18": { parts: ["fin", "ratios"], fn: returnsOnCapital }, "C.5.1.1": { parts: ["fin", "ratios"], fn: returnsOnCapital }, "C.5.Q19": { parts: ["fin", "ratios"], fn: coverage },
  "C.5.Q20": { parts: ["fin", "ratios"], fn: dupont }, "C.5.Q21": { parts: [], fn: bankRatios },
  "C.6.Q22": { parts: ["ratios"], fn: valuation }, "C.6.1.1": { parts: ["ratios"], fn: valuation }, "C.6.Q23": { parts: ["ratios"], fn: peHistory }, "C.6.Q24": { parts: ["ratios", "peers"], fn: peersValuation },
  "C.6.Q25": { parts: ["ratios", "events"], fn: dividends }, "C.6.Q26": { parts: ["summary"], fn: marketCapChange },
  "C.7.Q27": { parts: ["own"], fn: promoter }, "C.7.Q28": { parts: [], fn: pledge }, "C.7.Q29": { parts: ["own"], fn: institutions }, "C.7.2.1": { parts: ["own"], fn: institutions }, "C.7.Q30": { parts: [], fn: holders },
  "C.8.Q31": { parts: ["summary", "max"], fn: fromHighs }, "C.8.Q32": { parts: ["summary"], fn: priceReturns }, "C.8.Q33": { parts: ["price"], fn: averages }, "C.8.Q34": { parts: ["price"], fn: rsi },
  "C.8.Q35": { parts: ["stats"], fn: risk }, "C.9.Q36": { parts: ["summary"], fn: scoreNow }, "C.9.Q37": { parts: ["scores"], fn: scoreChange },
  "C.10.Q38": { parts: ["events"], fn: actions }, "C.11.Q39": { parts: ["ratios"], fn: compare }, "C.12.Q40": { parts: ["fin", "ratios"], fn: redFlags },
  "quarter": { parts: ["fin"], fn: latestQuarter }, "quarter-trend": { parts: ["fin"], fn: quarterTrend },
};

/** The answer to one listed company question, from FinLit's own figures (no model). */
export async function answerCompany(id: string, sym: string, extra: { second?: string; quarter?: number; fy?: string } = {}): Promise<Answer> {
  const rule = COMPANY_RULES[id];
  if (!rule) return { text: `This question is not one FinLit AI can answer yet. ${COMPANY_DISCLAIMER}` };
  const [d, d2] = await Promise.all([load(sym, rule.parts), extra.second ? load(extra.second, rule.parts) : Promise.resolve(undefined)]);
  if (rule.parts.length && rule.parts.every((p) => d[p] == null)) return notHeld("a report", sym, report(sym), "Open the company report");
  try { return rule.fn(sym, d, { ...extra, d2 }); }
  catch { return notHeld("the figures this question needs", sym, report(sym), "Open the company report"); }
}

// ---------------------------------------------------------------------------------------------------------------- finding the question

/** The written answer of a general question (concepts, platform, market, the explorer topics), if it is one. */
export function generalAnswer(text: string): string | undefined {
  const t = text.trim();
  if (asksRetiredScore(t)) return RETIRED_SCORE_ANSWER;   // task #283: the retired score is answered from written text, never from data
  const ex = TOPICS.flatMap((x) => x.questions).find((x) => x.text === t);
  const a = writtenAnswer(t) ?? (ex ? EXPLORER_ANSWERS[ex.id] : undefined);
  return a && !/not investment advice/i.test(a) ? `${a} Information only, not investment advice.` : a;   // the disclaimer stays on every answer
}

export type Match = { id: string; sym: string; quarter?: number; fy?: string; second?: string };
const SYM = "([A-Za-z0-9&.\\-]{1,20})";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TEMPLATES: { id: string; re: RegExp }[] = COMPANY_QUESTIONS.map((q) => ({
  id: q.id,
  re: new RegExp("^" + esc(q.text).replace(/\\\{company_2\\\}/g, "(.+?)").replace(/\\\{company\\\}/g, SYM).replace(/\\\{n\\\}/g, "\\d+") + "$", "i"),
}));
/** Which listed company question a text is (as the panel writes it, with the company filled in), or null. "About X: ..." names the company of a follow-up. */
export function matchQuestion(text: string, company?: string | null): Match | null {
  let t = text.trim(), ctx = company ?? null;
  const about = /^about ([A-Za-z0-9&.\-]{1,20}):\s*/i.exec(t);
  if (about) { ctx = about[1].toUpperCase(); t = t.slice(about[0].length); }
  let m = /^How did ([A-Za-z0-9&.\-]{1,20}) do in Q([1-4])(?: of (FY\d\d))? /.exec(t);
  if (m) return { id: "quarter", sym: m[1].toUpperCase(), quarter: Number(m[2]), fy: m[3] };
  m = /^How have ([A-Za-z0-9&.\-]{1,20})'s revenue and profit moved quarter by quarter/.exec(t);
  if (m) return { id: "quarter-trend", sym: m[1].toUpperCase() };
  for (const x of TEMPLATES) {
    const g = x.re.exec(t);
    if (!g) continue;
    const sym = (g[1] || ctx || "").toUpperCase();
    if (!sym) continue;
    const second = x.id === "C.11.Q39" && g[2] && g[2].trim().toUpperCase() !== SECOND ? g[2].trim() : undefined;
    return { id: x.id, sym, ...(second ? { second } : {}) };
  }
  return null;
}

const ALL_GENERAL: Q[] = [...TOPICS.flatMap((x) => x.questions), ...STARTERS.map((s, i) => ({ id: "s" + i, text: s.q })), ...MARKET_QUESTIONS]
  .filter((q, i, a) => a.findIndex((y) => y.text === q.text) === i);
/** The listed questions whose words match what was typed (all words, any order): the general ones, and the company's own when a company is chosen. */
const STOP = new Set(("is are was were be been the a an of in on at to for and or with it its it's how what which who whom does do did has have had this that these those me my i "
  + "show tell about over last latest current will would can could should you your think much very next more any some going really please").split(" "));
/** `loose`: a whole typed sentence (not a few search words) only needs a third of its meaningful words to match; the best matches come first. */
export function searchListed(term: string, company?: string | null, limit = 6, loose = false): Q[] {
  const w = term.toLowerCase().replace(/[?.,!']/g, " ").split(/\s+/).filter((x) => x.length > 1 && !STOP.has(x));
  if (!w.length) return [];
  const fill = (s: string) => s.replace(/\{company_2\}/g, SECOND).replace(/\{company\}/g, company ?? "").replace(/\{n\}/g, "5");
  const companyQs: Q[] = company ? COMPANY_QUESTIONS.map((q) => ({ id: q.id, text: fill(q.text), ...(q.needsSecondCompany ? { needsSecondCompany: true } : {}) }))
    .filter((q, i, a) => a.findIndex((y) => y.text === q.text) === i) : [];
  const score = (q: Q) => w.filter((k) => q.text.toLowerCase().includes(k)).length;
  const need = loose ? Math.max(1, Math.ceil(w.length / 3)) : w.length > 2 ? w.length - 1 : w.length;
  return [...companyQs, ...ALL_GENERAL].map((q) => ({ q, n: score(q) })).filter((x) => x.n >= need)
    .sort((a, b) => b.n - a.n).slice(0, limit).map((x) => x.q);
}
