// The landing page's Mutual Fund Score part (task #239, 19 Nov 2026), under the FinLit Prism part and built the same way: the band, a pill, one line, and
// four buttons, one per part of the score (Performance, Risk, Cost, Quality). Hovering or focusing a button lights it and its part on the card in gold,
// and the other way round, as the Prism part does for Fundamental and Technical. The card is the team's picture: the score ring, a one-line reading,
// and the four parts with their figure, word and bar, for the sample fund's real score (lib/mfShowcase.ts), named and dated. Marked as an example,
// not a recommendation. Styles: styles/prism-showcase.css (hpz-, shared) and styles/mf-showcase.css (hmf-). Describes, never advises.
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "../lib/icons";
import { PILLAR_HELP } from "../lib/mfScore";
import { useMfShowcase, type MfPartKey } from "../lib/mfShowcase";
import type { PartTone } from "../lib/prismShowcase";
import "../styles/prism-showcase.css";
import "../styles/mf-showcase.css";

export const MF_FEATURES: { k: MfPartKey; icon: ReactNode; title: string; text: string }[] = [
  { k: "performance", icon: <path d="M4 17l5-5 4 3 7-8M15 7h5v5" />, title: "Performance", text: "Against similar funds, over time" },
  { k: "risk", icon: <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" />, title: "Risk", text: "How bumpy the ride, how deep the falls" },
  { k: "cost", icon: <><circle cx="12" cy="12" r="8" /><path d="M9 9h6M9 12h6M11 9c2.5 0 2.5 3 0 3l3 4" /></>, title: "Cost", text: "What is paid away, and the cost to leave" },
  { k: "quality", icon: <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9L12 3z" />, title: "Quality", text: "Proven, big enough, soundly built" },
];
const glyph = (d: ReactNode) => <svg className="hpz-glyph" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;

function Ring({ v, size, stroke, tone }: { v: number; size: number; stroke: number; tone: PartTone }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <svg className={"hpz-ring " + tone} viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="hpz-ring-bg" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} className="hpz-ring-fg" strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${(Math.max(0, Math.min(100, v)) / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

const WAIT: Record<string, string> = {
  loading: "Reading the sample fund's score…",
  none: "The sample fund has no rated score stored right now, so the card is empty. Every fund's score is on its own page.",
  error: "The sample fund's score cannot be read right now. Every fund's score is on its own page.",
};

export function MfScoreShowcase() {
  const { view: S, state } = useMfShowcase();
  const [lit, setLit] = useState<MfPartKey | null>(null);
  const on = (k: MfPartKey) => ({ onMouseEnter: () => setLit(k), onMouseLeave: () => setLit(null), onFocus: () => setLit(k), onBlur: () => setLit(null) });
  const cls = (k: MfPartKey, base: string) => base + (lit === k ? " lit" : "");
  return (
    <section className="hpz hmf" id="mf-score" aria-labelledby="hmf-title"><div className="wrap">
      <div className="hpz-top">
        <div className="hpz-title">
          <p className="hpz-pill">Mutual Fund Score</p>
          <h2 id="hmf-title">Beyond Returns. One Score for Deeper Mutual Fund Analysis.</h2>
        </div>
        <ul className="hpz-feats hmf-feats" aria-label="The four parts of the Mutual Fund Score">
          {MF_FEATURES.map((f) => (
            <li key={f.k} className={cls(f.k, "hpz-feat")} tabIndex={0} {...on(f.k)} aria-describedby={S ? `hmf-p-${f.k}` : undefined} title={PILLAR_HELP[f.k]}>
              <span className="hpz-fi">{glyph(f.icon)}</span><b>{f.title}</b><span>{f.text}</span>
            </li>))}
        </ul>
      </div>

      <figure className="hpz-fig">
        <div className="hpz-card">
          <section className="hpz-blk hmf-blk" aria-label="Mutual Fund Score">
            <header className="hpz-bh">
              <span className="hpz-bi gold" aria-hidden="true">{glyph(<><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></>)}</span>
              <div><h3>Mutual Fund Score</h3><p>{S ? S.fund : "A 0–100 score from a fund's past NAVs, costs and holdings."}</p></div>
              {S?.tag ? <span className="hpz-sample" title={`${S.fund}, Mutual Fund Score of ${S.date}`}>{S.tag}</span> : null}
            </header>
            {S ? <>
              <p className="hmf-line">{S.line}</p>
              <div className="hpz-fbody">
                <div className="hpz-score">
                  <div className="hpz-score-ring"><Ring v={S.score} size={168} stroke={14} tone={S.tone} />
                    <div className="hpz-score-in"><b>{S.scoreText}</b><span>/ 100</span><em className={"hpz-chip " + S.tone}>{S.label}</em></div></div>
                  <p>Cumulative fund score</p>
                </div>
                <ul className="hpz-parts" aria-label="The four parts">
                  {S.parts.map((p) => (
                    <li key={p.key} id={`hmf-p-${p.key}`} className={cls(p.key, "hpz-part " + p.tone)} {...on(p.key)}>
                      <div className="hpz-ph"><Ring v={p.v} size={30} stroke={4} tone={p.tone} /><div><b>{p.name}</b><em className={"hpz-chip " + p.tone}>{p.word}</em></div>
                        <strong className={"hpz-pv " + p.tone} aria-label={`${p.v.toFixed(1)} of 100`}>{p.v.toFixed(1)}</strong></div>
                      <span className="hpz-slide" role="img" aria-label={`${p.name} ${p.v.toFixed(1)} of 100, ${p.word.toLowerCase()}`}><i style={{ width: `${p.v}%` }} /><s style={{ left: `${p.v}%` }} /></span>
                    </li>))}
                </ul>
              </div>
            </> : <p className={"hmf-wait " + state} role="status">{WAIT[state]}</p>}
          </section>
        </div>
        {S ? <figcaption>{S.caption}</figcaption> : null}
      </figure>
      <div className="hpz-cta"><Link className="btn lg" to={S ? `/funds/${S.code}#fd-score` : "/fund-score-screener"}>Open Mutual Fund Score <Icon name="arrow" /></Link></div>
    </div></section>
  );
}
