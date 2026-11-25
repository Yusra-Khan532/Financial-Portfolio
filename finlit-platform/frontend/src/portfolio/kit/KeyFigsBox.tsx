// Task #276 (shared portfolio parts, §9 "Key figures"): a section under the main section of each view, with up to three cards. Each card: what it is about,
// one full sentence with the numbers, a small bar with a legend, what it rests on, and a link. A card with nothing to say never reaches here (keyFigs.ts).
import { Section } from "./KitSection";
import { Info } from "../shared/parts";
import type { KfCard, KfGo } from "./keyFigs";
import "./kit.css";

function Bars({ c }: { c: KfCard }) {
  if (c.stack?.length) {
    const tot = c.stack.reduce((a, p) => a + p.value, 0) || 1;
    return <>
      <div className="ptk-kf-stack" role="img" aria-label={c.stack.map((p) => `${p.label} ${p.text}`).join(", ")}>
        {c.stack.map((p) => <i key={p.label} style={{ flexGrow: p.value / tot, background: p.color }} />)}</div>
      <ul className="ptk-kf-leg">{c.stack.map((p) => <li key={p.label}><i style={{ background: p.color }} aria-hidden="true" />{p.label} <b>{p.text}</b></li>)}</ul>
    </>;
  }
  if (!c.rows?.length) return null;
  return <ul className="ptk-kf-rows" aria-label={c.rows.map((r) => `${r.label} ${r.text}`).join(", ")}>
    {c.rows.map((r) => <li key={r.label}><span>{r.label}</span>
      <i className="ptk-kf-tr" aria-hidden="true"><b className={r.neg ? "neg" : r.muted ? "mut" : ""} style={{ width: `${Math.max(1.5, Math.min(100, (r.value / (r.max || 1)) * 100))}%` }} />
        {c.line != null && <u style={{ left: `${Math.min(100, (c.line / (r.max || 1)) * 100)}%` }} />}</i>
      <b className="ptk-kf-v">{r.text}</b></li>)}
  </ul>;
}

/** `visit` (task #389, developer file 40 v4 A2): closed on every visit, opening lasts for the visit only (the page wraps itself in VisitFolds); without it the
 *  member's Hide is kept in this browser, as before. */
export function KeyFigsBox({ id, sub, cards, onGo, visit = false }: { id: string; sub: string; cards: KfCard[]; onGo: (g: KfGo) => void; visit?: boolean }) {
  if (!cards.length) return null;
  return (
    <Section id={id} hide visit={visit} title="Key figures" help="Up to three figures that matter most in this view, each from a section of the page, in one sentence and a small bar." how="A card with nothing to say is left out. The link under each card goes to the section it comes from." sub={sub}>
      <div className="ptk-kf">{cards.map((c, i) => (
        <article key={c.id} className={"ptk-kf-c ptk-t-" + c.tone + (c.q ? " ptk-kf-qc" : "")} aria-label={c.q ?? c.k}>
          {c.q ? <>
            <p className="ptk-kf-q"><span className="ptk-kf-qn" aria-hidden="true">{i + 1}</span><span className="t">{c.q}</span>
              <Info about={c.q} text={c.from ? `From: ${c.from}.` : "From the figures on this page."} how={c.note} /></p>
            <div className="ptk-kf-big"><b>{c.big ?? c.lead}</b>{c.ans && <span><strong>{c.ans}</strong></span>}</div>
          </> : <><p className="ptk-kf-k">{c.k}</p>
            <p className="ptk-kf-s"><b>{c.lead}</b>{c.rest}</p></>}
          <Bars c={c} />
          {c.note && <p className="ptk-kf-n">{c.note}</p>}
          {c.from && !c.q && <p className="ptk-kf-f">From: {c.from}</p>}
          <button type="button" className="ptk-kf-go" onClick={() => onGo(c.go)}>{c.go.label} →</button>
        </article>))}</div>
    </Section>
  );
}
