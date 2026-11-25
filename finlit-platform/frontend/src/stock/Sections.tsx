import { HScroll } from "../components/HScroll";
import { useContext, useEffect, useMemo, useState } from "react";
import { fromYears, priceFrom } from "../lib/chartAxis";
import { Icon } from "../lib/icons";
import { Gate, OpenAccess, TierChip } from "../components/Gate";
import { Info } from "../components/Info";
import { PriceChart } from "../charts/PriceChart";
import { IntradayChart } from "../charts/IntradayChart";
import { FinChart, type FinKind } from "../charts/FinChart";
import { RsiGauge, Spark } from "../charts/Small";
import { ChartHelp } from "../components/ChartHelp";
import { MINUS, cr, dateIN, nf, signed } from "../lib/format";
import { useBasis, setBasis, wasAutomatic, wasChosen, type Basis } from "../lib/basis";
import { useIntraday, usePrice, useSection, type ApiError, type Financials, type Intraday, type IntradayRange, type Ratios, type Summary, type Table } from "../lib/api";
import { barSpan, changePct, istDay, status as intradayStatus } from "../lib/intraday";
import { useAuth } from "../lib/auth";
import { finTiles, yoy } from "./derive";
import { PL_INFO, PL_LABEL, plCell } from "./plDefinitions";
import { useUI, type Plan } from "../lib/ui";
import { Plain } from "../components/Plain";
import { ChartZoom } from "../components/ChartZoom";
import { TabGroup } from "../components/TabGroup";
import { ForecastCard } from "./ForecastCard";
import { BsCharts, CfCharts, PlCharts, PriceStats } from "./MoreCharts";
import { Defer } from "./Defer";
import { sectionNo } from "../lib/sectionNav";

const css = (v: string) => `var(${v})`;
/** Section header (task #216, compact): the number large (40 px; 32 on phones), a thin rule, the eyebrow with the plan badge, the title (24 px), and under it
 *  one line: the counts as coloured chips (if any), a dot, then the description (13 px, muted). Controls (toggles, a link) go on the right in `aside`.
 *  The number comes from the report's one order (lib/sectionNav); a heading without one keeps its icon tile. */
import "../styles/insights.css";
import { PLAN_FOR_REPORT_EXTRAS } from "../lib/planGates";
export type HeadCount = { n: number; label: string; tone: "red" | "amb" | "pos" };
/** Task #312 (developer file 20, the check): "above its 200-day average, which suggests the longer trend is healthy" sat beside FinLit's long-term view
 *  of a downtrend (Reliance, 22 Nov: −32, "Bounce in a downtrend"). Above the 200-day average while the 50-day average is still below it is a rise after a
 *  fall, not yet a healthy longer trend, and is said so. */
export function longTrend(t: { vsEma200Pct: number | null; ema50: number | null; ema200: number | null }): string {
  if (t.vsEma200Pct == null) return "";
  if (t.vsEma200Pct < 0) return "which suggests the longer trend is weak";
  if (t.ema50 != null && t.ema200 != null && t.ema50 < t.ema200) return "after a fall: its 50-day average is still below the 200-day, so the longer trend has not turned up yet";
  return "which suggests the longer trend is healthy";
}

export function CountChips({ counts }: { counts: HeadCount[] }) {
  return <span className="cchips">{counts.map((c) => <span key={c.label} className={"cchip " + (c.n === 0 ? "zero" : c.tone)}><b>{c.n}</b> {c.label}</span>)}</span>;
}
export function SectionHead({ id, no, icon, tier, title, sub, color, aside, counts }: { id: string; no: string; icon: string; tier?: "basic" | "silver" | "gold"; title: string; sub?: string; color: string; aside?: React.ReactNode; counts?: HeadCount[] }) {
  // developer file 41: a report section's number comes from the one order in lib/sectionNav (pass its name only); "07 · Name" still works elsewhere
  const n = sectionNo(id), m = /^(\d{1,2})\s*·\s*(.+)$/.exec(no) ?? (n ? [no, n, no] : null);
  return (
    <div className="sh" id={id} style={{ "--sc": `var(${color})` } as React.CSSProperties}>
      <div className="sh-l">
        {m ? <><span className="sh-n" aria-hidden="true">{m[1]}</span><span className="sh-rule" aria-hidden="true" /></> : <div className="sh-ic"><Icon name={icon} /></div>}
        <div><div className="no">{m ? m[2] : no} {tier && <TierChip tier={tier} />}</div><h2>{title}</h2>
          {(counts?.length || sub) ? <p className="sh-desc">{counts?.length ? <CountChips counts={counts} /> : null}{counts?.length && sub ? <span className="sh-dot" aria-hidden="true">·</span> : null}{sub ? <span>{sub}</span> : null}</p> : null}
        </div>
      </div>
      {aside ? <div className="sh-r">{aside}</div> : null}
    </div>
  );
}

