// IPO calendar, compact layout (task #307, developer file 17 v2): the pure parts of the page, so each rule is tested on its own.
// Names: the provider sends some names in capitals; they are shown in title case. GMP record: each listed issue's last grey-market premium against its
// listing price, sorted into what the GMP said (ranges) and how the listing compared with it (categories). Everything is worked out from
// /api/ipos/gmp-record?board=all; nothing is a forecast and nothing is advice.
import { issuePriceOf, listingMove, type GmpPoint, type Ipo } from "./ipo";

const SMALL = /\b(Of|And|The|For|In|On)\b/g;
/** "MAHANADI COALFIELDS LIMITED" → "Mahanadi Coalfields Limited". A name with any lower-case letter is the company's own spelling and is kept. */
export function titleCase(s: string): string {
  if (!s || /[a-z]/.test(s)) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(SMALL, (w) => w.toLowerCase()).replace(/^./, (c) => c.toUpperCase());
}
/** The name in a table or the timeline: title case, without "Limited" / "Ltd" at the end. */
export const shortName = (s: string | null | undefined): string => titleCase(String(s ?? "")).replace(/\s+(Limited|Ltd\.?)$/i, "");

const DAY = 86_400_000;
const d0 = (iso: string) => new Date(iso + "T00:00:00").getTime();
/** Listed within the last 30 days (31, so a listing a month ago today still counts, as the page always has). */
export const listedRecently = (r: Ipo, now = Date.now()) => r.status === "listed" && now - d0(r.listingDate || r.closeDate) < 31 * DAY;
/** The order of each section: upcoming by opening date (soonest first); listed by listing date, newest first, same day by opening date; the others newest first. */
export function sectionOrder(status: Ipo["status"]) {
  return (a: Ipo, b: Ipo) => status === "upcoming" ? d0(a.openDate) - d0(b.openDate)
    : status === "listed" ? (d0(b.listingDate || b.closeDate) - d0(a.listingDate || a.closeDate)) || (d0(b.openDate) - d0(a.openDate))
      : d0(b.openDate) - d0(a.openDate);
}

// ------------------------------------------------------------------------------------------------ the Listed table's sorting (task #329)
/** The seven columns of "Listed in the last 30 days", sortable the way the all-IPOs table is (developer files 28 and 29): figures high to low first,
 *  text A to Z first, blanks last whichever way, and issues still in the market (no listing date) on top when sorted by Listed. */
export type LSortKey = "name" | "date" | "issuePrice" | "issueSizeCr" | "subscription" | "gmp" | "listing";
export const LSORT_COLS: [LSortKey, string, string?][] = [["name", "Company"], ["date", "Listed"], ["issuePrice", "Issue price", "r"], ["issueSizeCr", "Issue size", "r"],
  ["subscription", "Subscribed", "r"], ["gmp", "GMP said", "r"], ["listing", "At listing", "r"]];
/** The direction a column sorts in on its first press: text A to Z, figures and dates high to low. */
export const firstDir = (k: LSortKey): "asc" | "desc" => (k === "name" ? "asc" : "desc");
const lval = (r: Ipo, k: LSortKey): string | number | null => {
  switch (k) {
    case "name": return shortName(r.name).toLowerCase();
    case "date": return r.listingDate ? d0(r.listingDate) : null;
    case "issuePrice": return issuePriceOf(r);
    case "issueSizeCr": return r.issueSizeCr;
    case "subscription": return r.details?.subscription?.overall ?? null;
    case "gmp": return r.details?.gmp?.pct ?? null;
    case "listing": return listingMove(r)?.pct ?? null;
  }
};
export function sortListed(rows: Ipo[], k: LSortKey, dir: "asc" | "desc"): Ipo[] {
  const sign = dir === "asc" ? 1 : -1, tie = sectionOrder("listed");
  const live = (r: Ipo) => r.status !== "listed";
  return [...rows].sort((a, b) => {
    if (k === "date" && live(a) !== live(b)) return live(a) ? -1 : 1;
    const x = lval(a, k), y = lval(b, k);
    if (x == null && y == null) return tie(a, b);
    if (x == null) return 1;
    if (y == null) return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * sign || tie(a, b);
  });
}

