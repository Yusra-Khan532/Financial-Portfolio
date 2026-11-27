// Trading Lab > Global trade: the partner and product drill-down (backend lab/trade.py, GET /api/lab/trade/drill). Choose a partner: the chapters
// of the Harmonized System India exports to it and imports from it, with values, shares and the change on the same month a year before. Choose
// a product (a chapter): the countries India exports it to and imports it from. A row of one opens the other. Only India's largest partners and
// chapters are read from UN Comtrade's free preview, and the panel says how much of India's trade they cover. Facts only.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, apiGet } from "../../lib/api";
import { ChartZoom } from "../ChartZoom";
import { useTip } from "./FlowTips";
import { usdBn, type Trade } from "./GlobalTrade";

type T = Extract<Trade, { ready: true }>;
export type DrillRow = { code: string; name: string; iso3?: string; value: number; share: number | null; yoyPct: number | null };
export type Drill = { kind: "partner" | "product"; code: string; name: string; iso3?: string; latest: string; label: string; lastYear: string | null;
  lastYearRead: boolean; exports: DrillRow[]; imports: DrillRow[]; exportsTotal: number | null; importsTotal: number | null };
export type Pick = { kind: "partner" | "product"; code: string };
const SHOW = 15;
const pct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`);
const tone = (v: number | null) => (v == null || v === 0 ? "" : v > 0 ? "gain" : "loss");
const share = (v: number | null) => (v == null ? "—" : v < 0.1 ? "under 0.1%" : `${v.toFixed(1)}%`);

function RowPop({ r, d, flow }: { r: DrillRow; d: Drill; flow: "exports" | "imports" }) {
  const whose = d.kind === "partner" ? (flow === "exports" ? `India's exports to ${d.name}` : `India's imports from ${d.name}`)
    : (flow === "exports" ? `India's exports of ${d.name.toLowerCase()}` : `India's imports of ${d.name.toLowerCase()}`);
  return (
    <>
      <header className="oflow-pop-h"><div><b>{r.name}</b><small>{whose}, {d.label}</small></div><div className="r"><small>value</small><b>{usdBn(r.value)}</b></div></header>
      <dl className="oflow-pop-t trd-pop-t">
        <div><dt>Share of {whose.replace(/^India's /, "")}</dt><dd>{share(r.share)}</dd></div>
        <div><dt>Change on {d.lastYear ?? "a year before"}</dt><dd className={tone(r.yoyPct)}>{d.lastYearRead ? pct(r.yoyPct) : "not read yet"}</dd></div>
        {d.kind === "partner" && <div><dt>HS chapter</dt><dd>{r.code}</dd></div>}
      </dl>
    </>
  );
}

function Column({ d, flow, onPick, can }: { d: Drill; flow: "exports" | "imports"; onPick: (p: Pick) => void; can: (p: Pick) => boolean }) {
  const tip = useTip();
  const [more, setMore] = useState(false);
  const rows = d[flow];
  const max = Math.max(1, ...rows.map((r) => r.value));
  const title = d.kind === "partner" ? (flow === "exports" ? `Exported to ${d.name}` : `Imported from ${d.name}`) : (flow === "exports" ? "Exported to" : "Imported from");
  const total = d[`${flow}Total`];
  return (
    <div className="trd-dcol">
      <p className={`trd-dcol-h ${flow === "exports" ? "gain" : "loss"}`}><b>{title}</b> <span>{total == null ? "none reported" : usdBn(total)}</span></p>
      {rows.length === 0 ? <p className="muted oflow-note">No {flow} reported for {d.label}.</p> : (
        <ol className="trd-bars trd-dbars" aria-label={`${title}${d.kind === "product" ? ` (${d.name})` : ""}, ${d.label}`} data-chart="">
          {(more ? rows : rows.slice(0, SHOW)).map((r) => {
            const next: Pick = { kind: d.kind === "partner" ? "product" : "partner", code: r.code };
            const ok = can(next);
            return (
              <li key={r.code} onPointerMove={(e) => tip.show(e, <RowPop r={r} d={d} flow={flow} />)} onPointerLeave={() => tip.hide()}>
                {ok ? <button type="button" className="n" onClick={() => onPick(next)} title={`Open ${r.name}`}>{r.name}</button> : <span className="n">{r.name}</span>}
                <span className="b"><i className={flow} style={{ width: `${(r.value / max) * 100}%` }} /></span>
                <span className="v">{usdBn(r.value)}</span><small className={tone(r.yoyPct)}>{d.lastYearRead ? pct(r.yoyPct) : "—"}</small>
              </li>
            );
          })}
        </ol>
      )}
      {rows.length > SHOW && <button type="button" className="trd-more" onClick={() => setMore((o) => !o)}>{more ? "Show fewer" : `Show ${rows.length - SHOW} more`}</button>}
    </div>
  );
}

export function TradeDrill({ t, pick, onPick }: { t: T; pick: Pick | null; onPick: (p: Pick) => void }) {
  const ix = t.drill;
  const kind = pick?.kind ?? "partner";
  const list = ix ? (kind === "partner" ? ix.partners : ix.products) : [];
  const inList = (p: Pick) => !!ix && (p.kind === "partner" ? ix.partners : ix.products).some((x) => x.code === p.code);
  const code = pick && (pick.kind === kind) ? pick.code : list[0]?.code;
  const read = !!code && inList({ kind, code });
  const q = useQuery({
    queryKey: ["lab-trade-drill", kind, code],
    queryFn: () => apiGet<Drill>(`/api/lab/trade/drill?${kind}=${encodeURIComponent(code ?? "")}`),
    enabled: read, retry: false, staleTime: 3600_000,
  });
  const outside = !read && code ? t.map.find((r) => r.code === code)?.name ?? `partner ${code}` : null;
  const d = q.data;
  return (
    <div className="trd-panel trd-drill">
      <div className="trd-panel-h">
        <h3>Partner and product detail, {t.label}</h3>
        <div className="trd-seg" role="group" aria-label="Detail by">
          <button type="button" aria-pressed={kind === "partner"} onClick={() => ix && onPick({ kind: "partner", code: ix.partners[0]?.code ?? "" })} disabled={!ix}>By partner</button>
          <button type="button" aria-pressed={kind === "product"} onClick={() => ix && onPick({ kind: "product", code: ix.products[0]?.code ?? "" })} disabled={!ix}>By product</button>
        </div>
      </div>
      {!ix ? <p className="muted oflow-note">The partner and product detail is read from UN Comtrade with the trade job; it has not been read for {t.label} yet.</p> : <>
        <label className="trd-pick"><span>{kind === "partner" ? "Partner" : "Product (HS chapter)"}</span>
          <select value={read ? code : ""} onChange={(e) => onPick({ kind, code: e.target.value })}>
            {!read && <option value="">Choose…</option>}
            {list.map((x) => <option key={x.code} value={x.code}>{kind === "product" ? `${x.code} · ${x.name}` : x.name}</option>)}
          </select>
        </label>
        {outside && <p className="muted oflow-note">Products by partner are read for India's {ix.partners.length} largest partners; {outside} is not one of them. Its totals are on the map's card above.</p>}
        {read && q.isPending && <div className="skeleton" style={{ height: 260 }} aria-label="Loading the detail" />}
        {read && q.isError && <div className="formerr" role="alert">{q.error instanceof ApiError && q.error.body.detail ? q.error.body.detail : "The detail could not be read right now. Try again in a minute."}</div>}
        {read && d && (
          <ChartZoom label={`${d.kind === "partner" ? `India's trade with ${d.name}` : `India's trade in ${d.name.toLowerCase()}`} by ${d.kind === "partner" ? "product" : "partner"}, ${d.label}`}>
            <div className="trd-dgrid">
              <Column d={d} flow="exports" onPick={onPick} can={inList} />
              <Column d={d} flow="imports" onPick={onPick} can={inList} />
            </div>
          </ChartZoom>
        )}
        <p className="muted trd-foot">Read for India's {ix.partners.length} largest partners ({share(ix.partnerCover.exports)} of its exports, {share(ix.partnerCover.imports)} of its imports in {t.label}) and its {ix.products.length} largest product chapters ({share(ix.productCover.exports)} and {share(ix.productCover.imports)}). Changes compare {t.lastYear}{ix.lastYearRead ? "" : ", which is still being read"}. A name in a row opens its own detail.</p>
      </>}
    </div>
  );
}
