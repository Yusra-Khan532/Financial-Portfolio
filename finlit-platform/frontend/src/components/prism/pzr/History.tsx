// Financial history: annual / quarterly toggle, bars with growth labels, lines for EPS and margins, hover and keyboard tooltips,
// direct labels (no legend boxes), "Show as table" on every chart, and the restyled tables with sticky headers.
import { useMemo, useState } from "react";
import { MINUS, nf } from "../../../lib/format";
import {
  growthPercent, incomeNote, incomeWord, statementWord, trendSentence,
  type PrismHistory, type PrismReport, type Trend,
} from "../../../lib/prism";
import { periodLabel, ratioPct, yoy, type Series } from "../../../lib/prismReport";
import { ChartTable, ShowTable, useWidth } from "../PrismCharts";
import { ChartZoom } from "../../../components/ChartZoom";

type Basis = "annual" | "quarterly";
type Pt = { period: string; value: number | null; growth?: number | null };
const fmt = (v: number | null, d = 0) => (v == null ? "—" : (v < 0 ? MINUS : "") + nf(Math.abs(v), d));
const money = (v: number | null) => (v == null ? "—" : "₹" + (v < 0 ? MINUS : "") + (Math.abs(v) >= 100000 ? nf(Math.abs(v) / 100000, 2) + " lakh Cr" : nf(Math.abs(v), Math.abs(v) >= 100 ? 0 : 1) + " Cr"));
const pctText = (v: number | null) => (v == null ? "—" : (v < 0 ? MINUS : "") + nf(Math.abs(v), 1) + "%");

/** Nearest point to the pointer, and arrow keys, for a chart of `n` points; null when nothing is selected. */
function useScrub(n: number, x: (i: number) => number) {
  const [idx, setIdx] = useState<number | null>(null);
  const nearest = (px: number) => { let b = 0, d = Infinity; for (let i = 0; i < n; i++) { const dd = Math.abs(x(i) - px); if (dd < d) { d = dd; b = i; } } return b; };
  return {
    idx,
    props: {
      onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => setIdx(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left)),
      onPointerLeave: () => setIdx(null),
      onBlur: () => setIdx(null),
      onFocus: () => setIdx((i) => i ?? n - 1),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "ArrowLeft") { e.preventDefault(); setIdx((i) => Math.max(0, (i ?? n) - 1)); }
        else if (e.key === "ArrowRight") { e.preventDefault(); setIdx((i) => Math.min(n - 1, (i ?? -1) + 1)); }
        else if (e.key === "Escape") setIdx(null);
      },
    },
  };
}

