// The MF portfolio's words, as the final pages pack writes them (board 15, docs/design/finlit-final-pages/15-mf-portfolio.jpg).
// Figures come from the server (/api/me/mf-portfolio, /diversification, /risk) and from each stock's peer reading; this file only puts them into
// sentences. The risk level, its reason and the overlap word are the server's. Describes; never advice. Information only, not investment advice.
import type { Card } from "./pulsePack";
import type { Holding, MfSpread } from "./mfPortfolio";

const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const num = (n: number) => (n < NUM.length ? NUM[n] : String(n));
const Num = (n: number) => { const w = num(n); return w.charAt(0).toUpperCase() + w.slice(1); };
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const p1 = (x: number) => `${x.toFixed(1)}%`;

export type BetaBand = { key: "less" | "defensive" | "similar" | "more" | "high" | "very_high"; word: string } | null;
/** Task #183: each fund against its own category's benchmark, past year of weekly closes (server: mfportfolio/bench.py). */
export type FundOwn = {
  benchmark?: string; standIn?: boolean; benchWhy?: string | null; compared?: boolean; benchKind?: "index" | "blend" | "none"; betaOwn?: number | null; explained?: number | null;
  band?: BetaBand; downPer100?: number | null; upPer100?: number | null; oneYear?: number | null; benchOneYear?: number | null; beta500?: number | null; weeks?: number;
  riskShare?: number | null; saysLittle?: boolean; type?: string; listShare?: number;
};
export type FundRisk = { code: number; name: string; short: string; category: string; swing: number | null; worstFall: number | null; beta: number | null; fallsTaken: number | null; from: string | null; to: string | null; years: number | null; why: string | null } & FundOwn;
export type MfOwnList = {
  betaOwn: number | null; betaOwnBand: BetaBand; betaExLiquid: number | null; betaExLiquidBand: BetaBand; beta500: number | null; beta500Band: BetaBand; liquidShare: number | null;
  worst10: { list: number | null; nifty500: number | null }; fall10: { own: number | null; nifty500: number | null };
};
export type MfRisk = {
  count: number; why?: string; basis: "value" | "equal"; funds: FundRisk[];
  bench: { name: string; swing: number | null; worstFall: number | null; from: string; to: string };
  list: { swing: number | null; worstFall: number | null; level: { word: string; vs: string; because: string | null; riskier: string[] } | null; why?: string | null };
  own?: { from: string; to: string; list: MfOwnList } | null;
};
export type PeerTag = { label: "leader" | "in_line" | "laggard"; raw: string | null; rank: number; of: number; group: string } | null;
export type Under = { name: string; symbol: string | null; industry: string | null; size: string | null; w: number; funds: number[]; peer: PeerTag; notCompared: string | null };

const ACRONYMS = new Set(["SBI", "HDFC", "ICICI", "UTI", "DSP", "PPFAS", "IDFC", "LIC", "HSBC", "ITI", "JM", "PGIM", "WOC", "NJ", "IDBI", "BOI", "ELSS", "ETF", "PSU", "IT", "ESG", "MNC", "US"]);
/** The same short name the server writes (mfportfolio.risk.short_name): "HDFC Flexi Cap Fund - Growth Option - Direct Plan" -> "HDFC Flexi Cap",
 *  "ICICI Prudential Large Cap Fund (erstwhile Bluechip Fund)" -> "ICICI Prudential Large Cap", "SBI SMALL CAP FUND" -> "SBI Small Cap". */
export function shortFund(n: string | null | undefined): string {
  let s = (n || "").split(" - ")[0].replace(/\s*\([^)]*\)/g, "").trim().replace(/\s+(fund|scheme)$/i, "").trim();
  if (s && s === s.toUpperCase() && /[A-Z]/.test(s)) s = s.split(/\s+/).map((w) => (ACRONYMS.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase())).join(" ");
  return s;
}
/** The fund's tag in "Held by": the fund house's first word and the category's initials ("HDFC FC", "ICICI LC"); the full name is in its title. */
export function fundTag(name: string | null, amc: string | null, category: string | null): string {
  const house = (amc || name || "").replace(/\s+mutual\s+fund$/i, "").split(/\s+/)[0] || "Fund";
  const ini = (category || "").replace(/\bfunds?\b/gi, "").split(/[\s&-]+/).filter(Boolean).map((w) => w[0].toUpperCase()).join("");
  return ini ? `${house} ${ini}` : house;
}

