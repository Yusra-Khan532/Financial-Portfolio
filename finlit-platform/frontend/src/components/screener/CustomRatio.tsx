// The Custom Ratio Screener of the stock screener (task #61): pick any two figures from the screener, name the ratio, say what it must be, and the table gets a column for it.
// It is a full-width panel above the results (not a form squeezed into the filter sidebar): name and formula preview, numerator and denominator, the condition, then Add another ratio,
// Save ratio, Reset and Run screener, with the ratios in use shown as criteria chips. The server divides the two figures per company; a company missing either figure (or with a zero
// denominator) shows a dash and never passes a range.
import { useId, useState } from "react";
import { MAX_RATIOS, MAX_SAVED, ratioLabel, ratioRange, type CustomRatio, type GroupInfo, type MetricInfo, type SavedRatio } from "../../lib/proscreen";

const OPS: { v: CustomRatio["op"]; t: string }[] = [{ v: "gt", t: "Greater than (>)" }, { v: "lt", t: "Less than (<)" }, { v: "between", t: "Between" }, { v: "none", t: "No limit: just show it" }];
const EXAMPLES: { name: string; num: string; den: string; op: CustomRatio["op"]; a: number; say: string }[] = [
  { name: "Profit on assets", num: "net_profit", den: "total_assets", op: "gt", a: 0.05, say: "Net profit ÷ Total assets above 0.05: how much profit each rupee of assets earned" },
  { name: "Operating profit to sales", num: "op_profit", den: "revenue", op: "gt", a: 0.15, say: "Operating profit ÷ Sales above 0.15" },
  { name: "Enterprise value vs market cap", num: "enterprise_value", den: "market_cap", op: "lt", a: 1.2, say: "Enterprise value ÷ Market cap below 1.2: a small gap between the two" },
];
const unitOf = (m?: MetricInfo) => (m ? (m.unit === "Cr" ? "₹ Cr" : m.unit) : "");

export function ratioSentence(r: CustomRatio | SavedRatio, byKey: Map<string, MetricInfo>): string {
  const n = byKey.get(r.num)?.label ?? r.num, d = byKey.get(r.den)?.label ?? r.den, g = ratioRange(r as CustomRatio);
  const lim = g.min != null && g.max != null ? ` between ${g.min} and ${g.max}` : g.min != null ? ` > ${g.min}` : g.max != null ? ` < ${g.max}` : "";
  return `${ratioLabel(r as CustomRatio)}: ${n} ÷ ${d}${lim}`;
}
const chipText = (r: CustomRatio, byKey: Map<string, MetricInfo>) => {
  const g = ratioRange(r), lim = g.min != null && g.max != null ? ` ${g.min} to ${g.max}` : g.min != null ? ` > ${g.min}` : g.max != null ? ` < ${g.max}` : "";
  return `${ratioLabel(r)}${lim}`.trim() || (byKey.get(r.num)?.label ?? "Ratio");
};

type Props = { groups: GroupInfo[]; byKey: Map<string, MetricInfo>; ratios: CustomRatio[]; onChange: (r: CustomRatio[]) => void; ask: (why: string) => void; saved?: SavedRatio[]; onSaved?: (s: SavedRatio[]) => void; onRun?: () => void; onClose?: () => void };

