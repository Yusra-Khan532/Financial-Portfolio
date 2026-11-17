// Latest results: the six quarter tiles and the quarter menu (task #194, pack finlit-latest-results-15nov). Each tile's number is coloured by what it says, carries the
// change from the quarter before as a pill, and opens a "By size" table (Large / Mid / Small, and the quarter before for comparison). Every figure is the server's
// (GET /api/results/quarter: `totals`, and `summary` with &cap=); this file only words them. Describes, never advises.
import type { KitDetail, KitTileData, KitTone } from "../components/pack/Kit";
import type { VSummary } from "./resultsPack";
import { sp, VERDICTS } from "./resultsPack";

const n0 = (v: number) => v.toLocaleString("en-IN");
const pct = (v: number | null | undefined) => (v == null ? "–" : `${Math.round(v)}%`);
export const SIZES = ["Large", "Mid", "Small"] as const;
export type Size = (typeof SIZES)[number];
/** The quarter before, as the tiles compare with it: its fiscal name, how many companies it has declared, and its totals (null while loading or on Basic). */
export type Prev = { fiscal: string; declared: number; totals: VSummary | null } | null;
export type BySize = Partial<Record<Size, VSummary | null>>;

/** Under this many companies a quarter is "Partial" in the quarter menu (pack: Q1 FY26 has 3, Q4 FY25 has 2). */
export const PARTIAL_UNDER = 500;
/** "Jul to Sep 2026" -> "Jul–Sep 2026" */
export const months = (label: string) => label.replace(" to ", "–");

/** The pill: the change against the quarter before, in percentage points. */
export function pillOf(cur: number | null | undefined, prev: number | null | undefined, fiscal: string): KitTileData["pill"] {
  if (cur == null || prev == null) return null;
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return { text: `● no change vs ${fiscal}`, dir: "flat" };
  return { text: `${d > 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(1)} pt vs ${fiscal}`, dir: d > 0 ? "up" : "down", title: `${fiscal}: ${prev.toFixed(1)}%. Now: ${cur.toFixed(1)}%.` };
}
/** Growth: green above zero, red below. A share of companies: green from half up, gold under half ("gold where under half improved"). */
export const growthTone = (v: number | null | undefined): KitTone => (v == null ? "plain" : v > 0 ? "good" : v < 0 ? "bad" : "mid");
export const shareTone = (v: number | null | undefined): KitTone => (v == null ? "plain" : v >= 50 ? "good" : "mid");

/** "Q1 FY27 had only 1,643 companies loaded, so the change against it is a guide, not exact." when the quarter before holds far fewer companies than this one. */
export function guideNote(prev: Prev, declared: number): string {
  if (!prev || prev.declared >= declared * 0.8) return "";
  return `${prev.fiscal} had only ${n0(prev.declared)} companies loaded, so the change against it is a guide, not exact.`;
}
/** For a typical (median) figure: says when small companies pull it down or up by 10 points or more against large ones; otherwise what "typical" means. */
export function medianNote(large: number | null | undefined, small: number | null | undefined): string {
  if (large != null && small != null && Math.abs(large - small) >= 10)
    return `Small companies pull the typical figure ${small < large ? "down" : "up"}: ${sp(small)} against ${sp(large)} for large ones.`;
  return "The middle company in each group, so a few extreme results do not move it.";
}
const join = (...xs: string[]) => xs.filter(Boolean).join(" ");

type Key = "medianRevenueYoY" | "medianProfitYoY" | "profitUpShare" | "marginUpShare" | "beatShare";
function sizeTable(key: Key, by: BySize, prev: Prev, fmt: (v: number | null | undefined) => string): KitDetail["rows"] {
  const rows: KitDetail["rows"] = SIZES.map((s) => [s, by[s] === undefined ? "…" : fmt(by[s]?.[key])]);
  if (prev) rows.push([`${prev.fiscal} (all)`, prev.totals ? fmt(prev.totals[key]) : "…"]);
  return rows;
}

