// Latest results, the top of the page (task #194, pack finlit-latest-results-15nov): the six quarter tiles (coloured, with the change from the quarter before and a
// "By size" dropdown) and the quarter dropdown (one button; its menu shows how many companies each quarter has, and marks the partial ones). Figures are the server's.
import { useId, useRef, useState } from "react";
import { Link } from "react-router";
import { KitTiles, Chevron, useDismiss } from "../../pack/Kit";
import { useQuarterResults, type QResp } from "../../../lib/qresults";
import { longDate, type VSummary } from "../../../lib/resultsPack";
import { PARTIAL_UNDER, months, quarterTiles, type BySize, type Prev } from "../../../lib/quarterTiles";

const n0 = (v: number) => v.toLocaleString("en-IN");
type QItem = QResp["quarters"][number];

/** One quarter's whole-quarter totals for one size band (or the whole quarter): the page's own filters never change the tiles. */
function useTotals(quarter: string | undefined, cap?: string, on = true): VSummary | null | undefined {
  const r = useQuarterResults({ quarter, cap, limit: 1 }, on && !!quarter);
  if (!on || !quarter) return null;
  if (r.isPlaceholderData || !r.data) return r.isError ? null : undefined;   // undefined: still loading (never another quarter's figures); null: not available
  return (cap ? r.data.summary : r.data.totals) as VSummary;
}

export function QuarterTiles({ r }: { r: QResp | undefined }) {
  const q = r?.quarter, locked = !!r?.locked;
  const list = r?.quarters ?? [], at = list.findIndex((x) => x.key === q?.key), before = at >= 0 ? list[at + 1] : undefined;
  const large = useTotals(q?.key, "Large", !!q), mid = useTotals(q?.key, "Mid", !!q), small = useTotals(q?.key, "Small", !!q);
  const prevTotals = useTotals(before?.key, undefined, !!before && !locked);
  if (!r?.quarter || !q) return <div className="sx-skel sp-sec" role="status" aria-label="Loading the quarter's figures" />;
  const by: BySize = { Large: large, Mid: mid, Small: small };
  const prev: Prev = before ? { fiscal: before.fiscal, declared: before.declared, totals: prevTotals ?? null } : null;
  const t = r.totals as VSummary;
  const upd = r.updatedAt ? new Date(r.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : null;
  return (
    <section className="rs-kpis rs-qtiles" aria-label="The quarter so far">
      <KitTiles tiles={quarterTiles(t, prev, by, locked)} n={6} label="The quarter in six figures" />
      {locked && <p className="sp-note">The growth figures, shares and verdicts are part of the Silver plan. <Link to="/plans">See plans</Link>.</p>}
      <p className="sp-note">Quarter ended {longDate(q.periodEnd)} ({q.fiscal}){upd ? ` · updated ${upd} IST` : ""} · figures in ₹ crore · "typical" is the middle company (the median), so a few extreme results cannot distort it.</p>
    </section>
  );
}

/** "5,165 out · 10 due" */
const counts = (x: QItem) => `${n0(x.declared)} out${x.due ? ` · ${n0(x.due)} due` : ""}`;

/** The quarter: one button showing the chosen quarter; its menu lists every quarter with a bar for how many companies it has, and "Partial" under 500.
 *  Escape or a click outside closes it; the arrow keys move between quarters. */
export function QuarterPicker({ quarters, current, onPick }: { quarters: QItem[]; current: string | undefined; onPick: (key: string) => void }) {
  const [open, setOpen] = useState(false), btn = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), id = "rs-qm-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  useDismiss(open, () => setOpen(false), [btn, menu]);
  const cur = quarters.find((x) => x.key === current) ?? quarters[0], max = Math.max(1, ...quarters.map((x) => x.total));
  if (!cur) return <div className="rs-qdd"><span className="rs-qlab">Quarter</span><span className="rs-qbtn" aria-busy="true">Loading…</span></div>;
  const focusAt = (i: number) => (menu.current?.querySelectorAll<HTMLButtonElement>("[role=option]")[i])?.focus();
  const show = () => { setOpen(true); requestAnimationFrame(() => focusAt(Math.max(0, quarters.findIndex((x) => x.key === cur.key)))); };
  const key = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "ArrowDown") { e.preventDefault(); focusAt(Math.min(quarters.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusAt(Math.max(0, i - 1)); }
    else if (e.key === "Home") { e.preventDefault(); focusAt(0); } else if (e.key === "End") { e.preventDefault(); focusAt(quarters.length - 1); }
    else if (e.key === "Tab") setOpen(false);
  };
  return (
    <div className="rs-qdd">
      <span className="rs-qlab" id={id + "-l"}>Quarter</span>
      <button type="button" ref={btn} className="rs-qbtn" aria-haspopup="listbox" aria-expanded={open} aria-controls={id} aria-labelledby={`${id}-l ${id}-b`} id={id + "-b"}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); show(); } }}>
        <b>{cur.fiscal}</b><span>{months(cur.label)}</span><span className="c">{counts(cur)}</span><Chevron /></button>
      {open && <div ref={menu} id={id} className="rs-qmenu" role="listbox" aria-label="Quarter">
        <p className="rs-qhint">Bars show how many companies each quarter has. Older quarters are only partly loaded.</p>
        {quarters.map((x, i) => {
          const on = x.key === cur.key, partial = x.total < PARTIAL_UNDER;
          return <button key={x.key} type="button" role="option" aria-selected={on} className={"rs-qo" + (on ? " on" : "")} onKeyDown={(e) => key(e, i)}
            onClick={() => { setOpen(false); if (!on) onPick(x.key); btn.current?.focus(); }}>
            <span className="f"><b>{x.fiscal}</b> · {months(x.label)}</span>
            <span className="rs-qbar" aria-hidden="true"><i style={{ width: `${Math.max(2, (x.total / max) * 100)}%` }} /></span>
            <span className="c">{counts(x)}</span><span className="pt">{partial ? "Partial" : ""}</span>
          </button>;
        })}
      </div>}
    </div>
  );
}
