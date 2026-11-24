// Task #385 (developer file 33, page-wide rules): the plain words every view of the Equity portfolio uses. Pure, so each rule is tested on its own
// (shared/shared385.test.ts) and phase 2 (Diversification, Risk) reuses the same words. Describes figures; never advice.

/** U+2212, the real minus sign. */
export const MINUS = "−";

/** "Sell" becomes "Record a sale" (file 33, Words). */
export const RECORD_SALE = "Record a sale";

const NUM_WORD = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** A small count as a word ("two"), a larger one as digits. */
export const numWord = (n: number) => (n >= 0 && n < NUM_WORD.length ? NUM_WORD[n] : String(n));
export const cap1 = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const IRREGULAR: Record<string, string> = { industry: "industries", company: "companies", "macro sector": "macro sectors", sector: "sectors", update: "updates", filing: "filings", share: "shares", pair: "pairs", bet: "bets" };
/** The plural of a noun the page counts. */
export const pluralOf = (one: string) => IRREGULAR[one] ?? (/(s|x|ch|sh)$/.test(one) ? one + "es" : /[^aeiou]y$/.test(one) ? one.slice(0, -1) + "ies" : one + "s");
/** "1 share", "2 shares", "1 industry", "3 industries" (a count of one is singular). */
export const countOf = (n: number, one: string, many = pluralOf(one)) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/** "A", "A and B", "A, B and C". */
export const andList = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** At most `max` names, then "and N more" ("A, B, C and 2 more"). */
export const namesUpTo = (xs: string[], max = 3) => (xs.length <= max ? andList(xs) : `${xs.slice(0, max).join(", ")} and ${xs.length - max} more`);

/** Task #388 (developer file 36, part B item 9): inside a company name "Of", "And" and "The" read "of", "and" and "the", unless the word comes first
 *  ("Bank Of Maharashtra Ltd" → "Bank of Maharashtra Ltd"; "The Federal Bank" keeps its "The"). Anywhere a name appears on the page. */
export function nameCase(name: string | null | undefined): string {
  const n = String(name ?? "");
  return n.replace(/(?<=\S\s+)\b(Of|And|The)\b(?=\s)/g, (w) => w.toLowerCase());
}

/** The short company name for sentences, lists, cards and charts (file 33, Names): drop "Ltd", "Limited" and "Company"; above 24 characters keep
 *  the first two or three words ("Samvardhana Motherson International Ltd" → "Samvardhana Motherson"). "Of", "And" and "The" inside a name read lower case
 *  (nameCase). */
export function shortCo(name: string | null | undefined, symbol = ""): string {
  let n = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!n) return symbol;
  for (let i = 0; i < 3; i++) n = n.replace(/[\s,]+(Ltd\.?|Limited|Company|Co\.?)$/i, "").trim();
  n = nameCase(n);
  const w = n.split(" ");
  if (n.length > 24 && w.length > 2) { n = w.slice(0, w.length > 3 ? 3 : 2).join(" "); if (n.length > 24) n = w.slice(0, 2).join(" "); }
  return n.replace(/[\s,&-]+$/, "") || symbol;
}

/** A share's label in a sentence: its short name, or its code when no name is stored. */
export const coName = (s: { symbol: string; name?: string | null }) => shortCo(s.name, s.symbol);

/** Share codes inside a sentence from the server become names ("LT and MOTHERSON move together" → "Larsen & Toubro and Samvardhana Motherson move
 *  together"). Whole words only, the longest code first, so "TVS" never eats into "TVSMOTOR". */
export function namesInText(text: string, names: Map<string, string> | Record<string, string>): string {
  const m = names instanceof Map ? names : new Map(Object.entries(names));
  const keys = [...m.keys()].filter((k) => k && m.get(k) && m.get(k) !== k).sort((a, b) => b.length - a.length);
  if (!keys.length) return text;
  const re = new RegExp(`(?<![\\w&])(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\w&])`, "g");
  return text.replace(re, (k) => m.get(k) ?? k);
}

// ------------------------------------------------------------------------------------------------ beta and moving together
/** The six beta ranges in plain words (file 33: no "Defensive"). The server's keys stay; only the words change. */
export const BETA_RANGE_WORD: Record<string, string> = { less: "Much less sensitive", defensive: "Less sensitive", similar: "Similar", more: "More sensitive", high: "High", very_high: "Very high" };
export const betaRangeWord = (key: string | null | undefined, fallback = "") => (key && BETA_RANGE_WORD[key]) || fallback.replace(/^Defensive$/i, "Less sensitive");
/** "1.29× as much as its markets" (no β). `against`: "its markets", "the Nifty 50". */
export const movesAsMuch = (beta: number, against = "its markets") => `${beta.toFixed(2)}× as much as ${against}`;
/** Index names in the site's case: "NIFTY 50" → "Nifty 50", "NIFTY Midcap 150" → "Nifty Midcap 150". */
export const indexName = (s: string | null | undefined) => String(s ?? "").replace(/\bNIFTY\b/g, "Nifty");

