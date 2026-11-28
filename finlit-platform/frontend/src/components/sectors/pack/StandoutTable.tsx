// Task #448 (developer file 42, 02 §6 and 03 §5): the standout stocks table, shared by Sector Pulse step 6 and the Full table's third tab.
// The site's own filters (All · Strong · Early · In my sectors) stay; every column sorts over all the standouts (first press: the column's natural
// order, second: the reverse, third: the site's order). Sorting first opens "Show the other N". On phones the rows read as cards and a "Sort by"
// select sits above them. Styles: styles/pulse448.css (.sx-so*, .sx-sorth).
import { useState } from "react";
import { Link } from "react-router";
import { CoLogo } from "../../CoLogo";
import type { Board, LeaderFlag } from "../../../lib/sectors";
import { belowHigh, howStrong, newHigh, short } from "../../../lib/pulsePack";
import { coTitle, shortLabel } from "../../../lib/companyLabel";
import { tw } from "../../../lib/groupWords";
import { Scroll, Tip } from "./Common";

type Col = "stock" | "group" | "strong" | "high" | "below";
type Dir = "first" | "rev";
type Sort = { col: Col; dir: Dir } | null;
type Pick = "all" | "Strong" | "Early" | "mine";

const HEAD: Record<Col, string> = { stock: "Stock", group: "Its industry", strong: "How strong", high: "New high", below: "Its industry is" };
/** The words of each column's two orders, as the "Sorted by" line and the phone select say them. */
const ORDERS: Record<Col, [string, string]> = {
  stock: ["A to Z", "Z to A"], group: ["A to Z", "Z to A"], strong: ["Strong first", "Early first"], high: ["newest first", "oldest first"], below: ["high to low", "low to high"],
};
/** aria-sort of the first press (the second is the other one). */
const ARIA_FIRST: Record<Col, "ascending" | "descending"> = { stock: "ascending", group: "ascending", strong: "descending", high: "descending", below: "descending" };
const COLS: Col[] = ["stock", "group", "strong", "high", "below"];

