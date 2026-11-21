// Task #296 (the 21 Nov Discover filters pack, bucketRows.js): the calls and results bucket pages get the filters every other Discover list has, plus four of
// their own. A bucket's list (GET /api/discovery/sources?bucket=…) has no sector, size or Prism, so each company is joined to what Discover already loads:
// the screener universe (NSE classification, market value, FinLit Prism and the long-term trend as the plan sees them) and Sector Rotation by industry.
// Pure rules only; the page is Sources.tsx.
import type { Row as URow } from "../lib/screener";
import type { RotationRow } from "../lib/rotation";
import { sizeOfRow, type CompanySize } from "../lib/companySize";
import { daysOld, isUp, short, titleCase, type Corner, type SrcCompany, type TState } from "./model";

/** One company of a bucket, joined. `i` is the order the server sends (Best match); `s` / `n` are the names the shared filters use. */
export type BRow = SrcCompany & {
  i: number; s: string; n: string; mac: string | null; sct: string | null; ind: string | null; mc: number | null; sz: CompanySize | null;
  pl: string | null; pr: number | null; lt: string | null; cc: Corner | null; age: number | null;
};
export function bucketRows(list: SrcCompany[], uni: Map<string, URow>, rot: RotationRow[] | undefined, today: Date = new Date()): BRow[] {
  const cornerOf = new Map<string, Corner>();
  for (const g of rot ?? []) for (const ind of g.industries ?? []) if (!cornerOf.has(ind)) cornerOf.set(ind, g.corner as Corner);
  return list.map((c, i) => {
    const u = uni.get(c.symbol), ind = u?.cls_industry ?? null;
    return {
      ...c, i, s: c.symbol, n: short(c.company), mac: u?.cls_macro ?? null, sct: u?.cls_sector ?? null, ind,
      mc: u?.market_cap ?? null, sz: sizeOfRow(u ?? null), pl: titleCase(u?.prism_label ?? null), pr: u?.prism_final == null ? null : Math.round(u.prism_final),
      lt: u?.prism_lt ?? null, cc: ind ? cornerOf.get(ind) ?? null : null, age: daysOld(c.document?.date, today),
    };
  });
}

/** The bucket's own filters, kept in the address as kw, named, tone and filed. */
export type BState = { kw: string; named: string; tone: string; filed: string };
export const BKEYS = ["kw", "named", "tone", "filed"] as const;
export const freshB = (): BState => ({ kw: "", named: "", tone: "", filed: "" });
export const NAMED: [string, string][] = [["2", "2 or more"], ["3", "3 or more"], ["4", "4 or more"]];
export const FILED: [string, string][] = [["d7", "Last 7 days"], ["d30", "Last 30 days"], ["old", "More than 30 days ago"]];
export function passBucket(r: BRow, f: BState): boolean {
  if (f.kw && !r.keywords.includes(f.kw)) return false;
  if (f.named && (r.distinct ?? 0) < Number(f.named)) return false;
  if (f.tone && r.tone?.label !== f.tone) return false;
  if (f.filed) {
    if (r.age == null) return false;
    if (f.filed === "d7" && r.age > 7) return false;
    if (f.filed === "d30" && r.age > 30) return false;
    if (f.filed === "old" && r.age <= 30) return false;
  }
  return true;
}

/** The ready-made views of a bucket: one of its own, three the other lists have (the same keys and words). */
export const BUCKET_VIEWS: { k: string; t: string; f: (r: BRow) => boolean; gold?: boolean }[] = [
  { k: "fig", t: "Quotes a sentence with a figure", f: (r) => r.evidence.length > 0 },
  { k: "uptrend", t: "Long-term uptrend", f: (r) => isUp(r), gold: true },
  { k: "ahead", t: "Industry ahead and gaining", f: (r) => r.cc === "ahead_gaining" },
  { k: "prism", t: "Prism strong or healthy", f: (r) => r.pl === "Strong" || r.pl === "Healthy", gold: true },
];

/** The shared filters (Stage left out: a theme reading) and the bucket's own; the views on top unless `withViews` is false. */
export function filterBucket(rows: BRow[], S: TState, B: BState, onList: (s: string) => boolean, withViews = true): BRow[] {
  let a = rows.filter((r) => {
    if (S.size && r.sz !== S.size) return false;
    if (S.mac && r.mac !== S.mac) return false;
    if (S.sct && r.sct !== S.sct) return false;
    if (S.ind && r.ind !== S.ind) return false;
    if (S.lt) { if (S.lt === "none") { if (r.lt) return false; } else if (r.lt !== S.lt) return false; }
    if (S.pr && r.pl !== S.pr) return false;
    if (S.cn && r.cc !== S.cn) return false;
    if (S.mine && !onList(r.s)) return false;
    if (S.q) { const q = S.q.toLowerCase(); if (!(r.company.toLowerCase().includes(q) || r.s.toLowerCase().includes(q))) return false; }
    return passBucket(r, B);
  });
  if (withViews) for (const v of BUCKET_VIEWS) if (S.lenses.includes(v.k)) a = a.filter(v.f);
  return a;
}

/** Sort by: Best match is the server's order (score, then the rest). */
export const BUCKET_SORTS: { k: string; t: string; gold?: boolean; f: (a: BRow, b: BRow) => number }[] = [
  { k: "best", t: "Best match", f: (a, b) => a.i - b.i },
  { k: "named", t: "Most keywords named", f: (a, b) => (b.distinct ?? 0) - (a.distinct ?? 0) || (b.mentions ?? 0) - (a.mentions ?? 0) || a.i - b.i },
  { k: "mentions", t: "Most mentions", f: (a, b) => (b.mentions ?? 0) - (a.mentions ?? 0) || a.i - b.i },
  { k: "newest", t: "Newest filing first", f: (a, b) => (b.document?.date ?? "").localeCompare(a.document?.date ?? "") || a.i - b.i },
  { k: "mc", t: "Largest market value", f: (a, b) => (b.mc ?? -1) - (a.mc ?? -1) || a.i - b.i },
  { k: "prism", t: "FinLit Prism", gold: true, f: (a, b) => (b.pr ?? -1) - (a.pr ?? -1) || a.i - b.i },
  { k: "co", t: "Company name", f: (a, b) => a.n.localeCompare(b.n) },
];
export const sortBucket = (rows: BRow[], k: string) => rows.slice().sort((BUCKET_SORTS.find((x) => x.k === k) ?? BUCKET_SORTS[0]).f);

/** A feed of filings (theme and event pages) cut to the companies that pass the table's filters (`keep`), or the whole feed when no filter is on. */
export function feedFor<T extends { s: string }>(feed: T[], keep: Set<string> | null): T[] {
  return keep ? feed.filter((x) => keep.has(x.s)) : feed;
}
