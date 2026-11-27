// Trading Lab > Order Flow (Global) > US companies (docs/GLOBAL-MARKETS.md, docs/TRADING-LAB.md): 39 large US companies from their own SEC filings
// (backend lab/companies.py, data.sec.gov XBRL). A board of the companies (each tile sized by its latest annual revenue and coloured by that
// revenue's change on the year before, grouped by sector); choosing one shows its figures: the latest year, ten years of revenue with net
// income, the last nine quarters and the year-end balance sheet. Every figure says its fiscal period and its filing; a figure a filing does
// not give is shown as "—" with the reason. Facts only.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../../lib/api";
import { useTip } from "./FlowTips";
import { ChartZoom } from "../ChartZoom";

export type Pt = [string, number];
export type FlowMetric = "revenue" | "operatingIncome" | "netIncome" | "eps";
export type PointMetric = "assets" | "liabilities" | "equity" | "cash" | "longTermDebt";
export type Metric = FlowMetric | PointMetric;
export type CoSummary = { ticker: string; name: string; sector: string; year: string | null; revenue: number | null; revenueYoyPct: number | null;
  netIncome: number | null; netIncomeYoyPct: number | null; margin: number | null };
export type CoDetail = { name: string; sector: string; cik?: number; secName: string | null; annual: Partial<Record<Metric, Pt[]>>;
  quarterly: Partial<Record<FlowMetric, Pt[]>>; concepts: Partial<Record<Metric, string>>; quarterConcepts?: Partial<Record<FlowMetric, string>>;
  derivedQuarters?: Partial<Record<FlowMetric, string[]>>; loadedAt?: string | null };
export type Companies =
  | { ready: false; reason: string }
  | { ready: true; at: string | null; companies: CoSummary[]; details: Record<string, CoDetail>; source: string };
type Ready = Extract<Companies, { ready: true }>;

const getCompanies = () => apiGet<Companies>("/api/lab/companies");
const ANNUAL_SRC = "SEC filing (10-K)", QUARTER_SRC = "SEC filing (10-Q)", DERIVED_SRC = "derived: the year (10-K) less its three quarters (10-Q)";
const LABEL: Record<FlowMetric, string> = { revenue: "revenue", operatingIncome: "operating income", netIncome: "net income", eps: "EPS" };

// ------------------------------------------------------------------------------------------------ formatting
/** US dollars as the Global pages write them: trillion, billion or million ("$182.4 bn"), with a sign when asked. */
export function usd(v: number | null | undefined, sign = false): string {
  if (v == null) return "—";
  const s = v < 0 ? "−" : sign && v > 0 ? "+" : "";
  const a = Math.abs(v);
  if (a >= 1e12) return `${s}$${(a / 1e12).toFixed(2)} tn`;
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)} bn`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(0)} mn`;
  return `${s}$${a.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
/** Earnings per share in dollars and cents. */
export const perShare = (v: number | null | undefined) => (v == null ? "—" : `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}`);
export const pctS = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`);
const tone = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "gain" : "loss");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ymd = (end: string) => { const [y, m, d] = end.split("-").map(Number); return { y, m, d }; };
/** The period a figure covers, from its end date: "FY ended 31 Dec 2025", "quarter ended 27 Jun 2026", "31 Dec 2025" for a balance. */
export const fyLabel = (end: string) => { const { y, m, d } = ymd(end); return `FY ended ${d} ${MONTHS[m - 1]} ${y}`; };
export const qLabel = (end: string) => { const { y, m, d } = ymd(end); return `quarter ended ${d} ${MONTHS[m - 1]} ${y}`; };
export const dayLabel = (end: string) => { const { y, m, d } = ymd(end); return `${d} ${MONTHS[m - 1]} ${y}`; };
const shortQ = (end: string) => { const { y, m } = ymd(end); return `${MONTHS[m - 1]} ’${String(y).slice(2)}`; };
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;
const at = (s: Pt[] | undefined, end: string) => s?.find((p) => p[0] === end)?.[1] ?? null;
/** The change of a figure on the period a year before (a fiscal year, or the same quarter), only when that period is filed. */
export function yearBefore(s: Pt[] | undefined, end: string): number | null {
  const now = at(s, end), prev = s?.find((p) => { const g = days(p[0], end); return g >= 330 && g <= 400; })?.[1];
  return now == null || prev == null || prev === 0 ? null : Math.round(((now - prev) / Math.abs(prev)) * 1000) / 10;
}

