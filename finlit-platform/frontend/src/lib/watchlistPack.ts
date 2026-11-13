// Words of the Watchlists page as the "FinLit final pages" pack draws it (board 16, 13 Nov 2026): the five tiles, the insight cards, the groups and the
// "Price and business disagree" cards, all from the real figures (the screener's universe row and the weekly Leader / In line / Laggard label of
// /api/leadership/list). Pure functions, tested in watchlistPack.test.ts against the pack's own sentences. Describes, never advises.
import { capBucket } from "./capBuckets";
import type { Card } from "./pulsePack";

export type LeadLabel = "leader" | "in_line" | "laggard";
/** One stock's answer from /api/leadership/list. */
export type ListLead =
  | { available: true; label: LeadLabel; rank: number; ranked: number; group: string; groupName?: string | null; sector: string | null; sectorKind?: string | null; rel52: number | null;
      fundamentalRank: number | null; fundamentalOf: number | null; fundamentalNote: "below_peers" | "stronger_than_price" | null; stale?: boolean }
  | { available: false; reason: string; text: string };
export type ListLeadFeed = { available: true; asOf: string; rows: Record<string, ListLead> } | { available: false; reason: string };

/** What the page needs of a stock: the universe row's figures, the plan's score and its word, and the peer label. */
export type Item = { symbol: string; name: string; sector: string | null; marketCap: number | null; change: number | null; score: number | null; word: string | null; lead: ListLead | null };

export const PEER_HELP = "Leader, In line, Laggard. Each share's price over the last 12 months is compared with similar companies and with its sector index. Leader: among the strongest of its group and ahead of the index. Laggard: among the weakest and behind it. It describes the past, not the future.";
export const HELP = {
  pe: "P/E. The share price divided by a year's profit per share: how many years of today's profit you pay for.",
  roe: "ROE. Profit as a share of the money owners have put in. Higher means the company makes more from each rupee.",
  size: "Company size. FinLit uses three sizes everywhere, by market value: Large above ₹50,000 Cr, Mid ₹10,000 to 50,000 Cr, Small below ₹10,000 Cr.",
  // the pack's own words name the old score; the owner's rule calls it FinLit IQ everywhere (noFinlitScoreWord.test.ts), so the line says what it is without the old name
  iq: "FinLit IQ. The company's overall score on FinLit, from 0 to 100.",
  prism: "FinLit Prism. FinLit's advanced rating of the company's financial health, from 0 to 100.",
  target: "Target. A price you set as a reminder for yourself. It is not a prediction.",
};
export const DISAGREE_SUB = "The peer tag is about the share price. The business score ranks the company's results and balance sheet within the same group.";
export const DISAGREE_WHY = "When the price is far ahead of the business, the market may be expecting a lot. It is a prompt to read the report, not a call to act.";
export const PAGE_DESC = "The companies you are keeping an eye on: how they are doing, how they compare with their peers, and what to look at next.";
export const PLAIN = "lists, notes and targets are saved in this browser. Targets are your own reminders, not predictions; FinLit does not tell you when to buy or sell.";
export const ALERT_SUB = "An alert when a stock on this list becomes a Leader, In line or a Laggard, sent after the weekly check.";

const NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** A count in words up to twelve, then figures ("three", "13"). */
export const inWords = (n: number) => (n >= 0 && n < NUM.length ? NUM[n] : String(n));
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const ordinal = (n: number): string => `${n}${n % 100 >= 10 && n % 100 <= 20 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] || "th"}`;
/** "A", "A and B", "A, B and C". */
export const andList = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const pct1 = (x: number) => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(1) + "%";
/** A fraction as points with one decimal and a real minus: 1.524679 -> "+152.5". */
export const pts = (x: number) => { const v = Math.round(x * 1000) / 10; return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1); };
/** FinLit's three sizes as one word (lib/capBuckets.ts): Large above ₹50,000 Cr, Mid ₹10,000-50,000 Cr, Small below. */
export const sizeWord = (crore: number | null | undefined): "Large" | "Mid" | "Small" | null => { const b = capBucket(crore); return b ? (b.id === "large" ? "Large" : b.id === "mid" ? "Mid" : "Small") : null; };
const lead = (i: Item) => (i.lead && i.lead.available ? i.lead : null);

/** Tile 1: how many stocks, and how many of each size ("2 small · 1 mid company"). */
export function stocksTile(items: Item[]): { value: string; sub: string } {
  const n: Record<string, number> = {};
  for (const i of items) { const s = sizeWord(i.marketCap); if (s) n[s] = (n[s] || 0) + 1; }
  const keys = ["Large", "Mid", "Small"].filter((s) => n[s]).sort((a, b) => n[b] - n[a]);
  const parts = keys.map((s) => `${n[s]} ${s.toLowerCase()}`);
  return { value: String(items.length), sub: parts.length ? `${parts.join(" · ")} ${n[keys[keys.length - 1]] === 1 ? "company" : "companies"}` : "Size not known yet" };
}

