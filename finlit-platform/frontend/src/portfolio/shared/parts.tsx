// Task #385 (developer file 33, page-wide rules): the small pieces every view of the Equity portfolio shares.
//   Info         an i button with its own text and its own screen-reader label: About “<what it explains>”.
//   useCap /     a list longer than its limit shows its first rows and "Show all N shares ▾" ("Show fewer ▴" when open). The limits are the pack's:
//   ShowAll      by default above 10 rows, 8 shown; Your shares 25 above 30; the phone list 20 above 22; the gain-or-loss list its own rule.
//   FrozenTable  a wide table whose header row follows the member down and whose first (Share) column stays put sideways, with nothing showing
//                through the gaps (the site's HScroll, without the floating enlarge arrow).
//   Pct          a change in percent, grey when it rounds to zero (0.0%, never −0.0%).
// Classes: eqs-. Describes figures; never advice.
import { useState, type ReactNode } from "react";
import { Tip } from "../../components/sectors/pack/Common";
import { HScroll } from "../../components/HScroll";
import { pctChange } from "./numbers";
import { countOf } from "./words";
import "./shared.css";

/** An i with its own text; its label reads About “<about>”. */
export function Info({ about, text, how }: { about: string; text: string; how?: string }) {
  return <Tip text={text} how={how} label={`About “${about}”`} />;
}

export type CapRule = { over: number; keep: number };
/** The pack's default: a list longer than 10 rows shows its first 8. */
export const CAP_DEFAULT: CapRule = { over: 10, keep: 8 };
export const CAP_SHARES: CapRule = { over: 30, keep: 25 };
export const CAP_PHONE_LIST: CapRule = { over: 22, keep: 20 };
/** Which rows show: all when the list is within its limit or open; otherwise the first `keep`, plus any row `pin` asks to keep. */
export function capRows<T>(rows: T[], rule: CapRule, open: boolean, pin?: (row: T) => boolean): { shown: T[]; capped: boolean; hidden: number } {
  if (rows.length <= rule.over) return { shown: rows, capped: false, hidden: 0 };
  if (open) return { shown: rows, capped: true, hidden: 0 };
  const shown = rows.filter((r, i) => i < rule.keep || !!pin?.(r));
  return { shown, capped: true, hidden: rows.length - shown.length };
}
export function useCap<T>(rows: T[], rule: CapRule = CAP_DEFAULT, pin?: (row: T) => boolean) {
  const [open, setOpen] = useState(false);
  return { ...capRows(rows, rule, open, pin), open, setOpen, toggle: () => setOpen((o) => !o), total: rows.length };
}
/** "Show all 13 shares ▾" / "Show fewer ▴". */
export function ShowAll({ n, noun = "share", open, onToggle, controls, className = "" }: { n: number; noun?: string; open: boolean; onToggle: () => void; controls?: string; className?: string }) {
  return <button type="button" className={"eqs-more " + className} aria-expanded={open} aria-controls={controls} onClick={onToggle}>
    {open ? <>Show fewer<span aria-hidden="true"> ▴</span></> : <>Show all {countOf(n, noun)}<span aria-hidden="true"> ▾</span></>}</button>;
}

/** A table whose header follows the page down under `pinBelow` (a sticky bar's selector) and whose first column stays put sideways. */
export function FrozenTable({ label, pinBelow = ".eqt-bar", pinWatch, className = "", children }: { label: string; pinBelow?: string; pinWatch?: string; className?: string; children: ReactNode }) {
  return <HScroll label={label} pinBelow={pinBelow} pinWatch={pinWatch} pinCells controls={false} zoom={false} className={"eqs-frz " + className}>{children}</HScroll>;
}

/** A change in percent with its colour: green up, red down, grey when it rounds to zero. */
export function Pct({ v, d = 1, sign = true, className = "" }: { v: number | null | undefined; d?: number; sign?: boolean; className?: string }) {
  const p = pctChange(v, d, sign);
  return <span className={("eqs-pct " + p.tone + " " + className).trim()}>{p.text}</span>;
}
