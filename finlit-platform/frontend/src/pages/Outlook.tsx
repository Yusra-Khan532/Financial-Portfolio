// Profit and revenue forecasting (Gold): estimates of revenue and net profit for the next 1, 3 or 5 financial years from the company's own history and its
// sector's, by a weighted growth rate (the team's methodology, docs/outlook/METHOD.md). "Our model", or "Build your own growth model": the user's own growth rate for
// each input (task #146), combined by the model's weights. All arithmetic is on the server; what stays here is the rate-box logic (lib/outlook.ts) and the chart
// series (lib/outlookChart.ts), both tested. Information only, not advice.
import { PageHeader } from "../components/PageHeader";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { useAuth } from "../lib/auth";
import { DEMO } from "../lib/demo";
import { Icon } from "../lib/icons";
import { useUI } from "../lib/ui";
import { useDocTitle } from "../lib/title";
import { nf } from "../lib/format";
import { DEFAULT_WEIGHTS, HORIZONS, KIND_LABEL, PARAM_LABELS, VALUE_MAX, VALUE_MIN, VALUE_STEP, changedValues, clampValue, companyValues, parseRate, signedPct, useOutlook, type Horizon, type Kind, type Outlook, type Values } from "../lib/outlook";
import { fmtCr } from "../lib/outlookChart";
import { OutlookChart, buildSeries } from "../charts/OutlookChart";
import { Gate } from "../components/Gate";
import { OutlookPicker } from "../components/OutlookPicker";
import { pushRecent, takeaways } from "../lib/outlookPick";
import "../styles/outlook.css";

const TABS: { kind: Kind; label: string }[] = [{ kind: "profit", label: "Profit" }, { kind: "revenue", label: "Revenue" }];
const NOTE = "Estimates from the company's own history and its sector, not a prediction or advice. The weights are starting values and have not yet been validated.";
const GATE_POINTS = ["Revenue and net profit estimates for the next 1, 3 or 5 years, drawn after the reported years", "Every input, its weight and its contribution shown, with the reason for any blank", "Use our model, or set your own expected growth rate for each input"];

