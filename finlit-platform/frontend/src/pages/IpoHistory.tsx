// Every IPO on record, current and past, in one table: filters (status, board, year, sector, exchange, listing gain, subscription, issue size), search,
// sorting, a summary of what is shown, CSV of the rows shown, and each row opening the IPO report. Filters live in the address, so a view can be shared.
// Describes the past; not a forecast and not advice.
//
// Task #308 (developer file 18, compact layout): the filter card is one toolbar (search, Status, Board, Year, At listing, More filters, Download CSV), each
// option showing how many issues it would leave with the other filters applied; the filters that are on show as chips with × and Clear all; the summary
// sentence is a strip of seven figures; a count line says how the table is sorted; and the table is part of the page, its header row sticking under the
// top nav, instead of scrolling inside its own box.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { MINUS, nf } from "../lib/format";
import { useDocTitle } from "../lib/title";
import {
  applyFilters, filtersFromParams, GAIN_OPTIONS, NO_FILTERS, optionCounts, paramsFromFilters, SIZE_OPTIONS, sortRows, STATUS_LABEL, SUB_OPTIONS, summarise, toCsv, useIpoHistory, yearOf,
  type Filters, type IpoRow, type IpoStatus, type SortKey,
} from "../lib/ipoHistory";
import "../styles/ipo-all.css";
import "../styles/ipo-all-compact.css";

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


// ------------------------------------------------------------------------------------------------ the toolbar's dropdowns (task #308)
const Chev = () => <svg className="dbx-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
const Cross = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>;
const Tick = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>;
const Lens = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
const Tune = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>;

type Opt = { v: string; t: string; c: number };
/** A dropdown button (its label, the value chosen, a count badge) and, while open, its panel. Escape or a click outside closes it and the focus goes
 *  back to the button. */