// ------------------------------------------------------------------------------------------------ Your funds: three cards
export function fundCards(rk: MfRisk | undefined, hs: Holding[], locked: boolean, sp: MfSpread | undefined): Card[] {
  const out: Card[] = [];
  const fs = (rk?.funds ?? []).filter((f) => f.fallsTaken != null);
  const steady = [...fs].sort((a, b) => (a.fallsTaken as number) - (b.fallsTaken as number))[0];
  if (steady && fs.length > 1) {
    const h = hs.find((x) => x.code === steady.code), s = !locked && h?.score.final != null ? `, with a ${(h.score.label || "").toLowerCase()} score of ${Math.round(h.score.final)}` : "";
    out.push({ kind: "good", title: `${steady.short} is the steadiest`, text: (steady.fallsTaken as number) < 100 ? `It took only ${steady.fallsTaken}% of the market's falls${s}.` : `It took ${steady.fallsTaken}% of the market's falls, the least of your funds${s}.` });
  }
  const lv = rk?.list.level;
  if (lv && lv.riskier.length) {
    const who = (rk?.funds ?? []).filter((f) => lv.riskier.includes(f.short)).sort((a, b) => (b.swing ?? 0) - (a.swing ?? 0));
    const most = who.slice(0, 2), worst = Math.max(...most.map((f) => -(f.worstFall ?? 0)));
    const cat = lv.because?.match(/^because of the (\w+) (.+) funds$/), many = lv.because?.match(/^because (\w+) of your (\w+) funds swing more/), each = /^because each of your funds/.test(lv.because || "");
    const title = cat ? `The ${cat[1]} ${cat[2]} funds carry the risk` : each ? "Each of your funds swings more than the Nifty 500" : many ? `${many[1].charAt(0).toUpperCase() + many[1].slice(1)} of your ${many[2]} funds swing more than the Nifty 500`
      : `${list(who.map((f) => f.short))} ${who.length === 1 ? "carries" : "carry"} the risk`;
    out.push({ kind: "watch", title, text: `${list(most.map((f) => f.short))} ${most.length === 1 ? "swings" : "swing"} the most and fell up to ${Math.round(worst)}% in ${most.length === 1 ? "its" : "their"} worst stretch.` });
  }
  const top = sp?.readings.overlap.top, word = sp?.readings.overlap.word, nm = new Map((sp?.funds ?? []).map((f) => [f.code, shortFund(f.name)]));
  if (top && word) {
    const pair = `${nm.get(top.a)} and ${nm.get(top.b)}`;
    out.push(word === "High" ? { kind: "insight", title: "Two funds look alike", text: `${pair} share ${Math.round(top.pct)}% of their money in the same stocks. See Mix & overlap.` }
      : word === "Moderate" ? { kind: "insight", title: "Two funds partly overlap", text: `${pair} share ${Math.round(top.pct)}% of their money in the same stocks. See Mix & overlap.` }
        : { kind: "good", title: "Your funds overlap little", text: `No two of your funds keep more than ${Math.round(top.pct)}% of their money in the same stocks.` });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ Largest stocks underneath: two cards
export function underCards(under: Under[]): Card[] {
  if (!under.length) return [];
  const lead = under.filter((u) => u.peer?.label === "leader"), lag = under.filter((u) => u.peer?.label === "laggard");
  const n = under.length, out: Card[] = [];
  const largest = under.slice(0, 2).every((u) => u.peer?.label === "laggard") ? ", your two largest" : under[0].peer?.label === "laggard" ? ", your largest" : "";
  const names = (xs: Under[]) => xs.slice(0, 2).map((u) => u.name);
  if (!lead.length && lag.length) out.push({ kind: "watch", title: `None of the ${n} biggest stocks leads its peers`, text: `${Num(lag.length)} lag them, including ${list(names(lag))}${largest}. Together the ${num(lag.length)} laggards are ${p1(lag.reduce((a, u) => a + u.w * 100, 0))} of your fund money.` });
  else if (lead.length) out.push({ kind: "good", title: `${Num(lead.length)} of the ${n} biggest ${lead.length === 1 ? "stock leads its" : "stocks lead their"} peers`, text: `${list(names(lead))}${lead.length > 2 ? ` and ${num(lead.length - 2)} more` : ""}${lead.length === 1 ? " is" : " are"} among the strongest of similar companies over the last 12 months${lag.length ? `; ${num(lag.length)} lag theirs (${p1(lag.reduce((a, u) => a + u.w * 100, 0))} of your fund money)` : ""}.` });
  out.push({ kind: "insight", title: "Why it is still shown", text: "A fund manager picks stocks for reasons of their own, often for the long run. The tag describes a stock you own underneath, not the fund it sits in." });
  return out;
}
/** The fund's short name as the page writes it: "Quant Small Cap Fund", "ICICI Prudential MNC Fund". */
export const fundName = (n: string | null) => { const s = shortFund(n); return s ? (/\b(fund|scheme)$/i.test((n || "").split(" - ")[0].replace(/\s*\([^)]*\)/g, "").trim()) ? `${s} Fund` : s) : ""; };
