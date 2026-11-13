import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Icon } from "../lib/icons";
import { useDocTitle } from "../lib/title";
import { PlansBand } from "./Plans";
import { ExploreTools } from "../components/ExploreTools";
import { TOUR_CHOICE_KEY, asChoice, tourLook, type Choice, type Look } from "../lib/tourTheme";
import "../styles/human-home.css";

const TOUR = "Advanced screener · Company report · FinLit Prism · Sector Pulse · Sector Rotation · Fund Health Score · Portfolio";
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const src = (look: Look) => `${import.meta.env.BASE_URL}landing/${look === "dark" ? "finlit-tour-dark-720p.mp4" : "finlit-tour-720p.mp4"}`;
const poster = (look: Look) => `${import.meta.env.BASE_URL}landing/${look === "dark" ? "finlit-tour-dark-poster.jpg" : "finlit-tour-poster.jpg"}`;
const read = (): Choice => { try { return asChoice(localStorage.getItem(TOUR_CHOICE_KEY)); } catch { return "auto"; } };

/** The page's theme, kept up to date when the visitor switches it. */
function useSiteLook(): Look {
  const get = (): Look => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const [look, setLook] = useState<Look>(get);
  useEffect(() => { const o = new MutationObserver(() => setLook(get())); o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] }); setLook(get()); return () => o.disconnect(); }, []);
  return look;
}

/** The product tour in a browser-style frame. By default it is shown in the opposite theme to the page, so it stands out; Light / Dark buttons under it switch
 *  the look (and are remembered). It starts by itself, muted and looping, with controls so anyone can pause it; people who ask their device for less motion get the
 *  still poster. Only 720p files are shipped, so phones never download the large one. Switching keeps the place in the video. */
function Tour() {
  const v = useRef<HTMLVideoElement>(null);
  const site = useSiteLook();
  const [choice, setChoice] = useState<Choice>(read);
  const look = tourLook(site, choice);
  const at = useRef(0);
  useEffect(() => { if (reduced()) v.current?.pause(); }, []);
  const pick = (c: Choice) => { at.current = v.current?.currentTime ?? 0; setChoice(c); try { localStorage.setItem(TOUR_CHOICE_KEY, c); } catch { /* private window: the choice lasts for this visit */ } };
  const resume = () => { const el = v.current; if (!el) return; if (at.current > 0 && Number.isFinite(at.current)) { el.currentTime = Math.min(at.current, Math.max(0, (el.duration || at.current) - 0.1)); at.current = 0; } if (!reduced()) void el.play().catch(() => undefined); };
  return (
    <figure className="hh-tour" id="tour" data-look={look}>
      <div className="hh-frame" aria-hidden="true"><i /><i /><i /><span>finlitventures.com</span></div>
      <video ref={v} key={look} className="hh-video" src={src(look)} poster={poster(look)} onLoadedMetadata={resume}
        autoPlay={!reduced()} muted loop playsInline controls preload="metadata" width={1280} height={720} aria-label={`A tour of FinLit in ${look} mode: screeners, company report, FinLit Prism, sector pages, fund health score and portfolio`} />
      <figcaption>
        <div className="hh-cap"><b>Product tour</b><span>{TOUR}</span></div>
        <div className="hh-look" role="group" aria-label="Show the tour in">
          <span>Show in</span>
          {(["light", "dark"] as const).map((l) => <button key={l} type="button" aria-pressed={look === l} onClick={() => pick(l)}>{l === "light" ? "Light" : "Dark"}</button>)}
        </div>
      </figcaption>
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
  useDocTitle("Research with clarity.", "Explore company financials, quantitative models and sector-level analytics for every listed Indian company. Build custom models, compare businesses and uncover insights through data. Start free. Information only, not investment advice.");
  return (
    <div className="hh">
      <section className="hh-top" aria-labelledby="hh-title"><div className="wrap">
        <p className="hh-strip"><span>Quantify the market</span><i aria-hidden="true">×</i><span>Research deeper</span><i aria-hidden="true">×</i><em>Track what matters.</em></p>
        <div className="hh-top-cols">
          <div>
            <h1 id="hh-title">Research with <em>clarity.<svg className="hh-swoosh" viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M3 12 C 60 3, 140 1, 197 7" pathLength={1} /></svg></em></h1>
            <p className="hh-lede">Explore company financials, quantitative models and sector-level analytics. Build custom models, compare businesses and uncover insights through data.</p>
            <div className="cta-row">
              <Link className="btn lg hh-go" to="/screener">Explore every listed company <Icon name="arrow" /></Link>
              <Link className="btn lg hh-ghost" to="/stocks/RELIANCE"><Icon name="notes" />See a sample company report</Link>
            </div>
            <ul className="hh-feats" aria-label="What you can do here">
              <li><span className="hh-fi" aria-hidden="true"><Icon name="bars" /></span><span className="hh-lbl">Quantitative models</span></li>
              <li><span className="hh-fi" aria-hidden="true"><Icon name="layers" /></span><span className="hh-lbl">Custom models</span></li>
              <li><span className="hh-fi" aria-hidden="true"><Icon name="pie" /></span><span className="hh-lbl">Sector-level analytics</span></li>
            </ul>
            <p className="hh-fine">Information only. Not investment advice.</p>
          </div>
          <Tour />
        </div>
      </div>
        <svg className="hh-curve" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 110 C 360 40, 1080 40, 1440 110" /></svg>
      </section>

      <ExploreTools />
      <PrismPanel />
      <PlansBand id="pricing" landing />
    </div>
  );
}
