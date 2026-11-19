// Superinvestor portfolios (task #212): what named investors own, from the companies' own shareholding filings (named public holders of 1% or more,
// via FinEdge, kept nightly by the ownership-insights job). The list is open to everyone; a portfolio (stock picks, weightings, sector allocation and the
// year's changes) is part of Silver and Gold, and the server sends it only to them (finlit/superinvestors.py). Describes, never advises.
// Styles: styles/superinvestors.css (si-).
import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../components/PageHeader";
import { Gate } from "../components/Gate";
import { ApiError, apiGet } from "../lib/api";
import { useUI } from "../lib/ui";
import { useDocTitle } from "../lib/title";
import "../styles/superinvestors.css";
import { coTitle, shortLabel } from "../lib/companyLabel";

export type SiStatus = "new" | "added" | "reduced" | "exited" | "unchanged";
export type SiHolding = { symbol: string; name: string; industry: string | null; sector: string | null; stakeNow: number | null; stakeYearAgo: number | null; changePts: number | null;
  status: SiStatus; statusText: string; asOf: string | null; fetched: string | null; valueCr?: number | null; valueWhy?: string | null; weightPct?: number | null; sectorWhy?: string };
export type SiSummary = { key: string; name: string; kind?: "person" | "firm"; companies: number; valueCr: number | null; valueNote: string | null; top: { symbol: string; name: string; weightPct: number | null }[];
  changes: Record<"new" | "added" | "reduced" | "exited", number> };
type Meta = { asOf: string | null; fetchedFrom: string | null; fetchedTo: string | null; pricesAt?: string | null; source: string; disclaimer: string; noteNames: string; rule: string };
export type SiList = Meta & { investors: SiSummary[]; count: number; people?: number; firms?: number; emptyWhy: string | null; covered: number; companies: number | null };
export type SiPortfolio = SiSummary & Meta & { holdings: SiHolding[]; sectors: { sector: string; valueCr: number; weightPct: number | null; companies: number }[]; history: SiHolding[] };

const BASE = "/superinvestors";
const FIRST = 30;
const GATE = ["Every stock each investor is named in, with the stake and its value today", "Weightings and sector allocation", "What changed over the year: newly named, stakes up or down, no longer named"];

