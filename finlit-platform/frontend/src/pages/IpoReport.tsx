// One IPO in full (/ipo/:id): the headline figures, the issue in words, the timetable, subscription by investor category and the bids at each price,
// how the issue was reserved and how much one could bid, the GMP log, issue details, the offer documents, figures and restated financials from the offer
// document, what the money is for, and the anchor book. Every figure is from the named source or is arithmetic on them. Describes; never advises.
import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { BookBars, DemandBars, Financials, GmpLine, Reservation } from "../components/ipo/ReportCharts";
import { MINUS, nf } from "../lib/format";
import { STATUS_LABEL, useIpoRecord, type IpoRecord } from "../lib/ipoHistory";
import { useDocTitle } from "../lib/title";
import { crore, dateIn, pct, rupees, times, tone, windowOf } from "./IpoHistory";
import "../styles/ipo-report.css";

const above = (v: number) => (v > 0 ? "above" : "below");
const abs1 = (v: number) => nf(Math.abs(v), 1) + "%";

/** The issue in plain sentences, from the figures on this page only. */
export function inWords(r: IpoRecord): string[] {
  const d = r.detail, i = d?.issue, out: string[] = [];
  const now = r.status === "upcoming" || r.status === "open";
  const kind = i?.kind === "Book built" ? "book-built " : i?.kind === "Fixed price" ? "fixed-price " : "";
  const board = r.board === "sme" ? "SME" : "mainboard";
  const price = r.issuePrice != null && (r.status === "listed" || r.status === "closed") ? `priced at ${rupees(r.issuePrice)}` : r.priceHigh != null ? `with a price band of ${r.priceLow != null && r.priceLow !== r.priceHigh ? `${rupees(r.priceLow)} to ${rupees(r.priceHigh)}` : rupees(r.priceHigh)}` : "";
  const size = r.issueSizeCr != null ? ` of ${crore(r.issueSizeCr)}` : "";
  out.push(`${d?.company.fullName || r.name} ${r.status === "upcoming" || r.status === "open" ? "is raising" : "raised"} money through a ${kind}${board} IPO${size}${price ? ", " + price : ""}.`);
  if (i && (i.freshCr || i.ofsCr)) {
    const was = now ? "is" : "was", goes = now ? "goes" : "went", sell = now ? "sell" : "sold";
    if (i.freshCr && i.ofsCr) out.push(`${crore(i.freshCr)} ${was} new money for the company and ${crore(i.ofsCr)} ${was} an offer for sale by existing shareholders, so ${nf((i.freshCr / (i.freshCr + i.ofsCr)) * 100, 0)}% of the money raised ${goes} to the company itself.`);
    else if (i.freshCr) out.push(`The whole issue ${was} new money for the company (a fresh issue); no existing shareholder ${now ? "sells" : "sold"} shares.`);
    else out.push(`The whole issue ${was} an offer for sale: existing shareholders ${sell} shares, and the money ${goes} to them rather than to the company.`);
  }
  if (r.openDate) out.push(`Bidding ${r.status === "upcoming" ? "runs" : r.status === "open" ? "runs" : "ran"} from ${dateIn(r.openDate)}${r.closeDate && r.closeDate !== r.openDate ? ` to ${dateIn(r.closeDate)}` : ""}${i?.lotSize ? `, in lots of ${nf(i.lotSize, 0)} shares${i.minAmount ? ` (${rupees(i.minAmount)} for one lot)` : ""}` : ""}.`);
  if (r.subscription != null) {
    const cats = r.nseBook?.categories.filter((c) => ["qib", "nii", "retail"].includes(c.key)) ?? [];
    out.push(`The issue ${r.status === "open" ? "has been" : "was"} subscribed ${times(r.subscription)} overall${r.status === "open" ? " so far" : ""}${cats.length ? `: ${cats.map((c) => `${c.label.toLowerCase()} ${times(c.times)}`).join(", ")}` : ""}.`);
  }
  if (r.status === "listed" && r.listingPrice != null && r.issuePrice != null && r.listingPct != null) {
    let s = `It listed on ${dateIn(r.listingDate)} at ${rupees(r.listingPrice)}, ${r.listingPct === 0 ? "the same as the issue price" : `${abs1(r.listingPct)} ${above(r.listingPct)} the issue price`}`;
    if (r.listingClose != null && r.listingClosePct != null) s += `; the first day closed at ${rupees(r.listingClose)}, ${abs1(r.listingClosePct)} ${above(r.listingClosePct)} it`;
    out.push(s + ".");
  }
  if (r.gmp != null && r.gmpPct != null && r.status === "listed" && r.listingPct != null) {
    const gap = r.listingPct - r.gmpPct;
    out.push(`The last grey market premium before listing was ${rupees(r.gmp)} (${nf(r.gmpPct, 1)}% of the issue price); the listing price came in ${Math.abs(gap) < 0.05 ? "exactly there" : `${nf(Math.abs(gap), 1)} points ${gap > 0 ? "higher" : "lower"}`}.`);
  } else if (r.gmp != null && r.gmpPct != null && r.status !== "listed") {
    out.push(`The latest grey market premium InvestorGain recorded is ${rupees(r.gmp)} (${nf(r.gmpPct, 1)}% of the upper price). GMP is informal and unofficial.`);
  }
  if (r.sinceIpoPct != null && r.lastClose != null) out.push(`At the latest close (${rupees(r.lastClose)} on ${dateIn(r.lastDay)}) the share was ${abs1(r.sinceIpoPct)} ${above(r.sinceIpoPct)} the issue price${r.adjustedBy ? ", allowing for the splits and bonuses since" : ""}.`);
  if (i?.promoterPre != null && i.promoterPost != null) out.push(now ? `The promoters hold ${nf(i.promoterPre, 2)}% of the company before the issue and will hold ${nf(i.promoterPost, 2)}% after it.` : `The promoters held ${nf(i.promoterPre, 2)}% of the company before the issue and ${nf(i.promoterPost, 2)}% after it.`);
  return out;
}

