// The cards and quick-sort pills above the scheme table: how the schemes shown did, in one glance, and a way to read the table in a chosen order.
import { SORT_PILLS, summarise } from "../lib/mfSummary";
import { aumText, pctText, terText, type FundRow, type ListQuery } from "../lib/mf";

/** The six tiles above the table (task #130 C-7): each has a label, its number and a short line saying in words what the number means. */
export function SummaryCards({ items, total, plan = "Direct", scope = "in the chosen categories" }: { items: FundRow[]; total: number; plan?: string; scope?: string }) {
  const s = summarise(items);
  if (!s.n) return null;
  const plans = plan === "Direct" ? "Direct plans" : plan === "Regular" ? "Regular plans" : "all plans";
  return (
    <div className="mf-sum" role="group" aria-label="Summary of the schemes on this page">
      <div className="mf-sc t-blue"><small>Schemes</small><b>{total.toLocaleString("en-IN")}</b><span>{scope}</span></div>
      <div className="mf-sc t-green"><small>Rose over 1 year</small><b className="pos">{s.up1y}<em> of {s.withR1y}</em></b><span>on this page gained in a year</span></div>
      <div className="mf-sc t-amber"><small>Median return</small>
        <b>{s.median1y == null ? "—" : pctText(s.median1y, 1)}</b><span>a year{s.median3y != null && <> · 3Y {pctText(s.median3y, 1)}</>}{s.median5y != null && <> · 5Y {pctText(s.median5y, 1)}</>}</span></div>
      <div className="mf-sc t-teal"><small>Median 3-year SIP</small><b>{s.medianSip3y == null ? "—" : pctText(s.medianSip3y, 1)}</b><span>{s.withSip ? "a year, on monthly investing" : "still being worked out"}</span></div>
      <div className="mf-sc t-grey"><small>Median expense</small><b>{s.medianTer == null ? "—" : terText(s.medianTer)}</b><span>{s.withTer ? `a year, ${plans}` : "still being worked out"}</span></div>
      <div className="mf-sc t-blue"><small>Largest fund</small><b>{s.largestAum ? aumText(s.largestAum.aum) : "—"}</b><span title={s.largestAum?.name}>{s.largestAum ? s.largestAum.name : "still being worked out"}</span></div>
    </div>
  );
}

export function SortPills({ q, onSort }: { q: ListQuery; onSort: (key: ListQuery["sort"], dir: "asc" | "desc") => void }) {
  return (
    <div className="mf-pills" role="group" aria-label="Read the table in this order">
      <span className="mf-pl">Order by</span>
      {SORT_PILLS.map((p) => { const on = q.sort === p.key && q.dir === p.dir; return <button key={p.key} type="button" className={on ? "on" : ""} aria-pressed={on} onClick={() => onSort(p.key, p.dir)}>{p.label}</button>; })}
    </div>
  );
}

/** Shown while fund size, expense ratio, SIP returns and the checklist are still being worked out after an update (they fill in on their own). */
export function LoadingNotice() {
  return <p className="mf-note" role="status"><span><b>Fund size, expense ratio, SIP returns and the checklist are being worked out.</b> They fill in by themselves a little while after each update (the first run reads about five years of month-end NAVs). Returns and NAVs are shown now.</span></p>;
}
