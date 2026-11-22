// Discover (task #241: its own page under Find stocks; task #251: the 19 Nov pack; task #260: the 20 Nov pack, which this page follows).
//   §1 the page head of the screeners (eyebrow "Research · Find stocks", "Discover" with a New tag, the as-of pill, two links into "Questions about this
//      page"), the count chips and "Find a company in Discover"
//   §2 "Your names in Discover" · §3 the four views in the site's "ways to look" strip · §4–§10 the views, the pages and the company table
//   §14 one real path per view (/discover, /discover/themes/<slug>, /discover/changes, /discover/sectors/<macro>[/<sector>], /discover/industries/<i>,
//      /discover/companies), the table's filters in the query string; /discovery and its old #theme-... addresses land on the same pages.
// Task #303 (developer file 15, the whole section): one line of figures with the company finder under the head (.dw-head), the names card on the landing
//   views, and ONE sticky tab bar for the six ways to look (.dw-tabsbox > nav.dw-tabs) in place of the two "Explore Discover" strips; same links, same URLs.
// Data: GET /api/discovery/board plus FinLit's readings per plan (discovery/model.ts). Describes what companies say and file; never a pick.
// Styles: discovery/discover.css (class prefix dsc-), on the page head of styles/sectors-pack.css and styles/screeners243.css (xsh-).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { useDocTitle } from "../lib/title";
import { Icon } from "../lib/icons";
import { Ico } from "../discovery/Toolbar";
import { faqAnchor } from "../components/PageFaqs";
import { DISCOVER_FAQ } from "../content/discoverFaqs";
import { DiscoverProvider, useDsc } from "../discovery/ctx";
import { I, RotDate } from "../discovery/Info";
import { BASE, EVENTS, SOURCES, VIEW_PATH, fmtDate, isSource, legacyPath, short, themePath, useDiscover, useSources, type View } from "../discovery/model";
import { AllView, EventPage, EventsView, IndustryPage, MacroPage, SectorsView, ThemePage, ThemesView, YourNames } from "../discovery/Views";
import { BucketPage, SourcesView } from "../discovery/Sources";

const SRC_CAUTION = "A keyword mention by itself is not proof of material business exposure: check the figures in the filing itself.";
import "../styles/sectors-pack.css";
import "../styles/screeners243.css";
import "../discovery/discover.css";

/** /discovery (task #241's address) and its hash routes open the same page on /discover. */
export function DiscoveryRedirect() {
  const { hash, search } = useLocation();
  return <Navigate to={legacyPath(hash) + search} replace />;
}

export function DiscoveryPage() {
  useDocTitle("Discover", "Companies grouped by what they are building: the themes their own investor presentations talk about (AI, defence, solar, batteries, data centres, EVs and more), with the stage, recent filings, NSE sectors and industries, Sector Rotation, Sector Pulse and FinLit's readings. Information only, not advice.");
  const d = useDiscover();
  return <DiscoverProvider d={d}><RotDate.Provider value={d.rotLabel ?? (fmtDate(d.rotDate) || "the latest week")}><Page /></RotDate.Provider></DiscoverProvider>;
}

const qAnchor = (q: string) => faqAnchor(DISCOVER_FAQ.id, DISCOVER_FAQ.items.findIndex((x) => x.q === q));
export const Q_PLACED = "How is a company placed in a theme?";
export const Q_BUY = "Does Discover tell me what to buy?";

function Head() {
  const c = useDsc(), b = c.d.board, { pathname, search } = useLocation();
  const asOf = [b?.updated ? `Presentations to ${fmtDate(b.updated)}` : null, c.d.pricesAsOf ? `prices and scores: ${fmtDate(c.d.pricesAsOf)} close` : null].filter(Boolean).join(" · ");
  return <header className="sp sp-head xsh dsc-head card" aria-labelledby="dsc-h1">
    <p className="sp-eyebrow">Research · Find stocks</p>
    <div className="xsh-h1"><h1 id="dsc-h1" className="ui-title">Discover</h1><span className="dsc-new">New</span></div>
    <p className="sp-desc">Companies grouped by what they are building, from their newest investor presentations.</p>
    <div className="sp-head-bar xsh-bar">
      {asOf && <span className="xsh-date"><i aria-hidden="true" />{asOf}</span>}
      <Link className="sp-link xsh-link" to={{ pathname, search, hash: qAnchor(Q_PLACED) }}>How is a company placed? →</Link>
      <Link className="sp-link xsh-link" to={{ pathname, search, hash: qAnchor(Q_BUY) }}>Does Discover tell me what to buy? →</Link>
    </div>
  </header>;
}

