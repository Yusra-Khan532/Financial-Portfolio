// Task #276 (ETF portfolio, 20 Nov pack): the words and small bars of the ETF page's Key figures, the score card ("What your ETFs cost"), the three view
// cards and the windows printed beside every beta and index figure (number fixes 4, 5 and 8). Every candidate returns null when it has nothing to say;
// the page shows the first three non-null of each view's ordered list. Figures are the server's (/api/me/etf-portfolio, /inside, /risk); this file only
// picks and words them. Describes; never advice.
import type { EtfPortfolio, EtfRisk, EtfRow, Inside } from "./etfPortfolio";
import type { KfCard, KfGo } from "../portfolio/kit/keyFigs";
import { pickCards } from "../portfolio/kit/keyFigs";
import { andList } from "../portfolio/shared/words";
import { num as fmtNum } from "./format";

export type EtfKfCtx = { d: EtfPortfolio; ins?: Inside; rk?: EtfRisk };
type Cand = (c: EtfKfCtx) => KfCard | null;

const MINUS = "−";
const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"];
const num = (n: number) => NUM[n] ?? String(n);
const signed = (v: number, d = 2) => `${v > 0 ? "+" : v < 0 ? MINUS : ""}${Math.abs(v).toFixed(d)}%`;
const live = (d: EtfPortfolio | undefined): EtfRow[] => (d?.items ?? []).filter((i) => !i.gone);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "19 Nov" from an ISO date. */
export const dm = (iso: string | null | undefined) => { if (!iso) return ""; const [, m, d] = iso.slice(0, 10).split("-"); return `${Number(d)} ${MON[Number(m) - 1] ?? ""}`; };
const dmy = (iso: string | null | undefined) => (iso ? `${dm(iso)} ${iso.slice(0, 4)}` : "");
const and = andList;   // task #390 (fault 4): "A, B and C"
// Task #390 (developer file 34, Key figures K1–K10): each card asks one question (`q`) and answers it with one big figure (`big`, the first number of the
// old summary, a "+" kept) and the line beside it (`ans`); the method line (`note`, `from`) sits behind the card's i (KeyFigsBox).
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
/** The list's weights (0..1): by value once every ETF has a quantity, else each the same. */
const wOf = (d: EtfPortfolio) => { const xs = live(d), n = xs.length || 1; return new Map(xs.map((e) => [e.symbol, e.weight != null ? e.weight / 100 : 1 / n])); };

// ------------------------------------------------------------------------------------------------ windows (number fixes 4 and 5)
const GRAIN: Record<string, string> = { daily: "daily", weekly: "weekly", monthly: "monthly" };
const WINDOW: Record<string, string> = { "1y": "past year", "2y": "past 2 years", "3y": "past 3 years", "5y": "past 5 years" };
type BetaWindow = { index?: string | null; grain?: string | null; window?: string | null; from?: string | null; to?: string | null } | null | undefined;
/** "vs Nifty 500 · weekly · past year": printed under every beta. Without the server's window, the page's own contract (betaPast is weekly, past year). */
export function betaWindowText(w: BetaWindow): string {
  return `vs ${w?.index || "Nifty 500"} · ${GRAIN[w?.grain ?? ""] ?? "weekly"} · ${WINDOW[w?.window ?? ""] ?? "past year"}`;
}
/** "3 yrs, daily": the window of the index figure beside the list's swing. Years from the server, else from the dates it sent. */
export function benchWindow(b: EtfRisk["bench"] | undefined): string {
  if (!b) return "";
  const x = b as EtfRisk["bench"] & { years?: number | null; grain?: string | null };
  const yrs = x.years ?? (b.from && b.to ? Math.round(((Date.parse(b.to) - Date.parse(b.from)) / (365.25 * 864e5)) * 10) / 10 : null);
  const y = yrs == null ? "" : `${Math.round(yrs) === yrs || Math.abs(yrs - Math.round(yrs)) < 0.15 ? Math.round(yrs) : yrs} ${Math.round(yrs) === 1 ? "yr" : "yrs"}`;
  return [y, x.grain ?? "daily"].filter(Boolean).join(", ");
}
/** "Nifty 500: 14.4% (3 yrs, daily)". */
export const benchText = (b: EtfRisk["bench"] | undefined) => (b?.swing == null ? "Nifty 500: not enough prices" : `${b.name}: ${b.swing.toFixed(1)}% (${benchWindow(b)})`);

