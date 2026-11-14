import { PortfolioDisclaimer } from "../components/PortfolioDisclaimer";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Gate } from "../components/Gate";
import { Icon } from "../lib/icons";
import { useDocTitle } from "../lib/title";
import { useUI } from "../lib/ui";
import { limitsFor, useAuth } from "../lib/auth";
import { DEMO } from "../lib/demo";
import { useSearchIndex } from "../lib/api";
import { useUniverse } from "../lib/screener";
import { portfolio, usePortfolio } from "../lib/portfolio";
import { saveFile } from "../stock/derive";
import { PdfImport } from "../components/PdfImport";
import { ACCEPT, namesFromFile } from "../lib/holdingsFile";
import { isPdf } from "../lib/holdingsPdf";
import { makeMatcher, matchNames, namesFrom } from "../lib/holdingsMatch";
import { csvName, modelFor, parsePeriod, parseTab, toCsv, useOverview, withTab, type Line, type OverviewHolding, type Period, type Tab } from "../lib/portfolioOverview";
import { usePortfolioPage } from "../portfolio/usePortfolioPage";
import { ScoreCard, ScoreInputs } from "../portfolio/ScoreCard";
import { loadChoices, saveChoices, usePortfolioScore, type Choices } from "../portfolio/useScore";
import { usePortfolioTrend } from "../portfolio/usePortfolioTrend";
import { TrendCard } from "../mf/Spread";
import "../styles/mfspread.css";
import { SharesTable } from "../portfolio/SharesTable";
import { sectorColors, sectorOrder, plural } from "../portfolio/derive";
import { ADD_NOTE } from "../portfolio/words";
import type { Mode } from "../portfolio/types";
import "../portfolio/pf.css";
import { useQueries } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import { capBucket } from "../lib/capBuckets";
import { useIndices } from "../lib/indices";
import { dayWord } from "../lib/dashPack";
import { Cards } from "../components/sectors/pack/Common";
import type { Leadership } from "../lib/leadership";
import { scoreTiles, sharesCards, type Share, type Size } from "../lib/equityPack";
import { EachRisk, InShort, MarketFall, MoneyRisk, MovesGrid, Packs, StyleTiltPack, PeersSection, RiskGlance, ScoreGrid, SizeFold, SpreadSection, ViewTabs, WhereSits, type View } from "../portfolio/pack/EquityPack";
import "../styles/sectors-pack.css";
import "../styles/industry-pack.css";
import "../styles/dashboard.css";
import "../portfolio/pack/equity-pack.css";

/** Equity portfolio: give it the names of the shares you own (typed, pasted or from a broker file) and it describes the list: how strong each share is, where the list sits by
 *  sector and size, what moves together, where the risk comes from and how the list has moved against the NIFTY 50. Names only: quantities, prices and dates are never asked for.
 *  Every figure and every sentence comes from POST /api/portfolio/page (the handover pack's engine) and POST /api/portfolio/overview (live price and the plan's scores). */

