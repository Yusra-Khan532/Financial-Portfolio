// Task #322 (developer file 24, 22 Nov 2026): Market events & index. The page's formatting in one place, as the pack's reference asks:
// dates, index and company names in one style, the exchange boilerplate taken off an announcement, the routine notices, and the two
// counts the top tiles show (worked out from the dates, not from the supplier's status word).

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "22-Nov-2026" or "2026-11-22T15:10:00" -> "2026-11-22". */
export function iso(s: unknown): string {
  const t = String(s ?? "");
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(t);
  return m ? `${m[3]}-${String(MON.indexOf(m[2][0].toUpperCase() + m[2].slice(1).toLowerCase()) + 1).padStart(2, "0")}-${m[1]}` : t.slice(0, 10);
}
/** "22 Nov" */
export function dShort(s: unknown): string {
  const [, m, d] = iso(s).split("-");
  return d && m ? `${+d} ${MON[+m - 1]}` : "";
}
/** "22 Nov 2026" */
export const dLong = (s: unknown) => { const i = iso(s); return i.length === 10 ? `${dShort(i)} ${i.slice(0, 4)}` : ""; };
/** "15:10" from a date-time, or "" */
export const hhmm = (s: unknown) => { const m = /T?(\d{2}:\d{2})/.exec(String(s ?? "").slice(10)); return m ? m[1] : ""; };

/** Short forms kept in capitals when a name is put in one style. */
const KEEP = new Set(["IT", "EV", "BSE", "NSE", "PSU", "PSE", "MNC", "FPI", "VIX", "FMCG", "CPSE", "MAATR", "REIT", "SME", "IPO", "ESG", "AAA", "US", "UK", "II", "III", "LLP", "TMT", "CPSE", "SDL", "PSB"]);
/** Index and company names in one style: "NIFTY MIDCAP 100" -> "Nifty Midcap 100", "INDIA VIX" -> "India VIX", "Nifty 50" unchanged. */
export function nice(s: unknown): string {
  return String(s ?? "").split(" ").map((w) => w.split("-").map((p) =>
    p.length > 1 && p === p.toUpperCase() && /[A-Z]/.test(p) && !KEEP.has(p.replace(/[^A-Z]/g, "")) ? p.charAt(0) + p.slice(1).toLowerCase() : p).join("-")).join(" ");
}

/** A shorter label for the longest category names. */
export const SHORT_CAT: Record<string, string> = { "Analysts/Institutional Investor Meet/Con. Call Updates": "Analyst meet or call" };
export const catLabel = (c: unknown) => SHORT_CAT[String(c ?? "")] ?? String(c ?? "");

/** Routine notices (hidden until asked for): meeting schedules, newspaper copies, trading-window and certificate filings. */
export const ROUTINE = /Analysts\/Institutional|Newspaper Publication|Trading Window|Certificate|Loss of Share|Duplicate Share|Postal Ballot|Record Date|Book Closure/i;

/** "X Limited has informed the Exchange about <what>" -> { co: "X Limited", what: "<What>" }; what only repeats the category -> "". */
export function split(r: { description?: unknown; category?: unknown; symbol?: unknown }): { co: string; what: string } {
  const desc = String(r.description ?? "").trim(), cat = String(r.category ?? "").trim();
  const m = /^(.*?) has (?:informed|submitted to) the Exchange(?: about| regarding| that)?\s*(.*)$/is.exec(desc);
  let what = m ? m[2].trim() : desc;
  const c = cat.toLowerCase();
  if (c && what.toLowerCase().startsWith(c) && what.length > c.length) what = what.slice(c.length).replace(/^[\s:,.-]+/, "");
  if (!what || what.toLowerCase() === c) what = "";
  return { co: m ? m[1].trim() : String(r.symbol ?? ""), what: what ? what.charAt(0).toUpperCase() + what.slice(1) : "" };
}

type Ipo = { start_date?: unknown; end_date?: unknown; ipo_status?: unknown };
/** IPOs open now and upcoming, from the dates: open only while today is between its open and close dates (the supplier's "Live" stayed on an
 *  issue two days after it closed). Without dates, the status word is used. */
export function ipoCounts(rows: readonly Ipo[], today: string): { open: number; soon: number } {
  let open = 0, soon = 0;
  for (const r of rows) {
    const a = iso(r.start_date), b = iso(r.end_date);
    if (a.length === 10 && b.length === 10) { if (a <= today && today <= b) open++; else if (a > today) soon++; }
    else if (/open|live|current/i.test(String(r.ipo_status ?? ""))) open++;
    else if (/upcoming|forthcoming/i.test(String(r.ipo_status ?? ""))) soon++;
  }
  return { open, soon };
}

/** Results due in the next seven days (today included), and those after that. */
export function resultCounts(rows: readonly { expected_result_date?: unknown }[], today: string): { week: number; later: number } {
  const end = new Date(Date.parse(today + "T00:00:00Z") + 6 * 864e5).toISOString().slice(0, 10);
  let week = 0, later = 0;
  for (const r of rows) { const x = iso(r.expected_result_date); if (x.length !== 10 || x < today) continue; if (x <= end) week++; else later++; }
  return { week, later };
}

/** Today in India, as yyyy-mm-dd. */
export const todayIST = (now = new Date()) => new Date(now.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);

/** The five sections, in the pack's order; the page opens on Announcements. Old addresses of the two removed calendars lead to their pages. */
export const MK_TABS = [
  { id: "announcements", label: "Announcements" }, { id: "transcripts", label: "Call transcripts" }, { id: "indices", label: "Indices" },
  { id: "valuations", label: "Index in detail" }, { id: "commodities", label: "Commodity indices" },
] as const;
export type MkTab = (typeof MK_TABS)[number]["id"];
export const MOVED: Record<string, string> = { ipo: "/ipo", results: "/results" };