/** The list's swing must not be above the weighted average of its ETFs' swings (number fix 3). Returns the cap, and whether the figure breaks it. */
export function swingCheck(rk: EtfRisk | undefined): { cap: number | null; over: boolean } {
  if (!rk) return { cap: null, over: false };
  const xs = rk.etfs.filter((e) => e.swing != null), w = xs.reduce((a, e) => a + e.weight, 0);
  const cap = xs.length && w ? xs.reduce((a, e) => a + (e.swing as number) * e.weight, 0) / w : null;
  return { cap, over: cap != null && rk.list.swing != null && rk.list.swing > cap + 0.5 };
}

// ------------------------------------------------------------------------------------------------ the score card and the view cards
/** "What your ETFs cost": the list's average expense ratio (by the list's weights) and each ETF's, highest first. */
export function costCard(d: EtfPortfolio) {
  const w = wOf(d), xs = live(d), have = xs.filter((e) => e.ter?.value != null);
  const tw = have.reduce((a, e) => a + (w.get(e.symbol) ?? 0), 0);
  const ter = have.length && tw ? have.reduce((a, e) => a + (e.ter!.value as number) * (w.get(e.symbol) ?? 0), 0) / tw : null;
  const rows = [...have].sort((a, b) => (b.ter!.value as number) - (a.ter!.value as number)).map((e) => ({ symbol: e.symbol, ter: e.ter!.value as number }));
  const missing = xs.filter((e) => e.ter?.value == null).map((e) => ({ symbol: e.symbol, why: e.ter?.why ?? "No expense ratio in AMFI's file." }));
  const asOf = have.map((e) => e.ter?.asOf).filter(Boolean).sort().pop() ?? null;
  return { ter, rows, missing, asOf, perLakh: ter == null ? null : Math.round(ter * 1000) };
}

const TYPE_COLOR: Record<string, string> = { indian: "#0e6471", gold: "#b8892f", silver: "#8fa8a6", abroad: "#4b4fc4", debt: "#9aa3ad", liquid: "#9aa3ad" };
/** The shares of the list by type, for the small stack on the Your ETFs card. */
export function typeStack(d: EtfPortfolio) {
  const w = wOf(d), m = new Map<string, number>();
  for (const e of live(d)) { const k = e.type?.key ?? "indian"; m.set(k, (m.get(k) ?? 0) + (w.get(e.symbol) ?? 0)); }
  return [...m].map(([k, v]) => ({ key: k, v, color: TYPE_COLOR[k] ?? "#9aa3ad" }));
}
/** The companies underneath (look-through over Indian shares): distinct companies, the share ETFs, the sizes and macro sectors with money in them. */
export function underneath(ins: Inside | undefined, d: EtfPortfolio) {
  const lt = ins?.lookThrough?.macro ?? {}, cos = new Set<string>(), sizes = new Set<string>(), macros = new Set<string>();
  for (const [k, c] of Object.entries(lt)) { const [m, sz] = k.split("|"); if (c.w > 0) { macros.add(m); if (sz && sz !== "Unsized") sizes.add(sz); } for (const s of c.stocks) cos.add(s.symbol ?? s.name); }
  const shareEtfs = live(d).filter((e) => e.type?.key === "indian" && ins?.perEtf?.[e.symbol]);
  return { companies: cos.size, sizes: sizes.size, macros: [...macros].filter((m) => m !== "Not classified").length, shareEtfs: shareEtfs.map((e) => e.symbol) };
}
/** "About 400 companies": exact under 100, to the nearest 10 under 200, else to the nearest 50. */
export const aboutN = (n: number) => (n < 100 ? `${n}` : `About ${n < 200 ? Math.round(n / 10) * 10 : Math.round(n / 50) * 50}`);