// ------------------------------------------------------------------------------------------------ the GMP record
export type GCat = "short" | "band" | "beat" | "cap";
export const GV: Record<GCat, string> = { beat: "Listed higher", band: "Within 5 points", short: "Listed lower", cap: "Opened at the +90% cap" };
export type GRangeKey = "neg" | "zero" | "r0" | "r10" | "r25" | "r50" | "r90";
export const GR: [GRangeKey, string][] = [["neg", "Below 0%"], ["zero", "0%"], ["r0", "0–10%"], ["r10", "10–25%"], ["r25", "25–50%"], ["r50", "50–90%"], ["r90", "90% and above"]];
/** The range of what the GMP said (a percent of the issue price). */
export const gRange = (g: number): GRangeKey => g < 0 ? "neg" : g === 0 ? "zero" : g < 10 ? "r0" : g < 25 ? "r10" : g < 50 ? "r25" : g < 90 ? "r50" : "r90";
/** NSE (since July 2024) and BSE cap an SME issue's opening price at +90% of the issue price. */
export const isCap = (e: Pick<GmpPoint, "board" | "listingPct">) => e.board === "sme" && Math.abs(e.listingPct - 90) < 0.6;
/** How the listing compared with the GMP: within 5 points, higher, lower, or (an SME issue with a GMP above 85% that opened at the cap) at the cap. */
export const gCat = (e: Pick<GmpPoint, "board" | "listingPct" | "gmpPct">): GCat => {
  const v = e.listingPct - e.gmpPct;
  return isCap(e) && e.gmpPct > 85 ? "cap" : Math.abs(v) <= 5 ? "band" : v > 5 ? "beat" : "short";
};

export type GBoard = "all" | "mainboard" | "sme";
export type GFilters = { board: GBoard; year: string; size: string; sub: string; range: GRangeKey | "" };
export const GF0: GFilters = { board: "all", year: "all", size: "any", sub: "any", range: "" };
export const GY: [string, string][] = [["all", "All years"], ["2026", "2026"], ["2025", "2025"], ["old", "Before 2025"]];
export const GZ: [string, string][] = [["any", "Any issue size"], ["lt100", "Under ₹100 Cr"], ["100to1000", "₹100 – 1,000 Cr"], ["gt1000", "Above ₹1,000 Cr"]];
export const GS: [string, string][] = [["any", "Any subscription"], ["lt10", "Under 10x"], ["10to50", "10x – 50x"], ["50to100", "50x – 100x"], ["gt100", "Above 100x"]];
const subOk = (v: number | null, t: string) => t === "any" || (v != null && (t === "lt10" ? v < 10 : t === "10to50" ? v >= 10 && v < 50 : t === "50to100" ? v >= 50 && v < 100 : v >= 100));
const sizeOk = (v: number | null, t: string) => t === "any" || (v != null && (t === "lt100" ? v < 100 : t === "100to1000" ? v >= 100 && v <= 1000 : v > 1000));
/** Does an issue pass the filters? `skip` leaves one filter out (a dropdown counts its own options with the others on). */
export function gPass(e: GmpPoint, f: GFilters, skip?: keyof GFilters): boolean {
  const y = (e.listingDate || "").slice(0, 4);
  return (skip === "board" || f.board === "all" || e.board === f.board)
    && (skip === "year" || f.year === "all" || (f.year === "old" ? y < "2025" : y === f.year))
    && (skip === "size" || sizeOk(e.issueSizeCr, f.size))
    && (skip === "sub" || subOk(e.subscription, f.sub))
    && (skip === "range" || !f.range || gRange(e.gmpPct) === f.range);
}
export const median = (a: number[]): number | null => {
  const t = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!t.length) return null;
  const m = t.length >> 1;
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
};
export type GTally = Record<GCat, number> & { n: number; gap: number | null; abs: number | null };
/** Counts by category, the median gap (listing − GMP, in points) and the typical gap (the median of its size). */
export function gTally(list: GmpPoint[]): GTally {
  const t: GTally = { n: list.length, beat: 0, band: 0, short: 0, cap: 0, gap: null, abs: null };
  for (const e of list) t[gCat(e)]++;
  t.gap = median(list.map((e) => e.listingPct - e.gmpPct));
  t.abs = median(list.map((e) => Math.abs(e.listingPct - e.gmpPct)));
  return t;
}
export const share = (a: number, n: number) => (n ? Math.round((a / n) * 100) + "%" : "—");