function Dropdown({ id, label, value, badge, icon, open, setOpen, children }: {
  id: string; label: string; value?: string; badge?: string; icon?: ReactNode; open: boolean; setOpen: (o: boolean) => void; children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", out); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", key); };
  }, [open, setOpen]);
  return (
    <div className="dbx-dd" ref={box}>
      <button type="button" ref={btn} className={"dbx-ddb" + (value ? " on" : "")} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-pop` : undefined} onClick={() => setOpen(!open)}>
        {icon}<span className="dbx-ddl">{label}</span>{value && <span className="dbx-ddv">{value}</span>}{badge && <span className="dbx-badge">{badge}</span>}<Chev />
      </button>
      {open && <div id={`${id}-pop`}>{children}</div>}
    </div>
  );
}

/** The panel of a one-choice dropdown: every option with the number of issues it would leave; arrow keys move between them. */
function OptionList({ title, opts, value, onPick, onClose, wide }: { title: string; opts: Opt[]; value: string; onPick: (v: string) => void; onClose: () => void; wide?: boolean }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { (list.current?.querySelector<HTMLElement>("[aria-selected=true]") ?? list.current?.querySelector<HTMLElement>("[role=option]"))?.focus(); }, []);
  const move = (e: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const all = [...(list.current?.querySelectorAll<HTMLElement>("[role=option]") ?? [])], k = all.indexOf(document.activeElement as HTMLElement);
    const nx = e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : Math.max(0, Math.min(all.length - 1, k + (e.key === "ArrowDown" ? 1 : -1)));
    e.preventDefault(); all[nx]?.focus();
  };
  return (
    <div className={"dbx-pop" + (wide ? " wide" : "")} role="dialog" aria-label={title}>
      <div className="dbx-ph"><span>{title}</span><button type="button" className="dbx-x" onClick={onClose} aria-label="Close"><Cross /></button></div>
      <div className="dbx-ol" role="listbox" aria-label={title} ref={list} onKeyDown={move}>
        {opts.map((o) => { const sel = o.v === value; return (
          <button type="button" role="option" key={o.v} className="dbx-opt" aria-selected={sel} data-zero={o.c === 0 && !sel ? "" : undefined} onClick={() => onPick(o.v)}>
            <span className="dbx-ot">{o.t}</span><span className="dbx-oc">{nf(o.c, 0)}</span>{sel && <span className="dbx-ok"><Tick /></span>}
          </button>); })}
      </div>
    </div>
  );
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
  const [pop, setPop] = useState<string | null>(null);
  const rows = useMemo(() => data?.items ?? [], [data]);
  const set = (next: Partial<Filters>, s: SortKey = sort, d: "asc" | "desc" = dir) => { setParams(paramsFromFilters({ ...f, ...next }, s, d), { replace: true }); setN(PAGE); };
  const shown = useMemo(() => sortRows(applyFilters(rows, f), sort, dir), [rows, f, sort, dir]);
  const sum = useMemo(() => summarise(shown), [shown]);
  const years = useMemo(() => [...new Set(rows.map(yearOf).filter((y): y is string => !!y))].sort().reverse(), [rows]);
  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector).filter((s): s is string => !!s))].sort(), [rows]);
  const opener = (k: string) => [pop === k, (o: boolean) => setPop(o ? k : null)] as const;
  const onSort = (k: SortKey) => set({}, k, sort === k ? (dir === "asc" ? "desc" : "asc") : k === "name" ? "asc" : "desc");
  const csv = () => {
    const url = URL.createObjectURL(new Blob(["﻿" + toCsv(shown)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `finlit-ipos-${data?.asOf ?? "all"}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  // the options of each filter, each with how many issues it would leave with every other filter applied
  const OPTS: Record<Exclude<keyof Filters, "q">, [string, string][]> = useMemo(() => ({
    status: [["all", "All"], ...(["listed", "open", "upcoming", "closed", "not_listed", "withdrawn"] as IpoStatus[]).map((s) => [s, STATUS_LABEL[s]] as [string, string])],
    board: [["all", "All boards"], ["mainboard", "Mainboard"], ["sme", "SME"]], year: [["all", "All years"], ...years.map((y) => [y, y] as [string, string])],
    gain: GAIN_OPTIONS, sub: SUB_OPTIONS, size: SIZE_OPTIONS, exchange: [["all", "NSE and BSE"], ["NSE", "NSE"], ["BSE", "BSE"]],
    sector: [["all", "All sectors"], ...sectors.map((s) => [s, s] as [string, string])],
  }), [years, sectors]);
  const NAME: Record<Exclude<keyof Filters, "q">, string> = { status: "Status", board: "Board", year: "Year", gain: "At listing", sub: "Subscription", size: "Issue size", exchange: "Exchange", sector: "Sector" };
  const counted = (k: Exclude<keyof Filters, "q">): Opt[] => { const c = optionCounts(rows, f, k, OPTS[k].map(([v]) => v)); return OPTS[k].map(([v, t]) => ({ v, t, c: c[v] })); };
  const chosen = (k: Exclude<keyof Filters, "q">) => (f[k] !== NO_FILTERS[k] ? OPTS[k].find(([v]) => v === f[k])?.[1] : undefined);
  const list = (k: Exclude<keyof Filters, "q">, wide?: boolean) => { const [open, setOpen] = opener(k); return (
    <Dropdown key={k} id={`ia-${k}`} label={NAME[k]} value={chosen(k)} open={open} setOpen={setOpen}>
      <OptionList title={NAME[k]} opts={open ? counted(k) : []} value={f[k]} wide={wide} onClose={() => setOpen(false)} onPick={(v) => { set({ [k]: v } as Partial<Filters>); setOpen(false); }} />
    </Dropdown>); };
  const MORE = ["sub", "size", "exchange", "sector"] as const;
  const moreOn = MORE.filter((k) => f[k] !== NO_FILTERS[k]).length;
  const [moreOpen, setMoreOpen] = opener("more");
  const chips = ([...(Object.keys(NAME) as (keyof typeof NAME)[]).filter((k) => f[k] !== NO_FILTERS[k]).map((k) => [k, `${NAME[k]}: ${chosen(k)}`]),
    ...(f.q.trim() ? [["q", `“${f.q.trim()}”`]] : [])] as [keyof Filters, string][]);
  const SORT_NAME: Record<SortKey, string> = { date: "Listed", name: "Company", issuePrice: "Issue price", issueSizeCr: "Issue size", subscription: "Subscribed", gmpPct: "GMP said",
    listingPct: "At listing", listingClosePct: "Day-1 close", lastClose: "Latest close", sinceIpoPct: "Since IPO" };
  const order = sort === "date" ? (dir === "desc" ? "newest first" : "oldest first") : sort === "name" ? (dir === "asc" ? "A to Z" : "Z to A") : dir === "desc" ? "highest first" : "lowest first";
  const share = sum.listed ? Math.round((sum.above / sum.listed) * 100) : null;

  return (
    <div className="wrap ia p4">
      <PageHeader plan="free" title="All IPOs" links={["/ipo", "/results", "/news"]}
        back={<Link to="/ipo">← IPO calendar</Link>}
        description="Every mainboard and SME IPO since 2020: price, subscription, grey market and returns since." />

      <div className="p4-tools" role="search" aria-label="Filter the IPOs">
        <label className="dbx-q"><Lens /><input type="search" placeholder="Company or symbol" value={f.q} onChange={(e) => set({ q: e.target.value })} autoComplete="off" aria-label="Search IPOs" /></label>
        <div className="dbx-dds">
          {list("status")}{list("board")}{list("year")}{list("gain", true)}
          <Dropdown id="ia-more" label="More filters" icon={<Tune />} badge={moreOn ? String(moreOn) : undefined} open={moreOpen} setOpen={setMoreOpen}>
            <div className="dbx-pop right p4-mf" role="dialog" aria-label="More filters">
              <div className="dbx-ph"><span>More filters</span><button type="button" className="dbx-x" onClick={() => setMoreOpen(false)} aria-label="Close"><Cross /></button></div>
              <div className="dbx-mg">{MORE.map((k) => { const c = counted(k); return (
                <label className="dbx-f" key={k}><span>{NAME[k]}</span>
                  <select value={f[k]} data-on={f[k] !== NO_FILTERS[k] ? "" : undefined} onChange={(e) => set({ [k]: e.target.value } as Partial<Filters>)}>
                    {c.map((o) => <option key={o.v} value={o.v}>{o.t}{o.v === NO_FILTERS[k] ? "" : ` (${nf(o.c, 0)})`}</option>)}</select></label>); })}</div>
              <div className="dbx-pf"><button type="button" className="dbx-lk" onClick={() => set({ sub: "any", size: "any", exchange: "all", sector: "all" })}>Clear these</button>
                <button type="button" className="dbx-done" onClick={() => setMoreOpen(false)}>Show {nf(shown.length, 0)} {shown.length === 1 ? "issue" : "issues"}</button></div>
            </div>
          </Dropdown>
        </div>
        <button type="button" className="dbx-ddb p4-csv" onClick={csv} disabled={!shown.length}>Download CSV</button>
      </div>
      {chips.length > 0 && <div className="dbx-chips" role="group" aria-label="Filters that are on">
        {chips.map(([k, t]) => <button type="button" key={k} className="dbx-chip" aria-label={`Remove filter ${t}`} onClick={() => set({ [k]: NO_FILTERS[k] } as Partial<Filters>)}>{t}<Cross /></button>)}
        <button type="button" className="dbx-lk" onClick={() => { setParams(paramsFromFilters(NO_FILTERS, sort, dir), { replace: true }); setN(PAGE); }}>Clear all</button></div>}

      {isError && <p className="formerr">The IPO list could not be loaded. Please try again shortly.</p>}
      {isLoading && <div className="skeleton" style={{ height: 420 }} role="status" aria-label="Loading IPOs" />}
      {data && <>
        <dl className="p4-kpis" aria-label="What the filters show">
          <div><dt>Issues</dt><dd>{nf(sum.count, 0)}</dd></div>
          <div><dt>Raised</dt><dd>{crore(sum.raisedCr)}</dd></div>
          <div><dt>Listed above issue price</dt><dd><span className="up">{nf(sum.above, 0)}</span> <small>of {nf(sum.listed, 0)}{share != null ? ` · ${share}%` : ""}</small></dd></div>
          <div><dt>Listed below</dt><dd><span className={sum.below ? "down" : ""}>{nf(sum.below, 0)}</span></dd></div>
          <div><dt>Median at listing</dt><dd className={tone(sum.medianGain)}>{pct(sum.medianGain)}</dd></div>
          <div><dt>Median since IPO <small>({nf(sum.sinceCount, 0)})</small></dt><dd className={tone(sum.medianSince)}>{pct(sum.medianSince)}</dd></div>
          <div><dt>Median subscription</dt><dd>{times(sum.medianSub)}</dd></div>
        </dl>
        <div className="dbx-rbar"><span className="dbx-cnt" aria-live="polite"><b>{nf(shown.length, 0)}</b> {shown.length === 1 ? "issue" : "issues"} · sorted by {SORT_NAME[sort]}, {order}</span>
          <span className="p4-hint">Select a company for its full report</span></div>
        {!shown.length ? <p className="card ia-none">No IPOs match these filters. <button type="button" className="ia-link" onClick={() => { setParams(paramsFromFilters(NO_FILTERS, sort, dir), { replace: true }); setN(PAGE); }}>Clear filters</button></p> : <>
          <div className="card ia-tw p4-iatw">
            <table className="ia-t p4-iat">
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
          At listing = the listing price (the listing-day open the exchange set) against the issue price. Day-1 close and latest close are the exchange's own closing prices (from NSE's and BSE's daily price files); a share that has not traded lately shows its last close and that day's date. Since IPO = the latest close against the issue price. Where the share has split or issued bonus shares since listing (from NSE's corporate actions; for BSE-only issues, Yahoo Finance's price history), the issue price is adjusted by the same factor, so the figures compare like with like. Where no such record reaches back to the listing, or the share no longer trades, since IPO is left blank rather than risk a wrong figure.
          {" "}Issue details, overall subscription and GMP: <a href={data.sources.issue.url ?? undefined} target="_blank" rel="noopener noreferrer">{data.sources.issue.name}</a>. Subscription by category (QIB, NII, retail): NSE, for mainboard issues. GMP is an informal, unofficial grey-market price, not an exchange figure.
          {" "}Describes the past; not a forecast or advice.
        </p>
      </>}
    </div>
  );
}
