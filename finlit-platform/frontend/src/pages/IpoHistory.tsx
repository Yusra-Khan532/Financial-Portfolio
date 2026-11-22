// Every IPO on record, current and past, in one table: filters (status, board, year, sector, exchange, listing gain, subscription, issue size), search,
// sorting, a summary of what is shown, CSV of the rows shown, and each row opening the IPO report. Filters live in the address, so a view can be shared.
// Describes the past; not a forecast and not advice.
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { MINUS, nf } from "../lib/format";
import { useDocTitle } from "../lib/title";
import {
  applyFilters, filtersFromParams, GAIN_OPTIONS, NO_FILTERS, paramsFromFilters, SIZE_OPTIONS, sortRows, STATUS_LABEL, SUB_OPTIONS, summarise, toCsv, useIpoHistory, yearOf,
  type Filters, type IpoRow, type IpoStatus, type SortKey,
} from "../lib/ipoHistory";
import "../styles/ipo-all.css";

const PAGE = 50;
const SORTS: SortKey[] = ["date", "name", "issuePrice", "issueSizeCr", "subscription", "gmpPct", "listingPct", "listingClosePct", "lastClose", "sinceIpoPct"];
export const pct = (v: number | null | undefined, dp = 1) => (v == null ? MINUS : `${v > 0 ? "+" : v < 0 ? MINUS : ""}${nf(Math.abs(v), dp)}%`);
export const tone = (v: number | null | undefined) => (v == null || v === 0 ? "" : v > 0 ? "up" : "down");
export const rupees = (v: number | null | undefined, dp?: number) => (v == null ? MINUS : "₹" + nf(v, dp ?? (v % 1 ? 2 : 0)));
export const crore = (v: number | null | undefined) => (v == null ? MINUS : `₹${nf(v, v >= 100 ? 0 : 2)} Cr`);
export const times = (v: number | null | undefined) => (v == null ? MINUS : nf(v, 2) + "x");
export const dateIn = (iso: string | null | undefined) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : MINUS);
/** "25–27 Nov 2026", "28 Nov – 2 Dec 2026", "30 Dec 2026 – 1 Jan 2027". */
export function windowOf(a: string | null, b: string | null): string {
  if (!a) return MINUS;
  if (!b || a === b) return dateIn(a);
  const [x, y] = [new Date(a + "T00:00:00"), new Date(b + "T00:00:00")];
  const m = (d: Date) => d.toLocaleDateString("en-IN", { month: "short" });
  if (x.getFullYear() !== y.getFullYear()) return `${dateIn(a)} – ${dateIn(b)}`;
  if (x.getMonth() !== y.getMonth()) return `${x.getDate()} ${m(x)} – ${y.getDate()} ${m(y)} ${y.getFullYear()}`;
  return `${x.getDate()}–${y.getDate()} ${m(y)} ${y.getFullYear()}`;
}
const priceOf = (r: IpoRow) => (r.issuePrice != null && r.status === "listed" ? rupees(r.issuePrice)
  : r.priceHigh != null ? (r.priceLow != null && r.priceLow !== r.priceHigh ? `${rupees(r.priceLow)}–${nf(r.priceHigh, r.priceHigh % 1 ? 2 : 0)}` : rupees(r.priceHigh)) : rupees(r.issuePrice));

/** The date cell: the listing date for listed issues, else the bidding window and where the issue stands. */
function When({ r }: { r: IpoRow }) {
  if (r.status === "listed") return <>{dateIn(r.listingDate)}</>;
  return <><span className={"ia-st " + r.status}>{STATUS_LABEL[r.status]}</span><small>{windowOf(r.openDate, r.closeDate)}</small></>;
}

const COLS: [SortKey, string, string?][] = [["date", "Listed"], ["issuePrice", "Issue price", "r"], ["issueSizeCr", "Issue size", "r"], ["subscription", "Subscribed", "r"],
  ["gmpPct", "GMP said", "r"], ["listingPct", "At listing", "r"], ["listingClosePct", "Day-1 close", "r"], ["sinceIpoPct", "Since IPO", "r"]];

function SubCell({ r }: { r: IpoRow }) {
  const parts = ([["QIB", r.subQib], ["NII", r.subNii], ["Retail", r.subRetail]] as const).filter(([, v]) => v != null);
  return <>{times(r.subscription)}{parts.map(([k, v]) => <small key={k}>{k} {nf(v as number, 1)}x</small>)}</>;
}