/** Period ends in order with an empty slot (null) for each missing period, so a gap shows as a gap and never closes up. */
export function slots(ends: string[], step: number): (string | null)[] {
  const out: (string | null)[] = [];
  ends.forEach((e, i) => {
    if (i) { const missing = Math.round(days(ends[i - 1], e) / step) - 1; for (let k = 0; k < Math.min(missing, 4); k++) out.push(null); }
    out.push(e);
  });
  return out;
}

/** Why a figure is "—" for a company. */
export function missingWhy(m: Metric, d: CoDetail): string {
  if (m === "operatingIncome") return d.sector === "Financials"
    ? "Banks and other financial companies do not report an operating income total in their SEC filings, so there is none to show."
    : "This company's SEC filings do not tag an operating income total, so there is none to show.";
  if (m === "eps") return "The filings do not tag one diluted earnings-per-share figure for this company (some report it per class of share), so there is none to show.";
  if (m === "longTermDebt") return "The filings do not tag one long-term debt total for this company, so there is none to show.";
  return "Not in this company's SEC filings for the period.";
}

// ------------------------------------------------------------------------------------------------ the board's layout
export type Rect = { x: number; y: number; w: number; h: number };
/** Squarified treemap (Bruls, Huizing and van Wijk): each item gets an area in proportion to its value, as close to square as the box allows. */
export function treemap<T>(items: { item: T; value: number }[], box: Rect): (Rect & { item: T })[] {
  const list = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = list.reduce((s, i) => s + i.value, 0);
  if (!total || box.w <= 0 || box.h <= 0) return [];
  const scale = (box.w * box.h) / total;
  const out: (Rect & { item: T })[] = [];
  let { x, y, w, h } = box;
  let row: { item: T; area: number }[] = [];
  const worst = (r: { area: number }[], side: number) => {
    const sum = r.reduce((s, i) => s + i.area, 0), max = Math.max(...r.map((i) => i.area)), min = Math.min(...r.map((i) => i.area));
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };
  const place = () => {
    const sum = row.reduce((s, i) => s + i.area, 0);
    if (w >= h) {   // a column on the left
      const cw = sum / h; let cy = y;
      for (const r of row) { const rh = r.area / cw; out.push({ item: r.item, x, y: cy, w: cw, h: rh }); cy += rh; }
      x += cw; w -= cw;
    } else {        // a row along the top
      const rh = sum / w; let cx = x;
      for (const r of row) { const rw = r.area / rh; out.push({ item: r.item, x: cx, y, w: rw, h: rh }); cx += rw; }
      y += rh; h -= rh;
    }
    row = [];
  };
  for (const i of list) {
    const next = { item: i.item, area: i.value * scale }, side = Math.min(w, h);
    if (row.length && worst([...row, next], side) > worst(row, side)) place();
    row.push(next);
  }
  if (row.length) place();
  return out;
}

/** The fill of a tile: green for revenue that grew on the year before, red for revenue that fell, stronger with the size of the change
 *  (full at 25%); neutral when there is no change to compare. */
export function growthFill(g: number | null): { background: string; strong: boolean } {
  if (g == null) return { background: "var(--s2)", strong: false };
  const t = Math.min(Math.abs(g), 25) / 25, mix = Math.round(24 + 56 * t);
  return { background: `color-mix(in srgb, var(${g >= 0 ? "--gain" : "--loss"}) ${mix}%, var(--s2))`, strong: mix >= 52 };
}

