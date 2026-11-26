// Task #390 PR A (developer file 34, ETF portfolio, Top of the page): the dark "Your ETFs cost" card and the three coloured view cards become four calm cards
// with a crown each (EtfCards): What your ETFs cost (the big yearly cost, one small bar per ETF, five at most then "and N more in the table", what it comes
// to on ₹1 lakh and AMFI's date, an i that says what an expense ratio is), then Your ETFs ("5 ETFs" and the ETF furthest from its value), What's inside and
// Risk analytics ("Lower · moves 0.58×"), the open one saying "You are here", the others "Open →". One line says what is new since the last visit
// (EtfSince). The card styles are the MF page's (mf/pack/mf389.css, .px-*, scoped .mfp, which the ETF page's wrapper carries); the cost card's own rules are
// in styles/etfportfolio.css (.px-cost, .px-cb). Describes; never advice.
import { CROWN, sinceLine } from "../../mf/pack/MfTop";
import { Info } from "../../portfolio/shared";
import type { EtfCard, EtfTab } from "../../lib/etfTop";
import type { costCard } from "../../lib/etfKeyFigs";
import "../../mf/pack/mf389.css";

/** Above this many ETFs the cost card shows the first COST_BARS and "and N more in the table" (T2c). */
export const COST_BARS = 5;
type Cost = ReturnType<typeof costCard>;

/** The cost card's i: what an expense ratio is, and that it is taken from the ETF's value (T2b). Exported for tests. */
export const costTip = (c: Cost) => `An expense ratio is what an ETF charges a year to run, as a share of the money in it. It is taken from the ETF's value each day, not charged to you separately. This is each ETF's figure from AMFI's TER file${c.ter != null ? `, averaged across your ETFs: on ₹1 lakh, ${c.ter.toFixed(2)}% a year is about ₹${c.perLakh!.toLocaleString("en-IN")}` : ""}.`;

export function EtfCards({ cost, asOf, cards, colors, view, onView, weighted }: { cost: Cost; asOf: string; cards: EtfCard[]; colors: Record<EtfTab, string>; view: EtfTab; onView: (v: EtfTab) => void; weighted: boolean }) {
  const max = Math.max(1, ...cost.rows.map((r) => r.ter)), bars = cost.rows.length > COST_BARS ? cost.rows.slice(0, COST_BARS) : cost.rows, more = cost.rows.length - bars.length;
  return (
    <section className="px-strip" aria-label="What your ETFs cost and the three views">
      <div className="px-c px-sc px-cost">
        {CROWN}
        <div className="px-sb">
          <p className="px-k">What your ETFs cost<Info about="What your ETFs cost" text={costTip(cost)} how={weighted ? "Each ETF counts by the value of your quantity." : "Until quantities are added every ETF counts the same. A lower cost keeps more of the index's return."} /></p>
          <p className="px-v">{cost.ter == null ? "Not published yet" : `${cost.ter.toFixed(2)}% a year`}</p>
          {bars.length > 0 && <ul className="px-cb" aria-label={`Expense ratio a year: ${cost.rows.map((r) => `${r.symbol} ${r.ter.toFixed(2)}%`).join(", ")}`}>
            {bars.map((r) => <li key={r.symbol}><span>{r.symbol}</span><i aria-hidden="true"><b style={{ width: `${(r.ter / max) * 100}%` }} /></i><em>{r.ter.toFixed(2)}%</em></li>)}</ul>}
          {more > 0 && <p className="px-cbm">and {more} more in the table</p>}
          {cost.missing.map((m) => <p key={m.symbol} className="px-cbm">{m.symbol}: {m.why}</p>)}
          <p className="px-x">{cost.ter == null ? "No expense ratio is published for these ETFs in AMFI's file yet." : `About ₹${cost.perLakh!.toLocaleString("en-IN")} a year on ₹1 lakh.${asOf ? ` AMFI, ${asOf}.` : ""}`}</p>
        </div>
      </div>
      {cards.map((t) => { const on = t.id === view;
        return <button key={t.id} type="button" className={"px-c px-vw" + (on ? " on" : "")} style={{ ["--vc" as string]: colors[t.id] }} aria-pressed={on} onClick={() => onView(t.id)}
          aria-label={`${t.k}: ${t.v}. ${on ? "You are here" : "Open this view"}`}>
          {CROWN}
          <p className="px-k">{t.k}<em>{on ? "You are here" : "Open →"}</em></p>
          <p className="px-v">{t.v}</p>
          <p className="px-x">{t.sub}</p>
        </button>; })}
      {/* task #390 (developer file 39 v4, C4): the cost and the beta above count each ETF the same until every ETF has a quantity (basis "equal") */}
      {!weighted && <p className="etp-basis">Each ETF counts the same until all have a quantity.</p>}
    </section>);
}

/** "Since your last visit: nothing new at the companies inside your ETFs." / "Since your last visit on 20 Nov: 3 new filings at companies inside your
 *  ETFs." with See what changed → (T6). The button shows only when something is new. */
export function EtfSince({ visit, fresh, onSee }: { visit: string | null; fresh: number; onSee: () => void }) {
  const t = sinceLine(visit, fresh, "your ETFs");
  return <div className="px-since" role="note"><i className="px-dot" aria-hidden="true" /><span><b>{t.lead}</b> {t.rest}</span>
    {visit && fresh > 0 && <button type="button" onClick={onSee}>See what changed →</button>}</div>;
}
