// Task #275 (change 9 and number fix 8): the MF portfolio's Key figures, three cards under the main section of each view, on the shared card (portfolio/kit
// KeyFigsBox). Each card is a template filled from the API (/api/me/mf-portfolio, /diversification, /risk); a candidate with nothing to say returns null and
// the view shows the first three that do ("One theme twice: None" can no longer appear). Every figure is the server's. Describes; never advice.
import { pickCards, type KfCandidate, type KfCard, type KfGo } from "../portfolio/kit/keyFigs";
import type { Holding, MfSpread } from "./mfPortfolio";
import type { MfRisk } from "./mfPack";
import { fundName } from "./mfPack";

export type MfKfCtx = { hs: Holding[]; sp?: MfSpread; rk?: MfRisk; /** the server's list score and band (the health card's), used over a local average */ list?: { value: number | null; label: string | null } };
type Cand = KfCandidate<MfKfCtx>;
const go = (label: string, kind: KfGo["kind"], arg: string): KfGo => ({ label, kind, arg });
const cap = (w: string | null | undefined) => (w ? w.charAt(0) + w.slice(1).toLowerCase() : "");
const p0 = (x: number) => `${Math.round(x)}%`, p1 = (x: number) => `${x.toFixed(1)}%`;
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const signed = (x: number) => `${x < 0 ? "−" : "+"}${Math.abs(x).toFixed(1)}%`;
const short = (h: Holding) => (fundName(h.name) || `Scheme ${h.code}`).replace(/ Fund$/, "");
const BANDS = ["Healthy", "Average", "Weak", "Poor"] as const;
const BAND_COLOR: Record<string, string> = { Strong: "#1f7a4d", Healthy: "#2e9d5b", Average: "#c98a1a", Weak: "#d04545", Poor: "#8e2a2a" };
const PARTS = [["performance", "Performance"], ["risk", "Risk"], ["cost", "Cost"], ["quality", "Quality"]] as const;

/** Whole percentages that keep their total (largest remainder): 48.5 + 51.5 reads 49 + 51, not 49 + 52. Exported for tests. */
export function whole(xs: number[]): number[] {
  const tot = Math.round(xs.reduce((a, b) => a + b, 0)), fl = xs.map(Math.floor), left = tot - fl.reduce((a, b) => a + b, 0);
  xs.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]).slice(0, Math.max(0, left)).forEach(([, i]) => { fl[i] += 1; });
  return fl;
}

