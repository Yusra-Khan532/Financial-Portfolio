// Task #203: the FinLit AI theme "Mutual funds & ETFs", from the team's question bank (docs/design/mf-etf-questions, content/mfQuestionBank.json).
// Every listed question answers at once, without a language model: from FinLit's own fund data (the same /api/mf and /api/etf answers the fund pages use),
// or from written text (askFundsText.ts) for general knowledge, how the data works, data FinLit does not hold, and questions that ask for advice.
// Answers are short bullet lines with the figures in **bold**; each ends with where to see more and the disclaimer. Describes; never advises.
import { apiGet } from "./api";
import { nf } from "./format";
import type { Answer } from "./askAnswers";

export type Slot = "fund" | "fund2" | "etf";
export type FundQ = { id: string; seg: number; segTitle: string; sub: string; text: string; src: string; status: string; route: string; slots: Slot[] };
export type FundSeg = { n: number; title: string; subs: { name: string; qs: FundQ[] }[] };
export type Picked = { code: number; name: string; plan?: string; option?: string };
export type PickedEtf = { symbol: string; name: string };
export type FundCtx = { fund?: Picked; fund2?: Picked; etf?: PickedEtf };

export const FUND_DISCLAIMER = "Information only, not investment advice. Past returns do not guarantee future returns.";
const MINUS = "−";

// ---------------------------------------------------------------------------------------------------------------- the bank
type Raw = { segments: { n: number; title: string; subs: { name: string; qs: [string, string, string, string, string][] }[] }[] };
/** Words shown in place of a slot the question does not ask the user to fill (they belong to questions FinLit answers in general). */
const SHOWN: Record<string, string> = { "{c}": "a category", "{a}": "a fund house", "{m}": "a fund manager", "{stock}": "a company", "{isin}": "an ISIN", "{code}": "a scheme code", "{p}": "a period" };
export const shownText = (t: string) => t.replace(/\{(c|a|m|stock|isin|code|p)\}/g, (s) => SHOWN[s] ?? s);
export const slotsOf = (t: string): Slot[] => (["fund", "fund2", "etf"] as const).filter((s) => t.includes(`{${s}}`));

export function shape(raw: Raw): { segments: FundSeg[]; all: FundQ[] } {
  const segments = raw.segments.map((s) => ({ n: s.n, title: s.title, subs: s.subs.map((b) => ({ name: b.name, qs: b.qs.map(([id, text, src, status, route]): FundQ => ({ id, seg: s.n, segTitle: s.title, sub: b.name, text, src, status, route, slots: slotsOf(text) })) })) }));
  return { segments, all: segments.flatMap((s) => s.subs.flatMap((b) => b.qs)) };
}
let bank: Promise<{ segments: FundSeg[]; all: FundQ[] }> | null = null;
/** The 1,391 questions, loaded the first time the theme is opened (the file stays out of the page's first download). */
export const loadFundBank = () => (bank ??= import("../content/mfQuestionBank.json").then((m) => shape(m.default as unknown as Raw)));

/** The question as it reads with the chosen fund or ETF filled in. */
export const filled = (q: FundQ, c: FundCtx) => shownText(q.text).replace(/\{fund2\}/g, c.fund2?.name ?? "the second fund").replace(/\{fund\}/g, c.fund?.name ?? "the fund").replace(/\{etf\}/g, c.etf?.symbol ?? "the ETF");

