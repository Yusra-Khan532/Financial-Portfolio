// Trading Lab > Order Flow (Global) > Global trade (docs/GLOBAL-MARKETS.md): India's merchandise trade with the world from UN Comtrade: the latest
// month against the same month a year before, 13 months of exports, imports and the gap, the largest partners and products each way, with a
// hover card on every bar (backend lab/trade.py). Plus the world map of partners (TradeMap.tsx), the partner and product drill-down
// (TradeDrill.tsx; ?pt=<partner code> or ?hs=<chapter> in the address) and the WTO's world totals with India's share (WorldTrade.tsx). Facts only.
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { ApiError, apiGet } from "../../lib/api";
import { useTip } from "./FlowTips";
import { ChartZoom } from "../ChartZoom";
import { TradeMap } from "./TradeMap";
import { TradeDrill, type Pick } from "./TradeDrill";
import { WorldTrade } from "./WorldTrade";

export type TradeRow = { code: string; name: string; iso3?: string; value: number; yoyPct: number | null; share: number | null };
export type TradeMonth = { period: string; label: string; exports: number; imports: number; balance: number };
export type TradeFlowCell = { value: number; share: number | null; momPct: number | null; yoyPct: number | null };
export type TradeMapRow = { code: string; name: string; iso3: string; exports: TradeFlowCell | null; imports: TradeFlowCell | null };
export type DrillItem = { code: string; name: string; iso3?: string; exports: number; imports: number };
export type DrillIndex = { partners: DrillItem[]; products: DrillItem[]; partnerCover: { exports: number | null; imports: number | null };
  productCover: { exports: number | null; imports: number | null }; at: string | null; lastYearRead: boolean };
type ShareCell = { world: number | null; india: number | null; share: number | null; worldYoyPct?: number | null };
export type WorldTrade = { ready: false; reason: string } | { ready: true; years: { year: number; exports: ShareCell; imports: ShareCell }[]; unit: string; at: string | null; source: string };
export type Trade =
  | { ready: false; reason: string; world?: WorldTrade }
  | { ready: true; latest: string; label: string; lastYear: string; prevMonth: string; exports: number; imports: number; balance: number; exportsYoyPct: number | null;
      importsYoyPct: number | null; trend: TradeMonth[]; exportPartners: TradeRow[]; importPartners: TradeRow[]; exportProducts: TradeRow[];
      importProducts: TradeRow[]; map: TradeMapRow[]; drill: DrillIndex | null; world?: WorldTrade; at: string | null; source: string };

const getTrade = () => apiGet<Trade>("/api/lab/trade");
/** US dollars in billions (or millions under a billion), with a sign when asked. */
export const usdBn = (v: number, sign = false) => {
  const s = sign ? (v > 0 ? "+" : v < 0 ? "−" : "") : v < 0 ? "−" : "";
  const a = Math.abs(v);
  return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)} bn` : `${s}$${(a / 1e6).toFixed(0)} mn`;
};
const yoy = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`);
const tone = (v: number | null) => (v == null || v === 0 ? "" : v > 0 ? "gain" : "loss");

/** The month in one line of facts. */
export function tradeLine(t: Extract<Trade, { ready: true }>): string {
  return `India, ${t.label}: exports ${usdBn(t.exports)} (${yoy(t.exportsYoyPct)} on ${t.lastYear}) · imports ${usdBn(t.imports)} (${yoy(t.importsYoyPct)}) · trade balance ${usdBn(t.balance, true)}`;
}

function RowPop({ r, flow, t }: { r: TradeRow; flow: "exports" | "imports"; t: Extract<Trade, { ready: true }> }) {
  return (
    <>
      <header className="oflow-pop-h"><div><b>{r.name}</b><small>{flow === "exports" ? "India's exports" : "India's imports"}, {t.label}</small></div>
        <div className="r"><small>value</small><b>{usdBn(r.value)}</b></div></header>
      <dl className="oflow-pop-t">
        <div><dt>Change on {t.lastYear}</dt><dd className={tone(r.yoyPct)}>{yoy(r.yoyPct)}</dd></div>
        <div><dt>Share of all {flow}</dt><dd>{r.share == null ? "—" : `${r.share.toFixed(1)}%`}</dd></div>
      </dl>
    </>
  );
}

