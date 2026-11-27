// Trading Lab > Order Flow (Global) > Emerging markets (docs/GLOBAL-MARKETS.md): India beside sixteen emerging economies. The World Bank's figures
// (GDP growth, inflation, current account, trade, GDP per person, reserves) and each country's main stock index; a growth-against-inflation
// chart sized by the economy, a sortable table and a card on every country (backend lab/em.py). Facts only.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../../lib/api";
import { useTip } from "./FlowTips";
import { ChartZoom } from "../ChartZoom";

export type Fig = { year: number; value: number; prev: number | null; prevYear: number | null };
export type EmRow = {
  iso3: string; name: string;
  index: { name: string; symbol: string | null; level?: number; currency?: string; dayPct?: number | null; yearPct?: number | null; ytdPct?: number | null; spark?: number[] };
  growth?: Fig; inflation?: Fig; currentAccount?: Fig; trade?: Fig; gdpPerPerson?: Fig; gdp?: Fig; reserves?: Fig;
};
export type Em = { countries: EmRow[]; indicators: Record<string, { label: string; unit: string }>; india: Record<string, [number, number]>; at: string | null; notes: string[]; source: string };
type Key = "growth" | "inflation" | "currentAccount" | "trade" | "gdpPerPerson" | "reserves" | "yearPct";

const getEm = () => apiGet<Em>("/api/lab/em");
const COLS: { key: Key; label: string; fmt: (r: EmRow) => string; val: (r: EmRow) => number | null }[] = [
  { key: "yearPct", label: "Index, 1 year", fmt: (r) => pctS(r.index.yearPct), val: (r) => r.index.yearPct ?? null },
  { key: "growth", label: "GDP growth", fmt: (r) => pctF(r.growth), val: (r) => r.growth?.value ?? null },
  { key: "inflation", label: "Inflation", fmt: (r) => pctF(r.inflation), val: (r) => r.inflation?.value ?? null },
  { key: "currentAccount", label: "Current account, % GDP", fmt: (r) => pctF(r.currentAccount, true), val: (r) => r.currentAccount?.value ?? null },
  { key: "trade", label: "Trade, % GDP", fmt: (r) => (r.trade ? `${r.trade.value.toFixed(0)}%` : "—"), val: (r) => r.trade?.value ?? null },
  { key: "gdpPerPerson", label: "GDP per person", fmt: (r) => (r.gdpPerPerson ? `$${Math.round(r.gdpPerPerson.value).toLocaleString("en-US")}` : "—"), val: (r) => r.gdpPerPerson?.value ?? null },
  { key: "reserves", label: "Reserves, months of imports", fmt: (r) => (r.reserves ? r.reserves.value.toFixed(1) : "—"), val: (r) => r.reserves?.value ?? null },
];
function pctS(v: number | null | undefined) { return v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`; }
function pctF(f: Fig | undefined, sign = false) { return !f ? "—" : `${sign && f.value > 0 ? "+" : f.value < 0 ? "−" : ""}${Math.abs(f.value).toFixed(1)}%`; }
const tone = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "gain" : "loss");
const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
const trillion = (v: number) => (v >= 1e12 ? `$${(v / 1e12).toFixed(2)} tn` : `$${(v / 1e9).toFixed(0)} bn`);

/** India's place in one line of facts. */
export function emLine(e: Em): string {
  const ind = e.countries.find((r) => r.iso3 === "IND");
  if (!ind) return "";
  const g = e.india.growth;
  return [ind.growth ? `India's GDP grew ${ind.growth.value.toFixed(1)}% in ${ind.growth.year}${g ? `, the ${ord(g[0])} fastest of ${g[1]}` : ""}` : null,
    ind.inflation ? `inflation ${ind.inflation.value.toFixed(1)}%` : null, ind.index.yearPct != null ? `Nifty 50 ${pctS(ind.index.yearPct)} over a year` : null]
    .filter(Boolean).join(" · ");
}

function CountryPop({ r }: { r: EmRow }) {
  return (
    <>
      <header className="oflow-pop-h"><div><b>{r.name}</b><small>{r.index.name}{r.index.currency ? ` · ${r.index.currency}` : ""}</small></div>
        <div className="r">{r.index.level != null && <><b>{r.index.level.toLocaleString("en-US")}</b><span className={tone(r.index.dayPct)}>{pctS(r.index.dayPct)} today</span></>}</div></header>
      <dl className="oflow-pop-t one">
        <div><dt>Index, 1 year</dt><dd className={tone(r.index.yearPct)}>{pctS(r.index.yearPct)}</dd></div>
        <div><dt>Since 1 January</dt><dd className={tone(r.index.ytdPct)}>{pctS(r.index.ytdPct)}</dd></div>
        {COLS.slice(1).map((c) => { const f = r[c.key as Exclude<Key, "yearPct">] as Fig | undefined;
          return <div key={c.key}><dt>{c.label}{f ? ` (${f.year})` : ""}</dt><dd>{c.fmt(r)}{f?.prev != null ? <small className="muted"> ({f.prevYear}: {c.key === "gdpPerPerson" ? `$${Math.round(f.prev).toLocaleString("en-US")}` : f.prev.toFixed(1).replace("-", "−")})</small> : null}</dd></div>; })}
        {r.gdp && <div><dt>GDP ({r.gdp.year})</dt><dd>{trillion(r.gdp.value)}</dd></div>}
      </dl>
    </>
  );
}

