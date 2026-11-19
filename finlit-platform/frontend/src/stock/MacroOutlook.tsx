// MACRO & SECTOR OUTLOOK on every company page (PRD section 2): A backdrop bar, B sector impact, C indicator signals, D interpretation (+ history).
// Reads stored results only. Describes the sector's macroeconomic backdrop, never the company and never a recommendation.
import { useState } from "react";
import { Icon } from "../lib/icons";
import { dateIN } from "../lib/format";
import { SectionHead } from "./Sections";
import "../styles/macro-outlook.css";
import { GROUP_ICON, arrow, companyRows, driverText, indicatorsForReasons, insufficientText, pct, reasonsOf, shortName, signed, useCompanyMacro, useMacroHistory, useSectorImpact,
  MACRO_RANGES, macroSummary, macroWindow, readings, type MacroRange, type HistoryPoint,
  type CompanyMacro, type Driver, type Indicator, type Item, type Reason, type SectorRow, type Tone } from "../lib/macroOutlook";
import { ChartZoom, useZoomHeight } from "../components/ChartZoom";
import { DropChev } from "../components/DropChev";


export function Chip({ label, tone }: { label: string; tone: Tone }) { return <span className={"mo-chip " + tone}>{label}</span>; }
function Pill({ d }: { d: Driver }) { return <span className={"mo-pill " + (d.sign === "+" ? "pos" : "neg")} title={`${d.name}: ${d.valueText}. ${d.sign === "+" ? "Supports" : "Weighs on"} the score.`}><span aria-hidden="true">{driverText(d)}</span><span className="sr">{d.name}, {d.sign === "+" ? "supports" : "weighs on"} the score</span></span>; }
function Bar({ score, tone }: { score: number | null; tone: Tone }) {
  return <span className="mo-bar" role="img" aria-label={score == null ? "No score" : `Score ${Math.round(score)} out of 100, 50 is neutral`}><i className={tone} style={{ width: `${pct(score)}%` }} /><u title="50 = neutral" /></span>;
}
const when = (iso?: string | null) => (iso ? dateIN(iso) : "—");

function Meta({ c }: { c: CompanyMacro }) {
  return <p className="mo-meta">As of <b>{when(c.snapshotDate)}</b>{c.basis === "reconstructed" ? " (reconstructed)" : ""} · coverage <b>{c.coverage != null ? Math.round(c.coverage * 100) : "—"}%</b> · model v{c.modelVersion} · initial assumptions, not validated</p>;
}

/* A: the backdrop (task #216, README 3.2): a score ring (84 px, the score in the middle, "/100" under it, a tick at 50), the eyebrow, the outlook group, the word
   chip, the reading rule, and on the right the reasons lifting or weighing on the score. The ring and the box's left edge take the reading's colour. */