// ------------------------------------------------------------------------------------------------ Your ETFs: Key figures
const go = (label: string, kind: KfGo["kind"], arg: string): KfGo => ({ label, kind, arg });

export const whatTheyCost: Cand = ({ d }) => {
  const c = costCard(d);
  if (c.ter == null || !c.rows.length) return null;
  const max = Math.max(1, ...c.rows.map((r) => r.ter));
  const hi = c.rows[0], lo = c.rows[c.rows.length - 1];
  return { id: "cost", tone: "info", k: "What they cost", q: "What do your ETFs cost a year?", big: `${c.ter.toFixed(2)}% a year`, ans: `on average: about ₹${c.perLakh!.toLocaleString("en-IN")} on ₹1 lakh`, lead: `${c.ter.toFixed(2)}% a year on average`, rest: `: about ₹${c.perLakh!.toLocaleString("en-IN")} on ₹1 lakh.`,
    rows: c.rows.map((r) => ({ label: r.symbol, value: r.ter, max, text: `${r.ter.toFixed(2)}%` })),
    note: `${c.rows.length > 1 ? `${hi.symbol} costs the most and ${lo.symbol} the least.` : ""}${c.missing.length ? ` No expense ratio for ${and(c.missing.map((m) => m.symbol))}: ${c.missing[0].why}` : ""}`.trim(),
    from: `AMFI's TER file${c.asOf ? ` of ${dmy(c.asOf)}` : ""}`, go: go("Sort by cost", "sort", "ter") };
};

/** Fix 8 (code F): the label by sign: "Furthest below its value" or "Furthest above its value"; null when no ETF is 0.1% or more from its NAV. */
export const priceVsValue: Cand = ({ d }) => {
  const xs = live(d).filter((e) => e.premium != null);
  const far = [...xs].sort((a, b) => Math.abs(b.premium as number) - Math.abs(a.premium as number))[0];
  if (!far || Math.abs(far.premium as number) < 0.1) return null;
  const up = (far.premium as number) > 0, others = xs.filter((e) => e !== far), within = Math.max(0, ...others.map((e) => Math.abs(e.premium as number)));
  const max = Math.max(0.01, ...xs.map((e) => Math.abs(e.premium as number)));
  return { id: "nav", tone: "warn", k: up ? "Furthest above its value" : "Furthest below its value", q: "Which ETF trades furthest from its value?", big: `${Math.abs(far.premium as number).toFixed(2)}%`,
    ans: `${far.symbol} traded ${up ? "above" : "below"} its value on ${dm(far.navDate ?? far.priceDate ?? d.asOf)}, the furthest of the ${num(xs.length)}`,
    lead: `${far.symbol} traded ${Math.abs(far.premium as number).toFixed(2)}% ${up ? "above" : "below"} its value`, rest: ` on ${dm(far.navDate ?? far.priceDate ?? d.asOf)}, the furthest of the ${num(xs.length)}.`,
    rows: [...xs].sort((a, b) => Math.abs(b.premium as number) - Math.abs(a.premium as number)).map((e) => ({ label: e.symbol, value: Math.abs(e.premium as number), max, text: signed(e.premium as number), neg: (e.premium as number) < 0 })),
    note: `Price against NAV at the close.${others.length ? ` The other ${num(others.length)} ${others.length === 1 ? "was" : "were"} within ${(Math.ceil(within * 20) / 20).toFixed(2)}% either way.` : ""}`,
    from: "NSE closing prices and AMFI's NAV", go: go("Open the Trading columns", "cols", "trading") };
};

