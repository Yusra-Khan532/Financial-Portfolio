import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { NotifyForm } from "../components/NotifyForm";
import { Icon } from "../lib/icons";
import { Reveal } from "../components/Reveal";
import { useEnquiry } from "../components/Enquiry";
import { useSummary, useSearchIndex, type Summary } from "../lib/api";
import { useDocTitle } from "../lib/title";
import { nf } from "../lib/format";
import { PlansBand } from "./Plans";
import { mfGet } from "../lib/mf";
import { FeatureBucket } from "../components/FeatureBucket";
import { useAuth } from "../lib/auth";
import { Safe3D } from "../three/Safe3D";
import { supports3d, whenIdle } from "../three/support";
import "../styles/human-home.css";

const Hero3D = lazy(() => import("../three/Hero3D"));
const ScoreTower3D = lazy(() => import("../three/ScoreTower3D"));

/** True once the browser is idle and the device can run WebGL scenes; until then (and for everyone else) the flat page is shown. */
function use3d(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => whenIdle(() => setOn(supports3d())), []);
  return on;
}

const SAMPLE = "RELIANCE";
const PILLAR_VAR: Record<string, string> = { quality: "--p-quality", growth: "--p-growth", profitability: "--p-profit", balance: "--p-balance", technical: "--p-tech" };
const inr = (n: number) => n.toLocaleString("en-IN");

/** A real score card for a real stock, read from the same API the report page uses. */
function ScoreCard({ s, tower, failed }: { s?: Summary; tower?: boolean; failed?: boolean }) {
  if (!s && failed) return <div className="hh-card"><p className="muted" style={{ padding: 20 }}>The sample report is not available right now. <Link to={`/stocks/${SAMPLE}`}>Try opening it</Link>.</p></div>;
  if (!s) return <div className="hh-card" aria-busy="true"><div className="skeleton" style={{ height: 300 }} /></div>;
  const o = s.score.overall ?? 0, circ = 2 * Math.PI * 46, up = (s.quote.changePct ?? 0) >= 0;
  return (
    <Link to={`/stocks/${SAMPLE}`} className="hh-card" aria-label={`Open the full ${s.profile.name} report`}>
      <div className="hh-card-top"><span className="hh-stamp">A real report</span><span className="hh-tk">{s.profile.nse ?? SAMPLE}</span></div>
      <div className="hh-card-name"><b>{s.profile.name}</b><span className={up ? "up" : "down"}>₹{nf(s.quote.price ?? 0)}{s.quote.changePct != null && <> · {up ? "+" : ""}{s.quote.changePct.toFixed(2)}%</>}</span></div>
      <div className="hh-card-score">
        <svg viewBox="0 0 110 110" role="img" aria-label={`FinLit IQ ${o} out of 100`}>
          <circle cx="55" cy="55" r="46" fill="none" stroke="var(--s3)" strokeWidth="8" />
          <circle cx="55" cy="55" r="46" fill="none" stroke="var(--gold)" strokeWidth="8" strokeLinecap="butt" strokeDasharray={`${(circ * o) / 100} ${circ}`} transform="rotate(-90 55 55)" />
          <text x="55" y="58" textAnchor="middle" className="hh-dial-n">{o}</text>
          <text x="55" y="76" textAnchor="middle" className="hh-dial-s">out of 100</text>
        </svg>
        <p className="hh-card-iq"><b>{o}</b> · FinLit IQ out of 100{s.score.band?.label ? <> · {s.score.band.label}</> : null}</p>
        <ul className="hh-bars">{s.score.pillars.map((p) => <li key={p.key} style={{ "--pc": `var(${PILLAR_VAR[p.key] ?? "--gold"})` } as React.CSSProperties}><span>{p.label}</span><i><b style={{ width: `${p.score ?? 0}%` }} /></i><em>{p.score ?? "–"}</em></li>)}</ul>
      </div>
      {tower && <Safe3D><Suspense fallback={null}><ScoreTower3D scores={s.score.pillars.map((p) => p.score ?? 0)} /></Suspense></Safe3D>}
      <p className="hh-card-foot">Taken live from the same data as the full report. Open it →</p>
    </Link>
  );
}

/** A section picture in both themes: two images, one hidden per theme (as the tool cards switch). Transparent backgrounds. */
function ThemeImg({ name, alt, w, h, className = "" }: { name: string; alt: string; w: number; h: number; className?: string }) {
  return (
    <picture className={"hh-pic " + className}>
      <img className="fb-l" src={`${import.meta.env.BASE_URL}landing/${name}-light.webp`} width={w} height={h} loading="lazy" decoding="async" alt={alt} />
      <img className="fb-d" src={`${import.meta.env.BASE_URL}landing/${name}-dark.webp`} width={w} height={h} loading="lazy" decoding="async" alt={alt} />
    </picture>
  );
}
const STEP_IMG = ["how-step-1-search", "how-step-2-score", "how-step-3-working", "how-step-4-watch"];
const STEP_ALT = ["The search box with a company name typed in", "A FinLit IQ dial with its five pillar bars", "A company page with its statements and ratios", "A watchlist row with an alert set"];

