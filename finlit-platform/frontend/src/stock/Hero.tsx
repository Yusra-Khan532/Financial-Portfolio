import { tradeTime } from "../lib/liveQuote";
import { AlertButton } from "../components/AlertComposer";
import { DropChev } from "../components/DropChev";
import { LEVELS, LEVEL_LABEL } from "../lib/taxonomy";
import { badgeView, marketCapLine, type Plan, type PrismInput } from "../lib/scoreBands";
import { priceBand, useTrading } from "../lib/trading";
import { Link } from "react-router";
import { Icon } from "../lib/icons";
import { MINUS, dateIN, fmtUnit, nf, signed } from "../lib/format";
import { useUI } from "../lib/ui";
import { ThemeChips } from "./DiscoverThemes";
import { Spark } from "../charts/Small";
import { PrismCompare } from "./PrismCompare";
import { ScoreMovesCard } from "./ScoreMoves";
import { Info } from "../components/Info";
import { LeadLine } from "./Leadership";
import { type Ratios, type Summary } from "../lib/api";
import { metric } from "./derive";
import { TradingFacts } from "./TradingFacts";
import { NameDots, PrismLock } from "./HeaderScore";
import { PLAN_FOR_WATCHLIST } from "../lib/planGates";
import { useReportHeader } from "./useReportHeader";
import { useClassification } from "../lib/taxonomy";
import { fmtScore, ratingWord } from "../lib/prismTechnical";
import { CoLogo } from "../components/CoLogo";

const KPI_SPEC: [key: string, label: string, icon: string, color: string][] = [
  ["market_cap", "Market cap", "cap", "--p-growth"], ["pe", "P/E", "tag", "--p-quality"], ["pb", "P/B", "id", "--p-quality"], ["ev_ebitda", "EV/EBITDA", "gauge", "--p-quality"],
  ["dividend_yield", "Div. yield", "coins", "--gold"], ["roe", "ROE", "percent", "--p-quality"], ["roce", "ROCE", "growth", "--p-profit"], ["debt_to_equity", "Debt/Equity", "balance", "--p-balance"],
];


/** Task #197: why a headline figure has no number. Debt/Equity and EV/EBITDA are not used for banks and lenders (their debt is their raw material, see
 *  backend snapshot.NOT_FOR_LENDERS); any other blank uses the reason the server gives with the ratios, else says the data provider sent none. */
const LENDER_NA = new Set(["debt_to_equity", "ev_ebitda"]);
export function blankWhy(key: string, label: string, lender: boolean | undefined, blanks?: Record<string, string>): { short: string; long: string } {
  if (lender && LENDER_NA.has(key)) return { short: "Not used for lenders", long: blanks?.[key] ?? `${label} is not shown for banks and lenders: their debt is their raw material.` };
  if (blanks?.[key]) return { short: "Not available", long: blanks[key] };
  return { short: "Not reported", long: `${label}: the data provider sent no figure for this company.` };
}

