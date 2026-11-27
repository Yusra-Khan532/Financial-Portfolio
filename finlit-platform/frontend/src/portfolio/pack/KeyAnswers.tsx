// Task #274 (the 20 Nov equity pack, change 9): the Key figures section under the main section of each view (under Your shares, "Where your list sits"
// and "Risk at a glance"). Three cards, each: what it is about, one full sentence, a small bar with a legend (or rows with a line at 1.00), what the figure
// rests on (company names link to their report), and a link that goes to its section (Valuation also sorts the table). Classes: eqk-.
import { Section } from "../../components/sectors/pack/Common";
import type { KeyAnswer } from "../../lib/keyAnswers";
import type { Share } from "../../lib/equityPack";
import { LinkNames } from "./EquityPack";
import { jumpTo } from "./PageTop";
import "./key-answers.css";

const TONE = ["eqk-a", "eqk-b", "eqk-c"];
export function KeyAnswers({ id, sub, items, shares }: { id: string; sub: string; items: KeyAnswer[]; shares: Share[] }) {
  if (!items.length) return null;
  return (
    <Section id={id} hide title="Key figures" sub={sub} help="Three plain answers about your list, each from the figures on this page." how="Each card says what it rests on; its link goes to the section with the detail.">
      <div className="eqk-grid">{items.map((c, i) => { const tot = c.bar.reduce((a, b) => a + b.n, 0), max = Math.max(2, ...(c.rows ?? []).map((r) => r.v));
        return <article key={c.k} className={"eqk " + TONE[i % 3]} aria-label={c.k}>
          <p className="eqk-k">{c.k}</p>
          <p className="eqk-s"><LinkNames text={c.sentence} shares={shares} /></p>
          {c.rows ? <div className="eqk-rows" role="img" aria-label={c.rows.map((r) => `${r.label} ${r.v.toFixed(2)}`).join(", ") + "; line at 1.00"}>
            {c.rows.map((r) => <div key={r.label} className="eqk-row"><span>{r.label}</span><span className="eqk-track"><i style={{ width: `${(r.v / max) * 100}%` }} /><b style={{ left: `${(1 / max) * 100}%` }} aria-hidden="true" /></span><em>{r.v.toFixed(2)}</em></div>)}
          </div> : c.bar.length > 0 && <>
            <span className="eqk-bar" role="img" aria-label={c.bar.map((b) => `${b.label} ${fmt(b.n)}`).join(", ")}>{c.bar.map((b) => <i key={b.label} style={{ width: `${(b.n / tot) * 100}%`, background: b.c }} />)}</span>
            <ul className="eqk-leg" aria-hidden="true">{c.bar.map((b) => <li key={b.label}><i style={{ background: b.c }} />{/\d/.test(b.label) ? b.label : <>{b.label} <b>{fmt(b.n)}</b></>}</li>)}</ul></>}
          <p className="eqk-r"><LinkNames text={c.rests} shares={shares} /></p>
          <button type="button" className="eqk-go" onClick={() => { if (c.sort) window.dispatchEvent(new CustomEvent("eq-sort", { detail: c.sort })); jumpTo(c.to); }}>{c.go} →</button>
        </article>; })}</div>
    </Section>);
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
