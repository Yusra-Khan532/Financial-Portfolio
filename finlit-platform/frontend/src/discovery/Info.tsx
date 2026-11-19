// Task #251: the i buttons of the Discover pack (README "i buttons: texts", the mockup's INFO object, word for word). Each opens a short note under it,
// closes on a second click, a click outside or Escape, and gives focus back to the button.
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";

/** The Sector Rotation reading date the corner text names. */
export const RotDate = createContext<string>("the latest reading");

export type InfoKey = "placed" | "stage" | "filings" | "prism" | "lt" | "r3m" | "r1y" | "high" | "mc" | "corner" | "rank" | "pulse" | "median" | "uptrend" | "broad"
  | "views" | "mine" | "check" | "tone" | "record" | "also" | "brief";

export function infoText(k: InfoKey, rotDate: string): ReactNode {
  switch (k) {
    case "placed": return <>A company is <b>placed</b> when its newest investor presentation has been read and matched to a theme. Companies without a presentation, or whose presentation names no theme, are not on this page yet.</>;
    case "stage": return <><b>Stage</b> is the most advanced step the company’s own presentation describes for this theme: <b>Operating</b> (it already earns from it), <b>Under execution</b> (being built), <b>Planned</b>, <b>MoU / pilot</b>, or <b>Not stated</b>.</>;
    case "filings": return <>Exchange filings of the last 90 days, by type. “2 order” means two order or contract filings. Results, meeting notices and routine filings are not counted here.</>;
    case "prism": return <><b>FinLit Prism</b>, 0 to 100: FinLit’s overall reading of the business and the stock (Strong, Healthy, Average, Weak, Poor). <b>Not rated</b>: a new listing or too little data.</>;
    case "lt": return <><b>Long-term trend</b> of the price, from FinLit’s technical score: Strong uptrend, Uptrend, Sideways, Downtrend, Strong downtrend. <b>Not rated</b>: the stock trades too thinly or has too little history.</>;
    case "r3m": return <>Price change over the last 3 months.</>;
    case "r1y": return <>Price change over the last 12 months.</>;
    case "high": return <>How far the last close is below the highest close of the last 52 weeks. “At the high” means within 0.05%.</>;
    case "mc": return <>Market value in ₹ crore. Size bands on this page: Large ₹1 lakh cr and above, Mid ₹30,000 cr to ₹1 lakh cr, Small ₹5,000 to ₹30,000 cr, Micro below ₹5,000 cr.</>;
    case "corner": return <>Where the company’s industry sits in <b>Sector Rotation</b> (reading of {rotDate}): <b>Ahead and gaining</b>, <b>Ahead but slowing</b>, <b>Behind but gaining</b> or <b>Behind and slipping</b>, against the Nifty 500.</>;
    case "rank": return <>The industry’s rank among the 37 groups Sector Rotation ranks, 1 being the strongest against the Nifty 500.</>;
    case "pulse": return <><b>Sector Pulse</b> state of the industry: Thrust C / Thrust CAP (a broad rebound), Confirmed (most stocks trending up), Washout (heavily sold), Fading, Neutral.</>;
    case "median": return <>The middle value: half of the companies did better, half did worse. Used because one big mover can distort an average.</>;
    case "uptrend": return <>Companies whose long-term trend reads Uptrend or Strong uptrend, out of all companies here.</>;
    case "broad": return <><b>Broad groups</b> are placed by general words (capacity, orders, expansion) rather than a specific technology, so they mix many industries. Check the figures before reading much into them.</>;
    case "views": return <>Ready-made views are filters you can switch on together. The number on each is how many companies it would leave, given the other filters.</>;
    case "mine": return <>Your portfolio and watchlist names that Discover has placed in a theme. A name is <b>not placed</b> when its newest investor presentation did not match any theme, or none has been read yet.</>;
    case "check": return <>Questions to answer from the company’s own documents before taking a theme mention at face value.</>;
    case "tone": return <>Positive minus negative finance words in the presentation, from −1 to +1. A rough reading of the language, not of the business.</>;
    case "record": return <>For every company that enters a group, FinLit notes the date and price and later shows the group’s average return next to the Nifty 500 over the same days, good or bad.</>;
    case "also": return <>Companies whose presentation mentions this theme, but less than their main theme.</>;
    case "brief": return <>From FinLit’s full company briefs: each figure comes with its date and the page of the filing it is on.</>;
  }
}

/** The i button. Only one note is open at a time on the page. */
let closeOpen: (() => void) | null = null;
export function I({ k, label = "What does this mean?" }: { k: InfoKey; label?: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null), box = useRef<HTMLSpanElement>(null);
  const id = useId(), rotDate = useContext(RotDate);
  const close = (focus: boolean) => { setOpen(false); if (closeOpen === closer) closeOpen = null; if (focus) btn.current?.focus(); };
  const closer = () => close(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(true); } };
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !box.current?.contains(t)) close(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = () => {
    if (open) { close(true); return; }
    closeOpen?.(); closeOpen = closer; setOpen(true);
  };
  return <span className="dsc-iw">
    <button ref={btn} type="button" className="dsc-ib" aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined} data-i={k} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}>i</button>
    {open && <span ref={box} id={id} role="note" className="dsc-tip">{infoText(k, rotDate)}</span>}
  </span>;
}