/** The six tiles. `locked` (Basic): the counts stay open; each figure says which plan opens it, never an empty dash. */
export function quarterTiles(t: VSummary, prev: Prev, by: BySize, locked = false): KitTileData[] {
  const due = Math.max(0, t.companies - t.declared);
  const banded = SIZES.reduce((a, s) => a + (by[s]?.companies ?? 0), 0), unbanded = t.companies - banded, sizesIn = SIZES.every((s) => by[s]);
  const guide = guideNote(prev, t.declared), pv = prev?.totals ?? null, pf = prev?.fiscal ?? "";
  const declared: KitTileData = {
    key: "declared", label: "Declared", value: n0(t.declared), of: `of ${n0(t.companies)}`, tone: "info", bar: t.companies ? (t.declared / t.companies) * 100 : null,
    sub: due ? `${n0(due)} still due` : "Every company has declared", help: `Companies that have announced results for the quarter. ${n0(t.withNumbers)} of them have full figures in so far.`,
    detailLabel: "By size",
    detail: { head: ["Size", "Declared", "Of"], rows: SIZES.map((s) => [s, by[s] ? n0(by[s]!.declared) : "…", by[s] ? n0(by[s]!.companies) : "…"]),
      note: sizesIn && unbanded > 0 ? `${n0(unbanded)} ${unbanded === 1 ? "company has" : "companies have"} no size band yet.` : undefined },
  };
  if (locked) {
    const shut = (key: string, label: string): KitTileData => ({ key, label, value: "Silver plan", tone: "plain", sub: "Opens with Silver" });
    return [declared, shut("rev", "Typical revenue growth"), shut("profit", "Typical profit growth"), shut("profitUp", "Profit up"), shut("margin", "Net margin up"), shut("beat", "Beat their industry")];
  }
  const median = (key: "medianRevenueYoY" | "medianProfitYoY", label: string, n: number | null, help: string): KitTileData => ({
    key, label, value: sp(t[key]), tone: growthTone(t[key]), pill: pv ? pillOf(t[key], pv[key], pf) : null, sub: `vs a year ago · ${n == null ? "–" : n0(n)} companies`, help,
    detailLabel: "By size", detail: { head: ["Size", label], rows: sizeTable(key, by, prev, (v) => sp(v)), note: join(sizesIn ? medianNote(by.Large?.[key], by.Small?.[key]) : "", guide) },
  });
  const share = (key: "profitUpShare" | "marginUpShare" | "beatShare", k: string, label: string, sub: string, help?: string, extra = ""): KitTileData => ({
    key: k, label, value: pct(t[key]), tone: shareTone(t[key]), pill: pv ? pillOf(t[key], pv[key], pf) : null, sub, help,
    detailLabel: "By size", detail: { head: ["Size", label], rows: sizeTable(key, by, prev, pct), note: join(extra, guide) || undefined },
  });
  const half = (v: number | null | undefined) => (v != null && v < 50 ? "of companies: fewer than half" : "of companies, vs a year ago");
  const vd = t.verdicts, verdictLine = vd ? VERDICTS.map((v) => `${v} ${n0(vd[v] ?? 0)}`).join(" · ") + "." : "";
  const MEDIAN = "The middle company when all declared results are lined up from best to worst (the median), so one extreme result cannot distort it.";
  return [
    declared,
    median("medianRevenueYoY", "Typical revenue growth", t.nRevenue, MEDIAN),
    median("medianProfitYoY", "Typical profit growth", t.nProfit, MEDIAN),
    share("profitUpShare", "profitUp", "Profit up", half(t.profitUpShare)),
    share("marginUpShare", "margin", "Net margin up", half(t.marginUpShare), "Net profit as a share of revenue, compared with a year ago. Up means each ₹100 of sales left more profit."),
    share("beatShare", "beat", "Beat their industry", "Strong or Good result", "Revenue growth, profit growth and margin change on a year ago are each compared with the typical company in the same NSE industry. Above on most of them: Strong or Good. Below on most: Weak or Poor. Company size does not change the yardstick.", verdictLine),
  ];
}