export function IpoHistoryPage() {
  useDocTitle("All IPOs", "Every IPO in India since 2020, mainboard and SME: listing date, issue price, subscription, GMP before listing, listing price against issue price and return since IPO, with filters.");
  const { data, isLoading, isError } = useIpoHistory();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const f = useMemo(() => filtersFromParams(params), [params]);
  const sort = (SORTS as string[]).includes(params.get("sort") || "") ? (params.get("sort") as SortKey) : "date";
  const dir = params.get("dir") === "asc" ? "asc" : "desc";
  const [n, setN] = useState(PAGE);
  const [showF, setShowF] = useState(false);
  const rows = useMemo(() => data?.items ?? [], [data]);
  const set = (next: Partial<Filters>, s: SortKey = sort, d: "asc" | "desc" = dir) => { setParams(paramsFromFilters({ ...f, ...next }, s, d), { replace: true }); setN(PAGE); };
  const shown = useMemo(() => sortRows(applyFilters(rows, f), sort, dir), [rows, f, sort, dir]);
  const sum = useMemo(() => summarise(shown), [shown]);
  const years = useMemo(() => [...new Set(rows.map(yearOf).filter((y): y is string => !!y))].sort().reverse(), [rows]);
  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector).filter((s): s is string => !!s))].sort(), [rows]);
  const active = (Object.keys(NO_FILTERS) as (keyof Filters)[]).filter((k) => f[k] !== NO_FILTERS[k]).length;
  const onSort = (k: SortKey) => set({}, k, sort === k ? (dir === "asc" ? "desc" : "asc") : k === "name" ? "asc" : "desc");
  const csv = () => {
    const url = URL.createObjectURL(new Blob(["﻿" + toCsv(shown)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `finlit-ipos-${data?.asOf ?? "all"}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const sel = <K extends keyof Filters>(k: K, label: string, opts: [string, string][]) => (
    <label className="ia-f"><span>{label}</span><select value={f[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<Filters>)}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>);
  const share = sum.listed ? Math.round((sum.above / sum.listed) * 100) : null;

  return (
    <div className="wrap ia">
      <PageHeader plan="free" title="All IPOs" links={["/ipo", "/results", "/news"]}
        back={<Link to="/ipo">← IPO calendar</Link>}
        description={<>Every <b>mainboard and SME IPO since 2020</b>: when it listed, what it was priced at, how many times it was subscribed, what the grey market said and how it has done since. Tap an issue for its full report.</>} />

      <section className={"card ia-bar" + (showF ? " open" : "")} aria-label="Filters">
        <label className="ia-f ia-q"><span>Search</span><input type="search" placeholder="Company or symbol" value={f.q} onChange={(e) => set({ q: e.target.value })} /></label>
        <button type="button" className="ia-btn ia-ftog" aria-expanded={showF} aria-controls="ia-more-f" onClick={() => setShowF(!showF)}>{showF ? "Hide filters" : "Filters"}{active > (f.q ? 1 : 0) ? ` (${active - (f.q ? 1 : 0)})` : ""}</button>
        <div className="ia-fs" id="ia-more-f">
        {sel("status", "Status", [["all", "All"], ...(["listed", "open", "upcoming", "closed", "not_listed", "withdrawn"] as IpoStatus[]).map((s) => [s, STATUS_LABEL[s]] as [string, string])])}
        {sel("board", "Board", [["all", "All boards"], ["mainboard", "Mainboard"], ["sme", "SME"]])}
        {sel("year", "Year", [["all", "All years"], ...years.map((y) => [y, y] as [string, string])])}
        {sel("gain", "At listing", GAIN_OPTIONS)}
        {sel("sub", "Subscription", SUB_OPTIONS)}
        {sel("size", "Issue size", SIZE_OPTIONS)}
        {sel("exchange", "Exchange", [["all", "NSE and BSE"], ["NSE", "NSE"], ["BSE", "BSE"]])}
        {sel("sector", "Sector", [["all", "All sectors"], ...sectors.map((s) => [s, s] as [string, string])])}
        </div>
        <div className="ia-acts">
          {active > 0 && <button type="button" className="ia-btn" onClick={() => { setParams({}, { replace: true }); setN(PAGE); }}>Clear filters ({active})</button>}
          <button type="button" className="ia-btn" onClick={csv} disabled={!shown.length}>Download CSV</button>
        </div>
      </section>

      {isError && <p className="formerr">The IPO list could not be loaded. Please try again shortly.</p>}
      {isLoading && <div className="skeleton" style={{ height: 420 }} role="status" aria-label="Loading IPOs" />}
      {data && <>
        <p className="ia-sum" aria-live="polite">
          <b>{nf(sum.count, 0)}</b> {sum.count === 1 ? "issue" : "issues"}{sum.raisedCr > 0 && <> raising <b>{crore(sum.raisedCr)}</b></>}.
          {sum.listed > 0 && <> Of the {nf(sum.listed, 0)} that listed, <b className="up">{nf(sum.above, 0)}</b> opened above the issue price and <b className="down">{nf(sum.below, 0)}</b> below{share != null && <> ({share}% above)</>}; the median listing price was <b className={tone(sum.medianGain)}>{pct(sum.medianGain)}</b> against the issue price.</>}
          {sum.medianSince != null && <> Median return since IPO: <b className={tone(sum.medianSince)}>{pct(sum.medianSince)}</b> ({nf(sum.sinceCount, 0)} with a latest close).</>}
          {sum.medianSub != null && <> Median subscription: <b>{times(sum.medianSub)}</b>.</>}
        </p>
        {!shown.length ? <p className="card ia-none">No IPOs match these filters. <button type="button" className="ia-link" onClick={() => setParams({}, { replace: true })}>Clear filters</button></p> : <>
          <div className="card ia-tw">
            <table className="ia-t">
              <caption className="sr-only">IPOs matching the filters, {sort === "date" ? "newest first" : "sorted"}; select a company for its report</caption>
              <thead><tr>
                <th scope="col" aria-sort={sort === "name" ? (dir === "asc" ? "ascending" : "descending") : "none"}><button type="button" onClick={() => onSort("name")}>Company{sort === "name" ? (dir === "asc" ? " ▲" : " ▼") : ""}</button></th>
                {COLS.map(([k, l, c]) => <th key={k} scope="col" className={c} aria-sort={sort === k ? (dir === "asc" ? "ascending" : "descending") : "none"}><button type="button" onClick={() => onSort(k)}>{l}{sort === k ? (dir === "asc" ? " ▲" : " ▼") : ""}</button></th>)}
              </tr></thead>
              <tbody>{shown.slice(0, n).map((r) => (
                <tr key={r.id} onClick={(e) => { if (!(e.target as HTMLElement).closest("a")) nav(`/ipo/${r.id}`); }}>
                  <th scope="row"><Link to={`/ipo/${r.id}`}>{r.name}</Link><small>{[r.board === "sme" ? "SME" : "Mainboard", r.symbol, r.sector].filter(Boolean).join(" · ")}</small></th>
                  <td><When r={r} /></td>
                  <td className="r">{priceOf(r)}</td>
                  <td className="r">{crore(r.issueSizeCr)}</td>
                  <td className="r"><SubCell r={r} /></td>
                  <td className="r">{pct(r.gmpPct)}</td>
                  <td className={"r " + tone(r.listingPct)}>{pct(r.listingPct)}{r.listingPrice != null && <small>{rupees(r.listingPrice)}</small>}</td>
                  <td className={"r " + tone(r.listingClosePct)}>{pct(r.listingClosePct)}{r.listingClose != null && <small>{rupees(r.listingClose)}</small>}</td>
                  <td className={"r " + tone(r.sinceIpoPct)}>{pct(r.sinceIpoPct)}{r.lastClose != null && <small>{rupees(r.lastClose)}{r.lastDay ? ` on ${dateIn(r.lastDay)}` : ""}</small>}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <ul className="ia-cards" aria-label="IPOs matching the filters">{shown.slice(0, n).map((r) => (
            <li key={r.id}><Link to={`/ipo/${r.id}`} className="card ia-c">
              <div className="ia-ch"><b>{r.name}</b><span>{[r.board === "sme" ? "SME" : "Mainboard", r.symbol].filter(Boolean).join(" · ")}</span></div>
              <dl>
                <div><dt>{r.status === "listed" ? "Listed" : STATUS_LABEL[r.status]}</dt><dd>{r.status === "listed" ? dateIn(r.listingDate) : dateIn(r.openDate)}</dd></div>
                <div><dt>Issue price</dt><dd>{priceOf(r)}</dd></div>
                <div><dt>Subscribed</dt><dd>{times(r.subscription)}</dd></div>
                <div><dt>At listing</dt><dd className={tone(r.listingPct)}>{pct(r.listingPct)}</dd></div>
                <div><dt>GMP said</dt><dd>{pct(r.gmpPct)}</dd></div>
                <div><dt>Since IPO</dt><dd className={tone(r.sinceIpoPct)}>{pct(r.sinceIpoPct)}</dd></div>
              </dl>
            </Link></li>))}</ul>
          {shown.length > n && <div className="ia-more"><button type="button" className="ia-btn" onClick={() => setN(n + PAGE)}>Show {nf(Math.min(PAGE, shown.length - n), 0)} more</button><span className="muted">Showing {nf(n, 0)} of {nf(shown.length, 0)}</span></div>}
        </>}
        <p className="muted ia-foot">
          At listing = the listing price (the listing-day open the exchange set) against the issue price. Day-1 close and latest close are the exchange's closing prices (for an issue listed in the past year whose daily history we do not hold yet, the latest quoted price); since IPO = that price against the issue price. Where the share has split or issued bonus shares since (from NSE's corporate actions, or our adjusted price history), the issue price is adjusted by the same factor, so the figures compare like with like. For a BSE-only issue listed more than a year ago no such record is available, so since IPO is left blank rather than risk a wrong figure.
          {" "}Issue details, overall subscription and GMP: <a href={data.sources.issue.url ?? undefined} target="_blank" rel="noopener noreferrer">{data.sources.issue.name}</a>. Subscription by category (QIB, NII, retail): NSE, for mainboard issues. GMP is an informal, unofficial grey-market price, not an exchange figure.
          {" "}Describes the past; not a forecast or advice.
        </p>
      </>}
    </div>
  );
}
