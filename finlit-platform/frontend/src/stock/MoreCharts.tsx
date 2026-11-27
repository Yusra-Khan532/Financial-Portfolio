// Developer file 41 (founder, 25 Nov 2026): "section 08 shows the price history above too, same with profit and loss, cash flow, balance sheet above, and
// ownership and valuation in the lower sections, so merge section 8 into these and remove it". The Chart lab is gone; the charts that no other section
// draws live here and are shown inside their own sections: the price statistics in Price & technicals, the statement charts under each statement of
// Financials (they follow its Consolidated / Standalone switch), and the corporate actions timeline in Dividends. Its other charts repeated a section's own.
import { useMemo, type ReactNode } from "react";
import { Icon } from "../lib/icons";
import { Gate } from "../components/Gate";
import { Box, HeatGrid, Histo, Timeline, Waterfall, type BoxRow, type Step } from "../charts/Atlas";
import { RiskLine } from "../charts/RiskLine";
import { useSection, type Events, type Financials, type Meta, type Table } from "../lib/api";
import { MINUS, cr, nf } from "../lib/format";
import { TabGroup } from "../components/TabGroup";
import { ChartHelp } from "../components/ChartHelp";
import { ChartZoom } from "../components/ChartZoom";
import { PLAN_FOR_REPORT_EXTRAS } from "../lib/planGates";
import { HundredChart, ProfitBridge } from "./ProfitCharts";
import { bridge, type PlRows } from "./plBridge";

