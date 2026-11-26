// Trading Lab > Order Flow > RSI heatmap (docs/TRADING-LAB.md "RSI heatmap"): Wilder's RSI(14) of every F&O stock on 5-minute, 15-minute,
// hourly and daily bars (backend finlit/lab/rsi.py, refreshed every 15 minutes in market hours). Band counts per timeframe, then the stocks by
// sector, each cell coloured by its band; hover any cell for the detail. On a phone: one timeframe at a time, as compact tiles.
// Describe-only: a band names where a value sits, never what to do.
import { useMemo, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { inr, marketLive } from "../../lib/flow";
import {
  BANDS, BAND_NAME, BAND_RANGE, NOTE, TFS, TF_NAME, bandOf, barTime, change, filterStocks, fmt, getRsi, groupBySector, signed, sortStocks,
  type BandCounts, type BandKey, type RsiReady, type RsiStock, type Sort, type Tf,
} from "../../lib/rsi";
import { useTip } from "./FlowTips";
import { ChartZoom } from "../ChartZoom";

const PHONE = "(max-width: 560px)";
const subscribe = (cb: () => void) => {
  const m = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(PHONE) : null;
  m?.addEventListener?.("change", cb);
  return () => m?.removeEventListener?.("change", cb);
};
/** True at phone width (560px or less). */
export const usePhone = () => useSyncExternalStore(subscribe, () => typeof window !== "undefined" && !!window.matchMedia?.(PHONE)?.matches, () => false);

const cls = (b: BandKey | null | undefined) => `rsi-c ${b ? `b-${b}` : "b-none"}`;

/** The hover card of one stock: its four values with their bands, the change from the bar before, and the bar times. */
export function RsiPop({ s, tf }: { s: RsiStock; tf?: Tf }) {
  const forming = TFS.filter((t) => s.forming[t] && s.rsi[t] != null);
  return (
    <>
      <header className="oflow-pop-h"><div><b>{s.sym}</b><small>{s.name} · {s.sector}</small></div>
        <div className="r"><small>price</small><b>{inr(s.price)}</b></div></header>
      <dl className="oflow-pop-t one rsi-pop-t">
        {TFS.map((t) => {
          const d = change(s.rsi[t], s.prev[t]);
          return (
            <div key={t} className={t === tf ? "on" : undefined}>
              <dt>{TF_NAME[t]}</dt>
              <dd>{s.rsi[t] == null ? <span className="muted">no value</span>
                : <><b className={cls(s.band[t])}>{fmt(s.rsi[t])}</b> {BAND_NAME[s.band[t]!].toLowerCase()} · before {fmt(s.prev[t])} <span className={d == null || d === 0 ? "" : d > 0 ? "gain" : "loss"}>({signed(d)})</span></>}</dd>
            </div>);
        })}
      </dl>
      {TFS.filter((t) => s.reason[t]).map((t) => <p key={t} className="muted rsi-pop-note">{TF_NAME[t]}: {s.reason[t]}</p>)}
      <p className="muted rsi-pop-note">Last 5-minute bar {barTime(s.lastBar)}; last daily close {barTime(s.barAt["1D"])}.
        {forming.length > 0 && <> {forming.length === TFS.length ? "Every value" : forming.map((t) => TF_NAME[t]).join(", ")} includes the bar still forming.</>}</p>
    </>
  );
}

function CountPop({ tf, band, n, stocks }: { tf: Tf; band: BandKey | "none"; n: number; stocks: RsiStock[] }) {
  const g = sortStocks(stocks.filter((s) => (s.band[tf] ?? "none") === band), "high", tf);
  return (
    <>
      <header className="oflow-pop-h"><div><b>{band === "none" ? "No value yet" : BAND_NAME[band]}</b><small>{TF_NAME[tf]} · {band === "none" ? "fewer than 50 bars" : `RSI ${BAND_RANGE[band]}`}</small></div>
        <div className="r"><small>stocks</small><b>{n}</b></div></header>
      {g.length > 0 && <div className="oflow-pop-movers one"><div>{g.slice(0, 8).map((s) => <p key={s.sym}>{s.sym}<span className="muted">{s.sector}</span><span>{fmt(s.rsi[tf])}</span></p>)}
        {g.length > 8 && <small>and {g.length - 8} more</small>}</div></div>}
    </>
  );
}

/** How many stocks sit in each band, one stacked bar per timeframe. Choosing a part filters the stocks below to it. */
function BandBars({ d, tf, band, onChoose }: { d: RsiReady; tf: Tf; band: BandKey | "none" | null; onChoose: (tf: Tf, b: BandKey | "none" | null) => void }) {
  const tip = useTip();
  return (
    <div className="rsi-counts" data-chart="rsi-bands" aria-label="Stocks in each band, per timeframe">
      {TFS.map((t) => {
        const c: BandCounts = d.counts[t], total = Math.max(1, BANDS.reduce((a, b) => a + c[b], 0) + c.none);
        return (
          <div key={t} className="rsi-count-row">
            <span className="rsi-count-tf">{TF_NAME[t]}</span>
            <div className="rsi-bar" role="group" aria-label={`${TF_NAME[t]}: ${BANDS.map((b) => `${c[b]} ${BAND_NAME[b].toLowerCase()}`).join(", ")}${c.none ? `, ${c.none} with no value` : ""}`}>
              {[...BANDS, "none" as const].filter((b) => c[b] > 0).map((b) => (
                <button key={b} type="button" className={cls(b === "none" ? null : b)} style={{ flexGrow: c[b], flexBasis: `${(c[b] / total) * 100}%` }}
                  aria-pressed={tf === t && band === b} aria-label={`${TF_NAME[t]}, ${b === "none" ? "no value" : BAND_NAME[b]}: ${c[b]} stocks`}
                  onClick={() => onChoose(t, tf === t && band === b ? null : b)}
                  onPointerMove={(e) => tip.show(e, <CountPop tf={t} band={b} n={c[b]} stocks={d.stocks} />)} onPointerLeave={() => tip.hide()}>
                  {c[b]}
                </button>))}
            </div>
          </div>);
      })}
      <p className="muted rsi-legend">{BANDS.map((b) => <span key={b}><i className={cls(b)} />{BAND_NAME[b]} ({BAND_RANGE[b]})</span>)}<span><i className="rsi-c b-none" />no value yet</span></p>
    </div>
  );
}

function Cell({ s, t }: { s: RsiStock; t: Tf }) {
  const tip = useTip();
  return (
    <span className={`${cls(s.band[t])} rsi-cell${s.forming[t] && s.rsi[t] != null ? " forming" : ""}`} data-tf={t}
      aria-label={`${s.sym} ${TF_NAME[t]}: ${s.rsi[t] == null ? "no value" : `${fmt(s.rsi[t])}, ${BAND_NAME[s.band[t]!].toLowerCase()}`}`}
      onPointerMove={(e) => tip.show(e, <RsiPop s={s} tf={t} />)} onPointerLeave={() => tip.hide()}>{fmt(s.rsi[t])}</span>
  );
}

export function RsiHeatmap() {
  const live = marketLive();
  const q = useQuery({ queryKey: ["lab-rsi"], queryFn: getRsi, retry: false, refetchInterval: live ? 120_000 : false });
  const phone = usePhone();
  const tip = useTip();
  const [tf, setTf] = useState<Tf>("15m");
  const [sort, setSort] = useState<Sort>("name");
  const [band, setBand] = useState<BandKey | "none" | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [shut, setShut] = useState<Set<string>>(new Set());
  const d = q.data?.ready ? q.data : null;
  const groups = useMemo(() => {
    if (!d) return [];
    const list = sortStocks(filterStocks(d.stocks, { tf, band, sector, q: find }), sort, tf);
    return groupBySector(list, d.sectors);
  }, [d, tf, band, sector, find, sort]);
  const sectors = useMemo(() => (d ? [...new Set(d.stocks.map((s) => s.sector))].sort() : []), [d]);
  const shown = groups.reduce((a, g) => a + g.stocks.length, 0);
  const toggle = (name: string) => setShut((o) => { const n = new Set(o); if (n.has(name)) n.delete(name); else n.add(name); return n; });

  return (
    <section className="card oflow-board rsi" aria-labelledby="rsi-h">
      <div className="oflow-hero-h"><div><h2 id="rsi-h">RSI heatmap</h2>
        <p className="muted oflow-sub">RSI(14) of every F&O stock on four timeframes, coloured by band. {NOTE}</p></div></div>
      {q.isPending && <div className="skeleton" style={{ height: 420 }} aria-label="Loading the RSI grid" />}
      {q.isError && <div className="formerr" role="alert">The RSI grid could not be loaded right now. It refreshes by itself; reload in a minute.</div>}
      {q.data && !q.data.ready && <div className="oflow-wait rsi-wait" role="status"><h3 className="rsi-h3">No RSI grid yet</h3><p className="muted">{q.data.reason}</p></div>}
      {d && <>
        <p className="muted rsi-stamp" role="status">{live ? "Every 15 minutes in market hours" : "Last session"} · worked out {barTime(d.asOf)} · {d.stocks.length} F&O stocks</p>
        {d.stale && <p className="oflow-note rsi-stale" role="status">This grid is older than it should be (worked out {barTime(d.asOf)}): the latest refresh has not finished. The values below are from that time.</p>}
        {d.stocks.length === 0 ? <p className="muted">No F&O stock is in the grid yet.</p> : <>
          <ChartZoom label="Stocks by RSI band"><BandBars d={d} tf={tf} band={band} onChoose={(t, b) => { setTf(t); setBand(b); }} /></ChartZoom>
          <div className="rsi-tools">
            <div className="oflow-bchips" role="group" aria-label="Timeframe for sorting, the band filter and the tiles">{TFS.map((t) => (
              <button key={t} type="button" className="oflow-bchip rsi-tf" aria-pressed={tf === t} onClick={() => setTf(t)}>{TF_NAME[t]}</button>))}</div>
            <label className="rsi-sel">Sort <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort the stocks">
              <option value="name">By name</option><option value="high">RSI {TF_NAME[tf]}, high to low</option><option value="low">RSI {TF_NAME[tf]}, low to high</option></select></label>
            <label className="rsi-sel">Band <select value={band ?? ""} onChange={(e) => setBand((e.target.value || null) as BandKey | "none" | null)} aria-label="Show one band">
              <option value="">Every band</option>{BANDS.map((b) => <option key={b} value={b}>{BAND_NAME[b]} ({TF_NAME[tf]})</option>)}<option value="none">No value yet</option></select></label>
            <label className="rsi-sel">Sector <select value={sector ?? ""} onChange={(e) => setSector(e.target.value || null)} aria-label="Show one sector">
              <option value="">Every sector</option>{sectors.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
            <input type="search" className="rsi-find" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a stock" aria-label="Find a stock" />
          </div>
          <p className="muted rsi-shown">{shown} of {d.stocks.length} stocks{band ? ` · ${band === "none" ? "no value yet" : BAND_NAME[band].toLowerCase()} on ${TF_NAME[tf]}` : ""}{sector ? ` · ${sector}` : ""}
            {groups.length > 1 && <button type="button" className="rsi-all" onClick={() => setShut(shut.size ? new Set() : new Set(groups.map((g) => g.sector)))}>{shut.size ? "Open every sector" : "Close every sector"}</button>}</p>
          {groups.length === 0 ? <p className="muted rsi-none">No stock matches these filters.</p> :
            <ChartZoom label="RSI heatmap"><div className={`rsi-grid${phone ? " phone" : ""}`} data-chart="rsi-heatmap" data-tf={tf}>
              {!phone && <div className="rsi-row rsi-head" aria-hidden="true"><span>Stock</span><span>Price</span>{TFS.map((t) => <span key={t} className={t === tf ? "on" : undefined}>{t}</span>)}</div>}
              {groups.map((g) => {
                const open = !shut.has(g.sector);
                return (
                  <div key={g.sector} className="rsi-sec" role="group" aria-label={g.sector}>
                    <div className="rsi-row rsi-sec-h">
                      <h3 className="rsi-h3"><button type="button" className="rsi-sec-b" aria-expanded={open} onClick={() => toggle(g.sector)}>
                        <span className="rsi-chev" aria-hidden="true">{open ? "▾" : "▸"}</span>{g.sector}
                        <small className="muted">{g.stocks.length === g.total ? `${g.total} stocks` : `${g.stocks.length} of ${g.total}`} · sector average</small></button></h3>
                      {phone ? <span className={`${cls(bandOf(g.avg[tf]))} rsi-cell avg`}>{fmt(g.avg[tf])}</span> : <>
                        <span />{TFS.map((t) => <span key={t} className={`${cls(bandOf(g.avg[t]))} rsi-cell avg`} aria-label={`${g.sector} average ${TF_NAME[t]}: ${fmt(g.avg[t])}`}>{fmt(g.avg[t])}</span>)}</>}
                    </div>
                    {open && (phone
                      ? <ul className="rsi-tiles" aria-label={`${g.sector} stocks, ${TF_NAME[tf]}`}>{g.stocks.map((s) => (
                        <li key={s.sym} className={`${cls(s.band[tf])} rsi-tile`} onPointerMove={(e) => tip.show(e, <RsiPop s={s} tf={tf} />)} onPointerLeave={() => tip.hide()}>
                          <b>{s.sym}</b><span>{fmt(s.rsi[tf])}</span></li>))}</ul>
                      : g.stocks.map((s) => (
                        <div key={s.sym} className="rsi-row rsi-stock" aria-label={s.sym}>
                          <span className="rsi-name"><b>{s.sym}</b><small className="muted">{s.name}</small></span>
                          <span className="rsi-price">{inr(s.price)}</span>
                          {TFS.map((t) => <Cell key={t} s={s} t={t} />)}
                        </div>)))}
                  </div>);
              })}
            </div></ChartZoom>}
        </>}
      </>}
      <details className="oflow-how"><summary>How it is worked out</summary><p className="muted oflow-method">RSI(14), Wilder's method. For each bar the change is its close minus the close before it. The average gain and average loss start as the plain average of the first 14 gains and losses; after that each is (previous average × 13 + this bar's gain or loss) / 14. RSI = 100 − 100 / (1 + average gain / average loss), and 100 when there was no loss. The 5-minute bars are Dhan's; the 15-minute and hourly bars are grouped from them from 09:15 IST (the last hourly bar is 15:15 to 15:30), a bar's close being its last 5-minute close. The daily bars are FinLit's daily closes, with today's latest price as today's close until the day's close is stored. A value is shown from 50 bars; the latest bar may still be forming. Bands: 30 or less oversold band, above 30 and below 40 weak, 40 to 60 middle, above 60 and below 70 strong, 70 or more overbought band. {NOTE}</p></details>
    </section>
  );
}
