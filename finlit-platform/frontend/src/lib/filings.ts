// Section 18 "News and filings" (task #222, 19 Nov pack S1): the company's NSE announcements (GET /api/stocks/{symbol}/events -> announcements[]), sorted
// into groups by the pack's rules (reference/S1-filing-groups.json: in order, first match wins; the NSE category first, then the filing text for the
// generic "General Updates" / "Updates" categories), with cleaned titles, the latest filing in each group and the "In simple words" line.
// Pure functions; the section is stock/NewsSection.tsx. Every word describes what was filed; nothing advises.
import type { Action, Announcement } from "./api";

export type GroupKey = "res" | "div" | "inv" | "ord" | "shr" | "oth";
export const GROUPS: { key: GroupKey; label: string; colour: string }[] = [
  { key: "res", label: "Results & board meetings", colour: "var(--k1)" },
  { key: "div", label: "Dividends & corporate actions", colour: "var(--gold-deep)" },
  { key: "inv", label: "Investor calls & presentations", colour: "var(--k7)" },
  { key: "ord", label: "Orders & agreements", colour: "var(--k3)" },
  { key: "shr", label: "Shares & fund raising", colour: "var(--k2)" },
  { key: "oth", label: "Other", colour: "var(--muted)" },
];
export const GROUP: Record<GroupKey, { label: string; colour: string }> = Object.fromEntries(GROUPS.map((g) => [g.key, g])) as unknown as Record<GroupKey, { label: string; colour: string }>;

type Rule = { cat?: RegExp; text?: RegExp; group: GroupKey; routine?: boolean };
const RULES: Rule[] = [
  { cat: /certificate under sebi|trading window|newspaper|compliance certificate|loss of share|duplicate share/i, group: "oth", routine: true },
  { cat: /outcome of board meeting|board meeting intimation|financial result/i, group: "res" },
  { cat: /^dividend|record date|bonus|split|buyback|rights/i, group: "div" },
  { cat: /analysts|investor presentation|con\. call|press release/i, group: "inv" },
  { cat: /bagging|order|arrangements for strategic|acquisition|joint venture|tie up/i, group: "ord" },
  { cat: /allotment|qualified institutional|preferential|fund raising|issue of securities/i, group: "shr" },
  { text: /placement|preferential|fund raising|allot|equity shares/i, group: "shr" },
  { text: /dividend|\btds\b|record date/i, group: "div" },
  { text: /order|contract|agreement/i, group: "ord" },
];

export type Filing = Announcement & { group: GroupKey; routine: boolean; title: string; i: number };

/** The group of one filing, and whether it is routine (hidden until asked for). */
export function groupOf(a: Pick<Announcement, "category" | "description">): { group: GroupKey; routine: boolean } {
  for (const r of RULES) {
    if ((r.cat && r.cat.test(a.category || "")) || (r.text && r.text.test(a.description || ""))) return { group: r.group, routine: !!r.routine };
  }
  return { group: "oth", routine: false };
}

