// The Custom ratio drawer of the Stock screener (task #64, Part 3, CR-1 to CR-6). It opens from the right over a dimmed page, so the panel and the table
// do not move: 1 pick two figures (searchable, amounts first, never a FinLit score or a yes-or-no filter), 2 check what it gives (formula, a worked example,
// the unit check, "already a filter", % or ×), 3 set a condition (spread chart, presets from the ratio's own spread, live counts), 4 name it. Add puts it on
// the page like any other rule. The server works out every value; a company with a missing figure, or a bottom figure of zero or below, shows a dash.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { nf } from "../../lib/format";
import { MAX_RATIOS, type CustomRatio, type GroupInfo, type MetricInfo } from "../../lib/proscreen";
import { EXAMPLES, closeFilter, convert, countPass, defaultShow, presets, signed, suggestName, unitCheck, unitTag, valueText, type Stats } from "../../lib/customRatio";
import { useFocusTrap } from "../../lib/focusTrap";
import "../../styles/ratiodrawer.css";

export type Draft = Omit<CustomRatio, "id"> & { id?: string };
type Props = {
  groups: GroupInfo[]; byKey: Map<string, MetricInfo>;
  /** The ratio being changed ("Change this ratio"), or a start (an example, a saved ratio), or nothing (a new one). */ start?: Draft | null;
  ratiosOn: number; firstSymbols: string[];
  /** How many of the companies the other rules leave would pass this ratio as well (a /query with limit 1), and how many they leave now. */
  countWith: (r: Draft) => Promise<number>; currentTotal: number | null;
  onAdd: (r: Draft) => void; onSave: (r: Draft) => void; onUseFilter: (m: MetricInfo) => void; onClose: () => void;
};

const BAR_W = 100 / 30;
/** A ratio value as a person would read it, with its sign: three significant figures, no padded zeros (5%, 0.05×, −857%). */
const nice = signed;