/** Questions whose words match the search (every typed word must appear), at most `limit`. */
export function searchFundQs(all: FundQ[], term: string, limit = 40): FundQ[] {
  const w = term.toLowerCase().split(/\s+/).filter(Boolean);
  if (!w.length) return [];
  const out: FundQ[] = [];
  for (const q of all) { const t = shownText(q.text).toLowerCase(); if (w.every((k) => t.includes(k))) { out.push(q); if (out.length >= limit) break; } }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- reading the question
/** The categories the sheet names ({c}), longest first so "Large & Mid Cap" is not read as "Mid Cap"; the key is the funds list's own (see /api/mf/filters). */
const CATS: [RegExp, string, string][] = ([
  ["Large & Mid Cap", "large-mid-cap"], ["Large Cap", "large-cap"], ["Mid Cap", "mid-cap"], ["Small Cap", "small-cap"], ["Flexi Cap", "flexi-cap"], ["Multi Cap", "multi-cap"],
  ["Focused", "focused"], ["Value", "value"], ["Contra", "contra"], ["Dividend Yield", "dividend-yield"], ["ELSS", "elss"], ["Tax Saver", "elss"], ["Sectoral", "sectoral-thematic"], ["Thematic", "sectoral-thematic"],
  ["Index Fund", "index-funds"], ["Balanced Advantage", "balanced-advantage"], ["Aggressive Hybrid", "aggressive-hybrid"], ["Conservative Hybrid", "conservative-hybrid"], ["Arbitrage", "arbitrage"],
  ["Equity Savings", "equity-savings"], ["Multi Asset", "multi-asset"], ["Liquid", "liquid"], ["Overnight", "overnight"], ["Money Market", "money-market"], ["Ultra Short", "ultra-short"],
  ["Low Duration", "low-duration"], ["Short Duration", "short-duration"], ["Medium to Long Duration", "medium-long-duration"], ["Medium Duration", "medium-duration"], ["Long Duration", "long-duration"],
  ["Corporate Bond", "corporate-bond"], ["Banking & PSU", "banking-psu"], ["Banking and PSU", "banking-psu"], ["Gilt", "gilt"], ["Dynamic Bond", "dynamic-bond"], ["Credit Risk", "credit-risk"], ["Floater", "floater"],
  ["Fund of Funds", "fof-domestic"], ["Retirement", "retirement"], ["Children", "childrens"],
] as [string, string][]).sort((a, b) => b[0].length - a[0].length).map(([w, k]) => [new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}`, "i"), k, w]);
export function categoryOf(text: string): { key: string; word: string } | null {
  for (const [re, key, word] of CATS) if (re.test(text)) return { key, word };
  return null;
}
/** The fund houses the sheet names, as written in questions, and a word that finds the house in AMFI's list. */
const HOUSES: [string, string][] = [["SBI", "sbi"], ["ICICI Prudential", "icici"], ["HDFC", "hdfc"], ["Axis", "axis"], ["Kotak", "kotak"], ["Nippon India", "nippon"], ["Mirae Asset", "mirae"], ["DSP", "dsp"],
  ["UTI", "uti"], ["Aditya Birla Sun Life", "aditya"], ["Parag Parikh", "ppfas"], ["PPFAS", "ppfas"], ["Motilal Oswal", "motilal"], ["Quant", "quant mutual"], ["Tata", "tata"], ["Canara Robeco", "canara"],
  ["Franklin Templeton", "franklin"], ["Bandhan", "bandhan"], ["Invesco", "invesco"], ["HSBC", "hsbc"], ["Edelweiss", "edelweiss"], ["Sundaram", "sundaram"], ["WhiteOak", "whiteoak"], ["Mahindra Manulife", "mahindra"],
  ["Baroda BNP Paribas", "baroda"], ["LIC", "lic"], ["JM Financial", "jm financial"], ["Bajaj", "bajaj"], ["Navi", "navi"], ["Quantum", "quantum"], ["Helios", "helios"], ["Union", "union"], ["Groww", "groww"],
  ["Shriram", "shriram"], ["Jio BlackRock", "jio"], ["Angel One", "angel"], ["Capitalmind", "capitalmind"], ["Old Bridge", "old bridge"], ["Choice", "choice"], ["Monarch", "monarch"], ["Carnelian", "carnelian"]];
export function houseOf(text: string): { word: string; find: string } | null {
  const hit = [...HOUSES].sort((a, b) => b[0].length - a[0].length).find(([w]) => new RegExp(`\\b${w}\\b`, "i").test(text));
  return hit ? { word: hit[0], find: hit[1] } : null;
}
export const planOf = (text: string): "Direct" | "Regular" | null => (/\bdirect\b/i.test(text) ? "Direct" : /\bregular\b/i.test(text) ? "Regular" : null);
export function yearsOf(text: string): 1 | 3 | 5 | 10 | null {
  const m = /\b(1|3|5|10|one|three|five|ten)[\s-]*(?:years?|yr|y)\b/i.exec(text) ?? /\b(1|3|5|10)Y\b/.exec(text);
  if (!m) return null;
  const n = ({ one: 1, three: 3, five: 5, ten: 10 } as Record<string, number>)[m[1].toLowerCase()] ?? Number(m[1]);
  return [1, 3, 5, 10].includes(n) ? (n as 1 | 3 | 5 | 10) : null;
}

/** What a list question ranks by, and which way. */
export type Metric = { sort: string; dir: "asc" | "desc"; field: keyof Row | "none"; label: string; unit: "pct" | "cr" | "chk" | "none" };
export function metricOf(q: Pick<FundQ, "src" | "text">): Metric {
  const t = q.text.toLowerCase(), s = q.src.toLowerCase(), low = /\b(lowest|least|smallest|cheapest|lower)\b/.test(t);
  const yrs = yearsOf(q.text);
  if (/\btoday\b/.test(t) && /\b(gained|rose|fell|lost|dropped)\b/.test(t)) return { sort: "change", dir: /\b(fell|lost|dropped)\b/.test(t) ? "asc" : "desc", field: "change" as keyof Row, label: "change on the last NAV day", unit: "pct" };
  if (/sip/.test(s) || /\bsip\b/.test(t)) { const y = yrs === 3 ? 3 : 5; return { sort: `sip${y}y`, dir: "desc", field: `sip${y}y` as keyof Row, label: `${y}-year SIP return (XIRR, a year)`, unit: "pct" }; }
  if (/checklist|chk_pass/.test(s) || /checklist|checks/.test(t)) return { sort: "checklist", dir: "desc", field: "checklist", label: "checks passed (of 5)", unit: "chk" };
  if (/\bter\b|expense/.test(s + " " + t)) return { sort: "ter", dir: /\b(highest|most|largest)\b/.test(t) ? "desc" : "asc", field: "ter", label: "expense ratio (a year)", unit: "pct" };
  if (/aum/.test(s) || /\b(largest|biggest|fund size|aum)\b/.test(t)) return { sort: "aum", dir: low ? "asc" : "desc", field: "aum", label: "fund size", unit: "cr" };
  if (/fall/.test(s) || /\bfall\b|drawdown/.test(t)) return { sort: "fall", dir: "asc", field: "fall3y", label: "largest fall over 3 years", unit: "pct" };
  if (/vol/.test(s) || /volatil/.test(t)) return { sort: "vol", dir: "asc", field: "none", label: "volatility over 3 years (a year)", unit: "pct" };
  // the period the question names wins; the sheet's field (e.g. "r1y/r3y/r5y") only decides when the question names none
  const y = yrs === 1 || yrs === 3 || yrs === 5 ? yrs : /r1y|ret_1y/.test(s) ? 1 : /r3y/.test(s) ? 3 : /r5y/.test(s) ? 5 : 0;
  if (y) return { sort: `r${y}y`, dir: low ? "asc" : "desc", field: `r${y}y` as keyof Row, label: y === 1 ? "1-year return" : `${y}-year return (CAGR, a year)`, unit: "pct" };
  return { sort: "aum", dir: "desc", field: "aum", label: "fund size", unit: "cr" };
}

// ---------------------------------------------------------------------------------------------------------------- data
type Row = { change?: number | null; code: number; name: string; amc: string; category: string; plan: string; option: string; nav: number | null; navDate: string | null; r1y: number | null; r3y: number | null; r5y: number | null;
  retDate: string | null; sip3y: number | null; sip5y: number | null; fall3y: number | null; aum: number | null; aumAsOf: string | null; ter: number | null; terDate: string | null;
  checklist: { pass: number; of: number; bits: number; mask: number; peer: string } | null; noReturns?: string | null };
type List = { total: number; items: Row[]; dataDate?: string; checklist?: { checks: { key: string; rule: string }[] } };
type Cat = { name: string; key: string; label: string; tab: string; active: number; total: number; growth: number; direct: number; regular: number };
type Filters = { categories: Cat[]; amcs: { name: string; active: number; total: number }[]; totals: { schemes: number; active: number; withHistory: number }; dataDate?: string; excludedAmcs?: string[] };
type Ret = { value: number | null; kind: string; from: string | null; why: string | null };
type Detail = { code: number; name: string; isin: string | null; isinReinvest: string | null; amc: string; category: string; categoryGroup?: string; schemeType: string | null; plan: string; optionClass: string; option: string;
  active: boolean; nav: number | null; navDate: string | null; prevNav: number | null; prevDate: string | null; change: number | null; returns: Record<string, Ret>; retDate: string | null;
  risk: { vol1y?: { value: number | null; why: string | null }; vol3y?: { value: number | null; why: string | null }; maxDrawdown?: { value: number | null; why: string | null; peak?: string; trough?: string } };
  history?: { from: string; to: string; complete: boolean }; family: { code: number; name: string; plan: string; optionClass: string; option: string; nav: number | null; active: boolean }[] };
type Fact = { value?: string; asOf?: string; source?: string; note?: string; unavailable?: string };
type Facts = { facts: Record<string, Fact> };
type Holding = { name: string; weight?: number | null; pct?: number | null; sector?: string | null };
type Portfolio = { unavailable?: string; asOf?: string; holdings?: Holding[]; sectors?: { name: string; weight?: number; pct?: number }[]; summary?: Record<string, unknown> };
type Insights = { month: string; asOf: string; series: { t: string[]; aum: number[]; netFlow: number[]; folios: number[]; equityAum: number[] }; kpis: { aum: { value: number; change: number; changePct: number | null }; netFlow: { value: number; prev: number; mobilized: number; redemption: number }; folios: { value: number; change: number } };
  groups: { key: string; label: string; schemes: number; folios: number; netFlow: number; aum: number; share: number; items: { name: string; schemes: number; folios: number; netFlow: number; aum: number; mobilized?: number; redemption?: number }[] }[] };
type Etf = { symbol: string; name: string; fundHouse: string; category: string; categoryLabel: string; price: number | null; changePct: number | null; priceDate: string | null; avgTurnover: number | null;
  ret1y: number | null; cagr3y: number | null; cagr5y: number | null; vol1y: number | null; mdd1y: number | null; nav: number | null; navDate: string | null; premium: number | null; ter?: number | null; firstDate?: string | null; why?: Record<string, string> };
type EtfList = { items: Etf[]; total: number; categories?: { key: string; label: string; count?: number }[]; asOf?: string };

const cache = new Map<string, Promise<unknown>>();
const get = <T,>(path: string): Promise<T> => { let p = cache.get(path) as Promise<T> | undefined; if (!p) { p = apiGet<T>(path); cache.set(path, p); p.catch(() => cache.delete(path)); } return p; };
export const clearFundCache = () => cache.clear();
const filters = () => get<Filters>("/api/mf/filters");
/** Every row of a list (the API gives at most 100 a page), up to `pages` pages. */
async function allRows(path: string, pages = 6): Promise<{ total: number; items: Row[] }> {
  const first = await get<List>(`${path}&size=100&page=1`);
  const more = await Promise.all(Array.from({ length: Math.min(pages, Math.ceil(first.total / 100)) - 1 }, (_, i) => get<List>(`${path}&size=100&page=${i + 2}`)));
  return { total: first.total, items: [first, ...more].flatMap((l) => l.items) };
}

// ---------------------------------------------------------------------------------------------------------------- words
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const pct = (v: number | null | undefined, d = 2) => (isNum(v) ? `**${v < 0 ? MINUS : ""}${nf(Math.abs(v), d)}%**` : "not available");
const spct = (v: number | null | undefined, d = 2) => (isNum(v) ? `**${v > 0 ? "+" : v < 0 ? MINUS : ""}${nf(Math.abs(v), d)}%**` : "not available");
const crore = (v: number | null | undefined) => (isNum(v) ? `**${v < 0 ? MINUS : ""}₹${nf(Math.abs(v), Math.abs(v) >= 100 ? 0 : 2)} crore**` : "not available");   // an outflow keeps its minus sign
const rupee = (v: number | null | undefined, d = 4) => (isNum(v) ? `**₹${nf(v, d)}**` : "not available");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : "date not stated");
const month = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}/.test(iso) ? `${MON[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : "the latest month");
const cut = (s: string) => s.replace(/^(Equity|Debt|Hybrid|Other|Solution Oriented|Children’s Fund|Retirement Fund)\s+Scheme\s*-\s*/i, "").replace(/\s*Fund$/, "");
const fundUrl = (code: number) => `/funds/${code}`;
const done = (lines: (string | false | null | undefined)[], link?: Answer["link"]): Answer => ({ text: [...lines.filter((l): l is string => !!l), FUND_DISCLAIMER].join("\n"), link });
const value = (r: Row, m: Metric) => {
  if (m.unit === "chk") return r.checklist ? `**${r.checklist.pass} of ${r.checklist.of}** checks` : "checklist not worked out";
  const v = m.field === "none" ? null : (r[m.field] as number | null);
  return m.unit === "cr" ? crore(v) : m.field === "fall3y" ? (isNum(v) ? `fell at most **${nf(Math.abs(v), 2)}%**` : "not available") : pct(v);
};

// ---------------------------------------------------------------------------------------------------------------- the answers from data
/** The funds list's own address for these filters, so "see all" opens the same view. */
function listLink(cat: Cat | null, amc: string | null, plan: string | null, m: Metric | null): Answer["link"] {
  const p = new URLSearchParams();
  if (cat) { p.set("tab", cat.tab); p.set("cats", cat.key); } else p.set("tab", "all");
  if (amc) p.set("amc", amc);
  p.set("plan", plan ?? "All");
  if (m && m.sort !== "vol") { p.set("sort", m.sort); if (m.dir === "desc") p.set("dir", "desc"); }
  return { to: `/funds?${p}`, label: "See the full list on FinLit" };
}
async function resolve(text: string): Promise<{ cat: Cat | null; amc: string | null; house: string | null; plan: "Direct" | "Regular" | null; f: Filters }> {
  const f = await filters();
  const c = categoryOf(text);
  // AMFI words some categories two ways (e.g. "Debt Scheme - Low Duration Fund" and "Income/Debt Oriented Schemes - Ultra Short to Short Term Fund"): one key, figures added up
  const same = c ? f.categories.filter((x) => x.key === c.key) : [];
  const cat: Cat | null = same.length ? same.reduce((t, x) => ({ ...t, active: t.active + x.active, total: t.total + x.total, growth: t.growth + x.growth, direct: t.direct + x.direct, regular: t.regular + x.regular }), { ...same[0], active: 0, total: 0, growth: 0, direct: 0, regular: 0 }) : null;
  const h = houseOf(text);
  const amc = h ? f.amcs.find((a) => a.name.toLowerCase().startsWith(h.find)) ?? f.amcs.find((a) => a.name.toLowerCase().includes(h.find)) : undefined;
  return { cat, amc: amc?.name ?? null, house: h?.word ?? null, plan: planOf(text), f };
}
const listPath = (cat: Cat | null, amc: string | null, plan: string | null, sort: string, dir: string, size: number | null) => {
  const p = new URLSearchParams();
  if (cat) p.set("subs", cat.key);
  if (amc) p.set("amc", amc);
  if (plan) p.set("plans", plan);
  if (sort) { p.set("sort", sort); p.set("dir", dir); }
  if (size) p.set("size", String(size));
  return `/api/mf?${p}`;
};
const what = (cat: Cat | null, house: string | null, plan: string | null) => [house, cat?.label, "funds"].filter(Boolean).join(" ") + (plan ? ` (${plan} plans)` : "");

/** A ranked list: the top 5 funds of a category, fund house or plan by the measure the question asks about. */
async function rankList(q: FundQ): Promise<Answer> {
  const r0 = await resolve(q.text), { cat, amc, house } = r0, plan = r0.plan ?? "Direct";   // as on the funds list: Direct plans unless the question names one
  const m = metricOf(q);
  if (/\bfund houses?\b/i.test(q.text) && !house && /largest|biggest/i.test(q.text)) return houseSizes();
  const list = await get<List>(listPath(cat, amc, plan, m.sort, m.dir, 5));
  const label = what(cat, house, plan);
  if (!list.total) return done([`• FinLit has no active ${label} in AMFI's list.`], listLink(cat, amc, plan, null));
  const rows = list.items.filter((r) => m.unit === "chk" || m.field === "none" || isNum(r[m.field] as number | null));
  if (!rows.length) return done([`• FinLit has **${nf(list.total, 0)}** ${label}, but none has a ${m.label} yet (a fund needs enough NAV history for it).`], listLink(cat, amc, plan, m));
  return done([
    `• ${m.dir === "desc" ? "Highest" : "Lowest"} ${m.label} among **${nf(list.total, 0)}** ${label}, Growth options:`,
    ...rows.map((r, i) => `• ${i + 1}. **${r.name}** (${r.plan}): ${value(r, m)}`),
    rows[0]?.retDate && m.unit === "pct" && m.sort.startsWith("r") ? `• Returns as of ${day(rows[0].retDate)}, worked out by FinLit from AMFI's daily NAVs.` : null,
    m.sort === "ter" && rows[0]?.terDate ? `• Expense ratios from AMFI's file of ${day(rows[0].terDate)}.` : null,
    m.sort === "aum" && rows[0]?.aumAsOf ? `• Fund size is AMFI's average AUM for the quarter to ${day(rows[0].aumAsOf)}, all plans of a scheme together.` : null,
  ], listLink(cat, amc, plan, m));
}
/** Show / list / which funds: how many there are and the five largest. */
async function showList(q: FundQ): Promise<Answer> {
  const r0 = await resolve(q.text), { cat, amc, house } = r0, plan = r0.plan ?? "Direct";
  const list = await get<List>(listPath(cat, amc, plan, "aum", "desc", 5));
  const label = what(cat, house, plan);
  if (!list.total) return done([`• FinLit has no active ${label} in AMFI's list right now.`], listLink(cat, amc, plan, null));
  return done([`• FinLit lists **${nf(list.total, 0)}** active ${label}, Growth options${r0.plan ? "" : " (the Regular plans of the same funds are on the list too)"}.`, `• The five largest by fund size:`,
    ...list.items.map((r, i) => `• ${i + 1}. **${r.name}** (${r.plan}): ${crore(r.aum)}${isNum(r.r5y) ? `, 5-year return ${pct(r.r5y)} a year` : ""}`)], listLink(cat, amc, plan, { sort: "aum", dir: "desc", field: "aum", label: "", unit: "cr" }));
}
/** How many schemes a category, a fund house or the whole list has. */
async function counts(q: FundQ): Promise<Answer> {
  const { cat, amc, house, f } = await resolve(q.text);
  if (cat) return done([`• **${nf(cat.active, 0)}** active ${cat.label} schemes (every plan and option; **${nf(cat.total, 0)}** including closed ones).`, `• Counted once per fund on its Growth option: **${nf(cat.growth, 0)}** — **${nf(cat.direct, 0)}** Direct and **${nf(cat.regular, 0)}** Regular.`, `• From AMFI's NAV file of ${day(f.dataDate)}.`], listLink(cat, null, null, null));
  if (amc) { const a = f.amcs.find((x) => x.name === amc)!; return done([`• **${house}** (${amc}) has **${nf(a.active, 0)}** active schemes in AMFI's list (every plan and option; **${nf(a.total, 0)}** including closed ones).`], listLink(null, amc, null, null)); }
  return done([`• **${nf(f.totals.active, 0)}** active schemes in AMFI's NAV file (every plan and option), **${nf(f.totals.schemes, 0)}** including closed ones.`, `• **${nf(f.categories.length, 0)}** categories and **${nf(f.amcs.length, 0)}** fund houses on FinLit.`, `• From AMFI's NAV file of ${day(f.dataDate)}.`], { to: "/funds", label: "Open the mutual funds list" });
}
/** The average (and middle) figure of a category, worked out from its funds (Growth options; one plan when asked). */
async function categoryAverage(q: FundQ): Promise<Answer> {
  const { cat, plan } = await resolve(q.text);
  const m = metricOf(q);
  if (!cat) return done(["• Choose a category to see its average."], { to: "/funds", label: "Open the mutual funds list" });
  const list = await allRows(listPath(cat, null, plan ?? "Direct", m.sort, "desc", null));
  const vals = list.items.map((r) => (m.field === "none" ? null : (r[m.field] as number | null))).filter(isNum).sort((a, b) => a - b);
  if (!vals.length) return done([`• No ${cat.label} fund has a ${m.label} yet.`], listLink(cat, null, plan, m));
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length, mid = vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
  return done([`• Average ${m.label} of **${vals.length}** ${cat.label} funds (${plan ?? "Direct"} plans, Growth): ${m.unit === "cr" ? crore(avg) : pct(avg)}.`, `• Middle fund (median): ${m.unit === "cr" ? crore(mid) : pct(mid)}; range ${m.unit === "cr" ? crore(vals[0]) : pct(vals[0])} to ${m.unit === "cr" ? crore(vals[vals.length - 1]) : pct(vals[vals.length - 1])}.`,
    `• Worked out by FinLit from each fund's own figure; funds without enough history are left out.`], listLink(cat, null, plan ?? "Direct", m));
}
/** The fund houses with the largest assets: the sum of their schemes' AUM (AMFI does not publish a house total in the files FinLit reads). */
async function houseSizes(q?: FundQ): Promise<Answer> {
  const { amc, house } = q ? await resolve(q.text) : { amc: null, house: null };
  if (amc) {
    // AMFI's AUM is one figure per scheme (all its plans together), repeated on each plan's row: count every scheme once, by its name
    const list = await allRows(`/api/mf?${new URLSearchParams({ amc, sort: "aum", dir: "desc" })}`, 10);
    const seen = new Map<string, number>();
    for (const r of list.items) if (isNum(r.aum) && !seen.has(r.name.toLowerCase())) seen.set(r.name.toLowerCase(), r.aum);
    const sum = [...seen.values()].reduce((a, b) => a + b, 0);
    return done([`• ${house}: about ${crore(sum)} across **${nf(seen.size, 0)}** schemes with a published fund size (AMFI's average AUM per scheme, all plans together).`, "• This is FinLit's sum of the schemes' figures; AMFI's files that FinLit reads do not give an official fund-house total."], listLink(null, amc, null, { sort: "aum", dir: "desc", field: "aum", label: "", unit: "cr" }));
  }
  return done(["• FinLit does not hold a total per fund house; AMFI's AUM is per scheme. The fund-house filter on the list shows each house's schemes by size."], { to: "/funds?tab=all&plan=All&sort=aum&dir=desc", label: "See funds by size" });
}

/** The industry: AMFI's monthly category report (AUM, money in and out, folios). */
async function industry(q: FundQ): Promise<Answer> {
  const ins = await get<Insights>("/api/mf/insights");
  const link = { to: "/funds/insights", label: "Open Mutual Fund Insights" };
  const k = ins.kpis, m = month(ins.month), t = q.text.toLowerCase();
  const c = categoryOf(q.text);
  const items = ins.groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));
  if (c) {
    const word = c.word.toLowerCase().replace(/&/g, "and");
    const it = items.find((i) => i.name.toLowerCase().replace(/&/g, "and").startsWith(word)) ?? items.find((i) => i.name.toLowerCase().replace(/&/g, "and").includes(word));
    if (!it) return done([`• AMFI's monthly report has no separate line for ${c.word} funds.`], link);
    return done([`• **${it.name}** in ${m} (AMFI's monthly report):`, `• Net money in: ${crore(it.netFlow)}${isNum(it.mobilized) ? ` (${crore(it.mobilized)} in, ${crore(it.redemption)} out)` : ""}`, `• Assets: ${crore(it.aum)} across **${nf(it.schemes, 0)}** schemes and **${nf(it.folios, 0)}** folios.`], link);
  }
  if (/biggest inflow|highest inflow ever/.test(t)) { const S0 = ins.series, v = Math.max(...S0.netFlow), i = S0.netFlow.indexOf(v); return done([`• The largest net money in since April 2019: ${crore(v)} in **${month(S0.t[i])}** (AMFI's monthly report).`], link); }
  if (/highest|most|top|largest|biggest|outflow|redemption/.test(t) && !/for (latest|last) |since april 2019/.test(t)) {
    const by = /redemption/.test(t) ? [...items].filter((i) => isNum(i.redemption)).sort((a, b) => (b.redemption ?? 0) - (a.redemption ?? 0)) : /outflow/.test(t) ? [...items].filter((i) => i.netFlow < 0).sort((a, b) => a.netFlow - b.netFlow) : /asset|aum|largest|biggest/.test(t) ? [...items].sort((a, b) => b.aum - a.aum) : [...items].sort((a, b) => b.netFlow - a.netFlow);
    if (!by.length) return done([`• No category had money going out in ${m}.`], link);
    const f = /redemption/.test(t) ? (i: typeof items[0]) => `${crore(i.redemption)} taken out` : /asset|aum|largest|biggest/.test(t) ? (i: typeof items[0]) => `${crore(i.aum)} of assets` : (i: typeof items[0]) => `net ${crore(i.netFlow)}`;
    return done([`• ${m}, AMFI's monthly report:`, ...by.slice(0, 5).map((i, n) => `• ${n + 1}. **${i.name}** (${i.group}): ${f(i)}`)], link);
  }
  // the monthly series (AMFI's category report, from April 2019): a figure for a window of months
  const S = ins.series, n = S.t.length;
  const meas = /net inflow|net flow|money came/.test(t) ? "netFlow" : /equity aum/.test(t) ? "equityAum" : /folio/.test(t) ? "folios" : /mobilis|mobiliz/.test(t) ? "mobilized" : /redemption/.test(t) ? "redemption" : /aum|assets/.test(t) ? "aum" : null;
  const win = /since april 2019/.test(t) ? n : /last 12 months/.test(t) ? 12 : /last 3 months/.test(t) ? 3 : /latest month|last month/.test(t) ? 1 : 0;
  const fmt = (k: string, v: number) => (k === "folios" ? `**${nf(v, 0)}**` : crore(v));
  const MEAS: Record<string, string> = { netFlow: "Net money in", equityAum: "Equity assets", folios: "Folios (investor accounts)", aum: "Industry assets", mobilized: "Money put in", redemption: "Money taken out" };
  if (meas && win) {
    if (meas === "mobilized" || meas === "redemption") return done([`• ${MEAS[meas]} in ${m}: ${crore(meas === "mobilized" ? k.netFlow.mobilized : k.netFlow.redemption)} (AMFI's monthly report).`, win > 1 ? "• FinLit keeps this figure for the latest month only; the monthly series has net money in, assets and folios." : null], link);
    const vals = (S as unknown as Record<string, number[]>)[meas].slice(-Math.min(win, n)), ts = S.t.slice(-vals.length);
    if (win === 1) return done([`• ${MEAS[meas]} in ${m}: ${fmt(meas, vals[vals.length - 1])} (AMFI's monthly report).`], link);
    if (meas === "netFlow") return done([`• Net money in over the ${vals.length} months to ${m}: ${crore(vals.reduce((a, b) => a + b, 0))} in total.`, ...(vals.length <= 12 ? vals.map((v, i) => `• ${month(ts[i])}: ${crore(v)}`) : [`• Highest month: ${month(ts[vals.indexOf(Math.max(...vals))])} (${crore(Math.max(...vals))}); lowest: ${month(ts[vals.indexOf(Math.min(...vals))])} (${crore(Math.min(...vals))}).`])].slice(0, 6), link);
    const a = vals[0], b = vals[vals.length - 1];
    return done([`• ${MEAS[meas]}: ${fmt(meas, a)} at the end of ${month(ts[0])}, ${fmt(meas, b)} at the end of ${m}.`, `• Change: ${spct((b / a - 1) * 100, 1)} over ${vals.length - 1} month${vals.length === 2 ? "" : "s"}.`], link);
  }
  if (/as of which month|which month is/.test(t)) return done([`• The industry figures are AMFI's monthly report for **${m}** (as of ${day(ins.asOf)}); history from **April 2019**.`], link);
  if (/biggest inflow|highest inflow ever/.test(t)) { const v = Math.max(...S.netFlow), i = S.netFlow.indexOf(v); return done([`• The largest net money in since April 2019: ${crore(v)} in **${month(S.t[i])}**.`], link); }
  if (/share of equity/.test(t)) return done([`• Equity funds hold ${crore(S.equityAum[n - 1])} of ${crore(S.aum[n - 1])}: **${nf((S.equityAum[n - 1] / S.aum[n - 1]) * 100, 1)}%** of industry assets in ${m}.`], link);
  if (/month on month/.test(t) && /equity/.test(t)) return done([`• Equity assets, month by month:`, ...S.t.slice(-4).map((x, i, arr) => { const j = n - arr.length + i; return `• ${month(x)}: ${crore(S.equityAum[j])}${j > 0 ? ` (${spct((S.equityAum[j] / S.equityAum[j - 1] - 1) * 100, 1)})` : ""}`; })], link);
  if (/share of each group/.test(t)) return done([`• Share of industry assets in ${m}:`, ...ins.groups.map((x) => `• **${x.label}**: **${nf(x.share, 1)}%** (${crore(x.aum)})`)], link);
  if (/how many schemes/.test(t)) return done([`• **${nf(ins.groups.reduce((a, x) => a + x.schemes, 0), 0)}** schemes in AMFI's monthly report for ${m} (all groups).`], link);
  if (/how many folios/.test(t)) return done([`• **${nf(k.folios.value, 0)}** folios (investor accounts) in ${m}.`], link);
  if (/data source|source for the industry/.test(t)) return done([`• **AMFI's monthly category report** (Association of Mutual Funds in India), month by month from **April 2019**; the latest is ${m}.`], { to: "/funds/insights", label: "Open Mutual Fund Insights" });
  if (/funds of funds shown separately/.test(t)) return done(["• AMFI reports **domestic funds of funds** on their own line: they invest in other funds, so adding them to the groups would count the same money twice.", "• FinLit shows them apart, as AMFI does."], link);
  const g = ins.groups.find((x) => t.includes(x.label.toLowerCase()) || t.includes(x.key));
  if (g) return done([`• **${g.label}** funds in ${m}: assets ${crore(g.aum)} (**${nf(g.share, 1)}%** of the industry), net money in ${crore(g.netFlow)}, **${nf(g.folios, 0)}** folios in **${nf(g.schemes, 0)}** schemes.`], link);
  return done([`• Industry assets at the end of ${m}: ${crore(k.aum.value)} (${spct(k.aum.changePct, 1)} on the month before).`, `• Net money in: ${crore(k.netFlow.value)} (${crore(k.netFlow.mobilized)} in, ${crore(k.netFlow.redemption)} out).`,
    `• Folios (investor accounts): **${nf(k.folios.value, 0)}**.`, `• Source: AMFI's monthly category report of ${day(ins.asOf)}.`], link);
}

// ---------------------------------------------------------------------------------------------------------------- one fund
async function row(code: number, name: string): Promise<Row | null> {
  const l = await get<List>(`/api/mf?${new URLSearchParams({ q: name, option: "All", plans: "", size: "50" })}`).catch(() => null);
  return l?.items.find((r) => r.code === code) ?? null;
}
const retLine = (d: Detail, k: string, label: string) => {
  const r = d.returns?.[k];
  if (!r || !isNum(r.value)) return `• ${label}: not available${r?.why ? ` (${r.why})` : ""}.`;
  return `• ${label}: ${pct(r.value)}${r.kind === "cagr" ? " a year (CAGR)" : ""}, since ${day(r.from)}`;
};
async function oneFund(q: FundQ, f: Picked): Promise<Answer> {
  const d = await get<Detail>(`/api/mf/${f.code}`);
  const t = q.text.toLowerCase(), s = q.src.toLowerCase(), link = { to: fundUrl(f.code), label: `Open ${d.name}` };
  const title = `**${d.name}** (${d.plan}, ${d.option})`;
  if (/\bnav\b/.test(s + " " + t) && !/return/.test(t)) {
    return done([`• ${title}: latest NAV ${rupee(d.nav)} on ${day(d.navDate)}.`, isNum(d.prevNav) ? `• Previous NAV ${rupee(d.prevNav)} on ${day(d.prevDate)}${isNum(d.change) ? `: a change of ${spct(d.change)}` : ""}.` : null, "• From AMFI's NAV file, loaded every evening after AMFI publishes."], link);
  }
  if (/sip/.test(s + " " + t)) {
    const r = await row(f.code, d.name);
    return done([`• ${title}, monthly instalments (SIP) with the same amount each month:`, `• 3 years: ${pct(r?.sip3y)} a year (XIRR)`, `• 5 years: ${pct(r?.sip5y)} a year (XIRR)`, "• Worked out by FinLit from the fund's NAV on each month's date."], link);
  }
  if (/checklist|chk/.test(s + " " + t)) {
    const r = await row(f.code, d.name);
    const l = await get<List>(`/api/mf?size=1`);
    const checks = l.checklist?.checks ?? [];
    if (!r?.checklist) return done([`• ${title} has no checklist yet: it needs enough history and at least a few peers on the same plan.`], link);
    return done([`• ${title} passes **${r.checklist.pass} of ${r.checklist.of}** checks against its category on the same plan:`, ...checks.map((c, i) => `• ${(r.checklist!.mask >> i) & 1 ? ((r.checklist!.bits >> i) & 1 ? "Passed" : "Not passed") : "Not known"}: ${c.rule}`)], link);
  }
  if (/expense|ter\b/.test(s + " " + t) || /family \+ ter/.test(s)) {
    const fx = await get<Facts>(`/api/mf/${f.code}/facts`);
    const reg = fx.facts.terRegular, dir = fx.facts.terDirect;
    return done([`• ${title}, expense ratio (TER) from AMFI:`, `• Direct plan: ${dir?.value ? `**${dir.value}**` : dir?.unavailable ?? "not stated"}`, `• Regular plan: ${reg?.value ? `**${reg.value}**` : reg?.unavailable ?? "not stated"}`,
      (dir?.asOf || reg?.asOf) ? `• As of ${day(dir?.asOf ?? reg?.asOf)}. The Regular plan pays the distributor's commission from the fund, so its expense ratio is higher.` : null], link);
  }
  if (/\baum\b|fund size/.test(s + " " + t)) {
    const fx = await get<Facts>(`/api/mf/${f.code}/facts`);
    const a = fx.facts.aum;
    return done([`• ${title}, fund size: ${a?.value ? `**${a.value}**` : a?.unavailable ?? "not stated"}`, a?.asOf ? `• As of ${day(a.asOf)}${a.note ? `: ${a.note}` : ""}` : null, a?.source ? `• Source: ${a.source}.` : null], link);
  }
  if (/benchmark|manager|risk-o-meter|riskometer|exit load|exit|launch/.test(t) || /benchmark|disclosure|risk$/.test(s)) {
    const fx = await get<Facts>(`/api/mf/${f.code}/facts`);
    const want = /benchmark|index does/.test(t) ? ["benchmark"] : /manager/.test(t) ? ["managers"] : /exit/.test(t) ? ["exitLoad"] : /launch/.test(t) ? ["launchDate", "launch"] : /risk/.test(t) ? ["riskometer", "riskOMeter", "risk"] : ["benchmark", "managers", "riskometer"];
    const lines = want.map((k) => [k, fx.facts[k]] as const).filter(([, v]) => v);
    if (!lines.length) return done([`• FinLit does not hold this fact for ${d.name} yet.`], link);
    return done(lines.map(([k, v]) => `• ${k === "exitLoad" ? "Exit load" : k === "managers" ? "Fund managers" : k === "benchmark" ? "Benchmark" : k.startsWith("launch") ? "Launch date" : "Risk-o-meter"}: ${v!.value ? `**${v!.value}**${v!.asOf ? ` (as of ${day(v!.asOf)})` : ""}` : `not shown. ${v!.unavailable ?? ""}`}`), link);
  }
  if (/holding|invest in|portfolio|concentration|sector|bank|it\b|pharma|top 10|top-10/.test(t) || /holdings/.test(s)) {
    const p = await get<Portfolio>(`/api/mf/${f.code}/portfolio`);
    if (p.unavailable || !p.holdings?.length) return done([`• FinLit does not have ${d.name}'s holdings: ${p.unavailable ?? "its fund house's monthly portfolio file is not read yet."}`], link);
    const w = (h: Holding) => (isNum(h.weight) ? h.weight : isNum(h.pct) ? h.pct : null);
    const top = p.holdings.slice(0, 10), top10 = top.reduce((a, h) => a + (w(h) ?? 0), 0);
    const sec = /bank|it\b|pharma|auto|fmcg|energy|metal|real estate|infra|defence/.exec(t)?.[0];
    if (sec) {
      const hit = (p.sectors ?? []).filter((x) => x.name.toLowerCase().includes(sec === "it" ? "information" : sec)).map((x) => `${x.name} ${pct(x.weight ?? x.pct, 1)}`);
      return done([`• ${title}, portfolio of ${day(p.asOf)}:`, hit.length ? `• ${hit.join("; ")} of the fund.` : `• No holding in a sector named like "${sec}" in the fund's latest portfolio.`], link);
    }
    return done([`• ${title}, top holdings (portfolio of ${day(p.asOf)}):`, ...top.slice(0, 5).map((h) => `• **${h.name}**: ${pct(w(h), 2)}`), `• Top 10 together: ${pct(top10, 1)} of the fund.`], link);
  }
  if (/volatil|drawdown|fall|risk/.test(s + " " + t)) {
    const r = d.risk ?? {};
    return done([`• ${title}, how much it has moved:`, `• Volatility over 1 year: ${pct(r.vol1y?.value)}${r.vol1y?.why ? ` (${r.vol1y.why})` : ""}; over 3 years: ${pct(r.vol3y?.value)} a year`, `• Largest fall from a peak: ${isNum(r.maxDrawdown?.value) ? `**${nf(Math.abs(r.maxDrawdown!.value!), 2)}%**${r.maxDrawdown?.peak ? ` (${day(r.maxDrawdown.peak)} to ${day(r.maxDrawdown.trough)})` : ""}` : "not available"}`], link);
  }
  if (/return|cagr|perform|vs its category|above 15/.test(t) || /returns|r1y|r3y|r5y/.test(s)) {
    const y = yearsOf(q.text);
    if (/vs its category|category average/.test(t)) {
      const r = await row(f.code, d.name);
      const cat = (await filters()).categories.find((c) => c.name === d.category);
      const k = (`r${y ?? 3}y`) as "r1y" | "r3y" | "r5y";
      const peers = cat ? await allRows(listPath(cat, null, d.plan === "Regular" ? "Regular" : "Direct", k, "desc", null)) : null;
      const vals = peers?.items.map((x) => x[k]).filter(isNum) ?? [];
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return done([`• ${title}, ${y ?? 3}-year return: ${pct(r?.[k])}${y === 1 ? "" : " a year"}`, `• ${cut(d.category)} average (${vals.length} funds, same plan): ${pct(avg)}`, isNum(r?.[k]) && isNum(avg) ? `• That is ${spct((r![k] as number) - avg)} against the average.` : null], link);
    }
    if (/above 15/.test(t)) { const k = y === 1 ? "1y" : y === 5 ? "5y" : "3y"; const v = d.returns?.[k]?.value; return done([`• ${title}, ${k.replace("y", "-year")} return: ${pct(v)}${k === "1y" ? "" : " a year"}: ${isNum(v) ? (v > 15 ? "**above** 15%" : "**not above** 15%") : "no figure to compare"}.`], link); }
    const want = y === 1 ? [["1y", "1 year"]] : y === 3 ? [["3y", "3 years"]] : y === 5 ? [["5y", "5 years"]] : /1-month|1 month/.test(t) ? [["1m", "1 month"]] : /6-month|6 month/.test(t) ? [["6m", "6 months"]] : [["1m", "1 month"], ["6m", "6 months"], ["1y", "1 year"], ["3y", "3 years"], ["5y", "5 years"]];
    return done([`• ${title}, returns to ${day(d.retDate ?? d.navDate)}:`, ...want.map(([k, l]) => retLine(d, k, l)), "• Up to 1 year: absolute change; 3 and 5 years: per year (CAGR). Worked out by FinLit from AMFI's NAVs."], link);
  }
  if (/family|other plans|direct growth version/.test(s + " " + t)) {
    const fam = (d.family ?? []).filter((x) => x.active);
    return done([`• ${d.name} has **${fam.length + 1}** active plans and options:`, ...[d, ...fam].slice(0, 8).map((x) => `• ${x.plan}, ${x.option}${x.code === d.code ? " (this one)" : ""}: NAV ${rupee(x.nav)}`)], link);
  }
  // the scheme's own facts
  const facts: [RegExp, string][] = [
    [/reinvest/, `• Reinvestment ISIN of ${title}: **${d.isinReinvest ?? "none (this option does not reinvest payouts)"}**`], [/\bisin\b/, `• ISIN of ${title}: **${d.isin ?? "not stated"}**`], [/scheme code|amfi .*code/, `• AMFI scheme code: **${d.code}**`],
    [/fund house|who runs|which amc/, `• ${d.name} is run by **${d.amc}**.`], [/open-ended|close-ended|closed/, `• ${d.name}: **${d.schemeType ?? "type not stated"}**.`], [/direct or regular/, `• This is the **${d.plan}** plan.`],
    [/growth or idcw/, `• This is the **${d.option}** option (${d.optionClass}).`], [/active|publishing/, `• ${d.name} is ${d.active ? "**active**: AMFI still publishes its NAV" : "**not active**: AMFI no longer publishes its NAV"} (last NAV ${day(d.navDate)}).`],
    [/equity, hybrid or debt|which category|index fund|category is/, `• ${d.name} is in **${cut(d.category)}** (${d.category}).`],
  ];
  const hit = facts.find(([re]) => re.test(t));
  if (hit) return done([hit[1]], link);
  return done([`• ${title}: ${cut(d.category)}, run by ${d.amc}.`, `• NAV ${rupee(d.nav)} on ${day(d.navDate)}.`, retLine(d, "1y", "1 year"), retLine(d, "3y", "3 years"), retLine(d, "5y", "5 years")], link);
}
async function twoFunds(q: FundQ, a: Picked, b: Picked): Promise<Answer> {
  const y = yearsOf(q.text);
  const period = y === 1 ? "1Y" : y === 5 ? "5Y" : y === 10 ? "10Y" : "3Y";
  const link = { to: `/funds/compare?ids=${a.code},${b.code}`, label: "Compare them on FinLit" };
  const [da, db] = await Promise.all([get<Detail>(`/api/mf/${a.code}`), get<Detail>(`/api/mf/${b.code}`)]);
  const [ra, rb] = await Promise.all([row(a.code, da.name), row(b.code, db.name)]);
  const k = (`r${period === "1Y" ? 1 : period === "5Y" ? 5 : 3}y`) as "r1y" | "r3y" | "r5y";
  const line = (d: Detail, r: Row | null) => `• **${d.name}** (${d.plan}): ${k === "r1y" ? "1-year" : `${k[1]}-year`} return ${pct(r?.[k])}${k === "r1y" ? "" : " a year"}, expense ratio ${pct(r?.ter)}, fund size ${crore(r?.aum)}, largest 3-year fall ${isNum(r?.fall3y) ? `**${nf(Math.abs(r!.fall3y!), 2)}%**` : "not available"}`;
  return done([line(da, ra), line(db, rb), da.category !== db.category ? `• They are in different categories (${cut(da.category)} and ${cut(db.category)}), so their figures are not like for like.` : null,
    "• FinLit sets the figures side by side; which suits whom depends on their own goals, so it does not say which is better."], link);
}

// ---------------------------------------------------------------------------------------------------------------- ETFs
const ETF_CATS: [RegExp, string][] = [[/\bgold\b/i, "gold"], [/\bsilver\b/i, "silver"], [/nifty next 50/i, "nifty-next-50"], [/nifty 50|nifty50/i, "nifty-50"], [/sensex/i, "sensex"], [/private bank/i, "private-bank"], [/\bpsu bank\b|\bpsu\b/i, "psu"],
  [/\bbank/i, "bank"], [/\bit\b/i, "it"], [/pharma|health/i, "pharma"], [/midcap|mid cap/i, "midcap"], [/smallcap|small cap/i, "smallcap"], [/liquid/i, "liquid"], [/gilt|debt|bond/i, "debt"], [/international|nasdaq|us\b|global/i, "international"],
  [/smart beta|factor/i, "factor"], [/consumption/i, "consumption"], [/\bauto\b/i, "auto"], [/metal/i, "metal"], [/energy/i, "energy"], [/infra/i, "infra"], [/momentum/i, "momentum"], [/low vol/i, "low-volatility"], [/quality/i, "quality"]];
async function etfCategory(text: string): Promise<{ key: string; label: string } | null> {
  const list = await get<EtfList>("/api/etf?limit=1");
  const cats = list.categories ?? [];
  for (const [re, want] of ETF_CATS) if (re.test(text)) { const c = cats.find((x) => x.key === want) ?? cats.find((x) => x.key.includes(want) || x.label.toLowerCase().includes(want.replace(/-/g, " "))); if (c) return c; }
  return null;
}
const etfLink = (sym: string) => ({ to: `/etfs/${encodeURIComponent(sym)}`, label: `Open ${sym}` });
async function etfAnswer(q: FundQ, picked?: PickedEtf): Promise<Answer> {
  const t = q.text.toLowerCase();
  const named = /\b([A-Z][A-Z0-9&-]{3,19})\b/.exec(q.text.replace(/\b(ETF|ETFs|NAV|SIP|NSE|BSE|AMFI)\b/g, ""))?.[1];
  const sym = picked?.symbol ?? (named && /BEES|ETF|GOLD|NIFTY|BANK/.test(named) ? named : null);
  if (sym) {
    // the list row has the NAV as a number and the expense ratio; the detail adds nothing these answers need
    const fromList = (await get<EtfList>(`/api/etf?${new URLSearchParams({ q: sym, limit: "10" })}`)).items.find((x) => x.symbol === sym);
    const e: Etf & { isin?: string } = fromList ?? await get<Etf>(`/api/etf/${encodeURIComponent(sym)}`).then((d) => ({ ...d, nav: typeof d.nav === "object" && d.nav ? (d.nav as unknown as { value: number }).value : d.nav }));
    const link = etfLink(e.symbol), head = `**${e.name}** (${e.symbol})`;
    if (/price|day change|traded at|close/.test(t)) return done([`• ${head}: ${rupee(e.price, 2)} on ${day(e.priceDate)} (${spct(e.changePct)} on the day).`], link);
    if (/isin|symbol/.test(t)) return done([`• ${head}: NSE symbol **${e.symbol}**${e.isin ? `, ISIN **${e.isin}**` : ""}.`], link);
    if (/premium|discount|nav/.test(t)) return done([`• ${head}: price ${rupee(e.price, 2)}${isNum(e.nav) ? `, NAV ${rupee(e.nav, 4)} (${day(e.navDate)})` : ", NAV not published for this day yet"}.`, isNum(e.nav) && isNum(e.premium) ? `• It traded at a ${e.premium >= 0 ? "premium" : "discount"} of **${nf(Math.abs(e.premium), 2)}%** to its NAV.` : null], link);
    if (/expense|ter\b|cost/.test(t)) return done([`• ${head}: ${isNum(e.ter) ? `expense ratio ${pct(e.ter)} a year` : "FinLit does not have this ETF's expense ratio yet (AMFI's TER file has no line matched to it)"}.`], link);
    if (/volume|turnover|traded|liquidity/.test(t)) return done([`• ${head}: average daily turnover about ${isNum(e.avgTurnover) ? `**₹${nf(e.avgTurnover / 1e7, 1)} crore**` : "not available"} on the NSE.`], link);
    return done([`• ${head}, ${e.categoryLabel} ETF from ${e.fundHouse}:`, `• Price ${rupee(e.price, 2)} on ${day(e.priceDate)}${isNum(e.nav) ? `; NAV ${rupee(e.nav, 4)}${isNum(e.premium) ? ` (a ${e.premium >= 0 ? "premium" : "discount"} of **${nf(Math.abs(e.premium), 2)}%**)` : ""}` : ""}`,
      `• Returns: 1 year ${pct(e.ret1y)}; 3 years ${pct(e.cagr3y)} a year; 5 years ${isNum(e.cagr5y) ? `${pct(e.cagr5y)} a year` : e.why?.cagr_5y ?? "not available"}`, `• ${isNum(e.ter) ? `Expense ratio ${pct(e.ter)}; ` : ""}1-year volatility ${pct(e.vol1y, 1)}; largest fall in a year ${pct(e.mdd1y, 1)}`, "• Price returns from NSE closes; dividends are not added."], link);
  }
  const cat = await etfCategory(q.text);
  const how = /volume|turnover|traded|liquidity/.test(t) ? { sort: "turnover", order: "desc", f: (e: Etf) => (isNum(e.avgTurnover) ? `**₹${nf(e.avgTurnover / 1e7, 1)} crore** a day` : "not available"), l: "average daily turnover" }
    : /expense|cost|ter\b|cheapest|lowest cost/.test(t) ? { sort: "ter", order: "asc", f: (e: Etf) => pct(e.ter), l: "expense ratio" }
    : /premium/.test(t) ? { sort: "premium", order: "desc", f: (e: Etf) => spct(e.premium), l: "premium to NAV" } : /discount/.test(t) ? { sort: "premium", order: "asc", f: (e: Etf) => spct(e.premium), l: "discount to NAV" }
    : /5-year|5 year/.test(t) ? { sort: "cagr5y", order: "desc", f: (e: Etf) => pct(e.cagr5y), l: "5-year return (a year)" } : /3-year|3 year/.test(t) ? { sort: "cagr3y", order: "desc", f: (e: Etf) => pct(e.cagr3y), l: "3-year return (a year)" }
    : { sort: "ret1y", order: "desc", f: (e: Etf) => pct(e.ret1y), l: "1-year return" };
  const p = new URLSearchParams({ sort: how.sort, order: how.order, limit: "5", ...(cat ? { category: cat.key } : {}) });
  const list = await get<EtfList>(`/api/etf?${p}`);
  const link = { to: cat ? `/etfs?category=${encodeURIComponent(cat.key)}` : "/etfs", label: "Open the ETF list" };
  if (/how many/.test(t)) return done([`• **${nf(list.total, 0)}** ${cat ? `${cat.label} ` : ""}ETFs are listed on the NSE with prices on FinLit.`], link);
  if (!list.items.length) return done([`• FinLit has no ${cat ? cat.label + " " : ""}ETF with this figure yet.`], link);
  return done([`• ${how.order === "desc" ? "Highest" : "Lowest"} ${how.l} among **${nf(list.total, 0)}** ${cat ? `${cat.label} ` : ""}ETFs:`, ...list.items.map((e, i) => `• ${i + 1}. **${e.symbol}** (${e.name}): ${how.f(e)}`), list.asOf ? `• NSE closes of ${day(list.asOf)}.` : null], link);
}

// ---------------------------------------------------------------------------------------------------------------- above or below a figure
/** "AUM above Rs 10,000 crore", "expense ratio below 0.5%", "more than 10 years old", "launched in the last 1 year": the screener's own range filter. */
export function thresholdOf(text: string): { field: "aum" | "ter" | "age"; lo: number | null; hi: number | null; sort: string; dir: "asc" | "desc"; words: string } | null {
  const t = text.toLowerCase().replace(/(\d),(\d)/g, "$1$2");
  const last = /launched in the last (\d+) years?/.exec(t);
  if (last) { const n = Number(last[1]); return { field: "age", lo: null, hi: n, sort: "launch", dir: "desc", words: `launched in the last ${n === 1 ? "year" : `${n} years`}` }; }
  const m = /\b(above|below|more than|less than|over|under)\s*(?:rs\.?\s*|₹\s*)?(\d+(?:\.\d+)?)\s*(crore|%|years?)/.exec(t);   // a comparison word right before the figure, and its unit
  if (!m) return null;
  const n = Number(m[2]), up = /above|more than|over/.test(m[1]);
  if (m[3] === "crore") return { field: "aum", lo: up ? n : null, hi: up ? null : n, sort: "aum", dir: up ? "desc" : "asc", words: `a fund size ${up ? "above" : "below"} ₹${nf(n, 0)} crore` };
  if (m[3] === "%" && /expense ratio/.test(t)) return { field: "ter", lo: up ? n : null, hi: up ? null : n, sort: "ter", dir: up ? "desc" : "asc", words: `an expense ratio ${up ? "above" : "below"} ${n}% a year` };
  if (/^years?$/.test(m[3]) && /\byears?\s+old\b/.test(t) && up) return { field: "age", lo: n, hi: null, sort: "age", dir: "desc", words: `more than ${n} years since launch` };
  return null;
}
async function threshold(q: FundQ): Promise<Answer> {
  const th = thresholdOf(q.text)!;
  const { cat, amc, house } = await resolve(q.text), plan = planOf(q.text) ?? "Direct";
  const p = new URLSearchParams({ rng: `${th.field}:${th.lo ?? ""}:${th.hi ?? ""}`, plans: plan, sort: th.sort, dir: th.dir, size: "5", extra: "true" });
  if (cat) p.set("subs", cat.key);
  if (amc) p.set("amc", amc);
  const l = await get<List & { items: (Row & { x?: { age?: number | null; launch?: string | null } })[] }>(`/api/mf?${p}`);
  const label = what(cat, house, plan);
  const link = { to: "/funds/screener", label: "Open the fund screener" };
  const wth = th.field === "age" && th.hi ? th.words : `with ${th.words}`;
  if (!l.total) return done([`• No ${label} ${wth} on FinLit.`], link);
  const fig = (r: (typeof l.items)[0]) => th.field === "aum" ? crore(r.aum) : th.field === "ter" ? pct(r.ter) : r.x?.launch && r.x.launch >= "1963" ? `launched ${day(r.x.launch)}` : isNum(r.x?.age) ? `**${nf(r.x!.age!, 1)}** years` : "launch date not known";
  return done([`• **${nf(l.total, 0)}** ${label}, Growth options, ${wth}.`, `• ${th.field === "age" ? (th.hi ? "Newest first:" : "Oldest first:") : `${th.dir === "desc" ? "Highest" : "Lowest"} first:`}`, ...l.items.map((r, i) => `• ${i + 1}. **${r.name}**: ${fig(r)}`)], link);
}
async function dataDate(): Promise<Answer> {
  const f = await filters();
  return done([`• The latest NAVs on FinLit are AMFI's of **${day(f.dataDate)}**.`, "• FinLit loads AMFI's NAV file every evening after AMFI publishes it, so a business day's NAVs usually appear the same night.", "• Each fund's page shows the date of its own latest NAV."], { to: "/funds", label: "Open the mutual funds list" });
}

// ---------------------------------------------------------------------------------------------------------------- dispatch
const LIST_SRC = /category \+ r1y|amc \+ r5y|plan \+ r5y|^r1y$|^r3y$|^r5y$|^aum$|^aum_lakh$|^fall3y$|vol3y \/ fall3y|^ter, terregular|chk_pass|^checklist$|^sip3y$|^sip5y$|compare \+ list/;
/** Which kind of answer a question gets: written text, one fund, two funds, an ETF, a ranked or plain list, a count, an average or the industry. */
export function kindOf(q: FundQ): "written" | "fund" | "two" | "etf" | "rank" | "show" | "count" | "average" | "industry" | "house" | "threshold" | "date" {
  const s = q.src.toLowerCase();
  if (/^guardrail|^education|^not loaded/i.test(q.status) && !/data-based lists/i.test(q.status)) return "written";
  if (q.slots.includes("fund2")) return "two";
  if (q.slots.includes("fund")) return "fund";
  if (q.slots.includes("etf") || /^etf|ret_1y|avg_turnover/.test(s) || q.seg === 16) return "etf";
  if (/not stored per amc/.test(s)) return "house";
  if (thresholdOf(q.text)) return "threshold";
  if (/^when was the nav last updated|^what is the data date/i.test(q.text)) return "date";
  if (/\btoday\b/i.test(q.text) && /\b(gained|fell)\b/i.test(q.text)) return "rank";
  if (/insights|mf_industry|net_flow|aum, folios/.test(s)) return "industry";
  if (/filters counts/.test(s) || /^how many/i.test(q.text)) return "count";
  if (/derived from list|average/.test(s) || /\baverage\b/i.test(q.text)) return "average";
  if (LIST_SRC.test(s) || /\b(top|best|highest|lowest|largest|biggest|smallest|cheapest)\b/i.test(q.text)) return "rank";
  if (/category|amc|plan|search/.test(s)) return "show";
  return "written";
}

/** The answer to one listed question, from FinLit's data or its written text. `written` holds the written answers (askFundsText.ts, loaded with the theme). */
export async function answerFundQ(q: FundQ, ctx: FundCtx, written: Record<string, { text: string; link?: Answer["link"] }>): Promise<Answer> {
  const w = written[q.id];
  const k = kindOf(q);
  if (w && (k === "written" || !["fund", "two", "etf"].includes(k) || /^guardrail|^not loaded/i.test(q.status))) {
    return { text: [w.text.replace(/\{fund2\}/g, ctx.fund2?.name ?? "the second fund").replace(/\{fund\}/g, ctx.fund?.name ?? "the fund").replace(/\{etf\}/g, ctx.etf?.symbol ?? "the ETF"), FUND_DISCLAIMER].join("\n"), link: w.link };
  }
  switch (k) {
    case "two": if (ctx.fund && ctx.fund2) return twoFunds(q, ctx.fund, ctx.fund2); break;
    case "fund": if (ctx.fund) return oneFund(q, ctx.fund); break;
    case "etf": return etfAnswer(q, q.slots.includes("etf") ? ctx.etf : undefined);
    case "house": return houseSizes(q);
    case "threshold": return threshold(q);
    case "date": return dataDate();
    case "industry": return industry(q);
    case "count": return counts(q);
    case "average": return categoryAverage(q);
    case "rank": return rankList(q);
    case "show": return showList(q);
  }
  return done([`• This question needs ${k === "two" ? "two funds" : "a fund"} to be chosen first.`], { to: "/funds", label: "Open the mutual funds list" });
}

// ---------------------------------------------------------------------------------------------------------------- picking a fund or an ETF
/** Funds whose name, code or ISIN matches what was typed (Growth options first, as on the funds list). */
export async function findFunds(term: string): Promise<Picked[]> {
  const t = term.trim();
  if (t.length < 2) return [];
  const l = await apiGet<List>(`/api/mf?${new URLSearchParams({ q: t, size: "8" })}`);
  return l.items.map((r) => ({ code: r.code, name: r.name, plan: r.plan, option: r.option }));
}
export async function findEtfs(term: string): Promise<PickedEtf[]> {
  const t = term.trim();
  if (t.length < 2) return [];
  const l = await apiGet<EtfList>(`/api/etf?${new URLSearchParams({ q: t, limit: "8" })}`);
  return l.items.map((e) => ({ symbol: e.symbol, name: e.name }));
}
