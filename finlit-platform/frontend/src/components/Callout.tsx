// The shared callout card with a dropdown (dashboard pack, 15 Nov 2026, START-HERE rule 3): a Good sign / Insight / Watch out / Warning card shows the kind,
// the headline and one line; an optional count bar; the names, figures or long text go into a dropdown. Several cards get one "Open all / Close all" button
// (CalloutOpenAll). Open state comes from the dashboard's per-member store (DashCards), so "Open all" and each card agree. Styles: styles/callout.css (cl-*).
import { useId, type ReactNode } from "react";
import { Link } from "react-router";
import type { CardGroup } from "../lib/pulsePack";
import { KIND_ICON, KIND_WORD } from "./sectors/pack/Common";
import { cardIds, useOpenStore } from "./dashboard/DashCards";
import "../styles/callout.css";

export type CalloutKind = keyof typeof KIND_WORD;
export type MeterPart = { n: number; word: string; tone: "up" | "down" | "none" };
/** At most this many chips per group; then "+N more". */
export const CHIP_LIMIT = 8;

function Chev({ up }: { up: boolean }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ transform: up ? "rotate(180deg)" : undefined }}><path d="M6 9l6 6 6-6" /></svg>;
}

/** The count bar: one segment per part (green, red, grey), its counts written underneath. */
export function Meter({ parts }: { parts: MeterPart[] }) {
  const total = parts.reduce((a, p) => a + p.n, 0);
  if (!total) return null;
  return (
    <>
      <div className="cl-meter" role="img" aria-label={parts.map((p) => `${p.n} ${p.word}`).join(", ")}>
        {parts.filter((p) => p.n > 0).map((p) => <i key={p.word} className={p.tone} style={{ flexGrow: p.n }} />)}
      </div>
      <p className="cl-ml" aria-hidden="true">{parts.map((p) => <span key={p.word}><b>{p.n}</b> {p.word}</span>)}</p>
    </>
  );
}

/** One group of chips: its label in the group's colour, at most CHIP_LIMIT chips (each with its figure), then "+N more" to show the rest. */
function Chips({ g, showAll, onMore }: { g: CardGroup; showAll: boolean; onMore: () => void }) {
  const shown = showAll ? g.chips : g.chips.slice(0, CHIP_LIMIT), extra = g.chips.length - shown.length;
  return (
    <div className={"cl-g" + (g.tone ? " " + g.tone : "")}>
      <p className="cl-gl">{g.label}</p>
      <ul className="cl-chips">
        {shown.map((c) => <li key={c.symbol}><Link className="cl-chip" to={`/stocks/${encodeURIComponent(c.symbol)}`} title={`Open the ${c.label} report`}>{c.label}{c.note ? <small>{c.note}</small> : null}</Link></li>)}
        {extra > 0 && <li><button type="button" className="cl-chipmore" onClick={onMore}>+{extra} more</button></li>}
      </ul>
    </div>
  );
}

export function Callout({ id, kind, title, line, meter, more = "See the names", groups = [], note, children }: {
  id: string; kind: CalloutKind; title: string; line?: ReactNode; meter?: MeterPart[]; more?: string; groups?: CardGroup[]; note?: string; children?: ReactNode }) {
  const store = useOpenStore();
  const open = store.isOpen(id), all = store.isOpen(id + ":all");
  const bodyId = "cl-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hasBody = groups.length > 0 || !!children || !!note;
  return (
    <article className={"cl cl-" + kind} data-card={id}>
      <header><span className="cl-ic" aria-hidden="true"><svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{KIND_ICON[kind]}</svg></span><span className="cl-k">{KIND_WORD[kind]}</span></header>
      <h3>{title}</h3>
      {line ? <p className="cl-x">{line}</p> : null}
      {meter && <Meter parts={meter} />}
      {hasBody && <button type="button" className="cl-dd" aria-expanded={open} aria-controls={bodyId} onClick={() => store.setOpen([id], !open)}>{more}<Chev up={open} /></button>}
      {hasBody && (
        <div className="cl-body" id={bodyId} hidden={!open}>
          {groups.map((g) => <Chips key={g.label} g={g} showAll={all} onMore={() => store.setOpen([id + ":all"], true)} />)}
          {children}
          {note && <p className="cl-nt">{note}</p>}
        </div>
      )}
    </article>
  );
}

/** "Open all" / "Close all" for a set of callouts: every one open makes it "Close all". */
export function CalloutOpenAll({ scope, n }: { scope: string; n: number }) {
  const store = useOpenStore();
  if (n < 2) return null;
  const ids = cardIds(scope, n), allOpen = ids.every((x) => store.isOpen(x));
  return <button type="button" className="dsh-btn cl-openall" onClick={() => store.setOpen(ids, !allOpen)}>{allOpen ? "Close all" : "Open all"}</button>;
}
