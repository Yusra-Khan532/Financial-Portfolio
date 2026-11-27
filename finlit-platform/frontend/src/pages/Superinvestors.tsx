// Superinvestor portfolios (task #212; task #289, the developer file of 21 Nov 2026): what well-known investors own and changed, from the companies' own
// shareholding filings (named public holders of 1% or more, via FinEdge, kept nightly by the ownership-insights job), with FinLit's view of each stock.
// Two tabs: Tracked investors (the editors' list, each investor under every name they file with) and All named holders (the filings as written; open to
// everyone). Tracked investors and every portfolio page are part of Gold, and the server sends them only to Gold (finlit/superinvestors.py).
// Pages: /superinvestors, /superinvestors/<tracked-key>, /superinvestors/name/<name-key>. Describes, never advises. Styles: styles/superinvestors.css.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../components/PageHeader";
import { Gate } from "../components/Gate";
import { ApiError, apiGet } from "../lib/api";
import { useUI } from "../lib/ui";
import { useDocTitle } from "../lib/title";
import "../styles/superinvestors.css";
import { coTitle, shortLabel } from "../lib/companyLabel";
import { PLAN_FOR_SUPERINVESTORS } from "../lib/planGates";
import type { Moved, TrackedPage, TrackedTab } from "../superinvestors/types";
import { Cards, LatestMoves, TheyAgree, Tiles } from "../superinvestors/TrackedTab";
import { InvestorBody } from "../superinvestors/InvestorBody";
import { FollowButton, FollowingAlerts, YourStocks, useFollows } from "../superinvestors/Follow";

export type SiStatus = "new" | "added" | "reduced" | "exited" | "unchanged";
export type SiHolding = { symbol: string; name: string; industry: string | null; sector: string | null; stakeNow: number | null; stakeYearAgo: number | null; changePts: number | null;
  status: SiStatus; statusText: string; asOf: string | null; fetched: string | null; valueCr?: number | null; valueWhy?: string | null; weightPct?: number | null; sectorWhy?: string };
export type SiSummary = { key: string; name: string; kind?: "person" | "firm"; tracked?: { key: string; name: string } | null; companies: number; valueCr: number | null; valueNote: string | null; top: { symbol: string; name: string; weightPct: number | null }[];
  changes: Record<"new" | "added" | "reduced" | "exited", number> };
type Meta = { asOf: string | null; fetchedFrom: string | null; fetchedTo: string | null; pricesAt?: string | null; source: string; disclaimer: string; noteNames: string; rule: string };
export type SiList = Meta & { investors: SiSummary[]; count: number; people?: number; firms?: number; emptyWhy: string | null; covered: number; companies: number | null };
export type SiPortfolio = SiSummary & Meta & { holdings: SiHolding[]; sectors: { sector: string; valueCr: number; weightPct: number | null; companies: number }[]; history: SiHolding[] };

const BASE = "/superinvestors";
const FIRST = 30;
const GATE = ["Each tracked investor's stocks, under every name they file with", "Moves in the latest filings: new stakes, stakes up or cut, no longer named",
  "Stocks several investors hold, with FinLit Prism, technical scores and peer labels", "Which of your stocks they hold, and an alert when they file a change"];
const DESCRIPTION = "What well-known investors own and changed, from shareholding filings (holders of 1% or more).";
const ALL_NOTE = "Every name filed with 1% or more in two or more companies. This list is as the filings write it: it includes company insiders, strategic holders and family members, one investor can appear under several names, and two people with the same name appear as one. The names FinLit groups into a tracked investor are marked.";

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

function Source({ m, covered, tracked }: { m: Meta; covered?: number; companies?: number | null; tracked?: string }) {
  return (
    <div className="si-src">
      {/* task #311: what it is, how many companies and the dates; no fetch window or method */}
      <p><b>Source.</b> {m.source}{covered != null && <> <b>{covered.toLocaleString("en-IN")}</b> companies covered.</>}
        {(m.asOf || m.pricesAt) && <> {[m.asOf ? `Latest quarter ${m.asOf}` : null, m.pricesAt ? `${m.asOf ? "prices" : "Prices"} of ${day(m.pricesAt)}` : null].filter(Boolean).join(" · ")}.</>}</p>
      {tracked ? <p><b>{tracked.split(". ")[0]}.</b> {tracked.split(". ").slice(1).join(". ")}</p> : <p><b>Who is listed.</b> {m.rule} {m.noteNames}</p>}
      <p className="si-disc">{m.disclaimer}</p>
    </div>
  );
}

