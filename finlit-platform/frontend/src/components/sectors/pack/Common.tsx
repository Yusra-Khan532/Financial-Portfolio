// The small pieces every Sector Pulse and Sector Rotation section of the "FinLit final pages" pack (13 Nov 2026) is built from: the (i) button, the insight cards, the state and
// box chips, the 6-month sparkline and the section frame with Hide. Styles: styles/sectors-pack.css (sp- prefix). Describes, never advises.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Hideable } from "../../Hideable";
import { placeFloating } from "../../../lib/floating";
import { BOX, COLOUR, STATE_HELP, WORD, type Card } from "../../../lib/pulsePack";
import type { CornerCode } from "../../../lib/sectors";
import type { StateKey } from "../../../lib/sectorHistory";

/** The pack's (i): a small round button that opens a short explanation on hover, focus or tap; Escape or a click elsewhere closes it. */
export function Tip({ text, label = "What does this mean?" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false), [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null), id = "sp-tip-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const place = useCallback(() => { if (btn.current && pop.current) { const p = placeFloating(btn.current, pop.current); setPos({ left: p.left, top: p.top }); } }, []);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(place);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    const away = (e: MouseEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !pop.current?.contains(t)) setOpen(false); };
    const off = () => setOpen(false);
    addEventListener("keydown", key); addEventListener("mousedown", away); addEventListener("scroll", off, true); addEventListener("resize", off);
    return () => { removeEventListener("keydown", key); removeEventListener("mousedown", away); removeEventListener("scroll", off, true); removeEventListener("resize", off); };
  }, [open, place]);
  return (
    <>
      <button type="button" ref={btn} className="sp-i" aria-label={label} aria-expanded={open} aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>i</button>
      {open && createPortal(<div ref={pop} id={id} role="tooltip" className="sp-pop" style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}>{text}</div>, document.body)}
    </>
  );
}

const KIND_WORD = { good: "Good sign", watch: "Watch out", insight: "Insight", warning: "Warning" } as const;
const KIND_ICON: Record<Card["kind"], ReactNode> = {
  good: <path d="M4 14l4-4 3 3 5-6M12 7h4v4" />, watch: <><path d="M10 3l8 14H2z" /><path d="M10 8v4M10 14.5v.5" /></>,
  insight: <><path d="M10 3a5 5 0 0 0-3 9v2h6v-2a5 5 0 0 0-3-9z" /><path d="M8 17h4" /></>, warning: <><circle cx="10" cy="10" r="7" /><path d="M10 6v5M10 13.5v.5" /></>,
};
/** One insight card: the round icon, the kind in small capitals, the title and the text, in the pack's four tones. */
export function InsightCard({ c }: { c: Card }) {
  return (
    <div className={"sp-card sp-" + c.kind}>
      <span className="sp-card-ic" aria-hidden="true"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{KIND_ICON[c.kind]}</svg></span>
      <div><p className="sp-kind">{KIND_WORD[c.kind]}</p><h3 className="sp-ct">{c.title}</h3><p className="sp-cx">{c.text}</p></div>
    </div>
  );
}
export function Cards({ items, cols }: { items: Card[]; cols?: number }) {
  if (!items.length) return null;
  return <div className="sp-cards" style={{ ["--cols" as string]: cols ?? items.length }}>{items.map((c) => <InsightCard key={c.title} c={c} />)}</div>;
}

