// How to use Sector Pulse (/learn/sector-signals): what each reading means and how to use it, in plain words. It says what the page shows, never how the readings are made.
// Describes price and breadth data; never advice. Styles: styles/sectors.css.
import { Link } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { StateChip } from "../components/sectors/Parts";
import { useDocTitle } from "../lib/title";
import "../styles/sectors.css";

const TITLE = "How to use Sector Pulse";
const DESC = "Sector Pulse shows, for every NSE industry, whether most of its stocks are rising together or only a few. This page explains what each reading means and how to use it.";
const STATES: [string, string][] = [
  ["Washout", "The industry has been sold broadly. No broad rebound yet."],
  ["Thrust C", "Most stocks turned up together after a sell-off."],
  ["Thrust CAP", "The same, after a crash: a sell-off in which almost every stock kept falling to the end."],
  ["Confirmed", "Most stocks are above their short, medium and longer-term price levels together."],
  ["Fading", "A rebound or an uptrend has lost its breadth: fewer stocks are taking part."],
  ["Neutral", "None of the above."],
];

export function LearnSectorSignalsPage() {
  useDocTitle(TITLE, DESC);
  return (
    <div className="wrap sx" data-testid="learn-signals">
      <PageHeader eyebrow="Learn · Sector Pulse" title={TITLE} description={DESC} links={["/sectors"]} learn={false} />
      <div className="sx-learn">
        <section className="sx-card sx-sec" aria-labelledby="ls-what">
          <h2 id="ls-what">What Sector Pulse shows</h2>
          <p>Each evening, Sector Pulse checks every NSE industry and asks one question: are most of its stocks rising together, or only a few? It counts only liquid, established stocks, so a handful of thinly traded names cannot swing the answer. Small industries are read together with the other small industries of their NSE sector.</p>
        </section>
        <section className="sx-card sx-sec" aria-labelledby="ls-four">
          <h2 id="ls-four">The four things to read</h2>
          <h3>1. The state</h3>
          <p>A coloured label shows where the industry is in its cycle.</p>
          <dl className="sx-states">{STATES.map(([n, t]) => <div key={n}><dt><StateChip state={n} /></dt><dd>{t}</dd></div>)}</dl>
          <h3>2. The three bars</h3>
          <p>The share of the industry's stocks above their 9, 20 and 50-day averages: the short, medium and longer trend. Long bars mean most stocks are rising together; short bars mean most are falling.</p>
          <h3>3. The market backdrop</h3>
          <p>The Nifty 50 against its 200-day average, at the top of the page. Industry rebounds have behaved differently in weak and strong markets, so read every state with it.</p>
          <h3>4. Leader flags</h3>
          <p>A flag marks a stock that closed at a 52-week high while its industry is still well below its own high. A full flag means the industry is further down; an early flag, less far. A flag is about the share price only: read it with the company's business scores.</p>
        </section>
        <section className="sx-card sx-sec" aria-labelledby="ls-ind">
          <h2 id="ls-ind">On an industry page</h2>
          <ul>
            <li><b>What is happening:</b> the state in one paragraph, and where the industry sits in the cycle.</li>
            <li><b>Against the other industries:</b> its Sector Rotation corner and rank.</li>
            <li><b>Breadth over the past year:</b> the three lines, each rebound marked, and when it faded.</li>
            <li><b>The counted stocks:</b> how each one has done over 6 months inside its industry, and any leader flags.</li>
          </ul>
        </section>
        <section className="sx-card sx-sec" aria-labelledby="ls-habits">
          <h2 id="ls-habits">Good habits</h2>
          <ul>
            <li>A state describes where an industry stands today. It does not say what comes next.</li>
            <li>A washout can last weeks. On its own it says nothing about timing.</li>
            <li>Many rebounds fade. Watch whether a bounce moves on to Rising together or turns to Losing steam.</li>
            <li>Sector Pulse reads share prices only. It says nothing about whether the businesses are sound.</li>
          </ul>
          <p style={{ marginTop: 14 }}><Link className="btn primary" to="/sectors">Open Sector Pulse</Link></p>
        </section>
      </div>
      <footer className="sx-footer"><p>Describes price and breadth data for NSE industries. Not a recommendation to buy, sell or hold any security.</p></footer>
    </div>
  );
}
