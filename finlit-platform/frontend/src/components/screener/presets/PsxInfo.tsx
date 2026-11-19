import { useEffect, useRef, useState, type ReactNode } from "react";

/** The i beside a heading: a real button that opens a small popover on a click, a tap or Enter, and closes on Escape, a tap outside or a second click. */
export function PsxInfo({ text, label }: { text: ReactNode; label?: string }) {
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
  added_on: "The first saved list of this company's current run: it has been on every saved list since. A change to the screen's rules does not restart it. If it left and came back, the run starts again.",
  since_added_pct: "How the share price has moved while on this list: from the price saved on the Added day to the price on this list's date, covering all the days in between, each day's move compounded. NIFTY 500 sits under it, over the same days. Past moves do not show what comes next.",
  since_then_pct: "What happened after this list: from the price on the day you picked to the latest list's price, with NIFTY 500 over the same days.",
  joined: "The date the company first joined a screen of this page in the period.",
  screen: "The screen it joined first, and any other screen it joined in the period.",
  closeJoined: "The closing price on the day it joined.",
  since: "Share-price change from the close of the day it joined to the close of the date shown.",
  bench: "NIFTY 500 over the same days as the company.",
  highest: "How far the highest close since joining was above the close of the day it joined.",
  stillOn: "Whether the company is still on the screen it came from, or the day it left.",
  // task #243 round 3b (pack v4, section 3): the Sector reading and the Sectors screens' own columns
  sr_industry: "The company's industry group on Sector Pulse, its rank on Sector Rotation (1 is the strongest of the groups ranked) and how many ranks it climbed or fell in the last 4 weeks.",
  sr_rotation: "Where the industry stands against the average industry on Sector Rotation: ahead or behind over 6 months, and gaining or slipping over the last month, with the weeks it has been in that corner.",
  sr_pulse: "The industry's state on Sector Pulse (Washout, Thrust C, Thrust CAP, Confirmed or Fading), the share of its stocks above their 50-day average, and how long ago its last broad thrust was.",
  sr_peer: "How the company compares with the other companies of its industry on Sector Pulse: Leader, In line or Laggard. A blank means it has no label (too few peers, or not counted).",
  sr_tailwinds: "How many of four facts line up: the industry is Ahead and gaining; the industry is in a broad rebound or uptrend (Thrust C, Thrust CAP or Confirmed); the company is a peer Leader; the company is on a Setups or Chart patterns list. It counts facts; it is not a score and not a view.",
  sr_flag: "A Sector Pulse leader flag: the stock closed at a 52-week high while its industry is still well below its own high. Full flag: the industry is 15% or more below its high; Early flag: 10 to 15%.",
  sr_q6m_name: "Where the company's 6-month return places it among the counted stocks of its industry, in quarters.",
  sr_rank_4w: "How many places the industry climbed on the Sector Rotation ranking in the last 4 weeks.",
  sr_setups: "The Setups and Chart patterns lists the company is on tonight. Open a list to read what it looks for.",
};
export const INFO_ASON = "Pick any close of the last 2 months to see this screen's list exactly as it stood that day. The date stays as you move between screens.";
export const INFO_ASON_GAINERS = "Pick any close of the last 2 months to see Top gainers as they stood that day: who had joined in the period before it, and how far each had risen by that close.";
export const INFO_LEFT = "Companies that were on this list in the last 2 months and are not on it now: when they joined and left, how many sessions they stayed, the price change while on the list, and the reason in words.";
export const INFO_BAND_LIST = "When each company joined this list, and how its share price has moved since, with NIFTY 500 over the same days.";
export const INFO_BAND_SECTOR = "Each company's industry as Sector Pulse and Sector Rotation read it, and how the company compares with its peers. These come from the weekly sector run: the date is in the heading.";
/** The industry board's i (task #243 round 3b): the four corners and the Pulse states, and how picking a chip works. */
export const INFO_BOARD = "Each chip is one industry on this list, with how many of its companies are here. Sector Rotation's corners: Ahead and gaining, Ahead but slowing, Behind but gaining, Behind and slipping (against the average industry, over 6 months and the last month). Sector Pulse's states: Washout (most stocks down), Thrust C and Thrust CAP (a broad rebound), Confirmed (the rebound held), Fading (it is weakening). Pick a chip to show only that industry; pick it again, or Clear all, to show every one.";
export const INFO_BAND_SCREEN = "Where each company came from and how far its price has risen since it joined.";
export const INFO_START = "FinLit began storing lists on 11 Nov 2026; this company was already on the list then.";
