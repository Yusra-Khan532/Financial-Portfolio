// "How to read this page" on both Sector pages (task #85): a compact guide of four connected, numbered cards in one row. Each card has an icon, a one-line hint and a tiny
// picture of the thing it explains; selecting a card opens the full explanation (the server's own words, GET /api/sectors and /api/rotation: how_to_use) under the row.
import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "../../lib/icons";
import { Glyph } from "../rotation/Parts";
import { StateChip } from "./Parts";
import "../../styles/sectors.css";

type Step = { title: string; text: string };

/** One short line per step and the picture that goes with it, by page. The full text always comes from the server. */
const PAGES = {
  pulse: {
    icons: ["activity", "bars", "line", "layers"],
    hints: ["The coloured state shows where the industry is in its cycle.", "Share of stocks above their 9, 20 and 50-day averages.", "Compare the Nifty 50 with its 200-day average.", "A year of its breadth, rebounds and leader flags."],
    pics: [
      <><StateChip state="Washout" /><StateChip state="Thrust C" /></>,
      <span className="sxg-bars" aria-hidden="true"><i className="b9" /><i className="b20" /><i className="b50" /></span>,
      <span className="sxg-pill"><Icon name="line" />Nifty 50 vs 200-day</span>,
      <span className="sxg-pill"><Icon name="arrow" />View industry</span>,
    ] as ReactNode[],
  },
  rotation: {
    icons: ["grid", "bars", "activity", "calendar"],
    hints: ["Ahead or behind over 6 months, gaining or slowing over 1 month.", "Broad or narrow: how many stocks share the move.", "One weekly list; arrows show places moved.", "A corner describes the past, not what comes next."],
    pics: [
      <span className="sxg-pill"><Glyph corner="ahead_gaining" size={14} />Four corners</span>,
      <><span className="sxg-tag">Broad</span><span className="sxg-tag">Narrow</span></>,
      <span className="sxg-pill"><b className="up">▲3</b><b className="down">▼2</b><span>1W · 4W</span></span>,
      <span className="sxg-pill"><Icon name="calendar" />Past prices</span>,
    ] as ReactNode[],
  },
};

export function HowToGuide({ kind, steps, learnTo, learnLabel }: { kind: "pulse" | "rotation"; steps: Step[]; learnTo: string; learnLabel: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const uid = useId();
  if (!steps.length) return null;
  const pg = PAGES[kind];
  return (
    <section className="sx-sec sxg" aria-labelledby={`${uid}-h`} data-testid="how-to-guide">
      <div className="sxg-head">
        <span className="sxg-hi" aria-hidden="true"><Icon name="book" /></span>
        <div><h2 id={`${uid}-h`}>How to read this page</h2><p>A quick guide to the key elements on this page. Select a step for the full explanation.</p></div>
        <Link className="sxg-more" to={learnTo}>{learnLabel} <Icon name="arrow" /></Link>
      </div>
      <ol className="sxg-steps">
        {steps.slice(0, 4).map((x, i) => {
          const on = open === i;
          return (
            <li key={x.title} className={on ? "on" : ""}>
              <button type="button" className="sxg-card" aria-expanded={on} aria-controls={`${uid}-p`} onClick={() => setOpen(on ? null : i)}>
                <span className="sxg-top"><span className="sxg-n">{i + 1}</span><span className="sxg-ic" aria-hidden="true"><Icon name={pg.icons[i]} /></span><b>{x.title}</b></span>
                <span className="sxg-hint">{pg.hints[i]}</span>
                <span className="sxg-pic">{pg.pics[i]}</span>
                <span className="sxg-more2" aria-hidden="true">{on ? "Hide" : "Read more"}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div id={`${uid}-p`} className="sxg-full" role="region" aria-label="Full explanation" hidden={open == null}>
        {open != null && steps[open] && <><b>{open + 1}. {steps[open].title}</b><p>{steps[open].text}</p></>}
      </div>
    </section>
  );
}
