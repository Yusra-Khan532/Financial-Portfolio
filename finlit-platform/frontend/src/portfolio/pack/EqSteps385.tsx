// Task #385 (developer file 33): one section at a time, and the new "Where your gain or loss came from".
//   StepCtx / Step   the section bar shows one step at a time (step 1 on Portfolio is Your shares, Where your gain or loss came from and Key figures; each
//                    later step one section); "All sections" puts every section back on one page. On a phone, with All sections on, every section after
//                    the first step folds to its heading and one line with its headline figure and "Open ▾"; tapping the line opens it ("Close ▴" at its
//                    top). Choosing a step from the bar shows that section open.
//   GainLoss         each share's gain or loss in rupees, biggest gain at the top, a bar from a centre line, the ₹ figure and the % on what was paid, and the
//                    summary line worked out from the rows (shared/portfolioFigs gainLoss).
// Classes: eqf-, eqg-. Describes figures; never advice.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useIsPhone } from "../../components/PhoneFold";
import { Info, ShowAll, countOf, gainLoss, pctText, rupeesSigned, type GLRow } from "../shared";

export type StepDef = { id: string; label: string; badge?: string; /** the DOM ids of the sections the step holds (a jump to one of them opens the step) */ secs: string[] };
export const StepCtx = createContext<{ step: string; firstStep: string }>({ step: "all", firstStep: "" });

/** The step that holds a section. */
export const stepOf = (steps: StepDef[], secId: string) => steps.find((s) => s.id === secId || s.secs.includes(secId))?.id ?? null;

/** A step's content: shown when its step is chosen or All sections is on; on a phone with All sections, every step after the first folds. */
export function Step({ id, title, line, children }: { id: string; title: string; line: string; children: ReactNode }) {
  const { step, firstStep } = useContext(StepCtx), phone = useIsPhone();
  if (step !== "all" && step !== id) return null;
  if (step === "all" && phone && id !== firstStep) return <Fold id={id} title={title} line={line}>{children}</Fold>;
  return <>{children}</>;
}

function Fold({ id, title, line, children }: { id: string; title: string; line: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { const f = (e: Event) => { if ((e as CustomEvent<string>).detail === id) setOpen(true); }; window.addEventListener("eq-open-fold", f); return () => window.removeEventListener("eq-open-fold", f); }, [id]);
  if (!open) return <section className="sp-sec eqf" aria-labelledby={`eqf-${id}`} data-fold={id}>
    <h2 id={`eqf-${id}`} className="eqf-h">{title}</h2>
    <button type="button" className="eqf-sum" aria-expanded="false" onClick={() => setOpen(true)}><span className="s">{line}</span><span className="c">Open <i aria-hidden="true">▾</i></span></button>
    <div hidden>{children}</div>{/* kept drawn while closed, so its figures (the summary line of Group leaders) are worked out */}
  </section>;
  return <div className="eqf-open" data-fold={id}><button type="button" className="eqf-close" aria-expanded="true" onClick={() => setOpen(false)}>Close <i aria-hidden="true">▴</i></button>{children}</div>;
}

// ------------------------------------------------------------------------------------------------ where your gain or loss came from
export const GL_TIP = "Value now minus what you paid, for each share you hold now. Sales you have recorded and dividends are not counted here.";
/** Rows: each share held now with a quantity, a buy price and a price today. `noPrice`: shares held without a buy price (left out, one line says how many). */
export function GainLossSection({ rows, noPrice }: { rows: GLRow[]; noPrice: number }) {
  const [open, setOpen] = useState(false);
  if (rows.length + noPrice < 2) return null;    // a one-share account hides the section
  const g = gainLoss(rows, noPrice), mx = Math.max(1, ...g.rows.map((r) => Math.abs(r.gain))), shown = g.shown(open);
  return (
    <section className="sp-sec eqg" aria-labelledby="eq-gl-h" id="eq-gl">
      <div className="sp-sec-h"><div><h2 id="eq-gl-h">Where your gain or loss came from<Info about="Where your gain or loss came from" text={GL_TIP} /></h2>
        <p className="sp-sub">Each share's gain or loss in rupees, on what you paid for it. Biggest gain at the top.</p></div></div>
      {g.lead && <p className="eqg-lead"><b>{g.lead.bold}</b> {g.lead.rest}</p>}
      {g.rows.length > 0 ? <ul className="eqg-l" id="eqg-list" aria-label="Gain or loss by share">{shown.map((r) => { const w = `${((100 * Math.abs(r.gain)) / mx).toFixed(1)}%`, neg = r.gain < 0;
        return <li key={r.symbol} className={g.key.has(r.symbol) ? "k" : undefined}>
          <Link className="n" to={`/stocks/${encodeURIComponent(r.symbol)}`}>{r.name}</Link>
          <span className="bar" aria-hidden="true"><span className="h l">{neg && <i style={{ width: w }} />}</span><span className="h r">{!neg && <i style={{ width: w }} />}</span></span>
          <span className={"v " + (Math.round(r.gain) < 0 ? "dn" : Math.round(r.gain) > 0 ? "up" : "flat")}>{rupeesSigned(r.gain)}</span>
          <span className="p">{r.pct == null ? "" : pctText(r.pct)}</span></li>; })}</ul>
        : <p className="sp-note">None of your shares has a buy price yet, so there is no gain or loss to split.</p>}
      {g.capped && <ShowAll n={g.rows.length} open={open} onToggle={() => setOpen(!open)} controls="eqg-list" />}
      {noPrice > 0 && <p className="eqg-note">{countOf(noPrice, "share")} without a buy price {noPrice === 1 ? "is" : "are"} left out.</p>}
    </section>);
}