export const pastYear: Cand = ({ d }) => {
  const xs = live(d).filter((e) => e.ret1y != null);
  if (!xs.length) return null;
  const a = avg(xs.map((e) => e.ret1y as number))!, max = Math.max(0.01, ...xs.map((e) => Math.abs(e.ret1y as number)));
  const miss = live(d).filter((e) => e.ret1y == null);
  return { id: "year", tone: "good", k: "The past year", q: "How did they do over the past year?", big: signed(a), ans: "on average over the past year, price only", lead: `${signed(a)} on average over the past year`, rest: ", price only.",
    rows: [...xs].sort((p, q) => (q.ret1y as number) - (p.ret1y as number)).map((e) => ({ label: e.symbol, value: Math.abs(e.ret1y as number), max, text: signed(e.ret1y as number), neg: (e.ret1y as number) < 0 })),
    note: `Price returns to the last close; dividends are not included.${miss.length ? ` ${and(miss.map((e) => e.symbol))}: ${miss[0].ret1yWhy ?? "under a year of prices"}.` : ""}`,
    from: "NSE closing prices", go: go("Sort by 1 year", "sort", "r1") };
};

/** Fix 8: "Same index twice" says nothing when no two ETFs follow one index, so it is null (never "None"). */
export const sameIndexTwice: Cand = ({ d }) => {
  const r = d.repeats?.[0];
  if (!r) return null;
  return { id: "twice", tone: "warn", k: "Same index twice", q: "Do your ETFs hold the same companies?", big: `${r.symbols.length} ETFs`, ans: `${and(r.symbols)} follow the ${r.label}; the second adds no spread across companies`, lead: `${and(r.symbols)} follow the ${r.label}`, rest: "; the second adds no spread across companies.", note: "What differs is the fund house, the cost and how much trades each day.", from: "Each ETF's stated benchmark", go: go("See the shared stocks", "jump", "etp-shared") };
};

// ------------------------------------------------------------------------------------------------ What's inside: Key figures
const MIX: [keyof Inside["mix"], string, string][] = [["indian", "Indian shares", "#0e6471"], ["gold", "Gold", "#b8892f"], ["silver", "Silver", "#8fa8a6"], ["abroad", "Shares abroad", "#4b4fc4"], ["debt", "Debt and cash", "#9aa3ad"]];
const pc1 = (v: number) => { const r = Math.round(v * 10) / 10; return `${Number.isInteger(r) ? r : r.toFixed(1)}%`; };
/** A metal ETF whose file was read without its metal (number fix 2): named so the card says why silver or gold looks missing. */
export function metalGaps(d: EtfPortfolio, ins: Inside | undefined): string[] {
  if (!ins) return [];
  return live(d).filter((e) => (e.type?.key === "silver" || e.type?.key === "gold") && (ins.mix[e.type.key as "silver" | "gold"] ?? 0) < 1).map((e) => e.symbol);
}
export const whereTheMoneyIs: Cand = ({ d, ins }) => {
  if (!ins?.mix) return null;
  const parts = MIX.map(([k, l, c]) => ({ k, label: l, value: ins.mix[k] ?? 0, color: c })).filter((p) => p.value >= 0.05);
  if (!parts.length) return null;
  const top = [...parts].sort((a, b) => b.value - a.value)[0], rest = parts.filter((p) => p !== top);
  const gaps = metalGaps(d, ins);
  const restText = rest.map((p) => (p.k === "debt" && p.value < 1 ? "debt and cash under 1%" : `${p.label.toLowerCase()} ${pc1(p.value)}`));
  return { id: "mix", tone: "warn", k: "Where the money is", q: "What does your money hold?", big: pc1(top.value),
    ans: `${top.label}.${restText.length ? ` ${restText.join(", ").replace(/^./, (x) => x.toUpperCase())}` : ""}`, lead: `${top.label}: ${pc1(top.value)}`, rest: `.${restText.length ? ` ${restText.join(", ").replace(/^./, (x) => x.toUpperCase())}.` : ""}`,
    stack: parts.map((p) => ({ label: p.label, value: p.value, color: p.color, text: pc1(p.value) })),
    note: gaps.length ? `Data to check: ${and(gaps)} ${gaps.length === 1 ? "is" : "are"} read without ${gaps.length === 1 ? "its" : "their"} metal in the fund house's file, so ${gaps.length === 1 ? "it shows" : "they show"} here as debt and cash.` : "",
    from: `Each ETF's monthly file${ins.asOf ? ` of ${dmy(ins.asOf)}` : ""}${ins.mixFromType?.length ? `; ${and(ins.mixFromType)} by ${ins.mixFromType.length === 1 ? "its" : "their"} type` : ""}`,
    go: go("See what your money is in", "jump", "etp-money") };
};

