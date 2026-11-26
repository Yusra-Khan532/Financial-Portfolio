import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { canon } from "../lib/aliases";
import { visits } from "../lib/recentVisits";
import { recents } from "../lib/mycompanies";
import { useQueryClient } from "@tanstack/react-query";
import type { OwnInsights } from "../lib/ownView";
import { useWithLatest } from "../lib/liveQuote";
import { ApiError, useSearchIndex, useSection, useSummary, type Events, type Financials, type Ownership, type Peers, type Ratios, type Segments } from "../lib/api";
import { Icon } from "../lib/icons";
import { nf, signed } from "../lib/format";
import { OpenAccess } from "../components/Gate";
import { useAuth } from "../lib/auth";
import { Hero } from "./Hero";
import { Defer, usualHeight } from "./Defer";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { FinancialsSection, PriceSection } from "./Sections";
import { PeersSection, RatiosSection, SegmentsSection } from "./Sections3";
import { QuarterSection, TrendsSection } from "./Sections4";
import { PlFlagsLayer } from "./PlFlagsLayer";
import { CommunitySection, CommunityStrip } from "./CommunitySection";
import { useStats } from "../lib/forum";
import { MacroOutlookSection } from "./MacroOutlook";
import { BusinessSection, DividendsSection, OwnershipSection } from "./Sections2";
import { NewsSection } from "./NewsSection";
import { WhereStands } from "./pack/WhereStands";
import { useDocTitle } from "../lib/title";
import "../styles/report-polish.css";
import "../styles/report216.css";   // task #216: compact headings, drop-down arrow, enlarge and phone rules (after the polish tokens it adjusts)
import "../styles/company-report-layout.css";   // task #328 (developer file 27): the eight layout changes, after the sheets they adjust
import { MiniBar } from "./MiniBar";
import { useEarningsFindings } from "./EarningsCash";
import { KeyFindings, checkItems, findingsOf } from "./KeyFindings";
import { useProfitReality } from "./ProfitReality";
import { earningsIntel } from "../lib/earningsIntel";
import { GROUP_START, NAV, navFor, sectionNo } from "../lib/sectionNav";
import { usePlanModel } from "../lib/planScore";
import { SectionsMenu } from "./SectionsMenu";
import { PhoneFold, foldAnchor, revealFold } from "../components/PhoneFold";
import { PreparingReport, type PreparingMode } from "./PreparingReport";
import { coTitle, shortLabel } from "../lib/companyLabel";


/** The dot on the Earnings & cash tab: it needs the section's own models, so it is a small component of its own (drawn only once the report is there). */
function EarnDot({ s }: { s: NonNullable<ReturnType<typeof useSummary>["data"]> }) {
  const e = useEarningsFindings(s.meta.symbol, !!s.dataQuality.isBank, s.profile.sector, s.profile.industry, [s.profile.sector, s.profile.industry, s.profile.subIndustry]);
  const k = e ? (e.red ? "f" : e.watch || e.investigate ? "w" : null) : null;
  return k ? <i className={"tdot " + k} role="img" aria-label={k === "f" ? "has a red flag" : "has something to watch"} /> : null;
}

/** The closed row of a report section on a phone: its name and one line, from the section bar's list (lib/sectionNav NAV). */
const FOLD_EXTRA: Record<string, [string, string]> = {
  ratios: ["Ratios", "Valuation, returns, margins and debt, with the DuPont analysis and earnings and cash quality"],
};
export const foldText = (id: string): [string, string] => { const n = NAV.find((x) => x[0] === id); return FOLD_EXTRA[id] ?? (n ? [n[1], n[3]] : [id, ""]); };
const foldOf = (id: string) => { const [title, line] = foldText(id); return { id, title, line }; };

