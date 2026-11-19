// Discovery (task #241: its own page under Find stocks), laid out as the 19 Nov Discover pack (task #251, which replaces #245's layout by the owner's
// decision of 19 Nov 2026): it opens on Themes; Themes · What changed · Sectors · All companies are tabs; each theme, event and sector has its own page and
// address (#theme-ai-and-genai, #change-order, #sector-industrials) with a breadcrumb, so Back works and a link can be shared. "Your names in Discover"
// shows the member's portfolio and watchlist names. Data: GET /api/discovery/board plus FinLit's readings per plan (discovery/model.ts).
// Describes what companies say and file; never a pick. Styles: discovery/discover.css (class prefix dsc-).
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { useDocTitle } from "../lib/title";
import { Icon } from "../lib/icons";
import { DiscoverProvider, useDsc } from "../discovery/ctx";
import { I, RotDate } from "../discovery/Info";
import { EVENTS, fmtDate, short, slug, useDiscover } from "../discovery/model";
import { AllView, EventPage, EventsView, SectorPage, SectorsView, ThemePage, ThemesView, YourNames } from "../discovery/Views";
import "../discovery/discover.css";

export function DiscoveryPage() {
  useDocTitle("Discovery", "Companies grouped by the themes their own investor presentations talk about (AI, defence, solar, batteries, data centres, EVs and more), with the stage, recent filings, FinLit's readings, NSE sectors, Sector Rotation and Sector Pulse. Information only, not advice.");
  const d = useDiscover();
  return <DiscoverProvider d={d}><RotDate.Provider value={d.rotLabel ?? (fmtDate(d.rotDate) || "the latest week")}><Page /></RotDate.Provider></DiscoverProvider>;
}

function Page() {
  const c = useDsc(), b = c.d.board;
  const meta = b ? <span className="dsc-meta">
    <span className="dsc-chip">{b.companies.toLocaleString("en-IN")} companies placed<I k="placed" /></span>
    {b.updated && <span className="dsc-chip">Presentations read to {fmtDate(b.updated)}</span>}
    <span className="dsc-chip">Filings of the last {b.days} days</span>
    {c.d.pricesAsOf && <span className="dsc-chip">Prices and scores of {fmtDate(c.d.pricesAsOf)}</span>}
    <a className="dsc-linkish" href="#dsc-how" onClick={(e) => { e.preventDefault(); const el = document.getElementById("dsc-how") as HTMLDetailsElement | null; if (el) { el.open = true; el.scrollIntoView({ block: "start" }); } }}>How it is built</a>
  </span> : undefined;
  return <>
    <PageHeader wrap eyebrow="Research" title="Discovery" links={["/screener", "/superinvestors", "/research"]} learn={false}
      description="Find companies by what they are building. Each company sits in the theme its newest investor presentation talks about most, with its recent exchange filings and FinLit’s readings beside it."
      meta={meta}>{b ? <Find /> : null}</PageHeader>
    <div className="wrap dsc-page">
      {c.d.isError ? <p className="dsc-empty" role="alert">Discovery could not be loaded just now. Please try again in a moment.</p>
        : !b ? <p className="dsc-empty" aria-busy="true">Loading Discovery…</p>
        : <Body />}
    </div>
  </>;
}

