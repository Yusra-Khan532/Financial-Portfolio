// The Mutual Fund Screener's result table. Plain numbers in one ink colour (no red / green): the screener describes figures, it does not grade them.
// Every dash has a reason in its tooltip. Columns follow the filters: a range set on a measure that has no column yet adds one, so you can see what you filtered by.
// Task #131: a tick box before each fund to compare up to 4 (the tray of /funds), a Mutual Fund Score column after the fund (Gold, the founder kept the plan;
// below Gold a lock, never a value), and the Fund column frozen while the table scrolls sideways.
import { Link } from "react-router";
import { HScroll } from "../../components/HScroll";
import { dateIN, MINUS, nf } from "../../lib/format";
import { aumText, categoryShort, navText, noReturnsText, pctText, terText } from "../../lib/mf";
import { figureOf, type ScreenRow, type SQ } from "../../lib/mfScreen";
import { NUM_BY, unitText } from "../../lib/mfScreenDefs";
import { PlanChip } from "../Bits";
import { ScoreCell } from "../ScoreCell";
import type { ScoreItem } from "../../lib/mfScore";

type Col = { id: string; label: string; sort?: string; field?: string; hint: string; cell: (r: ScreenRow) => string; why?: (r: ScreenRow) => string };
const noRet = (r: ScreenRow) => noReturnsText(r.noReturns) || "Not enough NAV history for this period.";
const noRisk = "Needs 37 consecutive month-end NAVs and a Growth option; younger funds, IDCW options and funds not yet worked out have none.";
const pct = (v: number | null | undefined, d = 1) => (v == null ? "" : pctText(v, d, false));

export const BASE_COLS: Col[] = [
  { id: "r1y", label: "1 year", sort: "r1y", field: "r1y", hint: "Total change in NAV over one year", cell: (r) => pct(r.r1y), why: noRet },
  { id: "r3y", label: "3 yrs a year", sort: "r3y", field: "r3y", hint: "Yearly rate (CAGR) over three years", cell: (r) => pct(r.r3y), why: noRet },
  { id: "r5y", label: "5 yrs a year", sort: "r5y", field: "r5y", hint: "Yearly rate (CAGR) over five years", cell: (r) => pct(r.r5y), why: noRet },
  { id: "ter", label: "Expense", sort: "ter", field: "ter", hint: "Total expense ratio of this plan, percent a year", cell: (r) => (r.ter == null ? "" : terText(r.ter)), why: () => "This plan is not in AMFI's latest expense-ratio file." },
  { id: "aum", label: "Size", sort: "aum", field: "aum", hint: "Fund size (AUM), all plans together", cell: (r) => (r.aum == null ? "" : aumText(r.aum)), why: () => "No fund size from AMFI or the fund house's portfolio file." },
  { id: "vol3", label: "Volatility 3 yrs", sort: "vol", field: "vol3", hint: "Annualised standard deviation of 36 month-end returns", cell: (r) => (r.x?.risk.vol3 == null ? "" : nf(r.x.risk.vol3, 1) + "%"), why: () => noRisk },
  { id: "fall", label: "Biggest fall", sort: "fall", field: "fall", hint: "Largest drop between month-end NAVs in the last 36 months", cell: (r) => (r.fall3y == null ? "" : pctText(r.fall3y, 1, false)), why: () => noRisk },
  { id: "rank3", label: "Rank 3 yrs", sort: "rank3y", hint: "Rank of the 3-year return among funds of the same category and plan (1 = highest)", cell: (r) => (r.x?.rank["3y"] ? `${r.x.rank["3y"]!.rank} of ${r.x.rank["3y"]!.of}` : ""), why: () => "Needs at least three funds of the same category and plan with a 3-year return." },
];
const BASE_FIELDS = new Set(BASE_COLS.map((c) => c.field).filter(Boolean) as string[]);
const SORT_OF: Record<string, string> = { r1y: "r1y", r3y: "r3y", r5y: "r5y", sip3y: "sip3y", sip5y: "sip5y", ter: "ter", aum: "aum", age: "age", fall: "fall", vol3: "vol", sharpe: "sharpe", ex3y: "ex3y", consist: "consist", r1m: "r1m", r6m: "r6m", ter_gap: "gap", worst_m: "worst", neg_share: "negshare", cy1: "cy1", down_dev: "downdev" };