/** Growth (across) against inflation (up), each country a bubble sized by its economy. */
export function GrowthInflation({ rows }: { rows: EmRow[] }) {
  const tip = useTip();
  const pts = rows.filter((r) => r.growth && r.inflation);
  if (pts.length < 3) return null;
  const W = 1000, H = 420, L = 56, R = 20, T = 16, B = 40;
  const CAP = 20;   // a country with inflation above 20% sits on the top edge with its figure, so the rest are not squeezed into a strip
  const infl = (r: EmRow) => Math.min(CAP, r.inflation!.value);
  const gx = pts.map((r) => r.growth!.value), iy = pts.map(infl);
  const x0 = Math.min(0, ...gx) - 0.5, x1 = Math.max(...gx) + 0.5, y0 = Math.min(0, ...iy) - 1, y1 = Math.max(...iy) + 1;
  const x = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - R), y = (v: number) => T + ((y1 - v) / (y1 - y0)) * (H - T - B);
  const big = Math.max(...pts.map((r) => r.gdp?.value ?? 0)) || 1;
  return (
    <svg className="em-scatter" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`GDP growth against inflation for ${pts.length} emerging economies`} onPointerLeave={() => tip.hide()}>
      <line className="zero" x1={x(0)} x2={x(0)} y1={T} y2={H - B} /><line className="zero" x1={L} x2={W - R} y1={y(0)} y2={y(0)} />
      <text className="ax" x={W - R} y={H - 10} textAnchor="end">GDP growth →</text><text className="ax" x={L - 8} y={T + 10} textAnchor="end">↑ inflation</text>
      {pts.map((r) => { const rad = 8 + 22 * Math.sqrt((r.gdp?.value ?? 0) / big), over = r.inflation!.value > CAP;
        return (
          <g key={r.iso3} className={`em-dot${r.iso3 === "IND" ? " india" : ""}`} onPointerMove={(e) => tip.show(e, <CountryPop r={r} />)}>
            <circle cx={x(r.growth!.value)} cy={y(infl(r))} r={rad} />
            <text x={x(r.growth!.value)} y={y(infl(r)) + 4} textAnchor="middle">{r.iso3}</text>
            {over && <text className="em-over" x={x(r.growth!.value) + rad + 4} y={y(infl(r)) + 4}>↑ {r.inflation!.value.toFixed(0)}%</text>}
          </g>); })}
    </svg>
  );
}

export function EmergingMarkets() {
  const tip = useTip();
  const q = useQuery({ queryKey: ["lab-em"], queryFn: getEm, retry: false, staleTime: 600_000 });
  const [sort, setSort] = useState<Key>("growth");
  const e = q.data;
  const rows = useMemo(() => (e ? [...e.countries].sort((a, b) => {
    const c = COLS.find((k) => k.key === sort)!;
    return (c.val(b) ?? -Infinity) - (c.val(a) ?? -Infinity);
  }) : []), [e, sort]);
  return (
    <section className="card oflow-board em" aria-labelledby="em-h">
      <div className="oflow-hero-h"><div><h2 id="em-h">Emerging markets</h2>{e && <p className="oflow-money-line">{emLine(e)}</p>}</div></div>
      {q.isPending && <div className="skeleton" style={{ height: 420 }} aria-label="Loading emerging markets" />}
      {q.isError && <div className="formerr" role="alert">{q.error instanceof ApiError && q.error.body.detail ? q.error.body.detail : "Emerging markets could not be read right now. Try again in a minute."}</div>}
      {e && <>
        <div className="mood-panel"><h3>Growth against inflation</h3><ChartZoom label="Growth against inflation"><GrowthInflation rows={e.countries} /></ChartZoom>
          <p className="muted opul-legend">Each circle is a country, sized by its economy; India in gold. Latest year the World Bank has for each.</p></div>
        <div className="mood-panel"><h3>Side by side</h3>
          <div className="em-sort" role="group" aria-label="Sort by">{COLS.map((c) => (
            <button key={c.key} type="button" className="oflow-bchip" aria-pressed={sort === c.key} onClick={() => setSort(c.key)}>{c.label}</button>))}</div>
          <div className="em-table-wrap"><table className="em-table" aria-label="Emerging markets side by side">
            <thead><tr><th>Country</th>{COLS.map((c) => <th key={c.key} className="n" aria-sort={sort === c.key ? "descending" : undefined}>{c.label}</th>)}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.iso3} className={r.iso3 === "IND" ? "india" : undefined} onPointerMove={(ev) => tip.show(ev, <CountryPop r={r} />)} onPointerLeave={() => tip.hide()}>
                <td><b>{r.name}</b><small className="muted">{r.index.name}</small></td>
                {COLS.map((c) => <td key={c.key} className={`n ${c.key === "yearPct" || c.key === "growth" || c.key === "currentAccount" ? tone(c.val(r)) : ""}`}>{c.fmt(r)}</td>)}
              </tr>))}</tbody>
          </table></div></div>
        {e.notes.map((n) => <p key={n} className="muted oflow-note">{n}</p>)}
      </>}
      <details className="oflow-how"><summary>How it is worked out</summary><p className="muted oflow-method">The economy figures are the World Bank's open data (annual; the latest year each country has, with the year before in each card): GDP growth at constant prices, consumer-price inflation, the current account and trade as a share of GDP, GDP per person and in total in current US dollars, and reserves in months of imports. Stock indices are each country's main index from Yahoo Finance in its own currency: the change over a year and since 1 January where a year of history is available. These describe each economy; they are not a forecast.</p></details>
    </section>
  );
}