const STATE_ICON: Record<StateKey, ReactNode> = {
  crash: <path d="M3 4l4 8 3-4 4 6M14 14h3v-3" />, bouncing: <path d="M3 13l4-4 3 3 5-6M12 6h3v3" />, rising: <path d="M3 14l5-5 3 3 6-6M13 6h4v4" />,
  losing: <path d="M3 13c3-6 6-8 7-8s4 2 7 8" />, sold_off: <path d="M3 6l5 5 3-3 6 6M13 14h4v-4" />, no_signal: <path d="M3 10h14" />,
};
/** A state chip with its small arrow, as the pack draws it; `help` adds the (i) beside it. */
export function StateChip({ k, help }: { k: StateKey; help?: boolean }) {
  return (
    <span className="sp-chipw">
      <span className={"sp-chip sp-st-" + k}><svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{STATE_ICON[k]}</svg>{WORD[k]}</span>
      {help && <Tip text={STATE_HELP[k]} label={`About “${WORD[k]}”`} />}
    </span>
  );
}
/** The Sector Rotation box chip (Ahead and gaining ...). */
export function BoxChip({ corner, help }: { corner: CornerCode | null | undefined; help?: boolean }) {
  if (!corner || corner === "middle") return <span className="sp-nil">No box yet</span>;
  const b = BOX[corner];
  return (
    <span className="sp-chipw">
      <span className={"sp-chip sp-box-" + b.tone}><b aria-hidden="true">{b.arrow}</b>{b.word}</span>
      {help && <Tip text="Sector Rotation compares each industry with the average industry over the last few months and over recent weeks. The two answers put it in one of four boxes." label={`About “${b.word}”`} />}
    </span>
  );
}
/** The square swatch of a state (legends, the squares). */
export const Swatch = ({ k }: { k: StateKey }) => <i className="sp-sw" style={{ background: COLOUR[k] }} aria-hidden="true" />;

/** A 6-month line of how many of every 100 stocks were rising, with the half line dashed; `states` shades each day by its state (the full table). */
export function Spark({ values, states, label, w = 170, h = 42, last, mark }: { values: (number | null)[]; states?: (StateKey | null)[]; label: string; w?: number; h?: number; last?: boolean; mark?: number | null }) {
  const n = values.length;
  if (!n || values.every((v) => v == null)) return <span className="sp-nil">No history yet</span>;
  const x = (i: number) => (i / Math.max(1, n - 1)) * (w - 4) + 2, y = (v: number) => h - 2 - (v / 100) * (h - 4);
  const d = values.map((v, i) => (v == null ? "" : `${i && values[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join("");
  const cw = (w - 4) / n, lv = [...values].reverse().find((v) => v != null) as number;
  return (
    <svg className="sp-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`${label}: ${Math.round(lv)} of every 100 rising at the latest close`}>
      {states && states.map((s, i) => s && <rect key={i} x={2 + i * cw} y={0} width={cw + 0.3} height={h} fill={COLOUR[s]} opacity={0.28} />)}
      {!states && <rect x={0} y={y(50)} width={w} height={h - y(50)} className="sp-spark-lo" />}
      <line x1={2} x2={w - 2} y1={y(50)} y2={y(50)} className="sp-spark-half" />
      <path d={d} className="sp-spark-l" fill="none" />
      {last !== false && <circle cx={x(n - 1)} cy={y(lv)} r={2.6} className="sp-spark-dot" />}
      {mark != null && mark >= 0 && mark < n && <path d={`M${x(mark) - 4},${h - 1} L${x(mark)},${h - 8} L${x(mark) + 4},${h - 1} Z`} className="sp-spark-mark" />}
    </svg>
  );
}

/** A pack section: the white rounded panel, the serif title with its (i), the line under it, and Hide / Show when `hide` names it. */
export function Section({ id, title, help, sub, why, hide, right, children }: { id: string; title: string; help?: string; sub?: ReactNode; why?: ReactNode; hide?: boolean; right?: ReactNode; children: ReactNode }) {
  const body = (
    <section className="sp-sec" aria-labelledby={id}>
      <div className="sp-sec-h"><div><h2 id={id}>{title}{help && <Tip text={help} label={`About “${title}”`} />}</h2>{sub && <p className="sp-sub">{sub}</p>}</div>{right}</div>
      {why && <p className="sp-why"><b>Why it matters</b> {why}</p>}
      {children}
    </section>
  );
  return hide ? <Hideable id={"pack." + id} title={title}>{body}</Hideable> : body;
}

/** A table that scrolls sideways on a narrow screen, with no extra buttons (the pack's tables have none); keyboard users can scroll it once it has the focus. */
export function Scroll({ label, children }: { label: string; children: ReactNode }) {
  return <div className="sp-scroll" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}
