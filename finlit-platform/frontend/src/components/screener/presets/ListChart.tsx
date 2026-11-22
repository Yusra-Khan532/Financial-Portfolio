// Task #325 (developer file 25, section 1 row 2): List + chart, the default view of a screen. The companies on the left, the chart of the picked one on the
// right, open without covering anything; picking a row changes the chart, and the up and down arrows move the pick. The list keeps its scroll position.
import { useEffect, useRef } from "react";
import { ChartPanel, type PanelRow } from "../ChartPanel";
import { CoLogo } from "../../CoLogo";
import { nf, MINUS } from "../../../lib/format";
import { titleOf } from "../../../lib/companyLabel";
import type { PresetRow } from "../../../lib/presets";

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? MINUS : ""}${nf(Math.abs(v), 1)}%`;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function ListChart({ rows, pick, onPick, toPanel, figure }: {
  rows: PresetRow[]; pick: string | null; onPick: (symbol: string) => void; toPanel: (r: PresetRow) => PanelRow;
  /** the screen's own first figure: its label and how to show a row's value */ figure: { label: string; show: (r: PresetRow) => React.ReactNode } | null }) {
  const list = useRef<HTMLUListElement>(null);
  const cur = rows.find((r) => r.symbol === pick) ?? rows[0];
  const step = (dir: 1 | -1) => { const i = rows.findIndex((r) => r.symbol === cur?.symbol), n = rows[i + dir]; if (n) onPick(n.symbol); };
  useEffect(() => { list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" }); }, [cur?.symbol]);
  if (!cur) return null;
  return (
    <div className="psx-lc">
      <ul ref={list} className="psx-lc-list" role="listbox" aria-label="Companies on this screen">
        {rows.map((r) => {
          const on = r.symbol === cur.symbol, price = num(r.price), chg = num(r.ret_1d);
          return (
            <li key={r.symbol} role="option" aria-selected={on} className={on ? "is-on" : undefined} onClick={() => onPick(r.symbol)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(r.symbol); } }} tabIndex={on ? 0 : -1}>
              <CoLogo symbol={r.symbol} name={r.name} size={22} />
              <span className="psx-lc-n"><b>{titleOf(r as never)}</b><small>{(r.sector as string) || ""}</small></span>
              <span className="psx-lc-p">{price != null ? nf(price, 2) : MINUS}{chg != null && <small className={chg >= 0 ? "up" : "down"}>{signed(chg)}</small>}</span>
              {figure && <span className="psx-lc-f"><small>{figure.label}</small>{figure.show(r)}</span>}
            </li>);
        })}
      </ul>
      <ChartPanel key={cur.symbol} row={toPanel(cur)} onClose={() => undefined} onStep={step} inline />
    </div>);
}
