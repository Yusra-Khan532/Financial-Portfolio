// The landing page's FinLit Prism part as the team drew it (task #122, 14 Nov 2026): a deep green band with the FINLIT PRISM pill, the line "Beyond Ratios.
// A Statistical Model for Deeper Financial Analysis." and three feature items, then the Prism card larger than before: Fundamental analysis, Technical
// analysis and the Overall Financial Health strip. Hovering (or focusing) a feature item lights it and its block of the card in gold, and the other way round.
// The card shows Reliance Industries' real reading of 6 Nov 2026 (the same one the page showed as a picture), dated and marked as an example.
// Styles: styles/prism-showcase.css (hpz-), on the landing page's --hh- tokens. Describes, never advises.
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "../lib/icons";
import { PRISM_SAMPLE as S, partTone, techPos, type PartTone } from "../lib/prismShowcase";
import "../styles/prism-showcase.css";

type Key = "fund" | "tech" | "overall";
const FEATURES: { k: Key; icon: ReactNode; title: string; text: [string, string] }[] = [
  { k: "fund", icon: <path d="M5 19V11M10 19V7M15 19v-5M20 19V4" />, title: "4 Fundamental Areas", text: ["Growth, Valuation,", "Quality, Risk"] },
  { k: "tech", icon: <path d="M4 17l5-5 4 3 7-8M15 7h5v5" />, title: "2 Technical Views", text: ["Short term (5–20) &", "Long term (6–18 months)"] },
  { k: "overall", icon: <><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></>, title: "One Health Score", text: ["A consolidated view", "of overall strength"] },
];
const glyph = (d: ReactNode) => <svg className="hpz-glyph" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;

/** The score ring of the Fundamental block: the share of 100 drawn in the part's colour. */
function Ring({ v, size, stroke, tone }: { v: number; size: number; stroke: number; tone: PartTone }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <svg className={"hpz-ring " + tone} viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="hpz-ring-bg" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} className="hpz-ring-fg" strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

export function PrismShowcase() {
  const [lit, setLit] = useState<Key | null>(null);
  const on = (k: Key) => ({ onMouseEnter: () => setLit(k), onMouseLeave: () => setLit(null), onFocus: () => setLit(k), onBlur: () => setLit(null) });
  const cls = (k: Key, base: string) => base + (lit === k ? " lit" : "");
  return (
    <section className="hpz" id="prism" aria-labelledby="hpz-title"><div className="wrap">
      <div className="hpz-top">
        <div className="hpz-title">
          <p className="hpz-pill">FinLit Prism</p>
          <h2 id="hpz-title">Beyond Ratios. A Statistical Model for Deeper Financial Analysis.</h2>
        </div>
        <ul className="hpz-feats" aria-label="What FinLit Prism reads">
          {FEATURES.map((f) => (
            <li key={f.k} className={cls(f.k, "hpz-feat")} tabIndex={0} {...on(f.k)} aria-describedby={`hpz-b-${f.k}`}>
              <span className="hpz-fi">{glyph(f.icon)}</span><b>{f.title}</b><span>{f.text[0]} <br />{f.text[1]}</span>
            </li>))}
        </ul>
      </div>

      <figure className="hpz-fig">
        <div className="hpz-card">
          <div className="hpz-grid">
            <section className={cls("fund", "hpz-blk hpz-fund")} id="hpz-b-fund" aria-label="Fundamental analysis" {...on("fund")}>
              <header className="hpz-bh">
                <span className="hpz-bi gold" aria-hidden="true">{glyph(<><circle cx="12" cy="12" r="8" /><path d="M14.5 9.5c-.5-.9-1.5-1.3-2.5-1.3-1.4 0-2.5.8-2.5 1.9 0 2.7 5 1.4 5 4 0 1.1-1.1 1.9-2.5 1.9-1.1 0-2.1-.5-2.6-1.4M12 6.8v1.4M12 15.8v1.4" /></>)}</span>
                <div><h3>Fundamental analysis</h3><p>Evaluates business and financial strength across four areas.</p></div>
                <span className="hpz-sample">Sample Reading</span>
              </header>
              <div className="hpz-fbody">
                <div className="hpz-score">
                  <div className="hpz-score-ring"><Ring v={S.score} size={168} stroke={14} tone={partTone(S.word)} />
                    <div className="hpz-score-in"><b>{S.score.toFixed(1)}</b><span>/ 100</span><em className={"hpz-chip " + partTone(S.word)}>{S.word}</em></div></div>
                  <p>Cumulative fundamental score</p>
                </div>
                <ul className="hpz-parts" aria-label="The four parts">
                  {S.parts.map((p) => {
                    const t = partTone(p.word);
                    return (
                      <li key={p.name} className={"hpz-part " + t}>
                        <div className="hpz-ph"><Ring v={p.v} size={30} stroke={4} tone={t} /><div><b>{p.name}</b><em className={"hpz-chip " + t}>{p.word}</em></div></div>
                        <span className="hpz-slide" role="img" aria-label={`${p.name} ${p.v} of 100, ${p.word.toLowerCase()}`}><i style={{ width: `${p.v}%` }} /><s style={{ left: `${p.v}%` }} /></span>
                      </li>);
                  })}
                </ul>
              </div>
            </section>
            <section className={cls("tech", "hpz-blk hpz-tech")} id="hpz-b-tech" aria-label="Technical analysis" {...on("tech")}>
              <header className="hpz-bh">
                <span className="hpz-bi blue" aria-hidden="true">{glyph(<path d="M4 18l5-6 4 3 7-9" />)}</span>
                <div><h3>Technical analysis</h3><p>Assesses price trend and momentum using technical indicators.</p></div>
              </header>
              {S.tech.map((t) => (
                <div key={t.name} className="hpz-trow">
                  <div className="hpz-th"><div><b>{t.name}</b><small>{t.span}</small></div>
                    <span className={"hpz-tv " + (t.v >= 0 ? "up" : "dn")}>{t.v > 0 ? "+" : "−"}{Math.abs(t.v)}</span><span className={"hpz-tw " + (t.v >= 0 ? "up" : "dn")}>{t.v >= 0 ? "▲" : "▼"} {t.word}</span></div>
                  <span className="hpz-tbar" role="img" aria-label={`${t.name}: ${t.v > 0 ? "+" : ""}${t.v} on a scale from −100, strong downtrend, to +100, strong uptrend: ${t.word.toLowerCase()}`}><s style={{ left: `${techPos(t.v)}%` }} /></span>
                </div>))}
            </section>
          </div>
          <section className={cls("overall", "hpz-blk hpz-overall")} id="hpz-b-overall" aria-label="Overall financial health" {...on("overall")}>
            <span className="hpz-bi green" aria-hidden="true">{glyph(<><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></>)}</span>
            <div><h3>Overall Financial Health</h3><p>Combines fundamental and technical views for a unified read on strength and momentum.</p></div>
            <span className="hpz-total"><b>{S.score.toFixed(1)}</b><span>/ 100</span><em className={"hpz-chip " + partTone(S.word)}>{S.word}</em></span>
          </section>
        </div>
        <figcaption>{S.caption}</figcaption>
      </figure>
      <div className="hpz-cta"><Link className="btn lg" to="/prism">Open FinLit Prism <Icon name="arrow" /></Link></div>
    </div></section>
  );
}
