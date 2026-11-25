// Task #391 PR A (developer file 35, All my investments, 24 Nov updated 25 Nov): the pure rules of the new top and the All together view, kept apart so
// each is tested on its own (myinvest/mi391a.test.tsx).
//   MI_STEPS / miStepFromParam / miStepParam   the seven stops of All together (Key figures inside stop 1); &step= in the address ("all" = All sections,
//                                              none = the first stop); the member's last stop, kept per member in this browser (the address wins).
//   viewCard                                   the four calm cards' words ("Prism 67 · moves 1.40×", "Mutual Fund Score 56 · Average").
//   riskWord / riskSays                        the six risk ranges in the shared words (Much less sensitive … Very high), from the server's key when it
//                                              sends one (PR B), else from its older words.
//   coLabel                                    a company's short name first (Bank Of Konkan → Bank of Konkan; Sahyadri Peripherals Ltd → Sahyadri
//                                              Peripherals, made-up names), its code under it.
//   miSince / asOfParts / sectorsCaption / swingWindows   the Since your last visit line, the Data as of line, fault 6 and fault 12.
// Describes; never advises. No thresholds or day counts are written into page text from here except the filings window the feed itself sends.
import { holdingShort } from "./holdingName";
import { BETA_RANGE_WORD } from "../portfolio/shared/words";
import { countOf } from "../portfolio/shared/words";
import { KIND_LOWER, SCORE_NAME, joinWords, kindsHeld, pctOf, rupees, type AllInvestments, type Kind, type KindRisk, type NamedHolding, type Tab } from "./myInvest";
import { namesUpTo } from "../portfolio/shared/words";
import { nf } from "./format";

// ------------------------------------------------------------------------------------------------ the seven stops
export type MiStep = { id: string; n: number; label: string; secs: string[] };
/** 1 Your money (with Key figures) · 2 Made of · 3 Sectors and sizes · 4 Every company · 5 What changed · 6 Health · 7 Risk (Update 25 Nov, row 1). */
export const MI_STEPS: MiStep[] = [
  { id: "mi-money", n: 1, label: "Your money", secs: ["mi-money", "mi-kf"] },
  { id: "mi-made", n: 2, label: "Made of", secs: ["mi-made"] },
  { id: "mi-sectors", n: 3, label: "Sectors and sizes", secs: ["mi-sectors"] },
  { id: "mi-every", n: 4, label: "Every company", secs: ["mi-every", "mi-every-t"] },
  { id: "what-changed", n: 5, label: "What changed", secs: ["what-changed"] },
  { id: "mi-health", n: 6, label: "Health", secs: ["mi-health"] },
  { id: "mi-risk", n: 7, label: "Risk", secs: ["mi-risk", "mi-fall"] },
];
const PARAM: Record<string, string> = { "mi-money": "money", "mi-made": "made", "mi-sectors": "sectors", "mi-every": "every", "what-changed": "changed", "mi-health": "health", "mi-risk": "risk" };
/** The stop that holds a section ("mi-kf" → stop 1). */
export const miStepOf = (id: string): string | null => MI_STEPS.find((s) => s.id === id || s.secs.includes(id))?.id ?? null;
/** The address word of a stop: "money" … "risk"; "all" for All sections. */
export const miStepParam = (id: string) => (id === "all" ? "all" : PARAM[id] ?? id);
/** The stop an address word opens: none or an unknown word opens the first stop; "all" puts every section back; "kf" opens stop 1. */
export function miStepFromParam(p: string | null | undefined): string {
  const w = (p ?? "").trim().toLowerCase();
  if (w === "all") return "all";
  if (w === "kf" || w === "key-figures") return MI_STEPS[0].id;
  const hit = Object.entries(PARAM).find(([, v]) => v === w)?.[0] ?? (w ? miStepOf(w) : null);
  return hit ?? MI_STEPS[0].id;
}
/** Task #391 (with PR B): the Equity, Mutual funds and ETFs views' steps in the address: "list", "spread", "inside", "risk", "also"; "all"; none or an
 *  unknown word opens the first step; "kf" opens step 1 (which holds Key figures). */
