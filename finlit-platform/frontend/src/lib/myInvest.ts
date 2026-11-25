// All my investments (task #137, 15 Nov 2026 pack): the member's shares, mutual funds and ETFs read together, from POST /api/me/all-investments
// (finlit/myinvest). The shares come from the Equity portfolio list in this browser and the account (sent as symbol and quantity only); the funds and ETFs
// are read by the server from the member's MF portfolio and ETF portfolio. Every figure, weight, band and cut-off is worked out on the server; this file
// only types the answer and writes numbers as words. Describes; never advises.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiSend, type ApiError } from "./api";
import { MINUS, nf } from "./format";
import { DEFAULT_PF, type Holding } from "./portfolio";
import { aggOf } from "./ledger";

export type Kind = "shares" | "funds" | "etfs";
export const KINDS: Kind[] = ["shares", "funds", "etfs"];
export const KIND_NAME: Record<Kind, string> = { shares: "Shares", funds: "Mutual funds", etfs: "ETFs" };
export const KIND_LOWER: Record<Kind, string> = { shares: "shares", funds: "mutual funds", etfs: "ETFs" };
export const KIND_TAB: Record<Kind, Tab> = { shares: "equity", funds: "mf", etfs: "etf" };
export const KIND_PAGE: Record<Kind, { to: string; name: string }> = {
  shares: { to: "/holdings", name: "Equity portfolio" }, funds: { to: "/mf-portfolio", name: "MF portfolio" }, etfs: { to: "/etf-portfolio", name: "ETF portfolio" } };
export const KIND_MARK: Record<Kind, "D" | "F" | "E"> = { shares: "D", funds: "F", etfs: "E" };
export type Tab = "all" | "equity" | "mf" | "etf";

export type Band = { label: string; count: number; share: number };
export type Bands = { bands: Band[]; notRated: { count: number; share: number }; topTwoShare: number };
export type First = { name: string; symbol?: string | null; code?: number | null; w: number | null };
export type Card = {
  count: number; valued: boolean; value: number | null; share: number; chg1y: number | null; beta: number | null; betaBand: string | null; first: First[]; firstIs: "largest" | "list";
  score?: number | null; scoreModel?: "prism"; scoreLocked?: boolean; scoreWord?: string | null; bands?: Band[] | null; peers?: Record<string, number>;
  overlap?: { pct: number; a: string; b: string; n: number } | null; sharedCompanies?: number; ter?: number | null; repeats?: { key: string; label: string | null; symbols: string[] }[];
  types?: { label: string; count: number }[];
  /** task #391 PR B (optional): how many of the kind count in the money split, of how many; the ones with no quantity; the range key */
  counted?: number; of?: number; noQuantity?: NamedHolding[]; betaBandKey?: string | null;
};
/** Task #391 PR B: a holding named for a list (a share or an ETF by symbol, a fund by code). */
export type NamedHolding = { kind?: Kind; symbol?: string | null; code?: number | null; name: string | null };
/** Task #391 PR B: a kind's swing window ("weekly prices, 2 years"). */
export type SwingWindow = { grain: string; years: number; label: string };
export type MixRow = { key: "indian" | "abroad" | "gold" | "debt" | "other" | "notLoaded"; label: string; shares: number; funds: number; etfs: number; all: number };
export type MadeOf = { rows: MixRow[]; each: { kind: Kind; name: string; how: "file" | "type" | "none"; asOf: string | null; mix: Partial<Record<MixRow["key"], number>> }[];
  notLoaded: { kind: Kind; name: string }[]; byType: { kind: Kind; name: string }[]; outsideIndianShares: number };
