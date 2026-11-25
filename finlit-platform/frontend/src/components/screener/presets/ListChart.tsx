// Task #325 (developer file 25, section 1 row 2): List + chart, the default view of a screen. The companies on the left, the chart of the picked one on the
// right, open without covering anything; picking a row changes the chart, and the up and down arrows move the pick. The list keeps its scroll position.
// Task #394 (developer file 37, C11): a row whose chart ends before the list's day gets a mark on its own line under it ("Chart to 20 Nov"), spanning the
// name, price and level columns, so nothing in the row moves. The chart's last candle is the price answer's (told by the panel once it has it); the list's
// day is the screen's asOf. A row says nothing until its chart is known, and nothing when its chart reaches the list's day.
import { useCallback, useEffect, useRef, useState } from "react";
import { ChartPanel, type PanelRow } from "../ChartPanel";
import { CoLogo } from "../../CoLogo";
import { nf, MINUS } from "../../../lib/format";
import { titleOf } from "../../../lib/companyLabel";
import type { PresetRow } from "../../../lib/presets";
import { chartToMark } from "../chartPanelParts";

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? MINUS : ""}${nf(Math.abs(v), 1)}%`;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function ListChart({ rows, pick, onPick, toPanel, figure, listDay = null }: {
  rows: PresetRow[]; pick: string | null; onPick: (symbol: string) => void; toPanel: (r: PresetRow) => PanelRow; /** the list's day (the screen's asOf) */ listDay?: string | null;
  /** the screen's own first figure: its label and how to show a row's value */ figure: { label: string; show: (r: PresetRow) => React.ReactNode } | null }) {
  const list = useRef<HTMLUListElement>(null);
  const [ends, setEnds] = useState<Record<string, string>>({});
  const onChartEnd = useCallback((sym: string, day: string) => setEnds((e) => (e[sym] === day ? e : { ...e, [sym]: day })), []);
  const cur = rows.find((r) => r.symbol === pick) ?? rows[0];
  const step = (dir: 1 | -1) => { const i = rows.findIndex((r) => r.symbol === cur?.symbol), n = rows[i + dir]; if (n) onPick(n.symbol); };
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView?.({ block: "nearest" });
    // task #394 (live check 25 Nov): when focus is in the list, it moves with the selection, so the row stepped away from keeps no focus ring (two rows looked picked)
    if (el && list.current?.contains(document.activeElement) && document.activeElement !== el) el.focus({ preventScroll: true });
  }, [cur?.symbol]);
  if (!cur) return null;
  return (
    <div className="psx-lc">
      <ul ref={list} className="psx-lc-list" role="listbox" aria-label="Companies on this screen">
        {rows.map((r) => {
          const on = r.symbol === cur.symbol, price = num(r.price), chg = num(r.ret_1d), mark = chartToMark(ends[r.symbol], listDay);
          return (
            <li key={r.symbol} role="option" aria-selected={on} className={on ? "is-on" : undefined} onClick={() => onPick(r.symbol)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(r.symbol); } }} tabIndex={on ? 0 : -1}>
              <CoLogo symbol={r.symbol} name={r.name} size={22} />
              <span className="psx-lc-n"><b>{titleOf(r as never)}</b><small>{(r.sector as string) || ""}</small></span>
              <span className="psx-lc-p">{price != null ? nf(price, 2) : MINUS}{chg != null && <small className={chg >= 0 ? "up" : "down"}>{signed(chg)}</small>}</span>
              {figure && <span className="psx-lc-f"><small>{figure.label}</small>{figure.show(r)}</span>}
              {mark && <span className="psx-lc-mk"><span>{mark}</span></span>}
            </li>);
        })}
      </ul>
      <ChartPanel key={cur.symbol} row={toPanel(cur)} onClose={() => undefined} onStep={step} inline onChartEnd={onChartEnd} />
    </div>);
}
