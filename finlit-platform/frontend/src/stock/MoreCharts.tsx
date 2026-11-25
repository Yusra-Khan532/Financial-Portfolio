// Developer file 41 (founder, 25 Nov 2026): "section 08 shows the price history above too, same with profit and loss, cash flow, balance sheet above, and
// ownership and valuation in the lower sections, so merge section 8 into these and remove it". The Chart lab is gone; the charts that no other section
// draws live here and are shown inside their own sections: the price statistics in Price & technicals, the statement charts under each statement of
// Financials (they follow its Consolidated / Standalone switch), and the corporate actions timeline in Dividends. Its other charts repeated a section's own.
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { Icon } from "../lib/icons";
import { Gate } from "../components/Gate";
import { MiniBars } from "../charts/MiniBars";
import { AreaSeries, Box, HeatGrid, Histo, Timeline, Treemap, Waterfall, type BoxRow, type Step } from "../charts/Atlas";
import { useSection, type Events, type Financials, type Meta, type Table } from "../lib/api";
import { MINUS, cr, nf } from "../lib/format";
import { TabGroup } from "../components/TabGroup";
import { ChartHelp } from "../components/ChartHelp";
import { ChartZoom } from "../components/ChartZoom";
import { PLAN_FOR_REPORT_EXTRAS } from "../lib/planGates";

