// "What it invests in": donut of the major holdings, concentration, industry (NSE's, task #192) and asset split, month-on-month change, and every small holding in a table.
// Shared by mutual funds and ETFs. Takes the portfolio JSON of finlit.disclosure.get_portfolio (or its { unavailable } reason). Numbers are shown exactly as published.
import { CoLogo } from "../components/CoLogo";
import { useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { dateIN, nf } from "../lib/format";
import { arcPath, assetRows, classifyChanges, groupHoldings, SMALL_BELOW_PCT, industryRows, sliceFractions, sliceList, sortHoldings, topNPct, type ChangeKind, type SortDir } from "./logic";
import { isPortfolio, type Holding, type PortfolioResult } from "./types";
import "./holdings.css";
import { ChartZoom } from "../components/ChartZoom";

const pct = (v: number | null | undefined, d = 2) => (v == null ? "—" : nf(v, d) + "%");
const pp = (v: number | null | undefined) => (v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + nf(Math.abs(v), 2) + " pp");
const KIND_TEXT: Record<ChangeKind, string> = { new: "New", exited: "Exited", increased: "Increased", decreased: "Decreased", unchanged: "Unchanged" };
const PATTERNS = ["", "stripe", "dots", "cross"] as const;

/** NSE's industry of a line; "Not classified" and "Listed abroad" carry their reason on hover, and the fund house's own name when it differs. */
function IndustryText({ h }: { h: Pick<Holding, "industry" | "industryNote" | "amfiIndustry"> }) {
  if (!h.industry) return <>—</>;
  const own = h.amfiIndustry && h.amfiIndustry.trim().toLowerCase() !== h.industry.toLowerCase() ? `The fund house calls it "${h.amfiIndustry.trim()}".` : "";
  const why = [h.industryNote, own].filter(Boolean).join(" ");
  return why ? <span className="hd-why" title={why}>{h.industry}</span> : <>{h.industry}</>;
}

function NameCell({ h }: { h: { name: string; stockSymbol?: string | null } }) {
  return h.stockSymbol ? <Link to={`/stocks/${encodeURIComponent(h.stockSymbol)}`} title={`Open ${h.stockSymbol} on FinLit`}><CoLogo symbol={h.stockSymbol} name={h.name} size={20} inline />{h.name}</Link> : <>{h.name}</>;
}

function Donut({ slices }: { slices: ReturnType<typeof sliceList> }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [active, setActive] = useState<number | null>(null);
  const fr = sliceFractions(slices.map((s) => s.pct));
  const cur = active == null ? null : slices[active];
  const fillOf = (i: number, other: boolean) => (other ? "var(--hd-other)" : `var(--hd-${i % 8})`);
  return (
    <div className="hd-donut">
      <svg viewBox="0 0 220 220" role="group" aria-label="Share of each major holding in the portfolio. Use Tab to move between slices.">
        <defs>
          {PATTERNS.slice(1).map((p) => (
            <pattern key={p} id={`${uid}-${p}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              {p === "stripe" && <rect width="3" height="8" fill="var(--hd-ink)" opacity=".5" />}
              {p === "dots" && <circle cx="4" cy="4" r="1.6" fill="var(--hd-ink)" opacity=".55" />}
              {p === "cross" && <><rect width="2" height="8" fill="var(--hd-ink)" opacity=".5" /><rect width="8" height="2" fill="var(--hd-ink)" opacity=".5" /></>}
            </pattern>))}
        </defs>
        {slices.map((s, i) => {
          const d = arcPath(110, 110, 100, 58, fr[i][0], fr[i][1]);
          const pat = s.other ? "stripe" : PATTERNS[Math.floor(i / 8) % 4];
          return (
            <g key={s.key} tabIndex={0} role="img" className={"hd-slice" + (active === i ? " on" : "")}
              aria-label={`${s.label}, ${nf(s.pct, 2)} percent${s.industry ? `, ${s.industry}` : ""}`}
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive((a) => (a === i ? null : a))} onFocus={() => setActive(i)} onBlur={() => setActive((a) => (a === i ? null : a))}>
              <path d={d} fill={fillOf(i, s.other)} />
              {pat && <path d={d} fill={`url(#${uid}-${pat})`} />}
              <path d={d} fill="none" className="hd-edge" />
            </g>);
        })}
        <text x="110" y="104" textAnchor="middle" className="hd-ct1">{cur ? nf(cur.pct, 2) + "%" : slices.length}</text>
        <text x="110" y="124" textAnchor="middle" className="hd-ct2">{cur ? "of the portfolio" : slices.length === 1 ? "slice" : "slices"}</text>
      </svg>
      <div className="hd-tip" role="status" aria-live="polite">
        {cur ? <><b>{cur.label}</b><span>{nf(cur.pct, 2)}%{cur.industry ? ` · ${cur.industry}` : ""}</span></> : <span className="hd-hint">Hover or focus a slice for its name, share and industry.</span>}
      </div>
    </div>
  );
}

function SmallTable({ rows, label }: { rows: Holding[]; label?: string }) {
  const [key, setKey] = useState<"name" | "industry" | "pct" | "qty" | "valueLakh">("pct");
  const [dir, setDir] = useState<SortDir>("desc");
  const sorted = useMemo(() => sortHoldings(rows, key, dir), [rows, key, dir]);
  const head = (k: typeof key, label: string, num = false) => (
    <th scope="col" className={num ? "num" : ""} aria-sort={key === k ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="hd-sort" onClick={() => { if (key === k) setDir(dir === "asc" ? "desc" : "asc"); else { setKey(k); setDir(k === "name" || k === "industry" ? "asc" : "desc"); } }}>
        {label}{key === k && <i aria-hidden="true">{dir === "asc" ? "▲" : "▼"}</i>}
      </button>
    </th>);
  return (
    <div className="hd-scroll" tabIndex={0} role="region" aria-label={label ?? `All ${rows.length} holdings below ${SMALL_BELOW_PCT} percent`}>
      <table className="hd-table">
        <caption className="sr-only">Every holding below {SMALL_BELOW_PCT}% of the portfolio. Use the column buttons to sort.</caption>
        <thead><tr>{head("name", "Holding")}{head("industry", "Industry")}{head("pct", "Share", true)}{head("qty", "Quantity", true)}{head("valueLakh", "Value (₹ lakh)", true)}</tr></thead>
        <tbody>{sorted.map((h, i) => (
          <tr key={`${h.isin || h.name}-${i}`}><th scope="row"><NameCell h={h} /></th><td><IndustryText h={h} /></td><td className="num">{pct(h.pct)}</td>
            <td className="num">{h.qty == null ? "—" : nf(h.qty, 0)}</td><td className="num">{h.valueLakh == null ? "—" : nf(h.valueLakh, 2)}</td></tr>))}</tbody>
      </table>
    </div>
  );
}

/** The 10 largest holdings as bars (the ETF page, task #134: the donut becomes bars), longest first, scaled to the largest. */
function TopBars({ rows }: { rows: Holding[] }) {
  const top = [...rows].filter((h) => h.pct != null).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)).slice(0, 10);
  const max = Math.max(1e-9, ...top.map((h) => h.pct ?? 0));
  return (
    <div className="hd-topbars">
      <h4 className="hd-h4">10 largest holdings</h4>
      <ol className="hd-bars hd-top10" aria-label="The 10 largest holdings">{top.map((h, i) => (
        <li key={`${h.isin || h.name}-${i}`}><span className="hd-bl"><NameCell h={h} />{h.industry && <small><IndustryText h={h} /></small>}</span>
          <span className="hd-bt" aria-hidden="true"><i style={{ width: `${((h.pct ?? 0) / max) * 100}%` }} /></span><b>{pct(h.pct)}</b></li>))}</ol>
    </div>);
}

/** `layout`: "donut" or "bars" (the ETF page, task #134; the mutual fund page, task #132). `firstChanges`: open the change table on this many of the biggest moves,
 *  the rest behind a button (ETF page). `fundPage` (task #132, the mutual fund pack): the 10 largest beside the industries (10 first, all one click away), every
 *  holding and those below 1% behind one button, and the change table opened by four counts (New, Exited, Increased, Decreased) that filter it. */
export function HoldingsSection({ portfolio, title = "What it invests in", unit = "fund", layout = "donut", firstChanges, fundPage = false }: { portfolio: PortfolioResult | null | undefined; title?: string; unit?: string; layout?: "donut" | "bars"; firstChanges?: number; fundPage?: boolean }) {
  const p = isPortfolio(portfolio) ? portfolio : null;
  const g = useMemo(() => (p ? groupHoldings(p.holdings) : null), [p]);
  const slices = useMemo(() => (g ? sliceList(g) : []), [g]);
  const changes = useMemo(() => (p ? classifyChanges(p) : null), [p]);
  const industries = useMemo(() => (p ? industryRows(p) : []), [p]);
  const [showAll, setShowAll] = useState(false);
  const [allChanges, setAllChanges] = useState(false), [allHoldings, setAllHoldings] = useState(false);
  const [kind, setKind] = useState<ChangeKind | null>(null), [allIndustries, setAllIndustries] = useState(false);   // fundPage: the count that filters the change table; every industry

  if (!p || !g) {
    return (
      <section className="card hd" aria-labelledby="hd-h">
        <h3 id="hd-h">{title}</h3>
        <p className="hd-none"><span className="hd-dash" aria-hidden="true">—</span> {portfolio && "unavailable" in portfolio ? portfolio.unavailable : "The portfolio of this " + unit + " is not loaded."}</p>
      </section>);
  }
  const top10 = p.summary.top10Pct ?? topNPct(p.holdings, 10);
  const count = p.summary.count || p.holdings.length;
  const maxIndustry = Math.max(1, ...industries.map((s) => s.pct));
  const moved = (changes || []).filter((c) => c.kind !== "unchanged");
  const COUNT_KINDS = ["new", "exited", "increased", "decreased"] as const;
  const countOf = (k: ChangeKind) => moved.filter((c) => c.kind === k).length;
  const listed = fundPage ? (kind ? moved.filter((c) => c.kind === kind) : moved) : showAll ? changes || [] : moved;
  const INDUSTRIES_FIRST = 10, industryList = fundPage && !allIndustries ? industries.slice(0, INDUSTRIES_FIRST) : industries;
  const byMove = firstChanges ? [...listed].sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0)) : listed;   // the biggest moves first when the list is cut
  const shownChanges = firstChanges && !allChanges ? byMove.slice(0, firstChanges) : byMove;
  return (
    <section className="card hd" aria-labelledby="hd-h">
      <div className="card-h"><h3 id="hd-h">{title}</h3><span className="s">{p.asOf ? `as of ${dateIN(p.asOf)}` : "date not published"}</span></div>

      <dl className="hd-kpis">
        <div><dt>Holdings</dt><dd>{nf(count, 0)}</dd></div>
        <div><dt>Top 10 together</dt><dd>{pct(top10)}</dd></div>
        {!fundPage && <div><dt>{layout === "bars" ? `At ${SMALL_BELOW_PCT}% or more` : "Shown in the chart"}</dt><dd>{layout === "bars" ? nf(g.major.length, 0) : `${g.major.length} at ${SMALL_BELOW_PCT}% or more`}</dd></div>}
        <div><dt>Small holdings</dt><dd>{g.otherCount} below {SMALL_BELOW_PCT}%, {pct(g.otherPct)} together</dd></div>
      </dl>

      {fundPage ? (<>
        <ChartZoom label="Largest holdings and industries" className="cz-top">
        <div className="hd-two hd-main">
          <div>
            <TopBars rows={p.holdings} />
            <button type="button" className="hd-more" aria-expanded={allHoldings} onClick={() => setAllHoldings((v) => !v)}>{allHoldings ? "Hide the full list" : `All ${nf(count, 0)} holdings, and those below ${SMALL_BELOW_PCT}% →`}</button>
          </div>
          <div>
            <h4 className="hd-h4">By industry</h4>
            {industries.length ? (
              <ul className="hd-bars">{industryList.map((s) => (
                <li key={s.industry}><span className="hd-bl">{s.industry}</span><span className="hd-bt" aria-hidden="true"><i style={{ width: `${(s.pct / maxIndustry) * 100}%` }} /></span><b>{pct(s.pct)}</b></li>))}</ul>
            ) : <p className="hd-none">— No industry split is published for this {unit}.</p>}
            {industries.length > INDUSTRIES_FIRST && <button type="button" className="hd-more" aria-expanded={allIndustries} onClick={() => setAllIndustries(!allIndustries)}>{allIndustries ? `Show the ${INDUSTRIES_FIRST} largest industries` : `All ${industries.length} industries`}</button>}
            <h4 className="hd-h4">By asset type</h4>
            <ul className="hd-bars">{assetRows(p.summary.assetSplit).map((a) => (
              <li key={a.key}><span className="hd-bl">{a.label}</span><span className="hd-bt" aria-hidden="true"><i style={{ width: `${Math.min(100, a.pct ?? 0)}%` }} /></span>
                <b>{a.pct == null ? <span title="Not published in the source rows">—</span> : pct(a.pct)}</b></li>))}</ul>
            <p className="hd-fine">Only classes present in the published rows are shown; a dash means the source does not give that class.</p>
          </div>
        </div>
        </ChartZoom>
        {allHoldings && <>
          <h4 className="hd-h4">All {nf(count, 0)} holdings</h4>
          <SmallTable rows={p.holdings} label={`All ${p.holdings.length} holdings, largest first`} />
          <p className="hd-fine">{g.otherCount ? `${g.otherCount} of them are below ${SMALL_BELOW_PCT}%, ${pct(g.otherPct)} of the ${unit} together.` : `Every holding is at ${SMALL_BELOW_PCT}% or more.`}</p>
        </>}
      </>) : (<>
      {layout === "bars" ? (<>
        <TopBars rows={p.holdings} />
        <button type="button" className="hd-more" aria-expanded={allHoldings} onClick={() => setAllHoldings((v) => !v)}>{allHoldings ? "Hide the full list" : `All ${nf(count, 0)} holdings, with quantity and value →`}</button>
        {allHoldings && <SmallTable rows={p.holdings} label={`All ${p.holdings.length} holdings`} />}
      </>) : (
      <ChartZoom label="Share of each major holding" className="cz-top">
      <div className="hd-grid">
        <Donut slices={slices} />
        <ol className="hd-legend" aria-label="Major holdings">
          {slices.map((s, i) => (
            <li key={s.key}>
              <span className={"hd-sw" + (s.other ? " other" : "")} style={{ backgroundColor: s.other ? "var(--hd-other)" : `var(--hd-${i % 8})` }} data-pat={s.other ? "stripe" : PATTERNS[Math.floor(i / 8) % 4]} aria-hidden="true" />
              <span className="hd-ln">{s.holding ? <NameCell h={s.holding} /> : s.label}{s.holding?.industry && <small><IndustryText h={s.holding} /></small>}</span>
              <b>{pct(s.pct)}</b>
            </li>))}
        </ol>
      </div>
      </ChartZoom>)}

      <h4 className="hd-h4">All holdings below {SMALL_BELOW_PCT}% ({g.otherCount})</h4>
      {g.otherCount ? <SmallTable rows={g.small} /> : <p className="hd-none">Every holding is at {SMALL_BELOW_PCT}% or more, so none are grouped.</p>}

      <div className="hd-two">
        <div>
          <h4 className="hd-h4">By industry</h4>
          {industries.length ? (
            <ul className="hd-bars">{industries.map((s) => (
              <li key={s.industry}><span className="hd-bl">{s.industry}</span><span className="hd-bt" aria-hidden="true"><i style={{ width: `${(s.pct / maxIndustry) * 100}%` }} /></span><b>{pct(s.pct)}</b></li>))}</ul>
          ) : <p className="hd-none">— No industry split is published for this {unit}.</p>}
        </div>
        <div>
          <h4 className="hd-h4">By asset type</h4>
          <ul className="hd-bars">{assetRows(p.summary.assetSplit).map((a) => (
            <li key={a.key}><span className="hd-bl">{a.label}</span><span className="hd-bt" aria-hidden="true"><i style={{ width: `${Math.min(100, a.pct ?? 0)}%` }} /></span>
              <b>{a.pct == null ? <span title="Not published in the source rows">—</span> : pct(a.pct)}</b></li>))}</ul>
          <p className="hd-fine">Only classes present in the published rows are shown; a dash means the source does not give that class.</p>
        </div>
      </div>

      </>)}

      <div className="hd-chh"><h4 className="hd-h4">Change since {p.previousAsOf ? dateIN(p.previousAsOf) : "last month"}</h4>
        {fundPage && changes != null && <div className="hd-counts" role="group" aria-label="Show one kind of change">{COUNT_KINDS.map((k) => (
          <button key={k} type="button" className={`hd-count ${k}`} aria-pressed={kind === k} disabled={!countOf(k)} onClick={() => setKind(kind === k ? null : k)}>{KIND_TEXT[k]} <b>{countOf(k)}</b></button>))}</div>}</div>
      {changes == null ? <p className="hd-none">— Only one month of portfolio is on file, so no change can be shown yet.</p> : (
        <>
          {fundPage ? kind && <p className="hd-fine" role="status">Showing {KIND_TEXT[kind].toLowerCase()} holdings only. <button type="button" className="hd-more" onClick={() => setKind(null)}>Show every move</button></p>
            : <label className="hd-chk"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Include unchanged holdings</label>}
          {shownChanges.length === 0 ? <p className="hd-none">No holding moved between the two months.</p> : (
            <div className="hd-scroll" tabIndex={0} role="region" aria-label="Change in holdings since the previous month">
              <table className="hd-table">
                <caption className="sr-only">Holdings that are new, exited, increased or decreased against the previous month, in percentage points of the portfolio.</caption>
                <thead><tr><th scope="col">Holding</th><th scope="col">Move</th><th scope="col" className="num">Now</th><th scope="col" className="num">Before</th><th scope="col" className="num">Change</th></tr></thead>
                <tbody>{shownChanges.map((c, i) => (
                  <tr key={`${c.isin || c.name}-${i}`}><th scope="row"><NameCell h={c} /></th><td><span className={`hd-chip ${c.kind}`}>{KIND_TEXT[c.kind]}</span></td>
                    <td className="num">{pct(c.pct)}</td><td className="num">{c.kind === "new" ? "—" : pct(c.prevPct)}</td>
                    <td className={"num " + (c.change == null || c.change === 0 ? "" : c.change > 0 ? "pos" : "neg")}>{pp(c.change)}</td></tr>))}</tbody>
              </table>
            </div>)}
          {firstChanges && byMove.length > firstChanges && <button type="button" className="hd-more" aria-expanded={allChanges} onClick={() => setAllChanges((v) => !v)}>{allChanges ? `Show the ${firstChanges} biggest only` : `All ${byMove.length} changes`}</button>}
        </>)}

      <p className="hd-src">Source: {p.sourceUrl ? <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">{p.source}</a> : p.source}. As of {p.asOf ? dateIN(p.asOf) : "—"}{p.previousAsOf ? `; compared with ${dateIN(p.previousAsOf)}` : ""}. Shares are as published by the fund house and may not add up to exactly 100%.</p>
    </section>
  );
}
