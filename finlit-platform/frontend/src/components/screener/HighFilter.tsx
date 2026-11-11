// "Down from 52-week high" filter of both score screeners (task #60): how far the price is below its 52-week high, in percent (0 = at the high). Min and max boxes plus quick picks.
import { useId } from "react";
import type { Screener } from "./useScreener";

const PICKS: { label: string; min: number | null; max: number | null }[] = [
  { label: "At or near the high (up to 5%)", min: null, max: 5 }, { label: "Up to 10% down", min: null, max: 10 }, { label: "Up to 20% down", min: null, max: 20 }, { label: "30% or more down", min: 30, max: null },
];
export const highActive = (s: Screener) => (s.draft.ranges.dh.min != null || s.draft.ranges.dh.max != null ? 1 : 0);

export function HighFilter({ s }: { s: Screener }) {
  const { draft, problems, setRange } = s, r = draft.ranges.dh, id = useId();
  const on = (p: (typeof PICKS)[number]) => r.min === p.min && r.max === p.max;
  const pick = (p: (typeof PICKS)[number]) => { const off = on(p); setRange("dh", "min", off || p.min == null ? "" : String(p.min)); setRange("dh", "max", off || p.max == null ? "" : String(p.max)); };
  return (
    <div className="sx-high">
      <p className="sx-note" id={id}>How far the price is below its 52-week high. 0% means at the high. Companies with no 52-week high yet are left out while this is set.</p>
      <div className="sx-range" role="group" aria-label="Down from 52-week high, percent, exact range" aria-describedby={id}>
        <label>From (%)<input type="number" inputMode="decimal" min={0} max={100} step={1} value={r.min ?? ""} onChange={(e) => setRange("dh", "min", e.target.value)} placeholder="0" aria-invalid={!!problems.dh} /></label>
        <span aria-hidden="true">to</span>
        <label>Up to (%)<input type="number" inputMode="decimal" min={0} max={100} step={1} value={r.max ?? ""} onChange={(e) => setRange("dh", "max", e.target.value)} placeholder="100" aria-invalid={!!problems.dh} /></label>
        {problems.dh && <p className="sx-err" role="alert">{problems.dh.replace("Use numbers from 0 to 100.", "Use percentages from 0 to 100.")}</p>}
      </div>
      <div className="pzs-chips" role="group" aria-label="Quick picks">{PICKS.map((p) => <button key={p.label} type="button" className={"fgx-chip" + (on(p) ? " is-on" : "")} aria-pressed={on(p)} onClick={() => pick(p)}>{p.label}</button>)}</div>
    </div>
  );
}

/** The same filter as a visible bar just above the results table, so it is not buried in the long side panel (task #60). */
export function HighBar({ s }: { s: Screener }) {
  return (
    <section className="sx-hibar" aria-labelledby="sx-hibar-t">
      <h3 id="sx-hibar-t">Down from 52-week high{highActive(s) > 0 && <span className="sx-hibar-on">On</span>}</h3>
      <HighFilter s={s} />
    </section>
  );
}