/** "the employee portion", "the employee and shareholder portions": the reserved parts NSE's book counts beyond the main categories. */
function extra(cats: { key: string }[]): string {
  const w = cats.map((c) => ({ employee: "employee", shareholder: "shareholder", policyholder: "policyholder", other: "other" } as Record<string, string>)[c.key]).filter(Boolean);
  return w.length ? `the ${w.join(" and ")} ${w.length > 1 ? "portions" : "portion"}` : "the reserved portions";
}

function Tile({ k, v, s, c }: { k: string; v: ReactNode; s?: ReactNode; c?: string }) {
  return <div className="ir-tile"><span>{k}</span><b className={c}>{v}</b>{s && <small>{s}</small>}</div>;
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, v]) => v != null && v !== "" && v !== MINUS);
  return shown.length ? <dl className="ir-facts">{shown.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl> : null;
}

const STEPS: [keyof NonNullable<IpoRecord["detail"]>["timetable"], string][] = [["anchorBid", "Anchor bidding"], ["open", "Bidding opens"], ["close", "Bidding closes"], ["allotment", "Allotment"],
  ["refunds", "Refunds"], ["credit", "Shares credited"], ["listing", "Listing"], ["anchorLockin30", "Anchor lock-in ends (50%)"], ["anchorLockin90", "Anchor lock-in ends (rest)"]];