// ------------------------------------------------------------------------------------------------ Your funds
/** How healthy your fund(s) are: the list's average Fund Health Score and its band, the count in each band, and the lowest-ranked fund's place. */
export const howHealthy: Cand = ({ hs, list }) => {
  const sc = hs.filter((h) => h.score.final != null);
  if (!sc.length) return null;
  const avg = Math.round(list?.value ?? sc.reduce((a, h) => a + (h.score.final as number), 0) / sc.length);
  const counts = new Map<string, number>(); sc.forEach((h) => { const w = cap(h.score.label); counts.set(w, (counts.get(w) ?? 0) + 1); });
  const band = sc.length === 1 ? cap(sc[0].score.label) : list?.label ? cap(list.label) : avg >= 80 ? "Strong" : avg >= 65 ? "Healthy" : avg >= 50 ? "Average" : avg >= 35 ? "Weak" : "Poor";
  const words = [...(counts.get("Strong") ? ["Strong"] : []), ...BANDS];
  const low = [...sc].sort((a, b) => (a.score.final as number) - (b.score.final as number))[0], rank = low.score.rank;
  const weakest = [...words].reverse().find((w) => counts.get(w));
  return { id: "health", tone: avg < 50 ? "warn" : "good", k: sc.length === 1 ? "How healthy your fund is" : "How healthy your funds are",
    lead: `${sc.length === 1 ? "Your fund scores" : "Your funds average"} ${avg} of 100: ${band}`, rest: ".",
    stack: words.map((w) => ({ label: w, value: counts.get(w) ?? 0, color: BAND_COLOR[w], text: String(counts.get(w) ?? 0) })),
    note: rank ? `${short(low)} ranks ${ord(rank.rank)} of ${rank.of} in its category by the Fund Health Score.` : `${short(low)} reads lowest at ${Math.round(low.score.final as number)}.`,
    from: "Fund Health Score of each fund", go: go(weakest ? `Show the ${weakest} ${counts.get(weakest) === 1 ? "fund" : "funds"}` : "See your funds", "sort", `health:${weakest ?? ""}`) };
};
/** Its weakest part: the lowest of the four Health parts (of the list's lowest-scoring fund when there are several), with the four parts as bars. */
export const weakestPart: Cand = ({ hs }) => {
  let low: { h: Holding; k: string; w: string; v: number } | null = null;
  for (const h of hs) for (const [k, w] of PARTS) { const v = h.score.parts?.[k]; if (v != null && (!low || v < low.v)) low = { h, k, w, v }; }
  if (!low) return null;
  const parts = PARTS.map(([k, w]) => ({ w, v: low!.h.score.parts?.[k] ?? null })).filter((x) => x.v != null) as { w: string; v: number }[];
  return { id: "part", tone: "info", k: hs.length === 1 ? "Its weakest part" : "The weakest part",
    lead: `${low.w}: ${Math.round(low.v)} of 100`, rest: hs.length === 1 ? ", the lowest of its four parts." : `, ${short(low.h)}'s lowest of four.`,
    rows: parts.map((x) => ({ label: x.w, value: x.v, max: 100, text: String(Math.round(x.v)), neg: x.v < 40 })),
    note: "Each part is read against funds of the same category; a strong risk part means lower risk.", from: "The four Health parts", go: go("See the four parts", "jump", "mfp-funds") };
};
/** What your money buys: shares, debt and money market, gold and other, and what is not loaded, from the fund files; companies inside and the top sector. */
export const whatMoneyBuys: Cand = ({ sp }) => {
  const m = sp?.mix;
  if (!sp || !m || !sp.count) return null;
  if (m.shares + m.debt + m.other <= 0) return null;
  const [shares, debt, other, unknown] = whole([m.shares, m.debt, m.other, m.sharesUnknown].map((x) => x * 100));   // whole numbers that add up to 100
  const secs = new Map<string, number>();
  for (const [k, c] of Object.entries(sp.lookThrough?.macro ?? {})) { const s = k.split("|")[0]; if (s !== "Not classified") secs.set(s, (secs.get(s) ?? 0) + c.w); }
  const top = [...secs].sort((a, b) => b[1] - a[1])[0], n = sp.readings.underneath.stocks;
  return { id: "buys", tone: "good", k: "What your money buys", lead: `${`${shares}%`} in shares`, rest: `${debt >= 0.5 ? `, ${`${debt}%`} in debt and money market` : ""}${other >= 0.5 ? `, ${`${other}%`} in gold and other` : ""}.`,
    stack: [{ label: "Shares", value: shares, color: "#0e6471", text: `${shares}%` }, ...(debt >= 0.5 ? [{ label: "Debt and money market", value: debt, color: "#9aa3ad", text: `${debt}%` }] : []),
      ...(other >= 0.5 ? [{ label: "Gold and other", value: other, color: "#b8892f", text: `${other}%` }] : []), ...(unknown >= 0.5 ? [{ label: "Not loaded", value: unknown, color: "#d6d1c4", text: `${unknown}%` }] : [])],
    note: n ? `${n} ${n === 1 ? "company sits" : "companies sit"} inside ${sp.count === 1 ? "the fund" : "your funds"}${top && sp.knownShares ? `, and ${p0((top[1] / sp.knownShares) * 100)} of ${sp.count === 1 ? "its" : "their"} shares are in ${top[0]}` : ""}.` : undefined,
    from: "Each fund house's latest monthly file", go: go("Open Mix & overlap", "jump", "mfp-own") };
};

