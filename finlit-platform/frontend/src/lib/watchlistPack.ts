// Task #408 ("Watchlist page: keep it a watchlist", the founder's 27 Nov pack): the words, numbers and rules of the Watchlists page as pure functions,
// tested in watchlistPack.test.ts against the pack's own sentences. What moved, what is near my target, what is new: Today on {list} with its Needs a look
// cards (04-needs-a-look.md), the four column sets (02-columns.md), Group by, sorting, and the Alerts for this list summary (05-alerts.md).
// Every figure comes from the sources in the pack's 03-data.md (lib/watchlistData.ts); nothing here works out a peer label. Describes, never advises.
import { capBucket, type SizeShort } from "./capBuckets";
import { trendReading, trendSide, type TrendReading } from "../portfolio/shared/words";

export type LeadLabel = "leader" | "in_line" | "laggard";
/** One stock's answer from /api/leadership/list. */
export type ListLead =
  | { available: true; label: LeadLabel; rank: number; ranked: number; group: string; groupName?: string | null; sector: string | null; sectorKind?: string | null; rel52: number | null;
      fundamentalRank: number | null; fundamentalOf: number | null; fundamentalNote: "below_peers" | "stronger_than_price" | null; stale?: boolean;
      /** task #235 (E4): the week's own reading and its direction, for the Equity portfolio's table */ rawLabel?: LeadLabel | null; direction?: "gaining" | "weakening" | null }
  | { available: false; reason: string; text: string };
export type ListLeadFeed = { available: true; asOf: string; rows: Record<string, ListLead> } | { available: false; reason: string };

// ------------------------------------------------------------------------------------------------ words of the page (01-page.md, final wording)
export const PAGE_DESC = "The companies you follow: what moved, what is near your target, and what is new.";
export const LIST_SUB = "Select Details on a stock for its chart since you added it, your note and target, and its latest filings.";
export const EMPTY_LIST = "This list is empty. Type a stock in “Add a stock to this list”, or use Watchlist on any company report.";
export const QUIET_TARGET = "Nothing else today: no results due this week, no move of 5% or more, and no new filing of Discover’s eight kinds.";
export const QUIET_NO_TARGET = "Nothing else today. Set a target on a stock and it shows here when the price comes within 5% of it.";
export const QUIET_EMPTY = "Add a stock to this list and its moves, targets and news show here.";
export const PRISM_FOOT = "* This week’s reading differs from the label; the label changes if next week’s reading agrees.";
export const SCREENS_FOOT = "A screen narrows a list; it is not a recommendation.";
export const PLAIN = "lists, notes and targets are saved to your FinLit account. Targets are your own reminders, not predictions; FinLit does not tell you when to buy or sell.";
export const NO_SCORE = "Not enough data to score yet.";
export const NO_LABEL_DETAIL = "With less than a year of share prices, it has no peer label yet.";
export const COULD_NOT = "Could not load. Try again.";
export const NEAR = 5;   // percent, either side of the target