/* ---------------- Price & technicals ---------------- */
const RANGES = ["1M", "6M", "1Y", "3Y", "5Y", "MAX"];
/** Intraday ranges (Dhan) and the plan each needs; every one needs a signed-in account, except on the free example company. */
const INTRA: [IntradayRange, Plan][] = [["1D", "basic"], ["5D", PLAN_FOR_REPORT_EXTRAS], ["1M", PLAN_FOR_REPORT_EXTRAS]];
const CAP: React.CSSProperties = { fontSize: "var(--fs-12)", padding: "0 6px 0 8px", alignSelf: "center", whiteSpace: "nowrap" };
export function PriceSection({ s, symbol, ratios }: { s: Summary; symbol: string; ratios?: Ratios }) {
  const [range, setRange] = useState("1Y"), [from, setFrom] = useState<number | undefined>();
  const [intra, setIntra] = useState<IntradayRange | null>(null);
  const [ind, setInd] = useState({ e50: true, e200: false, vol: true });
  const { has, upgrade } = useUI();
  const { user } = useAuth();
  const open = useContext(OpenAccess);
  const mayIntra = (tier: Plan) => open || (!!user && has(tier));
  const { data: full, isLoading, isError } = usePrice(symbol, from ? "MAX" : range);
  const iq = useIntraday(symbol, intra ?? "1D", !!intra);
  const idata = intra && iq.data?.range === intra ? iq.data : undefined;
  const data = useMemo(() => (full ? priceFrom(full, from) : full), [full, from]);
  const t = data?.technical, series = data?.series, c = series?.c || [];
  const chg = intra ? (idata?.series ? changePct(idata) : null) : c.length > 1 ? (c[c.length - 1] / c[0] - 1) * 100 : null;
  const gold = has("gold"), e = (k: string, on: boolean) => gold ? on : k === "e50" ? true : k === "vol";
  const pickIntra = (r: IntradayRange, tier: Plan) => {
    if (mayIntra(tier)) { setIntra(r); setFrom(undefined); return; }
    upgrade(tier, tier === "basic" ? "Intraday charts come with a free account." : "The 5D and 1M intraday charts are part of Silver.");
  };
  return (
    <section className="block" style={{ "--sc": "var(--p-tech)" } as React.CSSProperties}>
      <SectionHead id="price" no="Price & technicals" icon="line" tier="basic" title="How the stock has traded" sub="Intraday bars from Dhan for 1D, 5D and 1M; daily closes up to one year, weekly closes beyond. Hover the chart for detail." color="--p-tech" />
      {intra && idata?.series && chg != null && <Plain tone={chg >= 0 ? "good" : "warn"}>Since the open {idata.sessions.length > 1 ? "of " + istDay(idata.sessions[0]) : "on " + istDay(idata.session ?? "")}, the price {chg >= 0 ? "rose" : "fell"} {nf(Math.abs(chg), 2)}%.</Plain>}
      {!intra && chg != null && <Plain tone={chg >= 0 ? "good" : "warn"}>Over this period the price {chg >= 0 ? "rose" : "fell"} {nf(Math.abs(chg), 1)}%.{t?.vsEma200Pct != null && <> It trades {nf(Math.abs(t.vsEma200Pct), 1)}% {t.vsEma200Pct < 0 ? "below" : "above"} its 200-day average, {longTrend(t)}.</>}</Plain>}
      <div className="grid g3">
        <div className="card acc span2" style={{ "--ac": "var(--p-tech)" } as React.CSSProperties}>
          <div className="stats">
            {[["52W high", s.range52.high == null ? "—" : "₹" + nf(s.range52.high)], ["52W low", s.range52.low == null ? "—" : "₹" + nf(s.range52.low)], [intra ? "Since the open" : "Range change", chg == null ? "—" : signed(chg)], ["vs 200-day average", t?.vsEma200Pct == null ? "—" : signed(t.vsEma200Pct)]].map(([k, v]) => <div className="stat" key={k}><div className="k">{k}</div><div className={"v " + (k === "Range change" || k === "Since the open" || k.startsWith("vs") ? (v.includes("▼") ? "neg" : v.includes("▲") ? "pos" : "") : "")}>{v}</div></div>)}
          </div>
          <ChartZoom label="Price chart" className="cz-r">
          <div className="tools">
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, minWidth: 0, maxWidth: "100%" }}>
              <div className="seg" role="group" aria-label="Intraday range"><span className="faint" style={CAP}>Intraday</span>{INTRA.map(([r, tier]) => { const ok = mayIntra(tier); return <button key={r} aria-pressed={intra === r} aria-label={ok ? `${r} intraday` : `${r} intraday (${tier === "basic" ? "sign in" : "Paid plans"})`} onClick={() => pickIntra(r, tier)}>{!ok && <Icon name="lock" />}{r}</button>; })}</div>
              <div className="seg" role="group" aria-label="Range"><span className="faint" style={CAP}>Daily</span>{RANGES.map((r) => <button key={r} aria-pressed={!intra && !from && range === r} onClick={() => { setRange(r); setFrom(undefined); setIntra(null); }}>{r}</button>)}</div>
              <label className="faint" style={{ fontSize: "var(--fs-12)" }}>From year <select aria-label="From year" value={intra ? "" : from ?? ""} onChange={(e) => { setFrom(e.target.value ? Number(e.target.value) : undefined); setIntra(null); }}><option value="">Any</option>{fromYears().map((y) => <option key={y} value={y}>{y}</option>)}</select></label><ChartHelp id="price-section" /></div>
            {gold ? <div className="seg" role="group" aria-label="Indicators">
              {!intra && <><button aria-pressed={ind.e50} onClick={() => setInd((x) => ({ ...x, e50: !x.e50 }))}>EMA 50</button><button aria-pressed={ind.e200} onClick={() => setInd((x) => ({ ...x, e200: !x.e200 }))}>EMA 200</button></>}<button aria-pressed={ind.vol} onClick={() => setInd((x) => ({ ...x, vol: !x.vol }))}>Volume</button></div>
              : <span className="tier gold" style={{ cursor: "pointer" }} onClick={() => upgrade("gold", "More indicators come with Gold.")}>More indicators in Gold</span>}
          </div>
          {intra ? <IntradayBody q={iq} data={idata} showVol={e("vol", ind.vol)} chg={chg} /> : <>
          {isLoading && <div className="skeleton" style={{ height: 340 }} />}
          {isError && <p className="muted">Price history is unavailable right now.</p>}
          {data && series && c.length > 1 && <PriceChart data={data} showEma50={e("e50", ind.e50)} showEma200={e("e200", ind.e200)} showVol={e("vol", ind.vol)} />}
          {data && !data.complete && <p className="faint" style={{ fontSize: "var(--fs-12)", margin: "10px 0 0" }}>History for this company starts {data.startsAt ? dateIN(data.startsAt, { month: "short", year: "numeric" }) : "later"}, so this range is shorter than {range}.</p>}
          {data && <div className="legend"><span className={"chip " + ((chg ?? 0) >= 0 ? "up" : "down")}>{signed(chg)} over the period</span><span><i className="ln" style={{ background: "var(--line)" }} />Close</span>{e("e50", ind.e50) && <span><i className="ln" style={{ background: "var(--c2)" }} />EMA 50</span>}{e("e200", ind.e200) && <span><i className="ln" style={{ background: "var(--c3)" }} />EMA 200</span>}{e("vol", ind.vol) && <span><i style={{ background: "var(--c4)", opacity: 0.6 }} />Volume</span>}{data.provisionalLastBar && <span className="faint">Latest bar is the live quote</span>}</div>}
          </>}
          </ChartZoom>
        </div>
        <Gate tier="gold" title="Advanced technical score" points={["RSI momentum gauge and trend signals", "Price vs 50- and 200-day averages", "Returns across every holding period"]}>
          <div className="card acc" style={{ "--ac": "var(--p-tech)", height: "100%" } as React.CSSProperties}>
            <div className="card-h"><h3><span className="ci"><Icon name="activity" /></span>Momentum<ChartHelp id="momentum" /></h3><TierChip tier="gold" /></div>
            {t?.rsi14 != null && <RsiGauge value={t.rsi14} />}
            <div className="mrow" style={{ marginTop: 6 }}><span className="k">What is RSI? <Info g={ratios?.glossary.rsi14} /></span><span className="v faint" style={{ fontWeight: 400, fontSize: "var(--fs-13)" }}>0 to 100 scale</span></div>
            <div className="mrow"><span className="k">vs 50-day average</span><span className={"v " + ((t?.vsEma50Pct ?? 0) < 0 ? "neg" : "pos")}>{signed(t?.vsEma50Pct)}</span></div>
            <div className="mrow"><span className="k">vs 200-day average</span><span className={"v " + ((t?.vsEma200Pct ?? 0) < 0 ? "neg" : "pos")}>{signed(t?.vsEma200Pct)}</span></div>
            <div className="label" style={{ margin: "16px 0 6px" }}>Total return (price + dividends)</div>
            <ReturnBars rows={s.returns} />
          </div>
        </Gate>
      </div>
      {/* developer file 41: the price statistics of the old Chart lab (section 08), drawn when the section comes near the screen */}
      <div className="rp-more"><p className="label rp-more-h">Price statistics <TierChip tier={PLAN_FOR_REPORT_EXTRAS} /></p><Defer all={false} onShow={noop} height={560}><PriceStats symbol={symbol} /></Defer></div>
    </section>
  );
}
const noop = () => {};