function Bars({ rows, flow, t, label }: { rows: TradeRow[]; flow: "exports" | "imports"; t: Extract<Trade, { ready: true }>; label: string }) {
  const tip = useTip();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="trd-bars" aria-label={label}>{rows.map((r) => (
      <li key={r.code} onPointerMove={(e) => tip.show(e, <RowPop r={r} flow={flow} t={t} />)} onPointerLeave={() => tip.hide()}>
        <span className="n">{r.name}</span>
        <span className="b"><i className={flow} style={{ width: `${(r.value / max) * 100}%` }} /></span>
        <span className="v">{usdBn(r.value)}</span><small className={tone(r.yoyPct)}>{yoy(r.yoyPct)}</small>
      </li>))}</ol>
  );
}

/** Thirteen months: exports and imports side by side, the trade balance as a line. */
export function TradeTrend({ t }: { t: Extract<Trade, { ready: true }> }) {
  const tip = useTip();
  const ms = t.trend;
  if (ms.length < 2) return null;
  const W = 1000, H = 260, L = 64, R = 12, T = 14, B = 28;
  const max = Math.max(...ms.map((m) => Math.max(m.exports, m.imports))), min = Math.min(0, ...ms.map((m) => m.balance));
  const span = max - min || 1, y = (v: number) => T + ((max - v) / span) * (H - T - B);
  const bw = (W - L - R) / ms.length;
  const line = ms.map((m, i) => `${i ? "L" : "M"}${(L + i * bw + bw / 2).toFixed(1)},${y(m.balance).toFixed(1)}`).join("");
  return (
    <svg className="trd-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`India's exports and imports by month, ${ms[0].label} to ${ms[ms.length - 1].label}`} onPointerLeave={() => tip.hide()}>
      <line className="zero" x1={L} x2={W - R} y1={y(0)} y2={y(0)} />
      <text className="ax" x={L - 8} y={y(max) + 4} textAnchor="end">{usdBn(max)}</text><text className="ax" x={L - 8} y={y(0) + 4} textAnchor="end">$0</text>
      {min < 0 && <text className="ax" x={L - 8} y={y(min) + 4} textAnchor="end">{usdBn(min)}</text>}
      {ms.map((m, i) => (
        <g key={m.period} className="trd-m" onPointerMove={(e) => tip.show(e, <><header className="oflow-pop-h"><div><b>{m.label}</b><small>India's trade with the world</small></div></header>
          <dl className="oflow-pop-t"><div><dt>Exports</dt><dd className="gain">{usdBn(m.exports)}</dd></div><div><dt>Imports</dt><dd className="loss">{usdBn(m.imports)}</dd></div>
            <div><dt>Balance</dt><dd className={tone(m.balance)}>{usdBn(m.balance, true)}</dd></div></dl></>)}>
          <rect className="hit" x={L + i * bw} width={bw} y={T} height={H - T - B} />
          <rect className="x" x={L + i * bw + bw * 0.12} width={bw * 0.36} y={y(m.exports)} height={y(0) - y(m.exports)} rx={2} />
          <rect className="m" x={L + i * bw + bw * 0.52} width={bw * 0.36} y={y(m.imports)} height={y(0) - y(m.imports)} rx={2} />
          {(i % 2 === 0 || i === ms.length - 1) && <text className="ax" x={L + i * bw + bw / 2} y={H - 8} textAnchor="middle">{m.label.replace(" 20", " ’")}</text>}
        </g>
      ))}
      <path className="bal" d={line} />
    </svg>
  );
}

