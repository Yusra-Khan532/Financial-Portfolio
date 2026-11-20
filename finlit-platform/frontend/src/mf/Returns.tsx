// The returns block of a scheme: three large figures (1 day, 1 year, 5 year per year), each with the dates behind it, or a dash and the reason.
import { Icon } from "../lib/icons";
import { dateIN } from "../lib/format";
import { Link } from "react-router";
import { GROWTH_RETURNS_LABEL, pctText, retTiles, tone, type FundDetail } from "../lib/mf";
import { GTerm } from "./Bits";

export function ReturnsBlock({ d }: { d: FundDetail }) {
  const tiles = retTiles(d);
  const asOf = d.navDate;
  return (
    <section className="card mf-card" aria-labelledby="mf-ret-h">
      <div className="card-h"><h3 id="mf-ret-h"><span className="ci"><Icon name="growth" /></span><GTerm id="trailing-return">Returns</GTerm></h3><span className="s">{asOf ? `NAV of ${dateIN(asOf)}` : ""}</span></div>
      <dl className="mf-ret3">
        {tiles.map((t) => (
          <div key={t.key} className={"mf-tile" + (t.value == null ? " none" : "")}>
            <dt>{t.label}</dt>
            <dd>
              {t.value == null ? <span className="mf-bigna" aria-label={`No figure. ${t.note}`}>—</span> : <span className={"mf-big " + tone(t.value)}>{pctText(t.value)}</span>}
              <small className={t.value == null ? "mf-why" : "muted"}>{t.note}</small>
            </dd>
          </div>))}
      </dl>
      {d.returnsNote && tiles.every((t) => t.value == null) && <p className="mf-note" role="note"><Icon name="info" /><span>{d.returnsNote}</span></p>}
      {d.optionClass !== "Growth" && d.growthReturns && (   // task #281: the same plan's Growth option, labelled; never shown as this option's own change
        <div className="mf-grblock" data-testid="growth-returns">
          <h4 className="mf-h4">{GROWTH_RETURNS_LABEL}</h4>
          <dl className="mf-ret3">
            {([["r1y", "1 year"], ["r3y", "3 years, per year"], ["r5y", "5 years, per year"]] as const).map(([k, label]) => (
              <div key={k} className={"mf-tile" + (d.growthReturns![k] == null ? " none" : "")}><dt>{label}</dt>
                <dd>{d.growthReturns![k] == null ? <span className="mf-bigna">—</span> : <span className={"mf-big " + tone(d.growthReturns![k]!)}>{pctText(d.growthReturns![k]!)}</span>}</dd></div>))}
          </dl>
          <p className="faint mf-fine">Of <Link to={`/funds/${d.growthReturns.code}`}>{d.growthReturns.name}</Link>, {d.plan} plan, Growth option{d.growthReturns.retDate ? `, NAV of ${dateIN(d.growthReturns.retDate)}` : ""}. This option's own NAV change is not shown: its payouts would make it wrong.</p>
        </div>)}
      {d.optionClass !== "Growth" && !d.growthReturns && d.growthReturnsWhy && <p className="mf-note" role="note"><Icon name="info" /><span>{d.growthReturnsWhy}</span></p>}
      <p className="faint mf-fine">
        1 day is the change of the latest NAV against the one before it (the date is named: a scheme can skip days). 1 year is the total change over one year.
        5 year is a <GTerm id="cagr-compound-annual-growth-rate">yearly rate (CAGR)</GTerm>, not the total over five years: (latest NAV ÷ start NAV) ^ (365 ÷ days between the two NAVs) − 1.
        The start NAV is the latest one on or before the start date. Figures ignore tax, exit load and SIP timing. Growth options only.
      </p>
    </section>
  );
}