/** --dw-top: the height of the site header, so the tab bar sticks right under it. */
function useTopHeight(ref: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const top = document.querySelector<HTMLElement>(".top"), el = ref.current;
    if (!el) return;
    const put = () => el.style.setProperty("--dw-top", `${top ? Math.round(top.getBoundingClientRect().height) : 0}px`);
    put();
    if (!top || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(put); ro.observe(top);
    return () => ro.disconnect();
  }, [ref]);
}

function Page() {
  const c = useDsc(), b = c.d.board;
  const page = useRef<HTMLDivElement>(null);
  useTopHeight(page);
  return <div className="wrap dsc-page" ref={page}>
    <Head />
    {b && <div className="dw-head">
      <p className="dw-meta">
        <span><b>{b.companies.toLocaleString("en-IN")}</b> companies placed<I k="placed" /></span>
        <span><b>{new Set(c.d.rows.map((r) => r.th)).size}</b> themes</span>
        <span>Filings of the last <b>{b.days}</b> days</span>
      </p>
      <div className="dw-hb"><Find /></div>
    </div>}
    {c.d.isError ? <p className="dsc-empty" role="alert">Discover could not be loaded just now. Please try again in a moment.</p>
      : !b ? <p className="dsc-empty" aria-busy="true">Loading Discover…</p>
      : <Body />}
  </div>;
}

/** Task #303: the six ways to look in one tab bar (four, a divider, then the two read from calls and results). Same links and paths as the two strips had. */
function Tabs() {
  const c = useDsc(), r = c.route, nav = useRef<HTMLElement>(null);
  const four: [View, string, number][] = [
    ["themes", "Themes", new Set(c.d.rows.map((x) => x.th)).size],
    ["what-changed", "What changed", EVENTS.length],
    ["sectors", "Sectors", c.sectors.length],
    ["all-companies", "All companies", c.d.rows.length],
  ];
  const two: [View, string, number][] = [["calls", SOURCES.calls.label, SOURCES.calls.n], ["results", SOURCES.results.label, SOURCES.results.n]];
  // the tab of this page in view when the bar scrolls sideways (phones)
  useEffect(() => {
    const tb = nav.current, at = tb?.querySelector<HTMLElement>("[data-on]");
    if (tb && at && (at.offsetLeft < tb.scrollLeft || at.offsetLeft + at.offsetWidth > tb.scrollLeft + tb.clientWidth)) tb.scrollLeft = Math.max(0, at.offsetLeft - 12);
  }, [r.view]);
  const tab = ([k, l, n]: [View, string, number]) => {
    const on = r.view === k, here = on && !r.theme && !r.event && !r.macro && !r.industry && !r.bucket;
    return <Link key={k} to={VIEW_PATH[k]} className="dw-tab" aria-current={here ? "page" : undefined} data-on={on || undefined}>{l}<span>{n.toLocaleString("en-IN")}</span></Link>;
  };
  return <div className="dw-tabsbox"><nav ref={nav} className="dw-tabs" aria-label="Discover views">{four.map(tab)}<span className="dw-tsep" aria-hidden="true" />
    <span className="dw-tlab" aria-hidden="true">From calls and results</span>{two.map(tab)}</nav></div>;
}

