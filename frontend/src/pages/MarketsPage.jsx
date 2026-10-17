import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import CommodityExplorer from "@/components/CommodityExplorer";
import AdminShell from "@/components/cms/AdminShell";
import { cmsRequest } from "@/lib/cms";

const TABS = [
  ["ipo", "IPO calendar"], ["results", "Results calendar"],
  ["announcements", "Announcements"], ["transcripts", "Call transcripts"],
  ["commodities", "Commodity prices"], ["indices", "Index prices"], ["valuations", "Index valuation"],
];
const NOTES = {
  ipo: "Upcoming and recent public issues, with opening dates, price bands and issue details.",
  results: "Expected earnings announcement dates. Dates are indicative and may change.",
  announcements: "Company disclosures and exchange announcements. Search up to seven days at a time.",
  transcripts: "Investor and earnings call transcripts, linked to the original filings. Search up to seven days at a time.",
  indices: "Latest reported end-of-day index prices and valuation multiples. Check the as-of date for each index.",
  valuations: "Daily historical P/E, P/B and dividend yield for a selected index.",
};
const PAGE_SIZE = 25;
const inputClass = "h-11 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--app-bg)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--home-gold)]";
const buttonClass = "rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm transition-colors hover:border-[var(--home-gold)] disabled:opacity-40";

