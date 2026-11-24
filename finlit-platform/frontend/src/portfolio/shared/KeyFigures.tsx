// Task #385 (developer file 33, Key figures, "same pattern in all three views"): three cards, open by default. Each card has a numbered plain question
// with an i (the method text moves behind it), one big figure with a short answer and one line under it, the coloured bar with its legend, a "worth a look"
// box naming at most three shares ("and 2 more" after that), and the link to its section. Phase 2 passes its own cards (Diversification, Risk).
// Classes: eqkf-. Describes figures; never advice.
import { Link } from "react-router";
import { Info } from "./parts";
import { jumpTo } from "../pack/PageTop";

export type KeyBarPart = { label: string; n: number; c: string; /** the figure as printed in the legend (default: n, one decimal) */ shown?: string };
export type WorthName = { symbol: string; label: string; note?: string };
export type KeyFig = {
  /** the card's question, numbered on the page */ q: string;
  /** the i's text: how the figure is worked out */ tip: string;
  big: string; ans: string; sub?: string;
  bar?: KeyBarPart[];
  /** rows with a line at 1.00 in place of the bar (Risk's three highest betas) */ rows?: { label: string; v: number }[];
  worth?: { label: string; names: WorthName[] } | null;
  go: string; to: string; /** a sort the link asks Your shares for */ sort?: string;
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
/** "A (25th of 25), B (28th of 30) and 2 more": at most three names, each linked to its report. */
export function WorthNames({ names, max = 3 }: { names: WorthName[]; max?: number }) {
  const shown = names.slice(0, max), rest = names.length - shown.length;
  return <>{shown.map((x, i) => <span key={x.symbol}>{i > 0 ? (i === shown.length - 1 && !rest ? " and " : ", ") : ""}<Link to={`/stocks/${encodeURIComponent(x.symbol)}`}>{x.label}</Link>{x.note ? ` (${x.note})` : ""}</span>)}{rest > 0 ? ` and ${rest} more` : ""}.</>;
}

export function KeyFigures({ id, sub, cards, about = "Key figures" }: { id: string; sub: string; cards: KeyFig[]; about?: string }) {
  if (!cards.length) return null;
  return (
    <section className="sp-sec eqkf" aria-labelledby={id}>
      <div className="sp-sec-h"><div><h2 id={id}>Key figures<Info about={about} text="Three plain questions about your list, each answered from the figures on this page." how="Each card names the shares worth a look and links to the section with the detail." /></h2><p className="sp-sub">{sub}</p></div></div>
      <div className="eqkf-grid">{cards.map((c, i) => { const tot = (c.bar ?? []).reduce((a, b) => a + b.n, 0), max = Math.max(2, ...(c.rows ?? []).map((r) => r.v));
        return <article key={c.q} className="eqkf-c" aria-label={c.q}>
          <p className="eqkf-q"><span className="eqkf-n" aria-hidden="true">{i + 1}</span><span className="t">{c.q}</span><Info about={c.q} text={c.tip} /></p>
          <div className="eqkf-big"><b>{c.big}</b><span><strong>{c.ans}</strong>{c.sub && <small>{c.sub}</small>}</span></div>
          {c.rows ? <div className="eqkf-rows" role="img" aria-label={c.rows.map((r) => `${r.label} ${r.v.toFixed(2)}`).join(", ") + "; line at 1.00"}>
            {c.rows.map((r) => <div key={r.label} className="eqkf-row"><span>{r.label}</span><span className="eqkf-track"><i style={{ width: `${(r.v / max) * 100}%` }} /><b style={{ left: `${(1 / max) * 100}%` }} aria-hidden="true" /></span><em>{r.v.toFixed(2)}×</em></div>)}</div>
          : c.bar && tot > 0 && <>
            <span className="eqkf-bar" role="img" aria-label={c.bar.map((b) => `${b.label} ${b.shown ?? fmt(b.n)}`).join(", ")}>{c.bar.map((b) => <i key={b.label} style={{ width: `${(b.n / tot) * 100}%`, background: b.c }} />)}</span>
            <ul className="eqkf-leg" aria-hidden="true">{c.bar.map((b) => <li key={b.label}><i style={{ background: b.c }} />{b.label} <b>{b.shown ?? fmt(b.n)}</b></li>)}</ul></>}
          {c.worth && c.worth.names.length > 0 && <p className="eqkf-worth"><em>{c.worth.label}</em><WorthNames names={c.worth.names} /></p>}
          <button type="button" className="eqkf-go" onClick={() => { if (c.sort) window.dispatchEvent(new CustomEvent("eq-sort", { detail: c.sort })); window.dispatchEvent(new CustomEvent("eq-step", { detail: c.to })); setTimeout(() => jumpTo(c.to), 80); }}>{c.go} →</button>
        </article>; })}</div>
    </section>);
}