export type SplitRow = { direct: number; funds: number; etfs: number; all: number };
export type Sector = SplitRow & { sector: string; named: boolean };
export type Size = SplitRow & { size: string };
export type Company = SplitRow & { symbol: string | null; name: string; abroad: boolean; macro: string; size: string | null; held: ("D" | "F" | "E")[]; via: string[]; score: number | null; label: string | null; peer: string };
/** Task #277 (fix 4): the window a beta was worked out over ("vs Nifty 500 · weekly · past year"), printed under every beta on the page. */
export type BetaWindow = { index: string; grain: string; window: string; weeks?: number; from?: string; to?: string; counted?: number; of?: number; short?: string[] };
/** "vs Nifty 500 · weekly · past year"; when some holdings were left out (under most of a year of weekly prices, QA of 21 Nov), "· 69 of 71 (UTLSOLAR and TIMEX: under a year of prices)". */
export const betaWindowTxt = (w: BetaWindow | null | undefined) => {
  if (!w) return "vs Nifty 500 · weekly · past year";
  const base = `vs ${w.index} · ${w.grain} · ${w.window}`;
  if (w.counted == null || w.of == null || w.counted === w.of) return base;
  const left = (w.short ?? []).filter(Boolean);
  return `${base} · ${w.counted} of ${w.of}${left.length ? ` (${left.length <= 3 ? joinWords(left) : `${left.slice(0, 2).join(", ")} and ${left.length - 2} more`}: under a year of prices)` : ""}`;
};
export type KindRisk = { beta: number | null; betaWindow?: BetaWindow | null; /** task #391 PR B (fault 12): the swing window and the range key */ swingWindow?: SwingWindow | string | null; bandKey?: string | null; swing: number | null; worstFall: number | null; years: number | null; why: string | null; cover?: number; benchSwing?: number | null; benchWorstFall?: number | null };
export type RiskPart = { kind: Kind; money: number | null; beta: number | null; band?: string | null; /** task #391 PR B: the range key (words.ts BETA_RANGE_WORD) */ bandKey?: string | null; riskShare: number | null; red: boolean };
export type Risk = { beta: number | null; band?: string | null; /** task #391 PR B: the range key, the sentence in the page's words, the windows said once */ bandKey?: string | null; bandSays?: string | null;
  swingWindows?: { differ: boolean; line: string | null } | null; /** task #277 (fix 6): the band word and its sentence, from one band */ bandLine?: string | null; why: string | null; parts: RiskPart[]; largest?: Kind; fall10?: { pct: number | null; value: number | null };
  kinds: Partial<Record<Kind, KindRisk>>; bench: { name: string; swing: number | null; worstFall: number | null; from: string; to: string } | null };
export type ShareRow = { symbol: string; name: string; qty: number | null; price: number | null; priceDate: string | null; chg1d: number | null; chg1y: number | null; beta: number | null;
  score: number | null; label: string | null; macro: string; size: string | null; peer: string; value: number | null; of: number;
  alsoIn: { funds: number; etfs: number; all: number; via: string[] } | null };
export type FundRow = { /** task #235: what the units still held cost */ invested?: number | null;
  /** task #391 PR B (fault 2): what the lots with a buy amount cost, their units and value now, and how many lots of how many have one */
  investedPriced?: number | null; unitsPriced?: number | null; valuePriced?: number | null; lotsPriced?: number; lots?: number; code: number; name: string; short: string; type: string | null; units: number | null; nav: number | null; navDate: string | null; ter: number | null; asOf: string | null;
  score: number | null; label: string | null; parts: Record<string, number | null> | null; scoreWhy: string | null; beta: number | null; swing: number | null; worstFall: number | null;
  riskWhy: string | null; chg1y: number | null; value: number | null; of: number; file: boolean; equityLines: number };
export type EtfRow = { /** task #235: what the units still held cost */ invested?: number | null; symbol: string; name: string | null; isin: string | null; qty: number | null; price: number | null; priceDate: string | null; chg1d: number | null; chg1y: number | null;
  premium: number | null; ter: number | null; categoryLabel: string | null; asOf: string | null; fileWhy: string | null; beta: number | null; swing: number | null; worstFall: number | null;
  riskWhy: string | null; tracks: string | null; twice: boolean; value: number | null; of: number; file: boolean };
export type Health = {
  shares: (Bands & { model: "prism"; score: number | null; label: string | null }) | null;
  funds: ({ locked: true } | (Bands & { locked: false; score: number | null; label: string | null; lowest: { name: string; score: number; label: string | null } | null })) | null;
  etfs: { ter: number | null; costPerLakh: number | null; widestGap: { symbol: string; premium: number } | null } | null;
  underneath: (Bands & { model: "prism" }) | null;
};
export type AllInvestments = {
  plan: "silver" | "gold"; byValue: boolean; total: number | null; missing: Kind[]; counts: Record<Kind, number>; quantities: { have: number; of: number }; chg1y: number | null;
  cards: Record<Kind, Card>; madeOf: MadeOf; sectors: Sector[]; sizes: Size[]; companies: Company[]; filters: { all: number; twice: number; through: number; direct: number };
  /** task #277 (change 19): the companies of What changed: held directly, or 0.1% or more of everything through funds and ETFs (server: calc.changes_list) */
  changes?: { direct: string[]; through: string[] };
  /** task #391 PR B (fault 1): the holdings the money split leaves out (no quantity in a kind that has values), and how many it counts */
  noQuantity?: NamedHolding[]; counted?: { byValue: number; equal: number; notCounted: number; of: number };
  health: Health; risk: Risk; shares: ShareRow[]; funds: FundRow[]; etfs: EtfRow[];
  sources: { pricesTo: string | null; navsTo: string | null; filesFrom: string | null; filesTo: string | null }; unknown: string[]; gone: string[]; disclaimer: string;
};