// ------------------------------------------------------------------------------------------------ numbers
export const MINUS = "−";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "4 Dec" from "2026-12-04" (or a timestamp, read in India's time). */
export function dMon(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = iso.length > 10 ? new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10) : iso;
  const [, m, day] = d.split("-");
  return `${Number(day)} ${MON[Number(m) - 1] ?? ""}`;
}
/** India's calendar day of a millisecond time. */
export const istDay = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
/** "Thursday" from "2026-11-26". */
export const weekday = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" });
/** "3:28 pm, 26 Nov" from a quote's time ("2026-11-26T15:28:00+05:30"). */
export function pricesAt(iso: string): string {
  const t = new Date(new Date(iso).getTime() + 330 * 60_000);
  const h = t.getUTCHours(), m = t.getUTCMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}, ${dMon(t.toISOString().slice(0, 10))}`;
}
/** Rupees in Indian grouping with two decimals: ₹1,396.20. */
export const rs = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Whole rupees in Indian grouping: ₹1,396 (chart labels, crore figures). */
export const rs0 = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
/** A percentage with a sign and a true minus: +0.35%, −0.13%, 0.00%. */
export function pc(v: number, d = 2): string {
  const r = Number(v.toFixed(d));
  return (r > 0 ? "+" : r < 0 ? MINUS : "") + Math.abs(r).toFixed(d) + "%";
}
/** Points with a sign: +1.9 pts. */
export function pts(v: number): string { const r = Number(v.toFixed(1)); return (r > 0 ? "+" : r < 0 ? MINUS : "") + Math.abs(r).toFixed(1) + " pts"; }
/** A signed number with one decimal and no unit: −3.5. */
export function sgn1(v: number): string { const r = Number(v.toFixed(1)); return (r > 0 ? "+" : r < 0 ? MINUS : "") + Math.abs(r).toFixed(1); }
/** The colour class of a move: wp-up, wp-dn or none. */
export const tone = (v: number | null | undefined, d = 2) => (v == null ? "" : Number(v.toFixed(d)) > 0 ? "wp-up" : Number(v.toFixed(d)) < 0 ? "wp-dn" : "");
export const sizeWord = (crore: number | null | undefined): SizeShort | null => capBucket(crore)?.short ?? null;

// ------------------------------------------------------------------------------------------------ one stock
export type Sec = {
  slug: string | null; sector: string | null;
  pulseCode: string | null; pulse: string | null; pulseTone: string; pulseO: number | null; pulseNote: string | null; pulseTip: string | null; breadth: number | null; n: number | null;
  corner: string | null; cornerTone: string; cornerO: number | null; cornerNote: string | null; cornerTip: string | null;
  rank: number | null; of: number | null; rk1: string | null; rk4: string | null; hist: number[]; s6: number | null; s1: number | null;
};
export type Screen = { id: string; name: string; group: string; added_on: string | null; baseline: boolean; position: number | null; count: number | null };
export type Filing = { d: string; t: string; l: string | null };
export type WStock = {
  s: string; name: string; logo: string | null;
  added: number | null; addedPrice: number | null; target: number | null; note: string; nearAlert: boolean;
  px: number | null; chgp: number | null; h52: number | null; l52: number | null; quoteAsOf: string | null;
  m1: number | null; m3: number | null; y1: number | null;
  prism: number | null; prismWord: string | null; gp: number | null; val: number | null; qual: number | null; risk: number | null;
  stS: number | null; stW: string | null; ltS: number | null; ltW: string | null;
  peer: LeadLabel | null; peerRank: number | null; peerOf: number | null; peerGroup: string | null; peerWhy: string | null; noLabelYet: boolean;
  rawLabel: LeadLabel | null; pending: string | null; labelSince: string | null; leadAsOf: string | null; labelBefore: LeadLabel | null;
  vixName: string | null; vix52: number | null; vix13: number | null; grp1: string | null;
  mcap: number | null; pe: number | null; pb: number | null; dy: number | null; roe: number | null;
  revY: number | null; revCr: number | null; npY: number | null; npCr: number | null; resD: string | null; resQ: string | null; filings: Filing[];
  theme: string | null; themeStatus: string | null;
  ind: string | null; sec: Sec | null;
  scr: Screen[];
};

export const since = (s: Pick<WStock, "px" | "addedPrice">) => (s.px != null && s.addedPrice ? (s.px / s.addedPrice - 1) * 100 : null);
/** How far the target is from the price, in percent of the price: positive when the price is below the target. */
export const dist = (s: Pick<WStock, "px" | "target">) => (s.px && s.target ? (s.target / s.px - 1) * 100 : null);
/** The line under the target box: "4.0% below target", "At your target" (within 0.05%), or nothing. `near` turns it amber. */
export function distText(d: number | null): { t: string; near: boolean } {
  if (d == null) return { t: "", near: false };
  if (Math.abs(d) < 0.05) return { t: "At your target", near: true };
  return { t: `${Math.abs(d).toFixed(1)}% ${d > 0 ? "below" : "above"} target`, near: Math.abs(d) <= NEAR };
}
/** Under the 52-week bar: "7.9% below high", or "At its 52-week high" within 0.5%. */
export function rangeNote(px: number, h52: number): string { const off = (1 - px / h52) * 100; return off < 0.5 ? "At its 52-week high" : `${off.toFixed(1)}% below high`; }
/** The marker's place on the 52-week bar, 0 to 100. */
export const rangeAt = (px: number, l52: number, h52: number) => (h52 > l52 ? Math.max(0, Math.min(100, ((px - l52) / (h52 - l52)) * 100)) : 50);

/** The trend phrase and its arrows from the long- and short-term scores, through the site's one rule (portfolio/shared/words.ts, the MF portfolio's nine phrases). */
const ARROW = { 1: "↗", 0: "→", [-1]: "↘" } as Record<number, string>;
export function trend(stS: number | null, ltS: number | null): { phrase: TrendReading; st: string; lt: string } | null {
  const p = trendReading(stS, ltS), a = trendSide(stS), b = trendSide(ltS);
  return p && a != null && b != null ? { phrase: p, st: ARROW[a], lt: ARROW[b] } : null;
}
/** Prism's bands (01-page wording rules): 70 and over Strong, 50 to 69 Fair, under 50 Weak. */
export type Band = "hi" | "mid" | "lo" | "na";
export const band = (v: number | null | undefined): Band => (v == null ? "na" : v >= 70 ? "hi" : v >= 50 ? "mid" : "lo");
export const BAND_WORD: Record<Exclude<Band, "na">, string> = { hi: "Strong", mid: "Fair", lo: "Weak" };
/** The band of a technical word (Uptrend, Sideways, Downtrend). */
export const techBand = (w: string | null | undefined): Band => (!w ? "na" : /down/i.test(w) ? "lo" : /up/i.test(w) ? "hi" : "mid");
export const LABEL_WORD: Record<LeadLabel, string> = { leader: "Leader", in_line: "In line", laggard: "Laggard" };
export const LABEL_TONE: Record<LeadLabel, string> = { leader: "good", in_line: "mid", laggard: "bad" };
const LABEL_A: Record<LeadLabel, string> = { leader: "A Leader", in_line: "In line", laggard: "A Laggard" };

// ------------------------------------------------------------------------------------------------ Sector Pulse and Sector Rotation words
export const PULSE_ORDER = ["thrust_cap", "thrust_c", "confirmed", "fading", "washout", "neutral"];
export const PULSE_TONE: Record<string, string> = { thrust_cap: "mid", thrust_c: "mid", confirmed: "good", fading: "warn", washout: "bad", neutral: "" };
export const CORNER_ORDER = ["ahead_gaining", "ahead_slowing", "behind_gaining", "behind_slipping"];
export const CORNER_WORDS = ["Ahead and gaining", "Ahead but slowing", "Behind but gaining", "Behind and slipping"];
export const CORNER_TONE: Record<string, string> = { ahead_gaining: "good", ahead_slowing: "warn", behind_gaining: "mid", behind_slipping: "bad" };
/** "Up 2 this week", "Down 3 in 4 weeks", "No change this week". */
export function rankMove(n: number | null | undefined, span: "this week" | "in 4 weeks"): string | null {
  if (n == null) return null;
  return n > 0 ? `Up ${n} ${span}` : n < 0 ? `Down ${-n} ${span}` : `No change ${span}`;
}
/** Under the Sector Pulse chip: "At its 1-year high" or "3.4% below 1-year high". */
export const highNote = (v: number | null | undefined) => (v == null ? null : v >= -0.05 ? "At its 1-year high" : `${Math.abs(v).toFixed(1)}% below 1-year high`);

// ------------------------------------------------------------------------------------------------ the four column sets (02-columns.md)
export type View = "price" | "prism" | "biz" | "sec";
export type GroupBy = "none" | "peers" | "industry" | "size";
/** `l`: the long name in the sort button's title; `pl`: the name over the value in the card and phone layouts (else `t`). */
export type Col = { k: string; t: string; c?: string; s?: string; v: View | "all"; g?: string; sub?: string; i?: string; hw?: boolean; l?: string; pl?: string; title?: string };
export const VIEWS: { id: View; label: string }[] = [{ id: "price", label: "Price" }, { id: "prism", label: "Prism" }, { id: "biz", label: "Business" }, { id: "sec", label: "Sectors" }];
export const GROUP_BTNS: { id: Exclude<GroupBy, "none">; label: string }[] = [{ id: "peers", label: "Against peers" }, { id: "industry", label: "Industry" }, { id: "size", label: "Size" }];
export const PEERS_I = "The share price over the last 12 months against similar companies and the sector index, with its place among them.";
export const COLS: Col[] = [
  { k: "co", t: "Company", c: "c-co", s: "s", v: "all" },
  { k: "px", t: "Price · today", c: "c-px r", s: "chgp", v: "price", title: "Sort by today's move" },
  { k: "since", t: "Since added", c: "r", s: "since", v: "price" },
  { k: "tg", t: "Your target", c: "c-tg", s: "dist", v: "price" },
  { k: "m1", t: "1 month", c: "r", s: "m1", v: "price" },
  { k: "rng", t: "52-week range", v: "price" },
  { k: "tr", t: "Trend", c: "wl-tr", v: "price" },
  { k: "prism", t: "Prism", l: "FinLit Prism", c: "wl-dv", s: "prism", v: "prism", g: "fs" },
  { k: "gp", t: "G&P", l: "Growth and profitability (G&P)", s: "gp", v: "prism", g: "fs" },
  { k: "val", t: "Val.", l: "Valuation (strong = cheaper)", sub: "Strong = cheaper", s: "val", v: "prism", g: "fs" },
  { k: "qual", t: "Qual.", l: "Quality", s: "qual", v: "prism", g: "fs" },
  { k: "risk", t: "Risk", l: "Risk (strong = safer)", sub: "Strong = safer", s: "risk", v: "prism", g: "fs" },
  { k: "st", t: "Short term", c: "wl-dv", s: "stS", v: "prism", g: "tv" },
  { k: "lt", t: "Long term", s: "ltS", v: "prism", g: "tv" },
  { k: "peer", t: "Vs its peers", c: "wl-dv", s: "peerRank", v: "prism", g: "ap", i: PEERS_I },
  { k: "size", t: "Size", c: "wp-size", s: "mcap", v: "biz" },
  { k: "pe", t: "P/E", c: "r wl-dv", s: "pe", v: "biz", g: "vl" },
  { k: "pb", t: "P/B", c: "r", s: "pb", v: "biz", g: "vl" },
  { k: "dy", t: "Div. yield", hw: true, c: "r", s: "dy", v: "biz", g: "vl" },
  { k: "roe", t: "ROE", c: "r wl-dv", s: "roe", v: "biz", g: "rq" },
  { k: "rev", t: "Revenue", pl: "Revenue vs a year ago", c: "r", s: "revY", v: "biz", g: "rq" },
  { k: "np", t: "Net profit", hw: true, pl: "Net profit vs a year ago", c: "r", s: "npY", v: "biz", g: "rq" },
  { k: "res", t: "Results", pl: "Last results", c: "wl-dv", v: "biz" },
  { k: "th", t: "Theme", c: "c-th", v: "biz" },
  { k: "sind", t: "Industry", c: "c-stk", s: "ind", v: "sec" },
  { k: "pulse", t: "Reading", pl: "Sector Pulse", c: "wl-dv", s: "pulseO", v: "sec", g: "sp" },
  { k: "corner", t: "Where it stands", pl: "Sector Rotation", c: "wl-dv", s: "cornerO", v: "sec", g: "sr" },
  { k: "rrank", t: "Rank", pl: "Rotation rank", s: "rotRank", v: "sec", g: "sr" },
  { k: "vsix", t: "Stock vs index", pl: "Vs sector index, 12 months", sub: "12 months", c: "r wl-dv", s: "vix", v: "sec", g: "si" },
  { k: "ac", t: "", c: "wl-ac", v: "all" },
];
/** The groups of the two-row headers, with their ⓘ. `quarter` names the latest quarter in the Business set's ⓘ ("the quarter to September 2026"). */
export function groupHeads(quarter: string | null): Record<string, [string, string]> {
  return {
    fs: ["FinLit Prism · Fundamental score", "The overall score and its four parts, from the company’s results, balance sheet and price."],
    tv: ["Technical view", "FinLit Prism’s short-term and long-term trend scores, from −100 to +100, with the word for each."],
    ap: ["Against peers", ""],
    vl: ["Valuation", "What the market pays: price to earnings, price to book value, and the last 12 months’ dividends against the price."],
    rq: ["Returns and the latest quarter", `Return on equity over the last 12 months; revenue and net profit for ${quarter ? `the quarter to ${quarter}` : "the latest quarter"} against the same quarter a year earlier.`],
    sp: ["Sector Pulse", "How broadly the stocks of the industry are moving, read after each trading day."],
    sr: ["Sector Rotation", "Where the industry stands against the average industry over 6 months and the last month, ranked every week."],
    si: ["Inside its sector", "How the stock itself has moved against its sector index."],
  };
}
export const colsOf = (view: View) => COLS.filter((c) => c.v === "all" || c.v === view);

// ------------------------------------------------------------------------------------------------ sorting (every arrowed column, both ways)
/** Sorted first from the smallest (names, ranks, distance to target, state order); everything else from the biggest. */
export const ASC_FIRST = new Set(["s", "dist", "peerRank", "ind", "rotRank", "pulseO", "cornerO"]);
export function sortValue(s: WStock, k: string): number | string | null {
  switch (k) {
    case "s": return s.s;
    case "chgp": return s.chgp;
    case "since": return since(s);
    case "dist": { const d = dist(s); return d == null ? null : Math.abs(d); }
    case "m1": return s.m1;
    case "prism": return s.prism;
    case "gp": return s.gp; case "val": return s.val; case "qual": return s.qual; case "risk": return s.risk;
    case "stS": return s.stS; case "ltS": return s.ltS;
    case "peerRank": return s.peerRank != null && s.peerOf ? s.peerRank / s.peerOf : null;
    case "mcap": return s.mcap; case "pe": return s.pe; case "pb": return s.pb; case "dy": return s.dy; case "roe": return s.roe;
    case "revY": return s.revY; case "npY": return s.npY;
    case "ind": return s.ind;
    case "pulseO": return s.sec?.pulseO ?? null;
    case "cornerO": return s.sec?.cornerO ?? null;
    case "rotRank": return s.sec?.rank ?? null;
    case "vix": return s.vix52;
    default: return null;
  }
}
/** The list sorted by a column; a stock without the figure stays at the end either way (no target last). */
export function sortStocks(list: WStock[], k: string | null, dir: 1 | -1): WStock[] {
  if (!k) return list;
  return [...list].sort((a, b) => {
    const x = sortValue(a, k), y = sortValue(b, k);
    if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    return (typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number)) * dir;
  });
}

// ------------------------------------------------------------------------------------------------ Group by
export type Grp = { key: string; label: string; tone: "good" | "mid" | "bad"; stocks: WStock[] };
const SIZE_BAND: [SizeShort, string][] = [["Large", "Large companies"], ["Mid", "Mid-size companies"], ["Small", "Small companies"], ["Micro", "Micro companies"]];
export function groupStocks(list: WStock[], by: GroupBy): Grp[] {
  if (by === "none") return [{ key: "all", label: "", tone: "mid", stocks: list }];
  let g: Grp[];
  if (by === "peers") g = ([["leader", "Leaders", "good"], ["in_line", "In line", "mid"], ["laggard", "Laggards", "bad"]] as const).map(([k, l, t]) => ({ key: k, label: l, tone: t, stocks: list.filter((s) => s.peer === k) }));
  else if (by === "size") g = SIZE_BAND.map(([k, l]) => ({ key: k, label: l, tone: "mid" as const, stocks: list.filter((s) => sizeWord(s.mcap) === k) }));
  else g = [...new Set(list.map((s) => s.ind).filter((x): x is string => !!x))].sort().map((x) => ({ key: x, label: x, tone: "mid" as const, stocks: list.filter((s) => s.ind === x) }));
  const rest = list.filter((s) => !g.some((x) => x.stocks.includes(s)));
  if (rest.length) g.push({ key: "none", label: by === "peers" ? "No peer label yet" : by === "size" ? "Size not known yet" : "Industry not known yet", tone: "mid", stocks: rest });
  return g.filter((x) => x.stocks.length);
}
export const stocksN = (n: number) => `${n} stock${n === 1 ? "" : "s"}`;

// ------------------------------------------------------------------------------------------------ Needs a look (04-needs-a-look.md)
export type LookKind = "tgt" | "up" | "dn" | "soon" | "tag" | "file" | "hl" | "scr" | "slow" | "gain" | "pend";
export type Look = { s: string; k: LookKind; kl: string; t: string; n: number };
export type LookCtx = {
  /** "Board meeting for results" days within the next 7 days, per symbol (from /api/results/calendar) */ results: Record<string, string>;
  /** Discover's filings since the last visit (What changed's rows with something new) */ filings: { s: string; kind: string; t: string | null; d: string }[];
  /** Sector Rotation's moves in the latest weekly run, and its date */ moved: { slug: string; name: string; from: string; to: string }[]; rotDate: string | null; sectors: boolean;
  /** the screens' as-of date */ scrAsOf: string | null;
  /** today in India (for "for 7 days after that run") */ today: string;
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);
const cut = (t: string, n = 80) => (t.length > n ? t.slice(0, n).trimEnd() + "…" : t);
export function lookCards(list: WStock[], c: LookCtx): Look[] {
  const out: Look[] = [];
  list.forEach((s) => {
    const d = dist(s);
    if (d != null && Math.abs(d) <= NEAR && s.target) out.push({ s: s.s, k: "tgt", kl: "Near your target", n: 1, t: Math.abs(d) < 0.05 ? `At your target of ${rs(s.target)}` : `${rs(s.px!)} is ${Math.abs(d).toFixed(1)}% ${d > 0 ? "below" : "above"} your target of ${rs(s.target)}` });
    if (s.chgp != null && s.px != null && Math.abs(s.chgp) >= 5) out.push({ s: s.s, k: s.chgp > 0 ? "up" : "dn", kl: "Big move", n: 2, t: `${s.chgp > 0 ? "Up" : "Down"} ${Math.abs(s.chgp).toFixed(1)}% today, to ${rs(s.px)}.` });
    if (c.results[s.s]) out.push({ s: s.s, k: "soon", kl: "Results soon", n: 3, t: `Board meeting for results on ${dMon(c.results[s.s])}.` });
    if (s.peer && s.labelBefore && s.labelBefore !== s.peer && s.labelSince && s.leadAsOf && s.labelSince === s.leadAsOf && daysBetween(s.leadAsOf, c.today) <= 7)
      out.push({ s: s.s, k: "tag", kl: "Peer label changed", n: 4, t: `Now ${LABEL_WORD[s.peer]}, after ${LABEL_WORD[s.labelBefore]}, in the ${dMon(s.leadAsOf)} weekly check.` });
    for (const f of c.filings.filter((x) => x.s === s.s)) out.push({ s: s.s, k: "file", kl: "New filing", n: 5, t: f.t ? `${f.kind}: ${cut(f.t)}` : `${f.kind}: filed on ${dMon(f.d)}.` });
    if (s.px != null && s.h52 && (1 - s.px / s.h52) * 100 <= 2) out.push({ s: s.s, k: "hl", kl: "Near 52-week high", n: 6, t: `${Math.max(0, (1 - s.px / s.h52) * 100).toFixed(1)}% below its 52-week high of ${rs(s.h52)}.` });
    else if (s.px != null && s.l52 && (s.px / s.l52 - 1) * 100 <= 2) out.push({ s: s.s, k: "hl", kl: "Near 52-week low", n: 6, t: `${Math.max(0, (s.px / s.l52 - 1) * 100).toFixed(1)}% above its 52-week low of ${rs(s.l52)}.` });
    const fresh = c.scrAsOf ? s.scr.filter((x) => !x.baseline && x.added_on && daysBetween(x.added_on, c.scrAsOf!) <= 7 && daysBetween(x.added_on, c.scrAsOf!) >= 0).sort((a, b) => b.added_on!.localeCompare(a.added_on!)) : [];
    if (fresh.length) {
      const nm = (x: Screen) => `${x.name} (${dMon(x.added_on)})`;
      const t = fresh.length === 1 ? nm(fresh[0]) : fresh.length === 2 ? `${nm(fresh[0])} and ${nm(fresh[1])}` : `${nm(fresh[0])}, ${nm(fresh[1])} and ${fresh.length - 2} more`;
      out.push({ s: s.s, k: "scr", kl: `New in ${fresh.length} screen${fresh.length === 1 ? "" : "s"}`, n: 7, t: `${t}, in the Advanced screener.` });
    }
    const mv = c.sectors && s.sec?.slug ? c.moved.find((m) => m.slug === s.sec!.slug) : undefined;
    if (mv) {
      const a = CORNER_WORDS.indexOf(mv.from), b = CORNER_WORDS.indexOf(mv.to);
      if (a >= 0 && b >= 0 && a !== b) out.push({ s: s.s, k: b > a ? "slow" : "gain", kl: b > a ? "Industry slowing" : "Industry gaining", n: 8, t: `${mv.name} moved from ${mv.from} to ${mv.to} in the ${dMon(c.rotDate)} Sector Rotation.` });
    }
    if (s.pending && s.peer && s.rawLabel && s.rawLabel !== s.peer) out.push({ s: s.s, k: "pend", kl: "Peer label may change", n: 9, t: `${LABEL_A[s.peer]} now; this week’s reading says ${LABEL_WORD[s.rawLabel]}. It changes if next week’s reading agrees.` });
  });
  const pos = new Map(list.map((s, i) => [s.s, i]));
  return out.sort((a, b) => a.n - b.n || (pos.get(a.s)! - pos.get(b.s)!));
}
/** The closing line of the Needs a look panel. The pack's sentence names what did not happen, so it is used only when none of those cards is there. */
export function quietLine(list: WStock[], looks: Look[]): string {
  if (!list.length) return QUIET_EMPTY;
  if (!list.some((s) => s.target)) return QUIET_NO_TARGET;
  return looks.some((l) => l.k === "up" || l.k === "dn" || l.k === "soon" || l.k === "file") ? "Nothing else today." : QUIET_TARGET;
}
/** The pending note in Details: "This week’s reading says In line. The label changes if next week’s reading agrees." */
export const pendingNote = (raw: LeadLabel) => `This week’s reading says ${LABEL_WORD[raw]}. The label changes if next week’s reading agrees.`;

// ------------------------------------------------------------------------------------------------ Today's summary line
export function dayCounts(list: WStock[]): { up: number; down: number; flat: number; day: string | null } {
  const moved = list.filter((s) => s.chgp != null);
  const up = moved.filter((s) => Number(s.chgp!.toFixed(2)) > 0).length, down = moved.filter((s) => Number(s.chgp!.toFixed(2)) < 0).length;
  const days = list.map((s) => s.quoteAsOf).filter((x): x is string => !!x).sort();
  return { up, down, flat: moved.length - up - down, day: days.length ? weekday(new Date(new Date(days[days.length - 1]).getTime() + 330 * 60_000).toISOString()) : null };
}

// ------------------------------------------------------------------------------------------------ Alerts for this list (05-alerts.md)
export type PeerPick = "any" | "laggard" | "leader" | "off";
export type ListAlerts = { target: boolean; peer: PeerPick; filings: string[] };
export const PEER_BTNS: { id: PeerPick; label: string }[] = [{ id: "any", label: "Any change" }, { id: "laggard", label: "Only to Laggard" }, { id: "leader", label: "Only to Leader" }, { id: "off", label: "Off" }];
export const FILING_PILLS: { k: string; label: string }[] = [
  { k: "order", label: "Order win" }, { k: "capacity", label: "Capacity" }, { k: "partnership", label: "Partnership" }, { k: "mna", label: "Acquisition / merger" },
  { k: "fundraise", label: "Fund raising" }, { k: "rating", label: "Credit rating" }, { k: "management", label: "Management" }, { k: "legal", label: "Legal / regulatory" },
];
export const DEFAULT_ALERTS: ListAlerts = { target: true, peer: "any", filings: ["order", "capacity"] };
/** "Target: on · Peer labels: any change · Filings: order win, capacity" ("Filings: 4 kinds" with more than three, "Filings: off" with none). */
export function alertsLine(a: ListAlerts): string {
  const kinds = FILING_PILLS.filter((p) => a.filings.includes(p.k)).map((p) => p.label.toLowerCase());
  const peer = PEER_BTNS.find((p) => p.id === a.peer)!.label.toLowerCase();
  return `Target: ${a.target ? "on" : "off"} · Peer labels: ${peer} · Filings: ${!kinds.length ? "off" : kinds.length > 3 ? `${kinds.length} kinds` : kinds.join(", ")}`;
}

// ------------------------------------------------------------------------------------------------ the list is full (06, plan limits)
/** The add box's placeholder when the plan's limit is reached: "This list is full: 30 stocks on Silver" (the site's real limits). */
export const fullText = (limit: number, plan: string) => `This list is full: ${limit.toLocaleString("en-IN")} stocks on ${plan.charAt(0).toUpperCase() + plan.slice(1)}`;