/** The width of a box in CSS pixels (the charts draw at their real width, so labels keep their size on a phone). */
function useWidth(fallback: number): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { const n = Math.round(el.getBoundingClientRect().width); setW((o) => (Math.abs(o - n) > 1 ? n : o)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w > 100 ? w : fallback];
}

/** The board in one line of facts. */
export function boardLine(c: Ready): string {
  const rev = c.companies.filter((s) => s.revenue != null);
  const up = rev.filter((s) => (s.revenueYoyPct ?? 0) > 0).length, down = rev.filter((s) => (s.revenueYoyPct ?? 0) < 0).length;
  const total = rev.reduce((s, x) => s + (x.revenue ?? 0), 0);
  return `${c.companies.length} US companies · latest annual revenue ${usd(total)} together · revenue up on the year before at ${up}, down at ${down}`;
}

// ------------------------------------------------------------------------------------------------ hover cards
function CoPop({ s, d }: { s: CoSummary; d?: CoDetail }) {
  const op = s.year ? at(d?.annual.operatingIncome, s.year) : null;
  return (
    <>
      <header className="oflow-pop-h"><div><b>{s.name}</b><small>{s.ticker} · {s.sector}</small></div>
        <div className="r"><small>revenue</small><b>{usd(s.revenue)}</b></div></header>
      <dl className="oflow-pop-g">
        <div><dt>Revenue change</dt><dd className={tone(s.revenueYoyPct)}>{pctS(s.revenueYoyPct)}</dd></div>
        <div><dt>Net income</dt><dd className={tone(s.netIncome)}>{usd(s.netIncome)}</dd></div>
        <div><dt>Net margin</dt><dd>{s.margin == null ? "—" : `${s.margin.toFixed(1)}%`}</dd></div>
        <div><dt>Operating income</dt><dd>{usd(op)}</dd></div>
      </dl>
      {op == null && d && <p className="oflow-pop-what">Operating income: {missingWhy("operatingIncome", d)}</p>}
      <p className="oflow-pop-what">{s.year ? `${fyLabel(s.year)}, against the year before` : "No annual figure filed"} · {ANNUAL_SRC}</p>
    </>
  );
}