type Kind = "bars" | "line";
function Chart({ kind, title, unitNote, data, color, concl, valueText, tableHead, growthLabel, basis }: {
  kind: Kind; title: string; unitNote: string; data: Pt[]; color: string; concl: string; valueText: (v: number | null) => string; tableHead: string[]; growthLabel?: boolean; basis: Basis;
}) {
  const [box, W] = useWidth<HTMLDivElement>(320);
  const [table, setTable] = useState(false);
  const H = 190, M = { t: 26, r: 12, b: 26, l: 12 };
  const vals = data.map((d) => d.value).filter((v): v is number => v != null);
  const enough = vals.length >= 2;
  const pad = kind === "line" && vals.length ? (Math.max(...vals) - Math.min(...vals) || 1) * 0.18 : 0;
  const lo = kind === "line" && vals.length ? Math.min(...vals) - pad : Math.min(0, ...vals), hi = kind === "line" && vals.length ? Math.max(...vals) + pad : Math.max(0, ...vals), span = hi - lo || 1;
  const iw = W - M.l - M.r, ih = H - M.t - M.b, n = data.length;
  const slot = iw / Math.max(1, n);
  const X = (i: number) => (kind === "bars" ? M.l + slot * (i + 0.5) : M.l + (n > 1 ? (i / (n - 1)) * iw : iw / 2));
  const Y = (v: number) => M.t + (1 - (v - lo) / span) * ih;
  const scrub = useScrub(n, X);
  const last = [...data].reverse().find((d) => d.value != null);
  const barW = Math.max(4, Math.min(34, slot * 0.62));
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 44))));
  const showGrowthAll = growthLabel && slot >= 40;
  const sel = scrub.idx != null ? data[scrub.idx] : null;
  const pts = data.map((d, i) => (d.value == null ? null : ([X(i), Y(d.value)] as [number, number])));
  let path = "", pen = false;
  pts.forEach((p) => { if (!p) { pen = false; return; } path += (pen ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); pen = true; });
  return (
    <figure className="pzr-ch" style={{ "--c": color } as React.CSSProperties}>
      <ChartZoom label={title} className="cz-r">
      <figcaption><b>{title}</b><span>{last ? <>{valueText(last.value)} <small>{periodLabel(last.period)}</small></> : "No data"}</span></figcaption>
      <div ref={box} className="pzr-ch-b" tabIndex={enough ? 0 : -1} role="group" aria-label={`${title}. Use the left and right arrow keys to read each ${basis === "annual" ? "year" : "quarter"}.`} {...(enough ? scrub.props : {})}>
        {!enough ? <p className="pzr-empty">Not enough reported {basis === "annual" ? "years" : "quarters"} for a chart.</p> : (
          <>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={concl}>
              {lo <= 0 && hi >= 0 && <line x1={M.l} x2={M.l + iw} y1={Y(0)} y2={Y(0)} className="pzr-zero" />}
              {kind === "bars" ? data.map((d, i) => {
                if (d.value == null) return <g key={d.period}><text x={X(i)} y={Y(0) - 6} textAnchor="middle" className="pzr-gap">n/a</text></g>;
                const y = Y(Math.max(0, d.value)), h = Math.max(1.5, Math.abs(Y(d.value) - Y(0))), active = scrub.idx === i;
                return (
                  <g key={d.period} className={(d.value < 0 ? "neg " : "") + (active ? "on" : "")}>
                    <rect x={X(i) - barW / 2} y={d.value < 0 ? Y(0) : y} width={barW} height={h} rx="3" className="pzr-bar" />
                    {(showGrowthAll || i === n - 1) && d.growth != null && <text x={X(i)} y={(d.value < 0 ? Y(0) : y) - 6} textAnchor="middle" className={"pzr-gl " + (d.growth < 0 ? "dn" : "up")}>{growthPercent(d.growth)}</text>}
                  </g>
                );
              }) : <>
                <path d={path} className="pzr-line" />
                {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={scrub.idx === i ? 5 : i === n - 1 ? 4 : 2.6} className="pzr-dot" />)}
                {last && (() => { const i = data.lastIndexOf(last), p = pts[i]!; return <text x={Math.min(p[0], W - M.r)} y={p[1] - 10} textAnchor="end" className="pzr-dl">{valueText(last.value)}</text>; })()}
              </>}
              {data.map((d, i) => (i === n - 1 || (i % every === 0 && n - 1 - i >= every * 0.6)) && (
                <text key={"x" + d.period} x={X(i)} y={H - 7} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="pzr-ax">{periodLabel(d.period)}</text>
              ))}
              {scrub.idx != null && <line x1={X(scrub.idx)} x2={X(scrub.idx)} y1={M.t - 6} y2={M.t + ih} className="pzr-cross" />}
            </svg>
            {sel && (
              <div className="pzr-tip" role="status" style={{ left: Math.max(4, Math.min(W - 150, X(scrub.idx!) - 70)) }}>
                <b>{periodLabel(sel.period)}</b><span>{valueText(sel.value)}</span>
                {sel.growth != null && growthLabel && <em className={sel.growth < 0 ? "dn" : "up"}>{growthPercent(sel.growth)} on a year earlier</em>}
              </div>
            )}
          </>
        )}
      </div>
      </ChartZoom>
      <div className="pzr-cfoot"><span>{unitNote}</span>{enough && <ShowTable on={table} set={setTable} />}</div>
      {table && <ChartTable caption={concl} head={tableHead} rows={data.map((d) => [periodLabel(d.period), valueText(d.value), ...(growthLabel ? [growthPercent(d.growth)] : [])])} />}
    </figure>
  );
}

const withGrowth = (s: Series, step = 12): Pt[] => { const g = yoy(s, step); return s.map((p, i) => ({ ...p, growth: g[i] })); };