// ------------------------------------------------------------------------------------------------ Mix & overlap
const SEC_COLORS = ["#0e6471", "#4b4fc4", "#b5541c", "#2e7d57"];
function grid(sp: MfSpread) {
  const bySec = new Map<string, number>(), bySize = new Map<string, number>();
  for (const [k, c] of Object.entries(sp.lookThrough?.macro ?? {})) { const [m, sz] = k.split("|"); bySec.set(m, (bySec.get(m) ?? 0) + c.w); bySize.set(sz || "Unsized", (bySize.get(sz || "Unsized") ?? 0) + c.w); }
  return { bySec, bySize };
}
/** Largest sector underneath: "{sector}: {pct}% of your list", the top three macro sectors and the rest. */
export const largestSector: Cand = ({ sp }) => {
  if (!sp?.lookThrough) return null;
  const secs = [...grid(sp).bySec].filter(([m]) => m !== "Not classified").sort((a, b) => b[1] - a[1]);
  if (!secs.length) return null;
  const [n1, w1] = secs[0], top3 = secs.slice(0, 3), rest = secs.slice(3).reduce((a, [, w]) => a + w, 0), known = sp.knownShares ?? secs.reduce((a, [, w]) => a + w, 0);
  return { id: "sector", tone: "info", k: "Largest sector underneath", lead: `${n1}: ${p1(w1 * 100)}`, rest: " of your list.",
    stack: [...top3.map(([m, w], i) => ({ label: m, value: w * 100, color: SEC_COLORS[i], text: p1(w * 100) })), ...(rest > 0.0005 ? [{ label: "The rest", value: rest * 100, color: SEC_COLORS[3], text: p1(rest * 100) }] : []),
      ...(known < 0.995 ? [{ label: "Not in shares", value: (1 - known) * 100, color: "#9aa3ad", text: p1((1 - known) * 100) }] : [])],
    from: "NSE's macro sectors, from each fund house's file", go: go("See the sector grid", "jump", "mfp-own") };
};
const SIZE_COLORS: Record<string, string> = { Large: "#0e6471", Mid: "#4b4fc4", Small: "#b5541c", Micro: "#7a5c1f", Unsized: "#9aa3ad" };
const SIZE_WORD: Record<string, string> = { Large: "large", Mid: "mid-sized", Small: "small", Micro: "micro" };
/** Company sizes underneath: "Mostly {size} companies: {pct}% of your list", the four sizes and what is not in shares (the grid's totals). */
export const companySizes: Cand = ({ sp }) => {
  if (!sp?.lookThrough) return null;
  const { bySize } = grid(sp), known = sp.knownShares ?? [...bySize.values()].reduce((a, b) => a + b, 0);
  const sized = (["Large", "Mid", "Small", "Micro"] as const).map((s) => [s, bySize.get(s) ?? 0] as const), top = [...sized].sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] <= 0) return null;
  const notSized = Math.max(0, 1 - known) + (bySize.get("Unsized") ?? 0);
  return { id: "sizes", tone: "good", k: "Company sizes underneath", lead: `Mostly ${SIZE_WORD[top[0]]} companies`, rest: `: ${p1(top[1] * 100)} of your list.`,
    stack: [...sized.filter(([, w]) => w > 0).map(([s, w]) => ({ label: s, value: w * 100, color: SIZE_COLORS[s], text: p1(w * 100) })),
      ...(notSized > 0.0005 ? [{ label: "Not in shares or not sized", value: notSized * 100, color: SIZE_COLORS.Unsized, text: p1(notSized * 100) }] : [])],
    note: "FinLit's four sizes: large above ₹75,000 Cr, mid ₹25,000–75,000 Cr, small ₹10,000–25,000 Cr, micro below ₹10,000 Cr.", from: "Market values on NSE, FinLit's ₹ rule", go: go("See the sizes", "jump", "mfp-sizes") };
};
/** Biggest company underneath: "{sym}: {pct}% of your fund(s)", the top five and their total. */
export const biggestCompany: Cand = ({ sp }) => {
  const xs = (sp?.topStocks ?? []).filter((t) => t.w > 0).slice(0, 5);
  if (!sp || !xs.length) return null;
  const tot = xs.reduce((a, t) => a + t.w, 0), max = xs[0].w, nm = (t: (typeof xs)[number]) => t.symbol ?? t.name;
  return { id: "biggest", tone: "info", k: "Biggest company underneath", lead: `${nm(xs[0])}: ${p1(xs[0].w * 100)}`, rest: ` of your ${sp.count === 1 ? "fund" : "funds"}.`,
    rows: xs.map((t) => ({ label: nm(t), value: t.w, max, text: p1(t.w * 100) })), note: `The ${xs.length === 1 ? "largest holding is" : `${xs.length} largest together are`} ${p1(tot * 100)} of your list.`,
    from: "Each fund house's latest monthly file", go: go("See the biggest stocks", "jump", "mfp-biggest") };
};