// ---------------------------------------------------------------------------------------------------------- /outlook (search)
export function OutlookIndexPage() {
  useDocTitle("Profit and revenue forecasting", "Revenue and net profit estimates for a listed company over the next 1, 3 or 5 years, from its own reported history and its sector's.");
  return (
    <>
      <PageHeader wrap plan="gold" title="Profit and revenue forecasting" art="chart" links={["/research", "/compare", "/dcf"]}
        description={<>Pick a listed company to see its <b>reported revenue and net profit by year</b>, and an estimate for the next 1, 3 or 5 years worked out from its own growth and its sector's. Estimates from past results, not a prediction or advice.</>} />
      <div className="wrap ol"><OutlookPicker intro /></div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------- pieces
const MINE = "Your assumptions";

/** One rate box per input (task #166, was a slider capped at +/-50%): the growth rate (percent a year) the user expects for it, typed in, set on its own
 *  (task #146). It starts at the company's own figure, which stays in view, with how much FinLit's weights count the input for the horizon. */
function RateBox({ id, value, set, mine, label, onCommit }: { id: string; value: number; set: boolean; mine: boolean; label: string; onCommit: (v: number) => void }) {
  const shown = set ? value.toFixed(1) : "";
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  const typing = useRef(false);   // while the box has focus, what the user types stays as typed (it is tidied to one decimal when they leave)
  useEffect(() => { setText((t) => (typing.current && set && parseRate(t) === value ? t : shown)); setBad(false); }, [shown]);   // a change from outside (Reset) always shows
  const commit = (t: string) => { if (!t.trim()) { setText(shown); setBad(false); return; } const v = parseRate(t); if (v == null) { setBad(true); return; } setBad(false); if (!set || v !== value) onCommit(v); };
  return (
    <span className={"ol-rate" + (mine ? " is-mine" : "") + (bad ? " is-bad" : "")}>
      <input id={id} type="text" inputMode="decimal" autoComplete="off" value={text} placeholder="—" aria-invalid={bad || undefined} aria-describedby={bad ? id + "-err" : undefined}
        onChange={(e) => { setText(e.target.value); const v = parseRate(e.target.value); setBad(e.target.value.trim() !== "" && v == null); if (v != null && (!set || v !== value)) onCommit(v); }}
        onFocus={() => { typing.current = true; }} onBlur={(e) => { typing.current = false; commit(e.target.value); const v = parseRate(e.target.value); if (v != null) setText(v.toFixed(1)); }} onKeyDown={(e) => { if (e.key === "Enter") commit((e.target as HTMLInputElement).value); }} aria-label={`${label}, percent a year`} />
      <span aria-hidden="true">%</span>
      {bad && <small id={id + "-err"} className="ol-rate-err" role="alert">A rate from {VALUE_MIN}% to +{VALUE_MAX}% a year</small>}
    </span>);
}

function Sliders({ kind, horizon, names, base, mine, ratePct, loading, onChange, onReset }: { kind: Kind; horizon: Horizon; names: Record<string, string>; base: Values; mine: Values;
  ratePct: number | null; loading: boolean; onChange: (l: string, v: number) => void; onReset: () => void }) {
  const keys = Object.keys(PARAM_LABELS[kind]);
  const moved = Object.keys(changedValues(base, mine)).length;
  const hz = HORIZONS.find((h) => h.key === horizon)!;
  return (
    <fieldset className="ol-sliders ol-rates" disabled={loading}><legend className="sr-only">Expected growth rate of each input, in percent a year</legend>
      {keys.map((l) => {
        const has = base[l] != null, set = has || mine[l] != null, v = mine[l] ?? (has ? clampValue(base[l]) : 0), who = l.startsWith("sec_") ? "Sector" : "Company";
        const ref = loading ? "Loading the company's figure" : has ? `${who} figure ${signedPct(base[l], 1)}` : `No ${who.toLowerCase()} figure; ${mine[l] != null ? "your rate is used" : "type a rate to use your own"}`;
        const name = names[l] ?? PARAM_LABELS[kind][l] ?? l;
        return (
          <div className="ol-sl" key={l}>
            <label htmlFor={`ol-${kind}-${l}`}>{name}<small className="faint ol-sl-ref">{ref} · counts {DEFAULT_WEIGHTS[kind][horizon][l]}%</small></label>
            <RateBox id={`ol-${kind}-${l}`} value={v} set={set} label={name} mine={mine[l] != null && (!has || Math.abs(base[l] - v) >= VALUE_STEP / 2)} onCommit={(n) => onChange(l, n)} />
          </div>);
      })}
      <div className="ol-total" aria-live="polite"><span>Combined yearly rate <b className="mono">{ratePct == null ? "—" : signedPct(ratePct, 2)}</b> <span className="faint">· each rate is set on its own; FinLit's {hz.label.toLowerCase()} weights (the “counts” figures) combine them</span></span>
        <button type="button" className="btn ghost" onClick={onReset} disabled={!moved}>Reset to the company's figures</button></div>
    </fieldset>
  );
}

function Skeleton() {
  return <div className="ol-skel" aria-busy="true" aria-label="Loading the estimate"><div className="sk-lines"><i /><i /><i /><i /><i /></div></div>;
}

/** One metric's chart. Its estimate is the user's own growth rates when any differs from the company's figure, else the model's; the model's is then drawn as a second dashed line. */
function ChartCard({ sym, kind, horizon, own, gold, adjusting, onPick }: { sym: string; kind: Kind; horizon: Horizon; own: Values | null; gold: boolean; adjusting?: boolean; onPick?: () => void }) {
  const mine = useOutlook(sym, kind, horizon, own, gold);
  const model = useOutlook(sym, kind, horizon, null, gold && !!own);
  const last = useRef<Outlook | null>(null);
  if (mine.data) last.current = mine.data;
  const d = mine.data ?? (mine.isFetching ? last.current : null);
  const alt = own && model.data?.forecast.available ? model.data.forecast.years : null;
  const series = useMemo(() => (d ? buildSeries(d.history.points, d.forecast.available ? d.forecast.years : null, alt) : null), [d, alt]);
  const who = own ? MINE : "FinLit model";
  return (
    <section className={"card ol-chartcard" + (mine.isFetching ? " is-busy" : "") + (adjusting ? " is-adjusting" : "")} aria-labelledby={`ol-ch-${kind}`} aria-busy={mine.isFetching}>
      <h2 id={`ol-ch-${kind}`}>{KIND_LABEL[kind]}: reported and estimate
        {onPick && (adjusting
          ? <span className="ol-adj" role="status"><Icon name="gauge" />Your rates change this chart</span>
          : <button type="button" className="ol-adj pick" onClick={onPick}><Icon name="gauge" />Adjust this chart with your rates</button>)}
      </h2>
      {mine.isLoading && !d ? <Skeleton /> : mine.error && !d ? <p className="formerr" role="alert">{(mine.error.body?.detail as string) || "Could not load this chart."}</p> : d && series ? (
        <>
          <OutlookChart kind={kind} symbol={sym} series={series} who={who} horizonLabel={d.horizon.label.toLowerCase()} />
          {!d.forecast.available && <p className="ol-empty" role="note"><b>No estimate drawn.</b> {d.forecast.reason}</p>}
          {d.forecast.available && <p className="faint ol-chart-note">Estimate from {who === MINE ? "your growth rates" : "the FinLit model"} · {d.horizon.label.toLowerCase()} ({d.horizon.span}){d.adjustedYears.length ? ` · reported years ${d.adjustedYears.join(", ")} adjusted for one-off items` : ""}</p>}
        </>) : null}
    </section>
  );
}

export function BuildTable({ d }: { d: Outlook }) {
  const k = d.kind;
  return (
    <section className="card" aria-labelledby={`ol-build-${k}`}>
      <h2 id={`ol-build-${k}`}>How this {KIND_LABEL[k].toLowerCase()} estimate is built <span className="tier gold">{d.mode === "custom" ? MINE : "FinLit model"}</span></h2>
      <p className="muted">Each input is a yearly growth rate. The weighted growth rate is the sum of weight × value, using the {d.horizon.label.toLowerCase()} column of weights ({d.horizon.span}). Inputs that cannot be worked out drop out and their weight is shared across the others in proportion.{d.mode === "custom" ? " With “Build your own growth model” the values marked “Your assumption” are the growth rates you set; the weights stay FinLit's." : ""}</p>
      <div className="ol-ctable ol-build"><table>
        <caption className="sr-only">Inputs, weights and contributions to the weighted {KIND_LABEL[k].toLowerCase()} growth rate</caption>
        <thead><tr><th scope="col">Input</th><th scope="col" className="num">Value</th><th scope="col" className="num">Weight</th><th scope="col" className="num">Weight used</th><th scope="col" className="num">Adds</th></tr></thead>
        <tbody>
          {d.rate.rows.map((r) => (
            <tr key={r.key} className={r.status === "unavailable" ? "is-na" : ""}>
              <th scope="row">{r.label}<small className="faint">{r.status === "ok" ? r.method + (r.detail && !r.method?.includes("peers") ? ` · ${r.detail}` : "") : r.reason}</small></th>
              <td className="num mono">{r.valuePct == null ? "—" : signedPct(r.valuePct, 2)}{r.capped && r.rawPct != null && <small className="faint">limited from {signedPct(r.rawPct, 1)}</small>}</td>
              <td className="num mono">{nf(r.weightPct, 1)}%</td>
              <td className="num mono">{r.status === "ok" ? `${nf(r.effectiveWeightPct, 1)}%` : "—"}</td>
              <td className="num mono">{r.contributionPts == null ? "—" : signedPct(r.contributionPts, 2)}</td>
            </tr>))}
        </tbody>
        <tfoot><tr><th scope="row">Weighted growth rate, per year</th><td /><td className="num mono">{nf(d.rate.rows.reduce((s, r) => s + r.weightPct, 0), 1)}%</td><td className="num mono">{d.rate.ratePct == null ? "" : "100.0%"}</td><td className="num mono"><b>{d.rate.ratePct == null ? "—" : signedPct(d.rate.ratePct, 2)}</b></td></tr></tfoot>
      </table></div>
      {d.rate.unavailable.length > 0 && <p className="ol-note" role="note"><Icon name="info" />Not available for this company: {d.rate.unavailable.join("; ")}. Their weight was shared across the other inputs in proportion.</p>}
      <p className="faint">Each input is limited to {signedPct(d.inputCapPct, 0).replace("+", "−")} to {signedPct(d.inputCapPct, 0)} a year before it is weighted, and the table says when that applied. Sector figures are the median of the company's industry (or, with fewer than {d.minPeers} peers, its sector). {d.kind === "profit" ? "Net profit is adjusted for one-off items where the report shows them, and the margin trend is the relative change in the net profit margin, not a change in percentage points. " : ""}Banks and lenders use total income as revenue.</p>
    </section>
  );
}

export function YearTable({ d }: { d: Outlook }) {
  const k = d.kind, f = d.forecast;
  return (
    <section className="card" aria-labelledby={`ol-years-${k}`}>
      <h2 id={`ol-years-${k}`}>Year by year, {KIND_LABEL[k].toLowerCase()} <span className="tier gold">Estimate</span></h2>
      {!f.available ? <p className="ol-empty"><b>No estimate.</b> {f.reason}</p> : (
        <>
          <div className="ol-ctable"><table>
            <caption className="sr-only">Reported and estimated {KIND_LABEL[k].toLowerCase()} by financial year, in rupees crore</caption>
            <thead><tr><th scope="col">Year</th><th scope="col">Type</th><th scope="col" className="num">₹ crore</th><th scope="col" className="num">Growth applied</th><th scope="col" className="num">Change</th></tr></thead>
            <tbody>
              <tr><th scope="row">{f.base?.period}</th><td>Reported</td><td className="num mono">{nf(f.base?.valueCr ?? 0, 0)}</td><td className="num">—</td><td className="num">—</td></tr>
              {f.years.map((y) => <tr key={y.period}><th scope="row">{y.period}</th><td>Estimate</td><td className="num mono">{nf(y.valueCr, 0)}</td><td className="num mono">{signedPct(y.growthPct, 2)}</td><td className="num mono">{y.changeCr < 0 ? "−" : "+"}{nf(Math.abs(y.changeCr), 0)}</td></tr>)}
            </tbody>
          </table></div>
          <p className="faint">{f.rule} For example, {fmtCr(f.base?.valueCr)} at {signedPct(d.rate.ratePct ?? 0, 2)} a year gives {fmtCr(f.years[0]?.valueCr)} for {f.years[0]?.period}.</p>
        </>)}
    </section>
  );
}

export function Takeaways({ d, model }: { d: Outlook; model: Outlook | null }) {
  const lines = takeaways(d, model);
  if (!lines.length) return null;
  return (
    <section className="card ol-take" aria-labelledby={`ol-take-${d.kind}`}>
      <h2 id={`ol-take-${d.kind}`}>Key takeaways, {KIND_LABEL[d.kind].toLowerCase()} <span className="tier gold">{d.mode === "custom" ? MINE : "FinLit model"}</span></h2>
      <ul className="ol-take-l">{lines.map((l) => <li key={l}><Icon name="check" />{l}</li>)}</ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------- /outlook/:symbol
export function OutlookPage() {
  const { symbol = "" } = useParams();
  const sym = symbol.toUpperCase();
  useDocTitle(`${sym} profit and revenue forecasting`, "Revenue and net profit estimates for the next 1, 3 or 5 years, from the company's own reported history and its sector's. Not a prediction, not advice.");
  const { has } = useUI();
  const { user } = useAuth();
  const gold = has("gold") && !!user && !DEMO;
  const [kind, setKind] = useState<Kind>("profit");
  const [horizon, setHorizon] = useState<Horizon>("short");
  const [mode, setMode] = useState<"model" | "custom">("model");
  // The user's own growth rates (task #146), per estimate (not per horizon: a growth expectation does not change with the horizon; the weights do).
  const [mine, setMine] = useState<Record<Kind, Values>>({ profit: {}, revenue: {} });
  const [sent, setSent] = useState<Record<Kind, Values>>({ profit: {}, revenue: {} });   // the rates last settled on: the server is asked once the typing stops
  useEffect(() => { const h = window.setTimeout(() => setSent(mine), 400); return () => window.clearTimeout(h); }, [mine]);
  const modelOf = { profit: useOutlook(sym, "profit", horizon, null, gold), revenue: useOutlook(sym, "revenue", horizon, null, gold) };   // the company's own figures
  const own = (k: Kind): Values | null => { if (mode !== "custom") return null; const c = changedValues(companyValues(modelOf[k].data), sent[k]); return Object.keys(c).length ? c : null; };
  const q = useOutlook(sym, kind, horizon, own(kind), gold);
  const modelQ = modelOf[kind];   // the FinLit model's answer, for "how your growth rates differ"
  useEffect(() => { if (q.data?.name) pushRecent(sym); }, [q.data?.name, sym]);       // "Last searched": only a company that really has an estimate
  const last = useRef<Outlook | null>(null);
  if (q.data) last.current = q.data;
  const d = q.data ?? (q.isFetching ? last.current : null);
  const names = useMemo(() => Object.fromEntries((q.data?.rate.rows ?? []).map((r) => [r.key, r.label])), [q.data]);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === "ArrowRight" || e.key === "ArrowLeft" ? (i + 1) % 2 : -1;
    if (n >= 0) { e.preventDefault(); setKind(TABS[n].kind); tabRefs.current[n]?.focus(); }
  };
  const err = q.error;
  const hz = HORIZONS.find((h) => h.key === horizon)!;

  return (
    <>
      <PageHeader wrap plan="gold" title="Profit and revenue forecasting" art="chart" links={[{ to: `/stocks/${encodeURIComponent(sym)}`, label: "Company report" }, "/outlook", "/dcf"]}
        description={<>{d?.name ? <><b>{d.name}</b> <span className="mono faint">{sym}</span> · </> : <><span className="mono">{sym}</span> · </>}Estimates from the company's own history and its sector.</>} />
      <div className="wrap ol">
        <OutlookPicker current={sym} />
        <Gate tier="gold" title="Profit and revenue forecasting" points={GATE_POINTS}>
          <div className="ol-ctl card">
            <div className="ol-ctl-row">
              <span className="ol-ctl-l" id="ol-hz-l">Estimate for</span>
              <div className="ol-mode" role="radiogroup" aria-labelledby="ol-hz-l">
                {HORIZONS.map((h) => <button key={h.key} type="button" role="radio" aria-checked={horizon === h.key} className={horizon === h.key ? "on" : ""} onClick={() => setHorizon(h.key)}>{h.label}<small>{h.span}</small></button>)}
              </div>
            </div>
            <div className="ol-ctl-row ol-models-row">
              <span className="ol-ctl-l" id="ol-md-l">Estimation model</span>
              <div className="ol-models" role="radiogroup" aria-labelledby="ol-md-l">
                {([["model", "Our model", "FinLit's data-driven weights from the company's own growth and its sector's. Recommended for a quick, reliable estimate.", "bars", false],
                   ["custom", "Build your own growth model", "Take control of your growth assumptions. Customise company and sector CAGR inputs, experiment with margin trends, and evaluate how different assumptions impact future profit and revenue.", "gauge", true]] as const).map(([m, label, text, icon, usp]) => (
                  <button key={m} type="button" role="radio" aria-checked={mode === m} className={"ol-mcard" + (mode === m ? " on" : "")} onClick={() => setMode(m)}>
                    <span className="ol-mdot" aria-hidden="true" /><Icon name={icon} /><span className="ol-mt"><b>{label}{usp && <em className="ol-usp">FinLit USP</em>}</b><small>{text}</small></span></button>))}
              </div>
            </div>
            <p className="ol-disc">{NOTE}</p>
            <details className="ol-how"><summary>How these estimates are made</summary>
              <p>Each year's figure is the year before, grown by one weighted yearly growth rate: next year = this year × (1 + rate). The rate adds up the company's own growth (last year, and compound growth over 3 and 5 years), the median growth of its sector, and, for profit, the change in its net profit margin. {hz.label} puts the most weight on {horizon === "short" ? "the latest year" : horizon === "mid" ? "the 3-year growth" : "the 5-year growth"}. The same rate is held for every estimate year, because no year-specific inputs are stored. Profit is estimated from its own growth, not as revenue times margin.</p>
              <p>The weights are the team's starting values and have not yet been validated against later results. Reported figures come from the company's own results.</p></details>
          </div>

          <div className={"ol-top" + (mode === "custom" ? " ol-split" : "")}>
          {mode === "custom" && (
            <section className="card ol-assume" aria-labelledby="ol-as-h">
              <div className="ol-assume-h">
                <h2 id="ol-as-h">Build your own growth model: assumptions</h2>
                <div className="ol-mode" role="radiogroup" aria-label="Which estimate to adjust">
                  {TABS.map((t) => <button key={t.kind} type="button" role="radio" aria-checked={kind === t.kind} className={kind === t.kind ? "on" : ""} onClick={() => setKind(t.kind)}>{t.label} estimate</button>)}
                </div>
              </div>
              <p className="faint ol-assume-p">Type the growth rate (CAGR, percent a year) you expect for each input, any figure from −99% to +999%. Each rate is set on its own: it is not a weight and nothing has to add up to 100%. Every box starts at the company's own figure; FinLit's weights combine your rates into one yearly rate, and the charts beside it update as you go.</p>
              <Sliders kind={kind} horizon={horizon} names={names} base={companyValues(modelOf[kind].data)} mine={mine[kind]} loading={!modelOf[kind].data}
                ratePct={(own(kind) ? q.data?.rate.ratePct : modelOf[kind].data?.rate.ratePct) ?? null}
                onChange={(l, v) => setMine((m) => ({ ...m, [kind]: { ...m[kind], [l]: clampValue(v) } }))} onReset={() => setMine((m) => ({ ...m, [kind]: {} }))} />
            </section>)}

          {!gold ? null : (
            <div className="ol-charts">
              <ChartCard sym={sym} kind="revenue" horizon={horizon} own={own("revenue")} gold={gold} adjusting={mode === "custom" && kind === "revenue"} onPick={mode === "custom" ? () => setKind("revenue") : undefined} />
              <ChartCard sym={sym} kind="profit" horizon={horizon} own={own("profit")} gold={gold} adjusting={mode === "custom" && kind === "profit"} onPick={mode === "custom" ? () => setKind("profit") : undefined} />
            </div>)}
          </div>

          <div className="ol-tabs" role="tablist" aria-label="Details of the estimate">
            {TABS.map((t, i) => (
              <button key={t.kind} ref={(el) => { tabRefs.current[i] = el; }} role="tab" id={`ol-tab-${t.kind}`} aria-selected={kind === t.kind} aria-controls="ol-panel" tabIndex={kind === t.kind ? 0 : -1}
                className={kind === t.kind ? "on" : ""} onClick={() => setKind(t.kind)} onKeyDown={(e) => onTabKey(e, i)}>{t.label} estimate</button>))}
          </div>
          <div id="ol-panel" role="tabpanel" aria-labelledby={`ol-tab-${kind}`} className="ol-panel">
            {!gold ? null : q.isLoading && !d ? <Skeleton /> : err && !d ? (
              <p className="formerr" role="alert">{err.status === 404 ? "This company's report is not stored yet. Open its page once, then come back." : (err.body?.detail as string) || "Could not load the estimate."}</p>
            ) : d ? (
              <div className={"ol-out" + (q.isFetching ? " is-busy" : "")} aria-busy={q.isFetching}>
                <div className="ol-pair"><YearTable d={d} /><Takeaways d={d} model={d.mode === "custom" ? modelQ.data ?? null : null} /></div>
                <div className="ol-fold3">
                  <details><summary>How this estimate is built <em>{d.mode === "custom" ? MINE : "FinLit model"}</em></summary><BuildTable d={d} /></details>
                  <details><summary>Why these inputs and weights</summary><p className="ol-disc">Each year's figure is the year before, grown by one weighted yearly growth rate, made from the company's own growth and its sector's. The weights are the team's starting values and have not yet been validated against later results.</p></details>
                  <details><summary>Important notes</summary><p className="ol-disc">{d.disclaimer} Information only, not investment advice.</p>{d.isLender && <p className="ol-note" role="note"><Icon name="info" />This is a bank or lender: total income is used as its revenue.</p>}</details>
                </div>
                <p className="faint">Latest reported year {d.asOf.yearly ?? "—"} · {d.statement} statements · {d.mode === "custom" ? "your growth rates" : "FinLit model"}.</p>
              </div>
            ) : null}
          </div>
        </Gate>
      </div>
    </>
  );
}