export function StockPage() {
  const { symbol: raw = "" } = useParams();
  const symbol = canon(raw.toUpperCase());
  const nav = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => { if (symbol !== raw.toUpperCase()) nav(`/stocks/${symbol}`, { replace: true }); }, [symbol, raw]); // eslint-disable-line react-hooks/exhaustive-deps
  const { showcase } = useAuth();
  const sum = useSummary(symbol);
  const s = useWithLatest(sum.data);   // task #338: the latest price (asked again every 30 s in market hours), the same on every page
  const ready = !!s;
  const names = useSearchIndex(!s);   // the company's name for the waiting page, before its report exists (the list is cached for the search box anyway)
  // A report stored with its key numbers while ownership, peers, segments and announcements are still being fetched: ask again every 2.5 s (for up to 2 minutes) until it is complete.
  const partial = !!s?.meta.partial;
  useEffect(() => {
    if (!partial) return;
    const t0 = Date.now();
    const id = setInterval(() => { if (Date.now() - t0 > 120_000) clearInterval(id); else queryClient.invalidateQueries({ queryKey: ["stock", symbol] }); }, 2500);
    return () => clearInterval(id);
  }, [partial, symbol]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (s?.meta.symbol) { recents.add(s.meta.symbol); visits.add({ k: "stock", id: s.meta.symbol, name: s.profile.name }); queryClient.invalidateQueries({ queryKey: ["my-companies"] }); } }, [s?.meta.symbol]); // eslint-disable-line react-hooks/exhaustive-deps
  const ratios = useSection<Ratios>(symbol, "ratios", ready).data;
  const fin = useSection<Financials>(symbol, "financials", ready).data;
  const own = useSection<Ownership>(symbol, "ownership", ready).data;
  const ownIns = useSection<OwnInsights>(symbol, "ownership-insights", ready);   // the stored ownership insights: this page never calls the slow premium endpoint
  const ownInsWhy = ownIns.error ? (ownIns.error.status === 404 ? "The shareholding filings for this company have not been loaded yet." : "The short readings could not be loaded just now; the numbers below are unaffected.") : null;
  const peers = useSection<Peers>(symbol, "peers", ready).data;
  const seg = useSection<Segments>(symbol, "segments", ready).data;
  const events = useSection<Events>(symbol, "events", ready).data;
  const model = usePlanModel();
  const navItems = useMemo(() => navFor(model), [model]);   // task #216: the Scores line follows the plan (one score per screen)
  const talk = useStats(symbol).data;      // how many discussions members have started about this company, on the viewer's own board (task #101)   // no pill for a section that is switched off
  const pReality = useProfitReality(symbol, !!s?.dataQuality.isBank);
  const found = useMemo(() => (s ? findingsOf(s, fin, !!s.dataQuality.isBank, checkItems(earningsIntel(pReality, s.profile.sector, s.profile.industry))) : null), [s, fin, pReality]);   // the red / orange dots on the tabs
  const dotOf = (id: string): "f" | "w" | null => { if (!found) return null; const only = (x: { to: string }[]) => x.filter((i) => i.to === id).length; if (id === "notes") return found.flags.length ? "f" : found.watch.length ? "w" : null; return only(found.flags) ? "f" : only(found.watch) ? "w" : null; };
  useDocTitle(s ? `${s.profile.name} research` : `${symbol} research`, s ? `FinLit research report for ${s.profile.name}: financials, ratios, ownership and peers.` : undefined);

  const [active, setActive] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);
  const [folded, setFolded] = useState(false);   // task #216 (README 1.8): 200 px past the bar the company bar folds away and a small chip shows instead
  const idrow = useRef<HTMLDivElement>(null);
  const links = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });   // more sections beyond the left / right end of the bar: arrows and a fade say so
  useEffect(() => {
    const el = links.current; if (!el) return;
    const upd = () => setEdge({ l: el.scrollLeft > 4, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    upd(); el.addEventListener("scroll", upd, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(upd) : null; ro?.observe(el);
    return () => { el.removeEventListener("scroll", upd); ro?.disconnect(); };
  }, [s]);
  const slide = (d: number) => links.current?.scrollBy({ left: d * links.current.clientWidth * 0.6, behavior: "smooth" });

  const [openAll, setOpenAll] = useState(false);
  const opened = useRef(false);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!s) return;
    // task #216 (README 1.8): the chosen chip is the last section whose heading top is above 230 px; a target inside a hidden tab counts by its section's
    // heading. Read on scroll in one animation frame; nothing here scrolls the page (no scrollIntoView), so the page never jumps back while the reader scrolls.
    const headOf = (id: string) => { let t = document.getElementById(id); if (t?.closest(".pfold:not(.is-open)")) return foldAnchor(t);   /* a closed phone section: its row */ if (t && (t.closest("[hidden]") || !t.getClientRects().length)) { const sec = t.closest("section.block"); t = (sec?.querySelector<HTMLElement>(".sh") ?? sec as HTMLElement | null); } return t; };
    let tick = 0;
    const upd = () => { tick = 0; let cur: string | null = null, curH: Element | null = null; for (const [id] of navItems) { const h = headOf(id); if (h && h.getBoundingClientRect().top < 230 && h !== curH) { cur = id; curH = h; } } setActive(cur ?? navItems[0]?.[0] ?? null); };
    // The bar sticks once the identity row has gone 130 px above the top (also read here: the observer below does not fire on phones), and 200 px more folds it.
    const fold = () => { const h = document.querySelector(".idr"); const bt = h ? h.getBoundingClientRect().bottom : Infinity; setFolded(bt < -70); if (bt < 130) setStuck(true); else if (bt > 200) setStuck(false); };
    const onScroll = () => { fold(); if (!tick) tick = requestAnimationFrame(upd); };
    addEventListener("scroll", onScroll, { passive: true }); addEventListener("resize", onScroll); upd(); fold();
    const hero = document.querySelector(".idr");
    const io2 = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.bottom < 200), { rootMargin: "-130px 0px 0px 0px" });   // gone off the TOP of the screen, not merely below it
    if (hero) io2.observe(hero);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); cancelAnimationFrame(tick); io2.disconnect(); };
  }, [s, ratios, fin, own, peers, seg, events, navItems, shown]);

  useEffect(() => {
    const a = links.current?.querySelector<HTMLAnchorElement>(`a[data-s="${active}"]`);
    if (!pill.current) return;
    if (!a) { pill.current.style.width = "0px"; return; }
    pill.current.style.width = a.offsetWidth + "px"; pill.current.style.transform = `translateX(${a.offsetLeft}px)`;
    links.current?.scrollTo({ left: Math.max(0, a.offsetLeft - links.current.clientWidth / 2 + a.offsetWidth / 2), behavior: "smooth" });
  }, [active]);

  // The Prism section hides itself when there is nothing to show; its links then open the Prism page instead.
  const jump = (id: string, tries = 0) => { const t = document.getElementById(id); if (t && tries === 0) revealFold(t);   /* a phone: open the closed section first (PhoneFold) */ if (t && t.closest("[hidden]") && tries < 4) { requestAnimationFrame(() => requestAnimationFrame(() => jump(id, tries + 1))); return; }   /* a target inside a tab group's hidden panel (17's "Announcements"): the group opens that panel on the click; scroll once it is drawn */ if (!t && id !== "prism" && !opened.current) { opened.current = true; setOpenAll(true); setTimeout(() => jump(id), 80); setTimeout(() => jump(id), 600); return; } if (t) window.scrollTo({ top: t.getBoundingClientRect().top + scrollY - 176, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); else if (id === "prism") nav(`/prism/${encodeURIComponent(symbol)}`); };
  const q = useMemo(() => s?.quote, [s]);

  const err = (sum.error ?? sum.failureReason) as ApiError | null;   // while it retries, the last answer is the failure reason (it carries the progress)
  const st = err?.status;
  const mode: PreparingMode | null = sum.isLoading
    ? (st === 202 ? "building" : st === 429 ? "busy" : "loading")
    : sum.isError && (st === 202 || st === 429) ? "gaveUp"        // stopped asking after about 45 s: a visible end with "Try again", not a dead page
    : sum.isError && (st ?? 0) >= 500 ? (err?.body.status === "build_rejected" ? "rejected" : "failed")
    : null;
  if (mode) {
    const known = names.data?.rows.find((r) => r[0] === symbol);
    return <PreparingReport symbol={symbol} name={err?.body.company?.name ?? known?.[1] ?? null} sector={err?.body.company?.sector} mode={mode} done={err?.body.done} total={err?.body.total} onRetry={() => sum.refetch()} />;
  }
  if (sum.isError || !s) {
    const st = (sum.error as ApiError | null)?.status;
    const demo = (sum.error as ApiError | null)?.body?.status === "demo";
    if (demo) return <div className="wrap state"><h2>This demo includes the RELIANCE report</h2><p>The live site opens every listed stock. Try RELIANCE to see the full report.</p><Link className="btn primary" to="/stocks/RELIANCE">Open the RELIANCE report</Link></div>;
    return <div className="wrap state"><h2>{st === 404 ? `We couldn't find “${symbol}”` : "This report is unavailable right now"}</h2><p>{st === 404 ? "Check the ticker, or search by company name." : "Please try again in a moment."}</p><Link className="btn primary" to="/research">Browse research</Link></div>;
  }
  // task #310 part E (05-phone.md, fix 6): on a phone every section below the header card and the Prism card is a closed row (its name and one line);
  // a tap opens it, several can be open, and the choice lasts for the session. Desktop is unchanged (PhoneFold draws nothing of its own there).
  // (PhoneFold is used directly, never through a component made inside this render, so a section keeps its state when the page draws again)
  return (
    <OpenAccess.Provider value={showcase.includes(symbol)}>
    <>
      <Hero s={s} ratios={ratios} jump={jump} />
      <CommunityStrip symbol={symbol} name={s.profile.name} jump={jump} />
      <div className={"secnav" + (stuck ? " stuck" : "")} id="secnav">
        <MiniBar s={s} on={stuck && !folded} />
        <div className="wrap">
          {stuck && folded && <a className="sn-co" href="#top" title="Back to the top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }}>
            <b title={coTitle(s.profile)}>{shortLabel(s.profile)}</b><span className="sn-co-px">₹{s.quote.price == null ? "–" : nf(s.quote.price)}</span>
            {s.quote.changePct != null && <span className={"sn-co-chg " + (s.quote.changePct >= 0 ? "up" : "down")}>{signed(s.quote.changePct)}</span>}</a>}

          <SectionsMenu items={navItems} active={active} onPick={jump} />
          <div className={"snav" + (edge.l ? " edge-l" : "") + (edge.r ? " edge-r" : "")}>
          {edge.l && <button type="button" className="snav-arrow" aria-label="Earlier sections" onClick={() => slide(-1)}>‹</button>}
          <nav ref={links} aria-label="Sections"><span className="pill" ref={pill} />{navItems.map(([id, label, ic]) => <a key={id} data-s={id} href={`#${id}`} className={(active === id ? "active" : "") + (GROUP_START.has(id) ? " grp" : "")} aria-current={active === id ? "true" : undefined} onClick={(e) => { e.preventDefault(); jump(id); }}><Icon name={ic} />{sectionNo(id) ? <span className="sn-no">{sectionNo(id)}</span> : null}{label}{id === "community" && !!talk?.threads && <b className="snav-n" aria-label={`${talk.threads} discussions`}>{talk.threads}</b>}{id === "earnings" ? <EarnDot s={s} /> : dotOf(id) && <i className={"tdot " + dotOf(id)} role="img" aria-label={dotOf(id) === "f" ? "has a red flag" : "has something to watch"} />}</a>)}</nav>
          {edge.r && <button type="button" className="snav-arrow" aria-label="More sections" onClick={() => slide(1)}>›</button>}
          </div>
        </div>
      </div>
      <div className="wrap">
        <div ref={idrow} />
        {/* What the company does comes first: someone who has never heard of it starts here, then the score, then the numbers. */}
        {/* developer file 41 (founder, 25 Nov 2026): a funnel, from the company out to its industry, its sector and the economy, in the order of lib/sectionNav NAV;
           News and filings and the Discussions stay last. Chart lab (old 08) is merged into Price, Financials and Dividends; Gold insights (old 15) is gone. */}
        <PhoneFold page="stock" {...foldOf("business")}><ErrorBoundary section="This section"><BusinessSection s={s} /></ErrorBoundary></PhoneFold>
        {/* developer file 44 (founder, 27 Nov 2026: "remove company brief"): the Company brief section is no longer drawn here (stock/CompanyBrief.tsx, its
           server answer and its overnight writing job are unchanged; Discover's company table still shows a published brief). */}
        <PhoneFold page="stock" {...foldOf("notes")}><ErrorBoundary section="This section"><KeyFindings s={s} f={fin} lender={!!s.dataQuality.isBank} /></ErrorBoundary></PhoneFold>
        <PhoneFold page="stock" {...foldOf("price")}><ErrorBoundary section="This section"><PriceSection s={s} symbol={symbol} ratios={ratios} /></ErrorBoundary></PhoneFold>
        <PhoneFold page="stock" {...foldOf("quarter")}><PlFlagsLayer f={fin} lender={!!s.dataQuality.isBank} /><Defer all={openAll} height={usualHeight("quarter")} onShow={() => setShown((n) => n + 1)}><ErrorBoundary section="This section"><QuarterSection f={fin} /></ErrorBoundary></Defer></PhoneFold>
        <PhoneFold page="stock" {...foldOf("financials")}><Defer all={openAll} height={usualHeight("financials")} onShow={() => setShown((n) => n + 1)}><ErrorBoundary section="This section"><FinancialsSection f={fin} /></ErrorBoundary></Defer></PhoneFold>
        <PhoneFold page="stock" {...foldOf("trends")}><Defer all={openAll} height={usualHeight("trends")} onShow={() => setShown((n) => n + 1)}><ErrorBoundary section="This section"><TrendsSection f={fin} e={events} r={ratios} /></ErrorBoundary></Defer></PhoneFold>
        <PhoneFold page="stock" {...foldOf("segments")}><Defer all={openAll} height={usualHeight("segments")} onShow={() => setShown((n) => n + 1)}><ErrorBoundary section="This section"><SegmentsSection seg={seg} /></ErrorBoundary></Defer></PhoneFold>
        <PhoneFold page="stock" {...foldOf("ratios")}><Defer all={openAll} height={usualHeight("ratios")} onShow={() => setShown((n) => n + 1)}><ErrorBoundary section="This section"><RatiosSection r={ratios} lender={!!s.dataQuality.isBank} sector={s.profile.sector} industry={s.profile.industry} labels={[s.profile.sector, s.profile.industry, s.profile.subIndustry]} /></ErrorBoundary></Defer></PhoneFold>
        <PhoneFold page="stock" {...foldOf("dividends")}><Defer all={openAll} height={usualHeight("dividends")} onShow={() => setShown((n) => n + 1)}><ErrorBoundary section="This section"><DividendsSection e={events} price={q?.price} r={ratios} /></ErrorBoundary></Defer></PhoneFold>
        <PhoneFold page="stock" {...foldOf("ownership")}><Defer all={openAll} height={usualHeight("ownership")} onShow={() => setShown((n) => n + 1)}><ErrorBoundary section="This section"><OwnershipSection o={own} ins={ownIns.data} insWhy={ownInsWhy} /></ErrorBoundary></Defer></PhoneFold>
        {/* its industry, its sector and the economy */}
        <PhoneFold page="stock" {...foldOf("peers")}><Defer all={openAll} height={usualHeight("peers")} onShow={() => setShown((n) => n + 1)}><ErrorBoundary section="This section"><PeersSection p={peers} self={symbol} s={s} /></ErrorBoundary></Defer></PhoneFold>
        <PhoneFold page="stock" {...foldOf("sector")}><Defer all={openAll} height={usualHeight("sector")} onShow={() => setShown((n) => n + 1)}><ErrorBoundary section="Where it stands"><WhereStands symbol={symbol} name={s.profile.name} s={s} peers={peers} /></ErrorBoundary></Defer></PhoneFold>
        <PhoneFold page="stock" {...foldOf("macro")}><Defer all={openAll} height={usualHeight("macro")} onShow={() => setShown((n) => n + 1)}><ErrorBoundary section="Economy and sector"><MacroOutlookSection symbol={symbol} /></ErrorBoundary></Defer></PhoneFold>
        <PhoneFold page="stock" {...foldOf("news")}><Defer all={openAll} height={usualHeight("news")} onShow={() => setShown((n) => n + 1)}><ErrorBoundary section="This section"><NewsSection e={events} name={s.profile.name} symbol={symbol} /></ErrorBoundary></Defer></PhoneFold>
        <PhoneFold page="stock" {...foldOf("community")}><Defer all={openAll} height={usualHeight("community")} onShow={() => setShown((n) => n + 1)}><ErrorBoundary section="This section"><CommunitySection symbol={symbol} name={s.profile.name} /></ErrorBoundary></Defer></PhoneFold>
      </div>
      <div className="wrap"><p className="rp-plans" id="plans">The paid plans open more of every report: the scores, the checks and the full statements. <Link to="/pricing">Compare the plans</Link></p></div>
      {partial && <div className="prep-toast" role="status"><i aria-hidden="true" />Ownership, peers, segments and announcements are still loading. Everything above is final.</div>}
    </>
    </OpenAccess.Provider>
  );
}
