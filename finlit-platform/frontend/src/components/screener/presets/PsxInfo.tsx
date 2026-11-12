import { useEffect, useRef, useState } from "react";

/** The i beside a heading: a real button that opens a small popover on a click, a tap or Enter, and closes on Escape, a tap outside or a second click. */
export function PsxInfo({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null), btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", away); document.addEventListener("touchstart", away); document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("touchstart", away); document.removeEventListener("keydown", key, true); };
  }, [open]);
  return (
    <span className="psx-ib" ref={box}>
      <button type="button" ref={btn} className="psx-i" aria-label={label ? `About ${label}` : "More about this"} aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>i</button>
      {open && <span className="psx-ip" role="note">{text}</span>}
    </span>);
}

/** What each column and heading means: the texts of screen-history-spec.md, section 6. */
export const INFO: Record<string, string> = {
  added_on: "The date this company joined this list. If it left and came back, the date of its latest return.",
  since_added_pct: "How the share price has moved since the close of the day it was added, with NIFTY 500 over the same days. Past moves do not show what comes next.",
  since_then_pct: "How the share price has moved from the close of the day you picked to the latest close, with NIFTY 500 over the same days.",
  joined: "The date the company first joined a screen of this page in the period.",
  screen: "The screen it joined first, and any other screen it joined in the period.",
  closeJoined: "The closing price on the day it joined.",
  since: "Share-price change from the close of the day it joined to the close of the date shown.",
  bench: "NIFTY 500 over the same days as the company.",
  highest: "How far the highest close since joining was above the close of the day it joined.",
  stillOn: "Whether the company is still on the screen it came from, or the day it left.",
};
export const INFO_ASON = "Pick any close of the last 2 months to see this screen's list exactly as it stood that day. The date stays as you move between screens.";
export const INFO_ASON_GAINERS = "Pick any close of the last 2 months to see Top gainers as they stood that day: who had joined in the period before it, and how far each had risen by that close.";
export const INFO_LEFT = "Companies that were on this list in the last 2 months and are not on it now: when they joined and left, how many sessions they stayed, the price change while on the list, and the reason in words.";
export const INFO_BAND_LIST = "When each company joined this list, and how its share price has moved since, with NIFTY 500 over the same days.";
export const INFO_BAND_SCREEN = "Where each company came from and how far its price has risen since it joined.";
