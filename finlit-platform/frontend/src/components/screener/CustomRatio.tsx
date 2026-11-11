// Custom ratio builder of the stock screener (task #61): pick any two figures from the screener, say what the ratio must be, and the table gets a column for it.
// The server divides the two figures per company; a company missing either figure (or with a zero denominator) shows a dash and never passes a range.
import { useState } from "react";
import { MAX_RATIOS, ratioLabel, ratioRange, type CustomRatio, type GroupInfo, type MetricInfo } from "../../lib/proscreen";

const OPS: { v: CustomRatio["op"]; t: string }[] = [{ v: "gt", t: "Greater than (>)" }, { v: "lt", t: "Less than (<)" }, { v: "between", t: "Between" }, { v: "none", t: "No limit: just show it" }];
const unitOf = (m?: MetricInfo) => (m ? (m.unit === "Cr" ? "₹ Cr" : m.unit) : "");

export function ratioSentence(r: CustomRatio, byKey: Map<string, MetricInfo>): string {
  const n = byKey.get(r.num)?.label ?? r.num, d = byKey.get(r.den)?.label ?? r.den, g = ratioRange(r);
  const lim = g.min != null && g.max != null ? ` between ${g.min} and ${g.max}` : g.min != null ? ` > ${g.min}` : g.max != null ? ` < ${g.max}` : "";
  return `${ratioLabel(r)}: ${n} ÷ ${d}${lim}`;
}

export function CustomRatioBuilder({ groups, byKey, ratios, onChange, ask }: { groups: GroupInfo[]; byKey: Map<string, MetricInfo>; ratios: CustomRatio[]; onChange: (r: CustomRatio[]) => void; ask: (why: string) => void }) {
  const [name, setName] = useState(""), [num, setNum] = useState(""), [den, setDen] = useState(""), [op, setOp] = useState<CustomRatio["op"]>("gt"), [a, setA] = useState(""), [b, setB] = useState("");
  const [err, setErr] = useState("");
  const usable = (m: MetricInfo) => !m.hidden && m.unit !== "flag";
  const add = () => {
    setErr("");
    if (!num || !den) { setErr("Choose both a numerator and a denominator."); return; }
    if (num === den) { setErr("The numerator and the denominator are the same figure; choose two different ones."); return; }
    const nm = byKey.get(num), dm = byKey.get(den);
    if (nm?.locked || dm?.locked) { ask(`${nm?.locked ? nm.label : dm?.label} is part of a higher plan.`); return; }
    const x = a.trim() === "" ? undefined : Number(a), y = b.trim() === "" ? undefined : Number(b);
    if (op !== "none" && (x == null || !Number.isFinite(x))) { setErr("Enter the value to compare with."); return; }
    if (op === "between" && (y == null || !Number.isFinite(y))) { setErr("Enter both ends of the range."); return; }
    if (ratios.length >= MAX_RATIOS) { setErr(`You can use up to ${MAX_RATIOS} custom ratios at a time. Remove one first.`); return; }
    const id = ["r0", "r1", "r2"].find((k) => !ratios.some((r) => r.id === k))!;
    onChange([...ratios, { id, name: name.trim().slice(0, 40), num, den, op, ...(op !== "none" ? { a: x } : {}), ...(op === "between" ? { b: y } : {}) }]);
    setName(""); setNum(""); setDen(""); setA(""); setB("");
  };
  const options = (skip: string) => groups.map((g) => { const ms = g.metrics.filter(usable); return ms.length ? <optgroup key={g.id} label={g.label}>{ms.map((m) => <option key={m.key} value={m.key} disabled={m.key === skip}>{m.label} ({unitOf(m)}){m.locked ? " - higher plan" : ""}</option>)}</optgroup> : null; });
  const nm = byKey.get(num), dm = byKey.get(den);
  return (
    <div className="cr">
      <p className="cr-say">Build your own ratio from any two figures, set a condition, and the table gets a column for it.</p>
      <label className="cr-f"><span>Ratio name (optional)</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cash conversion" /></label>
      <label className="cr-f"><span><b className="cr-nd">N</b> Numerator</span><select value={num} onChange={(e) => setNum(e.target.value)} aria-label="Numerator"><option value="">Choose a figure…</option>{options(den)}</select></label>
      <div className="cr-div" aria-hidden="true">÷</div>
      <label className="cr-f"><span><b className="cr-nd d">D</b> Denominator</span><select value={den} onChange={(e) => setDen(e.target.value)} aria-label="Denominator"><option value="">Choose a figure…</option>{options(num)}</select></label>
      {nm && dm && <p className="cr-prev" aria-live="polite">{(name.trim() || "Ratio")}: <b>{nm.label}</b> ÷ <b>{dm.label}</b></p>}
      <fieldset className="cr-cond"><legend>Condition</legend>
        <select value={op} onChange={(e) => setOp(e.target.value as CustomRatio["op"])} aria-label="Condition">{OPS.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}</select>
        {op !== "none" && <input type="number" inputMode="decimal" step="any" value={a} onChange={(e) => setA(e.target.value)} placeholder={op === "between" ? "From" : "Value"} aria-label={op === "between" ? "From" : "Value"} />}
        {op === "between" && <input type="number" inputMode="decimal" step="any" value={b} onChange={(e) => setB(e.target.value)} placeholder="To" aria-label="To" />}
      </fieldset>
      {err && <p className="cr-err" role="alert">{err}</p>}
      <div className="cr-act"><button type="button" className="btn primary" onClick={add} disabled={ratios.length >= MAX_RATIOS}>+ Add ratio</button>
        <button type="button" className="btn" onClick={() => { setName(""); setNum(""); setDen(""); setA(""); setB(""); setErr(""); }}>Reset</button></div>
      {ratios.length > 0 && <ul className="cr-list" aria-label="Your custom ratios">{ratios.map((r) => (
        <li key={r.id}><span>{ratioSentence(r, byKey)}</span><button type="button" aria-label={`Remove ${ratioLabel(r)}`} onClick={() => onChange(ratios.filter((x) => x.id !== r.id))}>×</button></li>))}</ul>}
      <p className="cr-note">A company missing either figure, or with a zero denominator, shows a dash and is left out when a condition is set. Describes figures from filings; not a recommendation.</p>
    </div>
  );
}