/** Series for a basis from the report: the stored history when it has it, otherwise the annual trends. */
function seriesFor(report: PrismReport, basis: Basis) {
  const h = report.financialHistory, trends: Trend[] = report.trends || [];
  if (basis === "quarterly") {
    const q = h?.quarterly || [];
    return {
      rev: q.map((r) => ({ period: r.period, value: r.sales })), prof: q.map((r) => ({ period: r.period, value: r.profit })), eps: q.map((r) => ({ period: r.period, value: r.eps })),
      m1: { name: "EBITDA margin", pts: q.map((r) => ({ period: r.period, value: ratioPct(r.ebitda, r.sales) })), note: "EBITDA ÷ sales" },
      m2: null as null | { name: string; pts: Series; note: string },
      m3: { name: "Net profit margin", pts: q.map((r) => ({ period: r.period, value: ratioPct(r.profit, r.sales) })), note: "net profit ÷ sales" },
    };
  }
  const a = h?.annual || [];
  const byYear = new Map(a.map((r) => [r.period, r]));
  const base = trends.length ? trends.map((t) => ({ period: t.period, sales: byYear.get(t.period)?.sales ?? t.revenue, profit: byYear.get(t.period)?.profit ?? t.profit, eps: t.eps, nw: byYear.get(t.period)?.netWorth ?? null }))
    : a.map((r) => ({ period: r.period, sales: r.sales, profit: r.profit, eps: null as number | null, nw: r.netWorth }));
  return {
    rev: base.map((r) => ({ period: r.period, value: r.sales })), prof: base.map((r) => ({ period: r.period, value: r.profit })), eps: base.map((r) => ({ period: r.period, value: r.eps })),
    m1: { name: "Net profit margin", pts: base.map((r) => ({ period: r.period, value: ratioPct(r.profit, r.sales) })), note: "net profit ÷ income" },
    m2: { name: "Return on book equity", pts: base.map((r) => ({ period: r.period, value: ratioPct(r.profit, r.nw) })), note: "net profit ÷ year-end book equity" },
    m3: null as null | { name: string; pts: Series; note: string },
  };
}

const lineSentence = (name: string, s: Series) => {
  const p = s.filter((x) => x.value != null);
  if (p.length < 2) return `${name}: not enough reported periods for a trend.`;
  const a = p[0], b = p[p.length - 1], verb = b.value! > a.value! ? "rose" : b.value! < a.value! ? "fell" : "was unchanged";
  return `${name} ${verb === "was unchanged" ? "was unchanged" : `${verb} from ${pctText(a.value)} in ${periodLabel(a.period)} to ${pctText(b.value)} in ${periodLabel(b.period)}`}.`;
};

export function HistoryCharts({ report }: { report: PrismReport }) {
  const hasQ = (report.financialHistory?.quarterly || []).filter((r) => r.sales != null || r.profit != null).length >= 2;
  const hasA = report.trends.length > 0 || (report.financialHistory?.annual?.length ?? 0) > 0;
  const [basis, setBasis] = useState<Basis>(hasA ? "annual" : "quarterly");
  const income = incomeWord(report.rating.group), note = incomeNote(report.rating.group);
  const s = useMemo(() => seriesFor(report, basis), [report, basis]);
  const step = 12, per = basis === "annual" ? "year" : "quarter";
  const trendOf = (label: string, key: "revenue" | "profit" | "eps", v: Series) => trendSentence(label, v.map((p) => ({ period: periodLabel(p.period), revenue: key === "revenue" ? p.value : null, profit: key === "profit" ? p.value : null, eps: key === "eps" ? p.value : null })), key);
  if (!hasA && !hasQ) return <p className="pzr-empty">No reported history is available for this statement basis.</p>;
  return (
    <>
      <div className="pzr-bar-tools pzr-noprint">
        <div className="seg pzr-seg" role="group" aria-label="Period">
          <button type="button" className={basis === "annual" ? "on" : ""} aria-pressed={basis === "annual"} disabled={!hasA} onClick={() => setBasis("annual")}>Annual</button>
          <button type="button" className={basis === "quarterly" ? "on" : ""} aria-pressed={basis === "quarterly"} disabled={!hasQ} onClick={() => setBasis("quarterly")}>Quarterly</button>
        </div>
        <p>{statementWord(report.statementType)} statements. Amounts in ₹ crore; EPS in ₹ per share. Percent labels compare with the same {per === "year" ? "year" : "quarter"} a year earlier.{note ? ` ${note}` : ""}</p>
      </div>
      <div className="pzr-chs">
        <Chart basis={basis} kind="bars" title={income} unitNote={`₹ crore, oldest to newest`} data={withGrowth(s.rev, step)} color="var(--pzr-c1)" valueText={money}
          concl={trendOf(income, "revenue", s.rev)} tableHead={[basis === "annual" ? "Financial year" : "Quarter", `${income} (₹ Cr)`, "Growth on a year earlier"]} growthLabel />
        <Chart basis={basis} kind="bars" title="Net profit" unitNote="₹ crore; loss years point down" data={withGrowth(s.prof, step)} color="var(--pzr-c3)" valueText={money}
          concl={trendOf("Net profit", "profit", s.prof)} tableHead={[basis === "annual" ? "Financial year" : "Quarter", "Net profit (₹ Cr)", "Growth on a year earlier"]} growthLabel />
        <Chart basis={basis} kind="line" title="EPS" unitNote="₹ per share" data={s.eps} color="var(--pzr-c2)" valueText={(v) => (v == null ? "—" : "₹" + fmt(v, 2))}
          concl={trendOf("EPS", "eps", s.eps)} tableHead={[basis === "annual" ? "Financial year" : "Quarter", "EPS (₹)"]} />
        <Chart basis={basis} kind="line" title={s.m1.name} unitNote={`${s.m1.note}, from the reported figures`} data={s.m1.pts} color="var(--pzr-c4)" valueText={pctText}
          concl={lineSentence(s.m1.name, s.m1.pts)} tableHead={[basis === "annual" ? "Financial year" : "Quarter", `${s.m1.name} (%)`]} />
        {s.m2 && <Chart basis={basis} kind="line" title={s.m2.name} unitNote={`${s.m2.note}`} data={s.m2.pts} color="var(--pzr-c5)" valueText={pctText}
          concl={lineSentence(s.m2.name, s.m2.pts)} tableHead={[basis === "annual" ? "Financial year" : "Quarter", `${s.m2.name} (%)`]} />}
        {s.m3 && <Chart basis={basis} kind="line" title={s.m3.name} unitNote={s.m3.note} data={s.m3.pts} color="var(--pzr-c5)" valueText={pctText}
          concl={lineSentence(s.m3.name, s.m3.pts)} tableHead={[basis === "annual" ? "Financial year" : "Quarter", `${s.m3.name} (%)`]} />}
      </div>
    </>
  );
}

