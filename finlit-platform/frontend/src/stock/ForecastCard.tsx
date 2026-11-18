// Task #215 (Chinmay Jain, 17 Nov 2026): "in advanced report section 6 add a forecasting card as shown in the sample; when user clicks 3 then it shall show
// the 3rd year projection, same as for 1 and 5 too". Sits at the right of section 06's heading (under it on phones): Revenue (Forecast) and Profit
// (Forecast), the value for the chosen year with its rate, and 1Y · 3Y · 5Y chips that each show the past growth rate over that span. One press switches
// both halves, so the card always reads one year. Arithmetic on the accounts shown in section 06 (consolidated or standalone), never a prediction.
import { useMemo, useState } from "react";
import type { Financials } from "../lib/api";
import { Info } from "../components/Info";
import { Icon } from "../lib/icons";
import { cr, nf } from "../lib/format";
import { SPANS, firstSpan, project, type Projection, type Span } from "../lib/forecast";
import "../styles/forecast215.css";

const signedPct = (v: number) => `${v >= 0 ? "+" : "−"}${nf(Math.abs(v), 1)}%`;
const INFO = {
  key: "forecast-215", label: "Forecast",
  what: "For the year you choose, the figure the company would reach if it kept growing at its own past compound yearly rate. 1Y uses last year's growth and shows next year; 3Y uses the growth of the past 3 years and shows the 3rd year from now; 5Y the same over 5 years.",
  read: "Worked out as latest year × (1 + rate) for each year ahead, from the company's filed accounts shown in this section. Past growth does not say what will happen; it is not a prediction or a recommendation.",
};

function Half({ label, ps, span, pick }: { label: string; ps: Projection[]; span: Span; pick: (s: Span) => void }) {
  const p = ps.find((x) => x.span === span)!;
  return (
    <div className="fcst-h">
      <p className="fcst-l">{label} (Forecast)</p>
      <div className="fcst-v">
        {p.ok ? <><b>₹{cr(p.value)} Cr</b><span className={"fcst-c " + (p.rate >= 0 ? "up" : "down")}><span aria-hidden="true">{p.rate >= 0 ? "▲" : "▼"}</span> CAGR {nf(Math.abs(p.rate), 1)}%{p.rate < 0 ? " fall" : ""}</span></>
          : <b className="fcst-na">—</b>}
      </div>
      <p className="fcst-y">{p.ok ? `${p.year} · at the ${p.span}-year rate (${p.from} to ${p.to})` : p.why}</p>
      <div className="fcst-chips" role="group" aria-label={`${label}: past growth rate over 1, 3 and 5 years`}>
        {ps.map((x) => (
          <button key={x.span} type="button" aria-pressed={x.span === span} onClick={() => pick(x.span)}
            title={x.ok ? `${label} grew ${signedPct(x.rate)} a year from ${x.from} to ${x.to}. Press to show ${x.year}.` : x.why}>
            {x.span}Y <span className={x.ok ? (x.rate >= 0 ? "up" : "down") : "na"}>{x.ok ? signedPct(x.rate) : "—"}</span>
          </button>))}
      </div>
    </div>);
}

export function ForecastCard({ f }: { f: Financials }) {
  const pl = f.yearly.pl;
  const rev = useMemo(() => SPANS.map((s) => project(pl, "revenue", s)), [pl]);
  const np = useMemo(() => SPANS.map((s) => project(pl, "net_profit", s)), [pl]);
  const [chosen, setChosen] = useState<Span | null>(null);
  if (!pl.periods.length) return null;
  const span = chosen ?? firstSpan([...rev, ...np]);
  return (
    <div className="fcst" data-testid="forecast-card">
      <p className="fcst-t"><Icon name="bars" />Forecast<Info g={INFO} /></p>
      <div className="fcst-g">
        <Half label="Revenue" ps={rev} span={span} pick={setChosen} />
        <Half label="Profit" ps={np} span={span} pick={setChosen} />
      </div>
      <p className="fcst-n">If past growth carried on · not a prediction</p>
    </div>);
}
