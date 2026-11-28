// The overview panel and quick-sort pills above the scheme table: how the schemes shown did, in one glance, and a way to read the table in a chosen order.
import type { ReactNode } from "react";
import { SORT_PILLS, summarise } from "../lib/mfSummary";
import { aumText, pctText, terText, type FundRow, type ListQuery } from "../lib/mf";
import { Icon } from "../lib/icons";
import { Info } from "../components/Info";

/** The six figures above the table (task #130 C-7). Since task #468 one "Fund Market Overview" panel in the team's design: the title with its (i),
 *  the count and data date on the right, then six equal cells split by thin lines, each with an icon tile, its number, a label and a short grey line. */
export function SummaryCards({ items, total, plan = "Direct", scope = "in the chosen categories", meta, about }: {
  items: FundRow[]; total: number; plan?: string; scope?: string; meta?: ReactNode; about?: string }) {
  const s = summarise(items);
  if (!s.n) return null;
  const plans = plan === "Direct" ? "Direct plans" : plan === "Regular" ? "Regular plans" : "all plans";
  const what = "Schemes counts every scheme that matches the filters; the other five figures describe the schemes on this page of the table, so they follow the filters and the order chosen."
    + (about ? " " + about : "");
  const cells: { icon: string; value: ReactNode; label: string; sub: ReactNode; title?: string }[] = [
    { icon: "layers", value: total.toLocaleString("en-IN"), label: "Schemes", sub: scope },
    { icon: "growth", value: <span className="pos">{s.up1y}<em> of {s.withR1y}</em></span>, label: "Rose over 1 year", sub: "on this page gained in a year" },
    { icon: "coins", value: s.median1y == null ? "—" : pctText(s.median1y, 1), label: "Median return",
      sub: <>a year{s.median3y != null && <> · 3Y {pctText(s.median3y, 1)}</>}{s.median5y != null && <> · 5Y {pctText(s.median5y, 1)}</>}</> },
    { icon: "bars", value: s.medianSip3y == null ? "—" : pctText(s.medianSip3y, 1), label: "Median 3-year SIP", sub: s.withSip ? "a year, on monthly investing" : "still being worked out" },
    { icon: "pie", value: s.medianTer == null ? "—" : terText(s.medianTer), label: "Median expense", sub: s.withTer ? `a year, ${plans}` : "still being worked out" },
    { icon: "medal", value: s.largestAum ? aumText(s.largestAum.aum) : "—", label: "Largest fund", sub: s.largestAum ? s.largestAum.name : "still being worked out", title: s.largestAum?.name },
  ];
  return (
    <section className="mf-ov468" aria-labelledby="mf-ov468-h">
      <header className="mf-ov468-head">
        <h2 id="mf-ov468-h">Fund Market Overview<Info g={{ key: "mf-ov468", label: "Fund Market Overview", what }} /></h2>
        {meta && <p className="mf-ov468-meta">{meta}</p>}
      </header>
      <div className="mf-ov468-row" role="group" aria-label="Summary of the schemes on this page">
        {cells.map((c) => (
          <div className="mf-ov468-cell" key={c.label}>
            <span className="mf-ov468-ic" aria-hidden="true"><Icon name={c.icon} /></span>
            <b className="mf-ov468-v">{c.value}</b>
            <span className="mf-ov468-l">{c.label}</span>
            <small className="mf-ov468-s" title={c.title}>{c.sub}</small>
          </div>))}
      </div>
    </section>
  );
}

/** Task #341 (prompt section 13): one "Order by" list holding every order, and the first three as quick buttons beside it (it was eight pills in a
 *  row that wrapped). The same eight orders and the same sorting; a column heading's own sort shows as "Sorted by a column heading" in the list. */
export const QUICK_SORTS = 3;
export function SortPills({ q, onSort }: { q: ListQuery; onSort: (key: ListQuery["sort"], dir: "asc" | "desc") => void }) {
  const cur = SORT_PILLS.findIndex((p) => q.sort === p.key && q.dir === p.dir);
  return (
    <div className="mf-pills" role="group" aria-label="Read the table in this order">
      <label className="mf-sortsel"><span className="mf-pl">Order by</span>
        <select value={cur < 0 ? "" : String(cur)} onChange={(e) => { const p = SORT_PILLS[+e.target.value]; if (p) onSort(p.key, p.dir); }}>
          {cur < 0 && <option value="" disabled>Sorted by a column heading</option>}
          {SORT_PILLS.map((p, i) => <option key={p.key + p.dir} value={String(i)}>{p.label}</option>)}
        </select></label>
      <span className="mf-qsorts" role="group" aria-label="Quick orders">
        {SORT_PILLS.slice(0, QUICK_SORTS).map((p) => { const on = q.sort === p.key && q.dir === p.dir; return <button key={p.key} type="button" className={on ? "on" : ""} aria-pressed={on} onClick={() => onSort(p.key, p.dir)}>{p.label}</button>; })}
      </span>
    </div>
  );
}

/** Shown while fund size, expense ratio, SIP returns and the checklist are still being worked out after an update (they fill in on their own). */
export function LoadingNotice() {
  return <p className="mf-note" role="status"><span><b>Fund size, expense ratio, SIP returns and the checklist are being worked out.</b> They fill in by themselves a little while after each update (the first run reads about five years of month-end NAVs). Returns and NAVs are shown now.</span></p>;
}