function indiaDate(offset = 0) {
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function defaults(section, index = "") {
  const short = ["announcements", "transcripts"].includes(section);
  return { from: indiaDate(short ? -6 : section === "valuations" ? -30 : -7), to: indiaDate(short || section === "valuations" ? 0 : 15), symbol: "", index };
}

async function requestFeed(section, filters, signal) {
  const params = new URLSearchParams();
  if (section !== "indices") {
    params.set("from_date", filters.from);
    params.set("to_date", filters.to);
  }
  if (["announcements", "transcripts"].includes(section) && filters.symbol.trim()) params.set("symbol", filters.symbol.trim().toUpperCase());
  if (section === "valuations") params.set("index_symbol", filters.index);
  return cmsRequest(`/market-data/${section}?${params}`, { signal });
}

export function filterMarketRows(items, query) {
  const needle = query.trim().toLowerCase();
  return items.filter((row) => Object.entries(row).some(([key, value]) => key !== "document_url" && value != null && String(value).toLowerCase().includes(needle)));
}

function numeric(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString("en-IN", { maximumFractionDigits: 2 })}${suffix}` : "—";
}

function documentLink(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function displayDate(value) {
  if (!value) return "—";
  const parsed = new Date(String(value).includes(" ") ? String(value).replace(" ", "T") : value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export default function MarketsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const section = TABS.some(([key]) => key === params.get("view")) ? params.get("view") : "ipo";
  const indexFromUrl = params.get("index") || "";
  const [filters, setFilters] = useState(() => defaults(section, indexFromUrl));
  const [submission, setSubmission] = useState(() => ({ section, filters: defaults(section, indexFromUrl) }));
  const [responseData, setData] = useState(null);
  const data = responseData?.section === section ? responseData : null;
  const [indices, setIndices] = useState([]);
  const [indexError, setIndexError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const next = defaults(section, indexFromUrl);
    setFilters(next);
    setSubmission({ section, filters: next });
    setSearch("");
    setPage(0);
  }, [section, indexFromUrl]);

  useEffect(() => {
    if (section === "commodities" || submission.section !== section) return undefined;
    setData(null);
    setError("");
    if (section === "valuations" && !submission.filters.index) { setLoading(false); return undefined; }
    const controller = new AbortController();
    setLoading(true);
    requestFeed(section, submission.filters, controller.signal)
      .then((response) => { if (!controller.signal.aborted) { setData(response); if (section === "indices") setIndices(response.items); } })
      .catch((requestError) => { if (!controller.signal.aborted) { if (requestError.status === 401) navigate("/blog/admin/login", { replace: true }); else setError(requestError.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [navigate, section, submission]);

  useEffect(() => {
    if (section !== "valuations" || indices.length) return undefined;
    const controller = new AbortController();
    setIndexError("");
    requestFeed("indices", {}, controller.signal).then((response) => { if (!controller.signal.aborted) setIndices(response.items); })
      .catch((requestError) => { if (!controller.signal.aborted) { if (requestError.status === 401) navigate("/blog/admin/login", { replace: true }); else setIndexError("The index list could not be loaded. Switch to Index prices and retry."); } });
    return () => controller.abort();
  }, [navigate, section, indices.length]);

  const rows = useMemo(() => filterMarketRows(data?.items || [], search), [data, search]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const title = TABS.find(([key]) => key === section)[1];
  const isDisclosure = ["announcements", "transcripts"].includes(section);
  const selectedIndexName = indices.find((row) => row.index_symbol === submission.filters.index)?.index_name || submission.filters.index;

  const apply = (event) => {
    event.preventDefault();
    if (filters.to < filters.from) { setError("The end date must be on or after the start date."); return; }
    if (isDisclosure && (new Date(filters.to) - new Date(filters.from)) / 86400000 > 7) { setError("Choose a range of at most seven days."); return; }
    setPage(0);
    setSubmission({ section, filters: { ...filters } });
  };

  const columns = section === "ipo" ? ["Company", "Opens", "Closes", "Status", "Price band", "Issue size (shares)", "Subscription", "Exchange"]
    : section === "results" ? ["Company", "Expected results"]
      : isDisclosure ? ["Company", "Published", "Category", "Disclosure", "Document"]
        : section === "indices" ? ["Index", "As of", "Close", "Change %", "P/E", "P/B", "Dividend yield", "History"]
          : ["Date", "P/E", "P/B", "Dividend yield"];

  return (
    <AdminShell>
      <header className="mb-8 mt-8 max-w-3xl">
        <Link to="/blog/admin" className="mb-5 inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--home-gold)] hover:border-[var(--home-gold)]">← Back to CMS</Link>
        <p className="text-xs uppercase tracking-[.22em] text-[var(--home-gold)]">Market research</p>
        <h1 className="mt-3 font-serif-display text-4xl md:text-5xl">Market Events &amp; Index Dashboard</h1>
        <p className="mt-4 text-[var(--home-support)]">Company events, exchange disclosures, commodity trends and Indian index data in one place.</p>
      </header>
      <nav aria-label="Market sections" className="mb-6 flex flex-wrap gap-2">
        {TABS.map(([key, label]) => <button type="button" key={key} aria-current={section === key ? "page" : undefined} onClick={() => setParams({ view: key })} className={`${buttonClass} ${section === key ? "bg-[var(--home-gold)] text-[var(--home-button-text)]" : "text-[var(--home-support)]"}`}>{label}</button>)}
      </nav>
      {section === "commodities" ? <CommodityExplorer /> : <section aria-label={title} className="rounded-xl border border-[var(--border-subtle)] p-4 md:p-6">
        <h2 className="text-2xl font-medium">{title}</h2>
        <p className="mb-6 mt-2 text-sm leading-relaxed text-[var(--home-support)]">{NOTES[section]}</p>
        <form onSubmit={apply} className="mb-5 flex flex-wrap items-end gap-3">
          {section !== "indices" ? <>
            <label className="min-w-[140px] flex-1 text-xs text-[var(--home-support)]">From date<input className={`${inputClass} mt-2`} type="date" value={filters.from} required onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
            <label className="min-w-[140px] flex-1 text-xs text-[var(--home-support)]">To date<input className={`${inputClass} mt-2`} type="date" value={filters.to} min={filters.from} required onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
          </> : null}
          {isDisclosure ? <label className="min-w-[160px] flex-1 text-xs text-[var(--home-support)]">Company symbol (optional)<input className={`${inputClass} mt-2`} value={filters.symbol} maxLength={30} placeholder="All companies" onChange={(event) => setFilters({ ...filters, symbol: event.target.value.toUpperCase() })} /></label> : null}
          {section === "valuations" ? <label className="min-w-[200px] flex-1 text-xs text-[var(--home-support)]">Index<select className={`${inputClass} mt-2`} value={filters.index} required onChange={(event) => setFilters({ ...filters, index: event.target.value })}><option value="">Select an index</option>{indices.map((row) => <option key={row.index_symbol} value={row.index_symbol}>{row.index_name || row.index_symbol}</option>)}</select></label> : null}
          <button disabled={loading || (section === "valuations" && !filters.index)} className="h-11 rounded-lg bg-[var(--home-gold)] px-5 text-sm font-medium text-[var(--home-button-text)] disabled:opacity-50">{loading ? "Loading…" : section === "indices" ? "Refresh prices" : "Apply filters"}</button>
        </form>
        {indexError && section === "valuations" ? <p role="alert" className="mb-4 text-sm text-[#C98182]">{indexError}</p> : null}
        {error ? <div role="alert" className="mb-4 rounded-lg border border-[#C98182]/40 p-4 text-sm"><p>{error}</p><button type="button" onClick={() => setSubmission({ ...submission })} className={`${buttonClass} mt-3`}>Retry</button></div> : null}
        {loading ? <p role="status" className="py-12 text-center text-[var(--home-support)]">Loading {title.toLowerCase()}…</p> : null}
        {!loading && !error && section === "valuations" && !submission.filters.index ? <p className="py-8 text-[var(--home-support)]">Choose an index and apply filters to view valuation history.</p> : null}
        {!loading && data && !error ? <>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div className="text-sm text-[var(--home-support)]"><p>{data.total.toLocaleString("en-IN")} records{section === "valuations" ? ` · ${selectedIndexName}` : ""}</p><p className="mt-1 text-xs">Source: FinEdge · Fetched {new Date(data.fetchedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST{data.cached ? " · Cached" : ""}</p></div>
            <label className="min-w-[220px] text-xs text-[var(--home-support)]">Search these results<input className={`${inputClass} mt-2`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder={section === "indices" ? "Index name or symbol" : "Company, symbol or keyword"} /></label>
          </div>
          {rows.length ? <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
            <table className="w-full min-w-[550px] text-left text-sm">
              <thead className="bg-[var(--home-header-bg)] text-xs uppercase tracking-wider text-[var(--home-support)]"><tr>{columns.map((column) => <th key={column} scope="col" className="whitespace-nowrap p-3 font-medium">{column}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">{visible.map((row, index) => {
                const company = <div className="min-w-[160px]"><div className="font-medium">{row.company_name || row.symbol || "—"}</div>{row.company_name ? <div className="mt-1 text-xs text-[var(--home-support)]">{row.symbol}</div> : null}</div>;
                const link = documentLink(row.document_url);
                const cells = section === "ipo" ? [company, displayDate(row.start_date), displayDate(row.end_date), row.ipo_status, row.price_range, row.issue_size, row.subscription, row.exchange]
                  : section === "results" ? [company, displayDate(row.expected_result_date)]
                    : isDisclosure ? [company, displayDate(row.date), row.category, <p className="min-w-[260px] max-w-xl whitespace-normal leading-relaxed">{row.description || "—"}</p>, link ? <a href={link} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-[var(--home-gold)] underline underline-offset-4">Open document</a> : "Not available"]
                      : section === "indices" ? [<div className="min-w-[180px]"><div className="font-medium">{row.index_name || row.index_symbol}</div><div className="mt-1 text-xs text-[var(--home-support)]">{row.index_symbol}</div></div>, displayDate(row.quote_date), numeric(row.close_price), <span className={row.change_pct > 0 ? "text-[#75B89B]" : row.change_pct < 0 ? "text-[#C98182]" : ""}>{row.change_pct > 0 ? "+" : ""}{numeric(row.change_pct, "%")}</span>, numeric(row.pe), numeric(row.pb), numeric(row.div_yield, "%"), <button type="button" onClick={() => setParams({ view: "valuations", index: row.index_symbol })} aria-label={`View valuation for ${row.index_name || row.index_symbol}`} className="text-[var(--home-gold)] underline underline-offset-4">Valuation</button>]
                        : [displayDate(row.quote_date), numeric(row.pe), numeric(row.pb), numeric(row.div_yield, "%")];
                return <tr key={`${section}-${index}-${row.symbol || row.index_symbol || ""}`}>{cells.map((cell, cellIndex) => <td key={cellIndex} className="p-3 align-top tabular-nums">{cell === null || cell === undefined || cell === "" ? "—" : cell}</td>)}</tr>;
              })}</tbody>
            </table>
          </div> : <p className="rounded-lg border border-[var(--border-subtle)] p-6 text-[var(--home-support)]">{data.total ? "No records match your search." : "No records were returned for these filters. Try another date range or company."}</p>}
          {rows.length > PAGE_SIZE ? <div className="mt-4 flex items-center justify-between gap-3 text-sm"><button type="button" className={buttonClass} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span className="text-xs text-[var(--home-support)]">Page {currentPage + 1} of {pageCount} · {rows.length.toLocaleString("en-IN")} records</span><button type="button" className={buttonClass} disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div> : null}
        </> : null}
      </section>}
    </AdminShell>
  );
}