const cell = (v: number | null | undefined, d?: number) => (v == null ? "—" : (v < 0 ? MINUS : "") + nf(Math.abs(v), d ?? (Math.abs(v) >= 1000 ? 0 : 2)));
export function HistoryTables({ history, income, note = null, benchmark }: { history: PrismHistory; income: string; note?: string | null; benchmark?: PrismReport["benchmark"] }) {
  const table = (title: string, rows: { period: string; [k: string]: number | string | null }[], fields: [string, string][]) => (
    <div className="pzr-htab"><h4>{title}</h4>
      {rows.length ? <div className="pzr-tw" tabIndex={0} role="region" aria-label={`${title}, scrolls sideways on a small screen`}>
        <table className="pzr-t"><thead><tr><th scope="col">Measure</th>{rows.map((r) => <th scope="col" key={r.period} className="n">{periodLabel(r.period)}</th>)}</tr></thead>
          <tbody>{fields.map(([k, label]) => <tr key={k}><th scope="row">{label}</th>{rows.map((r) => <td key={r.period} className="n">{cell(r[k] as number | null)}</td>)}</tr>)}</tbody></table></div>
        : <p className="pzr-empty">No reported history available for this statement basis.</p>}</div>
  );
  const inc = income;
  return (
    <div className="pzr-tables">
      <p className="pzr-small">Oldest to newest · amounts in ₹ crore · EPS in ₹ per share · missing values shown as a dash.{note ? ` ${note}` : ""}</p>
      {table("Quarterly results", history.quarterly, [["sales", inc], ["profit", "Owner-attributable net profit"], ["ebitda", "EBITDA"], ["eps", "EPS (₹)"]])}
      {table("Annual results", history.annual, [["sales", inc], ["profit", "Owner-attributable net profit"], ["cashFlow", "Operating cash flow"], ["netWorth", "Book equity"]])}
      <KeyRatios latest={history.latest} benchmark={benchmark} />
    </div>
  );
}