const SEC_COLORS = ["#0e6471", "#4b4fc4", "#b5541c", "#2e7d57", "#a3324a"];
/** The look-through over the list's money (0..1): each macro sector's and each size's share of the list. */
function grid(ins: Inside) {
  const bySec = new Map<string, number>(), bySize = new Map<string, number>();
  for (const [k, c] of Object.entries(ins.lookThrough?.macro ?? {})) { const [m, sz] = k.split("|"); bySec.set(m, (bySec.get(m) ?? 0) + c.w); bySize.set(sz || "Unsized", (bySize.get(sz || "Unsized") ?? 0) + c.w); }
  return { bySec, bySize };
}
export const largestSector: Cand = ({ d, ins }) => {
  if (!ins?.lookThrough) return null;
  const { bySec } = grid(ins), secs = [...bySec].filter(([m]) => m !== "Not classified").sort((a, b) => b[1] - a[1]);
  if (!secs.length) return null;
  const [[n1, w1], second] = secs, known = ins.knownShares ?? secs.reduce((a, [, w]) => a + w, 0), u = underneath(ins, d);
  const shown = secs.slice(0, 4), more = secs.slice(4), moreW = more.reduce((a, [, w]) => a + w, 0);
  return { id: "sector", tone: "info", k: "Largest sector underneath", q: "Where is most of your money underneath?", big: `${(w1 * 100).toFixed(1)}%`,
    ans: `of your list is in ${n1}${second ? `, ${w1 - second[1] < 0.01 ? "just ahead of" : "ahead of"} ${second[0]} at ${(second[1] * 100).toFixed(1)}%` : ""}`, lead: `${n1}: ${(w1 * 100).toFixed(1)}%`,
    rest: ` of your list${second ? `, ${w1 - second[1] < 0.01 ? "just ahead of" : "ahead of"} ${second[0]} at ${(second[1] * 100).toFixed(1)}%` : ""}.`,
    stack: [...shown.map(([m, w], i) => ({ label: m, value: w * 100, color: SEC_COLORS[i], text: `${(w * 100).toFixed(1)}%` })),
      ...(more.length ? [{ label: `${more.length} more`, value: moreW * 100, color: SEC_COLORS[4], text: `${(moreW * 100).toFixed(1)}%` }] : []),
      ...(known < 0.999 ? [{ label: "Not in shares", value: (1 - known) * 100, color: "#9aa3ad", text: `${((1 - known) * 100).toFixed(1)}%` }] : [])],
    note: `${u.macros} macro sectors and ${aboutN(u.companies).toLowerCase()} companies, through ${and(u.shareEtfs)}.`, from: `NSE's macro sectors, from each fund house's file${ins.asOf ? ` of ${dmy(ins.asOf)}` : ""}`,
    go: go("See the sector grid", "jump", "etp-own") };
};
const SIZE_COLORS: Record<string, string> = { Large: "#0e6471", Mid: "#4b4fc4", Small: "#b5541c", Micro: "#7a5c1f", Unsized: "#9aa3ad" };
const SIZE_WORD: Record<string, string> = { Large: "large", Mid: "mid-sized", Small: "small", Micro: "micro" };
export const companySizes: Cand = ({ ins }) => {
  if (!ins?.lookThrough) return null;
  const { bySize } = grid(ins), known = ins.knownShares ?? [...bySize.values()].reduce((a, b) => a + b, 0);
  const sized = (["Large", "Mid", "Small", "Micro"] as const).map((s) => [s, bySize.get(s) ?? 0] as const);
  const top = [...sized].sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] <= 0) return null;
  const notSized = (1 - known) + (bySize.get("Unsized") ?? 0);
  // task #390 (fault 5): "Mostly" only above 50% of the list; otherwise "29.8% of your list is in large companies"
  const most = top[1] > 0.5, tp = `${(top[1] * 100).toFixed(1)}%`;
  return { id: "sizes", tone: "good", k: "Company sizes underneath", q: "How big are the companies underneath?", big: tp, ans: `of your list is in ${SIZE_WORD[top[0]]} companies`,
    lead: most ? `Mostly ${SIZE_WORD[top[0]]} companies` : tp, rest: most ? `: ${tp} of your list.` : ` of your list is in ${SIZE_WORD[top[0]]} companies.`,
    stack: [...sized.filter(([, w]) => w > 0).map(([s, w]) => ({ label: s, value: w * 100, color: SIZE_COLORS[s], text: `${(w * 100).toFixed(1)}%` })),
      ...(notSized > 0.0005 ? [{ label: "Not in shares or not sized", value: notSized * 100, color: SIZE_COLORS.Unsized, text: `${(notSized * 100).toFixed(1)}%` }] : [])],
    note: "FinLit's four sizes: large above ₹75,000 Cr, mid ₹25,000–75,000 Cr, small ₹10,000–25,000 Cr, micro below ₹10,000 Cr.", from: "Market values on NSE, FinLit's ₹ rule", go: go("See sizes inside each ETF", "jump", "etp-sizes") };
};

