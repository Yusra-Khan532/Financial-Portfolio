// The ETF portfolio (task #136, the team's pack 07, /etf-portfolio): a member's ETFs, built like the MF portfolio page and on its styles. Header with
// search + Add ETF, Import a broker file, Add quantities and the plan's count; five tiles; "Your ETFs" with three column sets and up to three insight
// cards; "Risk analytics" against the Nifty 500 with how the ETFs move together and what each adds. Equal weights until every ETF has a quantity, and
// the page says so. Plan: Silver and up, as My mutual funds (the pack's "Mutual Fund + ETF" plan is not confirmed). Describes; never advice.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { Gate } from "../components/Gate";
import { RemoveAll } from "../components/RemoveAll";
import { Cards, Scroll, Section, Tip } from "../components/sectors/pack/Common";
import { apiGet, type ApiError } from "../lib/api";
import { useDocTitle } from "../lib/title";
import { useUI } from "../lib/ui";
import { dateIN, MINUS, nf } from "../lib/format";
import { pct, rupee, traded, type EtfList, type EtfTracking } from "../lib/etf";
import { gridsFromFile, ACCEPT, MAX_BYTES } from "../lib/holdingsFile";
import { cards, etfRowsFromGrid, tiles, useEtfPortfolio, useEtfRisk, useEtfWrites, type EtfHolding, type EtfRisk, type Preview } from "../lib/etfPortfolio";
import "../styles/mf.css";
import "../styles/mfportfolio.css";
import "../styles/sectors-pack.css";
import "../styles/industry-pack.css";
import "../mf/pack/mf-pack.css";
import "../styles/etfportfolio.css";