export function IpoReportPage() {
  const id = Number(useParams().id);
  const { data: r, isLoading, isError } = useIpoRecord(id);
  useDocTitle(r ? `${r.name} IPO` : "IPO report", r ? `${r.name} IPO: issue price, subscription by category, reservation, timetable, listing and offer documents.` : "IPO report");
  if (isLoading) return <div className="wrap ir"><div className="skeleton" style={{ height: 520 }} role="status" aria-label="Loading the IPO report" /></div>;
  if (isError || !r) return <div className="wrap ir"><div className="card ir-none"><b>This IPO is not in our records.</b><p><Link to="/ipo/all">See all IPOs</Link></p></div></div>;
  const d = r.detail, i = d?.issue, today = new Date().toISOString().slice(0, 10);
  const docs = d ? ([["Draft red herring prospectus (DRHP)", d.documents.drhp], ["Red herring prospectus (RHP)", d.documents.rhp], ["Prospectus", d.documents.prospectus], ["Anchor investor list", d.documents.anchorList]] as const).filter(([, u]) => !!u) : [];
  const steps = d ? STEPS.filter(([k]) => d.timetable[k]).map(([k, l]) => ({ k, l, at: d.timetable[k] as string })) : [];
  const words = inWords(r);
  const meta = [r.board === "sme" ? "SME" : "Mainboard", ...(r.exchanges.length ? [r.exchanges.join(", ")] : []), r.sector, r.symbol].filter(Boolean).join(" · ");
  return (
    <div className="wrap ir">
      <PageHeader plan="free" title={`${r.name} IPO`} back={<Link to="/ipo/all">← All IPOs</Link>}
        description={<><span className={"ir-st " + r.status}>{STATUS_LABEL[r.status]}</span> {meta}</>}
        actions={r.companyPage && r.nse ? <Link className="ir-cta" to={`/stocks/${encodeURIComponent(r.nse)}`}>Company page →</Link> : undefined} />

      <section className="ir-tiles" aria-label="Headline figures">
        <Tile k={r.status === "listed" || r.status === "closed" ? "Issue price" : "Price band"} v={r.status === "listed" || r.status === "closed" ? rupees(r.issuePrice) : r.priceHigh != null ? `${r.priceLow != null && r.priceLow !== r.priceHigh ? rupees(r.priceLow) + "–" : ""}${rupees(r.priceHigh)}` : MINUS}
          s={i?.lotSize ? `Lot of ${nf(i.lotSize, 0)} shares` : undefined} />
        <Tile k="Issue size" v={crore(r.issueSizeCr)} s={i && (i.freshCr || i.ofsCr) ? [i.freshCr ? `Fresh ${crore(i.freshCr)}` : "", i.ofsCr ? `Offer for sale ${crore(i.ofsCr)}` : ""].filter(Boolean).join(" · ") : undefined} />
        <Tile k="Subscribed" v={times(r.subscription ?? r.nseBook?.total)} s={r.subscription != null || r.nseBook ? (r.status === "open" ? "Overall, so far" : "Overall") : undefined} />
        <Tile k={r.status === "listed" ? "GMP before listing" : "Latest GMP"} v={r.gmp != null ? rupees(r.gmp) : MINUS} s={r.gmpPct != null ? `${nf(r.gmpPct, 1)}% of the ${r.status === "listed" ? "issue" : "upper"} price · unofficial` : undefined} />
        {r.status === "listed" && <Tile k="Listed at" v={rupees(r.listingPrice)} s={<span className={tone(r.listingPct)}>{pct(r.listingPct)} vs issue · {dateIn(r.listingDate)}</span>} />}
        {r.status === "listed" && r.listingClose != null && <Tile k="First-day close" v={rupees(r.listingClose)} s={r.listingClosePct != null ? <span className={tone(r.listingClosePct)}>{pct(r.listingClosePct)} vs issue</span> : undefined} />}
        {r.status === "listed" && r.sinceIpoPct != null && <Tile k="Since IPO" v={pct(r.sinceIpoPct)} c={tone(r.sinceIpoPct)} s={r.lastClose != null ? `${rupees(r.lastClose)} on ${dateIn(r.lastDay)}` : undefined} />}
        {r.status !== "listed" && <Tile k={r.status === "upcoming" ? "Bidding opens" : "Bidding window"} v={windowOf(r.openDate, r.closeDate)} s={r.listingDate ? `Listing ${dateIn(r.listingDate)}` : undefined} />}
      </section>

      <section className="card ir-sec" aria-labelledby="ir-words"><h2 id="ir-words">The issue, in words</h2>
        {words.map((w) => <p key={w}>{w}</p>)}
        <p className="muted ir-small">Written from the figures on this page. It describes the issue; it does not rate it or suggest any action.</p>
      </section>

      {steps.length > 0 && <section className="card ir-sec" aria-labelledby="ir-tt"><h2 id="ir-tt">Timetable</h2>
        <ol className="ir-steps">{steps.map((s) => <li key={s.k} className={s.at <= today ? "done" : ""}><b>{s.l}</b><span>{dateIn(s.at)}</span></li>)}</ol></section>}

      <section className="card ir-sec" aria-labelledby="ir-sub"><h2 id="ir-sub">Subscription</h2>
        {r.nseBook ? <>
          <p className="ir-lead">Subscribed <b>{times(r.subscription ?? r.nseBook.total)}</b> overall.{r.subscription != null && Math.abs(r.subscription - r.nseBook.total) >= 0.01 && <> NSE's consolidated book, which also counts {extra(r.nseBook.categories)}, gives <b>{times(r.nseBook.total)}</b>.</>} The thin mark on each bar is NSE's overall figure.</p>
          <BookBars cats={r.nseBook.categories} total={r.nseBook.total} />
          {r.nseBook.demand.length > 1 && <><h3>Bids at each price</h3><p className="muted ir-small">Shares bid for at each price in the band (in lakh), as NSE published the book; cut-off bids take whatever price is set.</p><DemandBars demand={r.nseBook.demand} /></>}
          <p className="muted ir-small">Source: NSE, the consolidated book (bids on NSE and BSE together).</p>
        </> : r.subscription != null ? <p className="ir-lead">Subscribed <b>{times(r.subscription)}</b> overall. {r.board === "sme" ? "The exchange does not publish the split by investor category for SME issues in a form we read." : "The split by investor category is added once the exchange's book is read."}</p>
          : <p className="muted">No subscription figures yet.</p>}
      </section>

      {d?.reservation && <section className="card ir-sec" aria-labelledby="ir-res"><h2 id="ir-res">How the issue was reserved</h2>
        <Reservation rows={d.reservation.rows} total={d.reservation.total} />
        {i && <Facts rows={[["Smallest bid (retail)", i.lotSize ? `${nf(i.lotSize, 0)} shares${i.minAmount ? ` · ${rupees(i.minAmount)}` : ""}` : null], ["Largest retail bid", i.retailMaxShares ? `${nf(i.retailMaxShares, 0)} shares` : null],
          ["Smallest small-NII bid", i.sniiMinShares ? `${nf(i.sniiMinShares, 0)} shares${i.sniiMinAmount ? ` · ${rupees(i.sniiMinAmount)}` : ""}` : null], ["Smallest big-NII bid", i.bniiMinShares ? `${nf(i.bniiMinShares, 0)} shares${i.bniiMinAmount ? ` · ${rupees(i.bniiMinAmount)}` : ""}` : null]]} />}
      </section>}

      {r.gmpHistory.length > 1 && <section className="card ir-sec" aria-labelledby="ir-gmp"><h2 id="ir-gmp">Grey market premium, day by day</h2>
        <GmpLine points={r.gmpHistory} issuePrice={r.issuePrice ?? r.priceHigh} />
        <p className="muted ir-small">GMP as InvestorGain recorded it. It is an informal, unofficial price from the grey market, not an exchange figure, and nobody audits it.</p></section>}

      {d && <section className="card ir-sec" aria-labelledby="ir-det"><h2 id="ir-det">Issue details</h2>
        <Facts rows={[["Issue type", i?.kind], ["Face value", i?.faceValue != null ? rupees(i.faceValue) : null], ["Price band", i?.priceHigh != null ? `${i.priceLow != null && i.priceLow !== i.priceHigh ? rupees(i.priceLow) + " – " : ""}${rupees(i.priceHigh)}` : null],
          ["Issue price", i?.issuePrice != null ? rupees(i.issuePrice) : null], ["Shares offered", i?.totalShares ? nf(i.totalShares, 0) : null], ["Fresh issue", i?.freshCr ? `${crore(i.freshCr)}${i.freshShares ? ` · ${nf(i.freshShares, 0)} shares` : ""}` : null],
          ["Offer for sale", i?.ofsCr ? `${crore(i.ofsCr)}${i.ofsShares ? ` · ${nf(i.ofsShares, 0)} shares` : ""}` : null], ["Shares before the issue", i?.preIssueShares ? nf(i.preIssueShares, 0) : null], ["Shares after the issue", i?.postIssueShares ? nf(i.postIssueShares, 0) : null],
          ["Promoter holding", i?.promoterPre != null ? `${nf(i.promoterPre, 2)}% before${i.promoterPost != null ? ` · ${nf(i.promoterPost, 2)}% after` : ""}` : null], ["Promoters", d.company.promoters.length ? d.company.promoters.join(", ") : null],
          ["Market value at the issue price", i?.marketCapCr ? crore(i.marketCapCr) : null], ["Listing at", i?.exchanges.length ? i.exchanges.join(", ") : null], ["ISIN", r.isin],
          ["Registrar", d.people.registrar ? (d.people.allotmentUrl ? <a href={d.people.allotmentUrl} target="_blank" rel="noopener noreferrer">{d.people.registrar}</a> : d.people.registrar) : null],
          ["Lead managers", d.people.leadManagers.length ? d.people.leadManagers.join(", ") : null], ["Incorporated", d.company.incorporated], ["Based in", d.company.city],
          ["Website", d.company.website ? <a href={d.company.website} target="_blank" rel="noopener noreferrer nofollow">{d.company.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a> : null]]} />
      </section>}

      {docs.length > 0 && <section className="card ir-sec" aria-labelledby="ir-docs"><h2 id="ir-docs">Offer documents</h2>
        <ul className="ir-docs">{docs.map(([l, u]) => <li key={l}><a href={u as string} target="_blank" rel="noopener noreferrer">{l}</a><small>{new URL(u as string).hostname.replace(/^www\./, "")}</small></li>)}</ul>
        <p className="muted ir-small">The offer document is the authoritative source for every figure about the issue.</p></section>}

      {d && (d.kpis.length > 0 || i?.pe != null || i?.eps != null) && <section className="card ir-sec" aria-labelledby="ir-kpi"><h2 id="ir-kpi">Figures from the offer document</h2>
        {d.kpis.length > 0 && <div className="ir-tw"><table className="ir-t"><caption className="sr-only">Key figures as the offer document gives them</caption>
          <thead><tr><th scope="col">As of</th>{d.kpis.map((k, j) => <th key={j} scope="col" className="r">{k.asOf ? dateIn(k.asOf) : MINUS}</th>)}</tr></thead>
          <tbody>{([["Return on equity", "roe", "%"], ["Return on capital employed", "roce", "%"], ["Return on net worth", "ronw", "%"], ["Debt to equity", "debtEquity", ""], ["Profit margin (PAT)", "patMargin", "%"], ["EBITDA margin", "ebitdaMargin", "%"], ["Book value a share", "nav", "₹"], ["Price to book (at the issue price)", "priceToBook", ""]] as const)
            .filter(([, k]) => d.kpis.some((x) => x[k] != null)).map(([l, k, u]) => <tr key={k}><th scope="row">{l}</th>{d.kpis.map((x, j) => <td key={j} className="r">{x[k] == null ? MINUS : u === "₹" ? rupees(x[k] as number, 2) : nf(x[k] as number, 2) + u}</td>)}</tr>)}</tbody></table></div>}
        <Facts rows={[["Earnings a share (before the issue)", i?.eps != null ? rupees(i.eps, 2) : null], ["Earnings a share (after the issue)", i?.epsPost != null ? rupees(i.epsPost, 2) : null], ["P/E at the issue price (before)", i?.pe != null ? nf(i.pe, 2) : null], ["P/E at the issue price (after)", i?.postPe != null ? nf(i.postPe, 2) : null]]} />
        <p className="muted ir-small">Part-year figures (a quarter or half year) are not annualised.</p></section>}

      {d?.financials && <section className="card ir-sec" aria-labelledby="ir-fin"><h2 id="ir-fin">Financials{d.financials.basis ? ` (${d.financials.basis.toLowerCase()})` : ""}</h2>
        <Financials f={d.financials} /><p className="muted ir-small">As the offer document restated them. Part-year periods are not annualised.</p></section>}

      {(d?.objects || d?.expenses) && <section className="card ir-sec" aria-labelledby="ir-obj"><h2 id="ir-obj">What the money is for</h2>
        {d?.objects && <ul className="ir-list">{d.objects.map((o) => <li key={o.label}><span>{o.label}</span>{o.amountCr != null && <b>{crore(o.amountCr)}</b>}</li>)}</ul>}
        {d?.expenses && <details className="ir-more"><summary>Issue expenses ({crore(d.expenses.reduce((a, e) => a + (e.amountCr ?? 0), 0))})</summary><ul className="ir-list">{d.expenses.map((o) => <li key={o.label}><span>{o.label}</span>{o.amountCr != null && <b>{crore(o.amountCr)}</b>}</li>)}</ul></details>}
      </section>}

      {d?.anchors && <section className="card ir-sec" aria-labelledby="ir-anc"><h2 id="ir-anc">Anchor investors</h2>
        <p className="ir-lead"><b>{nf(d.anchors.count, 0)}</b> anchor investors took <b>{nf(d.anchors.shares, 0)}</b> shares for <b>{crore(d.anchors.amountCr)}</b>{d.timetable.anchorBid ? ` on ${dateIn(d.timetable.anchorBid)}` : ""}.</p>
        <details className="ir-more"><summary>Every anchor investor</summary><ul className="ir-list">{d.anchors.investors.map((a) => <li key={a.name}><span>{a.name}</span><b>{nf(a.shares, 0)} shares{a.amountCr != null ? ` · ${crore(a.amountCr)}` : ""}</b></li>)}</ul></details>
      </section>}

      <p className="muted ir-foot">
        Sources: issue details, overall subscription, GMP and offer-document figures from <a href={r.url} target="_blank" rel="noopener noreferrer">InvestorGain</a>{r.nseBook ? "; subscription by category and bids at each price from NSE" : ""}{r.status === "listed" ? "; first-day and latest closes from the exchange's daily prices" : ""}.
        {r.updatedAt ? ` Last read ${dateIn(r.updatedAt.slice(0, 10))}.` : ""} For information only; it describes the issue and is not advice.
      </p>
    </div>
  );
}