const toneKey = (t?: Tone | null) => (t === "up" || t === "up2" ? "pos" : t === "down" || t === "down2" ? "neg" : t === "flat" ? "mid" : "na");
function Ring({ score, tone }: { score: number | null; tone: string }) {
  const r = 34, C = 2 * Math.PI * r, v = score == null ? 0 : Math.max(0, Math.min(100, score));
  return (
    <svg className={"mo-ring " + tone} viewBox="0 0 84 84" width="84" height="84" role="img" aria-label={score == null ? "No score" : `Score ${Math.round(score)} out of 100; 50 is neutral`}>
      <circle cx="42" cy="42" r={r} className="trk" />
      {score != null && <circle cx="42" cy="42" r={r} className="arc" strokeDasharray={`${(C * v) / 100} ${C}`} transform="rotate(-90 42 42)" />}
      <line x1="42" x2="42" y1={42 + r - 7} y2={42 + r + 7} className="tick" />
      <text x="42" y="44" textAnchor="middle" className="n">{score == null ? "—" : Math.round(score)}</text>
      <text x="42" y="58" textAnchor="middle" className="of">/100</text>
    </svg>
  );
}
function Backdrop({ c }: { c: CompanyMacro }) {
  const ok = c.status === "ok", tone = ok ? toneKey(c.tone) : "na";
  const lift = ok ? (c.drivers ?? []).filter((d) => d.sign === "+") : [], weigh = ok ? (c.drivers ?? []).filter((d) => d.sign === "-") : [];
  return (
    <div className={"mo-bd " + tone} role="group" aria-label="Macro backdrop summary">
      <Ring score={ok ? c.score ?? null : null} tone={tone} />
      <div className="mo-bd-t">
        <p className="mo-bd-k">Macro backdrop</p>
        <p className="mo-bd-n">{c.mapping?.sectorName && <span className="mo-sector" title="FinLit's Macro & Sector Outlook groups its companies in 18 outlook groups of its own; NSE's sector of this company is in the header"><Icon name="layers" />Outlook group · {c.mapping.sectorName}</span>}
          <Chip label={ok ? c.label! : "Insufficient Data"} tone={ok ? c.tone ?? "flat" : "none"} /></p>
        <p className="mo-bd-l">{ok ? "50 is neutral · above 50 helps the sector, below 50 weighs on it" : insufficientText(c)}</p>
      </div>
      {ok && (lift.length > 0 || weigh.length > 0) ? <div className="mo-bd-r">
        {lift.length > 0 && <p><span className="mo-bd-k">Lifting the score</span>{lift.map((d) => <Pill key={d.code} d={d} />)}</p>}
        {weigh.length > 0 && <p><span className="mo-bd-k">Weighing on the score</span>{weigh.map((d) => <Pill key={d.code} d={d} />)}</p>}
      </div> : ok ? <div className="mo-bd-r"><span className="faint">No dominant driver</span></div> : null}
    </div>
  );
}

/* B: sector impact: only the rows marked "This company" (its own sector, or each segment sector of a revenue-weighted company) */
export function SectorTable({ rows }: { rows: SectorRow[] }) {
  return (
    <div className="mo-panel">
      <div className="mo-h"><h3><Icon name="bars" />Sector impact</h3><span className="faint">{rows.length > 1 ? "50 is neutral · sorted by score" : "50 is neutral"}</span></div>
      <table className="mo-t"><thead><tr><th scope="col">Outlook group</th><th scope="col">Score <span className="faint">(line at 50)</span></th><th scope="col" className="num">Score</th><th scope="col">Sentiment</th><th scope="col">Top reasons</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.sector.code} className="me" aria-current="true">
            <th scope="row">{r.sector.name}<span className="mo-you">This company</span></th>
            <td data-l="Score"><Bar score={r.score} tone={r.tone} /></td>
            <td className="num" data-l="Score">{r.score == null ? "—" : Math.round(r.score)}</td>
            <td data-l="Sentiment"><Chip label={r.label} tone={r.tone} /></td>
            <td data-l="Reasons">{r.status === "ok" ? (r.drivers.length ? r.drivers.map((d) => <Pill key={d.code} d={d} />) : <span className="faint">No dominant driver</span>) : <span className="faint">{(r.reason?.split(";")[0].replace(/^missing critical: /, "missing ") ?? "Insufficient Data")}</span>}</td>
          </tr>))}</tbody></table>
    </div>
  );
}