export function HoldingsPage() {
  useDocTitle("Equity portfolio", "Add the shares you own, by name or from a broker file, and see how strong each one is, how spread out the list is, what moves together and where the risk comes from.");
  const { plan, toast } = useUI();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const model = modelFor(plan, isAdmin);          // Silver: the basic FinLit IQ. Gold: FinLit Prism only. Basic: the page is gated.
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get("tab")), period = parsePeriod(params.get("period"));
  const go = (t: Tab, pd: Period = period) => setParams(withTab(params.toString(), t, pd), { replace: true });
  const st = usePortfolio();
  const uni = useUniverse(), idx = useSearchIndex(true);
  const by = useMemo(() => new Map((uni.data?.rows || []).map((r) => [r.symbol, r])), [uni.data]);
  const index = idx.data?.rows || [];
  const cap = limitsFor(plan).holdings;
  const [one, setOne] = useState(""), [text, setText] = useState(""), [pasting, setPasting] = useState(false), [missing, setMissing] = useState<string[]>([]);
  const file = useRef<HTMLInputElement>(null), [busy, setBusy] = useState(false), [pdf, setPdf] = useState<File | null>(null);
  const matcher = useMemo(() => makeMatcher(index), [index]);
  const mode: Mode = "eq";   // the final pages pack reads the list as equal amounts throughout

  const symbols = useMemo(() => [...new Set(st.holdings.map((h) => h.symbol))], [st.holdings]);
  const ov = useOverview(symbols, !!model && !DEMO);
  const pg = usePortfolioPage(symbols, !!model && !DEMO);
  const tr = usePortfolioTrend(symbols, !!model && !DEMO);
  const [choices, setChoices] = useState<Choices>(() => loadChoices());
  const pick = (c: Choices) => { setChoices(c); saveChoices(c); };
  const qtyBySymbol = useMemo(() => { const m = new Map<string, number>(); st.holdings.forEach((h) => { if (h.owned && h.qty > 0) m.set(h.symbol, (m.get(h.symbol) ?? 0) + h.qty); }); return m; }, [st.holdings]);
  const onQty = (sym: string, qty: number | null) => {
    const mine = st.holdings.filter((h) => h.symbol === sym);
    if (!mine.length) return;
    const [first, ...others] = mine;
    others.forEach((h) => portfolio.remove(h.id));                                  // one line per share once a quantity is typed
    portfolio.update(first.id, qty ? { qty, owned: true } : { qty: 1, owned: false });
  };
  const scoreOn = model === "prism" && !DEMO;
  const sc = usePortfolioScore(symbols.map((s) => ({ symbol: s, qty: qtyBySymbol.get(s) ?? null })), choices, scoreOn);
  const byOv = useMemo(() => new Map((ov.data?.holdings || []).map((h) => [h.symbol, h])), [ov.data]);
  const lines: Line[] = useMemo(() => symbols.map((s) => ({ symbol: s, ov: byOv.get(s), name: by.get(s)?.name || index.find((r) => r[0] === s)?.[1] || "" })), [symbols, by, byOv, index]);
  useEffect(() => { if (!DEMO && symbols.length && uni.data && lines.some((l) => !l.ov)) { const t = setInterval(() => qc.invalidateQueries({ queryKey: ["universe"] }), 20_000); return () => clearInterval(t); } }, [symbols.length, uni.data, lines, qc]);

  const data = pg.data, page = data?.page ?? null, meta = data?.meta ?? {};
  const colors = useMemo(() => (page ? sectorColors(sectorOrder(page, "eq")) : {}), [page]);
  const ovMap = byOv as Map<string, OverviewHolding>;
  const ids = data?.symbols ?? symbols;
  const state: "loading" | "ready" | "error" | "none" = DEMO ? "none" : pg.isError ? "error" : pg.isPending && symbols.length ? "loading" : "ready";

  const add = (names: string[], from?: string) => {
    if (!names.length) { toast(from ? `No share names found in ${from}. It should have a column with the share names (Symbol, Stock, Instrument or Company).` : "No share names found. Put one name or ticker per line, or paste the Name column from your broker."); return; }
    if (!index.length) { toast("The company list is still loading. Try again in a moment."); return; }
    const { found, missing: miss } = matchNames(names, index);
    const fresh = [...new Map(found.filter((f) => !symbols.includes(f.symbol)).map((f) => [f.symbol, f])).values()];
    const room = Math.max(0, cap - symbols.length), take = fresh.slice(0, room);
    if (take.length) portfolio.addMany(take.map((f) => ({ symbol: f.symbol, qty: 1, price: 0 })));
    setMissing(miss);
    toast([take.length ? `Added ${take.length} ${take.length === 1 ? "share" : "shares"}` : "Nothing new to add", miss.length ? `${miss.length} not recognised (listed below)` : "", fresh.length > room ? `your plan holds up to ${cap}` : ""].filter(Boolean).join(" · ") + ".");
  };
  const exportCsv = () => model && saveFile(csvName(tab, period), toCsv(lines, tab, model, period), "text/csv;charset=utf-8");
  const empty = !lines.length;
  const common = page && model ? { page, meta, symbols: ids, mode, colors, model, ov: ovMap } : null;

  // ---------------------------------------------------------------- the final pages pack (boards 12-14)
  const view: View = params.get("view") === "diversification" ? "diversification" : params.get("view") === "risk" ? "risk" : "portfolio";
  const setView = (v: View, scroll = false) => { const n = new URLSearchParams(params); if (v === "portfolio") n.delete("view"); else n.set("view", v); setParams(n, { replace: true }); if (scroll) setTimeout(() => document.getElementById("eq-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); };
  const leads = useQueries({ queries: symbols.map((s) => ({ queryKey: ["leadership", s], queryFn: () => apiGet<Leadership>(`/api/stocks/${encodeURIComponent(s)}/leadership`), staleTime: 15 * 60_000, retry: false, enabled: !!model && !DEMO })) });
  const idxQ = useIndices(), day = dayWord(new Date(), idxQ.data?.asOf ?? null);
  const NOT_RANKED: Record<string, string> = { history: "has under a year of prices", liquidity: "trades too thinly to rank fairly", stale: "has no recent prices", group: "has no peer group", hidden: "is not ranked", pending: "is waiting for its first weekly reading" };
  // below52: the screener table carries pct_from_high; the shared Row type does not name it
  const shares: Share[] = useMemo(() => lines.map((l, i) => {
    const h = l.ov && l.ov.status === "ready" ? l.ov : null, u = by.get(l.symbol), ld = leads[i]?.data, pr = h?.prism;
    const size = (capBucket(h?.marketCapCr ?? u?.market_cap ?? null)?.label.replace(" cap", "") ?? null) as Size | null;
    const peer = ld && ld.available ? { label: ld.label, raw: ld.rawLabel ?? null, rank: ld.rank, of: ld.peerGroup.ranked, group: ld.peerGroup.short || ld.peerGroup.name, vs: ld.rel.w52 == null ? null : ld.rel.w52 * 100, bench: ld.benchmarks.sector.kind === "index" ? ld.benchmarks.sector.name : "peer average", direction: ld.direction } : null;
    return { symbol: l.symbol, industry: h?.sector ?? meta[l.symbol]?.sector ?? null, size, chg: h?.changePct ?? null, prism: pr?.final ?? null, prismWord: pr?.label ?? null, valuation: pr?.parts?.valuation ?? null, risk: pr?.parts?.risk ?? null,
      st: pr?.shortTerm?.score ?? null, lt: pr?.longTerm?.score ?? null, below52: (u as { pct_from_high?: number | null } | undefined)?.pct_from_high ?? null, m1: u?.return_1m ?? null, peer, notCompared: ld && !ld.available ? NOT_RANKED[ld.reason] ?? "is not ranked" : null };
  }), [lines, by, leads, meta]);   // eslint-disable-line react-hooks/exhaustive-deps
  const shareOf = useMemo(() => new Map(shares.map((x) => [x.symbol, x])), [shares]);
  const secW = page?.sector_weight.eq ?? {}, secR = page?.sector_risk.eq ?? {};
  const counts = useMemo(() => { const c: Record<string, string[]> = {}; ids.forEach((sym) => { const k = meta[sym]?.sector || `${sym} (not classified)`; (c[k] ??= []).push(sym); }); return c; }, [ids, meta]);
  const sizeCount = useMemo(() => { const c = { Large: 0, Mid: 0, Small: 0 } as Record<Size, number>; shares.forEach((x) => { if (x.size) c[x.size]++; }); return c; }, [shares]);
  const sizes = (["Large", "Mid", "Small"] as Size[]).map((k) => ({ k, pct: shares.length ? (sizeCount[k] / shares.length) * 100 : 0, who: shares.filter((x) => x.size === k).map((x) => x.symbol) }));
  const packs = useMemo(() => (page?.groups ?? []).map((g) => { const tally = new Map<string, number>(); g.members.forEach((m) => { const k = meta[m]?.sector || ""; tally.set(k, (tally.get(k) ?? 0) + 1); }); const name = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] || "Mixed"; return { members: g.members, avg: g.avg_corr, name }; }), [page, meta]);
  const bigPack = packs.filter((x) => x.members.length >= 3).sort((a, b) => b.members.length - a.members.length)[0];
  const tiles = scoreTiles(shares, sc.data?.readings as never, page as never, Object.keys(counts).length, (["Large", "Mid", "Small"] as Size[]).filter((k) => sizeCount[k]).length, bigPack ? { n: bigPack.members.length, name: bigPack.name } : null);
  const sr = page?.share_risk.eq ?? {}, sw = page?.share_weight.eq ?? {};
  const top3 = (() => { const xs = Object.keys(sr).sort((a, b) => sr[b] - sr[a]).slice(0, 3); return xs.length === 3 ? { symbols: xs, risk: xs.reduce((a, k) => a + sr[k], 0), money: xs.reduce((a, k) => a + (sw[k] ?? 0), 0) } : null; })();
  const [showChoices, setShowChoices] = useState(false);

  return (
    <div className="wrap ipo pfx sp eq">
      <Gate tier="silver" title="Score your portfolio" points={["FinLit IQ and pillars for every share you own (Gold: FinLit Prism)", "How spread out the list is, and what moves together", "Share of risk and the NIFTY 50 comparison", "Import Excel, CSV or PDF statements"]}>
        <div className="pfx-flow">
        <header className="sp-head eq-head">
          <div><p className="eq-plan"><span>Silver</span></p><h1>Equity portfolio</h1>
            <p className="sp-desc">How strong your shares are, how well spread they are, and how risky the whole list is. Start with names; add quantities when you want the figures to follow your money. Nothing is sent to a broker.</p>
            <nav className="eq-links" aria-label="Related pages"><Link className="sp-link" to="/mf-portfolio">MF portfolio →</Link><Link className="sp-link" to="/watchlist">Watchlists →</Link><Link className="sp-link" to="/alerts">Alerts →</Link><Link className="sp-link" to="/learn/portfolio">Learn more →</Link></nav></div>
        <section className="eq-addbar" aria-label="Add shares">
          <form className="pfx-add" onSubmit={(e) => { e.preventDefault(); add([one.trim()].filter(Boolean)); setOne(""); }}>
            <label className="pfx-input"><span className="sr-only">Add a share by name or ticker</span><Icon name="search" />
              <input list="pf-names" value={one} onChange={(e) => setOne(e.target.value)} placeholder="Add a share by name or ticker" autoComplete="off" maxLength={80} /></label>
            <datalist id="pf-names">{index.slice(0, 500).map((r) => <option key={r[0]} value={r[0]}>{r[1]}</option>)}</datalist>
            <button className="pfx-solid">Add</button>
            <span className="eq-add2"><button type="button" className="pfx-btn" aria-expanded={pasting} onClick={() => setPasting((v) => !v)}>Paste a list</button>
            <button type="button" className="pfx-btn" onClick={() => file.current?.click()} disabled={busy}>{busy ? "Reading…" : "Upload broker file"}</button>
            <input ref={file} type="file" accept={ACCEPT + ",.pdf,application/pdf"} hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; if (isPdf(f)) { setPdf(f); return; } setBusy(true);
              try { add(await namesFromFile(f, matcher), f.name); } catch (err) { toast(err instanceof Error && err.message.startsWith("That file") ? err.message : "That file could not be read. Save it as .xlsx or .csv, or paste the share names instead."); } finally { setBusy(false); } }} />
            <span className="pfx-cap">{symbols.length} of {cap} shares</span></span>
          </form>
          <p className="pfx-note sr-only">{ADD_NOTE}</p>
          {pasting && <div className="pfx-paste"><textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={"RELIANCE\nHDFC Bank\nInfosys Ltd\nTCS"} aria-label="Share names to add, one per line" />
            <button className="pfx-solid" onClick={() => { add(namesFrom(text, matcher)); setText(""); }} disabled={!text.trim()}>Add these</button></div>}
          {pdf && <PdfImport file={pdf} index={index} held={symbols} room={Math.max(0, cap - symbols.length)} onClose={() => setPdf(null)}
            onAdd={(syms) => { portfolio.addMany(syms.map((sym) => ({ symbol: sym, qty: 1, price: 0 }))); toast(`Added ${syms.length} ${syms.length === 1 ? "share" : "shares"} from the PDF.`); }} />}
          {missing.length > 0 && <p className="pf-miss" role="status"><b>Not recognised:</b> {missing.slice(0, 20).join(", ")}{missing.length > 20 ? ` and ${missing.length - 20} more` : ""}. Check the spelling or use the NSE ticker.</p>}
        </section>
        </header>

        {empty ? <div className="card dw-empty"><span className="dw-ei"><Icon name="wallet" /></span><b>No shares yet</b><p>Add the shares you own above. {DEMO ? "" : <>You can also <Link to="/watchlist">start from your watchlist</Link>.</>}</p></div> : model && <>
          {scoreOn ? (sc.data && !sc.data.locked ? <ScoreGrid total={sc.data.total ?? null} band={sc.data.band} needsQty={!!sc.data.needsQuantities} tiles={tiles} onAddQty={() => { setView("portfolio"); setTimeout(() => document.querySelector<HTMLInputElement>(".x-qty input")?.focus(), 50); }} onGo={(t) => setView(t === "shares" ? "portfolio" : t, true)} />
            : <ScoreCard a={sc.data} state={sc.isError ? "error" : sc.isPending ? "loading" : "ready"} error={sc.error?.body?.detail} />) : null}
          {scoreOn && <details className="sp-sec sp-fold" open={showChoices} onToggle={(e) => setShowChoices((e.currentTarget as HTMLDetailsElement).open)}>
            <summary><span><b className="sp-ft">Make the score yours</b><small>All optional: horizon, risk comfort, goal and the index to compare with. They stay in this browser.</small></span><span className="sp-show">{showChoices ? "Hide ▴" : "Show ▾"}</span></summary>
            <ScoreInputs c={choices} onChange={pick} /></details>}
          {data && data.unknown.length > 0 && <p className="pfx-warn" role="status">Not in FinLit's company list, so left out of the figures: {data.unknown.join(", ")}.</p>}
          {data && data.noPrices.length > 0 && <p className="pfx-note" role="status">No stored prices yet for {data.noPrices.join(", ")}: {plural(data.noPrices.length, "share")} left out of the co-movement figures.</p>}
          {DEMO && <p className="pfx-note" role="status">The diversification figures are not available in the demo preview.</p>}
          {state === "error" && <p className="pfx-warn" role="alert">{pg.error?.body?.detail || "The figures for this list could not be loaded. Try again in a moment."}</p>}
          <div id="eq-tabs"><ViewTabs view={view} onView={(v) => setView(v)} n={lines.length} /></div>
          <div id="eq-panel" role="tabpanel" aria-labelledby={`eq-tab-${view}`}>
          {view === "portfolio" && <>
            <SharesTable qtyOf={(sym) => qtyBySymbol.get(sym) ?? null} onQty={onQty} lines={lines} meta={meta} page={page} mode={mode} colors={colors} model={model} tab={tab} period={period} limit={cap} state={ov.isError ? "error" : ov.isPending && !DEMO ? "loading" : "ready"}
              errorText={DEMO ? "Scores are not available in the demo preview." : ov.error?.body?.detail} onTab={(t) => go(t)} onPeriod={(pd) => go("financials", pd)} onExport={exportCsv}
              peerOf={(sym) => shareOf.get(sym)} day={day} cards={tab === "overview" ? <div className="eq-cards"><Cards items={sharesCards(shares, day)} /></div> : null}
              actions={(sym) => <button className="pfx-x" aria-label={`Remove ${sym}`} title={`Remove ${sym}`} onClick={() => { st.holdings.filter((h) => h.symbol === sym).forEach((h) => portfolio.remove(h.id)); toast(`${sym} removed.`); }}>×</button>} />
            <SizeFold counts={sizeCount} />
            {tr.data && !tr.data.locked && tr.data.trend && <TrendCard t={{ all: tr.data.trend }} nm={(c) => String(c)} what="shares in your list" />}
            {tr.data?.locked && <section className="card x-trend" aria-label="Short- and long-term trend"><div className="card-h"><h3>Short- and long-term trend</h3></div><p className="faint">{tr.data.why} <Link to="/plans">See plans</Link></p></section>}
            <PeersSection shares={shares} />
          </>}
          {view === "diversification" && (page && common ? <>
            <SpreadSection page={page} weights={secW} counts={counts} sizeCount={sizeCount} packs={packs} />
            <div className="eq-row"><WhereSits weights={secW} sizes={sizes} /><Packs packs={packs} weights={secW} n={ids.length} /></div>
            <MovesGrid page={page} packs={packs} />
            <StyleTiltPack tilt={data?.styleTilt} />
          </> : <p className="sp-note">{state === "loading" ? "Working out the figures…" : "The diversification figures need at least two shares with a year of weekly prices."}</p>)}
          {view === "risk" && (page ? <>
            <RiskGlance m={page.market.eq} top3={top3} shares={shares} risk={sr} money={sw} day={day} to={page.to} />
            <div className="eq-row"><MoneyRisk sw={secW} sr={secR} counts={counts} /><MarketFall beta={page.market.eq.beta} /></div>
            <EachRisk shares={shares} risk={sr} money={sw} day={day} />
          </> : <p className="sp-note">{state === "loading" ? "Working out the figures…" : "The risk figures need shares with a year of weekly prices."}</p>)}
          </div>
          {page && <InShort items={page.summary.eq} />}
        </>}
        </div>
      </Gate>
      <details className="sp-sec sp-fold eq-disc"><summary><span><b className="sp-ft">Disclaimer</b><small>What this page is, and is not</small></span><span className="sp-show">Show ▾</span></summary><PortfolioDisclaimer kind="equity" /></details>
    </div>
  );
}