export function SuperinvestorsPage() {
  useDocTitle("Superinvestor portfolios", "What well-known investors own and changed, from the companies' own shareholding filings, with FinLit's view of each stock. Information only, not advice.");
  const { has } = useUI();
  const gold = has(PLAN_FOR_SUPERINVESTORS);
  const q = useQuery<SiList, ApiError>({ queryKey: ["superinvestors"], queryFn: () => apiGet("/api/superinvestors"), staleTime: 600_000, retry: 1 });
  const [since, setSince] = useState<"year" | "quarter" | null>(null);     // null: the server's default (last quarter once enough is stored)
  const t = useQuery<TrackedTab, ApiError>({ queryKey: ["superinvestors-tracked", since], queryFn: () => apiGet(`/api/superinvestors/tracked${since ? `?since=${since}` : ""}`), enabled: gold, staleTime: 600_000, retry: 1, placeholderData: (prev) => prev });
  // The tab is in the address (?tab=all), so a shared link keeps it; Tracked investors is the default.
  const [sp, setSp] = useSearchParams();
  const tab: "tracked" | "all" = sp.get("tab") === "all" ? "all" : "tracked";
  const setTab = (k: "tracked" | "all") => setSp((prev) => { const n = new URLSearchParams(prev); if (k === "all") n.set("tab", "all"); else { n.delete("tab"); n.delete("show"); } return n; }, { replace: true });
  const names = useMemo(() => Object.fromEntries((t.data?.investors ?? []).map((i) => [i.key, i.name])), [t.data]);
  const f = useFollows();
  const allCount = q.data?.count ?? t.data?.allCount.names;
  return (
    <>
      <PageHeader wrap eyebrow="Research" plan="gold" title="Superinvestor portfolios" links={["/research", "/screener", "/plans"]} description={DESCRIPTION} />
      <div className="wrap si">
        <div className="si-tabs sx-tabs" role="tablist" aria-label="Which list">
          {([["tracked", "Tracked investors", t.data?.tiles.tracked ?? 26], ["all", "All named holders", allCount]] as const).map(([k, label, n]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={"si-tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
              {label}{n != null && <small> {n.toLocaleString("en-IN")}</small>}</button>))}
        </div>
        {tab === "tracked" ? <Gate tier={PLAN_FOR_SUPERINVESTORS} title="Superinvestor portfolios" points={GATE}>
          {!gold ? <Outline /> : t.isPending ? <p className="si-wait" role="status">Loading the tracked investors…</p>
            : t.isError ? <p className="formerr" role="alert">The tracked investors could not be loaded ({t.error.status || "network"}). Please try again in a moment.</p>
            : <div className="si-body">
              <Tiles t={t.data.tiles} since={t.data.since} />
              <LatestMoves d={t.data} names={names} onSince={setSince} />
              <TheyAgree d={t.data} names={names} />
              <Cards d={t.data} f={gold ? f : undefined} />
              {gold && f.signedIn && <YourStocks />}
              {gold && f.signedIn && <FollowingAlerts f={f} names={names} />}
              <Source m={t.data} tracked={t.data.trackedSource} covered={q.data?.covered} companies={q.data?.companies} />
            </div>}
        </Gate> : <AllNamed q={q} />}
      </div>
    </>
  );
}

/** What a plan without Gold sees under the lock: the outline of the tab, with no figures (the server sends them only to Gold). */
function Outline() {
  return (
    <div className="si-body" aria-hidden="true">
      <div className="si-stats sx-stats">{["Tracked investors", "Companies named", "Moves since a year ago", "Held by 2 or more"].map((x) => <div key={x} className="si-stat"><span>{x}</span><b>—</b></div>)}</div>
      {["Latest moves", "Stocks they agree on", "Tracked investors"].map((x) => (
        <section key={x} className="card si-sec sx-sec"><h2>{x}</h2><ul className="si-hist">{[1, 2, 3, 4].map((n) => <li key={n}><span className="si-tag si-flat">—</span>—</li>)}</ul></section>))}
    </div>
  );
}

/** The All named holders tab: the list as the filings write it (open to everyone), with the names grouped into a tracked investor marked. */
function AllNamed({ q }: { q: ReturnType<typeof useQuery<SiList, ApiError>> }) {
  const [find, setFind] = useState("");
  const [all, setAll] = useState(false);
  const [sp, setSp] = useSearchParams();
  const show: "person" | "firm" = sp.get("show") === "firms" ? "firm" : "person";
  const setShow = (k: "person" | "firm") => { setAll(false); setSp((prev) => { const n = new URLSearchParams(prev); if (k === "firm") n.set("show", "firms"); else n.delete("show"); return n; }, { replace: true }); };
  const inTab = useMemo(() => (q.data?.investors ?? []).filter((r) => (r.kind ?? "person") === show), [q.data, show]);
  const list = useMemo(() => {
    const t = find.trim().toLowerCase();
    return t ? inTab.filter((r) => r.name.toLowerCase().includes(t) || r.top.some((h) => h.symbol.toLowerCase().includes(t) || h.name.toLowerCase().includes(t))) : inTab;
  }, [inTab, find]);
  const shown = all || find ? list : list.slice(0, FIRST);
  if (q.isPending) return <p className="si-wait" role="status">Loading the investors…</p>;
  if (q.isError) return <p className="formerr" role="alert">The list could not be loaded ({q.error.status || "network"}). Please try again in a moment.</p>;
  const d = q.data;
  return <>
    <p className="sx-allnote">{ALL_NOTE}</p>
    <div className="si-bar">
      <label className="si-find"><span className="si-lab">Find an investor or a company</span>
        <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Name or company symbol" aria-label="Find an investor or a company" /></label>
      <p className="si-count" aria-live="polite">{find ? `${list.length} of ${inTab.length.toLocaleString("en-IN")}` : `${inTab.length.toLocaleString("en-IN")} ${show === "person" ? "people" : "companies and funds"}`}</p>
    </div>
    <div className="si-tabs" role="tablist" aria-label="Who to list">
      {([["person", "People", d.people], ["firm", "Companies and funds", d.firms]] as const).map(([k, label, n]) => (
        <button key={k} type="button" role="tab" aria-selected={show === k} className={"si-tab" + (show === k ? " on" : "")} onClick={() => setShow(k)}>
          {label}{n != null && <small> {n.toLocaleString("en-IN")}</small>}</button>))}
    </div>
    {d.emptyWhy ? <p className="si-empty">{d.emptyWhy}</p>
      : list.length === 0 ? <p className="si-empty">{find ? <>No {show === "person" ? "person" : "company or fund"} matches “{find}”{(d.investors.some((r) => (r.kind ?? "person") !== show && r.name.toLowerCase().includes(find.trim().toLowerCase()))) && <> here; try <button type="button" className="linkish" onClick={() => setShow(show === "person" ? "firm" : "person")}>{show === "person" ? "Companies and funds" : "People"}</button></>}.</> : "No investor in this group."}</p>
      : <ol className="si-list">{shown.map((r, i) => (
        <li key={r.key} className="si-row">
          <span className="si-rank" aria-hidden="true">{i + 1}</span>
          <div className="si-who">
            <span><Link to={`${BASE}/name/${r.key}`} className="si-name">{r.name}</Link>{r.tracked && <Link className="sx-trk" to={`${BASE}/${r.tracked.key}`}>Tracked: {r.tracked.name}</Link>}</span>
            <span className="si-sub">{r.companies} {r.companies === 1 ? "company" : "companies"} · {changesLine(r.changes)}</span>
            <span className="si-top">{r.top.map((h) => <span key={h.symbol} className="si-chip" title={coTitle(h) ?? h.name}>{shortLabel(h)}{h.weightPct != null && <small> {h.weightPct.toFixed(0)}%</small>}</span>)}</span>
          </div>
          <div className="si-val"><b>{crore(r.valueCr)}</b><small>{r.valueCr == null ? "No market values today" : "value of the stakes today"}</small>{r.valueNote && <small className="si-note">{r.valueNote}</small>}</div>
        </li>))}</ol>}
    {!find && !all && list.length > FIRST && <button type="button" className="btn ghost si-more" onClick={() => setAll(true)}>Show all {list.length.toLocaleString("en-IN")}</button>}
    <Source m={d} covered={d.covered} companies={d.companies} />
  </>;
}

const STATUS_CLS: Record<SiStatus, string> = { new: "up", added: "up", reduced: "down", exited: "down", unchanged: "flat" };

type OnePage = (SiPortfolio & { kind_of_page: "name"; tracked?: { key: string; name: string } | null }) | TrackedPage | Moved;

/** /superinvestors/<key>: a tracked investor's page; an old link to a name grouped into one moves to it; any other name is its own portfolio. */
export function SuperinvestorPage() {
  return <OneInvestor byName={false} />;
}

/** /superinvestors/name/<key>: one filed name's portfolio, as the filings write it (the All named holders tab links here). */
export function SuperinvestorNamePage() {
  return <OneInvestor byName />;
}

function OneInvestor({ byName }: { byName: boolean }) {
  const { key = "" } = useParams();
  const nav = useNavigate();
  const { has } = useUI();
  const gold = has(PLAN_FOR_SUPERINVESTORS);
  const list = useQuery<SiList, ApiError>({ queryKey: ["superinvestors"], queryFn: () => apiGet("/api/superinvestors"), staleTime: 600_000, retry: 1 });
  const path = byName ? `/api/superinvestors/name/${encodeURIComponent(key)}` : `/api/superinvestors/${encodeURIComponent(key)}`;
  const q = useQuery<OnePage, ApiError>({ queryKey: ["superinvestor", byName ? "name" : "one", key, gold], queryFn: () => apiGet(path), enabled: gold && !!key, retry: false, staleTime: 600_000 });
  const tracked = useQuery<TrackedTab, ApiError>({ queryKey: ["superinvestors-tracked"], queryFn: () => apiGet("/api/superinvestors/tracked"), enabled: gold && q.data != null && "kind_of_page" in q.data && q.data.kind_of_page === "tracked", staleTime: 600_000, retry: 1 });
  const moved = q.data && "status" in q.data && q.data.status === "moved" ? q.data : null;
  useEffect(() => { if (moved) nav(`${BASE}/${moved.to}`, { replace: true }); }, [moved, nav]);
  // a portfolio without kind_of_page (a stored or demo answer from before task #289) is a filed name's own page
  const d: Exclude<OnePage, Moved> | undefined = q.data && !("status" in q.data && q.data.status === "moved") ? ("kind_of_page" in q.data ? q.data : { ...(q.data as unknown as SiPortfolio), kind_of_page: "name" as const }) : undefined;
  const brief = list.data?.investors.find((x) => x.key === key);
  const name = d?.name ?? brief?.tracked?.name ?? brief?.name ?? key.replace(/-/g, " ");
  useDocTitle(`${name}: portfolio`, `What ${name} holds, from companies' shareholding filings: stakes of 1% or more, their value today, FinLit's view of each stock and the year's moves. Information only, not advice.`);
  // Below Gold the server is not asked: a key that is neither a filed name in the list nor a tracked investor is unknown
  const known = !!brief || !!list.data?.investors.some((x) => x.tracked?.key === key);
  const notFound = q.error?.status === 404 || (!gold && !!list.data && !known);
  const names = useMemo(() => Object.fromEntries((tracked.data?.investors ?? []).map((i) => [i.key, i.name])), [tracked.data]);
  const f = useFollows();
  const desc = d && d.kind_of_page === "tracked"
    ? <>Named with 1% or more in <b>{d.companies}</b> listed {d.companies === 1 ? "company" : "companies"} under {d.groupedNames === 1 ? "one name" : `${d.groupedNames} names`}, worth <b>{crore(d.valueCr)}</b> at today's prices. From the companies' own filings; information only, not investment advice.</>
    : (d ?? brief) ? <>Named with 1% or more in <b>{(d ?? brief)!.companies}</b> listed {(d ?? brief)!.companies === 1 ? "company" : "companies"}, worth <b>{crore((d ?? brief)!.valueCr)}</b> at today's prices. From the companies' own filings; information only, not investment advice.</> : undefined;
  return (
    <>
      <PageHeader wrap eyebrow={<span className="sx-eye"><Link to={BASE}>Superinvestor portfolios</Link>{gold && d?.kind_of_page === "tracked" && <FollowButton k={d.key} name={d.name} f={f} />}</span>} plan="gold" title={name} links={[BASE, "/research"]} description={desc} />
      <div className="wrap si">
        {notFound ? <p className="si-empty">{q.error?.body?.detail as string || "No investor by that name in the stored filings."} <Link to={BASE}>See every investor →</Link></p>
          : moved ? <p className="si-wait sx-moved" role="status">{moved.name}'s names are grouped on one page. Opening it…</p>
          : <Gate tier={PLAN_FOR_SUPERINVESTORS} title="Superinvestor portfolios" points={GATE}>
            {gold && q.isPending && <p className="si-wait" role="status">Loading the portfolio…</p>}
            {gold && q.isError && <p className="formerr" role="alert">The portfolio could not be loaded ({q.error.status || "network"}). Please try again in a moment.</p>}
            {d && d.kind_of_page === "tracked" ? <InvestorBody p={d} names={names} />
              : d ? <>{d.tracked && <p className="sx-allnote">This name is one of the names <Link to={`${BASE}/${d.tracked.key}`}>{d.tracked.name}</Link> files under; that page groups them all.</p>}<Portfolio p={d} brief={brief} /></>
              : !gold ? <Portfolio brief={brief} /> : null}
          </Gate>}
        {d && <Source m={d} tracked={d.kind_of_page === "tracked" ? d.trackedSource : undefined} />}
        {!d && list.data && !notFound && <Source m={list.data} />}
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
