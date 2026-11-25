// Task #385 (developer file 33): one section at a time, and "Where your gain or loss came from" (now on the MF and ETF pages only: task #388, developer
// file 38 A1, took it off the Equity portfolio).
//   StepCtx / Step   the section bar shows one step at a time (step 1 on the Equity Portfolio view is Your shares and Key figures; each
//                    later step one section); "All sections" puts every section back on one page. On a phone, with All sections on, every section after
//                    the first step folds to its heading and one line with its headline figure and "Open ▾"; tapping the line opens it ("Close ▴" at its
//                    top). Choosing a step from the bar shows that section open.
//   GainLoss         each share's gain or loss in rupees, biggest gain at the top, a bar from a centre line, the ₹ figure and the % on what was paid, and the
//                    summary line worked out from the rows (shared/portfolioFigs gainLoss).
// Classes: eqf-, eqg-. Describes figures; never advice.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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

/** Task #389 (developer file 32, Phone): a section's own one-line sentence: its first line (the sub under the heading, else its first paragraph), cut at
 *  the first full stop after 30 characters, at most 140 characters. Exported for tests. */
export function foldSentence(text: string | null | undefined): string {
  let t = String(text ?? "").replace(/\s+/g, " ").trim();
  const m = t.match(/^(.{30,}?\.)(\s|$)/); if (m) t = m[1];
  if (t.length > 140) t = t.slice(0, 139).replace(/[\s,;:·]+\S*$/, "") + "…";
  return t;
}
const lineOf = (el: HTMLElement | null) => { const s = el?.querySelector<HTMLElement>(".sp-sub, .wp-sub, .mi-sh-l") ?? el?.querySelector<HTMLElement>("section p"); return foldSentence(s?.textContent); };

function Fold({ id, title, line, children }: { id: string; title: string; line: string; children: ReactNode }) {
  const [open, setOpen] = useState(false), body = useRef<HTMLDivElement>(null), [own, setOwn] = useState("");
  useEffect(() => { const f = (e: Event) => { if ((e as CustomEvent<string>).detail === id) setOpen(true); }; window.addEventListener("eq-open-fold", f); return () => window.removeEventListener("eq-open-fold", f); }, [id]);
  useEffect(() => { if (!line && !open) { const t = lineOf(body.current); if (t !== own) setOwn(t); } });   // no line given: the section's own first line (MF page)
  if (!open) return <section className="sp-sec eqf" aria-labelledby={`eqf-${id}`} data-fold={id}>
    <h2 id={`eqf-${id}`} className="eqf-h">{title}</h2>
    <button type="button" className="eqf-sum" aria-expanded="false" onClick={() => setOpen(true)}><span className="s">{line || own}</span><span className="c">Open <i aria-hidden="true">▾</i></span></button>
    <div hidden ref={body}>{children}</div>{/* kept drawn while closed, so its figures (the summary line of Group leaders) are worked out */}
  </section>;
  return <div className="eqf-open" data-fold={id}><button type="button" className="eqf-close" aria-expanded="true" onClick={() => setOpen(false)}>Close <i aria-hidden="true">▴</i></button>{children}</div>;
}

// ------------------------------------------------------------------------------------------------ where your gain or loss came from
export const GL_TIP = "Value now minus what you paid, for each share you hold now. Sales you have recorded and dividends are not counted here.";
/** Rows: each share held now with a quantity, a buy price and a price today. `noPrice`: shares held without a buy price (left out, one line says how many). */
/** Task #389 (developer file 32, Your funds 7, L7): each "(+₹N)" stays on one line with its name. */
const keepTogether = (s: string) => s.split(/( \([+−]₹[\d,]+\))/).map((x, i) => (i % 2 ? <span key={i} className="eqg-nw">{x}</span> : x));
/** `noun`, `link`, `tip`, `id`: the MF page's funds (task #389): "fund", the fund's page, its own i text and section id. `id` has no default: the Equity page,
 *  whose id ("eq-gl") it was, no longer shows the section (task #388, developer file 38 A1). */
/** `left`, `countSide`: the ETF page (task #390, E5d and L4) adds "ETFs with no quantity are left out." to the line under the heading, and a spread-out loss
 *  counts the ETFs in loss ("3 of your 6 ETFs are in loss"). */
export function GainLossSection({ rows, noPrice, noun = "share", link = (s) => `/stocks/${encodeURIComponent(s)}`, tip = GL_TIP, id, left = "", countSide = false }: { rows: GLRow[]; noPrice: number;
  noun?: string; link?: (symbol: string) => string; tip?: string; id: string; left?: string; countSide?: boolean }) {
  const [open, setOpen] = useState(false);
  if (rows.length + noPrice < 2) return null;    // a one-share account hides the section
  const g = gainLoss(rows, noPrice, noun, countSide), mx = Math.max(1, ...g.rows.map((r) => Math.abs(r.gain))), shown = g.shown(open);
  return (
    <section className="sp-sec eqg" aria-labelledby={`${id}-h`} id={id}>
      <div className="sp-sec-h"><div><h2 id={`${id}-h`}>Where your gain or loss came from<Info about="Where your gain or loss came from" text={tip} /></h2>
        <p className="sp-sub">Each {noun}'s gain or loss in rupees, on what you paid for it. Biggest gain at the top.{left ? ` ${left}` : ""}</p></div></div>
      {g.lead && <p className="eqg-lead"><b>{g.lead.bold}</b> {keepTogether(g.lead.rest)}</p>}
      {g.rows.length > 0 ? <ul className="eqg-l" id={`${id}-list`} aria-label={`Gain or loss by ${noun}`}>{shown.map((r) => { const w = `${((100 * Math.abs(r.gain)) / mx).toFixed(1)}%`, neg = r.gain < 0;
        return <li key={r.symbol} className={g.key.has(r.symbol) ? "k" : undefined}>
          <Link className="n" to={link(r.symbol)}>{r.name}</Link>
          <span className="bar" aria-hidden="true"><span className="h l">{neg && <i style={{ width: w }} />}</span><span className="h r">{!neg && <i style={{ width: w }} />}</span></span>
          <span className={"v " + (Math.round(r.gain) < 0 ? "dn" : Math.round(r.gain) > 0 ? "up" : "flat")}>{rupeesSigned(r.gain)}</span>
          <span className="p">{r.pct == null ? "" : pctText(r.pct)}</span></li>; })}</ul>
        : <p className="sp-note">None of your {noun}s has a buy {noun === "fund" ? "NAV" : "price"} yet, so there is no gain or loss to split.</p>}
      {g.capped && <ShowAll n={g.rows.length} noun={noun} open={open} onToggle={() => setOpen(!open)} controls={`${id}-list`} />}
      {noPrice > 0 && <p className="eqg-note">{countOf(noPrice, noun)} without a buy {noun === "fund" ? "NAV" : "price"} {noPrice === 1 ? "is" : "are"} left out.</p>}
    </section>);
}