/** How closely two things move together, in words (file 33): below 0.2 barely, 0.2 to 0.4 loosely, 0.4 to 0.6 partly, 0.6 and above closely. */
export type CorrWord = "barely" | "loosely" | "partly" | "closely";
export function corrWord(v: number): CorrWord { const a = Math.abs(v); return a < 0.2 ? "barely" : a < 0.4 ? "loosely" : a < 0.6 ? "partly" : "closely"; }
/** "0.34 (loosely linked)": the figure always beside its word, two decimals. */
export const corrText = (v: number) => `${v < 0 ? MINUS : ""}${Math.abs(v).toFixed(2)} (${corrWord(v)} linked)`;
/** The share of two shares' weekly moves they have in common: the correlation squared × 100, rounded. */
export const inCommon = (v: number) => Math.round(v * v * 100);

// ------------------------------------------------------------------------------------------------ points against a peer group
/** "+46.6 pts vs Nifty Auto over 12 months" → "Beat the Nifty Auto by 46.6 points over 12 months"; negative → "Trailed the … by". */
export function pointsLine(vs: number, bench: string): string {
  const who = /^peer average$/i.test(bench) ? "the peer average" : `the ${indexName(bench)}`;
  const d = Math.abs(vs).toFixed(1);
  return `${vs >= 0 ? "Beat" : "Trailed"} ${who} by ${d} ${d === "1.0" ? "point" : "points"} over 12 months`;
}
export const POINTS_NOTE = "Points are percentage points: the share’s 12-month return minus the return of the group or index it is compared with.";

// ------------------------------------------------------------------------------------------------ the nine trend readings
/** One trend score (−100 to +100) on the trend reading's own ±20 lines: 1 rising, 0 flat, −1 falling. */
export const trendSide = (v: number | null | undefined): -1 | 0 | 1 | null => (v == null ? null : Math.round(v) >= 20 ? 1 : Math.round(v) <= -20 ? -1 : 0);
/** The nine readings the Trends section uses, in their order (long term first, then short term). */
export const TREND_READINGS = ["Rising", "Rising but resting", "Rising but dipping", "Flat, turning up", "Flat", "Flat, turning down", "Falling but bouncing", "Falling but resting", "Falling"] as const;
export type TrendReading = (typeof TREND_READINGS)[number];
/** The reading a pair of trend scores makes: the long-term trend, then what the short term is doing to it. Null when either is not rated. */
export function trendReading(st: number | null | undefined, lt: number | null | undefined): TrendReading | null {
  const s = trendSide(st), l = trendSide(lt);
  if (s == null || l == null) return null;
  const row = l === 1 ? 0 : l === 0 ? 1 : 2, col = s === 1 ? 0 : s === 0 ? 1 : 2;
  return TREND_READINGS[row * 3 + col];
}
/** The colour a reading takes: good on both rising, bad on both falling, otherwise neutral, a falling long term leaning bad. */
export const trendTone = (r: TrendReading | null): "hi" | "lo" | "lo2" | "mid" | "na" => (!r ? "na" : r === "Rising" ? "hi" : r === "Falling" ? "lo" : r.startsWith("Falling") ? "lo2" : "mid");
export const SIDE_WORD = { 1: "Rising", 0: "Flat", [-1]: "Falling" } as Record<number, string>;

// ------------------------------------------------------------------------------------------------ words that rank
/** Words that sort by rank, not by alphabet (file 33, Sorting): the first in each list ranks highest. */
export const RANKS: Record<string, readonly string[]> = {
  prism: ["Strong", "Healthy", "Average", "Fair", "Weak", "Poor", "Not scored"],
  part: ["Strong", "Fair", "Weak"],
  peer: ["Leader", "In line", "Laggard", "Not compared"],
  trend: TREND_READINGS,
};
/** A rank as a number for sorting (higher ranks higher); unknown words sort last. Average and Fair rank the same. */
export function rankOf(kind: keyof typeof RANKS | readonly string[], word: string | null | undefined): number | null {
  if (word == null) return null;
  const list = typeof kind === "string" ? RANKS[kind] : kind;
  const w = word === "Fair" && list.includes("Average") ? "Average" : word;
  const i = list.findIndex((x) => x.toLowerCase() === w.toLowerCase());
  return i < 0 ? null : list.length - i;
}

// ------------------------------------------------------------------------------------------------ the words the page must not show
const WEEKDAY = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/;
/** What file 33's last check looks for on the page: "β", "pts", "Defensive", "Sell" on its own, "−0.0%" and a weekday as a column heading.
 *  `heads` are the table headings on the page. Returns what it found (empty when clean). */
export function bannedIn(text: string, heads: string[] = []): string[] {
  const out: string[] = [];
  if (/β/.test(text)) out.push("β");
  if (/\bpts\b/.test(text)) out.push("pts");
  if (/\bDefensive\b/.test(text)) out.push("Defensive");
  if (/(^|[\s|·(])Sell(?![\w-])/.test(text)) out.push("Sell");
  if (/[−-]0\.0+%/.test(text)) out.push("−0.0%");
  if (heads.some((h) => WEEKDAY.test(h.trim()))) out.push("weekday heading");
  return out;
}