export function CustomRatioBuilder({ groups, byKey, ratios, onChange, ask, saved = [], onSaved, onRun, onClose }: Props) {
  const uid = useId();
  const [name, setName] = useState(""), [num, setNum] = useState(""), [den, setDen] = useState(""), [op, setOp] = useState<CustomRatio["op"]>("gt"), [a, setA] = useState(""), [b, setB] = useState("");
  const [err, setErr] = useState(""), [list, setList] = useState(false), [note, setNote] = useState("");
  // no FinLit score on any plan (dividing one score by another means nothing; task #64 P-1 and CR-2), and no yes-or-no filter
  const usable = (m: MetricInfo) => !m.hidden && m.unit !== "flag";
  groups = groups.filter((g) => g.id !== "model" && g.id !== "prism");
  const reset = () => { setName(""); setNum(""); setDen(""); setA(""); setB(""); setOp("gt"); setErr(""); setNote(""); };
  /** The ratio in the form, or an error in words. */
  const build = (): { r: Omit<CustomRatio, "id"> } | { error: string } => {
    if (!num || !den) return { error: "Choose both a numerator and a denominator." };
    if (num === den) return { error: "The numerator and the denominator are the same figure; choose two different ones." };
    const x = a.trim() === "" ? undefined : Number(a), y = b.trim() === "" ? undefined : Number(b);
    if (op !== "none" && (x == null || !Number.isFinite(x))) return { error: "Enter the value to compare with." };
    if (op === "between" && (y == null || !Number.isFinite(y))) return { error: "Enter both ends of the range." };
    return { r: { name: name.trim().slice(0, 40), num, den, op, ...(op !== "none" ? { a: x } : {}), ...(op === "between" ? { b: y } : {}) } };
  };
  const add = (r: Omit<CustomRatio, "id">): boolean => {
    const nm = byKey.get(r.num), dm = byKey.get(r.den);
    if (nm?.locked || dm?.locked) { ask(`${nm?.locked ? nm.label : dm?.label} is part of a higher plan.`); return false; }
    if (ratios.length >= MAX_RATIOS) { setErr(`You can use up to ${MAX_RATIOS} custom ratios at a time. Remove one first.`); return false; }
    const id = ["r0", "r1", "r2"].find((k) => !ratios.some((x) => x.id === k))!;
    onChange([...ratios, { id, ...r }]);
    return true;
  };
  const addAnother = () => { setErr(""); setNote(""); const x = build(); if ("error" in x) { setErr(x.error); return; } if (add(x.r)) { reset(); setNote("Added. Build the next one."); } };
  const run = () => {
    setErr(""); setNote("");
    const empty = !num && !den;
    if (empty && ratios.length) { onRun?.(); return; }
    const x = build(); if ("error" in x) { setErr(x.error); return; }
    if (add(x.r)) { reset(); onRun?.(); }
  };
  const save = () => {
    setErr(""); setNote("");
    const x = build(); if ("error" in x) { setErr(x.error); return; }
    if (!x.r.name) { setErr("Give the ratio a name before saving it."); return; }
    if (saved.length >= MAX_SAVED && !saved.some((s) => s.name === x.r.name)) { setErr(`You can keep up to ${MAX_SAVED} saved ratios. Delete one first.`); return; }
    onSaved?.([x.r, ...saved.filter((s) => s.name !== x.r.name)].slice(0, MAX_SAVED)); setNote(`Saved “${x.r.name}”.`);
  };
  const load = (s: SavedRatio) => { setName(s.name); setNum(s.num); setDen(s.den); setOp(s.op); setA(s.a != null ? String(s.a) : ""); setB(s.b != null ? String(s.b) : ""); setErr(""); setNote(""); setList(false); };
  const options = (skip: string) => groups.map((g) => { const ms = g.metrics.filter(usable); return ms.length ? <optgroup key={g.id} label={g.label}>{ms.map((m) => <option key={m.key} value={m.key} disabled={m.key === skip}>{m.label} ({unitOf(m)}){m.locked ? " · higher plan" : ""}</option>)}</optgroup> : null; });
  const nm = byKey.get(num), dm = byKey.get(den);
  /** A few ready ratios from figures that exist in the screener, to start from (shown only when both figures are there and the reader's plan has them). */
  const examples = EXAMPLES.filter((x) => { const n = byKey.get(x.num), d = byKey.get(x.den); return n && d && !n.hidden && !d.hidden && !n.locked && !d.locked; });
  const useExample = (x: (typeof EXAMPLES)[number]) => { setName(x.name); setNum(x.num); setDen(x.den); setOp(x.op); setA(String(x.a)); setB(""); setErr(""); setNote(""); };
  const meaning = !num || !den ? "Pick the two figures first." : op === "none" ? "No limit: every company that has both figures is listed, with the ratio as a column." : a.trim() === "" ? "Enter the value to compare with." :
    op === "gt" ? `Companies whose ratio is above ${a} pass.` : op === "lt" ? `Companies whose ratio is below ${a} pass.` : b.trim() === "" ? "Enter both ends of the range." : `Companies whose ratio is between ${a} and ${b} pass.`;
  return (
    <section className="crx" aria-labelledby={uid + "h"}>
      <header className="crx-h">
        <div><h2 id={uid + "h"}>Custom Ratio Screener</h2><p>Create your own ratio from any two figures, set a condition, and screen stocks. The table gets a column for it.</p></div>
        <div className="crx-hb">
          <button type="button" className="btn" aria-expanded={list} onClick={() => setList((v) => !v)}>Saved ratios ({saved.length})</button>
          {onClose && <button type="button" className="btn" onClick={onClose} aria-label="Close the Custom Ratio Screener">Close</button>}
        </div>
      </header>
      {list && <div className="crx-saved" role="region" aria-label="Saved ratios">{saved.length ? <ul>{saved.map((s) => (
        <li key={s.name}><button type="button" onClick={() => load(s)}><b>{s.name}</b><small>{ratioSentence(s, byKey)}</small></button>
          <button type="button" className="crx-del" aria-label={`Delete saved ratio ${s.name}`} onClick={() => onSaved?.(saved.filter((x) => x.name !== s.name))}>×</button></li>))}</ul> : <p>No saved ratios yet. Build one, give it a name and choose Save ratio.</p>}</div>}
      {examples.length > 0 && <div className="crx-ex" role="group" aria-label="Examples"><span>Try an example</span>{examples.map((x) => <button type="button" key={x.name} className="crx-exb" title={x.say} onClick={() => useExample(x)}>{x.name}</button>)}</div>}
      <div className="crx-top">
        <label className="crx-f crx-name"><span>1. Name your ratio <small>(optional)</small></span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cash conversion ratio" /></label>
        <div className="crx-prev" aria-live="polite"><span>Formula preview</span><b className={nm && dm ? "ok" : "faint"}>{nm && dm ? <>{nm.label} <i>÷</i> {dm.label}</> : "Choose a numerator and a denominator below"}</b></div>
      </div>
      <p className="crx-step">2. Choose the two figures</p>
      <div className="crx-nd">
        <div className="crx-box"><span className="crx-badge">N</span><label className="crx-f"><span>Numerator</span><select value={num} onChange={(e) => setNum(e.target.value)} aria-label="Numerator"><option value="">Choose a figure…</option>{options(den)}</select></label></div>
        <div className="crx-slash" aria-hidden="true">÷</div>
        <div className="crx-box"><span className="crx-badge d">D</span><label className="crx-f"><span>Denominator</span><select value={den} onChange={(e) => setDen(e.target.value)} aria-label="Denominator"><option value="">Choose a figure…</option>{options(num)}</select></label></div>
      </div>
      <fieldset className="crx-set"><legend>3. Set the condition</legend>
        <label className="crx-f crx-cond"><span>Show companies where the ratio is</span><select value={op} onChange={(e) => setOp(e.target.value as CustomRatio["op"])} aria-label="Condition">{OPS.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}</select></label>
        {op !== "none" && <label className="crx-f crx-val"><span>{op === "between" ? "From" : "Value"}</span><input type="number" inputMode="decimal" step="any" value={a} onChange={(e) => setA(e.target.value)} aria-label={op === "between" ? "From" : "Value"} placeholder={op === "between" ? "From" : "e.g. 1.5"} /></label>}
        {op === "between" && <label className="crx-f crx-val"><span>To</span><input type="number" inputMode="decimal" step="any" value={b} onChange={(e) => setB(e.target.value)} aria-label="To" placeholder="To" /></label>}
        <p className="crx-mean" aria-live="polite">{meaning}</p>
      </fieldset>
      {err && <p className="crx-err" role="alert">{err}</p>}
      {note && !err && <p className="crx-ok" role="status">{note}</p>}
      <div className="crx-act">
        <button type="button" className="btn crx-add" onClick={addAnother} disabled={ratios.length >= MAX_RATIOS}>+ Add another ratio</button>
        <button type="button" className="btn" onClick={save}>Save ratio</button>
        <span className="crx-gap" />
        <button type="button" className="btn" onClick={reset}>Reset</button>
        <button type="button" className="btn primary" onClick={run}>Run screener</button>
      </div>
      <div className="crx-crit" aria-label="Applied custom ratios"><b>Applied criteria ({ratios.length})</b>
        {ratios.length ? ratios.map((r) => <span key={r.id} className="crx-chip" title={ratioSentence(r, byKey)}>{chipText(r, byKey)}<button type="button" aria-label={`Remove ${ratioLabel(r)}`} onClick={() => onChange(ratios.filter((x) => x.id !== r.id))}>×</button></span>) : <small>None yet. Up to {MAX_RATIOS} ratios at a time.</small>}</div>
      <p className="crx-note">A company missing either figure, or with a zero denominator, shows a dash and is left out when a condition is set. Describes figures from filings; not a recommendation.</p>
    </section>
  );
}