/* C: indicator signals */
function SignalBar({ v }: { v: number | null }) {
  if (v == null) return <span className="mo-sig none">no signal</span>;
  return <span className="mo-sig" title={`Normalised signal ${signed(v)} (−1 low or falling, +1 high or rising)`}><i style={{ left: `${(v + 1) * 50}%` }} className={v > 0.05 ? "hi" : v < -0.05 ? "lo" : ""} /><em>{signed(v)}</em></span>;
}
function Tile({ i, why }: { i: Indicator; why: Reason }) {
  const bad = i.status === "Missing" || i.status === "Stale" || i.status === "Invalid";
  const d = why.driver;   // the reason in Sector impact this tile belongs to: its effect on the score is the one the "Top reasons" pill shows
  return (
    <li className={"mo-tile" + (bad ? " bad" : "")} data-reason={i.code}>
      <div className="mo-tn"><b>{i.name}</b>{d && Math.abs(d.contribution) > 0 && <span className={"mo-eff " + (d.contribution > 0 ? "pos" : "neg")} title={`Top reason in Sector impact${why.sector ? ` (${why.sector})` : ""}: ${d.contribution > 0 ? "supports" : "weighs on"} the score`}>{d.contribution > 0 ? "supports" : "weighs"} {signed(d.contribution)}</span>}</div>
      {bad ? <p className="mo-miss"><Icon name="alert" />{i.status}: {i.detail || "no reading"}</p> : (
        <>
          <div className="mo-val"><b>{i.valueText}</b>{i.direction !== "none" && <span className={"mo-ch " + i.direction}>{arrow(i.direction)} <small>vs {i.prevText}</small></span>}</div>
          <SignalBar v={i.signal} />
        </>)}
      <p className="mo-src">{i.observationDate ? `${dateIN(i.observationDate)} · ` : ""}{i.source}{i.status === "Revised" ? " · revised" : ""}</p>
    </li>);
}
/** Only the indicators behind the reasons Sector impact gives, each under its group and tied to its reason. */
function Indicators({ c, reasons }: { c: CompanyMacro; reasons: Reason[] }) {
  const tiles = indicatorsForReasons(c.indicators, reasons);
  return (
    <div className="mo-panel">
      <div className="mo-h"><h3><Icon name="activity" />Indicator signals</h3><span className="faint">signal: −1 low or falling, +1 high or rising</span></div>
      {tiles.length > 0 && <p className="mo-why">Only the indicators behind the reasons above: {tiles.map((t) => shortName(t.indicator.code, t.indicator.name)).join(", ")}.</p>}
      {tiles.length === 0 && <p className="faint">{c.status === "ok" ? "Sector impact names no dominant driver for this outlook group right now, so there is no indicator to show." : "Sector impact shows no reading to explain right now."}</p>}
      {(c.groups ?? []).map((g) => { const t = tiles.filter((x) => x.indicator.group === g.code); return t.length > 0 && (
        <section key={g.code} className="mo-grp" aria-label={g.name}><h4><Icon name={GROUP_ICON[g.code] ?? "info"} />{g.name}</h4><ul>{t.map((x) => <Tile key={x.indicator.code} i={x.indicator} why={x.reason} />)}</ul></section>); })}
    </div>);
}

/* D: interpretation */
function List({ title, icon, tone, items, empty }: { title: string; icon: string; tone: string; items: Item[]; empty: string }) {
  return (
    <div className={"mo-col " + tone}><h4><Icon name={icon} />{title}</h4>
      {items.length ? <ul>{items.map((x) => <li key={x.code}><b>{shortName(x.code, x.name)}</b>{x.valueText && <span>{x.valueText}</span>}{x.contribution != null && <em>{signed(x.contribution)}</em>}{x.why && <span className="faint">{x.why}</span>}</li>)}</ul> : <p className="faint">{empty}</p>}
    </div>);
}
function Interpretation({ c }: { c: CompanyMacro }) {
  const e = c.explanation ?? {};
  return (
    <div className="mo-panel">
      <div className="mo-h"><h3><Icon name="notes" />Sector interpretation</h3></div>
      {e.headline && <p className="mo-lead">{e.headline}</p>}
      <div className="mo-cols">
        <List title="Supporting" icon="growth" tone="pos" items={e.supporting ?? []} empty="None at present" />
        <List title="Weighing" icon="alert" tone="neg" items={e.adverse ?? []} empty="None at present" />
        <List title="Monitor" icon="search" tone="mon" items={e.monitor ?? []} empty="Nothing flagged" />
      </div>
    </div>);
}

/* history (task #216, README 3.2): the x axis runs from the first reading to the latest, one label per day (the latest in bold); the area above 50 lightly
   green ("Above 50 helps the sector"), below lightly red ("Below 50 weighs on it"); a dashed line at 50; every point shows its value, the latest larger; a
   solid dot is calculated on the day, a hollow one reconstructed from stored data. */
