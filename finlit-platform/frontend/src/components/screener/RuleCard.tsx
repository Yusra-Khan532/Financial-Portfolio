// One rule of the Stock screener's "Your rules" panel (task #64, file 04 §3): name, tier and ×, the one-line meaning, Now / 3Y / 5Y / 7Y where the
// figure has them, a histogram of all companies (30 bars from the 5th to the 95th percentile, the tails in the end bars, the median dashed, a log scale for
// long-tailed figures), a two-handle slider on the same scale, From / to boxes, quick ranges with the better side first, and what the rule keeps.
import { useId } from "react";
import { nf } from "../../lib/format";
import { UNIT_SUFFIX, fmtMetric, type MetricInfo, type Range } from "../../lib/proscreen";
import { TIER, type Plan } from "../../lib/ui";

const STEPS = 300;
type Stats = NonNullable<MetricInfo["stats"]>;

/** The slider's scale: the 5th to the 95th percentile, log where the server says so; older catalogs fall back to the 2nd to 98th, linear. */
export function scaleOf(st: Stats) {
  const bars = st.hist30?.length ? st.hist30 : st.hist || [];
  const lo = st.hist30?.length ? st.p5! : st.lo ?? st.min, hi = st.hist30?.length ? st.p95! : st.hi ?? st.max;
  const log = !!st.hist30?.length && st.scale === "log" && lo > 0;
  const f = (v: number) => (log ? Math.log(v) : v), a = f(lo), b = f(hi), span = b - a || 1;
  const toPos = (v: number) => Math.round(((f(Math.min(hi, Math.max(lo, v))) - a) / span) * STEPS);
  const at = (pos: number) => { const x = a + (pos / STEPS) * span; return log ? Math.exp(x) : x; };
  return { bars, lo, hi, log, toPos, at };
}

/** A tidy number for a slider stop: three significant figures, never "1.2000000001". */
export const nice = (v: number) => Number(v.toPrecision(Math.abs(v) >= 1000 ? 4 : 3));

/** The four quick ranges, the better side first (lower first for P/E and debt, higher first for returns and profitability). */
export function quickRanges(m: MetricInfo): { id: string; label: string; r: Range }[] {
  const st = m.stats;
  if (!st || st.p25 == null || st.p75 == null) return [];
  const q = [
    { id: "low", label: "Lowest 25%", r: { max: nice(st.p25) } }, { id: "below", label: "Below middle", r: { max: nice(st.p50) } },
    { id: "above", label: "Above middle", r: { min: nice(st.p50) } }, { id: "top", label: "Top 25%", r: { min: nice(st.p75) } },
  ];
  return m.better === "higher" ? [q[3], q[2], q[1], q[0]] : q;
}

/** Where a new rule starts: its better quarter, so the list changes at once (file 04 §3). A figure with no better side, or a yes/no figure, starts open. */
export function startRange(m: MetricInfo): Range {
  const st = m.stats;
  if (!st || m.unit === "flag" || st.p25 == null || st.p75 == null || m.better === "none") return {};
  return m.better === "higher" ? { min: nice(st.p75) } : { max: nice(st.p25) };
}

const same = (a: Range, b: Range) => (a.min ?? null) === (b.min ?? null) && (a.max ?? null) === (b.max ?? null);

export type RuleCount = { before: number; after: number; missing: number } | undefined;

