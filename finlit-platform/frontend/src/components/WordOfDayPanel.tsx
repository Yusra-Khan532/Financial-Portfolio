// Task #315: the Word of the Day panel (the team's picture 2). A dialog under the header button on a desktop, a sheet along the bottom on a phone.
// Today's glossary term (the same one as the dashboard's "Term of the day"), its meaning, the formula as parts, why it matters, and a bookmark.
// Every word comes from the glossary source (backend glossary_data.json); nothing here advises.
import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { buttonClass, Chip } from "./ui";
import { Icon } from "../lib/icons";
import { useFocusTrap } from "../lib/focusTrap";
import { useAuthMaybe } from "../lib/auth";
import { usePrefs } from "../lib/prefs";
import { termOfTheDay, type Term } from "../lib/glossary";
import { parseFormula, toggleBookmark } from "../lib/wordOfDay";

/** Drops one pair of brackets that wraps the whole part: inside a fraction, "(CPI now − CPI a year ago)" reads as "CPI now − CPI a year ago". */
export function unwrapParens(s: string): string {
  const t = s.trim();
  if (!t.startsWith("(") || !t.endsWith(")")) return t;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "(") depth++;
    else if (t[i] === ")" && --depth === 0 && i < t.length - 1) return t;   // the first bracket closes before the end: "(a) × (b)"
  }
  return t.slice(1, -1).trim();
}

/** The parts of one row as terms: "a ÷ b" becomes one fraction term (a over b); every other operator stays between the terms. */
export function fractionTerms(parts: string[], ops: string[]): { terms: { num: string; den?: string }[]; ops: string[] } {
  const terms: { num: string; den?: string }[] = [{ num: parts[0] }];
  const out: string[] = [];
  for (let j = 1; j < parts.length; j++) {
    const op = ops[j - 1], last = terms[terms.length - 1];
    if ((op === "÷" || op === "/") && last.den === undefined) last.den = parts[j];
    else { out.push(op); terms.push({ num: parts[j] }); }
  }
  return { terms: terms.map((t) => (t.den === undefined ? t : { num: unwrapParens(t.num), den: unwrapParens(t.den) })), ops: out };
}

/** The formula box: "LHS =" then each part as a pill sized to its words, joined by its operators; a division is drawn as a written fraction, the
 *  top part over a line over the bottom part. A clause that does not split cleanly is shown as written. */
export function FormulaBox({ formula }: { formula: string }) {
  const rows = parseFormula(formula);
  if (!rows) return null;
  return (
    <div className="wod-fx" role="group" aria-label={`Formula: ${formula}`}>
      {rows.map((r, i) => {
        if ("text" in r) return <p key={i} className="wod-fx-text">{r.text}</p>;
        const f = fractionTerms(r.parts, r.ops);
        return (
          <div key={i} className="wod-fx-row" aria-hidden="true"><b className="wod-fx-lhs">{r.lhs} =</b><span className="wod-fx-rhs">
            {f.terms.map((t, j) => <span key={j} className="wod-fx-part">{j > 0 && <span className="wod-fx-op">{f.ops[j - 1]}</span>}
              {t.den === undefined ? <span className="wod-fx-pill">{t.num}</span>
                : <span className="wod-fx-frac"><span className="wod-fx-fn">{t.num}</span><span className="wod-fx-bar" /><span className="wod-fx-fn">{t.den}</span></span>}</span>)}
          </span></div>
        );
      })}
    </div>
  );
}

const Bulb = () => <svg className="wod-bulb" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2V16h5v-.1c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" /></svg>;
const BookmarkIcon = ({ on }: { on: boolean }) => <svg className="wod-bm-i" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
  <path d="M6 3h12v18l-6-4.5L6 21z" /></svg>;

export function WordPanel({ term, onClose, anchor }: { term: Term; onClose: () => void; anchor?: RefObject<HTMLElement | null> }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const p = usePrefs();
  const auth = useAuthMaybe();
  const on = p.wordBookmarks.includes(term.id);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  useFocusTrap(box, true);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  // Desktop: a card under the header button, its right edge on the button's right edge. Followed on scroll and resize (the price tape scrolls away).
  useLayoutEffect(() => {
    const place = () => { const r = anchor?.current?.getBoundingClientRect(); if (r && r.width > 0) setPos({ top: Math.round(r.bottom + 8), right: Math.max(16, Math.round(window.innerWidth - r.right)) }); };
    place();
    addEventListener("resize", place); addEventListener("scroll", place, { passive: true });
    return () => { removeEventListener("resize", place); removeEventListener("scroll", place); };
  }, [anchor]);
  const style = pos ? ({ "--wod-top": `${pos.top}px`, "--wod-right": `${pos.right}px` } as React.CSSProperties) : undefined;
  return createPortal(
    <>
      <div className="wod-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={box} className="wod-panel" role="dialog" aria-modal="true" aria-labelledby={id + "h"} aria-describedby={id + "m"} style={style} tabIndex={-1}>
        <div className="wod-head">
          <span className="wod-cal" aria-hidden="true"><Icon name="calendar" /></span>
          <h2 id={id + "h"} className="wod-kicker">FinLit Word of the Day</h2>
          <button type="button" className="wod-x modal-x" onClick={onClose} aria-label="Close Word of the Day">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
        </div>
        <div className="wod-body">
          <div className="wod-title"><h3 className="wod-term">{term.term}</h3><Chip tone="gain" className="wod-topic">{term.topic}</Chip></div>
          <p id={id + "m"} className="wod-meaning">{term.meaning}</p>
          {term.formula && <FormulaBox formula={term.formula} />}
          {term.why && <p className="wod-why"><Bulb /><span><b>Why it matters:</b> {term.why}</span></p>}
          <div className="wod-acts">
            <button type="button" className={buttonClass("secondary", "md", "wod-bm")} aria-pressed={on} onClick={() => toggleBookmark(term.id)}>
              <BookmarkIcon on={on} />{on ? "Bookmarked" : "Bookmark this word"}</button>
            <Link className="wod-gl" to={"/glossary#" + term.id} onClick={onClose}>Open in the glossary →</Link>
          </div>
          <p className="wod-note">{auth?.user
            ? <>Your bookmarks are on your dashboard, under <Link to="/dashboard#dsh-learn" onClick={onClose}>Learn → Your bookmark</Link>.</>
            : <>Your bookmarks are kept in this browser until you sign in; then they are on your dashboard, under Learn → Your bookmark.</>}</p>
        </div>
      </div>
    </>,
    document.body,
  );
}

/** The header's panel: today's word, on the India calendar day. */
export default function WordOfDayPanel({ onClose, anchor }: { onClose: () => void; anchor?: RefObject<HTMLElement | null> }) {
  const [term] = useState(() => termOfTheDay());
  return <WordPanel term={term} onClose={onClose} anchor={anchor} />;
}