const STEPS: [string, string][] = [
  ["Search a company", "Type a name or an NSE/BSE symbol. Every listed company has a page."],
  ["Read the score", "The FinLit IQ: one number out of 100, split into five pillars so you can see what pulls it up or down."],
  ["Check the working", "Statements, ratios, peers, ownership and filings are on the same page. Each ratio explains itself."],
  ["Keep an eye on it", "Add it to a watchlist or set an alert on price, RSI, score, a ratio or a new filing."],
];

/** The two lenses: the business (four pillars from the filings) and the share price (Technical), each shown on its own. */
function Lenses() {
  return (
    <section className="sec hh-sec" id="lenses" aria-labelledby="lensTitle"><div className="wrap">
      <Reveal className="hh-head"><div className="hh-kicker">Two lenses</div><h2 id="lensTitle">The business and the share price, read apart</h2>
        <p>The FinLit IQ is the average of five pillars. Four read the business from its filed statements: quality, growth, profitability and balance sheet. The fifth, Technical, reads only the share price. Each pillar is shown on its own, and Growth & Profitability is also scored by itself, so a strong chart never hides a weak business.</p></Reveal>
      <ThemeImg name="finlit-lenses" w={1200} h={480} className="wide" alt="Two panels: the business, read from the filings in four pillars, and the share price, read by the Technical pillar" />
      <p className="hh-fine">FinLit Prism (Gold) keeps its two technical views outside its score.</p>
    </div></section>
  );
}

/** Connect AI: the free, read-only connector on /mcp, which the landing page never mentioned. Every claim is taken from that page. */
function ConnectAI() {
  return (
    <section className="sec hh-sec" id="connect-ai" aria-labelledby="aiTitle"><div className="wrap hh-ai">
      <Reveal>
        <div className="hh-kicker">Connect AI</div><h2 id="aiTitle">Use FinLit data inside your AI assistant</h2>
        <p>Add one address to Claude, ChatGPT or Cursor, and your assistant can look up prices, financial statements, ratios, shareholding, results, funds and market flows from FinLit instead of guessing them. Every answer carries its source and an as-of date.</p>
        <ul className="hh-ai-pts">
          <li><Icon name="check" />Free and read-only: it cannot change an account, a watchlist or a portfolio</li>
          <li><Icon name="check" />No sign-in and no key</li>
          <li><Icon name="check" />It sees what a visitor without an account sees; paid figures stay behind their plan</li>
        </ul>
        <Link className="btn primary lg" to="/mcp">See the setup steps <Icon name="arrow" /></Link>
      </Reveal>
      <ThemeImg name="connect-ai-section" w={1200} h={580} alt="An AI assistant answering a question about a company with FinLit data, its source and date" />
    </div></section>
  );
}

/** The figures under the hero: companies in the index, those with a full report, screener filters and mutual fund schemes (all live except the filter count). */
function Stats({ counts, schemes }: { counts: { all: number; ready: number } | null; schemes: number | null }) {
  return (
    <section className="wrap hh-stats" aria-label="The index today">
      <dl className="hh-facts">
        <div><dt>Companies in the index</dt><dd>{counts ? inr(counts.all) : "…"}</dd></div>
        <div><dt>With a full report</dt><dd>{counts ? inr(counts.ready) : "…"}</dd></div>
        <div><dt>Screener filters</dt><dd>160+</dd></div>
        <div><dt>Mutual fund schemes</dt><dd>{schemes != null ? inr(schemes) : "…"}</dd></div>
      </dl>
    </section>
  );
}