// ------------------------------------------------------------------------------------------------ Risk: Key figures
export const movesWithMarket: Cand = ({ rk }) => {
  const b = rk?.own?.list.beta500;
  if (b == null || !rk) return null;
  const xs = rk.etfs.filter((e) => e.betaPast != null).sort((a, c) => (c.betaPast as number) - (a.betaPast as number));
  const max = Math.max(1.5, ...xs.map((e) => e.betaPast as number)), w = rk.etfs.find((e) => (e as { betaWindow?: BetaWindow }).betaWindow)?.betaWindow as BetaWindow;
  const calm = xs.filter((e) => e.differentAsset).map((e) => e.type?.word.toLowerCase() ?? e.symbol), shares = xs.filter((e) => e.type?.key === "indian");
  return { id: "beta", tone: "good", k: "How it moves with the market", q: "How much does your list move with the market?", big: `${fmtNum(b)}×`,
    ans: `it has moved about ${Math.round(b * 10)}% when the Nifty 500 moved 10%`, lead: `${fmtNum(b)}×`, rest: `: it has moved about ${Math.round(b * 10)}% when the Nifty 500 moved 10%.`,
    rows: xs.map((e) => ({ label: e.symbol, value: Math.max(0, e.betaPast as number), max, text: fmtNum(e.betaPast as number) })   /* task #390 (file 39 C3): the site's minus sign, "−0.04" */), line: 1,
    note: `${shares.length ? `The ${num(shares.length)} share ${shares.length === 1 ? "ETF moves" : "ETFs move"} with the market` : ""}${calm.length ? `${shares.length ? "; " : ""}${and([...new Set(calm)])} move on ${calm.length === 1 ? "its" : "their"} own ${calm.length === 1 ? "market" : "markets"} and bring the list's beta down` : ""}.`,
    from: betaWindowText(w ?? { index: "Nifty 500", grain: "weekly", window: "1y" }), go: go("See each ETF against the Nifty 500", "jump", "etp-n500") };
};
export const whereSwingsComeFrom: Cand = ({ rk, d }) => {
  const xs = (rk?.etfs ?? []).filter((e) => e.riskShare != null).sort((a, b) => (b.riskShare as number) - (a.riskShare as number));
  if (!xs.length) return null;
  const top = xs[0], max = Math.max(1, ...xs.map((e) => e.riskShare as number)), eq = d.basis !== "value";
  return { id: "share", tone: "warn", k: "Where the swings come from", q: "Which ETF brings the most swing?", big: `${Math.round(top.riskShare as number)}%`,
    ans: `of the swings come from ${top.symbol}, ${Math.round(top.weight)}% of the list`, lead: `${top.symbol}: ${Math.round(top.riskShare as number)}% of the swings`, rest: `, from ${Math.round(top.weight)}% of the list.`,
    rows: xs.map((e) => ({ label: e.symbol, value: e.riskShare as number, max, text: `${(e.riskShare as number).toFixed(1)}%` })),
    note: eq ? `Each ETF is ${Math.round(100 / (live(d).length || 1))}% of the list until you add quantities.` : "Each ETF counts by the value of your quantity.",
    from: "Weekly prices, past year", go: go("See share of the risk", "jump", "etp-share") };
};
export const howMuchItSwings: Cand = ({ rk }) => {
  const l = rk?.list, b = rk?.bench;
  if (!rk || l?.swing == null || b?.swing == null) return null;
  const chk = swingCheck(rk), max = Math.max(l.swing, b.swing);
  return { id: "swing", tone: "info", k: "How much it swings", q: "How much does it swing in a year?", big: `${l.swing.toFixed(1)}%`, ans: `in a typical year, against ${b.swing.toFixed(1)}% for the Nifty 500`, lead: `${l.swing.toFixed(1)}% in a typical year`, rest: `, against ${b.swing.toFixed(1)}% for the Nifty 500.`,
    rows: [{ label: "Your list", value: l.swing, max, text: `${l.swing.toFixed(1)}%`, neg: l.swing > b.swing }, { label: "Nifty 500", value: b.swing, max, text: `${b.swing.toFixed(1)}%`, muted: true }],
    note: `${l.worstFall != null && b.worstFall != null ? `Its worst fall from a high was ${signed(l.worstFall, 1)}, against ${signed(b.worstFall, 1)} for the Nifty 500.` : ""}${chk.over ? ` Data to check: the list's swing is above the ${chk.cap!.toFixed(1)}% average of its ETFs, which a mix cannot be.` : ""}`.trim(),
    from: `Nifty 500 ${b.swing.toFixed(1)}% · ${benchWindow(b)}`, go: go("See each ETF's risk", "jump", "etp-each") };
};

