import { useMemo } from "react";
import { CoLogo } from "../components/CoLogo";
import { Link, Navigate, useParams } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { useSearchIndex } from "../lib/api";
import { useDocTitle } from "../lib/title";
import "../styles/glossary.css";
import "../styles/companies.css";

const KEYS = [..."abcdefghijklmnopqrstuvwxyz", "0-9"];
/** The directory page a name belongs on: its first letter or digit (the server uses the same rule). */
const letterOf = (name: string) => { for (const ch of name) { if (/[A-Za-z0-9]/.test(ch)) { const c = ch.toLowerCase(); return c >= "a" && c <= "z" ? c : "0-9"; } } return "0-9"; };

/** /companies and /companies/<letter>: every listed company, A to Z, each a link to its report. The server writes the same list into the page for search engines. */
export function CompaniesPage() {
  const { letter } = useParams();
  const idx = useSearchIndex(true);
  const groups = useMemo(() => {
    const g: Record<string, { symbol: string; name: string; sector: string }[]> = Object.fromEntries(KEYS.map((k) => [k, []]));
    (idx.data?.rows ?? []).forEach((r, i) => { const s = idx.data?.sec?.[i] ?? -1; g[letterOf(r[1])].push({ symbol: r[0], name: r[1], sector: s >= 0 ? idx.data?.sectors?.[s] ?? "" : "" }); });
    KEYS.forEach((k) => g[k].sort((a, b) => a.name.localeCompare(b.name)));
    return g;
  }, [idx.data]);
  const total = KEYS.reduce((n, k) => n + groups[k].length, 0);
  const one = letter?.toLowerCase();
  const rows = one ? groups[one] ?? [] : [];
  useDocTitle(one ? `Indian companies starting with ${one.toUpperCase()}` : "All listed Indian companies, A to Z",
    one ? `${rows.length} listed Indian companies whose names start with ${one.toUpperCase()}, with their sectors. Open any to see its statements, ratios, peers and ownership.`
      : `Browse all ${total ? total.toLocaleString("en-IN") + " " : ""}listed Indian companies from A to Z with their sectors, and open any company's statements, ratios, peers and ownership.`);
  if (letter && !KEYS.includes(one ?? "")) return <Navigate to="/companies" replace />;
  return (
    <>
      <PageHeader wrap title={one ? `Companies starting with ${one.toUpperCase()}` : "Listed companies, A to Z"} art="report" links={["/research", "/screener", "/glossary"]}
        stats={total ? [{ icon: "table", value: total, label: "Companies" }] : []}
        description={<>Every listed Indian company in one alphabetical list. Pick a letter, then open a company to see its statements, ratios, growth, peers and ownership. Describes the company's financial health from its filings and prices; not a recommendation. Information only, not investment advice.</>} />
      <div className="wrap gx">
        <nav className="gx-bar" aria-label="Letters">
          <div className="gx-az">
            <Link className={!one ? "on" : ""} to="/companies">All</Link>
            {KEYS.map((k) => groups[k].length ? <Link key={k} className={one === k ? "on" : ""} to={`/companies/${k}`}>{k.toUpperCase()}</Link> : <span key={k} className="cx-off">{k.toUpperCase()}</span>)}
          </div>
        </nav>
        {idx.isLoading && <p className="faint" role="status">Loading the company list…</p>}
        {idx.isError && <div className="state"><h2>The company list is unavailable right now</h2><p>Please try again in a moment, or <Link to="/research">search by name</Link>.</p></div>}
        {!one && !idx.isLoading && !idx.isError && (
          <ul className="cx-letters">{KEYS.filter((k) => groups[k].length).map((k) => <li key={k}><Link to={`/companies/${k}`}><b>{k.toUpperCase()}</b><span>{groups[k].length.toLocaleString("en-IN")} companies</span></Link></li>)}</ul>
        )}
        {one && <ul className="cx-list">{rows.map((r) => <li key={r.symbol}><Link to={`/stocks/${encodeURIComponent(r.symbol)}`}><CoLogo symbol={r.symbol} name={r.name} size={20} inline />{r.name} <span className="faint">({r.symbol})</span></Link>{r.sector && <span className="faint"> · {r.sector}</span>}</li>)}</ul>}
        {one && !rows.length && !idx.isLoading && !idx.isError && <div className="state"><h2>No companies start with {one.toUpperCase()}</h2><p><Link to="/companies">Back to all letters</Link></p></div>}
      </div>
    </>
  );
}
