// Task #251: the i buttons of the Discover pack (README "i buttons: texts", the mockup's INFO object, word for word). Task #260: the 20 Nov pack's INFO
// object (code/discover.js), word for word: the four shared sizes, Rotation and Pulse in the shared words, and the new sector, industry and map notes. Each opens a short note under it
// on hover, keyboard focus or a click (task #265), closes on leaving it, a second click, a click outside or Escape, and gives focus back to the button.
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useHoverOpen } from "../lib/hoverOpen";

/** The Sector Rotation reading date the corner text names. */
export const RotDate = createContext<string>("the latest reading");

export type InfoKey = "placed" | "stage" | "filings" | "prism" | "lt" | "st" | "r3m" | "r1y" | "high" | "mc" | "corner" | "rank" | "pulse" | "median" | "uptrend" | "broad"
  | "views" | "mine" | "check" | "tone" | "record" | "also" | "brief" | "nse" | "sector" | "largest" | "themesin" | "map" | "inds" | "m1y"
  /** task #296: the bucket pages' own filters */ | "kw" | "named" | "wtone" | "filed";

export function infoText(k: InfoKey, rotDate: string): ReactNode {
  switch (k) {
    case "placed": return <>A company is <b>placed</b> when its newest investor presentation has been read and matched to a theme. Companies without a presentation, or whose presentation names no theme, are not on this page yet.</>;
    case "stage": return <><b>Stage</b> is the most advanced step the company’s own presentation describes for this theme: <b>Operating</b> (it already earns from it), <b>Under execution</b> (being built), <b>Planned</b>, <b>MoU / pilot</b>, or <b>Not stated</b>.</>;
    case "filings": return <>Exchange filings of the last 90 days, by type. “2 order” means two order or contract filings. Results, meeting notices and routine filings are not counted here.</>;
    case "prism": return <><b>FinLit Prism</b>, 0 to 100: FinLit’s overall reading of the business and the stock (Strong, Healthy, Average, Weak, Poor). <b>Not rated</b>: a new listing or too little data.</>;
    case "lt": return <><b>Long-term trend</b> of the price, from FinLit’s technical score: Strong uptrend, Uptrend, Sideways, Downtrend, Strong downtrend. <b>Not rated</b>: the stock trades too thinly or has too little history.</>;
    case "st": return <><b>Short-term trend</b> of the price over the recent weeks (about 5 to 20 trading sessions), from FinLit’s technical score, in the same five words as the long-term trend: Strong uptrend, Uptrend, Sideways, Downtrend, Strong downtrend. <b>Not rated</b>: the stock trades too thinly or has too little history.</>;
    case "r3m": return <>Price change over the last 3 months.</>;
    case "r1y": return <>Price change over the last 12 months.</>;
    case "high": return <>How far the last close is below the highest close of the last 52 weeks. “At the high” means within 0.05%.</>;
    case "mc": return <>Market value in ₹ crore at the last close. FinLit’s four sizes, the same on every page: <b>Large</b> above ₹75,000 cr, <b>Mid</b> ₹25,000 to ₹75,000 cr, <b>Small</b> ₹10,000 to ₹25,000 cr, <b>Micro</b> below ₹10,000 cr.</>;
    case "corner": return <>Where the company’s industry sits in <b>Sector Rotation</b> (weekly reading of {rotDate}), against the average industry: <b>↗ Ahead and gaining</b> (ahead over six months, still gaining), <b>→ Ahead but slowing</b>, <b>↑ Behind but gaining</b>, <b>↘ Behind and slipping</b>. Same colours as the Sector Rotation page.</>;
    case "rank": return <>The industry’s rank among the 37 groups Sector Rotation ranks each week, 1 being the strongest. Below it: how many weeks it has been in its box.</>;
    case "pulse": return <><b>Sector Pulse</b> reading of the industry, in the words of the Sector Pulse page: <b>Rising together</b> (most stocks trending up), <b>Bouncing back</b> (after a sell-off, most stocks turned up together), <b>Bouncing back after a crash</b> (the same, after a deeper fall), <b>Losing steam</b> (a rise lost support), <b>Sold off</b> (most below their trend, no broad bounce yet), <b>No clear signal</b>.</>;
    case "median": return <>The middle value: half of the companies did better, half did worse. Used because one big mover can distort an average.</>;
    case "uptrend": return <>Companies whose long-term trend reads Uptrend or Strong uptrend, out of all companies here.</>;
    case "broad": return <><b>Broad groups</b> are placed by general words (capacity, orders, expansion) rather than a specific technology, so they mix many industries. Check the figures before reading much into them.</>;
    case "views": return <>Ready-made views are filters you can switch on together. The number on each is how many companies it would leave, given the other filters.</>;
    case "mine": return <>Your portfolio and watchlist names that Discover has placed in a theme. A name is <b>not placed</b> when its newest investor presentation did not match any theme, or none has been read yet.</>;
    case "check": return <>Questions to answer from the company’s own documents before taking a theme mention at face value.</>;
    case "tone": return <>How upbeat the presentation’s wording is: positive minus negative finance words, from −1 (very negative) to +1 (very positive). It reads the language, not the business.</>;
    case "record": return <>For every company that enters a group, FinLit notes the date and price and later shows the group’s average return next to the Nifty 500 over the same days, good or bad.</>;
    case "also": return <>Companies whose presentation mentions this theme, but less than their main theme.</>;
    case "brief": return <>From FinLit’s full company briefs: each figure comes with its date and the page of the filing it is on.</>;
    case "nse": return <>NSE groups every listed company four ways, broad to narrow: <b>12 macro sectors</b>, <b>22 sectors</b>, <b>59 industries</b> and basic industries. Each industry sits in one sector, each sector in one macro sector.</>;
    case "sector": return <>The company’s <b>sector</b> (NSE’s 22) and, under it, its <b>industry</b> (NSE’s 59). Hover for the macro sector too.</>;
    case "largest": return <>The biggest theme among these companies, leaving out the two broad groups (Industrial manufacturing &amp; capex, Corporate developments). The number is how many companies have it as their main theme.</>;
    case "themesin": return <>How many of these companies have each theme as their main theme. Click a theme to list those companies below.</>;
    case "map": return <>Each number is how many companies of that row have the column’s theme as their main theme; switch to % to compare rows of different size. Darker means more. Click a number to list those companies.</>;
    case "inds": return <>NSE’s <b>59 industries</b>, each with its sector, how its stocks have moved, and its <b>Sector Rotation</b> box and <b>Sector Pulse</b> reading. An industry with no reading has too few liquid stocks; a small industry is read as part of its sector.</>;
    case "kw": return <>One of this bucket’s keywords from FinLit’s directory, searched with its related terms as whole words. The number beside each is how many companies in this list name it, given your other filters.</>;
    case "named": return <>How many different keywords of this bucket the company’s call transcript names. A company counts in a bucket when it names 2 different keywords, or one of them 5 times.</>;
    case "wtone": return <>Positive minus negative finance words in the whole document. It describes the wording of the document, not the business.</>;
    case "filed": return <>When the document was filed with NSE, counted back from today.</>;
    case "m1y": return <>The middle 1-year price change of these companies: half did better, half worse.</>;
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
  const openNow = () => { closeOpen?.(); closeOpen = closer; setOpen(true); };
  const toggle = () => { if (open) { close(true); return; } openNow(); };
  const hover = useHoverOpen(open, openNow, () => close(false));    // task #265: it opens on hover and keyboard focus too, as every other i does
  return <span className="dsc-iw">
    <button ref={btn} type="button" className="dsc-ib" aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined} data-i={k} {...hover.trigger}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); hover.click(toggle); }}>i</button>
    {open && <span ref={box} id={id} role="note" className="dsc-tip" {...hover.note}>{infoText(k, rotDate)}</span>}
  </span>;
}