/** Each view's ordered list. */
export const ETF_KF = {
  etfs: [whatTheyCost, priceVsValue, pastYear, sameIndexTwice],
  inside: [whereTheMoneyIs, largestSector, companySizes],
  risk: [movesWithMarket, whereSwingsComeFrom, howMuchItSwings],
};
export const etfKeyFigures = (view: keyof typeof ETF_KF, c: EtfKfCtx) => pickCards(ETF_KF[view], c);

// ------------------------------------------------------------------------------------------------ What changed: the companies inside the ETFs
export type InsideCo = { symbol: string; name: string; w: number; etfs: string[] };
/** The companies that are `min`% or more of the list through its ETFs (look-through over Indian shares), biggest first, each with the ETFs that hold it.
 *  A company's ETFs come from the server (each look-through stock's `etfs`); without them, the top-holdings table names them, or the one share ETF with a
 *  file. Exported for tests. */
export function insideCompanies(d: EtfPortfolio, ins: Inside | undefined, min = 0.3): InsideCo[] {
  if (!ins?.lookThrough) return [];
  const one = live(d).filter((e) => e.type?.key === "indian" && ins.perEtf?.[e.symbol]).map((e) => e.symbol);
  const top = new Map(ins.top.filter((t) => t.symbol).map((t) => [t.symbol as string, t.etfs]));
  const m = new Map<string, InsideCo>();
  for (const c of Object.values(ins.lookThrough.macro ?? {})) for (const st of c.stocks as (typeof c.stocks[number] & { etfs?: string[] })[]) {
    if (!st.symbol) continue;
    const x = m.get(st.symbol) ?? { symbol: st.symbol, name: st.name, w: 0, etfs: [] };
    x.w += st.w * 100;
    x.etfs = [...new Set([...x.etfs, ...(st.etfs ?? top.get(st.symbol) ?? (one.length === 1 ? one : []))])];
    m.set(st.symbol, x);
  }
  return [...m.values()].filter((x) => x.w >= min - 1e-9).sort((a, b) => b.w - a.w);
}
/** "0.36% of your ETFs · SMALL250". */
export const insideLine = (c: InsideCo) => `${c.w.toFixed(2)}% of your ETFs${c.etfs.length ? ` · ${c.etfs.join(", ")}` : ""}`;
