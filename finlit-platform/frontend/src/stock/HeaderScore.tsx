// The top of a stock page, next to the company name: the six FinLit Prism dots (coloured by the shared band rule), the FinLit Prism badge (or, for a plan
// without Prism, a locked Prism chip), and the labelled industry / market cap line. Pure rules are in lib/scoreBands.ts. Research summary, not a recommendation.
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { Icon } from "../lib/icons";
import { bandLegend } from "../lib/prismTechnical";
import "../styles/dash-shared.css";
import "../styles/headerscore.css";
import { BAND_NAME, GOLD_DOTS, LEGEND, badgeFor, badgeView, goldDots, marketCapLine, type BadgeView, type Plan, type PrismInput } from "../lib/scoreBands";
import { LEVELS, LEVEL_LABEL, useClassification, type Classification } from "../lib/taxonomy";
import type { Profile } from "../lib/api";

/** "What do the dots mean?" popover: the six FinLit Prism dots and the colour rule. Closes on Escape or a click elsewhere. */
function DotsLegend() {
  const [open, setOpen] = useState(false);
  const id = "hs-leg-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const down = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", key); document.addEventListener("pointerdown", down, true);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", down, true); };
  }, [open]);
  return (
    <span className="hs-leg" ref={box}>
      <button type="button" className="hs-leg-b" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}><Icon name="info" /><span>What do the dots mean?</span></button>
      <div id={id} className="hs-leg-p" role="group" aria-label="What the dots mean" hidden={!open}>
        <>
          <p><b>Six dots from FinLit Prism:</b> four financial-health, then (after the gap) two technical.</p>
          <ul className="hs-leg-g">{GOLD_DOTS.map((d) => <li key={d.key}><span className="hs-dot band-na" data-wide={d.letter.length > 1 || undefined} aria-hidden="true">{d.letter}</span><span><b>{d.name}</b>{": "}{d.what}</span></li>)}</ul>
          <p><b>Financial-health dots (0 to 100):</b></p>
          <ul className="hs-leg-c">{LEGEND.map((l) => <li key={l.band}><span className={"hs-sw band-" + l.band} aria-hidden="true" /><b>{BAND_NAME[l.band][0].toUpperCase() + BAND_NAME[l.band].slice(1)}</b>{": "}{l.rule}</li>)}</ul>
          <p><b>Technical dots (−100 to +100):</b> green is a positive trend, orange neutral, red negative, grey not available. {bandLegend()}</p>
          <p>Higher is better for all four financial-health dots; a high Risk score means lower risk. The technical dots describe recent price behaviour and are not part of the Prism score.</p>
          <p className="hs-leg-n">Research summary, not a recommendation.</p>
        </>
      </div>
    </span>
  );
}

/** The six FinLit Prism dots for a plan with Prism: four financial-health, a thin gap, two technical. Null while the report loads. */
export function PrismDots({ prism }: { prism: PrismInput }) {
  const dots = goldDots(prism);
  if (!dots) return null;
  return (
    <div className="hs-dots hs-gold" role="group" aria-label="FinLit Prism dots: four financial-health and two technical">
      <ul>{dots.map((d, i) => <li key={d.key} className={i > 0 && d.group !== dots[i - 1].group ? "hs-gap" : undefined}><span className={"hs-dot band-" + d.band} role="img" data-wide={d.letter.length > 1 || undefined} title={d.label} aria-label={d.label}>{d.letter}</span></li>)}</ul>
      <DotsLegend />
    </div>
  );
}

/** For a plan without FinLit Prism: a locked chip that says where the score is. */
export function PrismLock() {
  return <Link className="hs-badge band-na hs-lock" to="/plans" title="FinLit Prism, FinLit's only company score, comes with a plan that has it."><Icon name="lock" /><span className="hs-bk">FinLit Prism · see plans</span></Link>;
}

export function ScoreBadge({ view, symbol }: { view: BadgeView; symbol: string }) {
  if (view.kind === "none") return null;
  if (view.kind === "locked") return <PrismLock />;
  if (view.kind === "prism-none") return <div className="hs-badge band-na"><span className="hs-bk">FinLit Prism</span><span className="hs-bw">Prism: not rated yet</span><Link className="hs-bl" to={`/prism/${encodeURIComponent(symbol)}`}>Open the Prism page</Link></div>;
  const n = view.score.toFixed(1);
  const text = `FinLit Prism ${n} out of 100: ${view.word}${view.provisional ? ", provisional" : ""}`;
  return (
    <div className={"hs-badge band-" + view.band} role="group" aria-label={text} title={text}>
      <span className="hs-bk">FinLit Prism</span>
      <span className="hs-bn">{n}</span><span className="hs-bw">{view.word}{view.provisional ? " · provisional" : ""}</span>
    </div>
  );
}

/** Labelled facts shown to every plan (public): NSE's four levels, each under its own name (task #192: Macro sector, Sector, Industry, Basic
 *  industry; a blank level says why), then Market cap. Until the classification has loaded, or for a company not placed yet, only the industry is
 *  shown, under "Industry" (never two levels joined under one label, as before). */
export function CompanyFacts({ p, cls }: { p: Profile; cls?: Classification | null }) {
  const cap = marketCapLine(p.marketCapCr);
  const rows: ReactNode[] = [];
  if (cls && cls.source) {
    let why = cls.note;   // the reason is written once, under the first blank level
    for (const l of LEVELS) {
      const v = cls[l];
      rows.push(<Row key={l} label={LEVEL_LABEL[l]}>{v ? <span className="hs-t">{v}</span> : <><span className="hs-t hs-na">Not shown</span>{why && <span className="hs-why">{why}</span>}</>}</Row>);
      if (!v) why = null;
    }
  } else if (cls && !cls.source) {
    rows.push(<Row key="industry" label="Industry"><span className="hs-t hs-na">Not classified</span>{cls.note && <span className="hs-why">{cls.note.replace(/^Not classified: /, "")}</span>}</Row>);
  } else {
    const ind = p.industry?.trim() || null;
    if (ind) rows.push(<Row key="industry" label="Industry"><span className="hs-t">{ind}</span></Row>);
  }
  if (!rows.length && !cap) return null;
  return (
    <>
      {rows}
      {cap && <Row label="Market cap"><span className="hs-t">{cap.replace(/^Market cap /, "")}</span></Row>}
    </>
  );
}

/** One labelled row of the company's header block: a fixed label column, the content beside it. */
export function Row({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <div className={"hs-r" + (className ? " " + className : "")}><span className="hs-l">{label}</span><div className="hs-c">{children}</div></div>;
}

/** Next to the company name: the six FinLit Prism dots for a plan with Prism (and an administrator); none for other plans (the header's Prism chip is locked). */
export function NameDots({ plan, admin, prism }: { plan: Plan; admin: boolean; prism: PrismInput }) {
  return badgeFor(plan, admin) === "prism" ? <PrismDots prism={prism} /> : null;
}

/** Under the company name: the FinLit Prism badge (or the locked Prism chip) and the labelled industry / market cap chips. `plan` is the effective plan. */
export function SubLine({ profile, plan, admin, prism }: { profile: Profile; plan: Plan; admin: boolean; prism: PrismInput }) {
  const view = badgeView(plan, admin, prism);
  const cls = useClassification(profile.symbol).data;
  return (
    <>
      <Row label="Fundamental rating"><ScoreBadge view={view} symbol={profile.symbol} /></Row>
      <CompanyFacts p={profile} cls={cls} />
    </>
  );
}