/** Tile 2: the last session's moves, "1 up · 2 down", and each stock's change, weakest first (at most six named). */
export function dayTile(items: Item[]): { value: string; sub: string } {
  const moved = items.filter((i) => i.change != null) as (Item & { change: number })[];
  const up = moved.filter((i) => i.change > 0).length, down = moved.filter((i) => i.change < 0).length, flat = moved.length - up - down;
  const value = [`${up} up`, `${down} down`, ...(flat ? [`${flat} flat`] : [])].join(" · ");
  const list = [...moved].sort((a, b) => a.change - b.change), shown = list.slice(0, 6).map((i) => `${i.symbol} ${pct1(i.change)}`);
  const sub = moved.length ? shown.join(", ") + (list.length > 6 ? `, and ${list.length - 6} more` : "") : "No price change yet";
  return { value, sub };
}
/** The tile's name: "TODAY" while the market is open, otherwise the weekday of the last close ("ON FRIDAY"). */
export function dayName(asOf: string | null | undefined, open: boolean): string {
  if (open) return "Today";
  if (!asOf) return "Last session";
  return "On " + new Date(asOf + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" });
}

/** Tile 3: the average of the plan's score and the words under it ("All three Healthy", "2 Healthy · 1 Mixed"). */
export function scoreTile(items: Item[]): { value: string; sub: string } {
  const sc = items.filter((i) => i.score != null);
  if (!sc.length) return { value: "—", sub: items.length ? "Not scored yet" : "No stocks yet" };
  const avg = Math.round(sc.reduce((a, i) => a + (i.score as number), 0) / sc.length);
  const words: Record<string, number> = {};
  for (const i of sc) if (i.word) words[i.word] = (words[i.word] || 0) + 1;
  const ks = Object.keys(words).sort((a, b) => words[b] - words[a]);
  let sub = ks.length === 1 && words[ks[0]] === items.length ? `${items.length === 2 ? "Both" : `All ${inWords(items.length)}`} ${ks[0]}` : ks.map((k) => `${words[k]} ${k}`).join(" · ");
  if (items.length === 1 && ks.length === 1) sub = ks[0];
  const missing = items.length - sc.length;
  if (missing) sub += `${sub ? " · " : ""}${missing} not scored yet`;
  return { value: String(avg), sub };
}

/** Tile 4: "2 lead" and the rest in words ("1 not compared (under a year of prices)"). */
export function peersTile(items: Item[]): { value: string; sub: string } {
  const c = { leader: 0, in_line: 0, laggard: 0 }, why: Record<string, number> = {};
  for (const i of items) { const l = lead(i); if (l) c[l.label]++; else if (i.lead && !i.lead.available) why[i.lead.text] = (why[i.lead.text] || 0) + 1; else why["not checked yet"] = (why["not checked yet"] || 0) + 1; }
  const parts = [c.in_line ? `${c.in_line} in line` : "", c.laggard ? `${c.laggard} lag` : "", ...Object.entries(why).map(([t, n]) => `${n} not compared (${t.charAt(0).toLowerCase() + t.slice(1)})`)].filter(Boolean);
  return { value: `${c.leader} lead`, sub: parts.join(" · ") || (items.length ? "All compared" : "No stocks yet") };
}

/** Tile 5: the largest share of the list in one industry. */
export function concentrationTile(items: Item[]): { value: string; sub: string; top: string | null; n: number } {
  const m = new Map<string, number>();
  for (const i of items) if (i.sector) m.set(i.sector, (m.get(i.sector) || 0) + 1);
  const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top || !items.length) return { value: "—", sub: "No industry yet", top: null, n: 0 };
  return { value: `${Math.round((top[1] / items.length) * 100)}%`, sub: `in one industry: ${top[0].toLowerCase()}`, top: top[0], n: top[1] };
}

/** The insight cards over the table: price ahead of the business (Watch out), the business ahead of the price (Insight), most of the list in one industry
 *  (Warning), and stocks with no peer tag because they have under a year of prices (Insight). */
export function listCards(items: Item[]): Card[] {
  const out: Card[] = [];
  const ahead = items.filter((i) => { const l = lead(i); return l && l.fundamentalNote === "below_peers" && l.fundamentalRank != null; });
  if (ahead.length) out.push({ kind: "watch", title: "Price leads, the business lags", text: rankSentence(ahead, "price", "business score") + " Worth reading their reports to see why." });
  const behind = items.filter((i) => { const l = lead(i); return l && l.fundamentalNote === "stronger_than_price" && l.fundamentalRank != null; });
  if (behind.length) out.push({ kind: "insight", title: "The business leads, the price lags", text: rankSentence(behind, "business score", "price", true) + ` Worth reading ${behind.length === 1 ? "its report" : "their reports"} to see why.` });
  const c = concentrationTile(items);
  if (c.top && items.length >= 2 && c.n / items.length >= 0.5) out.push({ kind: "warning", title: `${cap1(c.n === items.length ? (items.length === 2 ? "both" : "all " + inWords(c.n)) : inWords(c.n) + " of " + inWords(items.length))} stocks in one industry`, text: `A downturn in ${c.top.toLowerCase()} would hit ${c.n === items.length ? "all" : "most"} of this list at once.` });
  const young = items.filter((i) => i.lead && !i.lead.available && i.lead.reason === "history");
  if (young.length) out.push({ kind: "insight", title: `${andList(young.slice(0, 3).map((i) => i.symbol))}${young.length > 3 ? ` and ${young.length - 3} more` : ""} ${young.length === 1 ? "has" : "have"} under a year of prices`, text: `With less than a year of share prices, ${young.length === 1 ? "it has" : "they have"} no peer tag yet. ${young.length === 1 ? "It gets one" : "Each gets one"} once ${young.length === 1 ? "it has" : "it has"} a full year of prices.` });
  return out;
}

