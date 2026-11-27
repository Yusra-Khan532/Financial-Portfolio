// Trading Lab > Global trade: India's trade partners on a world map (backend lab/trade.py `map`). A choropleth of the latest month: each country
// shaded by its share of India's exports or imports, a hover card per country (value, share, change on the month before and on the same month a
// year before), a click or tap picks the country (its card under the map, and its products in the drill-down below). A ranked list under the map
// carries the same figures for a phone and a keyboard. Geometry: tradeWorld.ts. Facts only.
import { useEffect, useMemo, useState } from "react";
import { ChartZoom } from "../ChartZoom";
import { useTip } from "./FlowTips";
import { loadWorld, type World } from "./tradeWorld";
import { usdBn, type Trade, type TradeMapRow } from "./GlobalTrade";

type T = Extract<Trade, { ready: true }>;
export type Flow = "exports" | "imports";
const SHOW = 15;
/** Share-of-India's-flow steps that set a country's shade (per cent). */
export const STEPS = [10, 5, 2, 1, 0.25];
export const step = (share: number | null | undefined) => { if (share == null) return -1; const i = STEPS.findIndex((s) => share >= s); return i === -1 ? 5 : i; };
const pct = (v: number | null | undefined, digits = 1) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}%`);
const tone = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "gain" : "loss");
const shareTxt = (v: number | null | undefined) => (v == null ? "—" : v < 0.01 ? "under 0.01%" : `${v.toFixed(v < 1 ? 2 : 1)}%`);
const LEGEND = ["10% or more", "5–10%", "2–5%", "1–2%", "0.25–1%", "under 0.25%"];

/** A country's figures, both ways: the hover card on the map and the card under it. */
export function CountryCard({ r, t, flow }: { r: TradeMapRow; t: T; flow: Flow }) {
  const x = r.exports, m = r.imports;
  const bal = (x?.value ?? 0) - (m?.value ?? 0);
  const one = (f: Flow) => {
    const v = r[f];
    return v ? <>
      <div><dt>{f === "exports" ? "India's exports to it" : "India's imports from it"}</dt><dd className={f === "exports" ? "gain" : "loss"}>{usdBn(v.value)}</dd></div>
      <div><dt>Share of all India's {f}</dt><dd>{shareTxt(v.share)}</dd></div>
      <div><dt>Change on {t.prevMonth}</dt><dd className={tone(v.momPct)}>{pct(v.momPct)}</dd></div>
      <div><dt>Change on {t.lastYear}</dt><dd className={tone(v.yoyPct)}>{pct(v.yoyPct)}</dd></div>
    </> : <div><dt>{f === "exports" ? "India's exports to it" : "India's imports from it"}</dt><dd>none reported</dd></div>;
  };
  return (
    <>
      <header className="oflow-pop-h"><div><b>{r.name}</b><small>India's trade, {t.label}</small></div>
        <div className="r"><small>{flow}</small><b>{r[flow] ? usdBn(r[flow]!.value) : "—"}</b></div></header>
      <dl className="oflow-pop-t trd-pop-t">{one(flow)}{one(flow === "exports" ? "imports" : "exports")}
        <div><dt>India's trade balance with it</dt><dd className={tone(bal)}>{usdBn(bal, true)}</dd></div></dl>
    </>
  );
}

function NoTrade({ name, t }: { name: string; t: T }) {
  return <><header className="oflow-pop-h"><div><b>{name}</b><small>India's trade, {t.label}</small></div></header>
    <p className="oflow-pop-what">No trade with India reported to UN Comtrade for this month.</p></>;
}

export function TradeMap({ t, selected, onSelect }: { t: T; selected: string | null; onSelect: (code: string) => void }) {
  const tip = useTip();
  const [flow, setFlow] = useState<Flow>("exports");
  const [world, setWorld] = useState<World | null>(null);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => {
    let live = true;
    loadWorld().then((w) => { if (live) setWorld(w); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);
  const byIso = useMemo(() => new Map(t.map.filter((r) => r.iso3).map((r) => [r.iso3 as string, r])), [t.map]);
  const ranked = useMemo(() => t.map.filter((r) => r[flow]).sort((a, b) => (b[flow]?.value ?? 0) - (a[flow]?.value ?? 0)), [t.map, flow]);
  const sel = selected ? t.map.find((r) => r.code === selected) ?? null : null;
  const drawn = world ? world.shapes.filter((s) => s.iso3 && byIso.get(s.iso3)?.[flow]).length : 0;
  const list = more ? ranked : ranked.slice(0, SHOW);
  return (
    <div className="trd-panel trd-mapbox">
      <div className="trd-panel-h">
        <h3>India's partners on the map, {t.label}</h3>
        <div className="trd-seg" role="group" aria-label="Flow shown on the map">
          {(["exports", "imports"] as Flow[]).map((f) => <button key={f} type="button" aria-pressed={flow === f} onClick={() => setFlow(f)}>{f === "exports" ? "Exports" : "Imports"}</button>)}
        </div>
      </div>
      <ChartZoom label={`India's ${flow} by partner country on a world map, ${t.label}`}>
        <div className="trd-map-wrap">
          {!world && !failed && <div className="skeleton trd-map-skel" aria-label="Loading the world map" />}
          {failed && <p className="muted oflow-note">The world map could not be loaded; the list below has every country.</p>}
          {world && (
            <svg className={`trd-map ${flow}`} viewBox={`0 0 ${world.w} ${world.h}`} role="img" onPointerLeave={() => tip.hide()}
              aria-label={`World map of India's ${flow} in ${t.label}: ${drawn} countries shaded by their share; the largest is ${ranked[0]?.name ?? "none"}`}>
              {world.shapes.map((s, i) => {
                const r = s.iso3 ? byIso.get(s.iso3) : undefined;
                const v = r?.[flow];
                const cls = `trd-c ${v ? `b${step(v.share)}` : "none"}${s.iso3 === "IND" ? " in" : ""}${r && r.code === selected ? " sel" : ""}`;
                return <path key={s.id || `x${i}`} d={s.d} className={cls} data-iso={s.iso3 ?? undefined}
                  onPointerMove={(e) => tip.show(e, s.iso3 === "IND" ? <><header className="oflow-pop-h"><div><b>India</b><small>the reporting country</small></div></header><p className="oflow-pop-what">Every shade shows India's trade with that country.</p></> : r ? <CountryCard r={r} t={t} flow={flow} /> : <NoTrade name={s.name} t={t} />)}
                  onClick={() => { if (r) onSelect(r.code); }} />;
              })}
            </svg>
          )}
          <p className="muted opul-legend trd-legend"><span>Share of India's {flow}:</span>{LEGEND.map((l, i) => <span key={l}><i className={`sw trd-c b${i} ${flow}`} />{l}</span>)}
            <span><i className="sw trd-c none" />none reported</span><span><i className="sw trd-c in" />India</span></p>
        </div>
      </ChartZoom>
      {sel && (
        <div className="trd-map-card" role="status" aria-live="polite">
          <CountryCard r={sel} t={t} flow={flow} />
        </div>
      )}
      <p className="trd-list-h">Every partner country, by India's {flow} ({ranked.length})</p>
      <ol className="trd-plist" aria-label={`Partner countries by India's ${flow}, ${t.label}`}>
        {list.map((r, i) => (
          <li key={r.code}>
            <button type="button" aria-pressed={r.code === selected} onClick={() => onSelect(r.code)}
              onPointerMove={(e) => tip.show(e, <CountryCard r={r} t={t} flow={flow} />)} onPointerLeave={() => tip.hide()}>
              <span className="k">{i + 1}</span><span className="n">{r.name}</span><span className="v">{usdBn(r[flow]!.value)}</span>
              <span className="s">{shareTxt(r[flow]!.share)}</span><small className={tone(r[flow]!.yoyPct)}>{pct(r[flow]!.yoyPct)}</small>
            </button>
          </li>
        ))}
      </ol>
      {ranked.length > SHOW && <button type="button" className="trd-more" onClick={() => setMore((o) => !o)}>{more ? "Show fewer" : `Show ${ranked.length - SHOW} more`}</button>}
      <p className="muted trd-foot">Shares are of India's total {flow} in {t.label}; changes compare {t.prevMonth} and {t.lastYear}. Areas UN Comtrade does not name a country for (for example "Other Asia, nes") are listed but not drawn.</p>
    </div>
  );
}
