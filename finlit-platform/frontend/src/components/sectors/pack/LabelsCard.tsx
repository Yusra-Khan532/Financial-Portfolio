// Task #448 (Sector Pulse, developer file 42, 04 §4; shared with Sector Rotation, file 43, where its two main parts swap order): "What the labels mean", one card
// for both pages, opened from the ⋯ menu and from the first-visit line on Today. Every label on the two pages in plain words; they describe past prices, not what
// to buy or sell. `n` is the view's noun: sector, industry or group. Styles: styles/pulse448.css (sx-labels).
import { Wallet } from "./Common";

const an = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");

export function LabelsCard({ n, rotationFirst = false, held = true }: { n: "sector" | "industry" | "group"; rotationFirst?: boolean; held?: boolean }) {
  const ns = n === "industry" ? "industries" : n + "s";
  const pulse = (
    <section className="sx-labels-p" key="pulse">
      <h3 className="sx-labels-h"><b>Sector Pulse: the last few weeks.</b> Are most of {an(n)} {n}'s stocks rising? Each {n} has one of these states.</h3>
      <dl>
        <div><dt>Rising together</dt><dd>Most of the {n}'s stocks are above their short, medium and longer-term price levels. The rise is broad, not carried by a few names.</dd></div>
        <div><dt>Bouncing back</dt><dd>After a fall, most of the {n}'s stocks turned up together within a few days. It is the first sign of a recovery, and it can still fade.</dd></div>
        <div><dt>Bouncing back after a crash</dt><dd>The same broad bounce, but after a deep fall in which almost every stock in the {n} hit a new low.</dd></div>
        <div><dt>Losing steam</dt><dd>A bounce or a rise that is losing support: fewer of the {n}'s stocks are still going up.</dd></div>
        <div><dt>Sold off</dt><dd>Most of the {n}'s stocks have fallen below their usual price level, and they have not turned up together yet.</dd></div>
        <div><dt>Early sign</dt><dd>Still Sold off, but most of its stocks are already above their short trend: a bounce may be forming.</dd></div>
      </dl>
    </section>
  );
  const rotation = (
    <section className="sx-labels-p" key="rotation">
      <h3 className="sx-labels-h"><b>Sector Rotation: 6 months and the last month.</b> Is the {n} ahead of the average group (all {ns} with a reading, counted equally)? Each {n} sits in one of four boxes.</h3>
      <dl>
        <div><dt>Ahead and gaining</dt><dd>Ahead of the average group over 6 months, and still gaining on it over the last month.</dd></div>
        <div><dt>Ahead but slowing</dt><dd>Ahead of the average group over 6 months, but behind it over the last month.</dd></div>
        <div><dt>Behind but gaining</dt><dd>Behind the average group over 6 months, but ahead of it over the last month.</dd></div>
        <div><dt>Behind and slipping</dt><dd>Behind the average group over 6 months, and still losing ground over the last month.</dd></div>
        <div><dt>Most · Some · Few</dt><dd>Taking part: how many of its stocks are above their medium-term trend. A lead most stocks share is broad.</dd></div>
        <div><dt>+5% / −5%</dt><dd>How much better (+) or worse (−) than the average group over that time.</dd></div>
      </dl>
    </section>
  );
  return (
    <div className="sx-labels" data-testid="labels-card">
      <p className="sx-labels-lead">Every label on Sector Pulse and Sector Rotation, in plain words. They describe past prices, not what to buy or sell.</p>
      {rotationFirst ? [rotation, pulse] : [pulse, rotation]}
      <section className="sx-labels-p">
        <h3 className="sx-labels-h"><b>Your shares against their own {n}.</b> Each share is compared with the other stocks in its own {n} over 6 months.</h3>
        <dl>
          <div><dt><span className="sx-pl sx-pl-lead">Leader</span></dt><dd>Ahead of most of them.</dd></div>
          <div><dt><span className="sx-pl sx-pl-line">In line</span></dt><dd>In the middle.</dd></div>
          <div><dt><span className="sx-pl sx-pl-lag">Laggard</span></dt><dd>Behind most of them.</dd></div>
          <div><dt><span className="sx-pl sx-pl-none">No label</span></dt><dd>Too few comparable stocks to say.</dd></div>
        </dl>
      </section>
      <section className="sx-labels-p">
        <h3 className="sx-labels-h"><b>Other labels</b></h3>
        <dl>
          {held && <div><dt className="sx-labels-wal"><Wallet /> In your portfolio</dt><dd>{an(n) === "an" ? "An" : "A"} {n} or a stock you hold shares in.</dd></div>}
          <div><dt>Strong · Early</dt><dd>Standout stocks: at a new 1-year high while their {n} is still well below its own high. Strong: the {n} is far below its high. Early: a little less far.</dd></div>
          <div><dt>Results: Ahead · In line · Behind</dt><dd>How the companies' latest quarter compares with the typical listed company: Ahead when both revenue and profit grew faster, Behind when both grew slower, else In line.</dd></div>
          <div><dt>Prism</dt><dd>FinLit's rating of a company's business. It is about the business, not the share price.</dd></div>
        </dl>
      </section>
    </div>
  );
}
