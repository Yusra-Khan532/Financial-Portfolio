// Small shared pieces of the mutual fund pages: a glossary hint, a return figure with its reason, the source / disclaimer footer, the "not available yet" panel.
import { Icon } from "../lib/icons";
import { TERMS, type Term } from "../lib/glossary";
import { Info } from "../components/Info";
import { dateIN } from "../lib/format";
import { AMFI_RISK_LINE, DISCLAIMER, MIRROR_LABEL, pctText, tone, type Facts, type FundDetail } from "../lib/mf";
import "../styles/task373.css";   // task #377: the Disclaimer drop-down shares the screener's look (task #373)
import "../styles/task377.css";   // task #377: the folded footer box on the Mutual funds list

const termById = (id: string): Term | undefined => TERMS.find((t) => t.id === id);

/** A word with an (i) button that explains it in plain English, from the site glossary. Renders just the word if the term is unknown. */
/** A word with its glossary "i". With `box` (a chip's classes), the word sits in that box and the "i" follows OUTSIDE it (task #288: an "i" inside a 24px
 *  chip filled its height and crowded its edge). */
export function GTerm({ id, children, box }: { id: string; children: React.ReactNode; box?: string }) {
  const t = termById(id);
  const word = box ? <span className={box}>{children}</span> : children;
  if (!t) return <>{word}</>;
  return <span className={"mf-term" + (box ? " mf-term-out" : "")}>{word}<Info g={{ key: t.id, label: t.term, what: t.meaning, read: t.how, formula: t.formula || undefined, note: t.finlit || undefined }} /></span>;
}

/** A percent figure coloured by sign, or a dash with the reason it is missing (readable on touch and by screen readers, not only on hover). */
export function Fig({ v, why, d = 2, plus = true, plain = false }: { v: number | null | undefined; why?: string | null; d?: number; plus?: boolean; plain?: boolean }) {
  if (v == null) return <span className="mf-na" title={why || undefined} aria-label={why ? `No figure. ${why}` : "No figure"}>—</span>;
  return <span className={plain ? "" : tone(v)}>{pctText(v, d, plus)}</span>;
}

/** Source, data date, last update and the standing disclaimer: on every page of the section. */
/** Task #377 (team, 24 Nov 2026): with `fold` (the Mutual funds list), the box is named "Disclaimer" and is a drop-down, closed at first, the same as
 *  the screener's (task #373, styles/task373.css): the statutory mutual fund line stays in view in the closed row, the rest opens below. */
export function Foot({ facts, history, fold = false }: { facts?: Facts | null; history?: FundDetail["history"] | null; fold?: boolean }) {
  const rest = (<>
      <p><b>{DISCLAIMER}</b></p>
      <p>
        Source: {facts?.source || "AMFI (Association of Mutual Funds in India), official NAV files"}.
        {facts?.dataDate && <> Data date: {dateIN(facts.dataDate)}.</>}
        {facts?.updatedAt && <> Last updated: {new Date(facts.updatedAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}.</>}
        {history?.source === "mirror" && <> {MIRROR_LABEL}.</>}
      </p>
      {history?.earlier && <p className="mf-earlier">{history.earlier.note} Earlier NAVs: AMFI data via its public mirror (api.mfapi.in), scheme code {history.earlier.oldCode}.</p>}
      {facts?.excludedAmcs && facts.excludedAmcs.length > 0 && <p className="faint">Some fund houses are not listed here (list: {facts.excludedAmcs.join(", ")}).</p>}
  </>);
  if (fold) return (
    <footer className="mf-foot mf-foot-fold" aria-label="Source and disclaimer">
      <details className="mfs-disc">
        <summary><span className="mfs-disc-k">Disclaimer</span><b className="mfs-disc-l">{AMFI_RISK_LINE}</b>
          <span className="mfs-disc-more" aria-hidden="true">Details<i className="mfs-disc-chev" /></span></summary>
        {rest}
      </details>
    </footer>);
  return (
    <footer className="mf-foot" aria-label="Source and disclaimer">
      <p className="mf-amfi">{AMFI_RISK_LINE}</p>
      {rest}
    </footer>
  );
}

/** What this section does not have yet, in one compact panel, with the reason (nothing is shown rather than guessed). */
export function NotAvailable({ items, why }: { items: string[]; why: string }) {
  return (
    <section className="card mf-na-panel" aria-labelledby="mf-na-h">
      <h3 id="mf-na-h"><span className="ci"><Icon name="info" /></span>Not available yet</h3>
      <ul className="mf-chips">{items.map((x) => <li key={x}><span className="chip ghost">{x}</span></li>)}</ul>
      <p className="muted">{why}</p>
    </section>
  );
}

// Task #281: an ETF has no Direct or Regular plan (AMFI files it under a category naming ETFs; the same rule as the server's mf.is_etf_category),
// so its plan reads "ETF", not "Plan not stated".
const ETF_CATEGORY = /\bETFs?\b|exchange\s+traded/i;
export const isEtfCategory = (category?: string | null): boolean => ETF_CATEGORY.test(category ?? "");
export const planLabel = (plan: string, category?: string | null): string =>
  plan === "Unspecified" ? (isEtfCategory(category) ? "ETF" : "Plan not stated") : plan;
export const PlanChip = ({ plan, option, category }: { plan: string; option: string; category?: string | null }) => <span className="mf-plan">{planLabel(plan, category)}{option && option !== "Not stated" ? ` · ${option.replace(/\s*option$/i, "")}` : ""}</span>;
