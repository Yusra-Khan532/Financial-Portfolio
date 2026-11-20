// All my investments (task #137): the small parts every tab uses. The i button (What it shows / How to read it, the site's popover: closes on Escape and when
// focus leaves), the Key figures row with one remembered Hide, the callout group with "Open all" (the shared Callout card), the section heading with its
// number and i button, the stacked bar and its key, and the band strip. Styles: styles/myinvest.css (classes mi-*). Descriptive only.
import { useState, type ReactNode } from "react";
import { Callout, CalloutOpenAll, type CalloutKind } from "../components/Callout";
import { Info } from "../components/Info";
import { cardIds } from "../components/dashboard/DashCards";
import { nf } from "../lib/format";
import { toneOf, type Band } from "../lib/myInvest";

/** An i button: "What it shows" and "How to read it". */
export function I({ k, what, read }: { k: string; what: string; read: string }) {
  return <Info g={{ key: "mi-" + k, label: k, what: "What it shows: " + what, read: "How to read it: " + read }} />;
}

/** A section heading: its number in the open tab, the title with its i button, a one-line description, and anything on the right. */
export function SecHead({ id, n, title, line, info, aside }: { id: string; n?: number; title: string; line?: ReactNode; info: [string, string]; aside?: ReactNode }) {
  return (
    <div className="mi-sh" id={id}>
      {n != null && <span className="mi-sh-n" aria-hidden="true">{n}</span>}
      <div className="mi-sh-t">
        {n != null && <p className="mi-eyebrow">Step {n}</p>}
        <h2>{title}<I k={title} what={info[0]} read={info[1]} /></h2>
        {line ? <p className="mi-sh-l">{line}</p> : null}
      </div>
      {aside ? <div className="mi-sh-r">{aside}</div> : null}
    </div>
  );
}

const KF_KEY = "finlit.mi.keyfigures.hidden";
const readHidden = () => { try { return localStorage.getItem(KF_KEY) === "1"; } catch { return false; } };
export type KeyFig = { label: string; value: ReactNode; line: ReactNode; button: string; go: () => void; tone?: "red" | "plain"; info: [string, string] };
/** Key figures: three cards (label, one key number, a line, a button to the section behind it) and one Hide, remembered in this browser. */
export function KeyFigures({ items: all }: { items: (KeyFig | null)[] }) {
  const items = all.filter((x): x is KeyFig => x != null);   // task #277 (live number fix 8): a card with nothing to say ("None") is skipped
  const [hidden, setHidden] = useState(readHidden);
  const flip = () => { const h = !hidden; setHidden(h); try { localStorage.setItem(KF_KEY, h ? "1" : "0"); } catch { /* private window: for this visit */ } };
  return (
    <section className="mi-kf card" aria-label="Key figures">
      <div className="mi-kf-h"><h2>Key figures<I k="Key figures" what="The three things that stand out in this tab, each with a button to the section behind it." read="Each card gives one figure and a line; the button scrolls to where it comes from." /></h2>
        <span className="mi-kf-sub">What matters most across this tab</span>
        <button type="button" className="mi-hide" aria-expanded={!hidden} onClick={flip}>{hidden ? "Show" : "Hide"}</button></div>
      {!hidden && <div className="mi-kf-row">{items.map((x) => (
        <article key={x.label} className={"mi-kf-c" + (x.tone === "red" ? " red" : "")}>
          <p className="mi-cap">{x.label}<I k={x.label} what={x.info[0]} read={x.info[1]} /></p>
          <p className="mi-kf-v">{x.value}</p>
          <p className="mi-kf-l">{x.line}</p>
          <button type="button" className="mi-link" onClick={x.go}>{x.button} →</button>
        </article>))}</div>}
    </section>
  );
}

export type Note = { kind: CalloutKind; title: string; text: ReactNode };
/** A group of callouts: "N things to know", "Open all", each card closed to its kind and headline, the text in its dropdown. */
export function Notes({ scope, items }: { scope: string; items: Note[] }) {
  if (!items.length) return null;
  const ids = cardIds("mi:" + scope, items.length);
  return (
    <div className="mi-notes">
      <div className="mi-notes-h"><span className="mi-eyebrow">{items.length} {items.length === 1 ? "thing" : "things"} to know</span><CalloutOpenAll scope={"mi:" + scope} n={items.length} /></div>
      <div className="mi-notes-row" style={{ ["--n" as string]: Math.min(items.length, 3) }}>
        {items.map((x, i) => <Callout key={ids[i]} id={ids[i]} kind={x.kind} title={x.title} more="Read more"><p className="mi-note-x">{x.text}</p></Callout>)}
      </div>
    </div>
  );
}

export type Seg = { key: string; label: string; v: number; cls: string };
/** A stacked bar with its key; segments below 0.05% are left out. `label`: the bar's words for screen readers. */
export function Stack({ segs, label, keyed = true, big = false }: { segs: Seg[]; label: string; keyed?: boolean; big?: boolean }) {
  const shown = segs.filter((s) => s.v >= 0.05), tot = shown.reduce((a, s) => a + s.v, 0) || 1;
  return (
    <>
      <div className={"mi-stack" + (big ? " big" : "")} role="img" aria-label={label + ": " + shown.map((s) => `${s.label} ${nf(s.v, 1)}%`).join(", ")}>
        {shown.map((s) => <i key={s.key} className={s.cls} style={{ flexGrow: s.v / tot }}>{big && s.v / tot >= 0.08 ? <span>{nf(s.v, 0)}%<small>{s.label}</small></span> : null}</i>)}
      </div>
      {keyed && <ul className="mi-key">{shown.map((s) => <li key={s.key}><i className={s.cls} aria-hidden="true" />{s.label} <b>{nf(s.v, 1)}%</b></li>)}</ul>}
    </>
  );
}

/** A band strip: one segment per band, its width the band's share, its count written in it. */
export function BandStrip({ bands, notRated, label }: { bands: Band[]; notRated?: { count: number; share: number }; label: string }) {
  const segs = [...bands, ...(notRated && notRated.count ? [{ label: "Not rated", count: notRated.count, share: notRated.share }] : [])].filter((b) => b.count > 0);
  if (!segs.length) return null;
  return (
    <div className="mi-band" role="img" aria-label={label + ": " + segs.map((b) => `${b.count} ${b.label}`).join(", ")}>
      {segs.map((b) => <i key={b.label} className={"t-" + toneOf(b.label === "Not rated" ? null : b.label)} style={{ flexGrow: Math.max(b.share, 1) }} title={`${b.label}: ${b.count}`}>{b.count}</i>)}
    </div>
  );
}

/** A score with its own band word ("68 · Healthy"); a dash and the reason when there is none. */
export const ScoreWord = ({ v, label, why }: { v: number | null | undefined; label: string | null | undefined; why?: string | null }) =>
  v == null ? <span className="mi-muted" title={why ?? "Not rated yet"}>—</span> : <span className={"mi-sbox t-" + toneOf(label)}><b>{nf(v, 0)}</b>{label ? <em>{label}</em> : null}</span>;

/** A "Show all N …" button under a table that shows its first rows. */
export const ShowAll = ({ n, shown, noun, onClick }: { n: number; shown: number; noun: string; onClick: () => void }) =>
  n > shown ? <button type="button" className="mi-more" onClick={onClick}>Show all {n} {noun} ↓</button> : null;

/** A link card at the end of a kind's tab. */
export const GoLink = ({ to, title, line }: { to: string; title: string; line: string }) => <a className="card mi-go" href={to}><b>{title} →</b><span>{line}</span></a>;