type N = number | null;
export type Stats = {
  meta?: Meta; available: boolean; locked?: boolean; sessions?: number; from?: string; to?: string; cagrPct?: number | null;
  monthly?: { years: number[]; rows: Record<string, N[]> };
  drawdown?: { t: string[]; dd: N[]; max: { pct: number | null; date: string | null }; current: number | null; lastHigh?: string | null };
  volatility?: { t: string[]; vol: N[]; window: number; current: number | null; median: number | null; high?: { v: number | null; date: string } | null };
  histogram?: { counts: number[]; from: number; binWidth: number; days: number; upShare: number; best: number; worst: number; clipped: number };
  box?: { years: (BoxRow & { days: number })[] };
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const crf = (v: number) => (v < 0 ? MINUS : "") + (Math.abs(v) >= 1000 ? cr(Math.abs(v)) : nf(v, 0));
const pc = (v: number, d = 1) => (v < 0 ? MINUS : "") + nf(v, d) + "%";
const sg = (v: number, d = 0) => (v > 0 ? "+" : v < 0 ? MINUS : "") + nf(v, d) + "%";
const row = (t: Table | undefined, k: string) => (t?.rows[k] || []) as N[];
const day = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const mon = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" });
/** Developer file 47: a statistic stored before the server kept the last session ends its line a few days early; end it on the last session's own value
 *  (`current`, which is that day's), so the line's end and the figure above it agree. */
export function toLast(t: string[], v: N[], to: string | undefined, current: number | null | undefined): { t: string[]; v: N[] } {
  return to && current != null && t.length && t[t.length - 1] < to ? { t: [...t, to], v: [...v, current] } : { t, v };
}
const lowest = (v: N[]) => v.reduce<number>((k, x, i) => (x != null && (k < 0 || x < (v[k] as number)) ? i : k), -1);
const highest = (v: N[]) => v.reduce<number>((k, x, i) => (x != null && (k < 0 || x > (v[k] as number)) ? i : k), -1);

/** Distance from the running high: today's gap, the deepest fall and the last new high above the line; the deepest point and today marked on it. */
function DrawdownChart({ s }: { s: Stats }) {
  const dd = s.drawdown!, { t, v } = toLast(dd.t, dd.dd, s.to, dd.current);
  const at = dd.max.date ? t.indexOf(dd.max.date) : -1, deep = at >= 0 ? at : lowest(v), cur = dd.current, end = t.length - 1;
  const today = cur == null ? null : cur >= 0 ? "at a new high" : `${pc(Math.abs(cur))} below its high`;
  const marks = [...(deep >= 0 && deep < end - 2 ? [{ i: deep, text: `${pc(dd.max.pct ?? (v[deep] as number))} · ${mon(dd.max.date ?? t[deep])}` }] : []),
    ...(cur != null ? [{ i: end, text: `Today ${cur >= 0 ? "0%" : pc(cur)}` }] : [])];
  return <RiskLine t={t} v={v} fmt={(x) => pc(x, 0)} color="var(--loss)" ceil={0} marks={marks}
    label={`Distance from the running high, ${t[0].slice(0, 4)} to ${t[end].slice(0, 4)}.${today ? ` Today ${today}.` : ""}${dd.max.pct != null ? ` Deepest fall ${pc(dd.max.pct)}${dd.max.date ? ` on ${day(dd.max.date)}` : ""}.` : ""}`}
    facts={[...(today ? [{ k: "Today", v: today }] : []),
      ...(dd.max.pct != null ? [{ k: "Deepest fall", v: pc(dd.max.pct), note: dd.max.date ? day(dd.max.date) : undefined }] : []),
      ...(dd.lastHigh ? [{ k: "Last new high", v: day(dd.lastHigh) }] : [])]} />;
}

/** How bumpy the ride is: now, the usual level and the highest above the line; the usual level drawn across, the highest and now marked. */
function VolatilityChart({ s }: { s: Stats }) {
  const vo = s.volatility!, { t, v } = toLast(vo.t, vo.vol, s.to, vo.current);
  const top = vo.high?.v != null ? { v: vo.high.v, date: vo.high.date } : (() => { const i = highest(v); return i >= 0 ? { v: v[i] as number, date: t[i] } : null; })();
  const ti = top ? (t.indexOf(top.date) >= 0 ? t.indexOf(top.date) : highest(v)) : -1, end = t.length - 1;
  const marks = [...(ti >= 0 && ti < end - 2 ? [{ i: ti, text: `${pc(v[ti] as number, 0)} · ${mon(t[ti])}` }] : []), ...(vo.current != null ? [{ i: end, text: `Now ${pc(vo.current, 0)}` }] : [])];
  return <RiskLine t={t} v={v} fmt={(x) => pc(x, 0)} color="var(--c1)" floor={0} marks={marks}
    usual={vo.median != null ? { y: vo.median, text: `usual ${pc(vo.median, 0)}` } : undefined}
    label={`Volatility over ${vo.window} sessions, a year, ${t[0].slice(0, 4)} to ${t[end].slice(0, 4)}.${vo.current != null ? ` Now ${pc(vo.current, 0)}` : ""}${vo.median != null ? `; usually ${pc(vo.median, 0)}.` : "."}`}
    facts={[...(vo.current != null ? [{ k: "Now", v: `${pc(vo.current, 0)} a year` }] : []), ...(vo.median != null ? [{ k: "Usual", v: pc(vo.median, 0), dash: true }] : []),
      ...(top ? [{ k: "Highest", v: pc(top.v, 0), note: mon(top.date) }] : [])]} />;
}

/** A chart card. Its accent is its section's own colour (developer file 41: the cards now sit in Price & technicals, Financials and Dividends, whose
 *  other cards and heading use --p-tech, --p-growth and the gold; Chart lab drew them all in gold). */
function Card({ title, sub, icon = "line", children, full, note, help }: { title: string; sub?: string; icon?: string; children: ReactNode; full?: boolean; note?: ReactNode; help?: string }) {
  return (
    <div className={"card acc cl" + (full ? " full" : "")}>{/* developer file 45: every card's edge is the brand gold */}
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
            <Card help="monthly-returns" title="Monthly returns" sub="Green months rose, red months fell" icon="growth" note={stats?.cagrPct != null ? `Since ${stats?.from?.slice(0, 4)} the price has ${stats.cagrPct >= 0 ? "grown" : "fallen"} about ${pc(Math.abs(stats.cagrPct))} a year.` : undefined}>
              {rows.length ? <HeatGrid cols={MONTHS} rows={rows} cap={12} fmt={(v) => sg(v, 1).replace("%", "")} label="Monthly returns by year" /> : (withheld || <div className="skeleton" style={{ height: 180 }} />)}
            </Card>
            </> },
            { key: "high", label: "Distance from high", content: <>
            {/* developer file 47: the facts the note gave sit above the line, and the line marks them */}
            <Card help="drawdown" title="Distance from the running high" sub="How far the price is below its highest close so far; 0% is a new high" icon="growth">
              {stats?.drawdown ? <DrawdownChart s={stats} /> : (withheld || <div className="skeleton" style={{ height: 200 }} />)}
            </Card>
            </> },
            { key: "bumpy", label: "How bumpy", content: <>
            <Card help="volatility" title="How bumpy the ride is" sub={`Daily swings over ${stats?.volatility?.window ?? 60} sessions, as a yearly figure; higher is bumpier`} icon="gauge">
              {stats?.volatility ? <VolatilityChart s={stats} /> : (withheld || <div className="skeleton" style={{ height: 200 }} />)}
            </Card>
            </> },
            { key: "day", label: "Typical day's move", content: <>
            <Card help="daily-histogram" title="How big a typical day's move is" sub="Share of sessions by daily change" icon="bars" note={stats?.histogram ? `${nf(stats.histogram.upShare, 1)}% of sessions closed higher. Best day ${sg(stats.histogram.best, 1)}, worst ${sg(stats.histogram.worst, 1)}.` : undefined}>
              {stats?.histogram ? <Histo counts={stats.histogram.counts} from={stats.histogram.from} binWidth={stats.histogram.binWidth} /> : (withheld || <div className="skeleton" style={{ height: 200 }} />)}
            </Card>
            </> },
            { key: "years", label: "Daily moves by year", content: <>
            <Card help="daily-box" title="Daily moves by year" sub="Calm years have short boxes" icon="layers">
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
/** Under Financials, Profit & loss: each line's growth (first), the revenue-to-profit steps and where each ₹100 of income goes. */
export function PlCharts({ f }: { f?: Financials }) {
  const pl = f?.yearly.pl;
  if (!pl || pl.periods.length < 2) return <Soon>Profit and loss history is not available yet.</Soon>;
  const n = pl.periods.length, last = n - 1, r = (k: string) => row(pl, k), rows = pl.rows as PlRows;
  const rev = r("revenue"), exp = r("expenses"), op = r("operating_profit"), oi = r("other_income"), fin = r("finance_costs"), dep = r("depreciation"), pbt = r("profit_before_tax"), tax = r("tax"), np = r("net_profit"), eps = r("eps");
  // developer file 42: the steps add up (plBridge: operating costs are revenue less operating profit; "expenses" is total expenses)
  const steps = bridge(rows, last);
  const chg = (a: N[]) => a.map((x, i) => (i && x != null && a[i - 1] ? ((x - (a[i - 1] as number)) / Math.abs(a[i - 1] as number)) * 100 : null)).slice(1);
  const growth: [string, N[]][] = [["Revenue", rev], ["Total expenses", exp], ["Operating profit", op], ["Other income", oi], ["Interest", fin], ["Depreciation", dep], ["Profit before tax", pbt], ["Tax", tax], ["Net profit", np], ["EPS", eps]];
  // developer file 43 (founder, 27 Nov 2026: "put profit and loss in charts into 3 tabs so that it reduces the length of the page"): the three charts are the
  // report's view tabs, one at a time (they stood one under the other, about 1,640 px on a desktop)
  return (
    <div className="pl-tabs">
      {/* developer file 44 (founder, 27 Nov 2026: "let's first show Growth by line"): Growth by line is the first tab and opens first */}
      <TabGroup label="Profit and loss in charts" views={[
        { key: "growth", label: "Growth by line", content: <>
      <Card help="yoy-growth" title="Year-on-year growth by line" sub="Percent change on the year before" icon="growth" full note="Green is growth, red is decline. For costs (expenses, interest, tax) green means the cost rose, which can be fine when revenue rose faster.">
        <HeatGrid cols={pl.periods.slice(1)} cap={40} fmt={(x) => sg(x, 0)} label="Year on year growth by line item" rows={growth.map(([label, a]) => ({ label, values: chg(a) }))} />
      </Card>
        </> },
        { key: "walk", label: "Revenue to net profit", content: <>
      <Card help="pl-waterfall" title={`From ${pl.periods[last]} revenue to net profit`} sub={`₹ Crore · ${pl.periods[last]}`} icon="profit" full note="Blue rows are totals, green adds to profit and red takes away. Revenue and operating costs are much larger than the later steps, so their bars are cut short (the slanted break) and the scale fits the steps after them; their full amounts are on the right.">
        {steps ? <ProfitBridge steps={steps} year={pl.periods[last]} /> : <Soon>A figure this walk needs is missing for {pl.periods[last]}.</Soon>}
      </Card>
        </> },
        { key: "hundred", label: "Where each ₹100 goes", content: <>
      <Card help="pl-margin-split" title="Where each ₹100 of income goes" sub="Revenue plus other income, by year" icon="pie" full note="Operating costs take most of every ₹100, so their part is cut short (the slanted break) and the scale below it shows the rest: interest, depreciation, tax and the net profit left (green). Point at a year to read all its parts. Income here includes other income, so the profit share is a little lower than the net margin on revenue in the Revenue to net profit tab.">
        <HundredChart periods={pl.periods} rows={rows} />
      </Card>
        </> },
      ]} />
    </div>
  );
}

/* ---------------------------------------------------------------- balance sheet: no charts (developer file 47, founder 27 Nov 2026: "remove balance sheet in charts") */

/* ---------------------------------------------------------------- cash flow */
/** Under Financials, Cash flow: how the latest year's three streams add up to the change in cash. */
export function CfCharts({ f }: { f?: Financials }) {
  const cf = f?.yearly.cf;
  if (!cf || cf.periods.length < 2) return <Soon>Cash flow history is not available yet.</Soon>;
  const last = cf.periods.length - 1, g = (k: string) => row(cf, k), v = (k: string) => g(k)[last] ?? 0;
  const steps: Step[] = [{ label: "Operations", value: v("operating") }, { label: "Investing", value: v("investing") }, { label: "Financing", value: v("financing") }, { label: "Net change in cash", value: v("net_cash_flow"), total: true }];
  return (
    <div className="cl-grid">
      <Card help="cf-bridge" title={`${cf.periods[last]} cash bridge`} sub="₹ Crore" icon="profit" full note="How the year's three streams add up to the change in cash.">
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