export function RatioDrawer({ groups, byKey, start, ratiosOn, firstSymbols, countWith, currentTotal, onAdd, onSave, onUseFilter, onClose }: Props) {
  const editing = !!start?.id;
  const [num, setNum] = useState(start?.num ?? ""), [den, setDen] = useState(start?.den ?? "");
  const [field, setField] = useState<"num" | "den" | null>(start?.num ? null : "num");
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"pct" | "times">(start?.show ?? "times"), [showTouched, setShowTouched] = useState(!!start?.show);
  const [op, setOp] = useState<CustomRatio["op"]>(start?.op ?? "gt"), [a, setA] = useState<string>(start?.a != null ? String(start.a) : ""), [b, setB] = useState<string>(start?.b != null ? String(start.b) : "");
  const [presetTouched, setPresetTouched] = useState(start?.a != null || start?.op === "none");
  const [name, setName] = useState(start?.name ?? ""), [nameTyped, setNameTyped] = useState(!!start?.name && start.name !== suggestName(byKey.get(start.num), byKey.get(start.den)));
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box, true);
  const top = byKey.get(num), bottom = byKey.get(den);

  // Esc closes an open figure list first, then the drawer
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key !== "Escape") return; e.preventDefault(); if (field) setField(null); else onClose(); };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [field, onClose]);

  // CR-5: the suggested name follows the figures until the reader types one
  useEffect(() => { if (!nameTyped) setName(suggestName(top, bottom)); }, [num, den]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useQuery<Stats>({
    queryKey: ["ratio-stats", num, den, show, firstSymbols.slice(0, 25).join(",")], enabled: !!top && !!bottom && num !== den, staleTime: 10 * 60_000, retry: false,
    queryFn: () => apiGet<Stats>(`/api/screener/ratio-stats?num=${encodeURIComponent(num)}&den=${encodeURIComponent(den)}&show=${show}&first=${encodeURIComponent(firstSymbols.slice(0, 25).join(","))}`),
  });
  const st = stats.data;

  // CR-3: % when both are in one family and the middle value is under 1 (worked out once the spread in × is known), unless the reader chose
  useEffect(() => {
    if (showTouched || !st || show !== "times") return;
    const want = defaultShow(top, bottom, st.p50);
    if (want !== show) {        // 14 Nov N-7: the value already in the box moves with the unit (0.05× is 5%)
      setA((x) => (x.trim() === "" ? x : String(convert(Number(x), want)))); setB((x) => (x.trim() === "" ? x : String(convert(Number(x), want)))); setShow(want);
    }
  }, [st]); // eslint-disable-line react-hooks/exhaustive-deps

  // CR-4: start on "Above the middle", so the box is never empty
  const ps = presets(st);
  useEffect(() => { if (!presetTouched && ps.length) { const p = ps[1]; setOp(p.op); setA(String(p.a)); setB(""); } }, [st]); // eslint-disable-line react-hooks/exhaustive-deps

  const av = a.trim() === "" ? undefined : Number(a), bv = b.trim() === "" ? undefined : Number(b);
  const valueMissing = (op === "gt" || op === "lt") ? av == null || !Number.isFinite(av) : op === "between" ? av == null || bv == null || !Number.isFinite(av) || !Number.isFinite(bv) : false;
  const draft: Draft = { id: start?.id, name: (name.trim() || suggestName(top, bottom)).slice(0, 40), num, den, show, op, ...(op === "none" ? {} : { a: av }), ...(op === "between" ? { b: bv } : {}) };
  const tooMany = !editing && ratiosOn >= MAX_RATIOS;
  const offReason = !top || !bottom ? "Pick a top and a bottom figure." : num === den ? "Pick two different figures." : valueMissing ? "Enter a value, pick a preset, or choose No condition." : tooMany ? "You have 3 ratios on, the most at one time. Remove one to add another." : null;

  const passing = st ? countPass(st.values, op, av, bv) : null;
  const [withOthers, setWithOthers] = useState<number | null>(null);
  useEffect(() => {
    if (!top || !bottom || num === den || valueMissing) { setWithOthers(null); return; }
    let live = true;
    const t = window.setTimeout(() => { countWith(draft).then((n) => live && setWithOthers(n)).catch(() => live && setWithOthers(null)); }, 350);
    return () => { live = false; window.clearTimeout(t); };
  }, [num, den, show, op, a, b]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = closeFilter(num, den, byKey);
  const unit = unitCheck(top, bottom);
  const u = show === "pct" ? "%" : "×";
  const switchShow = (to: "pct" | "times") => { if (to === show) return; setShowTouched(true); setA((x) => (x.trim() === "" ? x : String(convert(Number(x), to)))); setB((x) => (x.trim() === "" ? x : String(convert(Number(x), to)))); setShow(to); };
  const useExample = (x: (typeof EXAMPLES)[number]) => {
    setNum(x.num); setDen(x.den); setField(null); setQ(""); setPresetTouched(false); setShow(x.show); setShowTouched(true);
    setNameTyped(true); setName(x.name);         // an example comes with its own name
  };
  const examples = EXAMPLES.filter((x) => byKey.has(x.num) && byKey.has(x.den)).slice(0, 4);
  const ready = !!top && !!bottom && num !== den;
  const pick = (k: string) => {
    if (field === "num") { setNum(k); setField(den ? null : "den"); } else if (field === "den") { setDen(k); setField(num ? null : "num"); }
    setQ(""); setPresetTouched(false); setShowTouched(false); setShow("times");
  };

  return (
    <>
      <div className="scrim rd-back" onClick={onClose} aria-hidden="true" />
      <div className="rd" role="dialog" aria-modal="true" aria-labelledby="rd-h" ref={box}>
        <div className="rd-head"><h2 id="rd-h">{editing ? "Change this ratio" : "Build a custom ratio"}</h2><button type="button" className="rd-x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="rd-body">
          <p className="rd-lead">Divide one company figure by another. The result becomes a column in the table, and a filter too if you set a condition.</p>
          {!editing && examples.length > 0 && <div className="rd-exs" role="group" aria-label="Examples"><small>Examples:</small>{examples.map((x) => (
            <button key={x.name} type="button" className="rd-chip" onClick={() => useExample(x)}>{x.name}</button>))}</div>}
          <div className="rd-sec" role="group" aria-labelledby="rd-s1"><h3 id="rd-s1"><span>1</span> Pick two figures</h3>
            <div className="rd-frac">
              <FieldBtn label="Top" m={top} on={field === "num"} onClick={() => setField(field === "num" ? null : "num")} />
              <div className="rd-line"><button type="button" className="rd-swap" onClick={() => { setNum(den); setDen(num); setPresetTouched(false); setShowTouched(false); setShow("times"); }} disabled={!num && !den} aria-label="Swap top and bottom">⇅</button></div>
              <FieldBtn label="Bottom" m={bottom} on={field === "den"} onClick={() => setField(field === "den" ? null : "den")} />
            </div>
            {field && <FigureList groups={groups} q={q} setQ={setQ} other={field === "num" ? den : num} onPick={pick} which={field === "num" ? "top" : "bottom"} />}
          </div>

          {!ready && <>          {/* 14 Nov N-3: all four steps are named from the start; 2 to 4 wait, greyed, until both figures are picked */}
            {[["2", "Check what it gives"], ["3", "Set a condition"], ["4", "Name it"]].map(([n, t]) => (
              <div key={n} className="rd-sec is-wait" aria-disabled="true"><h3><span>{n}</span> {t}</h3><p className="rd-wait">Pick both figures first.</p></div>))}
          </>}
          {ready && top && bottom && <>
            <div className="rd-sec" role="group" aria-labelledby="rd-s2"><h3 id="rd-s2"><span>2</span> Check what it gives</h3>
              <p className="rd-formula"><b>{top.label}</b> ÷ <b>{bottom.label}</b></p>
              {st?.example ? <p className="rd-ex">For example, {st.example.name || st.example.symbol}: {fmtFig(st.example.num, top)} ÷ {fmtFig(st.example.den, bottom)} = <b>{nice(st.example.value)}{u}</b></p>
                : st ? <p className="rd-ex muted">None of the companies on your list has both figures, so there is no worked example.</p> : null}
              {unit && <p className={"rd-note " + unit.tone} role="note">{unit.text}</p>}
              {close && <p className="rd-note warn" role="note">This is close to {close.label}, which is already one of the filters, with its own ranges. <button type="button" className="lnk" onClick={() => onUseFilter(close)}>Use {close.label} instead</button></p>}
              <div className="rd-seg" role="radiogroup" aria-label="Show it as">
                <button type="button" role="radio" aria-checked={show === "pct"} onClick={() => switchShow("pct")}>A percentage (%)</button>
                <button type="button" role="radio" aria-checked={show === "times"} onClick={() => switchShow("times")}>Times (×)</button>
              </div>
            </div>

            <div className="rd-sec" role="group" aria-labelledby="rd-s3"><h3 id="rd-s3"><span>3</span> Set a condition</h3>
              <div className="rd-seg" role="radiogroup" aria-label="Condition">
                {([["gt", "Above"], ["lt", "Below"], ["between", "Between"], ["none", "No condition, just the column"]] as const).map(([v, t]) => (
                  <button key={v} type="button" role="radio" aria-checked={op === v} onClick={() => { setOp(v); setPresetTouched(true); }}>{t}</button>))}
              </div>
              {stats.isLoading && <div className="skeleton" style={{ height: 96 }} />}
              {stats.isError && <p className="rd-note warn">The spread of this ratio could not be loaded. You can still set a value.</p>}
              {st && <Spread st={st} op={op} a={av} b={bv} u={u} />}
              {st && <p className="rd-spread">{st.p5 != null && st.p95 != null ? <>Most companies: {nice(st.p5)}{u} to {nice(st.p95)}{u} · </> : null}{nf(st.have, 0)} of {nf(st.total, 0)} have both figures.{st.total > st.have ? ` The other ${nf(st.total - st.have, 0)} are missing one, or the bottom figure is zero or less; they show a dash and are left out by a condition.` : ""}</p>}
              {op !== "none" && <div className="rd-vals">
                <label>{op === "gt" ? "At least" : op === "lt" ? "At most" : "From"} <input type="number" inputMode="decimal" value={a} onChange={(e) => { setA(e.target.value); setPresetTouched(true); }} aria-label={op === "between" ? "From" : op === "gt" ? "At least" : "At most"} /> <span>{u}</span></label>
                {op === "between" && <label>to <input type="number" inputMode="decimal" value={b} onChange={(e) => { setB(e.target.value); setPresetTouched(true); }} aria-label="To" /> <span>{u}</span></label>}
              </div>}
              {op !== "none" && ps.length > 0 && <div className="rd-pre" role="group" aria-label="Presets from this ratio's spread">{ps.map((p) => (
                <button key={p.id} type="button" className={"rd-chip" + (op === p.op && av === p.a ? " on" : "")} onClick={() => { setOp(p.op); setA(String(p.a)); setB(""); setPresetTouched(true); }}>{p.label} <small>{p.op === "gt" ? "≥" : "≤"} {p.a}{u}</small></button>))}
                <small className="rd-pre-n">Market spreads of this ratio, not FinLit cut-offs.</small></div>}
              {passing != null && <p className="rd-count" aria-live="polite"><b>{nf(passing, 0)}</b> of {nf(st!.total, 0)} companies {op === "none" ? "have this ratio" : "pass this ratio"}.{withOthers != null && currentTotal != null ? <> With your other filters, <b>{nf(withOthers, 0)}</b> of the {nf(currentTotal, 0)} left.</> : null}</p>}
            </div>

            <div className="rd-sec" role="group" aria-labelledby="rd-s4"><h3 id="rd-s4"><span>4</span> Name it</h3>
              <input className="rd-name" value={name} maxLength={40} onChange={(e) => { setName(e.target.value); setNameTyped(e.target.value.trim() !== ""); }} aria-label="Ratio name" placeholder={suggestName(top, bottom)} />
              <small className="muted">The name is the column heading and the chip. Up to 40 characters.</small>
            </div>
          </>}
        </div>
        <div className="rd-foot">
          <span className="rd-foot-n">{offReason ?? <>Adds a chip and a column{withOthers != null && op !== "none" ? <> · the list would show {nf(withOthers, 0)} {withOthers === 1 ? "company" : "companies"}</> : null}</>}</span>
          <button type="button" className="btn" disabled={!top || !bottom || num === den} onClick={() => onSave(draft)}>Save to My ratios</button>
          <button type="button" className="btn primary" disabled={!!offReason} title={offReason ?? undefined} onClick={() => onAdd(draft)}>{editing ? "Save changes" : op === "none" ? "Add the column" : "Add to filters"}</button>
        </div>
      </div>
    </>
  );
}

function fmtFig(v: number, m: MetricInfo): string {
  const t = unitTag(m);
  return t === "₹ Cr" ? `₹${nf(v, Math.abs(v) >= 100 ? 0 : 2)} Cr` : t === "₹ per share" ? `₹${nf(v, 2)}` : `${nf(v, 2)}${t === "%" ? "%" : t === "×" ? "×" : ""}`;
}

function FieldBtn({ label, m, on, onClick }: { label: string; m?: MetricInfo; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={"rd-field" + (on ? " on" : "")} onClick={onClick} aria-expanded={on}>
      <small>{label}</small>{m ? <><b>{m.label}</b><span className="rd-tag">{unitTag(m)}</span></> : <i>Pick a figure</i>}
    </button>);
}

/** CR-2 (14 Nov): every figure that can be divided, listed at once with no tick box, in two parts with headings that stay at the top while their part scrolls:
 *  the amounts first, then the ratios, percentages and counts. Grouped by the catalog's groups, every row with its unit tag. Search filters both parts. */
export function FigureList({ groups, q, setQ, other, onPick, which }: { groups: GroupInfo[]; q: string; setQ: (v: string) => void; other: string; onPick: (k: string) => void; which: "top" | "bottom" }) {
  const find = useRef<HTMLInputElement>(null);
  useEffect(() => { find.current?.focus(); }, [which]);
  const t = q.trim().toLowerCase();
  const usable = (m: MetricInfo) => m.ratioable !== false && !m.hidden && !m.locked;
  const hit = (m: MetricInfo) => !t || m.label.toLowerCase().includes(t) || m.key.toLowerCase().includes(t);
  const part = (amount: boolean) => groups.map((g) => ({ g, ms: g.metrics.filter((m) => usable(m) && !!m.family === amount) })).filter((x) => x.ms.length);
  const amounts = useMemo(() => part(true), [groups]), others = useMemo(() => part(false), [groups]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = (p: typeof amounts, f = (_: MetricInfo) => true) => p.reduce((k, x) => k + x.ms.filter(f).length, 0);
  const nA = n(amounts), nO = n(others), hA = n(amounts, hit), hO = n(others, hit);
  const Part = ({ title, line, p, count }: { title: string; line: string; p: typeof amounts; count: number }) => count === 0 ? null : (
    <section className="rd-part" aria-label={`${title}: ${count}`}>
      <div className="rd-ph"><b>{title} · {count}</b><small>{line}</small></div>
      {p.map(({ g, ms }) => { const shown = ms.filter(hit); return shown.length ? <div key={g.id}><div className="rd-g">{g.label}</div>{shown.map((m) => (
        <button key={m.key} type="button" className="rd-opt" disabled={m.key === other} onClick={() => onPick(m.key)}><span>{m.label}</span><span className="rd-tag">{unitTag(m)}</span></button>))}</div> : null; })}
    </section>);
  return (
    <div className="rd-list" role="group" aria-label={`Pick the ${which} figure`}>
      <label className="rd-find"><span className="sr">Search figures</span><input ref={find} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search figures, e.g. cash, borrowings, sales" /></label>
      <p className="rd-cnt" aria-live="polite">{t
        ? <><b>{hA + hO}</b> of {nA + nO} figures match: {hA} {hA === 1 ? "amount" : "amounts"}, {hO} {hO === 1 ? "other" : "others"}.</>
        : <><b>All {nA + nO} figures</b> are listed: {nA} amounts first, then {nO} ratios, percentages and counts. Scroll, or search.</>}</p>
      <div className="rd-opts">
        <Part title="Amounts" line="₹ Cr, ₹ per share, shares and people. Two of the same kind give a ratio that reads plainly." p={amounts} count={hA} />
        <Part title="Ratios, percentages and counts" line="Already a ratio or a rate. You can still use them; Step 2 says how the result reads." p={others} count={hO} />
        {hA + hO === 0 && <p className="muted rd-none">No figure matches “{q}”.</p>}</div>
    </div>);
}

/** CR-4: the spread chart: 30 bars from p2 to p98 (log scale when the spread is wide; a signed log when it also crosses zero), companies outside the range in the end bars,
 *  the chosen range in gold, and the low, middle and high values under it, each with its sign. */
function Spread({ st, op, a, b, u }: { st: Stats; op: CustomRatio["op"]; a?: number; b?: number; u: string }) {
  const lo = st.p2, hi = st.p98, max = Math.max(1, ...st.hist30);
  if (lo == null || hi == null || hi <= lo) return null;
  const log = st.scale === "log" && lo > 0, sym = st.scale === "symlog" && !!st.symC;
  const c = st.symC || 1;
  const T = (v: number) => (log ? Math.log(Math.max(v, lo)) : sym ? Math.asinh(v / c) : v), inv = (y: number) => (log ? Math.exp(y) : sym ? Math.sinh(y) * c : y);
  const x = (v: number) => Math.min(1, Math.max(0, (T(Math.min(Math.max(v, lo), hi)) - T(lo)) / (T(hi) - T(lo))));
  const keepLo = op === "gt" ? a : op === "between" && a != null && b != null ? Math.min(a, b) : op === "lt" ? -Infinity : undefined;
  const keepHi = op === "lt" ? a : op === "between" && a != null && b != null ? Math.max(a, b) : op === "gt" ? Infinity : undefined;
  const kept = (i: number) => {
    if (op === "none") return true;
    if (keepLo == null || keepHi == null) return false;
    const mid = inv(T(lo) + ((i + 0.5) / 30) * (T(hi) - T(lo)));
    return mid >= keepLo && mid <= keepHi;
  };
  return (
    <figure className="rd-chart" aria-label={`Spread of this ratio across ${st.have} companies${log || sym ? ", on a log scale" : ""}`}>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">{st.hist30.map((n, i) => (
        <rect key={i} x={i * BAR_W + 0.3} width={BAR_W - 0.6} y={40 - (n / max) * 38} height={(n / max) * 38} className={kept(i) ? "on" : ""} />))}
        {op !== "none" && a != null && Number.isFinite(a) && <line x1={x(a) * 100} x2={x(a) * 100} y1={0} y2={40} />}
      </svg>
      <figcaption><span>{nice(lo)}{u}{st.have > 0 ? " or less" : ""}</span><span>middle {st.p50 != null ? nice(st.p50) : "–"}{u}</span><span>{nice(hi)}{u}{st.have > 0 ? " or more" : ""}</span>{(log || sym) && <em>log scale</em>}</figcaption>
    </figure>);
}

export { valueText };