/** The intraday chart with what it shows (session, source, as-of time), or why it cannot be shown. */
function IntradayBody({ q, data, showVol, chg }: { q: { isPending: boolean; isError: boolean; error: ApiError | null }; data?: Intraday; showVol: boolean; chg: number | null }) {
  if (!data && q.isError) return <p className="muted">{q.error?.body.detail || "Intraday prices are unavailable right now."}</p>;
  if (!data) return <div className="skeleton" style={{ height: 340 }} />;
  const st = intradayStatus(data), sr = data.series, n = sr?.t.length ?? 0;
  return (
    <>
      <div className="faint" style={{ fontSize: "var(--fs-12)", margin: "0 0 10px", display: "flex", flexWrap: "wrap", gap: "2px 12px" }}><b style={{ color: "var(--text)", fontWeight: 600 }}>{st.title}</b><span>{st.asOf}</span></div>
      {st.note && <p className={data.stale ? "neg" : "faint"} style={{ fontSize: "var(--fs-12)", margin: "0 0 10px" }}>{st.note}</p>}
      {!data.available && <p className="muted">{data.detail || "No recent trades."}</p>}
      {sr && n > 1 && <IntradayChart data={data} showVol={showVol} />}
      {sr && n === 1 && <p className="muted">One price bar so far in this session: ₹{nf(sr.c[0])}, {barSpan(sr.t[0], data.interval)} IST.</p>}
      {sr && n > 0 && <div className="legend"><span className={"chip " + ((chg ?? 0) >= 0 ? "up" : "down")}>{signed(chg)} since the open</span><span><i className="ln" style={{ background: "var(--line)" }} />Close</span>{showVol && <span><i style={{ background: "var(--c4)", opacity: 0.6 }} />Volume</span>}<span className="faint">Times are Indian (IST)</span></div>}
    </>
  );
}

