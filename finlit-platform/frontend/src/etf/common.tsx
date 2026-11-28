// Small pieces shared by the three ETF pages: glossary (i), a blank figure with its reason, and the data note every page ends with.
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Info } from "../components/Info";
import type { Glossary } from "../lib/api";
import { DISCLAIMER, day, stamp, type GlossName } from "../lib/etf";
import { TERMS, norm } from "../lib/glossary";
import "../styles/etf.css";
import "../styles/task373.css";   // the Disclaimer drop-down the Mutual fund pages use (.mfs-disc)
import "../styles/task463.css";   // task #463: that drop-down at the foot of the ETF list

/** The (i) for a glossary term, by its name. Uses the glossary entry when it exists; the short fallback explains the word until it does. */
export function GlossInfo({ name, fallback }: { name: GlossName; fallback: string }) {
  const t = TERMS.find((x) => norm(x.term) === norm(name));
  const g: Glossary = t
    ? { key: t.id, label: t.term, what: t.meaning, read: t.how, formula: t.formula || undefined, note: t.finlit || undefined }
    : { key: name, label: name.replace(/\s*\(.*$/, ""), what: fallback };
  return <Info g={g} />;
}

/** A figure that is genuinely unavailable: a dash that says why to a mouse (title) and to a screen reader (hidden text). */
export function Blank({ why, short }: { why: string; short?: string }) {
  return <span className="etf-blank" title={why}>—{short && <small className="etf-bwhy" aria-hidden="true">{short}</small>}<span className="sr-only"> (not available: {why})</span></span>;
}

export function Tone({ v, children }: { v: number | null | undefined; children: ReactNode }) {
  return <span className={"etf-tone " + (v == null || v === 0 ? "" : v > 0 ? "up" : "down")}>{children}</span>;
}

/** Disclaimer, source and data date: on every ETF page.
 *  Task #463 (team, 28 Nov 2026), the ETF list: "we need to add it in disclamer box as we made in mutual fund pages". With `fold`, the notes under the
 *  table (`notes`) and this note go into the same Disclaimer drop-down as the Mutual fund pages (closed at first, the disclaimer line in its closed row).
 *  The other ETF pages keep the open note. */
export function DataNote({ asOf, updatedAt, source, fold = false, notes }: { asOf: string | null | undefined; updatedAt: string | null | undefined; source?: string; fold?: boolean; notes?: ReactNode }) {
  if (fold) return (
    <aside className="etf-disc463" aria-label="About this data">
      <details className="mfs-disc">
        <summary><span className="mfs-disc-k">Disclaimer</span><b className="mfs-disc-l">{DISCLAIMER}</b>
          <span className="mfs-disc-more" aria-hidden="true">Details<i className="mfs-disc-chev" /></span></summary>
        {notes}
        <p>Prices are NSE closing prices as of <b>{day(asOf)}</b>; {source ?? "NAV, scheme names and fund houses: AMFI."} Last updated {stamp(updatedAt)}.</p>
        <p>Every return here is a <b>price return</b>: dividends and other payouts are not included. Figures marked — are not available; the reason is shown beside them. See the <Link to="/glossary">glossary</Link> for the words used.</p>
      </details>
    </aside>);
  return (
    <aside className="etf-note" aria-label="About this data">
      <p><b>{DISCLAIMER}</b></p>
      <p>Prices are NSE closing prices as of <b>{day(asOf)}</b>; {source ?? "NAV, scheme names and fund houses: AMFI."} Last updated {stamp(updatedAt)}.</p>   {/* never the price provider's name (task #134, C-6) */}
      <p>Every return here is a <b>price return</b>: dividends and other payouts are not included. Figures marked — are not available; the reason is shown beside them. See the <Link to="/glossary">glossary</Link> for the words used.</p>
    </aside>
  );
}

export function Skeleton({ rows = 8 }: { rows?: number }) {
  return <div className="etf-skel" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height: 44 }} />)}</div>;
}

export function ErrorState({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="etf-state" role="alert">
      <h2>{what} is unavailable right now</h2>
      <p>The data service did not answer. Nothing was changed. Please try again.</p>
      <button className="btn" onClick={onRetry}>Try again</button>
    </div>
  );
}
