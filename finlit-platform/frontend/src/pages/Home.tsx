import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { Icon } from "../lib/icons";
import { useDocTitle } from "../lib/title";
import { PlansBand } from "./Plans";
import { ExploreTools, OPEN_EXPLORE } from "../components/ExploreTools";
import "../styles/human-home.css";

const TOUR = "Advanced screener · Company report · FinLit Prism · Sector Pulse · Sector Rotation · Fund Health Score · Portfolio";
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The 45-second product tour in a browser-style frame. It starts by itself, muted and looping, with controls so anyone can pause it; people who ask their device for
 *  less motion get the still poster and press play themselves. Only the 720p file is shipped, so phones never download the large one. */
function Tour() {
  const v = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (reduced()) v.current?.pause(); }, []);
  return (
    <figure className="hh-tour" id="tour">
      <div className="hh-frame" aria-hidden="true"><i /><i /><i /><span>finlitventures.com</span></div>
      <video ref={v} className="hh-video" src={`${import.meta.env.BASE_URL}landing/finlit-tour-720p.mp4`} poster={`${import.meta.env.BASE_URL}landing/finlit-tour-poster.jpg`}
        autoPlay={!reduced()} muted loop playsInline controls preload="metadata" width={1280} height={720} aria-label="A 45-second tour of FinLit: screeners, company report, FinLit Prism, sector pages, fund health score and portfolio" />
      <figcaption><b>45-sec product tour</b><span>{TOUR}</span></figcaption>
    </figure>
  );
}

/** FinLit Prism: only its panel, with the technical rating under it. The picture is a real report, dated, and shown as an example. */
function PrismPanel() {
  return (
    <section className="sec hh-sec hh-prism" id="prism" aria-labelledby="hpTitle"><div className="wrap">
      <div className="hh-center"><div className="hh-kicker">FinLit Prism</div><h2 id="hpTitle">Financial health in four parts, plus the two technical views.</h2></div>
      <figure className="hh-prism-fig">
        <img src={`${import.meta.env.BASE_URL}landing/tools/prism-with-technical.webp`} width={1200} height={750} loading="lazy" decoding="async"
          alt="The FinLit Prism panel for Reliance Industries: an overall score with Growth & Profitability, Valuation, Quality and Risk, and the short-term and long-term technical views under it" />
        <figcaption>Reliance Industries on FinLit Prism, 6 Nov 2026. Shown as an example, not a recommendation.</figcaption>
      </figure>
      <div className="hh-center"><Link className="btn lg" to="/prism">Open FinLit Prism <Icon name="arrow" /></Link></div>
    </div></section>
  );
}

export function Home() {
  useDocTitle("Research deeper. Invest with clarity.", "Explore every listed Indian company, see what drives its scores and make better-informed decisions in one workspace. Start free. Information only, not investment advice.");
  return (
    <div className="hh">
      <section className="hh-top"><div className="wrap hh-top-cols">
        <div>
          <p className="hh-pill"><Icon name="spark" />Equity research for every listed Indian company</p>
          <h1>Research deeper.<br /><em>Invest with clarity.</em></h1>
          <p className="hh-lede">Explore every listed company, see what drives its scores, and make better-informed decisions, all in one workspace.</p>
          <div className="cta-row">
            <a className="btn primary lg" href="#platform" onClick={() => dispatchEvent(new Event(OPEN_EXPLORE))}>Explore the platform <Icon name="arrow" /></a>
            <a className="btn lg" href="#tour" onClick={() => { const el = document.querySelector<HTMLVideoElement>("#tour video"); void el?.play?.().catch(() => undefined); }}><Icon name="play" />Watch the 45-sec tour</a>
          </div>
          <p className="hh-fine">Information only. Not investment advice.</p>
        </div>
        <Tour />
      </div></section>

      <ExploreTools />
      <PrismPanel />
      <PlansBand id="pricing" landing />
    </div>
  );
}