type View = "etfs" | "risk";
type Cols = "returns" | "trading" | "risk";
const errText = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again in a moment.");
const signed = (v: number | null | undefined, d = 2) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? MINUS : ""}${nf(Math.abs(v), d)}%`);
const Dash = ({ why }: { why?: string | null }) => <span className="etfp-dash" title={why ?? "Not available"}>—<span className="sr-only"> (not available: {why ?? "not available"})</span></span>;
const num = (v: number | null | undefined, f: (x: number) => string, why?: string | null) => (v == null ? <Dash why={why} /> : f(v));

/** Search an ETF by name or symbol, then Add ETF. */
function AddEtf({ onDone, disabled }: { onDone: (m: string) => void; disabled: boolean }) {
  const w = useEtfWrites();
  const [q, setQ] = useState(""), [hits, setHits] = useState<{ symbol: string; name: string }[]>([]), [pick, setPick] = useState<{ symbol: string; name: string } | null>(null);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2 || pick) { setHits([]); return; }
    const h = window.setTimeout(async () => { try { const r = await apiGet<EtfList>(`/api/etf?q=${encodeURIComponent(t)}&limit=8`); setHits(r.items.map((i) => ({ symbol: i.symbol, name: i.name }))); } catch { setHits([]); } }, 200);
    return () => window.clearTimeout(h);
  }, [q, pick]);
  const add = async () => {
    if (!pick) return;
    try { const r = await w.add.mutateAsync({ symbol: pick.symbol }); onDone(r.merged ? `${pick.symbol} is already in your list.` : `Added ${pick.symbol}.`); setPick(null); setQ(""); }
    catch (x) { onDone(errText(x)); }
  };
  return (
    <div className="etfp-addbox">
      <label className="etfp-search"><span className="sr-only">Search an ETF by name or symbol</span>
        <input type="search" value={pick ? `${pick.symbol} · ${pick.name}` : q} placeholder="Search an ETF by name or symbol" disabled={disabled} autoComplete="off" spellCheck={false} maxLength={60}
          onChange={(e) => { setPick(null); setQ(e.target.value); }} /></label>
      <button type="button" className="btn primary" disabled={!pick || w.add.isPending || disabled} onClick={add}>Add ETF</button>
      {hits.length > 0 && <ul className="etfp-hits" aria-label="Matching ETFs">{hits.map((h) => <li key={h.symbol}><button type="button" onClick={() => { setPick(h); setHits([]); }}><b>{h.symbol}</b><span>{h.name}</span></button></li>)}</ul>}
    </div>
  );
}

/** Import a broker file: every line with an ISIN (or a symbol column) is matched to an NSE ETF on the server, ISIN first; nothing is saved until you confirm. */
function ImportFile({ onDone }: { onDone: (m: string) => void }) {
  const w = useEtfWrites(), ref = useRef<HTMLInputElement>(null);
  const [pv, setPv] = useState<Preview | null>(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const read = async (f: File) => {
    setErr(""); setPv(null);
    if (f.size > MAX_BYTES) { setErr("That file is larger than 5 MB. Download a holdings statement with only your current holdings."); return; }
    setBusy(true);
    try {
      const rows = (await gridsFromFile(f)).flatMap(etfRowsFromGrid);
      if (!rows.length) { setErr("No line with an ISIN or a symbol was found in that file. Use your broker's holdings statement (Excel or CSV)."); return; }
      setPv(await w.preview.mutateAsync(rows));
    } catch (x) { setErr(x instanceof Error && x.message.startsWith("That file") ? x.message : "That file could not be read. Save it as .xlsx or .csv and try again."); }
    finally { setBusy(false); }
  };
  const ok = (pv?.rows ?? []).filter((r) => r.status === "matched");
  return (
    <div className="etfp-import">
      <p className="sp-note">Use the holdings statement your broker gives (Excel, CSV or the HTML table some save as .xls). Each line is matched on its ISIN first, then its symbol. Shares and funds bought from a fund house are left out; they belong in their own portfolio.</p>
      <input ref={ref} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ""; }} />
      <button type="button" className="btn" disabled={busy} onClick={() => ref.current?.click()}>{busy ? "Reading…" : "Choose a file"}</button>
      {err && <p className="formerr" role="alert">{err}</p>}
      {pv && <div className="etfp-preview">
        <p role="status"><b>{pv.counts.matched}</b> ETF{pv.counts.matched === 1 ? "" : "s"} found{pv.counts.not_found ? ` · ${pv.counts.not_found} not ETFs or not found` : ""}{pv.counts.duplicate ? ` · ${pv.counts.duplicate} repeated` : ""}{pv.counts.invalid ? ` · ${pv.counts.invalid} unreadable` : ""}. Room in your plan: {pv.capacity.room}.</p>
        <Scroll label="Lines of the file"><table className="sp-tb"><thead><tr><th scope="col">Line</th><th scope="col">ETF</th><th scope="col" className="r">Units</th><th scope="col">Result</th></tr></thead>
          <tbody>{pv.rows.map((r) => <tr key={r.i}><td>{r.i + 1}</td><td>{r.etf ? <><b>{r.etf.symbol}</b> <small>{r.etf.name}</small></> : r.name || r.isin || r.symbol || "—"}</td>
            <td className="r">{r.units == null ? "—" : nf(r.units, 0)}</td><td>{r.status === "matched" ? `Found by ${r.via === "isin" ? "ISIN" : "symbol"}${r.existing ? "; already in your list (units will be set)" : ""}` : r.reason}</td></tr>)}</tbody></table></Scroll>
        <button type="button" className="btn primary" disabled={!ok.length || w.commit.isPending} onClick={async () => {
          try { const r = await w.commit.mutateAsync(ok.map((x) => ({ symbol: x.symbol as string, units: x.units ?? null }))); onDone(`Added ${r.added}, updated ${r.updated}.`); setPv(null); } catch (x) { setErr(errText(x)); } }}>Add {ok.length} ETF{ok.length === 1 ? "" : "s"}</button>
      </div>}
    </div>
  );
}

function UnitsCell({ h, onDone }: { h: EtfHolding; onDone: (m: string) => void }) {
  const w = useEtfWrites();
  const [v, setV] = useState(h.units == null ? "" : String(h.units));
  const save = async () => { if (v.trim() === (h.units == null ? "" : String(h.units))) return; try { await w.units.mutateAsync({ id: h.id, units: v }); onDone(`Units saved for ${h.symbol}.`); } catch (x) { onDone(errText(x)); setV(h.units == null ? "" : String(h.units)); } };
  return <input className="etfp-units" inputMode="decimal" value={v} placeholder="Units" aria-label={`Units of ${h.symbol}`} onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />;
}

export function EtfPortfolioPage() {
  useDocTitle("ETF portfolio", "Your ETFs together: what they track, what they cost, how close their prices are to NAV, and how risky they are against the Nifty 500.");
  const { has, toast } = useUI();
  const silver = has("silver");
  const q = useEtfPortfolio(silver), w = useEtfWrites();
  const d = q.data, n = d?.count ?? 0;
  const rk = useEtfRisk(silver && n > 0, n);
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "risk" ? "risk" : "etfs";
  const setView = (v: View, scroll = false) => { setParams(v === "etfs" ? {} : { view: v }, { replace: true }); if (scroll) document.getElementById("etfp-tabsbox")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const [cols, setCols] = useState<Cols>("returns"), [importing, setImporting] = useState(false), [qtys, setQtys] = useState(false);
  const hs = d?.holdings ?? [];
  const live = hs.filter((h) => !h.missing);
  const track = useQueries({ queries: live.map((h) => ({ queryKey: ["etf", "tracking", h.symbol], queryFn: () => apiGet<EtfTracking>(`/api/etf-vs-index/for/${encodeURIComponent(h.symbol)}`), staleTime: 300_000, retry: false, enabled: cols === "trading" })) });
  const trackOf = new Map(live.map((h, i) => [h.symbol, track[i]]));
  const t = useMemo(() => tiles(hs), [hs]);
  const cs = useMemo(() => cards(hs, rk.data), [hs, rk.data]);
  const riskOf = new Map((rk.data?.etfs ?? []).map((e) => [e.symbol, e]));
  const lvl = rk.data?.list.level;

  return (
    <div className="wrap ipo mp sp mfp etfp">
      <Gate tier="silver" title="Track your ETFs" points={["What they track, with the same index twice flagged", "What they cost a year, and how close their prices are to NAV", "Each ETF's swing, worst fall and beta against the Nifty 500", "Import your broker's holdings file"]}>
        <header className="sp-head mfp-head">
          <div><p className="mfp-plan"><span>Silver</span></p><h1>ETF portfolio</h1>
            <p className="sp-desc">Your ETFs together: what they track, what they cost, how close their prices are to NAV, and how risky they are against the Nifty 500.</p>
            <nav className="mfp-links" aria-label="Related pages"><Link className="sp-link" to="/my-investments">All my investments →</Link><Link className="sp-link" to="/mf-portfolio">MF portfolio →</Link>
              <Link className="sp-link" to="/holdings">Equity portfolio →</Link><Link className="sp-link" to="/etfs/compare">Compare ETFs →</Link></nav></div>
          <section className="mfp-add" aria-label="Add ETFs">
            <AddEtf disabled={!!d && d.count >= d.limit} onDone={toast} />
            <div className="mfp-add2">
              <button type="button" className="btn" aria-expanded={importing} onClick={() => setImporting((v) => !v)}>Import a broker file</button>
              <button type="button" className="btn" aria-pressed={qtys} disabled={!n} onClick={() => { setQtys((v) => !v); setCols("returns"); }}>{qtys ? "Done" : "Add quantities"}</button>
              <RemoveAll count={n} noun="ETF" className="btn" busy={w.clear.isPending} note="Their quantities go too. This cannot be undone."
                onConfirm={async () => { try { const r = await w.clear.mutateAsync(); toast(`Removed ${r.removed} ${r.removed === 1 ? "ETF" : "ETFs"}.`); } catch (x) { toast(errText(x)); } }} />
              <span>{d ? `${n} ETF${n === 1 ? "" : "s"} · ${d.limit} on your plan` : ""}</span></div>
          </section>
        </header>
        {importing && <section className="sp-sec mfp-import" aria-label="Import a broker file"><ImportFile onDone={(m) => { toast(m); setImporting(false); }} /></section>}

        {q.isPending && silver && <div className="sp-sec" aria-busy="true"><b>Loading your ETFs…</b></div>}
        {q.isError && <div className="sp-sec" role="alert"><b>Your ETFs could not be loaded</b><p>{errText(q.error)}</p><button className="btn" onClick={() => q.refetch()}>Try again</button></div>}
        {d && !n && <div className="sp-sec etfp-empty"><b>No ETFs yet</b><p className="sp-note">Search an ETF above and select Add ETF, or import your broker's holdings file. {d.limit} ETFs fit in your plan. Every ETF on the NSE is on the <Link to="/etfs">ETFs page</Link>.</p></div>}
        {d && n > 0 && <>
          <section className="mfp-tiles etfp-tiles" aria-label="Your ETFs at a glance">
            <div className="mfp-tile mfp-info"><p className="mfp-tile-k">ETFs</p><p className="mfp-tile-v">{t.count.n}</p><p className="mfp-tile-x">{t.count.types}</p><button type="button" className="mfp-tile-go" onClick={() => setView("etfs", true)}>See them →</button></div>
            <div className={"mfp-tile " + (t.track.twice ? "mfp-watch" : "mfp-info")}><p className="mfp-tile-k">What they track<Tip text="The index each ETF follows, from its registered name. Two ETFs on one index hold the same companies." label="About “What they track”" /></p>
              <p className="mfp-tile-v">{t.track.n} {t.track.n === 1 ? "index" : "indexes"}</p><p className="mfp-tile-x">{t.track.twice ? <span className="etfp-twice">{t.track.twice}</span> : "Each one different"}{t.track.notTold ? ` · ${t.track.notTold} not told` : ""}</p><button type="button" className="mfp-tile-go" onClick={() => setView("etfs", true)}>See them →</button></div>
            <div className="mfp-tile mfp-info"><p className="mfp-tile-k">Yearly cost<Tip text={`The expense ratio (AMFI's TER file, or the fund house's own figure), averaged ${d.basis === "value" ? "by value" : "with equal weights until quantities are added"}. It is already inside the price.`} label="About “Yearly cost”" /></p>
              <p className="mfp-tile-v">{t.cost.avg == null ? "—" : `${t.cost.avg.toFixed(2)}% a year`}</p><p className="mfp-tile-x">{t.cost.perLakh == null ? "No expense ratio published yet" : `On ₹1 lakh, about ₹${nf(t.cost.perLakh, 0)} a year`}</p><button type="button" className="mfp-tile-go" onClick={() => { setCols("returns"); setView("etfs", true); }}>See costs →</button></div>
            <div className={"mfp-tile " + (t.nav.furthest ? "mfp-watch" : "mfp-good")}><p className="mfp-tile-k">Price against value<Tip text="Each ETF's last close on the NSE against AMFI's NAV of the same day." label="About “Price against value”" /></p>
              <p className="mfp-tile-v">{t.nav.word}</p><p className="mfp-tile-x">{t.nav.of ? `${t.nav.within} of ${t.nav.of} closed within 0.2% of their NAV${t.nav.day ? ` on ${dateIN(t.nav.day)}` : ""}${t.nav.furthest ? `; furthest: ${t.nav.furthest.symbol} ${signed(t.nav.furthest.premium)}` : ""}` : "No NAV for the day of the last close yet"}</p>
              <button type="button" className="mfp-tile-go" onClick={() => { setCols("trading"); setView("etfs", true); }}>See prices →</button></div>
            <div className="mfp-tile mfp-info"><p className="mfp-tile-k">Risk level<Tip text="How much your ETFs swing together in a typical year against the Nifty 500, in the MF portfolio's words." label="About “Risk level”" /></p>
              <p className="mfp-tile-v">{rk.isPending ? "…" : lvl ? lvl.word : "—"}</p><p className="mfp-tile-x">{lvl ? `than ${lvl.vs}` : rk.data?.list.why ?? (rk.isError ? errText(rk.error) : "Working it out")}</p><button type="button" className="mfp-tile-go" onClick={() => setView("risk", true)}>See risk →</button></div>
          </section>
          {d.basis === "equal" && <p className="sp-note etfp-basis" role="note">Weights are equal until every ETF has a quantity. <button type="button" className="etfp-link" onClick={() => setQtys(true)}>Add quantities</button> to weigh them by value.</p>}
          <div id="etfp-tabsbox"><div className="mfp-tabs" role="tablist" aria-label="ETF portfolio views">
            {([["etfs", "Your ETFs", "What they track, cost and how they trade"], ["risk", "Risk analytics", "Against the Nifty 500, and how they move together"]] as [View, string, string][]).map(([k, tl, s]) =>
              <button key={k} type="button" role="tab" id={`etfp-tab-${k}`} aria-selected={view === k} aria-controls="etfp-panel" onClick={() => setView(k)}><b>{tl}</b><small>{s}</small></button>)}</div></div>
          <div id="etfp-panel" role="tabpanel" aria-labelledby={`etfp-tab-${view}`}>
          {view === "etfs" && <Section id="etfp-etfs" title="Your ETFs" sub={d.asOf ? `NSE closing prices of ${dateIN(d.asOf)}; NAV and expense ratio from AMFI.` : undefined}
            right={<div className="sp-view" role="group" aria-label="Columns">{([["returns", "Returns & cost"], ["trading", "Trading"], ["risk", "Risk"]] as [Cols, string][]).map(([k, l]) =>
              <button key={k} type="button" className={"sp-vbtn" + (cols === k ? " on" : "")} aria-pressed={cols === k} onClick={() => setCols(k)}>{l}</button>)}</div>}>
            {cs.length > 0 && <Cards items={cs} />}
            <Scroll label="your ETFs"><table className="sp-tb etfp-tb">
              <thead><tr><th scope="col">ETF</th><th scope="col">Tracks</th>{qtys && <th scope="col" className="r">Units</th>}
                {cols === "returns" && <><th scope="col" className="r">Price</th><th scope="col" className="r">1 day</th><th scope="col" className="r">1 year</th><th scope="col" className="r">5 years<Tip text="The total price change over five years, not a yearly rate. Dividends are not included." /></th><th scope="col" className="r">Expense ratio<Tip text="A year: AMFI's TER file, or the fund house's own figure when AMFI has none." /></th></>}
                {cols === "trading" && <><th scope="col" className="r">Price vs NAV<Tip text="The last close on the NSE against AMFI's NAV of the same day. Plus: above the NAV." /></th><th scope="col" className="r">Traded a day<Tip text="Average value traded each day over the last 20 sessions." /></th><th scope="col" className="r">Tracking difference<Tip text="Over the last year: the ETF's return minus its index's (a price index, so dividends sit in the difference). Below zero: it lagged the index." /></th></>}
                {cols === "risk" && <><th scope="col" className="r">Swing a year<Tip text="How much the price rises and falls in a typical year: the spread of its daily changes over 3 years, scaled to a year." /></th><th scope="col" className="r">Worst fall<Tip text="The deepest drop from a high to a later low over 3 years." /></th><th scope="col" className="r">Beta<Tip text="How much it tended to move when the Nifty 500 moved 1%. 1 means in step." /></th><th scope="col" className="r">Falls taken<Tip text="Of the Nifty 500's falls, the share it took. Below 100% means it fell less." /></th></>}
                <th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
              <tbody>{hs.map((h) => { const r = riskOf.get(h.symbol), tq = trackOf.get(h.symbol), td = tq?.data?.tracking?.difference; return (
                <tr key={h.id}>
                  <th scope="row"><Link to={`/etfs/${encodeURIComponent(h.symbol)}`}><b>{h.symbol}</b></Link><small>{h.missing ?? h.name}</small></th>
                  <td>{h.index ? <>{h.index.label}{h.twice && <span className="etfp-twice">Twice</span>}</> : <span className="etfp-dash" title="The ETF's registered name does not say which index it follows">Not told</span>}</td>
                  {qtys && <td className="r"><UnitsCell h={h} onDone={toast} /></td>}
                  {cols === "returns" && <><td className="r">{num(h.price, (v) => rupee(v), h.why?.price)}</td><td className="r">{num(h.changePct, (v) => signed(v), h.why?.change)}</td>
                    <td className="r">{num(h.ret1y, (v) => pct(v), h.why?.ret_1y)}</td><td className="r">{num(h.ret5y, (v) => pct(v), h.why?.ret_5y)}</td><td className="r">{num(h.ter ?? null, (v) => `${v.toFixed(2)}%`, h.why?.ter)}</td></>}
                  {cols === "trading" && <><td className="r">{num(h.premium, (v) => signed(v), h.why?.nav_premium ?? "No NAV for the day of the last close")}</td><td className="r">{num(h.avgTurnover, traded, "Too few trading days to average")}</td>
                    <td className="r">{tq?.isLoading ? <i className="skeleton" style={{ display: "inline-block", width: 48, height: 12 }} /> : num(td?.value ?? null, (v) => `${v > 0 ? "+" : v < 0 ? MINUS : ""}${nf(Math.abs(v), 2)} pp`, td?.why ?? (h.index?.key.startsWith("cat:") ? `Worked out only for ETFs that follow a share index; this one follows the ${h.index.label.toLowerCase()}.` : tq?.data && !tq.data.index ? "The index this ETF follows could not be told from its name" : "Not available"))}</td></>}
                  {cols === "risk" && <><td className="r">{rk.isPending ? "…" : num(r?.swing ?? null, (v) => `${v.toFixed(1)}%`, r?.why)}</td><td className="r">{num(r?.worstFall ?? null, (v) => signed(v, 1), r?.why)}</td>
                    <td className="r">{num(r?.beta ?? null, (v) => v.toFixed(2), r?.why)}</td><td className="r">{num(r?.fallsTaken ?? null, (v) => `${v.toFixed(0)}%`, r?.why)}</td></>}
                  <td><button className="btn" aria-label={`Remove ${h.symbol}`} title={`Remove ${h.symbol}`} onClick={async () => { try { await w.remove.mutateAsync(h.id); toast(`${h.symbol} removed.`); } catch (x) { toast(errText(x)); } }}>✕</button></td>
                </tr>); })}</tbody></table></Scroll>
            <p className="sp-note">{cols === "returns" ? "Price returns on NSE closing prices; 5 years is the total change, not a yearly rate. Dividends are not included. — means not available; hover it for the reason."
              : cols === "trading" ? "Price vs NAV compares the last close with AMFI's NAV of the same day. Traded a day is the 20-session average. Tracking difference is over the last year, against a price index."
              : rk.data?.bench ? `From each ETF's daily closes over 3 years, to ${dateIN(rk.data.bench.to)}, against the Nifty 500.` : "From each ETF's daily closes over 3 years, against the Nifty 500."}</p>
          </Section>}
          {view === "risk" && <RiskTab rk={rk.data} pending={rk.isPending} err={rk.isError ? errText(rk.error as ApiError) : null} />}
          </div>
        </>}
      </Gate>
      <p className="sp-note etfp-disc">{d?.disclaimer ?? "Information only. Not investment advice. Returns are price returns: dividends and other payouts are not included. Sources: NSE closing prices, AMFI NAV and expense ratios, and each fund house's monthly portfolio file."}</p>
    </div>
  );
}