export function Chart({ points }: { points: HistoryPoint[] }) {
  const pts = readings(points);
  // task #167: in the enlarged dialog it draws as tall as the room left (its viewBox is scaled to the width, so the room is turned into viewBox units)
  const [ref, zh] = useZoomHeight<SVGSVGElement>(0), sw = ref.current?.clientWidth ?? 0;
  const W = 520, H = zh > 0 && sw > 0 ? Math.max(230, Math.floor((zh * W) / sw)) : 230, L = 34, R = 14, T = 14, B = 26;
  const x = (i: number) => L + (pts.length < 2 ? (W - L - R) / 2 : (i / (pts.length - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / 100) * (H - T - B);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score!).toFixed(1)}`).join(" ");
  const n = pts.length, every = Math.max(1, Math.ceil(n / 8)), last = n - 1;
  const label = n ? `Score history: ${when(pts[0].date)} to ${when(pts[last].date)}, latest ${Math.round(pts[last].score!)} out of 100; 50 is neutral.` : "No score history yet.";
  return (
    <svg ref={ref} className="mo-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <rect x={L} y={y(100)} width={W - L - R} height={y(50) - y(100)} className="above" /><rect x={L} y={y(50)} width={W - L - R} height={y(0) - y(50)} className="below" />
      <text x={L + 6} y={y(100) + 14} className="zt pos">Above 50 helps the sector</text><text x={L + 6} y={y(0) - 6} className="zt neg">Below 50 weighs on it</text>
      {[0, 25, 50, 75, 100].map((g) => <g key={g}><line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className={g === 50 ? "mid" : "grid"} /><text x={L - 6} y={y(g) + 3} textAnchor="end" className="ax">{g}</text></g>)}
      {path && <path d={path} className="ln" />}
      {pts.map((p, i) => (
        <g key={p.date}>
          <circle cx={x(i)} cy={y(p.score!)} r={i === last ? 5 : 3.5} className={p.basis === "reconstructed" ? "rc" : "lv"}><title>{`${when(p.date)}: ${Math.round(p.score!)} (${p.label}${p.basis === "reconstructed" ? ", reconstructed" : ""})`}</title></circle>
          <text x={x(i)} y={y(p.score!) - 9} textAnchor="middle" className={"pv" + (i === last ? " last" : "")}>{Math.round(p.score!)}</text>
          {(i % every === 0 || i === last) && <text x={x(i)} y={H - 7} textAnchor={n > 1 && i === 0 ? "start" : n > 1 && i === last ? "end" : "middle"} className={"ax" + (i === last ? " last" : "")}>{dateIN(p.date, { day: "numeric", month: "short" })}</text>}
        </g>))}
    </svg>);
}
function HistoryPanel({ c }: { c: CompanyMacro }) {
  const [range, setRange] = useState<MacroRange>("1w");
  const code = c.mapping?.sector ?? "";
  const q = useMacroHistory(code, "ALL", c.mapping?.basis === "primary");
  const all = readings(q.data?.points ?? []), win = macroWindow(all, range), sum = macroSummary(win);
  const short = (d: string) => dateIN(d, { day: "numeric", month: "short" });
  return (
    <div className="mo-panel mo-hist">
      <div className="mo-h"><h3><Icon name="line" />Score history</h3>
        {win.length > 0 && <span className="mo-dchip">{short(win[0].date)} – {dateIN(win[win.length - 1].date)} · daily</span>}</div>
      {all.length > 7 && <div className="mo-rng" role="group" aria-label="Period">{MACRO_RANGES.map((r) => <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>)}</div>}
      {c.mapping?.basis !== "primary" ? <p className="faint">History is shown per outlook group; this company is weighted across several outlook groups.</p>
        : !win.length ? <p className="faint">{q.isLoading ? "Loading…" : "No history yet."}</p> : <>
          {sum && <div className="mo-sum">
            <p><b className="mo-big">{sum.score}</b><small>/100</small> <Chip label={sum.label} tone={c.tone ?? "flat"} />{win.length > 1 && <span className={"mo-chg " + (sum.change > 0 ? "pos" : sum.change < 0 ? "neg" : "")}>{sum.change > 0 ? "▲" : sum.change < 0 ? "▼" : "•"} {Math.abs(sum.change)} pts since {short(sum.since)}</span>}</p>
            {win.length > 1 && <p className="mo-was">was {sum.first} ({sum.firstLabel}) · {sum.label} for the last {sum.streak} reading{sum.streak === 1 ? "" : "s"}</p>}
          </div>}
          <ChartZoom label={"Macro score history"} className="cz-r"><Chart points={win} /></ChartZoom>
          <p className="mo-foot"><span className="mo-dot lv" /> calculated on the day <span className="mo-dot rcd" /> reconstructed from stored data</p>
        </>}
    </div>);
}

const andList = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** 02's heading and sub-line (task #222, 19 Nov pack S2): one sector group, or several when the company is weighted across them. */
export function macroHeading(c: { mapping?: { sectorName?: string | null; basis?: string | null } | null; segments?: { name: string }[] | null } | null | undefined): { title: string; sub: string } {
  const lead = "How interest rates, credit, commodity prices and growth are affecting";
  const many = c?.mapping?.basis && c.mapping.basis !== "primary" && (c.segments?.length ?? 0) > 1 ? c.segments!.map((s) => s.name) : null;
  if (many) return { title: "Is the economy helping its sectors?", sub: `${lead} its sectors: ${andList(many)}.` };
  const g = c?.mapping?.sectorName;
  return { title: "Is the economy helping its sector?", sub: g ? `${lead} ${g}, this company's sector group.` : `${lead} this company's sector group.` };
}

export function MacroOutlookSection({ symbol }: { symbol: string }) {
  const q = useCompanyMacro(symbol);
  const c = q.data;
  const showImpact = !!c && (c.status === "ok" || c.status === "insufficient_data");
  const imp = useSectorImpact(showImpact && c?.mapping?.basis === "revenue_weighted");   // the full sector table is read only for a company that spans several sectors

  // Task #222 (19 Nov pack S2): the heading in plain words, a question the 0-100 reading answers; the sub-line names the company's sector group(s)
  const h = macroHeading(c);
  const head = <SectionHead id="macro" no="02 · Economy and sector" icon="globe" title={h.title} sub={h.sub} color="--p-growth" />;
  let body: React.ReactNode;
  if (q.isLoading) body = <div className="mo-skel" aria-busy="true">Loading the macro outlook…</div>;
  else if (q.isError || !c) body = <p className="mo-note" role="status"><Icon name="alert" />The macro outlook is unavailable right now ({q.error?.status ?? "no answer"}). It reads stored results only; please try again shortly.</p>;
  else if (c.status === "not_mapped" || c.status === "pending") body = <p className="mo-note" role="status"><Icon name="info" />Macro outlook not available for this company: {c.reason ?? "its outlook group has not been assigned yet."}</p>;
  else {
    const rows = companyRows(c, imp.data?.sectors), reasons = reasonsOf(rows, c);
    body = (
      <>
        {c.stale.isStale && <p className="mo-stale" role="alert"><Icon name="alert" /><span><b>Stale data.</b> {c.stale.message}</span></p>}
        {/* task #216 (README 3.2): heading, "How this reading is made" (closed), the backdrop, the grid (indicators and interpretation | score history), the disclaimer */}
        <details className="xdd notes mo-how"><summary>How this reading is made<DropChev /></summary>
          <Meta c={c} />
          {c.mapping && <p className="mo-map"><Icon name="layers" />{c.mapping.note} {c.segments && <span>{c.segments.map((s) => `${s.name} ${Math.round(s.weight * 100)}%`).join(" · ")}</span>}</p>}
        </details>
        <Backdrop c={c} />
        {c.status === "insufficient_data" && <p className="mo-note" role="status"><Icon name="info" />{insufficientText(c)}. No score is shown rather than a guess.</p>}
        {/* one row repeats the backdrop above (its score, word and the same reason pills), so the panel shows only for a company in several sectors */}
        {rows.length > 1 && <SectorTable rows={rows} />}
        <div className="mo-grid"><div className="mo-gl"><Indicators c={c} reasons={reasons} /><Interpretation c={c} /></div><HistoryPanel c={c} /></div>
        <p className="mo-disc">{c.disclaimer}</p>
      </>);
  }
  return <section className="block mo" aria-label="Economy and sector" style={{ "--sc": "var(--p-growth)" } as React.CSSProperties}>{head}{body}</section>;
}