function Body() {
  const c = useDsc(), r = c.route, b = c.d.board!;
  const detail = !!(r.theme || r.event || r.sector);
  const top = useRef<HTMLDivElement>(null), first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } top.current?.scrollIntoView?.({ block: "start" }); }, [r.theme, r.event, r.sector, r.view]);
  const tabs: [string, string, number][] = [["themes", "Themes", new Set(c.d.rows.map((x) => x.th)).size], ["what-changed", "What changed", EVENTS.length],
    ["sectors", "Sectors", c.sectors.length], ["all-companies", "All companies", c.d.rows.length]];
  return <>
    {!detail && <YourNames />}
    <div ref={top} className="dsc-tabs" role="tablist" aria-label="Discovery views">{tabs.map(([k, l, n]) => (
      <button key={k} type="button" role="tab" aria-selected={r.view === k} onClick={() => c.go("#" + k)}>{l}<span className="n">{n}</span></button>))}</div>
    <div className="dsc-view">
      {r.theme ? <ThemePage key={r.theme} theme={r.theme} /> : r.event ? <EventPage key={r.event} k={r.event} /> : r.sector ? <SectorPage key={r.sector} m={r.sector} />
        : r.view === "what-changed" ? <EventsView /> : r.view === "sectors" ? <SectorsView /> : r.view === "all-companies" ? <AllView /> : <ThemesView />}
    </div>
    <p className="dsc-caution"><Icon name="info" /> {b.caution}</p>
    <details className="dsc-how" id="dsc-how"><summary>How it is built</summary><p>{b.method}</p>
      <p>FinLit Prism, the two technical views, prices and market value come from FinLit’s own nightly figures, as your plan shows them. Sector Rotation and Sector Pulse readings are weekly ({c.d.rotLabel ?? "latest week"}).</p></details>
  </>;
}

/** "Find a company in Discover": opens the company on its theme page, details open. Names of yours that are not placed say so. */
function Find() {
  const c = useDsc();
  const [q, setQ] = useState(""), [act, setAct] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return { hits: [], mine: [] as string[] };
    const hits = c.d.rows.filter((r) => r.n.toLowerCase().includes(s) || r.s.toLowerCase().includes(s)).slice(0, 8);
    const mine = [...c.held, ...c.watched].filter((x, i, a) => a.indexOf(x) === i && !c.by.has(x) && (x.toLowerCase().includes(s) || (c.d.uni.get(x)?.name ?? "").toLowerCase().includes(s)));
    return { hits, mine };
  }, [q, c]);
  useEffect(() => { const f = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setQ(""); }; document.addEventListener("mousedown", f); return () => document.removeEventListener("mousedown", f); }, []);
  const pick = (s: string) => {
    const r = c.by.get(s); if (!r) return;
    const k = "theme-" + slug(r.th);
    c.setT(k, { q: r.n, page: 0 }); c.toggleOpen(s, true); setQ("");
    c.go("#" + k);
    setTimeout(() => document.getElementById("dsc-tbl-top")?.scrollIntoView?.({ block: "start" }), 60);
  };
  const open = q.trim().length > 0;
  return <div className="dsc-find" ref={box}>
    <label htmlFor="dsc-gq">Find a company in Discover</label>
    <div className="dsc-fin"><Icon name="search" />
      <input id="dsc-gq" type="search" placeholder="Name or symbol, e.g. Sansera" autoComplete="off" role="combobox" aria-expanded={open} aria-controls="dsc-sugg" value={q}
        onChange={(e) => { setQ(e.target.value); setAct(0); }}
        onKeyDown={(e) => { if (e.key === "Escape") setQ(""); else if (e.key === "ArrowDown") { e.preventDefault(); setAct((a) => Math.min(a + 1, Math.max(0, hits.hits.length - 1))); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAct((a) => Math.max(0, a - 1)); } else if (e.key === "Enter" && hits.hits[act]) { e.preventDefault(); pick(hits.hits[act].s); } }} /></div>
    {open && <div className="dsc-sugg" id="dsc-sugg" role="listbox" aria-label="Companies in Discover">
      {hits.hits.map((r, i) => <button key={r.s} type="button" role="option" aria-selected={i === act} onClick={() => pick(r.s)}>
        <span><b>{short(r.n)}</b> <small>{/^\d{6}$/.test(r.s) ? "BSE " + r.s : r.s}</small></span><small>{c.d.board?.themes.find((t) => t.name === r.th)?.short ?? r.th}</small></button>)}
      {hits.mine.map((s) => <button key={s} type="button" role="option" aria-selected={false} disabled><span><b>{short(c.d.uni.get(s)?.name ?? s)}</b> <small>{s}</small></span><small>not placed in a theme</small></button>)}
      {!hits.hits.length && !hits.mine.length && <p className="dsc-na">No company in Discover matches.</p>}
    </div>}
  </div>;
}
