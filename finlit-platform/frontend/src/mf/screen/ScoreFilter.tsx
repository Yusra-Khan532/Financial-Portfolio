// Task #350 (23 Nov 2026): the "FinLit Mutual Fund Score" filter group of the Mutual Fund Screener: the total score and its four parts (Performance, Risk,
// Cost, Quality; lib/mfScore), each with its own (i), minimum and maximum, presets, the range it has on and its own Clear. Each range is independent:
// setting or clearing one never touches another, and the server joins them with AND. Gold only (the server answers 403 otherwise).
// The total takes any figure from 0 to 100; a part takes its band edges only (0, 50, 70, 100), because the site shows a part as a word, never a figure.
import { useEffect, useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { Info } from "../../components/Info";
import { Icon } from "../../lib/icons";
import { PART_PRESETS, SCORE_FIELDS, SCORE_HELP, SCORE_NAME, TOTAL_PRESETS, presetOf, scoreRangeError, scoreRangeText, type ScoreField, type ScoreRange } from "../../lib/mfScoreFilter";

type Props = { sc: Partial<Record<ScoreField, ScoreRange>>; onSet: (f: ScoreField, lo: string, hi: string) => void; canScore: boolean };

/** How many score ranges are on (the group's "n on" badge). */
export const scoreOn = (sc: Props["sc"]) => SCORE_FIELDS.filter((f) => sc[f]).length;

export function ScoreFilters({ sc, onSet, canScore }: Props) {
  if (!canScore) {
    return (
      <div className="mfs-sc-lock">
        <p className="fgx-hint">Filter by the FinLit Mutual Fund Score, from 0 to 100, and by each of its four parts: Performance, Risk, Cost and Quality.</p>
        <p className="fgx-note"><Icon name="lock" /> Part of the Gold plan. <Link className="fgx-link" to="/plans#gold">See the Gold plan</Link></p>
      </div>);
  }
  return (
    <div className="mfs-sc">
      <p className="fgx-hint">Each range works on its own; set more than one and a fund must meet all of them. Funds without a score drop out while a range is set.</p>
      {SCORE_FIELDS.map((f) => <ScoreRow key={f} f={f} r={sc[f]} onSet={(lo, hi) => onSet(f, lo, hi)} />)}
      <p className="fgx-note">Describes the fund's health from its past NAVs, costs and holdings; not a recommendation. <Link className="fgx-link" to="/methodology/mf-score">How the score works</Link></p>
    </div>);
}

function ScoreRow({ f, r, onSet }: { f: ScoreField; r?: ScoreRange; onSet: (lo: string, hi: string) => void }) {
  const lo = r?.[0] ?? "", hi = r?.[1] ?? "";
  const [dLo, setDLo] = useState(lo), [dHi, setDHi] = useState(hi), [err, setErr] = useState<string | null>(null);
  useEffect(() => { setDLo(lo); setDHi(hi); setErr(null); }, [lo, hi]);
  const total = f === "total", presets = total ? TOTAL_PRESETS : PART_PRESETS, on = presetOf(f, lo, hi), id = `mfs-sc-${f}`;
  /** Apply the typed range when it is valid; an invalid one is shown and not applied (the range in force stays). */
  const commit = (a: string, b: string) => {
    const x = a.trim(), y = b.trim(), e = scoreRangeError(f, x, y);
    setErr(e);
    if (!e && (x !== lo || y !== hi)) onSet(x === "" ? "" : String(Number(x)), y === "" ? "" : String(Number(y)));
  };
  const enter = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { e.preventDefault(); commit(dLo, dHi); } };
  const edges = (which: "min" | "max") => (
    <select className="mfs-sc-sel" id={`${id}-${which}`} value={which === "min" ? dLo : dHi} aria-invalid={!!err}
      onChange={(e) => { const v = e.target.value; if (which === "min") { setDLo(v); commit(v, dHi); } else { setDHi(v); commit(dLo, v); } }}>
      <option value="">{which === "min" ? "Any (0)" : "Any (100)"}</option>
      <option value="50">50</option><option value="70">70</option>
    </select>);
  return (
    <section className={"mfs-sc-row" + (r ? " is-set" : "")} aria-labelledby={`${id}-h`}>
      <h4 className="mfs-sh mfs-sc-h" id={`${id}-h`}>{total ? "Total score" : SCORE_NAME[f]}<Info g={SCORE_HELP[f]} />
        {r && <button type="button" className="fgx-link mfs-sc-clear" onClick={() => onSet("", "")} aria-label={`Clear the ${total ? "total score" : SCORE_NAME[f]} range`}>Clear</button>}</h4>
      <div className="fgx-chips mfs-chips" role="group" aria-label={`${total ? "Total score" : SCORE_NAME[f]} presets`}>
        {presets.map((p) => { const is = on?.label === p.label; return (
          <button key={p.label} type="button" className={"fgx-chip" + (is ? " is-on" : "")} aria-pressed={is} onClick={() => (is ? onSet("", "") : onSet(p.lo, p.hi))}>
            {is && <i aria-hidden="true">&#10003;</i>}{p.label}</button>); })}
      </div>
      <div className="mfs-sc-mm">
        <label htmlFor={`${id}-min`}>Min</label>
        <label htmlFor={`${id}-max`}>Max (below)</label>
        {total ? <input className="mfs-box" id={`${id}-min`} inputMode="decimal" placeholder="0" value={dLo} aria-invalid={!!err}
          onChange={(e) => setDLo(e.target.value.replace(/[^0-9.]/g, "").slice(0, 5))} onBlur={() => commit(dLo, dHi)} onKeyDown={enter} /> : edges("min")}
        {total ? <input className="mfs-box" id={`${id}-max`} inputMode="decimal" placeholder="100" value={dHi} aria-invalid={!!err}
          onChange={(e) => setDHi(e.target.value.replace(/[^0-9.]/g, "").slice(0, 5))} onBlur={() => commit(dLo, dHi)} onKeyDown={enter} /> : edges("max")}
      </div>
      {err ? <p className="mfs-sc-err" role="alert">{err}</p>
        : <p className="mfs-sc-say" aria-live="polite">{r ? <>On: <b>{scoreRangeText(lo, hi)}</b>{on ? ` (${on.label.split(" ")[0]})` : ""}</> : "Any score"}</p>}
    </section>);
}