type N = number | null;
export type Stats = {
  meta?: Meta; available: boolean; locked?: boolean; sessions?: number; from?: string; to?: string; cagrPct?: number | null;
  monthly?: { years: number[]; rows: Record<string, N[]> };
  drawdown?: { t: string[]; dd: N[]; max: { pct: number | null; date: string | null }; current: number | null };
  volatility?: { t: string[]; vol: N[]; window: number; current: number | null; median: number | null };
  histogram?: { counts: number[]; from: number; binWidth: number; days: number; upShare: number; best: number; worst: number; clipped: number };
  box?: { years: (BoxRow & { days: number })[] };
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const crf = (v: number) => (v < 0 ? MINUS : "") + (Math.abs(v) >= 1000 ? cr(Math.abs(v)) : nf(v, 0));
const pc = (v: number, d = 1) => (v < 0 ? MINUS : "") + nf(v, d) + "%";
const sg = (v: number, d = 0) => (v > 0 ? "+" : v < 0 ? MINUS : "") + nf(v, d) + "%";
const row = (t: Table | undefined, k: string) => (t?.rows[k] || []) as N[];
const C = (n: number) => `var(--c${n})`;

/** A chart card. Its accent is its section's own colour (developer file 41: the cards now sit in Price & technicals, Financials and Dividends, whose
 *  other cards and heading use --p-tech, --p-growth and the gold; Chart lab drew them all in gold). */
function Card({ title, sub, icon = "line", children, full, note, help, ac = "--gold" }: { title: string; sub?: string; icon?: string; children: ReactNode; full?: boolean; note?: ReactNode; help?: string; ac?: string }) {
  return (
    <div className={"card acc cl" + (full ? " full" : "")} style={{ "--ac": `var(${ac})` } as CSSProperties}>
      <div className="card-h"><h3><span className="ci"><Icon name={icon} /></span>{title}{help && <ChartHelp id={help} />}</h3>{sub && <span className="s">{sub}</span>}</div>
      <ChartZoom label={title} className="cz-card">{children}</ChartZoom>{note && <p className="cl-note">{note}</p>}
    </div>
  );
}
const Soon = ({ children }: { children: ReactNode }) => <p className="muted cl-empty">{children}</p>;

/* ---------------------------------------------------------------- price statistics */
/** The price statistics, under the price chart of Price & technicals (Silver). */
export function PriceStats({ symbol }: { symbol: string }) {
  const statsQ = useSection<Stats>(symbol, "stats"), stats = statsQ.data;
  // Price statistics are a Silver feature: when the server withholds them, say so instead of showing loading boxes for ever.
  const withheld = statsQ.isError ? <Soon>{statsQ.error?.status === 403 ? "Return patterns, drawdowns and volatility come with every paid plan." : "These charts are not available for this company yet."}</Soon> : null;
  const ok = stats?.available;
  const rows = useMemo(() => (stats?.monthly?.years || []).map((y) => ({ label: String(y), values: stats!.monthly!.rows[String(y)] })), [stats]);
  return (
    <>
      <Gate tier={PLAN_FOR_REPORT_EXTRAS} title="Price statistics" points={["Monthly returns calendar", "Drawdown and volatility", "How big a typical day's move is"]}>
        {stats && !ok && !stats.locked ? <Soon>Not enough price history yet for these charts.</Soon> : (
          <div className="cl-stats">
          {/* task #216 (README 3.8): the five price-statistics cards are one tab group */}
          <TabGroup label="Price statistics" hint="Monthly returns shown here" views={[
            { key: "monthly", label: "Monthly returns", content: <>
            <Card ac="--p-tech" help="monthly-returns" title="Monthly returns" sub="Green months rose, red months fell" icon="growth" note={stats?.cagrPct != null ? `Since ${stats?.from?.slice(0, 4)} the price has ${stats.cagrPct >= 0 ? "grown" : "fallen"} about ${pc(Math.abs(stats.cagrPct))} a year.` : undefined}>
              {rows.length ? <HeatGrid cols={MONTHS} rows={rows} cap={12} fmt={(v) => sg(v, 1).replace("%", "")} label="Monthly returns by year" /> : (withheld || <div className="skeleton" style={{ height: 180 }} />)}
            </Card>
            </> },
            { key: "high", label: "Distance from high", content: <>
            <Card ac="--p-tech" help="drawdown" title="Distance from the running high" sub="0% means a new high" icon="growth" note={stats?.drawdown ? `Deepest fall from a high: ${pc(stats.drawdown.max.pct ?? 0)} (${stats.drawdown.max.date}). Today the price is ${pc(Math.abs(stats.drawdown.current ?? 0))} below its high.` : undefined}>
              {stats?.drawdown ? <AreaSeries t={stats.drawdown.t} v={stats.drawdown.dd} fmt={(x) => pc(x, 0)} color="var(--loss)" ceil={0} /> : (withheld || <div className="skeleton" style={{ height: 200 }} />)}
            </Card>
            </> },
            { key: "bumpy", label: "How bumpy", content: <>
            <Card ac="--p-tech" help="volatility" title="How bumpy the ride is" sub={`${stats?.volatility?.window ?? 60}-session volatility, a year`} icon="gauge" note={stats?.volatility?.current != null ? `Now ${pc(stats.volatility.current, 0)} a year; the usual level is about ${pc(stats.volatility.median ?? 0, 0)}. Higher means bigger swings.` : undefined}>
              {stats?.volatility ? <AreaSeries t={stats.volatility.t} v={stats.volatility.vol} fmt={(x) => pc(x, 0)} color="var(--c1)" floor={0} ref={stats.volatility.median != null ? { y: stats.volatility.median, label: "usual" } : undefined} /> : (withheld || <div className="skeleton" style={{ height: 200 }} />)}
            </Card>
            </> },
            { key: "day", label: "Typical day's move", content: <>
            <Card ac="--p-tech" help="daily-histogram" title="How big a typical day's move is" sub="Share of sessions by daily change" icon="bars" note={stats?.histogram ? `${nf(stats.histogram.upShare, 1)}% of sessions closed higher. Best day ${sg(stats.histogram.best, 1)}, worst ${sg(stats.histogram.worst, 1)}.` : undefined}>
              {stats?.histogram ? <Histo counts={stats.histogram.counts} from={stats.histogram.from} binWidth={stats.histogram.binWidth} /> : (withheld || <div className="skeleton" style={{ height: 200 }} />)}
            </Card>
            </> },
            { key: "years", label: "Daily moves by year", content: <>
            <Card ac="--p-tech" help="daily-box" title="Daily moves by year" sub="Calm years have short boxes" icon="layers">
              {stats?.box ? <Box years={stats.box.years} /> : <div className="skeleton" style={{ height: 240 }} />}
            </Card>
            </> },
          ]} />
          </div>
        )}
      </Gate>
    </>
  );
}

/* ---------------------------------------------------------------- profit & loss */
/** Under Financials, Profit & loss: the revenue-to-profit steps, where each ₹100 of revenue goes, and each line's growth. */
export function PlCharts({ f }: { f?: Financials }) {
  const pl = f?.yearly.pl;
  if (!pl || pl.periods.length < 2) return <Soon>Profit and loss history is not available yet.</Soon>;
  const n = pl.periods.length, last = n - 1, r = (k: string) => row(pl, k);
  const rev = r("revenue"), exp = r("expenses"), op = r("operating_profit"), oi = r("other_income"), fin = r("finance_costs"), dep = r("depreciation"), ex = r("exceptional_items"), pbt = r("profit_before_tax"), tax = r("tax"), np = r("net_profit"), eps = r("eps");
  const v = (a: N[]) => a[last] ?? 0;
  const steps: Step[] = [{ label: "Revenue", value: v(rev), total: true }, { label: "Expenses", value: -Math.abs(v(exp)) }, { label: "Operating profit", value: v(op), total: true }, { label: "Other income", value: v(oi) },
    { label: "Interest", value: -Math.abs(v(fin)) }, { label: "Depreciation", value: -Math.abs(v(dep)) }, ...(Math.abs(v(ex)) > 0.5 ? [{ label: "One-offs", value: v(ex) }] : []), { label: "Profit before tax", value: v(pbt), total: true }, { label: "Tax", value: -Math.abs(v(tax)) }, { label: "Net profit", value: v(np), total: true }];
  const share = (a: N[]) => a.map((x, i) => (x != null && rev[i] ? (Math.abs(x) / (rev[i] as number)) * 100 : null));
  const chg = (a: N[]) => a.map((x, i) => (i && x != null && a[i - 1] ? ((x - (a[i - 1] as number)) / Math.abs(a[i - 1] as number)) * 100 : null)).slice(1);
  const growth: [string, N[]][] = [["Revenue", rev], ["Expenses", exp], ["Operating profit", op], ["Other income", oi], ["Interest", fin], ["Depreciation", dep], ["Profit before tax", pbt], ["Tax", tax], ["Net profit", np], ["EPS", eps]];
  return (
    <div className="cl-grid">
      <Card ac="--p-growth" help="pl-waterfall" title={`From ${pl.periods[last]} revenue to net profit`} sub={`₹ Crore · ${pl.periods[last]}`} icon="profit" full note="Blue bars are totals, green adds to profit and red takes away. The steps show exactly where each rupee of revenue goes before it becomes profit.">
        <Waterfall steps={steps} fmt={crf} fit />
      </Card>
      <Card ac="--p-growth" help="pl-margin-split" title="Where each ₹100 of revenue goes" sub="Share of revenue by year" icon="pie" full note="The green slice is what is left as profit. A growing green slice means the business keeps more of each sale.">
        <MiniBars fit mode="stack" labels={pl.periods} fmt={(x) => nf(x, 0) + "%"} height={230} dim={false} series={[
          { key: "np", label: "Net profit", values: share(np).map((x) => (x != null ? Math.max(0, x) : x)), color: "var(--gain)" }, { key: "tax", label: "Tax", values: share(tax), color: C(4) },
          { key: "dep", label: "Depreciation", values: share(dep), color: C(3) }, { key: "fin", label: "Interest", values: share(fin), color: C(5) }, { key: "exp", label: "Expenses", values: share(exp).map((x, i) => (x != null && rev[i] ? Math.min(x, 100) : x)), color: C(1) }]} />
        <div className="clg"><span><i style={{ background: "var(--gain)" }} />Net profit</span><span><i style={{ background: C(4) }} />Tax</span><span><i style={{ background: C(3) }} />Depreciation</span><span><i style={{ background: C(5) }} />Interest</span><span><i style={{ background: C(1) }} />Expenses</span></div>
      </Card>
      <Card ac="--p-growth" help="yoy-growth" title="Year-on-year growth by line" sub="Percent change on the year before" icon="growth" full note="Green is growth, red is decline. For costs (expenses, interest, tax) green means the cost rose, which can be fine when revenue rose faster.">
        <HeatGrid cols={pl.periods.slice(1)} cap={40} fmt={(x) => sg(x, 0)} label="Year on year growth by line item" rows={growth.map(([label, a]) => ({ label, values: chg(a) }))} />
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- balance sheet */
/** Under Financials, Balance sheet: what the company owns, by kind, and the latest year's assets as a map (both the full width, the map as it was). */
export function BsCharts({ f }: { f?: Financials }) {
  const bs = f?.yearly.bs;
  if (!bs || bs.periods.length < 2) return <Soon>Balance sheet history is not available yet.</Soon>;
  const n = bs.periods.length, last = n - 1, g = (k: string) => row(bs, k);
  const ta = g("total_assets");
  const parts: [string, string, string][] = [["Plant & equipment", "fixed_assets", C(1)], ["Work in progress", "cwip", C(3)], ["Investments", "investments", C(2)], ["Inventories", "inventories", C(4)], ["Receivables", "receivables", C(5)], ["Cash", "cash", "var(--gain)"]];
  const other = ta.map((t, i) => (t == null ? null : Math.max(0, t - parts.reduce((a, [, k]) => a + (g(k)[i] ?? 0), 0))));
  const assets = [...parts.map(([label, k, color]) => ({ key: k, label, values: g(k), color })), { key: "other", label: "Other assets", values: other, color: "var(--s3)" }];
  const tree = assets.map((a) => ({ label: a.label, value: Math.max(0, (a.values[last] as number) ?? 0), color: a.color })).filter((x) => x.value > 0);
  return (
    <div className="cl-grid">
      <Card ac="--p-growth" help="bs-assets" title="What the company owns" sub="Total assets by kind, ₹ Crore" icon="building" full note="Assets are everything the company controls. A big slice of cash and investments gives it room to move; a big slice of work in progress means projects not yet earning.">
        <MiniBars fit mode="stack" labels={bs.periods} fmt={crf} height={240} dim={false} series={assets} />
        <div className="clg">{assets.map((a) => <span key={a.key}><i style={{ background: a.color }} />{a.label}</span>)}</div>
      </Card>
      <Card ac="--p-growth" help="bs-treemap" title={`${bs.periods[last]} assets at a glance`} sub="Box size is share of total assets" icon="layers" full>
        {tree.length ? <Treemap items={tree} fmt={(x) => "₹" + crf(x) + " Cr"} /> : <Soon>No breakdown available.</Soon>}
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- cash flow */
/** Under Financials, Cash flow: how the latest year's three streams add up to the change in cash. */
export function CfCharts({ f }: { f?: Financials }) {
  const cf = f?.yearly.cf;
  if (!cf || cf.periods.length < 2) return <Soon>Cash flow history is not available yet.</Soon>;
  const last = cf.periods.length - 1, g = (k: string) => row(cf, k), v = (k: string) => g(k)[last] ?? 0;
  const steps: Step[] = [{ label: "Operations", value: v("operating") }, { label: "Investing", value: v("investing") }, { label: "Financing", value: v("financing") }, { label: "Net change in cash", value: v("net_cash_flow"), total: true }];
  return (
    <div className="cl-grid">
      <Card ac="--p-growth" help="cf-bridge" title={`${cf.periods[last]} cash bridge`} sub="₹ Crore" icon="profit" full note="How the year's three streams add up to the change in cash.">
        <Waterfall steps={steps} fmt={crf} height={250} fit />
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- corporate actions */
const kind = (t: string) => (/dividend/i.test(t) ? "dividend" : /bonus/i.test(t) ? "bonus" : /split/i.test(t) ? "split" : /right/i.test(t) ? "rights" : "other");
/** In Dividends, "Bonus and splits": every dividend, bonus issue, split and rights offer on one timeline. */
export function ActionsTimeline({ e }: { e?: Events }) {
  const events = (e?.actions || []).map((a) => ({ date: a.date, label: a.title, kind: kind(a.type) }));
  return (
    <div className="cl-grid">
      <Card help="events-timeline" title="Dividends, bonus and splits" sub="Corporate actions over time" icon="coins" full note="Dots on the line are cash dividends; larger dots above it are bonus issues, splits or rights offers.">
        {events.length ? <Timeline events={events} /> : <Soon>No corporate actions on record.</Soon>}
      </Card>
    </div>
  );
}
