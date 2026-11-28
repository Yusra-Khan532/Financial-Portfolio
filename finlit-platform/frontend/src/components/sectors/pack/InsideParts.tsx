// Task #448 (developer file 42): the parts of "Inside a sector" that are new. The technical chip (04 §3), the "rising on both" rule, and the
// sector / industry list drawn as a list box with the wallet (04 §5). Styles: styles/pulse448.css (.sx-tech, .sx-slb).
import { useEffect, useId, useRef, useState } from "react";
import { fmtScore, ratingWord, scoreBand, type TrendTone } from "../../../lib/prismTechnical";
import type { TechScore } from "../../../lib/prismScores";
import { Wallet } from "./Common";

const MARK: Record<Exclude<TrendTone, "na">, string> = { strongpos: "▲▲", pos: "▲", neutral: "◆", neg: "▼", strongneg: "▼▼" };
const BAND_WORD: Record<Exclude<TrendTone, "na">, string> = { strongpos: "strong uptrend", pos: "uptrend", neutral: "sideways", neg: "downtrend", strongneg: "strong downtrend" };

/** One chip: the band's mark, the site's word and the signed score ("▲ Uptrend +39"). No score keeps the site's "–". */
export function TechChip({ t, term }: { t: TechScore | null | undefined; term: "Short" | "Long" }) {
  if (!t || t.score == null || !Number.isFinite(t.score)) return <>–</>;
  const tone = scoreBand(t.score) as Exclude<TrendTone, "na">, word = ratingWord(t.word, t.score).word, s = fmtScore(t.score);
  const tip = `${term} term technical score ${s} on a scale from minus 100 to plus 100: ${BAND_WORD[tone]}. It describes past prices only.`;
  return <span className={"sx-tech sx-tech-" + tone} title={tip} role="img" aria-label={`${word} ${s}. ${tip}`}><span aria-hidden="true">{MARK[tone]} </span>{word} {s}</span>;
}

/** "Rising on both": short-term and long-term scores both +20 or more (the site's own rule). */
export const risingOnBoth = (st: TechScore | null | undefined, lt: TechScore | null | undefined) =>
  st?.score != null && lt?.score != null && st.score >= 20 && lt.score >= 20;

export type ListItem = { value: string; label: string; mine: boolean };

/** The sector list as a list box. The native select stays (hidden) and keeps the value; choosing sets it and fires `change`. */
export function SectorListBox({ label, items, value, onChange }: { label: string; items: ListItem[]; value: string; onChange: (v: string) => void }) {
  const id = useId().replace(/:/g, ""), lid = `sx-slb-l-${id}`, bid = `sx-slb-b-${id}`, listId = `sx-slb-u-${id}`;
  const [open, setOpen] = useState(false), [act, setAct] = useState(0);
  const sel = useRef<HTMLSelectElement>(null), btn = useRef<HTMLButtonElement>(null), box = useRef<HTMLDivElement>(null), ul = useRef<HTMLUListElement>(null);
  const typed = useRef({ s: "", t: 0 });
  const cur = items.find((x) => x.value === value) ?? items[0];
  const idx = Math.max(0, items.findIndex((x) => x.value === value));
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  useEffect(() => { if (open) { ul.current?.focus(); ul.current?.querySelector<HTMLElement>(`[data-i="${act}"]`)?.scrollIntoView?.({ block: "nearest" }); } }, [open, act]);
  const openAt = (i: number) => { setAct(i); setOpen(true); };
  const choose = (i: number) => {
    const v = items[i]?.value;
    setOpen(false); btn.current?.focus();
    if (v == null || v === value) return;
    const s = sel.current;
    if (s) { s.value = v; s.dispatchEvent(new Event("change", { bubbles: true })); }
    onChange(v);
  };
  const jump = (ch: string) => {
    const now = Date.now(), t = typed.current;
    t.s = now - t.t < 700 ? t.s + ch.toLowerCase() : ch.toLowerCase(); t.t = now;
    const i = items.findIndex((x) => x.label.toLowerCase().startsWith(t.s));
    if (i >= 0) setAct(i);
  };
  const keys = (e: React.KeyboardEvent) => {
    const last = items.length - 1, mv = (i: number) => { e.preventDefault(); setAct(Math.max(0, Math.min(last, i))); };
    switch (e.key) {
      case "ArrowDown": return mv(act + 1);
      case "ArrowUp": return mv(act - 1);
      case "Home": return mv(0);
      case "End": return mv(last);
      case "PageDown": return mv(act + 10);
      case "PageUp": return mv(act - 10);
      case "Enter": case " ": e.preventDefault(); return choose(act);
      case "Escape": e.preventDefault(); setOpen(false); btn.current?.focus(); return;
      case "Tab": setOpen(false); return;
      default: if (e.key.length === 1 && /\S/.test(e.key)) { e.preventDefault(); jump(e.key); }
    }
  };
  return (
    <div className="sx-slb" ref={box}>
      <span id={lid} className="sx-slb-k">{label}</span>
      <select ref={sel} className="sr-only" tabIndex={-1} aria-hidden="true" value={value} onChange={(e) => onChange(e.target.value)}>
        {items.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
      <button ref={btn} id={bid} type="button" className="sx-slb-b" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-labelledby={`${lid} ${bid}`}
        onClick={() => (open ? setOpen(false) : openAt(idx))}
        onKeyDown={(e) => { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); openAt(idx); } }}>
        <span className="sx-slb-v">{cur?.label}</span>{cur?.mine && <> <Wallet /></>}
      </button>
      {open && <ul ref={ul} id={listId} role="listbox" tabIndex={-1} className="sx-slb-u" aria-labelledby={lid} aria-activedescendant={`${listId}-${act}`} onKeyDown={keys}>
        {items.map((x, i) => <li key={x.value} id={`${listId}-${i}`} data-i={i} role="option" aria-selected={x.value === value}
          className={(i === act ? "act" : "") + (x.value === value ? " on" : "")} onMouseEnter={() => setAct(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(i)}>
          <span className="sx-slb-ck" aria-hidden="true">{x.value === value ? "✓" : ""}</span>{x.label}{x.mine && <> <Wallet /></>}</li>)}
      </ul>}
    </div>
  );
}