/** The Equity portfolio list as the server takes it: one entry per share, symbol and the quantity still held (none means no quantity yet).
 *  Task #235: the rows are buys and sales in portfolios, so the quantity is what is left, first in, first out within each portfolio, added across them
 *  (lib/ledger); a share sold in full in every portfolio is left out, as on the Equity page. */
export function sharesBody(hs: Holding[]) {
  const syms = [...new Set(hs.map((h) => h.symbol.toUpperCase()))];
  const shares: { symbol: string; qty: number | null }[] = [];
  for (const s of syms) {
    const a = aggOf(hs, s, "all");
    if (a && a.nBuys > 0 && a.qty === 0) continue;                          // sold in full
    shares.push({ symbol: s, qty: a?.qty != null && a.qty > 0 ? Math.round(a.qty * 10000) / 10000 : null });
  }
  return { shares };
}
export const ALL_KEY = "all-investments";
/** Task #235 (pack C3): one account across the three pages: its Equity portfolios, its MF platform and its ETF account ("none": none on that page). */
export type AccountPick = { eq: string[] | null; mf: string; etf: string };
export const useAllInvestments = (hs: Holding[], enabled: boolean, pick?: AccountPick | null) => {
  const body = { ...sharesBody(pick?.eq ? hs.filter((h) => pick.eq!.includes(h.pf ?? DEFAULT_PF)) : hs), ...(pick ? { mfPf: pick.mf, etfPf: pick.etf } : {}) };
  // task #277: switching account keeps the last figures on screen until the account's own arrive (the top and Your portfolios do not vanish meanwhile)
  return useQuery<AllInvestments, ApiError>({ queryKey: [ALL_KEY, body], queryFn: () => apiSend<AllInvestments>("POST", "/api/me/all-investments", body).then(withoutRetiredScore), enabled, staleTime: 120_000, retry: 1, placeholderData: keepPreviousData });
};
/** Task #283: FinLit Prism is FinLit's only company score, and it comes with Gold. On any other plan the page shows no company score: whatever the server
 *  still sends on the retired score is dropped here, so the page shows names only (and a locked "FinLit Prism · see plans"). */
export function withoutRetiredScore(d: AllInvestments): AllInvestments {
  if (d.plan === "gold") return d;
  return {
    ...d,
    shares: d.shares.map((s) => ({ ...s, score: null, label: null })),
    companies: d.companies.map((c) => ({ ...c, score: null, label: null })),
    cards: { ...d.cards, shares: { ...d.cards.shares, score: null, scoreWord: null, bands: null, scoreModel: undefined, scoreLocked: true } },
    health: { ...d.health, shares: null, underneath: d.health.underneath?.model === "prism" ? d.health.underneath : null },
  };
}

/** ₹ in lakh or crore, as the design writes it ("₹14.2 L", "₹1.3 Cr", "₹61,400"). */
export function rupees(v: number): string {
  const a = Math.abs(v), s = v < 0 ? MINUS : "";
  if (a >= 1e7) return `${s}₹${nf(a / 1e7, 2)} Cr`;
  if (a >= 1e5) return `${s}₹${nf(a / 1e5, 2)} L`;
  return `${s}₹${nf(a, 0)}`;
}
/** A change with its sign always shown ("+7.9%", "−3.1%"). */
export const chg = (v: number | null | undefined, d = 1) => (v == null ? "—" : (v > 0 ? "+" : v < 0 ? MINUS : "") + nf(Math.abs(v), d) + "%");
export const pctOf = (v: number | null | undefined, d = 1) => (v == null ? "—" : (v < 0 ? MINUS : "") + nf(Math.abs(v), d) + "%");
export const betaTxt = (v: number | null | undefined) => (v == null ? "—" : nf(v, 2));
/** The one company score's name (task #283). */
export const SCORE_NAME = "FinLit Prism";
export const toneOf = (label: string | null | undefined) => (label === "Strong" || label === "Healthy" ? "pos" : label === "Average" || label === "Mixed" ? "mid" : label ? "neg" : "none");

