import { Link } from "react-router";
import { BENCHMARKS, GOALS, HORIZONS, RISKS, type Choices, type ScoreAnswer } from "./useScore";

const tone = (w: string) => (/^(Strong|Widely spread|Fairly spread|Low|Within your comfort|Well within your comfort|Mostly rising)$/.test(w) ? "good" : /^(Weak|Concentrated|High|Above your comfort|Mostly falling)$/.test(w) ? "warn" : /^(Fair|Moderate|Split|Somewhat concentrated)$/.test(w) ? "mid" : "na");
const pct = (x: number) => `${Math.round(x * 100)}%`;
const Pick = ({ label, value, opts, onChange }: { label: string; value: string; opts: readonly (readonly [string, string])[]; onChange: (v: string) => void }) => (
  <label className="x-in"><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}>{opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>);

/** "Make the score yours": the five choices. Quantities are typed in the Qty column of Your shares. */
export function ScoreInputs({ c, onChange }: { c: Choices; onChange: (c: Choices) => void }) {
  const set = (k: keyof Choices) => (v: string) => onChange({ ...c, [k]: v });
  return (
    <section className="pfx-card pfx-wide x-inputs" aria-labelledby="pfx-mk">
      <div className="pfx-h"><h2 id="pfx-mk">Make the score yours</h2><p className="pfx-note">All optional. Type how many of each share you own in the Qty column of Your shares; the choices below change what the score looks at. They stay in this browser.</p></div>
      <div className="x-ins"><Pick label="Investment horizon" value={c.horizon} opts={HORIZONS} onChange={set("horizon")} /><Pick label="Risk comfort" value={c.risk} opts={RISKS} onChange={set("risk")} />
        <Pick label="Main goal" value={c.goal} opts={GOALS} onChange={set("goal")} /><Pick label="Compare with" value={c.benchmark} opts={BENCHMARKS} onChange={set("benchmark")} /></div>
    </section>);
}

const ROWS: [keyof NonNullable<ScoreAnswer["readings"]>, string][] = [["strength", "Holding strength"], ["spread", "Diversification"], ["risk", "Risk against the index"], ["trend", "Price trend"], ["valuation", "Valuation"], ["concentration", "Concentration"]];

/** Your portfolio score: the total and each reading as a word with its plain figure. How they combine stays on the server. */
export function ScoreCard({ a, state, error }: { a?: ScoreAnswer; state: "loading" | "ready" | "error"; error?: string }) {
  if (state === "loading") return <section className="pfx-card pfx-wide x-sc" aria-busy="true"><p className="pfx-eyebrow">Your portfolio score</p><p className="pfx-note">Working out your score…</p></section>;
  if (state === "error" || !a) return <section className="pfx-card pfx-wide x-sc"><p className="pfx-eyebrow">Your portfolio score</p><p className="pfx-warn" role="alert">{error || "The score could not be worked out. Try again in a moment."}</p></section>;
  if (a.locked) return <section className="pfx-card pfx-wide x-sc"><p className="pfx-eyebrow">Your portfolio score</p><p className="pfx-note">{a.why} <Link to="/plans">See plans</Link></p></section>;
  const r = a.readings!;
  const fig = (k: keyof typeof r): string => {
    const x = r[k] as Record<string, any>;
    if (k === "strength") return x.figure != null ? String(x.figure) : "–";
    if (k === "spread") return x.figure != null ? String(x.figure) : "–";
    if (k === "risk") return x.beta != null ? `β ${x.beta.toFixed(2)}` : "–";
    if (k === "trend") return x.upShare != null ? `${pct(x.upShare)} up` : "–";
    if (k === "concentration") return x.largest != null ? pct(x.largest) : "–";
    return "–";
  };
  const note = (k: keyof typeof r): string => {
    const x = r[k] as Record<string, any>;
    if (x.why) return x.why;
    if (k === "strength") return `Average FinLit Prism score, by value. ${pct(x.scoredShare ?? 0)} of the value is scored.`;
    if (k === "spread") return "How spread the list is, not how safe it is.";
    if (k === "risk") return `${x.against}. Typical swing ${x.swing}% against ${x.swingIndex}% for the ${x.benchmark}; worst fall ${x.worstFall}% against ${x.worstFallIndex}%.`;
    if (k === "trend") return `${x.term === "short" ? "Short" : "Long"}-term trend of the rated shares, by value: ${pct(x.downShare)} in a downtrend.`;
    if (k === "valuation") return "Average Prism valuation reading, by value.";
    return `Largest holding ${x.largestName}; top five ${pct(x.topFive)} of the value entered.`;
  };
  return (
    <section className="pfx-card pfx-wide x-sc" aria-labelledby="pfx-ps">
      <div className="x-sc-top"><div><p className="pfx-eyebrow" id="pfx-ps">Your portfolio score</p>
        <p className="pfx-big-row"><span className="pfx-big">{a.total ?? "–"}</span><span className="pfx-of">/ 100</span>{a.band && <span className={"pfx-pill " + tone(a.band)}>{a.band}</span>}</p></div>
        <p className="pfx-note">{a.needsQuantities ? "Needs quantities: type how many of each share you own in Your shares below. Until then the readings count every share the same." : `Counted by the value you entered, against the ${a.benchmark}. ${a.confidence === "Lower" ? "Much of the value has no Prism score yet, so treat it with care. " : ""}A description of the list, not a recommendation.`}</p></div>
      <ul className="x-sc-parts">{ROWS.map(([k, label]) => <li key={k}><span className="pfx-eyebrow">{label}</span><span className={"pfx-pill " + tone(r[k].word)}>{r[k].word}</span><b>{fig(k)}</b><small>{note(k)}</small></li>)}</ul>
      {a.noQuantity && a.noQuantity.length > 0 && !a.needsQuantities && <p className="pfx-note">No quantity or no stored price for {a.noQuantity.join(", ")}, so they count at zero in the amounts.</p>}
      {a.unknown && a.unknown.length > 0 && <p className="pfx-note">Not in FinLit's company list: {a.unknown.join(", ")}.</p>}
    </section>);
}