export function StandoutTable({ b, mine = new Set<string>(), first }: { b: Board; mine?: Set<string>; first: number }) {
  const [all, setAll] = useState(false), [pick, setPick] = useState<Pick>("all"), [sort, setSort] = useState<Sort>(null);
  const every = b.leader_flags ?? [];
  const rowOf = (x: LeaderFlag) => b.rows.find((g) => g.slug === x.group_slug);
  const below = (x: LeaderFlag) => { const v = rowOf(x)?.index_vs_52w_high; return v == null ? null : Math.max(0, -v); };
  const count = (k: Exclude<Pick, "all">) => every.filter((x) => (k === "mine" ? mine.has(x.group_slug) : howStrong(x) === k)).length;
  const f = every.filter((x) => pick === "all" || (pick === "mine" ? mine.has(x.group_slug) : howStrong(x) === pick));
  // the natural order of each column (first press); missing values always go last
  const key = (c: Col, x: LeaderFlag): string | number | null =>
    c === "stock" ? shortLabel(x) : c === "group" ? short(x.group) : c === "strong" ? (howStrong(x) === "Strong" ? 0 : 1) : c === "high" ? x.sessions_ago : below(x) == null ? null : -(below(x) as number);
  const sorted = !sort ? f : f.map((x, i) => ({ x, i })).sort((p, q) => {
    const a = key(sort.col, p.x), c = key(sort.col, q.x);
    if (a == null || c == null) return a == null && c == null ? p.i - q.i : a == null ? 1 : -1;
    const d = typeof a === "string" ? a.localeCompare(c as string, "en-IN", { sensitivity: "base" }) : a - (c as number);
    return (sort.dir === "first" ? d : -d) || p.i - q.i;
  }).map((y) => y.x);
  const open = all || pick !== "all" || sort != null;
  const shown = open ? sorted : sorted.slice(0, first);
  const press = (c: Col) => setSort((s) => (!s || s.col !== c ? { col: c, dir: "first" } : s.dir === "first" ? { col: c, dir: "rev" } : null));
  const head = (c: Col) => tw(HEAD[c]);
  const ariaSort = (c: Col) => (sort?.col !== c ? "none" : sort.dir === "first" ? ARIA_FIRST[c] : ARIA_FIRST[c] === "ascending" ? "descending" : "ascending");
  const selVal = sort ? `${sort.col}:${sort.dir}` : "";
  return (
    <>
      <div className="sx-fl" role="group" aria-label="Show"><span>Show</span>
        <button type="button" aria-pressed={pick === "all"} onClick={() => setPick("all")}>All <small>{every.length}</small></button>
        <button type="button" aria-pressed={pick === "Strong"} onClick={() => setPick("Strong")}>Strong <small>{count("Strong")}</small></button>
        <button type="button" aria-pressed={pick === "Early"} onClick={() => setPick("Early")}>Early <small>{count("Early")}</small></button>
        {mine.size > 0 && <button type="button" aria-pressed={pick === "mine"} onClick={() => setPick("mine")}>{tw("In my industries")} <small>{count("mine")}</small></button>}</div>
      <label className="sx-so-sel">Sort by<select value={selVal} onChange={(e) => { const [c, d] = e.target.value.split(":"); setSort(c ? { col: c as Col, dir: d as Dir } : null); }}>
        <option value="">Default order</option>
        {COLS.map((c) => <option key={c + "1"} value={`${c}:first`}>{head(c)}: {ORDERS[c][0]}</option>)}
        {COLS.map((c) => <option key={c + "2"} value={`${c}:rev`}>{head(c)}: {ORDERS[c][1]}</option>)}
      </select></label>
      {sort && <p className="sx-so-line" role="status">Sorted by <b>{head(sort.col)}</b>, {ORDERS[sort.col][sort.dir === "first" ? 0 : 1]}. <button type="button" className="sx-tlink" onClick={() => setSort(null)}>Clear sort</button></p>}
      {!f.length && <p className="sp-empty">No standout stock matches this filter.</p>}
      <Scroll label="standout stocks"><table className="sp-tb sp-stand sx-incards">
        <thead><tr>{COLS.map((c) => <th key={c} scope="col" aria-sort={ariaSort(c)} className="sx-sorth">
          <button type="button" aria-label={`Sort by ${head(c)}`} onClick={() => press(c)}>{head(c)}<span className="sx-arr" aria-hidden="true">{sort?.col !== c ? "↕" : ariaSort(c) === "ascending" ? "▲" : "▼"}</span></button>
          {c === "strong" && <Tip label="About “How strong”" text={tw("Strong: the industry is far below its own high, so the stock stands out the most. Early: the industry is a little less far below its high.")} />}</th>)}</tr></thead>
        <tbody>{shown.map((x) => { const r = rowOf(x), s = howStrong(x); return (
          <tr key={x.symbol + x.group_slug}>
            <td><Link to={`/stocks/${x.symbol}`} className="sp-sym big"><CoLogo symbol={x.symbol} size={26} inline /><b title={coTitle(x)}>{shortLabel(x)}</b></Link></td>
            <td data-label={head("group")}>{short(x.group)}</td>
            <td data-label={head("strong")}><span className="sp-chipw"><span className={"sp-chip " + (s === "Strong" ? "sp-st-bouncing" : "sp-st-sold_off")}>{s}</span><Tip text={s === "Strong" ? tw("Strong: its industry is far below its own 1-year high, so this stock stands out the most.") : tw("Early: its industry is a little less far below its own 1-year high.")} label={`About “${s}”`} /></span></td>
            <td data-label={head("high")} className="sp-good">{newHigh(x)}</td>
            <td data-label={head("below")}>{r?.index_vs_52w_high != null ? `${belowHigh(r.index_vs_52w_high)} its high` : "–"}</td></tr>); })}</tbody>
      </table></Scroll>
      {!open && f.length > first && <button type="button" className="sp-morebtn" aria-expanded={false} onClick={() => setAll(true)}>{`Show the other ${f.length - first} standout stocks ▾`}</button>}
      {all && pick === "all" && !sort && f.length > first && <button type="button" className="sp-morebtn" aria-expanded={true} onClick={() => setAll(false)}>Show fewer ▴</button>}
    </>
  );
}