export function GlobalTrade() {
  const q = useQuery({ queryKey: ["lab-trade"], queryFn: getTrade, retry: false, staleTime: 3600_000 });
  const t = q.data;
  const [params, setParams] = useSearchParams();
  const pt = params.get("pt"), hs = params.get("hs");
  const pick: Pick | null = hs ? { kind: "product", code: hs } : pt ? { kind: "partner", code: pt } : null;
  const choose = (p: Pick) => setParams((o) => { const n = new URLSearchParams(o); n.delete("pt"); n.delete("hs"); if (p.code) n.set(p.kind === "partner" ? "pt" : "hs", p.code); return n; }, { replace: true, preventScrollReset: true });
  return (
    <section className="card oflow-board trd" aria-labelledby="trd-h">
      <div className="oflow-hero-h"><div><h2 id="trd-h">Global trade</h2>{t && t.ready && <p className="oflow-money-line">{tradeLine(t)}</p>}</div></div>
      {q.isPending && <div className="skeleton" style={{ height: 420 }} aria-label="Loading India's trade" />}
      {q.isError && <div className="formerr" role="alert">{q.error instanceof ApiError && q.error.body.detail ? q.error.body.detail : "India's trade could not be read right now. Try again in a minute."}</div>}
      {t && !t.ready && <p className="muted oflow-note">{t.reason}</p>}
      {t && t.ready && <>
        <dl className="opul-stats trd-stats">
          <div><dt>Exports, {t.label}</dt><dd className="gain">{usdBn(t.exports)} <small>{yoy(t.exportsYoyPct)}</small></dd></div>
          <div><dt>Imports, {t.label}</dt><dd className="loss">{usdBn(t.imports)} <small>{yoy(t.importsYoyPct)}</small></dd></div>
          <div><dt>Trade balance</dt><dd className={tone(t.balance)}>{usdBn(t.balance, true)}</dd></div>
        </dl>
        <TradeMap t={t} selected={pick?.kind === "partner" ? pick.code : null} onSelect={(code) => choose({ kind: "partner", code })} />
        <TradeDrill t={t} pick={pick} onPick={choose} />
        <div className="mood-panel"><h3>Last 13 months</h3><ChartZoom label="India's trade by month"><TradeTrend t={t} /></ChartZoom>
          <p className="muted opul-legend"><i className="sw trd-sw-x" /> exports · <i className="sw trd-sw-m" /> imports · <i className="sw trd-sw-b" /> trade balance</p></div>
        <div className="mood-two">
          <div className="mood-panel"><h3 className="gain">Largest export partners</h3><Bars rows={t.exportPartners.slice(0, 10)} flow="exports" t={t} label="Largest export partners" /></div>
          <div className="mood-panel"><h3 className="loss">Largest import partners</h3><Bars rows={t.importPartners.slice(0, 10)} flow="imports" t={t} label="Largest import partners" /></div>
          <div className="mood-panel"><h3 className="gain">Largest exports by product</h3><Bars rows={t.exportProducts.slice(0, 10)} flow="exports" t={t} label="Largest exports by product" /></div>
          <div className="mood-panel"><h3 className="loss">Largest imports by product</h3><Bars rows={t.importProducts.slice(0, 10)} flow="imports" t={t} label="Largest imports by product" /></div>
        </div>
      </>}
      {t && <WorldTrade w={t.world} />}
      <details className="oflow-how"><summary>How it is worked out</summary><p className="muted oflow-method">India's merchandise trade as reported to the United Nations (UN Comtrade), in US dollars: exports and imports with every partner country each month, and by product (the 97 chapters of the Harmonized System) for the latest month and the same month a year before. The UN publishes a month about two to three months after it ends, so the latest month here is not last month. Changes compare the same month a year earlier (on the map also the month before). Services trade is not included. The map shades each country by its share of India's exports or imports that month (Natural Earth's 1:110m country shapes, public domain). The partner and product detail is read from the same source for India's largest partners (15 each way) and largest product chapters (10 each way), for the latest month and the same month a year before; UN Comtrade's free preview gives at most 500 rows and one period a call, so the job reads it in small pieces and the rest of the world is not broken down. World trade comes from the World Trade Organization (WTO Timeseries API, yearly merchandise trade in US dollars); India's share is India's exports or imports as a share of the world's.</p></details>
    </section>
  );
}
