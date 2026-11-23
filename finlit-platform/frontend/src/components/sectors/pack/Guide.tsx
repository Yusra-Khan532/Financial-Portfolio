// Sector Pulse and Sector Rotation, task #192 round 4a-2 (the 15 Nov sector pack, SECTOR-PAGES.md sections 2, 7 and 8):
//  - PageGuide: "How to read and use this page", under the header card and above the sections bar on all four views, closed by default, the whole header row
//    opens it; the same look as the pack's pictures (a "?" mark, the title, a one-line sub-title and a round chevron). Its counts come from the page's own data and
//    its state and box definitions are the page's own i texts, word for word (MEANING and BOX_MEANING).
//  - SectionsBar: a sticky bar under the guide, "All sections" plus one numbered chip per section in the page's order, arrows between; the chip of the section in
//    view is underlined.
// Describes, never advises. Styles: styles/sectors-pack.css (sp-guide, sp-secbar, sp-more-in).
import { Fragment, useEffect, useId, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { foldAnchor, revealAndScroll } from "../../PhoneFold";
import { COLOUR, MEANING, ORDER, WORD } from "../../../lib/pulsePack";
import { BOX, BOX_ORDER } from "../../../lib/pulsePack";
import { BOX_MEANING } from "../../../lib/rotationPack";
import { BOX_COLOUR } from "../../rotation/pack/RotationSimple";
import { rw } from "../../../lib/rotationWords";
import { tw } from "../../../lib/groupWords";
import { SECTION_BAR_MIN } from "../../../lib/nav";

// ------------------------------------------------------------------------------------------------ the sections bar
export type BarItem = { id: string; label: string };
/** The sticky sections bar: "All sections", then 1 → 2 → 3 …; the section in view is underlined. `id` is the id of each section's heading. */
export function SectionsBar({ items }: { items: BarItem[] }) {
  const [on, setOn] = useState<string | null>(null);
  const key = items.map((i) => i.id).join(",");
  useEffect(() => {   // the section in view: the last one whose heading has passed the bar (none above the first section: "All sections")
    let raf = 0;
    const pick = () => {
      raf = 0;
      const line = 160;
      let cur: string | null = null;
      for (const it of items) { const e = foldAnchor(document.getElementById(it.id)); if (e && e.getBoundingClientRect().top <= line) cur = it.id; }   // task #310 part E: a closed phone section by its row
      setOn(cur);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(pick); };
    pick();
    addEventListener("scroll", onScroll, { passive: true }); addEventListener("resize", onScroll);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const go = (id: string | null) => {
    const el = id ? document.getElementById(id) : document.querySelector(".sp-guide");
    revealAndScroll(el, (x) => x.scrollIntoView({ behavior: "smooth", block: "start" }));
    if (id) setOn(id);
  };
  if (items.length < SECTION_BAR_MIN) return null;   // task #310 part D: a section bar only on a page with four or more sections
  return (
    <nav className="sp-secbar" aria-label="Sections on this page">
      <button type="button" className={"sp-secbar-all" + (on == null ? " on" : "")} onClick={() => go(null)}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></svg>All sections
      </button>
      <ol className="sp-secbar-l">{items.map((it, i) => (
        <Fragment key={it.id}>
          {i > 0 && <li className="sp-secbar-ar" aria-hidden="true">→</li>}
          <li><a href={`#${it.id}`} className={"sp-secbar-c" + (on === it.id ? " on" : "")} aria-current={on === it.id ? "location" : undefined} onClick={(e) => { e.preventDefault(); go(it.id); }}>
            <span className="sp-secbar-n" aria-hidden="true">{i + 1}</span>{it.label}</a></li>
        </Fragment>))}</ol>
    </nav>
  );
}

// ------------------------------------------------------------------------------------------------ How to read and use this page
function Fold({ sub, children }: { sub: string; children: ReactNode }) {
  const [open, setOpen] = useState(false), id = "sp-guide-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <section className={"sp-guide" + (open ? " open" : "")} aria-labelledby={id + "-t"}>
      <button type="button" className="sp-guide-h" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span className="sp-guide-q" aria-hidden="true">?</span>
        <span className="sp-guide-tt"><b id={id + "-t"}>How to read and use this page</b><small>{sub}</small></span>
        <span className="sp-guide-ch" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={open ? "M4 10l4-4 4 4" : "M4 6l4 4 4-4"} /></svg></span>
      </button>
      {open && <div className="sp-guide-b" id={id}>{children}</div>}
    </section>
  );
}
const Steps = ({ items }: { items: ReactNode[] }) => <ol className="sp-guide-steps">{items.map((x, i) => <li key={i}><span className="sp-guide-n" aria-hidden="true">{i + 1}</span><span>{x}</span></li>)}</ol>;

/** Sector Pulse: the counts are the page's own (stocks counted, groups with a reading). */
export function PulseGuide({ stocks, groups }: { stocks: number; groups: string }) {
  return (
    <Fold sub="Four steps, what each state means, and what the reading leaves out · 2 min read">
      <p className="sp-guide-intro">{tw("Sector Pulse asks one question every weekend: in each industry, are most stocks going up or down? It reads the week up to Friday's close and counts how many of the")} {stocks.toLocaleString("en-IN")} actively traded stocks in each of the {groups} are above their trend, and gives each one a state. <b>Simple</b> tells the story; <b>Full table</b> shows every number.</p>
      <div className="sp-guide-two">
        <div><h3 className="sp-guide-k">Use it in four steps</h3>
          <Steps items={[
            <><b>Check the market.</b> The <b>Market backdrop</b>{tw(", at the top of the page, says whether the whole market is in an uptrend. An industry bounce means more when it is.")}</>,
            <><b>Read today.</b> <b>Today in one minute</b> gives what changed this week. <b>The cycle</b> {tw("shows the four stages and how many industries sit in each.")}</>,
            <><b>{tw("Find an industry's state and count.")}</b> In <b>All … by state</b>, "21 of 41" means 21 of its 41 counted stocks are above their medium-term trend; past halfway, most are rising.</>,
            <><b>Bring it to your shares.</b> <b>{tw("How your industries are doing")}</b> {tw("covers the industries your shares sit in.")} <b>Standout stocks</b> {tw("lists stocks at a 1-year high inside weak industries. Open any industry for a year of its readings.")}</>,
          ]} /></div>
        <div><h3 className="sp-guide-k">What each state means</h3>
          <table className="sp-guide-t"><thead><tr><th scope="col">State</th><th scope="col">When</th></tr></thead>
            <tbody>{ORDER.map((k) => <tr key={k}><td><i className="sp-sw" style={{ background: COLOUR[k] }} aria-hidden="true" /><b>{WORD[k]}</b></td><td>{MEANING[k]}</td></tr>)}</tbody></table>
          <p className="sp-guide-tags"><span className="sp-tag sp-early">Early sign</span> Still Sold off, but most of its stocks are already above their short trend: a bounce may be forming. <span className="sp-tag sp-yourtag">Yours</span> {tw("An industry one of your shares belongs to.")}</p>
        </div>
      </div>
      <div className="sp-guide-two sp-guide-low">
        <div><h3 className="sp-guide-k">Check it against history</h3>
          <p><b>The market's mood, day by day</b> and <b>{tw("Six months of every industry")}</b> (Full table) show how long each state lasted and how often bounces faded. <b>Momentum and strength</b> {tw("sets this page next to Sector Rotation: a bounce in an industry that was already beating others has more behind it.")}</p></div>
        <div><h3 className="sp-guide-k">Keep in mind</h3>
          <ul className="sp-guide-ul">
            <li>The cycle is a map, not a timetable: many bounces fade before the next stage.</li>
            <li>{tw("The state changes more slowly than the count, so an industry can have many stocks rising and still read Sold off.")}</li>
            <li>{tw("Only actively traded, established stocks are counted (the list is reviewed monthly). Industries with too few are listed under")} <b>Too small for a reading</b>.</li>
            <li>It describes what stocks have done, not what they will do. It is not advice, and not a reason to act on its own.</li>
          </ul></div>
      </div>
      <Link className="sp-link" to="/learn/sector-signals">How to use Sector Pulse, the full guide →</Link>
    </Fold>
  );
}

/** Sector Rotation: `ranked` groups are ranked this week; `yardstick` is the number of industry groups the average group counts. Task #332 (fault 2): the figures of
 *  BOTH views are measured against the Industries view's average group (finlit_technicals/batch.py write_level_files: `Rotation(view, bench=rot.bench)`), so in the
 *  Sectors view this says "all N industry groups counted equally", exactly as the header's yardstick box does, never "all 19". */
export function RotationGuide({ ranked, yardstick, sectors = false }: { ranked: number; yardstick: number | null; sectors?: boolean }) {
  const yard = yardstick != null ? `all ${yardstick} industry groups counted equally` : "the industry groups counted equally";
  return (
    <Fold sub="Four steps, what each box means, the yardstick, and what it leaves out · 2 min read">
      <p className="sp-guide-intro">{rw("Money moves from one industry to another over months. Sector Rotation measures each of the")} {ranked} ranked {sectors ? "sectors" : "groups"} against one yardstick, <b>the average group</b> ({yard}{sectors ? ", as in the Industries view" : ""}), and puts it in one of four boxes. It updates after each weekly close. <b>Simple</b> tells the story; <b>Full table</b> shows every number.</p>
      <div className="sp-guide-two">
        <div><h3 className="sp-guide-k">Use it in four steps</h3>
          <Steps items={[
            <><b>Find the box.</b> {rw("Is the industry ahead of or behind the average group over the last several months? Is it gaining or slipping against it over the last month? The two answers give its box.")}</>,
            <><b>Read the box with breadth.</b> <b>Taking part</b>: Most means most of its stocks are above their medium-term trend; Few means a handful carry it. A broad lead has held up better than a narrow one.</>,
            <><b>Watch the rank and what changed.</b> The rank puts every {sectors ? "sector" : "group"} on one list each week, 1 the strongest; the arrows show places moved in 1 and 4 weeks. <b>Changed box this week</b> and <b>May change box next week</b> show the moves.</>,
            <><b>Bring it to your shares.</b> <b>{rw("How your industries compare")}</b> {rw("ranks the industries your shares sit in.")} <b>Does Sector Pulse agree?</b> checks whether the stocks inside have turned up too.</>,
          ]} /></div>
        <div><h3 className="sp-guide-k">What each box means</h3>
          <table className="sp-guide-t"><thead><tr><th scope="col">Box</th><th scope="col">When</th></tr></thead>
            <tbody>{BOX_ORDER.map((b) => <tr key={b}><td><i className="sp-sw" style={{ background: BOX_COLOUR[b] }} aria-hidden="true" /><b>{BOX[b].arrow} {BOX[b].word}</b></td><td>{BOX_MEANING[b]}</td></tr>)}</tbody></table>
          <p className="sp-guide-p"><b>Points.</b> {rw("+5 means the industry did 5 percentage points better than the average group; −5, 5 worse.")}</p>
          <p className="sp-guide-p"><b>The usual order.</b> {rw("Behind but gaining → Ahead and gaining → Ahead but slowing → Behind and slipping, then round again. Industries can skip a box or turn back.")}</p>
        </div>
      </div>
      <div className="sp-guide-two sp-guide-low">
        <div><h3 className="sp-guide-k">Check it against history</h3>
          <p>Turn on the 8-week paths on <b>The map</b> {rw("to see the route each industry took.")} <b>Six months of ranks</b> and <b>How the ranking changed over 12 weeks</b> (Full table) show whether a lead has lasted or keeps changing hands. <b>Words on this page</b>, near the bottom, explains every term.</p></div>
        <div><h3 className="sp-guide-k">Keep in mind</h3>
          <ul className="sp-guide-ul">
            <li>{rw("A box says how an industry has done, not what it will do. It is not advice, and not a reason to act on its own.")}</li>
            <li><b>May change box</b> is an early look, not a forecast: some readings flip back the next week.</li>
            <li>A big climb can be the start of a new lead or a short catch-up. The box and Sector Pulse help tell the two apart.</li>
            <li>Read every lead against the market backdrop: the Nifty 50 against its long-term average.</li>
          </ul></div>
      </div>
      <Link className="sp-link" to="/learn/sector-rotation">How to use Sector Rotation, the full guide →</Link>
    </Fold>
  );
}