function ReturnBars({ rows }: { rows: Summary["returns"] }) {
  const have = rows.filter((r) => r.total != null);
  const max = Math.max(...have.map((r) => Math.abs(r.total as number)), 1);
  return (
    <div>
      {rows.map((r) => (
        <div className="rrow" key={r.period}><span className="muted">{r.period}</span>
          <div className="rtrack">{r.total != null && <b style={r.total >= 0 ? { left: "50%", width: `${(Math.abs(r.total) / max) * 50}%`, background: "linear-gradient(90deg,color-mix(in srgb,var(--gain) 45%,transparent),var(--gain))" } : { right: "50%", width: `${(Math.abs(r.total) / max) * 50}%`, background: "linear-gradient(270deg,color-mix(in srgb,var(--loss) 45%,transparent),var(--loss))" }} />}</div>
          <span className={r.total == null ? "faint" : r.total >= 0 ? "pos" : "neg"} style={{ textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }} title={r.withheld || undefined}>{r.total == null ? (r.withheld ? "held back" : "n/a") : signed(r.total)}</span></div>
      ))}
      <p className="faint" style={{ fontSize: "var(--fs-12)", margin: "10px 0 0" }}>“n/a” means this company's price history does not cover that period.{rows.some((r) => r.withheld) && " “Held back” means the dividend part of that figure did not pass our check against the company's own earnings, so we do not show it rather than show a number we cannot stand behind."}</p>
    </div>
  );
}