/** "WHEELS and SSWL are 2nd and 3rd of 20 Auto Parts: OEM companies on price, but 16th and 18th on the business score." (one group), or one clause per stock. */
export function rankSentence(xs: Item[], first: "price" | "business score", second: "price" | "business score", business = false): string {
  const ls = xs.map((i) => ({ i, l: lead(i)! }));
  const r1 = (x: (typeof ls)[0]) => (business ? x.l.fundamentalRank! : x.l.rank), r2 = (x: (typeof ls)[0]) => (business ? x.l.rank : x.l.fundamentalRank!);
  const same = ls.every((x) => x.l.group === ls[0].l.group && x.l.ranked === ls[0].l.ranked);
  if (same) {
    const verb = ls.length === 1 ? "is" : "are";
    return `${andList(ls.map((x) => x.i.symbol))} ${verb} ${andList(ls.map((x) => ordinal(r1(x))))} of ${ls[0].l.ranked} ${ls[0].l.group} companies on ${first}, but ${andList(ls.map((x) => ordinal(r2(x))))} on the ${second}.`;
  }
  return ls.map((x) => `${x.i.symbol} is ${ordinal(r1(x))} of ${x.l.ranked} ${x.l.group} companies on ${first}, but ${ordinal(r2(x))} on the ${second}.`).join(" ");
}

/** The cards of "Price and business disagree": the price rank, the business rank and the 12-month gap to the sector benchmark. */
export type Disagree = { symbol: string; price: string; business: string; priceAhead: boolean; line: string | null };
export function disagree(items: Item[]): Disagree[] {
  return items.flatMap((i) => {
    const l = lead(i);
    if (!l || !l.fundamentalNote || l.fundamentalRank == null || l.fundamentalOf == null) return [];
    const bench = l.sectorKind === "peer_average" ? "the average of its peers" : l.sector || "its sector";
    return [{ symbol: i.symbol, price: `${l.rank} of ${l.ranked}`, business: `${l.fundamentalRank} of ${l.fundamentalOf}`, priceAhead: l.fundamentalNote === "below_peers",
      line: l.rel52 != null ? `Price ${pts(l.rel52)} pts vs ${bench} over 12 months.` : null }];
  });
}

/** The Against peers cell: the chip and the line under it ("2 of 20 Auto Parts: OEM", or "Under a year of prices"). */
export function peerCell(l: ListLead | null): { chip: string; tone: "good" | "bad" | "mid" | "none"; line: string } {
  if (!l) return { chip: "Not checked", tone: "none", line: "Weekly check not loaded" };
  if (!l.available) return { chip: "Not compared", tone: "none", line: l.text };
  return { chip: l.label === "leader" ? "Leader" : l.label === "laggard" ? "Laggard" : "In line", tone: l.label === "leader" ? "good" : l.label === "laggard" ? "bad" : "mid", line: `${l.rank} of ${l.ranked} ${l.group}` };
}

export type GroupBy = "peers" | "industry" | "size";
export const GROUP_SUB: Record<GroupBy, string> = {
  peers: "Grouped by how each stock did against its peers over 12 months.", industry: "Grouped by industry.", size: "Grouped by company size: Large, Mid and Small.",
};
const PEER_ORDER = ["Leaders", "In line", "Laggards", "Not compared"];
/** The group a stock falls in for each Group by button. */
export function groupOf(g: GroupBy, i: Item): string {
  if (g === "industry") return i.sector || "Industry not known";
  if (g === "size") return sizeWord(i.marketCap) ?? "Size not known";
  const l = lead(i);
  return !l ? "Not compared" : l.label === "leader" ? "Leaders" : l.label === "laggard" ? "Laggards" : "In line";
}
/** Groups in the pack's order: by peers Leaders, In line, Laggards, Not compared; by size Large, Mid, Small; by industry the largest first. */
export function groups<T extends Item>(g: GroupBy, items: T[]): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const i of items) { const k = groupOf(g, i); m.set(k, [...(m.get(k) || []), i]); }
  const order = g === "peers" ? PEER_ORDER : g === "size" ? ["Large", "Mid", "Small", "Size not known"] : null;
  return [...m.entries()].sort((a, b) => (order ? order.indexOf(a[0]) - order.indexOf(b[0]) : b[1].length - a[1].length || a[0].localeCompare(b[0])));
}
export const groupTone = (k: string): "good" | "bad" | "mid" | "none" => (k === "Leaders" ? "good" : k === "Laggards" ? "bad" : k === "In line" ? "mid" : "none");