/** How the split was decided, said wherever a split appears (pack: "Without quantities, every split says each kind counts the same and that the split is not
 *  the member's money"). */
export function splitLine(d: AllInvestments): string {
  if (d.byValue) return "Shares of your money, from your quantities × the last price or NAV.";
  const n = KINDS.filter((k) => d.counts[k] > 0).length;
  return n > 1 ? `Each kind counts the same (${n === 3 ? "⅓" : "½"} each) until you add quantities, so this split is not your money.`
    : "Each holding counts the same until you add quantities, so this split is not your money.";
}
export const kindsHeld = (d: AllInvestments) => KINDS.filter((k) => d.counts[k] > 0);
export const joinWords = (xs: string[]) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);
export const dateShort = (iso: string | null | undefined) => (iso ? new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
/** A row name inside a sentence: lower case, except a proper name ("Indian shares" stays). */
export const lower = (s: string) => (/^Indian\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

// ------------------------------------------------------------------------------------------------ task #235 (pack C3): money by value, with gain
/** Task #391 (developer file 35, fault 3): `now` is the value of every holding with a quantity; `nowPriced` the value of only those that also have a buy
 *  price, so it reads beside `invested` and `gain` (which cover the same holdings); `withQty` counts the holdings with a quantity. */
export type KindMoney = { n: number; full: number; invested: number; now: number; nowPriced: number; withQty: number; gain: number; missing: string[];
  /** task #391: holdings counted by their priced lots only (a fund with a buy amount for some of its lots) */ part: number };
/** What each kind cost and is worth now, from the page's figures: shares from their buys (lib/ledger, the same as the Equity page), funds and ETFs
 *  from the server's cost of the units still held. A holding without a buy price is left out of Invested and Gain and named. */
export function moneyByKind(d: AllInvestments, hs: Holding[]): Record<Kind | "all", KindMoney> {
  const mk = (): KindMoney => ({ n: 0, full: 0, invested: 0, now: 0, nowPriced: 0, withQty: 0, gain: 0, missing: [], part: 0 });
  const out: Record<Kind | "all", KindMoney> = { shares: mk(), funds: mk(), etfs: mk(), all: mk() };
  const add = (k: Kind, name: string, now: number | null, inv: number | null | undefined) => {
    const m = out[k]; m.n++; if (now != null) { m.now += now; m.withQty++; }
    if (now != null && inv != null) { m.full++; m.invested += inv; m.nowPriced += now; m.gain += now - inv; } else m.missing.push(name);
  };
  for (const s of d.shares) { const a = aggOf(hs, s.symbol, "all"); add("shares", s.symbol, s.qty && s.price ? s.qty * s.price : null, a?.invested ?? null); }
  for (const f of d.funds) {
    // task #391 (fault 2, with PR B): a fund held in two accounts with a buy amount for some lots only: Invested and Gain cover those lots (their cost
    // against their value now), never the whole fund's value against part of its cost; value now still covers every unit
    if (f.invested == null && f.investedPriced != null && f.valuePriced != null && f.units && f.nav) {
      const m = out.funds; m.n++; m.withQty++; m.now += f.units * f.nav; m.full++; m.part++; m.invested += f.investedPriced; m.nowPriced += f.valuePriced; m.gain += f.valuePriced - f.investedPriced;
      continue;
    }
    add("funds", f.short || f.name, f.units && f.nav ? f.units * f.nav : null, f.invested);
  }
  for (const e of d.etfs) add("etfs", e.symbol, e.qty && e.price ? e.qty * e.price : null, e.invested);
  for (const k of ["shares", "funds", "etfs"] as Kind[]) { const a = out.all, m = out[k]; a.n += m.n; a.full += m.full; a.invested += m.invested; a.now += m.now; a.nowPriced += m.nowPriced; a.withQty += m.withQty; a.gain += m.gain; a.part += m.part; a.missing.push(...m.missing); }
  return out;
}