/* ---------------- Financials ---------------- */
/** Missing financial years between the shown ones ("FY14 to FY24"), so columns that are not consecutive are never read as if they were (task #190). */
export function yearGaps(periods: string[]): string[] {
  const ys = periods.map((p) => /^FY(\d{2})$/.exec(p)).map((m) => (m ? Number(m[1]) : NaN));
  const out: string[] = [];
  for (let i = 1; i < ys.length; i++) {
    const a = ys[i - 1], b = ys[i];
    if (Number.isFinite(a) && Number.isFinite(b) && b - a > 1) out.push(b - a === 2 ? `FY${String(a + 1).padStart(2, "0")}` : `FY${String(a + 1).padStart(2, "0")} to FY${String(b - 1).padStart(2, "0")}`);
  }
  return out;
}

export function FinancialsSection({ f: page }: { f?: Financials }) {
  const [kind, setKind] = useState<FinKind>("pl");
  const basis = useBasis(page?.meta.symbol ?? ""), sym = page?.meta.symbol ?? "";
  // Task #190: the reader can switch THIS section between consolidated and standalone accounts (the rest of the page keeps its own basis).
  // The other basis is asked for only when its button is pressed (asking for an unstored basis makes the server build it). Its figures are shown only
  // once an answer for exactly that basis is here: never the previous basis's numbers under the new label (the reason the old switch was removed).
  const [pick, setPick] = useState<{ sym: string; b: Basis } | null>(null);
  const chosen: Basis | null = pick && pick.sym === sym ? pick.b : null;
  const wantOther = !!page && chosen != null && chosen !== page.meta.statement;
  const other = useSection<Financials>(sym, "financials", wantOther, chosen ?? undefined);
  const otherReady = wantOther && other.data?.meta.symbol === sym && other.data.meta.statement === chosen ? other.data : undefined;
  const f = wantOther ? otherReady : page;
  const shownBasis: Basis | undefined = f?.meta.statement;
  const empty = (x?: Financials) => !!x && x.yearly.pl.periods.length === 0 && x.quarterly.pl.periods.length === 0;
  // a basis found to have no statements stays greyed out (with its reason) for this company, also after switching back
  const [none, setNone] = useState<string[]>([]);
  useEffect(() => { if (otherReady && empty(otherReady) && chosen && !none.includes(sym + ":" + chosen)) setNone((n) => [...n, sym + ":" + chosen]); }, [otherReady, chosen, sym, none]);
  const isNone = (b: Basis) => none.includes(sym + ":" + b) || (b === chosen && !!otherReady && empty(otherReady));
  const noneFor: Basis | null = chosen && isNone(chosen) ? chosen : null;
  // A company whose consolidated accounts are short (an insurer that began consolidating lately, a merger) often has a longer standalone history:
  // look at it quietly, and switch to it unless the reader has chosen. The switch is shown on the page and one press undoes it.
  const years = page?.yearly.pl.periods.length ?? 0;
  const alt = useSection<Financials>(sym, "financials", !!page && basis === "consolidated" && years > 0 && years < 5 && !wasChosen(sym), "standalone");
  const altYears = alt.data?.yearly.pl.periods.length ?? 0;
  useEffect(() => { if (basis === "consolidated" && years > 0 && altYears >= years + 2) setBasis(sym, "standalone", true); }, [basis, years, altYears, sym]);
  if (!page) return <section className="block"><SectionHead id="financials" no="Financials" icon="bars" tier="basic" title="Profit and loss, balance sheet and cash flow, quarterly and yearly" color="--p-growth" /><div className="skeleton" style={{ height: 380 }} /></section>;
  const name = (b: Basis) => (b === "consolidated" ? "Consolidated" : "Standalone");
  const active: Basis = chosen ?? page.meta.statement;
  const basisSeg = (
    <div className="seg" role="group" aria-label="Accounts: consolidated or standalone">
      {(["consolidated", "standalone"] as Basis[]).map((b) => {
        const off = isNone(b);
        return <button key={b} type="button" aria-pressed={active === b} disabled={off && active !== b}
          title={b === "consolidated" ? "The group: the company and its subsidiaries together" + (off ? ". Not available for this company." : "") : "The parent company alone, without its subsidiaries" + (off ? ". Not available for this company." : "")}
          onClick={() => setPick(b === page.meta.statement ? null : { sym, b })}>{name(b)}</button>;
      })}
    </div>);
  // the chosen basis is still loading, failed, or has no statements: the section says which, with the switch still there to go back
  if (!f || noneFor) {
    const why = noneFor ? `${name(noneFor)} statements are not available for this company in our data sources, so this section can only show ${page.meta.statement} accounts.`
      : other.isError ? `${name(chosen as Basis)} accounts could not be loaded right now (${other.error?.status === 503 ? "the data provider did not answer" : "please try again in a moment"}). The ${page.meta.statement} accounts are still here: press ${name(page.meta.statement)}.`
        : `Loading ${(chosen as Basis)} accounts…`;
    return (
      <section className="block" style={{ "--sc": "var(--p-growth)" } as React.CSSProperties}>
        <SectionHead id="financials" no="Financials" icon="bars" tier="basic" title="Profit and loss, balance sheet and cash flow, quarterly and yearly" sub={`${name(chosen as Basis)}, ₹ crore. L Cr = lakh crore. FY = April–March.`} color="--p-growth" />
        <div className="card acc" style={{ "--ac": "var(--p-growth)" } as React.CSSProperties}>
          <div className="tools"><span className="faint" style={{ fontSize: "var(--fs-13)" }}>Accounts</span><div className="tools-r">{basisSeg}</div></div>
          <p className={noneFor || other.isError ? "muted" : "faint"} role="status" style={{ fontSize: "var(--fs-14)", margin: "6px 0 0" }}>{why}</p>
          {!noneFor && !other.isError && <div className="skeleton" style={{ height: 320, marginTop: 14 }} />}
        </div>
      </section>);
  }
  const tiles = finTiles(f), tbl: Table = kind === "q" ? f.quarterly.pl : f.yearly[kind];
  const ROWS: Record<string, [string, string, boolean?][]> = {
    pl: [["revenue", "Revenue"], ["other_income", "Other income"], ["expenses", "Expenses"], ["operating_profit", "Operating profit", true], ["finance_costs", "Interest"], ["depreciation", "Depreciation"], ["profit_before_tax", "Profit before tax", true], ["tax", "Tax"], ["net_profit", "Net profit", true], ["eps", "EPS (₹)"]],
    bs: [["equity_capital", "Equity capital"], ["reserves", "Reserves"], ["total_equity", "Total equity", true], ["borrowings", "Borrowings"], ["other_liabilities", "Other liabilities"], ["total_liabilities", "Total liabilities", true], ["fixed_assets", "Fixed assets"], ["cwip", "Capital WIP"], ["investments", "Investments"], ["inventories", "Inventories"], ["receivables", "Receivables"], ["cash", "Cash"], ["total_assets", "Total assets", true]],
    cf: [["operating", "Cash from operations"], ["investing", "Cash from investing"], ["financing", "Cash from financing"], ["net_cash_flow", "Net cash flow", true], ["capex", "Capital expenditure"], ["free_cash_flow", "Free cash flow", true], ["dividends_paid", "Dividends paid"]],
  };
  const rows = ROWS[kind === "q" ? "pl" : kind].filter(([k]) => tbl.rows[k]);
  const last = tbl.periods.length - 1;
  return (
    <section className="block" style={{ "--sc": "var(--p-growth)" } as React.CSSProperties}>
      <SectionHead id="financials" no="Financials" icon="bars" tier="basic" title="Profit and loss, balance sheet and cash flow, quarterly and yearly" sub={`${f.meta.statement === "consolidated" ? "Consolidated" : "Standalone"}, ₹ crore. L Cr = lakh crore. FY = April–March.`} color="--p-growth" aside={<ForecastCard f={f} />} />
      {(() => { const [rv, np, , mg] = tiles; return rv.delta != null && np.delta != null ? <Plain tone={np.delta >= 0 ? "good" : "warn"}>Sales {rv.delta >= 0 ? "grew" : "fell"} {nf(Math.abs(rv.delta), 1)}% last year and profit {np.delta >= 0 ? "rose" : "fell"} {nf(Math.abs(np.delta), 1)}%.{typeof mg.value === "number" && <> Out of every ₹100 of sales, about ₹{nf(mg.value, 1)} is kept as profit.</>}</Plain> : null; })()}
      <div className="grid g4" style={{ marginBottom: 16 }}>
        {tiles.map((t) => (
          <div className="ftile hover-lift" key={t.k} style={{ "--fc": css(t.color) } as React.CSSProperties}>
            <div className="k"><Icon name={t.icon} />{t.k} · {t.fy}</div>
            <div className="v">{t.value == null ? "—" : t.unit === "cr" ? "₹" + cr(t.value) + (Math.abs(t.value) >= 100000 ? " Cr" : " Cr") : nf(t.value) + "%"}</div>
            <div className="row"><span className={"chip " + ((t.delta ?? 0) >= 0 ? "up" : "down")}>{t.delta == null ? "—" : signed(t.delta, 1, t.suffix)} YoY</span><Spark values={t.series} color={`var(${t.color})`} w={96} h={34} /></div>
          </div>
        ))}
      </div>
      {!chosen && wasAutomatic(sym) && basis === "standalone" && <p className="faint" style={{ fontSize: "var(--fs-13)", margin: "0 0 10px" }}>Showing standalone accounts ({f.yearly.pl.periods.length} years) because this company's consolidated accounts cover far fewer. Press Consolidated to see the group's accounts.</p>}
      {shownBasis && shownBasis !== basis && chosen && <p className="faint" style={{ fontSize: "var(--fs-13)", margin: "0 0 10px" }}>This section now shows {shownBasis} accounts; the rest of this page uses {basis} accounts.</p>}
      {f.yearly.pl.periods.length > 0 && f.yearly.pl.periods.length < 5 && (chosen || !wasAutomatic(sym)) && <p className="faint" style={{ fontSize: "var(--fs-13)", margin: "0 0 10px" }}>Only {f.yearly.pl.periods.length} year{f.yearly.pl.periods.length === 1 ? "" : "s"} of {shownBasis} statements are available for this company (it may be newly listed, or have started publishing these accounts recently).</p>}
      {kind !== "q" && yearGaps(tbl.periods).map((g) => <p key={g} className="faint" style={{ fontSize: "var(--fs-13)", margin: "0 0 10px" }}>No {shownBasis} figures for {g} in our data sources: the columns on either side are not consecutive years.</p>)}
      {(kind === "bs" || kind === "cf") && tbl.periods.length > 0 && tbl.periods.length < f.yearly.pl.periods.length && <p className="faint" style={{ fontSize: "var(--fs-13)", margin: "0 0 10px" }}>Our data sources hold {tbl.periods.length} year{tbl.periods.length === 1 ? "" : "s"} of this statement for this company, against {f.yearly.pl.periods.length} years of profit and loss.</p>}
      {/* task #216 (README 3.6): the statement switch is the report's tab group ("3 views · Profit & loss shown here"); it wraps the section's own switch, so no Next view */}
      <TabGroup label="Statement" value={kind === "q" ? "pl" : kind} onChange={(k) => { if (!(k === "pl" && kind === "q")) setKind(k as FinKind); }} next={false}
        hint={`${{ pl: "Profit & loss", bs: "Balance sheet", cf: "Cash flow" }[kind === "q" ? "pl" : kind]} shown here`}
        views={[{ key: "pl", label: "Profit & loss" }, { key: "bs", label: "Balance sheet" }, { key: "cf", label: "Cash flow" }]} />
      <div className="card acc" style={{ "--ac": "var(--p-growth)" } as React.CSSProperties}>
        <ChartZoom label="Financial statements chart" className="cz-r">
        <div className="tools">
          <div className="tools-r">
            {basisSeg}
            <div className="seg seg-period" role="group" aria-label="Period: quarterly or yearly"><button aria-pressed={kind === "q"} onClick={() => setKind("q")} title="Profit and loss for each quarter">Quarterly</button><button aria-pressed={kind !== "q"} onClick={() => { if (kind === "q") setKind("pl"); }} title="Each financial year (April to March)">Yearly</button></div>
            <span className="chip ghost">{tbl.periods[0]} – {tbl.periods[last]}</span>
          </div>
        </div>
        <FinChart kind={kind} pl={f.yearly.pl} bs={f.yearly.bs} cf={f.yearly.cf} ql={f.quarterly.pl} />
        <div className="legend">{kind === "pl" || kind === "q" ? <><span><i style={{ background: "var(--c2)" }} />Revenue</span><span><i style={{ background: "var(--c3)" }} />Net profit</span><span><i className="ln" style={{ background: "var(--c4)" }} />Net margin</span><span><i style={{ background: "var(--c1)" }} />Latest period</span></>
          : kind === "bs" ? <><span><i style={{ background: "var(--c1)" }} />Equity + reserves</span><span><i style={{ background: "var(--c2)" }} />Borrowings</span><span><i style={{ background: "var(--c4)" }} />Other liabilities</span></>
            : <><span><i style={{ background: "var(--c3)" }} />Operating</span><span><i style={{ background: "var(--c2)" }} />Investing</span><span><i style={{ background: "var(--c4)" }} />Financing</span><span><i className="ln" style={{ background: "var(--c1)" }} />Free cash flow</span></>}</div>
        </ChartZoom>
        <div style={{ marginTop: 24 }}><HScroll className="" label="table"><table>
          <thead><tr><th>₹ Cr</th>{tbl.periods.map((p, i) => <th key={p} className={i === last ? "latest" : ""}>{p}</th>)}{kind === "q" ? <><th>vs last qtr</th><th>vs year ago</th></> : kind !== "cf" && <th>vs last year</th>}<th>Trend</th></tr></thead>
          <tbody>{rows.map(([k, label, tot]) => { const v = tbl.rows[k], y = yoy(v), y4 = kind === "q" ? yoy(v, 4) : null; const cell = (g: number | null) => <td className={g == null ? "" : g >= 0 ? "pos" : "neg"}>{g == null ? "—" : signed(g, 1)}</td>; return (
            <tr key={k} className={tot ? "tot" : ""} data-row-key={k}><td>{kind === "bs" || kind === "cf" ? label : (PL_LABEL[k] ?? label)}{(kind === "pl" || kind === "q") && PL_INFO[k] && <> <Info g={PL_INFO[k]} /></>}</td>{v.map((x, i) => <td key={i} className={i === last ? "latest" : ""}>{plCell(k, x)}</td>)}{kind === "q" ? <>{cell(y)}{cell(y4)}</> : kind !== "cf" && cell(y)}<td><Spark values={v} color="var(--muted)" w={76} h={24} /></td></tr>); })}</tbody>
        </table></HScroll></div>
      </div>
      {/* developer file 41: the old Chart lab's charts of the statement shown (yearly), on the same accounts as the table */}
      <div className="rp-more"><p className="label rp-more-h">{{ pl: "Profit and loss", q: "Profit and loss", bs: "Balance sheet", cf: "Cash flow" }[kind]} in charts{kind === "q" ? ", yearly" : ""}</p>
        {kind === "bs" ? <BsCharts f={f} /> : kind === "cf" ? <CfCharts f={f} /> : <PlCharts f={f} />}</div>
    </section>
  );
}

void MINUS;