/* ---- key financial ratios, as tables: the valuation multiples (company, own five-year median, benchmark) and three groups of single values */
type Ratio = PrismHistory["latest"][number];
const RATIO_GROUPS: [string, [string, string][]][] = [
  ["Per share and size", [["price", "Price"], ["eps_ttm", "Trailing EPS"], ["shares", "Shares outstanding"], ["market_cap", "Market capitalisation"], ["ev", "Enterprise value"]]],
  ["Balance sheet and profit", [["total_debt", "Total debt"], ["cash", "Cash and bank balances"], ["net_worth", "Latest book equity"], ["profit_before_tax", "Profit before tax, last FY"],
    ["interest_cost", "Interest cost, last FY"], ["annual_net_worth", "Book equity matching annual profit"], ["annual_total_assets", "Assets matching annual profit"]]],
  ["Risk and trading", [["volatility_pct", "Annualised volatility"], ["biggest_fall_pct", "Maximum one-year drawdown"], ["trading_value_cr", "Average daily trading value"], ["promoter_pledged_pct", "Promoter pledged shares"]]],
];
const MULTIPLES: [string, string][] = [["pe", "P/E"], ["pb", "P/B"], ["ev_ebitda", "EV/EBITDA"]];
/** A ratio in the site's style: ₹ for prices and crores, × for multiples, % with two decimals. */
export function ratioText(r: Pick<Ratio, "value" | "unit">): string {
  const v = r.value;
  if (v == null) return "—";
  const sign = v < 0 ? MINUS : "", a = Math.abs(v);
  switch (r.unit) {
    case "INR/share": return `₹${sign}${nf(a, a >= 1000 ? 0 : 2)}`;
    case "Cr": return `₹${sign}${nf(a, a >= 100 ? 0 : 2)} Cr`;
    case "Cr shares": return `${sign}${nf(a, a >= 100 ? 0 : 2)} Cr`;
    case "%": return `${sign}${nf(a, 2)}%`;
    case "x": return `${sign}${nf(a, 2)}×`;
    default: return `${sign}${nf(a, 2)}${r.unit ? " " + r.unit : ""}`;
  }
}
export function KeyRatios({ latest, benchmark }: { latest: Ratio[]; benchmark?: PrismReport["benchmark"] }) {
  if (!latest.length) return null;
  const by = new Map(latest.map((r) => [r.key, r]));
  const used = new Set<string>();
  const take = (k: string) => { used.add(k); return by.get(k); };
  const multiples = MULTIPLES.map(([k, label]) => ({ label, co: take(k), own: take(`own_5y_median_${k}`), bm: take(`industry_median_${k}`), scope: benchmark?.metrics?.[`industry_median_${k}`]?.scope }))
    .filter((m) => m.co || m.own || m.bm);
  const sector = multiples.some((m) => m.scope === "sector");
  const providers = [...new Set(MULTIPLES.map(([k]) => benchmark?.metrics?.[`industry_median_${k}`]?.provider).filter((p): p is string => !!p))];
  const groups = RATIO_GROUPS.map(([title, rows]) => [title, rows.map(([k, label]) => ({ label, r: take(k) })).filter((x) => x.r)] as const).filter(([, rows]) => rows.length);
  const rest = latest.filter((r) => !used.has(r.key));
  const one = (title: string, rows: { label: string; r?: Ratio }[]) => (
    <div className="pzr-tw" key={title}><table className="pzr-t"><thead><tr><th scope="col">{title}</th><th scope="col" className="n">Value</th></tr></thead>
      <tbody>{rows.map(({ label, r }) => <tr key={label}><th scope="row">{label}</th><td className="n">{r ? ratioText(r) : "—"}</td></tr>)}</tbody></table></div>
  );
  return (
    <div className="pzr-htab"><h4>Key financial ratios</h4>
      <div className="pzr-kr">
        {multiples.length > 0 && <div className="pzr-tw pzr-kr-v"><table className="pzr-t"><thead><tr><th scope="col">Valuation multiple</th><th scope="col" className="n">Company</th><th scope="col" className="n">Own 5-year median</th><th scope="col" className="n">{sector ? "Sector benchmark" : "Industry median"}</th></tr></thead>
          <tbody>{multiples.map((m) => <tr key={m.label}><th scope="row">{m.label}</th><td className="n pzr-kr-co">{m.co ? ratioText(m.co) : "—"}</td><td className="n">{m.own ? ratioText(m.own) : "—"}</td><td className="n">{m.bm ? ratioText(m.bm) : "—"}</td></tr>)}</tbody></table></div>}
        {groups.map(([title, rows]) => one(title, rows))}
        {rest.length > 0 && one("Other", rest.map((r) => ({ label: r.label, r })))}
      </div>
      <p className="pzr-small pzr-kr-note">{providers.length ? `${sector ? "Sector benchmarks" : "Benchmarks"} from ${providers.join(" and ")}. ` : ""}₹ Cr is ₹ crore.</p>
    </div>
  );
}