export function RuleCard({ m, cur, r, set, remove, ask, period, setPeriod, count, hot }: {
  m: MetricInfo; cur: MetricInfo; r: Range; set: (r: Range) => void; remove: () => void; ask: (tier: Plan, why: string) => void;
  period: string; setPeriod: (p: string) => void; count: RuleCount; hot?: boolean;
}) {
  const id = useId();
  const tabs = m.variants ? Object.entries(m.variants) : null;
  const st = cur.stats, unit = UNIT_SUFFIX[cur.unit] ?? "";
  const num = (raw: string) => (raw.trim() === "" ? undefined : Number.isFinite(Number(raw)) ? Number(raw) : undefined);
  const head = (
    <div className="ssr-rt">
      <b id={id}>{m.label}</b>
      {m.tier !== "basic" && <span className={"ssr-tier " + m.tier}>{TIER[m.tier].n.toUpperCase()}</span>}
      <button type="button" className="ssr-x" onClick={remove} aria-label={`Remove the rule on ${m.label}`}>×</button>
    </div>
  );
  if (cur.locked) {
    return (
      <div className="ssr-rule is-locked" role="group" aria-labelledby={id}>{head}
        <p className="ssr-say">{m.say}</p>
        <button type="button" className="btn" onClick={() => ask(cur.tier, `${cur.label} is part of the ${TIER[cur.tier].n} plan.`)}>Unlock with {TIER[cur.tier].n}</button>
      </div>
    );
  }
  let body: React.ReactNode;
  if (cur.unit === "flag") {
    const v = r.min === 1 ? "yes" : r.max === 0 ? "no" : "any";
    body = <div className="ssr-vars" role="group" aria-label={cur.label}>{(["any", "yes", "no"] as const).map((o) => (
      <button key={o} type="button" aria-pressed={v === o} onClick={() => set(o === "any" ? {} : o === "yes" ? { min: 1 } : { max: 0 })}>{o === "any" ? "Any" : o === "yes" ? "Yes" : "No"}</button>))}</div>;
  } else if (!st) {
    body = <p className="ssr-say">Not enough companies report this yet.</p>;
  } else {
    const sc = scaleOf(st);
    const a = r.min == null ? 0 : sc.toPos(r.min), b = r.max == null ? STEPS : sc.toPos(r.max);
    const top = Math.max(1, ...sc.bars), n = sc.bars.length;
    const inside = (i: number) => { const p0 = (i / n) * STEPS, p1 = ((i + 1) / n) * STEPS; return p1 > a && p0 < b; };
    const med = st.p50 >= sc.lo && st.p50 <= sc.hi ? (sc.toPos(st.p50) / STEPS) * 100 : null;
    body = (
      <>
        <div className="ssr-hist" role="img" aria-label={`How ${cur.label} is spread across ${nf(st.n, 0)} companies${sc.log ? ", on a log scale" : ""}; the dashed line is the middle company`}>
          {sc.bars.map((c, i) => <i key={i} className={inside(i) ? "in" : ""} style={{ height: `${Math.max(4, (c / top) * 100)}%` }} />)}
          {med != null && <span className="ssr-med" style={{ left: `${med}%` }} aria-hidden="true" />}
        </div>
        <div className="ssr-dual">
          <input type="range" min={0} max={STEPS} value={a} aria-label={`${cur.label}: from (slider)`}
            onChange={(e) => { const v = Number(e.target.value); set({ ...r, min: v <= 0 ? undefined : Math.min(nice(sc.at(v)), r.max ?? Infinity) }); }} />
          <input type="range" min={0} max={STEPS} value={b} aria-label={`${cur.label}: to (slider)`}
            onChange={(e) => { const v = Number(e.target.value); set({ ...r, max: v >= STEPS ? undefined : Math.max(nice(sc.at(v)), r.min ?? -Infinity) }); }} />
          <span className="ssr-tr" aria-hidden="true"><i style={{ left: `${(a / STEPS) * 100}%`, right: `${100 - (b / STEPS) * 100}%` }} /></span>
        </div>
        <div className="ssr-mm">
          <label>From <input type="number" inputMode="decimal" placeholder="any" value={r.min ?? ""} onChange={(e) => set({ ...r, min: num(e.target.value) })} aria-label={`${cur.label} from`} /></label>
          <label>to <input type="number" inputMode="decimal" placeholder="any" value={r.max ?? ""} onChange={(e) => set({ ...r, max: num(e.target.value) })} aria-label={`${cur.label} to`} /></label>
          {unit.trim() && <span className="ssr-u">{unit.trim()}</span>}
        </div>
        {quickRanges(cur).length > 0 && <div className="ssr-pre" role="group" aria-label={`Quick ranges for ${cur.label}`}>{quickRanges(cur).map((q) => (
          <button key={q.id} type="button" aria-pressed={same(r, q.r)} onClick={() => set(q.r)}>{q.label}</button>))}</div>}
      </>
    );
  }
  return (
    <div className={"ssr-rule" + (hot ? " hot" : "")} role="group" aria-labelledby={id}>
      {head}
      <p className="ssr-say" title={m.say}>{m.say}</p>
      {tabs && <div className="ssr-vars" role="group" aria-label={`${m.label}: which figure`}>{tabs.map(([t]) => (
        <button key={t} type="button" aria-pressed={period === t} onClick={() => setPeriod(t)}>{({ now: "Now", "3y": "3Y avg", "5y": "5Y avg", "7y": "7Y avg" } as Record<string, string>)[t] ?? t}</button>))}</div>}
      {body}
      <p className="ssr-cnt" aria-live="polite">
        {count ? <>Keeps <b>{nf(count.after, 0)}</b> of {nf(count.before, 0)}{count.missing > 0 ? ` · ${nf(count.missing, 0)} have no figure` : ""}</> : r.min == null && r.max == null ? "Set a range to use this rule" : "Counting…"}
        {st && cur.unit !== "flag" ? ` · middle of all companies ${fmtMetric(cur, st.p50)}` : ""}
      </p>
    </div>
  );
}