function SectorPop({ sector, cos }: { sector: string; cos: CoSummary[] }) {
  const total = cos.reduce((s, c) => s + (c.revenue ?? 0), 0);
  return (
    <>
      <header className="oflow-pop-h"><div><b>{sector}</b><small>{cos.length} {cos.length === 1 ? "company" : "companies"}</small></div>
        <div className="r"><small>revenue together</small><b>{usd(total)}</b></div></header>
      <ul className="usco-pop-list">{cos.map((c) => <li key={c.ticker}><span>{c.name}</span><span>{usd(c.revenue)}</span><span className={tone(c.revenueYoyPct)}>{pctS(c.revenueYoyPct)}</span></li>)}</ul>
      <p className="oflow-pop-what">Each company's latest fiscal year; their year ends differ · {ANNUAL_SRC}</p>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ the board
export function Board({ c, selected, onSelect }: { c: Ready; selected: string | null; onSelect: (tk: string) => void }) {
  const tip = useTip();
  const [ref, W] = useWidth(1000);
  const phone = W < 560;
  const H = phone ? Math.round(W * 2.4) : Math.round(Math.min(620, Math.max(440, W * 0.52)));
  const sectors = useMemo(() => {
    const by = new Map<string, CoSummary[]>();
    for (const s of c.companies) if (s.revenue != null && s.revenue > 0) by.set(s.sector, [...(by.get(s.sector) ?? []), s]);
    return [...by].map(([sector, cos]) => ({ sector, cos: [...cos].sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0)), total: cos.reduce((t, x) => t + (x.revenue ?? 0), 0) }));
  }, [c]);
  const boxes = treemap(sectors.map((s) => ({ item: s, value: s.total })), { x: 0, y: 0, w: W, h: H });
  const HEAD = 22, GAP = 2;
  const pc = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div ref={ref} className="usco-board" data-chart="treemap" role="group" aria-label="US companies by latest annual revenue, grouped by sector" style={{ height: H }} onPointerLeave={() => tip.hide()}>
      {boxes.map((b) => {
        const head = b.h > HEAD * 2.2 ? HEAD : 0;
        const tiles = treemap(b.item.cos.map((s) => ({ item: s, value: s.revenue ?? 0 })), { x: b.x + GAP, y: b.y + head + GAP, w: b.w - 2 * GAP, h: b.h - head - 2 * GAP });
        return (
          <section key={b.item.sector} className="usco-sector" aria-label={b.item.sector}>
            {head > 0 && <div className="usco-sec-h" style={{ left: pc(b.x, W), top: pc(b.y, H), width: pc(b.w, W), height: head }}
              onPointerMove={(e) => tip.show(e, <SectorPop sector={b.item.sector} cos={b.item.cos} />)}>
              <span>{b.item.sector}</span>{b.w > 150 && <small>{usd(b.item.total)}</small>}</div>}
            {tiles.map((t) => {
              const s = t.item, f = growthFill(s.revenueYoyPct), w = t.w - GAP, h = t.h - GAP;
              const big = w >= 100 && h >= 72, mid = w >= 56 && h >= 42, small = !mid && w >= 44 && h >= 24;   // labels only where they fit whole
              return (
                <button key={s.ticker} type="button" className={`usco-tile${f.strong ? " strong" : ""}`} aria-pressed={selected === s.ticker}
                  aria-label={`${s.name} (${s.ticker}), ${s.sector}: revenue ${usd(s.revenue)}${s.year ? `, ${fyLabel(s.year)}` : ""}, ${pctS(s.revenueYoyPct)} on the year before`}
                  style={{ left: pc(t.x, W), top: pc(t.y, H), width: `calc(${pc(t.w, W)} - ${GAP}px)`, height: `calc(${pc(t.h, H)} - ${GAP}px)`, background: f.background }}
                  onClick={() => onSelect(s.ticker)} onPointerMove={(e) => tip.show(e, <CoPop s={s} d={c.details[s.ticker]} />)}>
                  {(mid || small) && <b>{s.ticker}</b>}
                  {big && <span className="nm">{s.name}</span>}
                  {big && <span className="rv">{usd(s.revenue)}</span>}
                  {mid && <span className="g">{pctS(s.revenueYoyPct)}</span>}
                </button>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ the company
function YearPop({ d, end, quarter }: { d: CoDetail; end: string; quarter?: boolean }) {
  const src = quarter ? d.quarterly : d.annual;
  const derivedOf = quarter ? (["revenue", "operatingIncome", "netIncome"] as const).filter((m) => (d.derivedQuarters?.[m] ?? []).includes(end)) : [];
  const derived = derivedOf.length > 0;
  const rev = at(src.revenue, end), op = at(src.operatingIncome, end), ni = at(src.netIncome, end), eps = at(src.eps, end);
  const hasOp = !!(quarter ? d.quarterly.operatingIncome : d.annual.operatingIncome);
  const hasEps = !!(quarter ? d.quarterly.eps : d.annual.eps);
  const notes: string[] = [];
  if (!hasOp) notes.push(`Operating income: ${missingWhy("operatingIncome", d)}`);
  if (!hasEps) notes.push(`EPS: ${missingWhy("eps", d)}`);
  else if (eps == null && quarter) notes.push("EPS: a fourth quarter's EPS is filed only as the year's figure, and per-share figures cannot be worked out by subtraction.");
  return (
    <>
      <header className="oflow-pop-h"><div><b>{quarter ? qLabel(end) : fyLabel(end)}</b><small>{d.name}</small></div>
        <div className="r"><small>revenue</small><b>{usd(rev)}</b></div></header>
      <dl className="oflow-pop-g">
        <div><dt>{quarter ? "On the same quarter a year before" : "On the year before"}</dt><dd className={tone(yearBefore(src.revenue, end))}>{pctS(yearBefore(src.revenue, end))}</dd></div>
        <div><dt>Operating income</dt><dd className={tone(op)}>{usd(op)}</dd></div>
        <div><dt>Net income</dt><dd className={tone(ni)}>{usd(ni)}</dd></div>
        <div><dt>Net margin</dt><dd>{rev && ni != null ? `${((ni / rev) * 100).toFixed(1)}%` : "—"}</dd></div>
        <div><dt>Diluted EPS</dt><dd>{perShare(eps)}</dd></div>
      </dl>
      {notes.map((n) => <p key={n} className="oflow-pop-what">{n}</p>)}
      {derived && <p className="oflow-pop-what">Fourth quarter: {derivedOf.map((m) => LABEL[m]).join(", ")} {DERIVED_SRC}</p>}
      {quarter && d.quarterConcepts?.revenue && <p className="oflow-pop-what">Revenue filed as {d.quarterConcepts.revenue}</p>}
      <p className="oflow-pop-what">{quarter ? (derived ? `${QUARTER_SRC} and 10-K` : QUARTER_SRC) : ANNUAL_SRC}</p>
    </>
  );
}

/** Revenue as bars and net income as a line, for the years (10-K) or the quarters (10-Q, a fourth quarter derived from the 10-K). */
export function RevenueChart({ d, quarter = false }: { d: CoDetail; quarter?: boolean }) {
  const tip = useTip();
  const [ref, W] = useWidth(1000);
  const src = quarter ? d.quarterly : d.annual;
  const all = slots((src.revenue ?? src.netIncome ?? []).map((p) => p[0]), quarter ? 91 : 365);
  const ends = quarter ? all.slice(-9) : all;    // the last nine quarters, an unfiled one left empty
  const derived = new Set(quarter ? d.derivedQuarters?.revenue ?? [] : []);
  if (ends.filter(Boolean).length < 2) return <p className="muted oflow-note">{quarter ? "Fewer than two quarters are filed under one figure for this company." : "Fewer than two years are filed under one figure for this company."}</p>;
  const H = 250, L = 68, R = 10, T = 14, B = 30;
  const rev = ends.map((e) => (e ? at(src.revenue, e) : null)), ni = ends.map((e) => (e ? at(src.netIncome, e) : null));
  const vals = [...rev, ...ni].filter((v): v is number => v != null);
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals), span = max - min || 1;
  const y = (v: number) => T + ((max - v) / span) * (H - T - B);
  const bw = (W - L - R) / ends.length;
  const pts = ends.map((_e, i) => (ni[i] == null ? null : [L + i * bw + bw / 2, y(ni[i]!)] as const));
  let line = "", pen = false;     // the line breaks over a period with no figure
  for (const p of pts) { if (!p) { pen = false; continue; } line += `${pen ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`; pen = true; }
  const first = ends.find(Boolean)!, last = [...ends].reverse().find(Boolean)!;
  const every = Math.ceil(ends.length / Math.max(1, Math.floor((W - L - R) / 54)));
  return (
    <div ref={ref}>
      <svg className="usco-chart" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" onPointerLeave={() => tip.hide()}
        aria-label={`${d.name}: revenue and net income ${quarter ? "by quarter" : "by fiscal year"}, ${quarter ? qLabel(first) : fyLabel(first)} to ${quarter ? qLabel(last) : fyLabel(last)}`}>
        <line className="zero" x1={L} x2={W - R} y1={y(0)} y2={y(0)} />
        <text className="ax" x={L - 6} y={y(max) + 4} textAnchor="end">{usd(max)}</text>
        <text className="ax" x={L - 6} y={y(0) + 4} textAnchor="end">$0</text>
        {min < 0 && <text className="ax" x={L - 6} y={y(min) + 4} textAnchor="end">{usd(min)}</text>}
        {ends.map((e, i) => e ? (
          <g key={e} className={`usco-bar${derived.has(e) ? " dv" : ""}`} onPointerMove={(ev) => tip.show(ev, <YearPop d={d} end={e} quarter={quarter} />)}>
            <rect className="hit" x={L + i * bw} width={bw} y={T} height={H - T - B} />
            {rev[i] != null && <rect className="rv" x={L + i * bw + bw * 0.16} width={bw * 0.68} y={Math.min(y(rev[i]!), y(0))} height={Math.abs(y(0) - y(rev[i]!))} rx={2} />}
            {(ends.length - 1 - i) % every === 0 && <text className="ax" x={L + i * bw + bw / 2} y={H - 9} textAnchor="middle">{quarter ? shortQ(e) : e.slice(0, 4)}</text>}
          </g>
        ) : (
          <g key={`gap-${i}`} className="usco-bar gap" onPointerMove={(ev) => tip.show(ev, <><header className="oflow-pop-h"><div><b>No figure filed</b><small>{d.name}</small></div></header>
            <p className="oflow-pop-what">{quarter ? "This quarter is not filed under the same figure as the quarters beside it (and could not be derived), so it is left empty." : "This year is not filed under the same figure as the years beside it, so it is left empty."}</p></>)}>
            <rect className="hit" x={L + i * bw} width={bw} y={T} height={H - T - B} />
            <text className="ax na" x={L + i * bw + bw / 2} y={y(0) - 6} textAnchor="middle">—</text>
          </g>
        ))}
        <path className="ni" d={line} />
        {pts.map((p, i) => p && <circle key={ends[i]} className={`ni-dot ${tone(ni[i])}`} cx={p[0]} cy={p[1]} r={4} />)}
      </svg>
    </div>
  );
}

function Kpi({ label, value, period, src, cls = "", pop }: { label: string; value: string; period: string; src: string; cls?: string; pop: ReactNode }) {
  const tip = useTip();
  return (
    <div className="usco-kpi" onPointerMove={(e) => tip.show(e, pop)} onPointerLeave={() => tip.hide()}>
      <dt>{label}</dt><dd className={cls}>{value}</dd><small>{period}</small><small className="src">{src}</small>
    </div>
  );
}

const BS: { key: PointMetric; label: string }[] = [
  { key: "assets", label: "Total assets" }, { key: "liabilities", label: "Total liabilities" }, { key: "equity", label: "Shareholders' equity" },
  { key: "cash", label: "Cash and equivalents" }, { key: "longTermDebt", label: "Long-term debt" },
];

export function BalanceSheet({ d }: { d: CoDetail }) {
  const tip = useTip();
  const end = d.annual.assets?.at(-1)?.[0] ?? d.annual.equity?.at(-1)?.[0];
  if (!end) return <p className="muted oflow-note">No year-end balance sheet is filed under these figures for this company.</p>;
  const assets = at(d.annual.assets, end) ?? 0;
  const rows = BS.map((b) => {
    const v = at(d.annual[b.key], end);
    return { ...b, v, derived: (d.concepts[b.key] ?? "").startsWith("derived"), yoy: yearBefore(d.annual[b.key], end), tag: d.concepts[b.key] };
  });
  return (
    <ol className="usco-bs" data-chart="bars" aria-label={`${d.name}: balance sheet at ${dayLabel(end)}`}>
      {rows.map((r) => (
        <li key={r.key} onPointerMove={(e) => tip.show(e, <>
          <header className="oflow-pop-h"><div><b>{r.label}</b><small>{d.name} · at {dayLabel(end)}</small></div><div className="r"><small>value</small><b>{usd(r.v)}</b></div></header>
          <dl className="oflow-pop-g"><div><dt>On a year before</dt><dd className={tone(r.yoy)}>{pctS(r.yoy)}</dd></div>
            <div><dt>Share of assets</dt><dd>{r.v != null && assets ? `${((r.v / assets) * 100).toFixed(0)}%` : "—"}</dd></div></dl>
          {r.v == null && <p className="oflow-pop-what">{missingWhy(r.key, d)}</p>}
          {r.derived && <p className="oflow-pop-what">Derived: total assets less shareholders' equity (the filings do not tag a liabilities total).</p>}
          {r.tag && !r.derived && <p className="oflow-pop-what">Filed as {r.tag}</p>}
          <p className="oflow-pop-what">Balance at the fiscal year end · {ANNUAL_SRC}</p></>)} onPointerLeave={() => tip.hide()}>
          <span className="n">{r.label}{r.derived && <em className="usco-chip">derived</em>}</span>
          <span className="b"><i className={r.key} style={{ width: r.v != null && assets ? `${Math.max(0.5, Math.min(100, (Math.abs(r.v) / assets) * 100))}%` : 0 }} /></span>
          <span className="v">{usd(r.v)}</span>
        </li>))}
    </ol>
  );
}

export function CompanyDetail({ tk, s, d }: { tk: string; s: CoSummary; d: CoDetail }) {
  const end = s.year;
  const op = end ? at(d.annual.operatingIncome, end) : null, eps = end ? at(d.annual.eps, end) : null;
  const period = end ? fyLabel(end) : "no annual figure filed";
  const meaning = (label: string, what: string, m?: Metric) => (
    <><header className="oflow-pop-h"><div><b>{label}</b><small>{d.name} · {period}</small></div></header>
      <p className="oflow-pop-what">{what}</p>
      {m && d.concepts[m] && <p className="oflow-pop-what">Filed as {d.concepts[m]}</p>}
      {m && !d.annual[m] && <p className="oflow-pop-what">{missingWhy(m, d)}</p>}
      <p className="oflow-pop-what">{ANNUAL_SRC}</p></>);
  const lastQ = d.quarterly.revenue?.at(-1)?.[0];
  return (
    <section className="usco-co" aria-labelledby="usco-co-h">
      <header className="usco-co-h">
        <div><h3 id="usco-co-h">{d.name} <small>{tk}</small></h3>
          <p className="muted">{d.sector} · filed with the SEC as {d.secName ?? d.name}{d.cik ? ` (SEC id ${d.cik})` : ""}</p></div>
      </header>
      <dl className="usco-kpis">
        <Kpi label="Revenue" value={usd(s.revenue)} period={period} src={ANNUAL_SRC} pop={meaning("Revenue", "Everything the company earned in the year, as it reports it.", "revenue")} />
        <Kpi label="Revenue, on the year before" value={pctS(s.revenueYoyPct)} cls={tone(s.revenueYoyPct)} period={period} src={ANNUAL_SRC}
          pop={meaning("Revenue, on the year before", "The change in revenue against the fiscal year before; none when that year is not filed under the same figure.", "revenue")} />
        <Kpi label="Operating income" value={usd(op)} cls={tone(op)} period={period} src={ANNUAL_SRC} pop={meaning("Operating income", "Revenue less the costs of running the business, before interest and tax.", "operatingIncome")} />
        <Kpi label="Net income" value={usd(s.netIncome)} cls={tone(s.netIncome)} period={period} src={ANNUAL_SRC}
          pop={meaning("Net income", `The year's profit after every cost and tax: ${pctS(s.netIncomeYoyPct)} on the year before.`, "netIncome")} />
        <Kpi label="Net margin" value={s.margin == null ? "—" : `${s.margin.toFixed(1)}%`} period={period} src={ANNUAL_SRC} pop={meaning("Net margin", "Net income as a share of revenue, for the same fiscal year.")} />
        <Kpi label="Diluted EPS" value={perShare(eps)} cls={tone(eps)} period={period} src={ANNUAL_SRC} pop={meaning("Diluted EPS", "Net income per share, counting the shares that options and convertibles could add.", "eps")} />
      </dl>
      <div className="mood-panel"><h3>Revenue and net income, by fiscal year</h3><ChartZoom label={`${d.name}: revenue and net income by fiscal year`}><RevenueChart d={d} /></ChartZoom>
        <p className="muted opul-legend"><i className="sw usco-sw-r" /> revenue · <i className="sw usco-sw-n" /> net income · US$ · each year as filed on the 10-K</p></div>
      <div className="mood-panel"><h3>The last 9 quarters{lastQ ? `, to ${dayLabel(lastQ)}` : ""}</h3><ChartZoom label={`${d.name}: revenue and net income by quarter`}><RevenueChart d={d} quarter /></ChartZoom>
        <p className="muted opul-legend"><i className="sw usco-sw-r" /> revenue · <i className="sw usco-sw-d" /> fourth quarter, derived (the year less its three quarters) · <i className="sw usco-sw-n" /> net income · {QUARTER_SRC}</p></div>
      <div className="mood-panel"><h3>Balance sheet{d.annual.assets?.length ? `, at ${dayLabel(d.annual.assets.at(-1)![0])}` : ""}</h3><ChartZoom label={`${d.name}: balance sheet`}><BalanceSheet d={d} /></ChartZoom>
        <p className="muted opul-legend">Bars against total assets · {ANNUAL_SRC}</p></div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ the page
export function UsCompanies() {
  const q = useQuery({ queryKey: ["lab-companies"], queryFn: getCompanies, retry: false, staleTime: 3600_000 });
  const [params, setParams] = useSearchParams();
  const c = q.data;
  const ready = c && c.ready ? c : null;
  const chosen = params.get("co");
  const sel = ready ? (ready.companies.find((s) => s.ticker === chosen) ?? ready.companies.find((s) => s.ticker === "JPM") ?? ready.companies[0] ?? null) : null;
  const pick = (tk: string) => { const n = new URLSearchParams(params); n.set("co", tk); setParams(n, { replace: true, preventScrollReset: true }); };
  return (
    <section className="card oflow-board usco" aria-labelledby="usco-h">
      <div className="oflow-hero-h"><div><h2 id="usco-h">US companies</h2>{ready && <p className="oflow-money-line">{boardLine(ready)}</p>}</div></div>
      {q.isPending && <div className="skeleton" style={{ height: 420 }} aria-label="Loading the US companies" />}
      {q.isError && <div className="formerr" role="alert">{q.error instanceof ApiError && q.error.body.detail ? q.error.body.detail : "The US companies could not be read right now. Try again in a minute."}</div>}
      {c && !c.ready && <p className="muted oflow-note">{c.reason}</p>}
      {ready && <>
        <div className="mood-panel"><h3>The companies by revenue</h3>
          <ChartZoom label="US companies by revenue"><Board c={ready} selected={sel?.ticker ?? null} onSelect={pick} /></ChartZoom>
          <p className="muted opul-legend">Each tile is a company, sized by its latest annual revenue and grouped by sector; colour: revenue on the year before
            <span className="usco-scale" aria-hidden="true">{[-20, -10, 0, 10, 20].map((g) => <i key={g} style={{ background: growthFill(g === 0 ? null : g).background }}>{g > 0 ? `+${g}%` : g < 0 ? `−${-g}%` : "0"}</i>)}</span>
            · choose a tile for its figures</p></div>
        {sel && ready.details[sel.ticker] && <CompanyDetail key={sel.ticker} tk={sel.ticker} s={sel} d={ready.details[sel.ticker]} />}
        <p className="muted oflow-note">Source: {ready.source}{ready.at ? ` · read ${new Date(ready.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}</p>
      </>}
      <details className="oflow-how"><summary>How it is worked out</summary><p className="muted oflow-method">Each company's own filings with the US Securities and Exchange Commission (data.sec.gov, XBRL), read once a week: revenue, operating income, net income and diluted earnings per share for each fiscal year (10-K) and quarter (10-Q), and the balance sheet at each fiscal year end, in US dollars as reported (bn = billion, mn = million, tn = trillion). Fiscal years end on different dates (Apple's in September, Walmart's in January), so each figure carries its own period. A company files three quarters on 10-Q; the fourth is worked out as the year less those three and marked derived (never for earnings per share). Where the filings give no liabilities total, liabilities are total assets less shareholders' equity, marked derived. Banks and some other companies report no operating income line; that figure shows "—". No share prices are shown. These describe what the companies reported for past periods, nothing more.</p></details>
    </section>
  );
}