export const crore = (v: number | null | undefined) => v == null ? "—" : `₹${v >= 100 ? Math.round(v).toLocaleString("en-IN") : v.toLocaleString("en-IN", { maximumFractionDigits: 1 })} cr`;
export const pct = (v: number | null | undefined, d = 2) => v == null ? "—" : `${v.toFixed(d)}%`;
export const pts = (v: number | null | undefined) => v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)} pts`;
const day = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
const shortName = (n: string) => n.replace(/\s+(Ltd|Limited)\.?$/i, "");

/** "2 newly named · 1 up · 1 down · 1 no longer named", or "No changes in the year". */
export function changesLine(c: SiSummary["changes"]): string {
  const parts = [[c.new, "newly named"], [c.added, "up"], [c.reduced, "down"], [c.exited, "no longer named"]].filter(([n]) => (n as number) > 0).map(([n, w]) => `${n} ${w}`);
  return parts.length ? parts.join(" · ") : "No changes in the year";
}

function Source({ m, covered, companies }: { m: Meta; covered?: number; companies?: number | null }) {
  const fetched = m.fetchedFrom && m.fetchedTo ? (m.fetchedFrom === m.fetchedTo ? day(m.fetchedFrom) : `${day(m.fetchedFrom)} – ${day(m.fetchedTo)}`) : null;
  return (
    <div className="si-src">
      <p><b>Source.</b> {m.source}{covered != null && <> Built from the filings of <b>{covered.toLocaleString("en-IN")}</b>{companies ? <> of {companies.toLocaleString("en-IN")}</> : null} listed companies.</>}
        {m.asOf && <> Latest quarter <b>{m.asOf}</b>{fetched && <> (fetched {fetched})</>}.</>}{m.pricesAt && <> Prices of {day(m.pricesAt)}.</>}</p>
      <p><b>Who is listed.</b> {m.rule} {m.noteNames}</p>
      <p className="si-disc">{m.disclaimer}</p>
    </div>
  );
}

export function SuperinvestorsPage() {
  useDocTitle("Superinvestor portfolios", "What named investors own: every public shareholder named with 1% or more in two or more listed companies, from the companies' own filings. Information only, not advice.");
  const q = useQuery<SiList, ApiError>({ queryKey: ["superinvestors"], queryFn: () => apiGet("/api/superinvestors"), staleTime: 600_000, retry: 1 });
  const [find, setFind] = useState("");
  const [all, setAll] = useState(false);
  // People first (the "superinvestors" of the task); companies and funds one tab away. The tab is in the address, so a shared link keeps it.
  const [sp, setSp] = useSearchParams();
  const show: "person" | "firm" = sp.get("show") === "firms" ? "firm" : "person";
  const setShow = (k: "person" | "firm") => { setAll(false); setSp((prev) => { const n = new URLSearchParams(prev); if (k === "firm") n.set("show", "firms"); else n.delete("show"); return n; }, { replace: true }); };
  const inTab = useMemo(() => (q.data?.investors ?? []).filter((r) => (r.kind ?? "person") === show), [q.data, show]);
  const list = useMemo(() => {
    const t = find.trim().toLowerCase();
    const rows = inTab;
    return t ? rows.filter((r) => r.name.toLowerCase().includes(t) || r.top.some((h) => h.symbol.toLowerCase().includes(t) || h.name.toLowerCase().includes(t))) : rows;
  }, [inTab, find]);
  const shown = all || find ? list : list.slice(0, FIRST);
  return (
    <>
      <PageHeader wrap eyebrow="Research" title="Superinvestor portfolios" links={["/research", "/screener", "/plans"]}
        description={<>What named investors own, from the companies' own shareholding filings: every public shareholder named with <b>1% or more</b> in at least two listed companies, with the value of each stake today and what changed over the year. Information only, not investment advice.</>} />
      <div className="wrap si">
        {q.isPending && <p className="si-wait" role="status">Loading the investors…</p>}
        {q.isError && <p className="formerr" role="alert">The list could not be loaded ({q.error.status || "network"}). Please try again in a moment.</p>}
        {q.data && <>
          <div className="si-bar">
            <label className="si-find"><span className="si-lab">Find an investor or a company</span>
              <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Name or company symbol" aria-label="Find an investor or a company" /></label>
            <p className="si-count" aria-live="polite">{find ? `${list.length} of ${inTab.length.toLocaleString("en-IN")}` : `${inTab.length.toLocaleString("en-IN")} ${show === "person" ? "people" : "companies and funds"}`}</p>
          </div>
          <div className="si-tabs" role="tablist" aria-label="Who to list">
            {([["person", "People", q.data.people], ["firm", "Companies and funds", q.data.firms]] as const).map(([k, label, n]) => (
              <button key={k} type="button" role="tab" aria-selected={show === k} className={"si-tab" + (show === k ? " on" : "")} onClick={() => setShow(k)}>
                {label}{n != null && <small> {n.toLocaleString("en-IN")}</small>}</button>))}
          </div>
          {q.data.emptyWhy ? <p className="si-empty">{q.data.emptyWhy}</p>
            : list.length === 0 ? <p className="si-empty">{find ? <>No {show === "person" ? "person" : "company or fund"} matches “{find}”{(q.data.investors.some((r) => (r.kind ?? "person") !== show && r.name.toLowerCase().includes(find.trim().toLowerCase()))) && <> here; try <button type="button" className="linkish" onClick={() => setShow(show === "person" ? "firm" : "person")}>{show === "person" ? "Companies and funds" : "People"}</button></>}.</> : "No investor in this group."}</p>
            : <ol className="si-list">{shown.map((r, i) => (
              <li key={r.key} className="si-row">
                <span className="si-rank" aria-hidden="true">{i + 1}</span>
                <div className="si-who">
                  <Link to={`${BASE}/${r.key}`} className="si-name">{r.name}</Link>
                  <span className="si-sub">{r.companies} {r.companies === 1 ? "company" : "companies"} · {changesLine(r.changes)}</span>
                  <span className="si-top">{r.top.map((h) => <span key={h.symbol} className="si-chip" title={coTitle(h) ?? h.name}>{shortLabel(h)}{h.weightPct != null && <small> {h.weightPct.toFixed(0)}%</small>}</span>)}</span>
                </div>
                <div className="si-val"><b>{crore(r.valueCr)}</b><small>{r.valueCr == null ? "No market values today" : "value of the stakes today"}</small>{r.valueNote && <small className="si-note">{r.valueNote}</small>}</div>
              </li>))}</ol>}
          {!find && !all && list.length > FIRST && <button type="button" className="btn ghost si-more" onClick={() => setAll(true)}>Show all {list.length.toLocaleString("en-IN")}</button>}
          <Source m={q.data} covered={q.data.covered} companies={q.data.companies} />
        </>}
      </div>
    </>
  );
}

const STATUS_CLS: Record<SiStatus, string> = { new: "up", added: "up", reduced: "down", exited: "down", unchanged: "flat" };

export function SuperinvestorPage() {
  const { key = "" } = useParams();
  const { has } = useUI();
  const silver = has("silver");
  const list = useQuery<SiList, ApiError>({ queryKey: ["superinvestors"], queryFn: () => apiGet("/api/superinvestors"), staleTime: 600_000, retry: 1 });
  const q = useQuery<SiPortfolio, ApiError>({ queryKey: ["superinvestor", key, silver], queryFn: () => apiGet(`/api/superinvestors/${encodeURIComponent(key)}`), enabled: silver && !!key, retry: false, staleTime: 600_000 });
  const brief = list.data?.investors.find((x) => x.key === key);
  const name = q.data?.name ?? brief?.name ?? key.replace(/-/g, " ");
  useDocTitle(`${name}: portfolio`, `What ${name} holds, from companies' shareholding filings: stakes of 1% or more, their value today, sector allocation and the year's changes. Information only, not advice.`);
  const p = q.data;
  const notFound = q.error?.status === 404 || (!silver && list.data && !brief);
  return (
    <>
      <PageHeader wrap eyebrow={<Link to={BASE}>Superinvestor portfolios</Link>} plan="silver" title={name} links={[BASE, "/research"]}
        description={brief || p ? <>Named with 1% or more in <b>{(p ?? brief)!.companies}</b> listed {(p ?? brief)!.companies === 1 ? "company" : "companies"}, worth <b>{crore((p ?? brief)!.valueCr)}</b> at today's prices. From the companies' own filings; information only, not investment advice.</> : undefined} />
      <div className="wrap si">
        {notFound ? <p className="si-empty">{q.error?.body?.detail as string || "No investor by that name in the stored filings."} <Link to={BASE}>See every investor →</Link></p>
          : <Gate tier="silver" title="Superinvestor portfolios" points={GATE}>
            {silver && q.isPending && <p className="si-wait" role="status">Loading the portfolio…</p>}
            {silver && q.isError && <p className="formerr" role="alert">The portfolio could not be loaded ({q.error.status || "network"}). Please try again in a moment.</p>}
            {(p || !silver) && <Portfolio p={p} brief={brief} />}
          </Gate>}
        {(p ?? list.data) && <Source m={(p ?? list.data)!} />}
      </div>
    </>
  );
}

/** The portfolio; without the data (a plan that does not include it), the outline the lock sits on, from the list's own figures. */
function Portfolio({ p, brief }: { p?: SiPortfolio; brief?: SiSummary }) {
  const s = p ?? brief;
  const c = s?.changes ?? { new: 0, added: 0, reduced: 0, exited: 0 };
  const max = Math.max(1, ...(p?.sectors.map((x) => x.weightPct ?? 0) ?? [1]));
  return (
    <div className="si-body">
      <div className="si-stats">
        <div className="si-stat"><span>Companies</span><b>{s?.companies ?? "—"}</b><small>named with 1% or more</small></div>
        <div className="si-stat"><span>Value today</span><b>{crore(s?.valueCr)}</b><small>{s?.valueNote ?? "stake × market capitalisation"}</small></div>
        <div className="si-stat"><span>Latest quarter</span><b>{p?.asOf ?? "—"}</b><small>{p ? "of most of the filings" : "in the full portfolio"}</small></div>
        <div className="si-stat"><span>The year's changes</span><b>{c.new + c.added + c.reduced + c.exited}</b><small>{changesLine(c)}</small></div>
      </div>

      <section className="card si-sec" aria-labelledby="si-h-hold">
        <h2 id="si-h-hold">Stock picks and weightings</h2>
        <p className="si-lead">Each company the investor is named in, largest value first. Weight is the stake's share of the value of all the stakes shown.</p>
        <div className="si-scroll" tabIndex={0} role="region" aria-label="Holdings table, scrolls sideways">
          <table className="si-t">
            <thead><tr><th scope="col">Company</th><th scope="col">Industry</th><th scope="col" className="n">Stake</th><th scope="col" className="n">A year ago</th><th scope="col" className="n">Change</th><th scope="col" className="n">Value today</th><th scope="col" className="n">Weight</th></tr></thead>
            <tbody>{(p?.holdings ?? brief?.top.map((t) => ({ symbol: t.symbol, name: t.name, weightPct: t.weightPct } as SiHolding)) ?? []).map((h) => (
              <tr key={h.symbol}>
                <th scope="row"><Link to={`/stocks/${h.symbol}`}>{shortName(h.name)}</Link><small>{h.symbol}{h.asOf ? ` · filing ${h.asOf}` : ""}</small></th>
                <td title={h.sectorWhy ?? undefined}>{h.industry ?? (p ? <span className="si-why">Not classified</span> : "—")}</td>
                <td className="n">{pct(h.stakeNow)}</td>
                <td className="n">{h.stakeYearAgo == null && p ? <span className="si-why" title="The filing a year ago did not name this investor">not named</span> : pct(h.stakeYearAgo)}</td>
                <td className={"n si-" + STATUS_CLS[h.status ?? "unchanged"]}>{p ? (h.status === "new" ? "new" : pts(h.changePts)) : "—"}</td>
                <td className="n">{h.valueCr == null && h.valueWhy ? <span className="si-why" title={h.valueWhy}>no price</span> : crore(h.valueCr)}</td>
                <td className="n"><span className="si-w"><i style={{ width: `${Math.max(0, Math.min(100, h.weightPct ?? 0))}%` }} aria-hidden="true" />{pct(h.weightPct, 1)}</span></td>
              </tr>))}</tbody>
          </table>
        </div>
        {p?.holdings.some((h) => h.valueWhy) && <p className="si-foot">“no price”: {p.holdings.find((h) => h.valueWhy)!.valueWhy} Such a stake is left out of the value and the weights.</p>}
      </section>

      <section className="card si-sec" aria-labelledby="si-h-sec">
        <h2 id="si-h-sec">Sector allocation</h2>
        <p className="si-lead">The value of the stakes by NSE sector.</p>
        {p ? (p.sectors.length ? <ul className="si-secs">{p.sectors.map((x) => (
          <li key={x.sector}><span className="si-sn">{x.sector}<small>{x.companies} {x.companies === 1 ? "company" : "companies"}</small></span>
            <span className="si-sb" aria-hidden="true"><i style={{ width: `${((x.weightPct ?? 0) / max) * 100}%` }} /></span><b>{pct(x.weightPct, 1)}</b></li>))}</ul>
          : <p className="si-empty">No stake has a market value today, so there is nothing to split by sector.</p>)
          : <ul className="si-secs"><li><span className="si-sn">Sector</span><span className="si-sb"><i style={{ width: "60%" }} /></span><b>—</b></li></ul>}
      </section>

      <section className="card si-sec" aria-labelledby="si-h-hist">
        <h2 id="si-h-hist">What changed over the year</h2>
        <p className="si-lead">The latest filing against the one a year earlier. A holder below 1% is not named, so “no longer named” means the investor sold or now holds under 1%; the filing does not say which.</p>
        {p ? (p.history.length ? <ul className="si-hist">{p.history.map((h) => (
          <li key={h.symbol + h.status}><span className={"si-tag si-" + STATUS_CLS[h.status]}>{h.status === "new" ? "Newly named" : h.status === "added" ? "Stake up" : h.status === "reduced" ? "Stake down" : "No longer named"}</span>
            <Link to={`/stocks/${h.symbol}`}>{shortName(h.name)}</Link>
            <span className="si-ft">{h.status === "new" ? `${pct(h.stakeNow)} now` : h.status === "exited" ? `${pct(h.stakeYearAgo)} a year ago` : `${pct(h.stakeYearAgo)} → ${pct(h.stakeNow)}`}</span></li>))}</ul>
          : <p className="si-empty">No stake changed between the two filings.</p>)
          : <ul className="si-hist"><li><span className="si-tag si-flat">Change</span>—</li></ul>}
      </section>
    </div>
  );
}