/** The columns for this query: the base set plus one per range filter that has no column of its own yet. */
export function columnsFor(q: SQ): Col[] {
  const extra: Col[] = Object.keys(q.rng).filter((f) => !BASE_FIELDS.has(f) && NUM_BY[f]).map((f) => {
    const d = NUM_BY[f];
    return { id: "f:" + f, label: d.label.replace(/ \(.*$/, ""), sort: SORT_OF[f], field: f, hint: d.hint || d.label, cell: (r: ScreenRow) => { const v = figureOf(r, f); return v == null ? "" : unitText(d, v); },
      why: () => "This fund has no figure for this measure (see “N of M funds have this figure” under its slider)." };
  });
  return [...BASE_COLS, ...extra];
}

export type ScoreProps = { gold: boolean; items: Map<number, ScoreItem>; loading: boolean };
export type PickProps = { picked: number[]; onPick: (code: number) => void };
const NO_SCORE = "This plan has no Mutual Fund Score yet (IDCW options, funds younger than three years and some categories are not scored).";

export function ResultTable({ rows, q, onSort, loading, score, pick }: { rows: ScreenRow[]; q: SQ; onSort: (key: string) => void; loading: boolean; score: ScoreProps; pick: PickProps }) {
  const cols = columnsFor(q);
  const sorted = (k?: string) => (k && q.sort === k ? (q.dir === "asc" ? "ascending" : "descending") : k ? "none" : undefined);
  return (
    <HScroll className="mfs-tw" label="funds table">
      <table className={"mfs-table" + (loading ? " is-loading" : "")}>
        <caption className="sr-only">Mutual funds that match the filters. Use the column buttons to sort.</caption>
        <thead>
          <tr>
            <th scope="col" className="mfs-n" aria-sort={sorted("name")}><span className="mfs-nh"><span className="mfs-tick-h" title="Tick up to 4 funds to compare them">Compare</span><button type="button" className="mf-sort" onClick={() => onSort("name")}>Fund{q.sort === "name" && <i aria-hidden="true">{q.dir === "asc" ? "▲" : "▼"}</i>}</button></span></th>
            <th scope="col" className="mfs-hs" title="The Mutual Fund Score of this plan, 0 to 100, with its band" aria-sort={score.gold ? sorted("score") : undefined}>
              {score.gold ? <button type="button" className="mf-sort" onClick={() => onSort("score")}>Mutual Fund Score{q.sort === "score" && <i aria-hidden="true">{q.dir === "asc" ? "▲" : "▼"}</i>}</button> : "Mutual Fund Score"}</th>
            {cols.map((c) => (
              <th key={c.id} scope="col" className="num" title={c.hint} aria-sort={sorted(c.sort)}>
                {c.sort ? <button type="button" className="mf-sort" onClick={() => onSort(c.sort!)}>{c.label}{q.sort === c.sort && <i aria-hidden="true">{q.dir === "asc" ? "▲" : "▼"}</i>}</button> : c.label}</th>))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className={r.active ? "" : "mf-stopped"}>
              <th scope="row" className="mfs-n">
                <span className="mfs-nrow"><input type="checkbox" className="mfs-tick" checked={pick.picked.includes(r.code)} onChange={() => pick.onPick(r.code)} aria-label={`Compare ${r.name}`} />
                <span className="mfs-nm"><Link to={`/funds/${r.code}`}>{r.name}</Link>
                <small><span className="mf-house">{r.amc}</span><PlanChip plan={r.plan} option={r.option} />
                  {!r.active && <span className="chip ghost">Stopped publishing</span>}</small>
                <small className="mfs-nav"><span className="mfs-cat" title={r.category}>{categoryShort(r.category)}</span>{r.nav != null && <> · NAV <span className="mono">{navText(r.nav)}</span>{r.navDate ? ` on ${dateIN(r.navDate, { day: "numeric", month: "short" })}` : ""}</>}</small></span></span>
              </th>
              <td className="mfs-hs"><ScoreCell item={score.items.get(r.code)} locked={!score.gold} why={NO_SCORE} loading={score.loading} /></td>
              {cols.map((c) => { const t = c.cell(r); return <td key={c.id} className="num">{t ? t.replace("-", MINUS) : <span className="mf-na" title={c.why?.(r)} aria-label={`No figure. ${c.why?.(r) ?? ""}`}>—</span>}</td>; })}
            </tr>))}
        </tbody>
      </table>
    </HScroll>
  );
}