// ------------------------------------------------------------------------------------------------ Risk
/** How it moves with its market: the beta against its own benchmark(s), beside the Nifty 500's (weekly, past year: number fix 4), with a line at 1. */
export const movesWithMarket: Cand = ({ rk, hs }) => {
  const o = rk?.own?.list;
  if (o?.betaOwn == null) return null;
  const b = o.betaOwn, n5 = o.beta500, max = Math.max(1.5, b, n5 ?? 0), one = (rk?.funds ?? []).filter((f) => f.compared);
  return { id: "beta", tone: "good", k: hs.length === 1 ? "How it moves with its market" : "How the list moves with its markets",
    lead: `Beta ${b.toFixed(2)}`, rest: `: it has moved about ${Math.round(b * 10)}% when ${hs.length === 1 ? "its benchmark" : "its benchmarks"} moved 10%.`,
    rows: [{ label: hs.length === 1 ? "Own benchmark" : "Own benchmarks", value: b, max, text: b.toFixed(2) }, ...(n5 != null ? [{ label: "Nifty 500", value: Math.max(0, n5), max, text: n5.toFixed(2) }] : [])], line: 1,
    note: one.length === 1 && one[0].benchmark ? `Against its own benchmark, the ${one[0].benchmark}, it reads ${one[0].band?.word ?? ""}${n5 != null ? `; against the Nifty 500 alone it reads ${n5.toFixed(2)}` : ""}.` : undefined,
    from: "Weekly NAVs, past year · Nifty 500: weekly, past year", go: go("See how the beta is built", "jump", "mfp-build") };
};
/** How much it swings: the typical year's swing beside the Nifty 500's, over the same window (number fix 5). */
export const howMuchItSwings: Cand = ({ rk, hs }) => {
  const l = rk?.list, b = rk?.bench;
  if (l?.swing == null || b?.swing == null) return null;
  const max = Math.max(l.swing, b.swing), r = l.swing / b.swing;
  return { id: "swing", tone: "info", k: "How much it swings", lead: `${p1(l.swing)} in a typical year`, rest: `, against ${p1(b.swing)} for the Nifty 500.`,
    rows: [{ label: hs.length === 1 ? "Your fund" : "Your list", value: l.swing, max, text: p1(l.swing), neg: l.swing > b.swing }, { label: "Nifty 500", value: b.swing, max, text: p1(b.swing), muted: true }],
    note: `${r < 0.85 ? "A calmer ride than" : r > 1.15 ? "A bumpier ride than" : "About as bumpy as"} the index, over 3 years of daily NAVs.`, from: "3 yrs, daily", go: go("See each fund's risk", "jump", "mfp-each") };
};
/** Its worst fall: the deepest drop from a high, beside the Nifty 500's, and the 10 worst weeks of the past year. */
export const worstFall: Cand = ({ rk, hs }) => {
  const l = rk?.list, b = rk?.bench;
  if (l?.worstFall == null || b?.worstFall == null) return null;
  const max = Math.max(Math.abs(l.worstFall), Math.abs(b.worstFall)), w10 = rk?.own?.list.worst10;
  return { id: "fall", tone: l.worstFall < b.worstFall ? "warn" : "good", k: "Its worst fall", lead: `${signed(l.worstFall)} from a high`,
    rest: `, ${l.worstFall < b.worstFall ? "deeper" : "shallower"} than the Nifty 500's ${signed(b.worstFall)}.`,
    rows: [{ label: hs.length === 1 ? "Your fund" : "Your list", value: Math.abs(l.worstFall), max, text: signed(l.worstFall), neg: true }, { label: "Nifty 500", value: Math.abs(b.worstFall), max, text: signed(b.worstFall), muted: true }],
    note: `Over 3 years.${w10?.list != null && w10.nifty500 != null ? ` In the 10 worst weeks of the past year it fell ${w10.list > w10.nifty500 ? "less" : "more"} than the index: ${signed(w10.list)} against ${signed(w10.nifty500)}.` : ""}`,
    from: "3 yrs, daily", go: go("See “If the Nifty 500 fell 10%”", "jump", "mfp-fall") };
};