/** "TD Power Systems Limited has informed the Exchange about Link of Recording" -> "Link of Recording"; 7741935 -> 77,41,935. */
export function cleanTitle(text: string): string {
  let t = (text || "").replace(/\s+/g, " ").trim();
  t = t.replace(/^.*?\b(?:Limited|Ltd\.?)\s+has\s+(?:informed|intimated)\s+the\s+Exchange\s*(?:about|regarding|that)?\s*[-:,]?\s*/i, "")
       .replace(/^.*?\b(?:Limited|Ltd\.?)\s+has\s+submitted\s+to\s+the\s+Exchange\s*,?\s*/i, "");
  const quoted = /^['"‘“]/.test(t);
  t = t.replace(/^['"‘“]+/, "");
  if (quoted) t = t.replace(/['"’”]+(\.?)$/, "$1");                 // the closing quote of a quoted subject ("…Basis'." -> "…Basis.")
  t = t.trim();
  t = t.replace(/^the\s+/i, "");
  t = t.replace(/\b\d{6,}\b/g, (n) => indian(Number(n)));
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}
const indian = (n: number) => n.toLocaleString("en-IN");

/** Every filing, newest first, grouped and titled; `i` is its place among the non-routine ones (the first 8 show by default). */
export function sortFilings(list: Announcement[]): Filing[] {
  const sorted = [...list].sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")));
  let k = 0;
  return sorted.map((a) => { const g = groupOf(a); return { ...a, ...g, title: cleanTitle(a.description), i: g.routine ? -1 : k++ }; });
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const parts = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return { y, m, d }; };
export const dayMon = (iso: string, year = true) => { const { y, m, d } = parts(iso); return `${d} ${MON[m - 1]}${year ? ` ${y}` : ""}`; };
export const monthHead = (ym: string) => { const { y, m } = parts(ym + "-01"); return `${MONTH[m - 1]} ${y}`; };
export const monShort = (iso: string) => MON[parts(iso).m - 1];
export const dayNum = (iso: string) => parts(iso).d;

/** A short tile title: whole words, up to `n` characters, then "…". */
export const clip = (t: string, n = 95) => (t.length <= n ? t : t.slice(0, t.lastIndexOf(" ", n) > 40 ? t.lastIndexOf(" ", n) : n).replace(/[,.;:\s]+$/, "") + "…");

/** The dividend in `actions` that a dividend filing announced: the first dividend dated on or after the filing, within 60 days. */
export function dividendFor(f: Pick<Filing, "date">, actions: Action[]): Action | null {
  const t = Date.parse(f.date);
  const hits = actions.filter((a) => a.type.endsWith("dividend") && Date.parse(a.date) >= t && Date.parse(a.date) - t <= 60 * 86_400_000);
  return hits.length ? hits.reduce((a, b) => (a.date < b.date ? a : b)) : null;
}

export type Highlight = { group: GroupKey; filing: Filing; title: string };
/** "Latest in each group": Results, Dividends, Shares & fund raising, Orders & agreements; Investor calls fills the place of an empty group.
 *  The dividend tile is the company's dividend filing (NSE category "Dividend" when there is one), titled from `actions`. */
export function highlights(fs: Filing[], actions: Action[]): Highlight[] {
  const live = fs.filter((f) => !f.routine);
  const newest = (g: GroupKey) => live.find((f) => f.group === g) ?? null;
  const out: Highlight[] = [];
  for (const g of ["res", "div", "shr", "ord"] as GroupKey[]) {
    let f = g === "div" ? (live.find((x) => x.group === "div" && /^dividend/i.test(x.category)) ?? newest("div")) : newest(g);
    let key = g;
    if (!f) { const used = new Set(out.map((h) => h.filing)); f = live.find((x) => x.group === "inv" && !used.has(x)) ?? null; key = "inv"; }
    if (!f) continue;
    let title = clip(f.title);
    if (key === "div") { const d = dividendFor(f, actions); if (d) title = `${d.title} · record date ${dayMon(d.date)}`; }
    out.push({ group: key, filing: f, title });
  }
  return out;
}

/** "In simple words" for 18: how many filings since when, and the latest results (with the dividend declared the same day). */
export function filingsPlain(company: string, fs: Filing[], actions: Action[]): string | null {
  const live = fs.filter((f) => !f.routine);
  if (!live.length) return null;
  const n = live.length, first = live[live.length - 1], last = live[0];
  let s = `${company} has made ${n} filing${n === 1 ? "" : "s"} with NSE since ${dayMon(first.date)}, the latest on ${dayMon(last.date, last.date.slice(0, 4) !== first.date.slice(0, 4))}.`;
  const res = live.find((f) => f.group === "res" && /financial result/i.test(f.description));
  if (res) {
    const m = /period ended\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i.exec(res.description) ?? /period ended\s+(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s,]+(\d{4})/i.exec(res.description);
    let period = "";
    if (m) {
      const [a, b, y] = [m[1], m[2], m[3]];
      const mon = MONTH.findIndex((x) => x.toLowerCase().startsWith((isNaN(Number(a)) ? a : b).slice(0, 3).toLowerCase()));
      const day = isNaN(Number(a)) ? b : a;
      if (mon >= 0) period = ` for the period ended ${Number(day)} ${MON[mon]} ${y}`;
    }
    const decl = live.find((f) => f.date === res.date && f.group === "div" && /^dividend/i.test(f.category));
    const dv = decl ? dividendFor(decl, actions) : null;
    const kind = dv ? (dv.type === "interim_dividend" ? "an interim dividend" : dv.type === "special_dividend" ? "a special dividend" : "a final dividend") : "";
    s += ` Its results${period} were filed on ${dayMon(res.date, false)}${dv && dv.amount != null ? `, with ${kind} of ₹${dv.amount} a share` : ""}.`;
  }
  return s;
}
