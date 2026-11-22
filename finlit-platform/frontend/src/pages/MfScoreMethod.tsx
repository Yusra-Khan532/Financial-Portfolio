// /methodology/mf-score: what the Mutual Fund Score means, in plain language (task #311, developer file 21: cut to what the score means; how it is
// built, its settings, weights and missing-data rules are not shown). Describes; it never advises.
import { PageHeader } from "../components/PageHeader";
import { Link } from "react-router";
import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { useDocTitle } from "../lib/title";
import { MF_SCORE_NAME, PILLAR_HELP, SCORE_BANDS } from "../lib/mfScore";
import "../styles/mf.css";

const FAQ: [string, string][] = [
  ["Is a higher score a reason to invest?", "No. The score describes how a fund's past NAVs, costs and holdings compare with funds of the same kind. It is not a forecast and not advice."],
  ["Why do two funds with the same return have different scores?", "Return is one part. Risk (how bumpy and how deep the falls), Cost and Quality (age, size, how the portfolio is built) count too, and how much each counts depends on the fund group."],
  ["Why is my fund provisional or not rated?", "A fund with 12 to 35 months of NAV history is provisional and its label stops at Healthy. Under 12 months it is not rated. Heavy data gaps also make a score provisional."],
  ["What does a gap mean?", "The fund has not reported that figure. The fund page says so, and a missing figure never helps a fund's score."],
  ["How often does it change?", "The score is worked out every night and stored once a week. The fund page shows the stored weekly history."],
  ["Why are Direct and Regular plans scored separately?", "Each plan is compared with funds of the same plan, because the Regular plan's higher cost would otherwise count against it in every comparison."],
];

export function MfScoreMethodPage() {
  const [runDate, setRunDate] = useState<string | null>(null);
  useEffect(() => { apiGet<{ runDate: string | null }>("/api/mf/scores/categories").then((r) => setRunDate(r.runDate)).catch(() => undefined); }, []);
  useDocTitle("What the Mutual Fund Score means", "The Mutual Fund Score in plain language: its four parts, who a fund is compared with, and what the score is not.");
  return (
    <div className="wrap mf mfs-method">
      <p className="mf-back"><Link to="/funds">← All mutual fund schemes</Link></p>
      <PageHeader titleVariant="read" eyebrow="Mutual Fund Score" title={<>What the {MF_SCORE_NAME} means</>} art="report" links={["/fund-score-screener", "/funds", "/funds/compare"]} description="Describes a fund's health from its past NAVs, costs and holdings; not a recommendation." meta={runDate ? <>Scores last worked out on {runDate}.</> : undefined} />

      <section className="card mf-card"><h2 className="mf-h4">What the score is, and what it is not</h2>
        <ul className="mfs-list">
          <li><b>It is a health check against funds of the same kind.</b> A 75 for a small-cap fund and a 75 for a liquid fund do not mean the same thing. Always read the group, the rank inside it and the risk-o-meter next to the score.</li>
          <li><b>It is not a forecast.</b> Past returns say little about the next year, so Performance is only one of four parts and is measured against similar funds.</li>
          <li><b>It is not a return against an index.</b> FinLit holds no index return series with dividends, so similar funds stand in for the benchmark. If every fund in a category did badly, the median is a low bar; the return-on-its-own measure limits that.</li>
          <li><b>For debt funds it sees the effect of a credit problem, not its cause.</b> The data holds no credit ratings, yield or duration, so a credit problem shows only after it reaches the NAV.</li>
          <li><b>It is not advice.</b> Nothing here tells anyone what to do with a fund. The limits behind the score are starting values set by the designer and are being tested; no accuracy is claimed.</li>
        </ul></section>

      <section className="card mf-card"><h2 className="mf-h4">Four parts, one total</h2>
        <p>The total is 0 to 100 and combines four parts: Performance, Risk, Cost and Quality. Each part is shown as a word: Strong, Fair or Weak.</p>
        <ul className="mfs-list">{Object.entries(PILLAR_HELP).map(([k, v]) => <li key={k}><b>{k[0].toUpperCase() + k.slice(1)}.</b> {v}</li>)}</ul>
      </section>

      <section className="card mf-card"><h2 className="mf-h4">Who a fund is compared with</h2>
        <p>A fund is compared with funds of the same category and plan. Direct plans are compared with Direct, Regular with Regular.</p>
      </section>

      <section className="card mf-card"><h2 className="mf-h4">Gaps are shown as gaps</h2>
        <p>Where a fund has not reported a figure, the page says so, and a missing figure never helps a fund's score.</p>
      </section>

      <section className="card mf-card"><h2 className="mf-h4">History and status</h2>
        <div className="tw"><table className="mf-cmp"><thead><tr><th scope="col">Months of NAV history</th><th scope="col">Status</th></tr></thead><tbody>
          <tr><th scope="row">36 or more</th><td>Rated</td></tr>
          <tr><th scope="row">12 to 35</th><td>Provisional, label at most Healthy</td></tr>
          <tr><th scope="row">Under 12</th><td>Not rated</td></tr></tbody></table></div>
      </section>

      <section className="card mf-card"><h2 className="mf-h4">Freshness</h2>
        <p>Scores are worked out every night after the portfolios load and stored once a week for the history chart.{runDate ? ` The latest run was on ${runDate}.` : " The date of the latest run shows here for Gold members once the first run is stored."}</p>
        <p>Gold members can screen every scored fund in the <Link to="/fund-score-screener">Fund score screener</Link>.</p></section>

      <section className="card mf-card" id="faq"><h2 className="mf-h4">Questions</h2>
        {FAQ.map(([q, a]) => <details key={q} className="mfu-faq"><summary>{q}</summary><p>{a}</p></details>)}</section>

      <section className="card mf-card"><h2 className="mf-h4">Labels and colours</h2>
        <p>Labels: {SCORE_BANDS.map(([w, a, b]) => `${w} (${a}${b === 100 ? " to 100" : " to under " + b})`).join(", ")}. Colour is green from 70, orange from 50 and red under 50.</p>
        <p>Not scored in this version: 1 and 6 month returns, daily volatility, exit load of solution-oriented funds (lock-in), fund managers and the five-point checklist. Not available at all: tracking error, index total return, portfolio P/E, credit ratings, yield and duration, portfolio turnover and manager tenure.</p>
      </section>
    </div>
  );
}