export const kindStepParam = (id: string) => (id === "all" ? "all" : id.replace(/^mi-(eq|mf|etf)-/, ""));
export function kindStepFromParam(steps: { id: string; secs: string[] }[], p: string | null | undefined): string {
  const w = (p ?? "").trim().toLowerCase();
  if (w === "all") return "all";
  return steps.find((s) => kindStepParam(s.id) === w || s.secs.includes(w))?.id ?? steps[0]?.id ?? "all";
}
/** The step of a list that holds a section, or null. */
export const stepIn = (steps: { id: string; secs: string[] }[], id: string) => steps.find((s) => s.id === id || s.secs.includes(id))?.id ?? null;
const STEP_KEY = (who: string | number | null | undefined) => `finlit-my-investments-step:${who || "guest"}`;
/** The member's last stop on All together in this browser (null when none or unreadable). */
export function readMiStep(who: string | number | null | undefined): string | null {
  try { const v = localStorage.getItem(STEP_KEY(who)); return v && (v === "all" || MI_STEPS.some((s) => s.id === v)) ? v : null; } catch { return null; }
}
export const saveMiStep = (who: string | number | null | undefined, step: string) => { try { localStorage.setItem(STEP_KEY(who), step); } catch { /* private window: the address still holds it */ } };

// ------------------------------------------------------------------------------------------------ words
/** "moves 1.40×" (no "Beta"); null without a figure. */
export const movesX = (b: number | null | undefined) => (b == null ? null : `moves ${b.toFixed(2)}×`);
/** "it moves 0.91× as much as the Nifty 500". */
export const movesAsMuchNifty = (b: number) => `moves ${b.toFixed(2)}× as much as the Nifty 500`;

/** The risk range word. The server's key (PR B sends `bandKey`) wins; until then its older words are renamed in one place: "Less sensitive" (below 0.65)
 *  reads "Much less sensitive" and "Defensive" (0.65 to 0.90) reads "Less sensitive". With the beta at hand the two lowest ranges are told apart by it,
 *  so the newer words read right too. The thresholds are for building only and never reach the page. */
export function riskWord(word: string | null | undefined, beta?: number | null, key?: string | null): string | null {
  if (key && BETA_RANGE_WORD[key]) return BETA_RANGE_WORD[key];
  if (!word) return null;
  const w = word.trim();
  if (/^(less sensitive|defensive|much less sensitive)$/i.test(w)) {
    if (beta != null) return beta < 0.65 ? BETA_RANGE_WORD.less : BETA_RANGE_WORD.defensive;
    return /^defensive$/i.test(w) ? BETA_RANGE_WORD.defensive : /^much/i.test(w) ? BETA_RANGE_WORD.less : BETA_RANGE_WORD.less;
  }
  return w;
}
/** The server's sentence for a range ("Defensive: moves a little less than the market. When …") with the range word renamed. */
export function riskSays(line: string | null | undefined, word: string | null | undefined, beta?: number | null, key?: string | null): string | null {
  if (!line) return null;
  const nw = riskWord(word, beta, key);
  if (!word || !nw || !line.startsWith(word)) return line;
  return nw + line.slice(word.length);
}

/** A company's short name for tables, cards and sentences: the name first, cleaned (holdingShort), else its code. */
export const coLabel = (c: { symbol?: string | null; name?: string | null }) => holdingShort(c.name && c.name !== c.symbol ? c.name : null, c.symbol ?? "") || c.name || c.symbol || "";