function Method({ s, failed }: { s?: Summary; failed?: boolean }) {
  const strength = s?.strengths?.[0], watch = s?.watchouts?.[0];
  return (
    <section className="sec hh-sec" id="method"><div className="wrap">
      <Reveal className="hh-head"><div className="hh-kicker">How the score is made</div><h2>The number, and what is behind it</h2><p>A score is only useful if you can check it. So we show the working.</p></Reveal>
      <ThemeImg name="score-yardstick" w={1200} h={510} className="wide" alt="A pillar score on a 0 to 100 yardstick, with the ratios behind it" />
      <div className="hh-method">
        <ol className="hh-notes">
          <li><b>Five pillars.</b> Quality, growth, profitability and balance sheet read the business; Technical reads the share price. Each is scored from 0 to 100.</li>
          <li><b>Fixed yardsticks.</b> Inside a pillar, each ratio is compared with set thresholds, the same for every company in the model. Nobody adjusts them for a stock we like.</li>
          <li><b>Missing data stays missing.</b> If a pillar cannot be scored from the filings we have, the report says so. It does not fill the gap with a guess.</li>
          <li><b>A summary, not a verdict.</b> The score does not tell you to buy or sell anything.</li>
        </ol>
        <figure className="hh-excerpt">
          <figcaption>From the {s ? s.profile.name : "sample"} report{s?.meta?.generatedAt ? `, generated ${new Date(s.meta.generatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}</figcaption>
          {s ? <>
            {s.thesis && <blockquote>{s.thesis}</blockquote>}
            {strength && <p><span className="hh-tag good">Strength</span> <b>{strength.title}.</b> {strength.text}</p>}
            {watch && <p><span className="hh-tag warn">Watch-out</span> <b>{watch.title}.</b> {watch.text}</p>}
            {!s.thesis && !strength && !watch && <p>Open the report to read the notes.</p>}
          </> : failed ? <p>The sample report is not available right now.</p> : <div className="skeleton" style={{ height: 160 }} />}
          <Link to={`/stocks/${SAMPLE}`} className="hh-link">Read the full report <Icon name="arrow" /></Link>
        </figure>
      </div>
    </div></section>
  );
}

export function Home() {
  useDocTitle("Every listed Indian stock, scored and explained", "Financial statements, ratios, peers, ownership and filings for every listed Indian company, with a 0–100 FinLit IQ that shows its working. Start free.");
  const enquire = useEnquiry();
  const { user } = useAuth();
  const { data: s, isError: sErr } = useSummary(SAMPLE);
  const webgl = use3d();
  const { data: idx } = useSearchIndex(true);
  const counts = useMemo(() => idx ? { all: idx.rows.length, ready: idx.rows.filter((r) => r[3]).length } : null, [idx]);
  const mf = useQuery<{ total?: number }>({ queryKey: ["mf", "count"], queryFn: () => mfGet<{ total?: number }>("/api/mf?page=1&size=1"), staleTime: 3_600_000, retry: 1 });
  const schemes = typeof mf.data?.total === "number" ? mf.data.total : null;
  return (
    <div className="hh">
      <section className="tagline" aria-label="Our promise"><div className="wrap"><p><span>Quantify the market</span><span className="x" aria-hidden="true">×</span><span>Research deeper</span><span className="x" aria-hidden="true">×</span><span>Track what matters</span></p></div></section>

      <section className={"hh-hero" + (webgl ? " has3d" : "")}>
        {webgl && <Safe3D><Suspense fallback={null}><Hero3D /></Suspense></Safe3D>}
        <div className="wrap hh-hero-cols">
          <div>
            <div className="hh-kicker">Equity research · India</div>
            <h1>Every listed Indian stock, scored and explained.</h1>
            <p className="hh-lede">Financial statements, ratios, peers, ownership and filings for every listed company, with a 0–100 FinLit IQ that shows its working. Start free and add more when you need it.</p>
            <div className="cta-row">
              {user ? <Link className="btn primary lg" to="/dashboard">Open your dashboard <Icon name="arrow" /></Link> : <Link className="btn primary lg" to="/login?mode=signup">Create a free account <Icon name="arrow" /></Link>}
              <Link className="btn lg" to="/research">Explore stock research</Link>
            </div>
            <p className="hh-fine">Information only. Not investment advice.</p>
          </div>
          <ScoreCard s={s} tower={webgl} failed={sErr} />
        </div>
      </section>

      <Stats counts={counts} schemes={schemes} />
      <FeatureBucket />
      <ConnectAI />

      <section className="sec hh-sec" id="how"><div className="wrap">
        <Reveal className="hh-head"><div className="hh-kicker">How it works</div><h2>Four steps, no setup</h2></Reveal>
        <ol className="hh-steps">{STEPS.map(([t, d], i) => <li key={t}><ThemeImg name={STEP_IMG[i]} w={640} h={400} alt={STEP_ALT[i]} /><span className="hh-n">{i + 1}</span><div><h3>{t}</h3><p>{d}</p></div></li>)}</ol>
      </div></section>

      <Lenses />
      <Method s={s} failed={sErr} />

      <PlansBand id="pricing" compact />

      <section className="wrap" id="coming-soon" aria-labelledby="soonTitle"><Reveal><div className="soon">
        <div><div className="hh-kicker">Coming soon</div><h2 id="soonTitle">Be the first to know</h2>
          <p>Leave your email and we will write to you the day each of these goes live. We will not send anything else, and you can ask us to stop at any time.</p>
          <ul><li>Equity research reports</li><li>Newsletter</li></ul></div>
        <div><NotifyForm source="home" /><p className="fine">Equity research reports are subject to the required licence and approvals.</p></div>
      </div></Reveal></section>

      <section className="sec hh-sec"><div className="wrap"><div className="hh-end"><h2>Questions about FinLit?</h2><p>Tell us what you are trying to do, and we will point you to the tools and reports that fit.</p><div className="cta-row"><button className="btn primary lg" onClick={() => enquire()}>Get in touch</button></div></div></div></section>
    </div>
  );
}