/** Each view's ordered list (the pack's Key figures table). */
export const MF_KF = {
  funds: [howHealthy, weakestPart, whatMoneyBuys],
  mix: [largestSector, companySizes, biggestCompany],
  risk: [movesWithMarket, howMuchItSwings, worstFall],
};
export const mfKeyFigures = (view: keyof typeof MF_KF, c: MfKfCtx): KfCard[] => pickCards(MF_KF[view], c);

// ------------------------------------------------------------------------------------------------ What changed (change 19)
export type MfInsideCo = { symbol: string; name: string; w: number; funds: string[] };
/** The companies that make up `min`% or more of the list through its funds (the look-through grid's stocks, added up), largest first, each with the funds
 *  that hold it ("7.2% of your funds · ICICI Prudential FMCG"). The server's "mf" alert list uses the same 0.3% rule. Exported for tests. */
export function mfInsideCompanies(sp: MfSpread | undefined, min = 0.3): MfInsideCo[] {
  if (!sp?.lookThrough) return [];
  const nm = new Map((sp.funds ?? []).map((f) => [f.code, (fundName(f.name) || f.name).replace(/ Fund$/, "")]));
  const held = new Map((sp.topStocks ?? []).filter((t) => t.symbol).map((t) => [t.symbol as string, t.funds]));
  // a company outside the top list: with one fund, or one fund that holds shares, it is that fund's
  const eq = (sp.funds ?? []).filter((f) => (f.assetSplit?.equity ?? 0) > 0), one = sp.count === 1 && sp.funds?.length ? [sp.funds[0].code] : eq.length === 1 ? [eq[0].code] : [];
  const m = new Map<string, MfInsideCo>();
  for (const c of Object.values(sp.lookThrough.macro ?? {})) for (const st of c.stocks) {
    if (!st.symbol) continue;
    const x = m.get(st.symbol) ?? { symbol: st.symbol, name: st.name, w: 0, funds: [] };
    x.w += st.w * 100;
    x.funds = [...new Set([...x.funds, ...((held.get(st.symbol) ?? one).map((code) => nm.get(code)).filter(Boolean) as string[])])];
    m.set(st.symbol, x);
  }
  return [...m.values()].filter((x) => x.w >= min - 1e-9).sort((a, b) => b.w - a.w);
}
export const mfInsideLine = (c: MfInsideCo) => `${c.w < 1 ? c.w.toFixed(2) : c.w.toFixed(1)}% of your funds${c.funds.length ? ` · ${c.funds.join(", ")}` : ""}`;