export function Hero({ s, ratios, jump }: { s: Summary; ratios?: Ratios; jump: (id: string) => void }) {
  const { toast } = useUI();
  const { seesAll, effPlan, prismIn, watch, toggleWatch, has } = useReportHeader(s);
  const q = s.quote, p = s.profile, good = (q.change ?? 0) >= 0, cov = s.dataQuality.coverage;
  const asOf = q.asOf ? new Date(q.asOf) : null;
  const macro = useClassification(p.symbol).data?.macro_sector ?? null;   // NSE's macro sector (task #192), not the provider's mixed field

  return (
    <section className="band hero" id="hero" aria-label={`${p.name} research report`}>
      <div className="wrap">
        <div className="crumbs"><Link to="/research">Research</Link><span>›</span>{macro && <><span title="Macro sector (NSE)">{macro}</span><span>›</span></>}<span style={{ color: "var(--text)" }}>{p.nse || p.symbol}</span></div>
        {/* Task #216 (README 2.1, header option D): four rows. 1: logo, name, the dots, price with the day's change, four buttons with a label under each
            icon (no Download). 2: Rating · Against peers · Market cap · Listed as. 3: NSE's four levels, Macro sector › Sector › Industry › Basic industry.
            4: "Trading details" drop-down (price band, F&O, margin trading); an exchange-surveillance note stays visible above it. */}
        <div className="hx hx-d">
          <div className="hxd-top">
            <span className="hx-logo"><span className="badge"><CoLogo symbol={p.symbol} name={p.name} size={64} /></span></span>
            <div className="hxd-n"><h1 className="hx-name ui-title">{p.name}</h1><div className="hx-dots"><NameDots plan={effPlan} admin={seesAll} prism={prismIn} /></div></div>
            <div className="hxd-px">
              <span className="hx-price"><span className="hx-rs">₹</span>{q.price == null ? MINUS : nf(q.price)}</span>
              {q.change != null && <span className={"chip " + (good ? "up" : "down")}>{(q.change > 0 ? "+" : q.change < 0 ? MINUS : "") + nf(Math.abs(q.change))} · {signed(q.changePct)}</span>}
              {q.price != null && tradeTime(q.asOf) && <span className="hx-asof" title="Time of the last trade in this price (NSE). It updates every 30 seconds while the market is open.">Last trade {tradeTime(q.asOf)}</span>}
              {q.price == null && cov && cov.reasons.length > 0 && <span className="cov-note" role="note">No price shown: {cov.reasons[0]}.</span>}
            </div>
            <span className="hx-acts icons"><div className="actions">
              <AlertButton symbol={s.profile.symbol} className="ui-btn ui-btn--secondary ui-btn--sm" label="Set alert" />
              <button className="ui-btn ui-btn--secondary ui-btn--sm" aria-pressed={watch} aria-label={watch ? "Watching" : "Watchlist"} onClick={toggleWatch}><Icon name="spark" /><span>{watch ? "Watching" : "Watchlist"}</span>{!has(PLAN_FOR_WATCHLIST) && <Icon name="lock" className="lk" />}</button>
              <Link className="ui-btn ui-btn--secondary ui-btn--sm" to={`/dcf?sym=${encodeURIComponent(s.profile.symbol)}&load=1`} title="Value this company with the DCF calculator (Gold)"><Icon name="rupee" /><span>Value (DCF)</span>{!has("gold") && <Icon name="lock" className="lk" />}</Link>
              <button className="ui-btn ui-btn--secondary ui-btn--sm" aria-label="Copy link to this report" onClick={() => { navigator.clipboard?.writeText(location.href.split("#")[0]).then(() => toast("Link to this report copied."), () => toast(location.href)); }}><Icon name="arrow" /><span>Share</span></button>
            </div></span>
          </div>
          <div className="hxd-strip">
            <div className="hx-rate"><span className="hx-k">Fundamental rating</span><RatingCell s={s} effPlan={effPlan} seesAll={seesAll} prismIn={prismIn} /><TechRows effPlan={effPlan} seesAll={seesAll} prismIn={prismIn} /></div>
            <div className="hxpeer"><span className="hx-k">Against peers</span><LeadLine symbol={p.symbol} jump={jump} /></div>
            <div><span className="hx-k">Market cap</span><b>{p.marketCapCr != null ? marketCapLine(p.marketCapCr)?.replace(/^Market cap /, "") : "Not reported"}</b></div>
            <div><span className="hx-k">Listed as</span><div className="tags"><span className="tag tk">{p.nse || p.symbol}</span><span className="tag">NSE</span>{p.bse && <span className="tag mono">BSE {p.bse}</span>}</div></div>
          </div>
          <ClassPath symbol={p.symbol} fallback={p.industry} />
          <ThemeChips symbol={p.symbol} name={p.name} jump={jump} />{/* task #271 (report pack 20 Nov, change 20a): Discover's themes for this company */}
          <TradingFacts s={s} part="warn" />
          <details className="hxd-more xdd"><summary>Trading details · {asOf && !Number.isNaN(+asOf) ? `NSE · ${dateIN(asOf.toISOString(), { day: "numeric", month: "short" })}, ${asOf.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST` : "NSE"}<DropChev /></summary>
            <TradingList s={s} /></details>
        </div>

        {/* Task #283: FinLit Prism is FinLit's only company score. Every plan sees the Prism card full width: the rating on a plan with Prism (and on the
            open example company), a locked Prism teaser on others. */}
        <div className="pz-pair dk-pair">
        <PrismCompare symbol={s.profile.symbol} name={p.name} statement={s.meta.statement} />
        </div>
        {/* task #216: "How the scores have moved" sits under the Prism card (it was in live section 17, which is removed) */}
        <ScoreMovesCard symbol={s.meta.symbol} statement={s.meta.statement} />

        <div className="kpis">
          {KPI_SPEC.map(([key, label, icon, color]) => {
            const m = metric(s, key), e = ratios?.latest[key], val = key === "market_cap" ? (s.profile.marketCapCr ?? m?.value ?? e?.value) : (m?.value ?? e?.value), unit = m?.unit ?? e?.unit, period = m?.period ?? e?.period;
            const why = val == null ? blankWhy(key, label, s.dataQuality.isBank, ratios?.blanks) : null;   // task #197: a blank tile says why
            return (
              <div className="kpi" key={key} style={{ "--kc": `var(${color})` } as React.CSSProperties} title={why?.long}>
                <div className="kl"><Icon name={icon} /><span className="kl-t">{label.split("/").map((x, i) => <span key={i}>{i > 0 && <>/<wbr /></>}{x}</span>)}</span> <Info g={ratios?.glossary[key]} /></div>
                <div className="v">{key === "market_cap" && val != null ? <>₹{val >= 100000 ? nf(val / 100000) : nf(val, 0)}<span className="unit">{val >= 100000 ? "L Cr" : "Cr"}</span></> : fmtUnit(val, unit)}</div>
                {why ? <div className="s kpi-why">{why.short}<span className="sr-only">. {why.long}</span></div>
                  : <div className="s">{period === "latest" ? "Latest" : period || ""}{key === "roe" && val != null ? " · reported, year-end equity" : ""}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Row 2's Rating cell: FinLit Prism as "58.5 /100 Average" for a plan with Prism; a locked Prism chip ("FinLit Prism · see plans") for others. */
export function RatingCell({ s, effPlan, seesAll, prismIn }: { s: Summary; effPlan: Plan; seesAll: boolean; prismIn: PrismInput }) {
  const v = badgeView(effPlan, seesAll, prismIn);
  if (v.kind === "locked") return <PrismLock />;
  if (v.kind === "none") return <span className="hx-lock" aria-busy={prismIn.kind === "loading"}>{prismIn.kind === "loading" ? "Reading the rating…" : "—"}</span>;   // while the rating loads, or when the server hides it
  if (v.kind === "prism-none") return <span className="hx-lock">FinLit Prism: not rated yet · <Link to={`/prism/${encodeURIComponent(s.profile.symbol)}`}>About Prism</Link></span>;
  const n = v.score.toFixed(1);
  return (
    <span className={"hx-prism band-" + v.band} role="group" aria-label={`FinLit Prism ${n} out of 100: ${v.word}`}>
      <span className="hpz-n">{n}</span><span className="hpz-of">/100</span>{v.word && <span className="hpz-w">{v.word}{v.provisional ? " · provisional" : ""}</span>}
      <span className="hpz-m">FinLit Prism</span>
    </span>
  );
}

/** Task #222 (the owner, 18 Nov: "add both technical score where the prism score is at the top"; 19 Nov pack A): under the FinLit Prism score, a dashed line,
 *  "Technical", and the short and long term views, each with the same figure, arrow, word and band colour as the Prism card's technical side (the same
 *  data and helpers, never worked out again). Each row links to the Prism card. Shown only where the Prism card's technical side is shown. */
const TECH_ROW_TONE: Record<string, "pos" | "neg" | "mid"> = { strongpos: "pos", pos: "pos", neutral: "mid", neg: "neg", strongneg: "neg" };
const TECH_ROW_SHAPE: Record<string, string> = { strongpos: "▲▲", pos: "▲", neutral: "◆", neg: "▼", strongneg: "▼▼" };
const TECH_ROW_INK: Record<string, string> = { pos: "var(--band-hi-ink)", neg: "var(--band-lo-ink)", mid: "var(--band-mid-ink)" };
export function TechRows({ effPlan, seesAll, prismIn }: { effPlan: Plan; seesAll: boolean; prismIn: PrismInput }) {
  const v = badgeView(effPlan, seesAll, prismIn);
  if (v.kind !== "prism" || prismIn.kind !== "report") return null;
  const rows = ([["Short term", "5–20 sessions", prismIn.short], ["Long term", "6–18 months", prismIn.long]] as const)
    .map(([k, span, t]) => ({ k, span, t, w: t ? ratingWord(t.rating, t.score) : null }))
    .filter((r) => r.t && r.t.score != null && r.w && r.w.tone !== "na");
  if (!rows.length) return null;
  return (
    <div className="hx-tech"><span className="hx-k">Technical</span>
      <div className="hxt-l" role="list" aria-label="Technical scores">{rows.map(({ k, span, t, w }) => {
        const tone = TECH_ROW_TONE[w!.tone] ?? "mid", score = fmtScore(t!.score);
        return <a key={k} role="listitem" className={"hxt " + tone} href="#prism" aria-label={`Technical ${k.toLowerCase()} ${score}, ${w!.word}`}
          title={`Technical ${k.toLowerCase()}, ${span}. Shown separately; not part of the FinLit Prism score.`}>
          <b>{score}</b><span className="hxt-k">{k}</span><span className="hxt-w" style={{ "--tc": TECH_ROW_INK[tone] } as React.CSSProperties}><i aria-hidden="true">{TECH_ROW_SHAPE[w!.tone]}</i>{w!.word}</span></a>;
      })}</div>
    </div>
  );
}

/** Row 3: NSE's four levels as chips with arrows; the basic industry is filled. A blank level says why; a company not placed yet shows the industry only. */
export function ClassPath({ symbol, fallback }: { symbol: string; fallback?: string | null }) {
  const c = useClassification(symbol).data;
  if (c === undefined) return <div className="hx-cls" aria-busy="true" />;
  if (!c || !c.source) return <div className="hx-cls"><span className="hc-s s3"><span>Industry</span><b>{fallback?.trim() || "Not classified"}</b></span>{c?.note && <span className="hc-why">{c.note.replace(/^Not classified: /, "")}</span>}</div>;
  return (
    <nav className="hx-cls" aria-label="NSE classification">
      {LEVELS.map((l, i) => (
        <span key={l} className="hc-w">{i > 0 && <i className="hc-a" aria-hidden="true">›</i>}
          <span className={"hc-s s" + (i + 1)} title={c[l] ? undefined : c.note ?? undefined}><span>{LEVEL_LABEL[l]}</span><b>{c[l] ?? "Not shown"}</b></span></span>))}
      {c.note && LEVELS.some((l) => !c[l]) && <span className="hc-why">{c.note}</span>}
    </nav>
  );
}

/** Row 4's drop-down body: the trading facts (price band, F&O, margin trading); says so when there are none. */
function TradingList({ s }: { s: Summary }) {
  const t = useTrading(s.profile.symbol).data;
  return priceBand(s.quote) || t?.fno || t?.mtf ? <TradingFacts s={s} part="list" /> : <p className="hxd-none">No price band, F&amp;O or margin-trading facts on file for this company.</p>;
}

void Spark;