function Body() {
  const c = useDsc(), r = c.route, b = c.d.board!;
  const detail = !!(r.theme || r.event || r.macro || r.industry || r.bucket);
  const src = isSource(r.view) ? r.view : null, sd = useSources(src).data;     // task #267: the calls / results view's own caution and method
  const top = useRef<HTMLDivElement>(null), first = useRef(true);
  const where = [r.view, r.theme, r.event, r.macro, r.sector, r.industry, r.bucket].join("|");
  useEffect(() => { if (first.current) { first.current = false; return; } top.current?.scrollIntoView?.({ block: "start" }); }, [where]);
  return <>
    {!detail && <YourNames />}
    <div ref={top} className="dsc-anchor" />
    <Tabs />
    <div className="dsc-view">
      {src ? (r.bucket ? <BucketPage key={src + r.bucket} src={src} slug={r.bucket} /> : <SourcesView key={src} src={src} />)
        : r.theme ? <ThemePage key={r.theme} theme={r.theme} />
        : r.event ? <EventPage key={r.event} k={r.event} />
        : r.industry ? <IndustryPage key={r.industry} ind={r.industry} />
        : r.macro ? <MacroPage key={r.macro + (r.sector ?? "")} m={r.macro} sc={r.sector} />
        : r.view === "what-changed" ? <EventsView /> : r.view === "sectors" ? <SectorsView /> : r.view === "all-companies" ? <AllView /> : <ThemesView />}
    </div>
    <p className="dsc-caution"><Icon name="info" /> {src ? sd?.caution ?? SRC_CAUTION : b.caution} Describes the company’s financial health from its filings and prices; not a recommendation. Information only, not investment advice.</p>
    <details className="dsc-how" id="dsc-how"><summary>How it is built</summary><p>{src ? sd?.method ?? SOURCES[src].line : b.method}</p>
      <p>FinLit Prism, the two technical views, prices and market value come from FinLit’s own nightly figures, as your plan shows them. Sector Rotation is read weekly and Sector Pulse daily; each reading shows its date.</p></details>
  </>;
}

/** "Find a company in Discover": Enter opens the first; picking one opens that company in its theme's table, details open. Names of yours that are not placed say so. */
function Find() {
  const c = useDsc();
  const [q, setQ] = useState(""), [act, setAct] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return { hits: [], mine: [] as string[] };
    const hits = c.d.rows.filter((r) => r.n.toLowerCase().includes(s) || r.s.toLowerCase().includes(s))
      .sort((a, b) => Number(!a.s.toLowerCase().startsWith(s) && !a.n.toLowerCase().startsWith(s)) - Number(!b.s.toLowerCase().startsWith(s) && !b.n.toLowerCase().startsWith(s))).slice(0, 8);
    const mine = [...c.held, ...c.watched].filter((x, i, a) => a.indexOf(x) === i && !c.by.has(x) && (x.toLowerCase().includes(s) || (c.d.uni.get(x)?.name ?? "").toLowerCase().includes(s)));
    return { hits, mine };
  }, [q, c]);
  useEffect(() => { const f = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setQ(""); }; document.addEventListener("mousedown", f); return () => document.removeEventListener("mousedown", f); }, []);
  const pick = (s: string) => {
    const r = c.by.get(s); if (!r) return;
    c.toggleOpen(s, true); setQ("");
    c.go(themePath(r.th), { q: r.n });
    setTimeout(() => document.getElementById("dsc-tbl-top")?.scrollIntoView?.({ block: "start" }), 80);
  };
  const open = q.trim().length > 0;
  return <div className="dw-gs" ref={box}>
    <label className="dbx-q">{Ico.search}
      <input id="dsc-gq" type="search" placeholder="Find a company in Discover, e.g. Sansera" aria-label="Find a company in Discover" autoComplete="off" role="combobox" aria-expanded={open} aria-controls="dsc-sugg" value={q}
        onChange={(e) => { setQ(e.target.value); setAct(0); }}
        onKeyDown={(e) => { if (e.key === "Escape") setQ(""); else if (e.key === "ArrowDown") { e.preventDefault(); setAct((a) => Math.min(a + 1, Math.max(0, hits.hits.length - 1))); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAct((a) => Math.max(0, a - 1)); } else if (e.key === "Enter" && hits.hits[act]) { e.preventDefault(); pick(hits.hits[act].s); } }} /></label>
    {open && <div className="dbx-pop wide" id="dsc-sugg" role="listbox" aria-label="Companies in Discover">
      {hits.hits.map((r, i) => <button key={r.s} type="button" role="option" className="dbx-opt" aria-selected={i === act} onClick={() => pick(r.s)}>
        <span className="dbx-ot"><b>{short(r.n)}</b> <small className="dw-na">{/^\d{6}$/.test(r.s) ? "BSE " + r.s : r.s}</small></span><span className="dbx-oc">{c.d.board?.themes.find((t) => t.name === r.th)?.short ?? r.th}</span></button>)}
      {hits.mine.map((s) => <button key={s} type="button" role="option" className="dbx-opt" aria-selected={false} disabled><span className="dbx-ot"><b>{short(c.d.uni.get(s)?.name ?? s)}</b> <small className="dw-na">{s}</small></span><span className="dbx-oc">not placed in a theme</span></button>)}
      {!hits.hits.length && !hits.mine.length && <p className="dbx-none">No company in Discover matches.</p>}
    </div>}
  </div>;
}
export { BASE };