// ------------------------------------------------------------------------------------------------ the four calm cards
export type ViewCard = { id: Tab; k: string; v: string; x: string };
const VIEW_K: Record<Tab, string> = { all: "All together", equity: "Equity", mf: "Mutual funds", etf: "ETFs" };
const TAB_KIND: Record<Exclude<Tab, "all">, Kind> = { equity: "shares", mf: "funds", etf: "etfs" };
/** One card: its name, one figure and the line under it (the phone shows the name and the figure only). */
export function viewCard(t: Tab, d: AllInvestments): ViewCard {
  const k = VIEW_K[t];
  if (t === "all") {
    const kinds = kindsHeld(d), n = kinds.reduce((a, x) => a + d.counts[x], 0), frac = kinds.length === 3 ? "⅓" : kinds.length === 2 ? "½" : "";
    // with PR B (fault 1) only a kind with no quantity at all takes the equal part: "…; ETFs ⅓ until you add quantities"
    const eq = equalKinds(d), tail = !frac || !eq.length ? "" : eq.length === kinds.length ? `, ${frac} each until you add quantities` : `; ${joinWords(eq.map((x) => KIND_LOWER[x]))} ${frac} until you add quantities`;
    return { id: t, k, v: d.byValue && d.total != null ? rupees(d.total) : countOf(n, "holding"),
      x: `${countOf(d.counts.shares, "share")} · ${countOf(d.counts.funds, "fund")} · ${countOf(d.counts.etfs, "ETF")}${tail}` };
  }
  const c = d.cards[TAB_KIND[t]], mv = movesX(c.beta);
  if (!c.count) return { id: t, k, v: "None yet", x: `Nothing on your ${t === "equity" ? "Equity" : t === "mf" ? "MF" : "ETF"} portfolio yet.` };
  const join = (a: string, b: string | null) => (b ? `${a} · ${b}` : a);
  if (t === "equity") {
    const model = SCORE_NAME.replace(/^FinLit /, ""), bands = (c.bands ?? []).filter((b) => b.count > 0);
    return { id: t, k, v: join(c.scoreLocked ? `${SCORE_NAME} · see plans` : c.score != null ? `${model} ${nf(c.score, 0)}` : `${model}: not rated`, mv),
      x: `${countOf(c.count, "share")}${bands.length ? " · " + bands.map((b) => `${b.count} ${b.label.toLowerCase()}`).join(" · ") : ""}` };
  }
  if (t === "mf") {
    const one = c.count === 1, word = one ? d.funds[0]?.label : c.scoreWord;
    return { id: t, k, v: c.scoreLocked ? "Mutual Fund Score on Gold" : c.score != null ? `Mutual Fund Score ${nf(c.score, 0)}${word ? ` · ${word}` : ""}` : "No Mutual Fund Score yet",
      x: `${countOf(c.count, "fund")}${mv ? ` · ${mv} the Nifty 500` : ""}` };
  }
  const types = c.types ?? [];
  return { id: t, k, v: join(c.ter != null ? `${pctOf(c.ter, 2)} a year` : "Cost not published", mv),
    x: `${countOf(c.count, "ETF")}${types.length ? ": " + types.map((x) => x.label.toLowerCase()).join(", ") : ""}` };
}

/** The kinds that count as an equal part (no quantity at all): the server's `missing` while it is not by value, the kinds held otherwise none. */
export const equalKinds = (d: AllInvestments): Kind[] => (d.byValue ? [] : kindsHeld(d).filter((k) => !d.missing || d.missing.includes(k)));

/** Task #391 (Top 8, fault 4; fault 1 with PR B): the money note after "Money figures cover N of M holdings.": who is left out of the money, who is left
 *  out of the split (PR B's `noQuantity`, named, up to three), and the equal-part sentence only while a kind has no quantity at all. */
export function moneyNote(d: AllInvestments, have: number, n: number): string[] {
  const out: string[] = [], nq = d.noQuantity ?? [], eq = equalKinds(d), kinds = kindsHeld(d).length;
  const frac = kinds === 3 ? "⅓" : kinds === 2 ? "½" : "";
  const rest = n - have - nq.length;
  if (rest > 0) out.push(`${have === 0 && !nq.length ? "All" : "The other"} ${rest} count in every reading but not in the money.`);
  if (nq.length) out.push(`${cap(namesUpTo(nq.map(nhName)))} ${nq.length === 1 ? "has" : "have"} no quantity yet, so ${nq.length === 1 ? "it is" : "they are"} listed but not counted in the split.`);
  if (eq.length && frac) out.push(eq.length === kinds ? `For now each kind counts as ${frac}.` : `For now your ${joinWords(eq.map((k) => KIND_LOWER[k]))} count as ${frac}.`);
  return out;
}
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/** A named holding in a sentence: a share by its short name, an ETF by its code, a fund by its name. */
export const nhName = (x: NamedHolding) => (x.kind === "etfs" ? x.symbol || x.name || "" : x.symbol ? coLabel({ symbol: x.symbol, name: x.name }) : x.name || String(x.code ?? ""));