function RiskTab({ rk, pending, err }: { rk: EtfRisk | undefined; pending: boolean; err: string | null }) {
  if (pending) return <p className="sp-note" aria-busy="true">Working out the risk figures…</p>;
  if (err || !rk) return <p className="sp-note" role="status">{err ?? "The risk figures are not available right now."}</p>;
  if (!rk.count) return <p className="sp-note">{rk.why}</p>;
  const tg = rk.together;
  const tone = (c: number | null) => (c == null ? "" : c >= 0.8 ? "hi" : c >= 0.5 ? "mid" : "lo");
  return (<>
    <Section id="etfp-vs" title="Against the Nifty 500" sub={`Daily closes over 3 years, to ${dateIN(rk.bench.to)}; ${rk.basis === "value" ? "weighted by value" : "equal weights until every ETF has a quantity"}.`}>
      <div className="etfp-vs">
        <div><p className="mfp-tile-k">Swing a year</p><b>{rk.list.swing == null ? "—" : `${rk.list.swing.toFixed(1)}%`}</b><small>Nifty 500: {rk.bench.swing == null ? "—" : `${rk.bench.swing.toFixed(1)}%`}</small></div>
        <div><p className="mfp-tile-k">Worst fall</p><b>{rk.list.worstFall == null ? "—" : signed(rk.list.worstFall, 1)}</b><small>Nifty 500: {rk.bench.worstFall == null ? "—" : signed(rk.bench.worstFall, 1)}</small></div>
        <div><p className="mfp-tile-k">Falls taken</p><b>{rk.list.fallsTaken == null ? "—" : `${rk.list.fallsTaken.toFixed(0)}%`}</b><small>of the Nifty 500's falls</small></div>
      </div>
      <p className="etfp-level">{rk.list.level ? <>Risk level: <b>{rk.list.level.word.toLowerCase()}</b> than the Nifty 500.{rk.list.level.because ? ` ${rk.list.level.because}` : ""}</> : rk.list.why}</p>
    </Section>
    <Section id="etfp-tog" title="ETFs that move together" help="How alike the ETFs' weekly price moves were over the last year (correlation): 1 means they moved as one, 0 not at all." sub={tg.C ? `${tg.weeks} weeks of prices.` : undefined}>
      {tg.C ? <Scroll label="ETFs that move together"><table className="sp-tb etfp-mx"><thead><tr><th scope="col"><span className="sr-only">ETF</span></th>{tg.symbols.map((s) => <th key={s} scope="col" className="r">{s}</th>)}</tr></thead>
        <tbody>{tg.symbols.map((a, i) => <tr key={a}><th scope="row">{a}</th>{tg.C![i].map((c, j) => <td key={j} className={"r etfp-c " + (i === j ? "self" : tone(c))}>{c == null ? "—" : c.toFixed(2)}</td>)}</tr>)}</tbody></table></Scroll>
        : <p className="sp-note">{tg.why}</p>}
      {tg.leftOutWhy && <p className="sp-note">{tg.leftOutWhy} ({tg.leftOut.join(", ")})</p>}
    </Section>
    <Section id="etfp-adds" title="What each one adds" help="Each ETF's share of the list's ups and downs over the last year: its weight times how it moved with the list, divided by how much the list moved. The shares add up to 100%." sub="Share of your ETFs' weekly ups and downs, last year.">
      {tg.adds ? <ul className="etfp-adds">{Object.entries(tg.adds).sort((a, b) => b[1] - a[1]).map(([s, v]) => <li key={s}><span>{s}</span><span className="t" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, v))}%` }} /></span><b>{v.toFixed(1)}%</b></li>)}</ul>
        : <p className="sp-note">{tg.why ?? "Needs two or more ETFs with a year of prices."}</p>}
    </Section>
  </>);
}
