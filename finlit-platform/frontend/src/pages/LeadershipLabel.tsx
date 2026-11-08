import { Link } from "react-router";
import { PageArt } from "../components/PageArt";
import { Reveal } from "../components/Reveal";
import { useDocTitle } from "../lib/title";
import { LEAD_NOTE } from "../stock/Leadership";

/** "What the labels mean": what Leader, In line and Laggard say and how to read them, in plain words. It does not give the rules or the test behind them. */
export function LeadershipLabelPage() {
  useDocTitle("What the Leader labels mean", "What FinLit's Leader, In line and Laggard labels say about a stock's last 12 months against similar companies, and how to read them.");
  return (
    <>
      <section className="pagehead"><div className="aurora" style={{ opacity: 0.6 }} /><div className="wrap"><PageArt kind="why" /><div className="eyebrow">What the labels mean</div><h1>Leader, In line, Laggard</h1><p>A plain description of how a stock's last 12 months compare with similar companies. It looks back; it does not predict.</p></div></section>

      <section className="sec" style={{ paddingTop: 16 }}><div className="wrap lx">
        <Reveal><div className="lx-note" role="note"><b>{LEAD_NOTE}</b> The label is not advice and not a signal to trade. It is one way to see where a company stands among similar companies.</div></Reveal>

        <Reveal className="sec-h"><div className="eyebrow">The labels</div><h2>What each one says</h2></Reveal>
        <ol className="lx-rules">
          <li><span className="ld-chip leader"><i className="ld-dot" />Leader</span> The stock has been among the stronger performers of its peer group over the last 12 months, and ahead of its sector index.</li>
          <li><span className="ld-chip in_line"><i className="ld-dot" />In line</span> The stock sits in the middle of its peer group, or its record does not clearly separate it from the group.</li>
          <li><span className="ld-chip laggard"><i className="ld-dot" />Laggard</span> The stock has been among the weaker performers of its peer group over the last 12 months, and behind its sector index.</li>
        </ol>

        <Reveal className="sec-h"><div className="eyebrow">How to read it</div><h2>Three things to look at</h2></Reveal>
        <ol className="lx-rules">
          <li><b>The peers.</b> The label compares a company with similar companies, shown on its stock page. A different peer group can give a different label.</li>
          <li><b>The direction.</b> “Gaining” or “weakening” shows whether the last few months have been better or worse than the label alone suggests.</li>
          <li><b>The business score.</b> The label is about the share price. Read it with the company's Growth &amp; Profitability score: a Leader whose business scores weakly, or a Laggard whose business scores strongly, is worth a closer look at why the price and the business disagree.</li>
        </ol>

        <Reveal className="sec-h"><div className="eyebrow">Limits</div><h2>What to keep in mind</h2></Reveal>
        <ul className="lx-rules plain">
          <li><b>It changes.</b> Labels are refreshed weekly after Friday's close, and a stock can move between labels from one period to the next.</li>
          <li><b>Prices only.</b> The label says nothing about whether the business is sound.</li>
          <li><b>Not every stock has one.</b> Thinly traded stocks and stocks with less than a year of prices are left out rather than guessed.</li>
          <li><b>Leadership does not always last.</b> How well it has held differs from one sector to another, so treat the label as a description of the past, not a forecast.</li>
        </ul>
        <p className="lx-p"><Link to="/research" className="btn primary">Browse research</Link></p>
      </div></section>
    </>
  );
}