// ------------------------------------------------------------------------------------------------ the lines under the cards and under the bar
/** "Since your last visit on 23 Nov: 1 new filing at companies you own." / "…: nothing new at the companies you own." */
export function miSince(visit: string | null, fresh: number): { lead: string; rest: string } {
  if (!visit) return { lead: "Since your last visit:", rest: "what is new at the companies you own shows from your next visit." };
  return { lead: `Since your last visit on ${visit}:`, rest: fresh ? `${countOf(fresh, "new filing")} at companies you own.` : "nothing new at the companies you own." };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "23 Nov" (with the year when `year`). */
export const dayMon = (iso: string | null | undefined, year = false) => { if (!iso) return ""; const [y, m, dd] = iso.slice(0, 10).split("-"); return `${+dd} ${MON[+m - 1]}${year ? ` ${y}` : ""}`; };
/** Data as of: Prices close of 23 Nov · Fund and ETF holdings each file of 31 Oct 2026 · Filings the last 90 days · Risk weekly prices, past year. */
export function asOfParts(d: AllInvestments, filingDays: number | null): [string, string][] {
  const out: [string, string][] = [];
  if (d.sources.pricesTo) out.push(["Prices", `close of ${dayMon(d.sources.pricesTo)}`]);
  const f = d.sources.filesFrom, t = d.sources.filesTo;
  if ((d.counts.funds || d.counts.etfs) && t) out.push([d.counts.funds && d.counts.etfs ? "Fund and ETF holdings" : d.counts.funds ? "Fund holdings" : "ETF holdings",
    f && f !== t ? `files of ${dayMon(f, true)} to ${dayMon(t, true)}` : `each file of ${dayMon(t, true)}`]);
  out.push(["Filings", `the last ${filingDays ?? 90} days`]);
  const w = (["shares", "funds", "etfs"] as Kind[]).map((k) => d.risk.kinds[k]?.betaWindow).find((x) => x);
  out.push(["Risk", w ? `${w.grain} prices, ${w.window}` : "weekly prices, past year"]);
  return out;
}

/** Fault 6: "Macro sectors · 12" sat over "Show all 13" (the 13th is Listed abroad). The caption counts the named sectors and says the rest. */
export function sectorsCaption(named: number, total: number): string {
  if (total > named) return `${named} macro ${named === 1 ? "sector" : "sectors"} and shares listed abroad`;
  return `Macro sectors · ${named}`;
}

/** Fault 12: each kind's swing and worst-fall window, said once in the column header. PR B sends `swingWindow` ("weekly, 2 years"); until then it is the
 *  kind's own grain (shares weekly, funds and ETFs daily) and its years. "Shares weekly, 2 years · funds and ETFs daily, 3 years". */
export function swingWindows(kinds: Kind[], risk: Partial<Record<Kind, KindRisk>>, line?: string | null): string {
  if (line) return line;   // PR B: "Shares: weekly prices, 2 years. Mutual funds and ETFs: daily NAVs and prices, 3 years."
  const name: Record<Kind, string> = { shares: "shares", funds: "funds", etfs: "ETFs" };
  const by = new Map<string, Kind[]>();
  for (const k of kinds) {
    const x = risk[k]; if (!x || x.swing == null) continue;
    const w = (typeof x.swingWindow === "string" ? x.swingWindow : x.swingWindow?.label) ?? (x.years ? `${k === "shares" ? "weekly" : "daily"}, ${nf(x.years, 0)} ${Math.round(x.years) === 1 ? "year" : "years"}` : null);
    if (w) by.set(w, [...(by.get(w) ?? []), k]);
  }
  const parts = [...by.entries()].map(([w, ks]) => `${ks.map((k) => name[k]).join(ks.length === 2 ? " and " : ", ")} ${w}`);
  const s = parts.join(" · ");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}
