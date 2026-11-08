// How to use Sector Rotation (/learn/sector-rotation): what each reading means and how to use it, in plain words. It says what the page shows, never how the readings are made.
// Describes past prices; never advice. Styles: styles/rotation.css.
import { Link } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { CornerBadge } from "../components/rotation/Parts";
import { useDocTitle } from "../lib/title";
import "../styles/sectors.css";

const TITLE = "How to use Sector Rotation";
const DESC = "Which NSE industries have been pulling ahead of the rest, and which have been falling behind? This page explains the corners, breadth and the rotation rank, and how to use them.";
const CORNERS: [string, string][] = [
  ["ahead_gaining", "Ahead over 6 months, and still gaining ground last month"],
  ["ahead_slowing", "Ahead over 6 months, but behind the average last month"],
  ["behind_gaining", "Behind over 6 months, but ahead of the average last month"],
  ["behind_slipping", "Behind over 6 months, and still losing ground last month"],
];

export function LearnSectorRotationPage() {
  useDocTitle(TITLE, DESC);
  return (
    <div className="wrap sx rt" data-testid="learn-rotation">
      <PageHeader eyebrow="Learn · Sector Rotation" title={TITLE} description={DESC} links={["/sectors/rotation"]} learn={false} />
      <div className="sx-learn">
        <section className="rt-card sx-sec" aria-labelledby="lr-what">
          <h2 id="lr-what">What Sector Rotation shows</h2>
          <p>Which NSE industries have been pulling ahead of the rest, and which have been falling behind? Sector Rotation compares every industry with the <b>average industry</b>: all NSE industries and sector groups with a reading, each counted equally, so a few large companies do not set the bar.</p>
        </section>
        <section className="rt-card sx-sec" aria-labelledby="lr-three">
          <h2 id="lr-three">The three things to read</h2>
          <h3>1. The corner</h3>
          <p>Each industry is compared with the average industry twice: over 6 months (ahead or behind) and over the last month (gaining or slowing). The two answers place it in one of four corners.</p>
          <dl className="sx-states">{CORNERS.map(([c, t]) => <div key={c}><dt><CornerBadge corner={c as never} /></dt><dd>{t}</dd></div>)}</dl>
          <p>Corners change slowly, so one noisy week does not move an industry.</p>
          <h3>2. Breadth</h3>
          <p><i>Broad</i> means most of the industry's stocks are above their 50-day average; <i>Narrow</i> means a few stocks carry it. A broad lead has held up better than a narrow one.</p>
          <h3>3. The rotation rank</h3>
          <p>Every group on one list, each week. The arrows show the places it moved since last week and since 4 weeks ago. A new group gets a rank once it has a full year of readings; until then it shows "Not ranked yet".</p>
        </section>
        <section className="rt-card sx-sec" aria-labelledby="lr-views">
          <h2 id="lr-views">The views on the page</h2>
          <ul>
            <li><b>Corners</b> lists each industry in its corner, with its 6-month and last-month numbers in points against the average. <b>Map</b> plots them, with the path of the last 8 weeks.</li>
            <li><b>Changed corner this week</b> and <b>Biggest rank moves</b> show what moved.</li>
            <li><b>How the ranking changed</b> shows each group's rank at the last 12 weekly closes.</li>
          </ul>
        </section>
        <section className="rt-card sx-sec" aria-labelledby="lr-habits">
          <h2 id="lr-habits">Good habits</h2>
          <ul>
            <li>A corner describes the past. It is not a forecast, and it is not a reason to act on its own.</li>
            <li><i>Behind but gaining</i> is often a short bounce. A second month of gains, with broad breadth, makes it more than that.</li>
            <li>Read the corner together with the industry's <Link className="sx-link" to="/sectors">Sector Pulse</Link> state.</li>
          </ul>
          <p style={{ marginTop: 14 }}><Link className="btn primary" to="/sectors/rotation">Open Sector Rotation</Link></p>
        </section>
      </div>
      <footer className="sx-footer"><p>Describes past prices of NSE industry groups against the average industry. Not a recommendation to buy, sell or hold any security.</p></footer>
    </div>
  );
}
