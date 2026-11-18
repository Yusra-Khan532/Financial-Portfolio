// ETF portfolio (task #136; rebuilt for task #183 part 3 from the 15 Nov pack 03): the member's ETFs, built on the same parts as the Equity and MF pages: the dark
// "Your ETF list" box and one tile per tab, Key figures, the numbered sections bar, three tabs (Your ETFs, What's inside, Risk analytics), What this means in
// short, the page's questions and the sources line. Figures are the server's (/api/me/etf-portfolio, /inside, /risk); words come from lib/etfTop and etf/pack.
// Silver and Gold, up to the plan's number of ETFs. Describes; never advice. Information only, not investment advice.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Gate } from "../components/Gate";
import { PageFaqs } from "../components/PageFaqs";
import { PortfolioDisclaimer } from "../components/PortfolioDisclaimer";
import { ClearPortfolio } from "../components/ClearPortfolio";
import { Tip } from "../components/sectors/pack/Common";
import { useDocTitle } from "../lib/title";
import { TIER, useUI } from "../lib/ui";
import { limitsFor } from "../lib/auth";
import { useEtfSearch } from "../lib/etf";
import { etfRowsFromFile, useEtfInside, useEtfPortfolio, useEtfRisk, useEtfWrites, type EtfRow, type Preview } from "../lib/etfPortfolio";
import { ETF_SECS, etfTiles, etfsCards, insideCards, listBox, riskCards, type EtfTab } from "../lib/etfTop";
import { KeyFigures, SectionsBar, TopGrid, jumpTo } from "../portfolio/pack/PageTop";
import { EtfsTable } from "../etf/pack/EtfList";
import { InsideTab } from "../etf/pack/EtfInside";
import { RiskTab } from "../etf/pack/EtfRisk";
import { InShort, SOURCES } from "../etf/pack/EtfShort";
import "../portfolio/pack/pagetop.css";
import "../styles/mfportfolio.css";
import "../styles/sectors-pack.css";
import "../styles/industry-pack.css";
import "../mf/pack/mf-pack.css";
import "../styles/etfportfolio.css";

const errText = (e: unknown) => ((e as { body?: { detail?: string } })?.body?.detail) || (e instanceof Error ? e.message : "Something went wrong. Please try again.");
const rupee = (v: number | null | undefined) => (v == null ? "—" : "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));


/* --------------------------------------------------------------- add one */
function AddEtf({ full, onDone }: { full: boolean; onDone: (m: string) => void }) {
  const w = useEtfWrites();
  const [q, setQ] = useState(""), [pick, setPick] = useState<{ symbol: string; name: string } | null>(null), [err, setErr] = useState("");
  const s = useEtfSearch(q.trim().length >= 2 && !pick ? q.trim() : "");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    const sym = pick?.symbol ?? (s.data?.items[0] && q.trim().toUpperCase() === s.data.items[0].symbol ? s.data.items[0].symbol : null);
    if (!sym) { setErr("Choose an ETF from the search first."); return; }
    try { const r = await w.add.mutateAsync({ symbol: sym }); onDone(r.merged ? "That ETF is already in your list." : "ETF added."); setPick(null); setQ(""); }
    catch (x) { setErr(errText(x)); }
  };
  return (
    <form className="efp-add" onSubmit={submit}>
      <div className="mp-search">
        {pick ? <div className="efp-picked"><b>{pick.name}</b><small>{pick.symbol}</small><button type="button" className="mp-link" onClick={() => { setPick(null); setQ(""); }}>Change</button></div>
          : <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search an ETF by name, symbol or ISIN…" aria-label="Search an ETF by name, symbol or ISIN" maxLength={60} autoComplete="off" />}
        {!pick && q.trim().length >= 2 && (
          <ul role="listbox" aria-label="ETFs found" aria-busy={s.isFetching}>
            {s.isError && <li className="none">The ETF search is not available right now.</li>}
            {s.data && !s.data.items.length && <li className="none">No ETF matches “{q}”.</li>}
            {s.data?.items.map((e) => <li key={e.symbol} role="option" aria-selected="false"><button type="button" onClick={() => { setPick({ symbol: e.symbol, name: e.name }); setQ(""); }}>
              <b>{e.name}</b><small>{e.symbol}{e.categoryLabel ? ` · ${e.categoryLabel}` : ""}{e.fundHouse ? ` · ${e.fundHouse}` : ""}</small></button></li>)}
          </ul>)}
      </div>
      <button className="btn efp-go" disabled={full || w.add.isPending} title={full ? "Your plan's list is full. Remove an ETF to add another." : undefined}>{w.add.isPending ? "Adding…" : "Add ETF"}</button>
      {err && <p className="mp-err" role="alert">{err}</p>}
    </form>
  );
}

/* --------------------------------------------------------------- import a broker file */
const STATUS: Record<string, string> = { matched: "Matched", duplicate: "Repeated", ignored: "Company shares", not_found: "Not an ETF we list", invalid: "Not readable" };
function ImportFile({ onDone }: { onDone: (m: string) => void }) {
  const w = useEtfWrites(), ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [pv, setPv] = useState<Preview | null>(null), [skip, setSkip] = useState<Set<number>>(new Set()), [existing, setExisting] = useState<"skip" | "replace">("skip");
  const read = async (f: File) => {
    setBusy(true); setErr(""); setPv(null);
    try {
      const rows = await etfRowsFromFile(f);
      if (!rows.length) throw new Error("No ISIN or symbol column was found in that file. Export your holdings with ISIN or symbol and quantity, then try again.");
      setPv(await w.preview.mutateAsync(rows)); setSkip(new Set());
    } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
  };
  const items = (pv?.rows ?? []).filter((r) => r.status === "matched" && r.etf && !skip.has(r.i)).map((r) => ({ symbol: r.etf!.symbol, qty: r.qty }));
  const fresh = (pv?.rows ?? []).filter((r) => r.status === "matched" && !r.existing && !skip.has(r.i)).length, nOld = (pv?.rows ?? []).filter((r) => r.status === "matched" && r.existing).length;
  const go = async () => {
    setErr("");
    try { const r = await w.commit.mutateAsync({ items, existing }); onDone(`Imported: ${r.added} added${r.replaced ? `, ${r.replaced} updated` : ""}${r.skipped ? `, ${r.skipped} already in your list (kept)` : ""}.`); setPv(null); }
    catch (x) { setErr(errText(x)); }
  };
  return (<>
    <div className="row mp-file"><button className="btn primary" onClick={() => ref.current?.click()} disabled={busy}>{busy ? "Reading…" : "Choose a broker file…"}</button>
      <input ref={ref} type="file" hidden accept=".xlsx,.xls,.csv,.tsv,.txt,.html,.htm,.ods" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) read(f); }} />
      <span className="faint">A holdings export from your broker (.xlsx, .xls or .csv). Each line is matched on its ISIN, then on its NSE symbol; company shares and mutual funds are left out. Read in your browser: only the ISIN, symbol, name and quantity of each line are sent.</span></div>
    {err && <p className="mp-err" role="alert">{err}</p>}
    {pv && <section className="mp-review" aria-label="Import review">
      <ul className="mp-counts">{Object.entries(pv.counts).filter(([, n]) => n).map(([k, n]) => <li key={k} className={"st-" + k}><b>{n}</b> {STATUS[k].toLowerCase()}</li>)}</ul>
      <div className="mp-tablewrap"><table className="mp-rt">
        <thead><tr><th>Line</th><th>In your file</th><th>Status</th><th>ETF in FinLit</th><th>Quantity</th><th>Import</th></tr></thead>
        <tbody>{pv.rows.map((r) => <tr key={r.i} className={"st-" + r.status}>
          <td data-label="Line">{r.row || r.i + 1}</td>
          <td data-label="In your file"><b>{r.name || r.symbol || r.isin || "(blank)"}</b><small>{[r.isin, r.symbol].filter(Boolean).join(" · ")}</small></td>
          <td data-label="Status"><span className={"mp-chip st-" + r.status}>{STATUS[r.status]}</span><small>{r.reason}</small></td>
          <td data-label="ETF in FinLit">{r.etf ? <><b>{r.etf.name}</b><small>{r.etf.symbol}{r.existing ? " · already in your list" : ""}</small></> : <span className="faint">—</span>}</td>
          <td data-label="Quantity">{r.qty ?? "—"}</td>
          <td data-label="Import">{r.status === "matched" ? <input type="checkbox" aria-label={`Import line ${r.row || r.i + 1}`} checked={!skip.has(r.i)} onChange={(e) => setSkip((s) => { const n = new Set(s); if (e.target.checked) n.delete(r.i); else n.add(r.i); return n; })} /> : null}</td>
        </tr>)}</tbody></table></div>
      {nOld > 0 && <fieldset className="mp-ex"><legend>{nOld} of these ETFs are already in your list</legend>
        <label><input type="radio" checked={existing === "skip"} onChange={() => setExisting("skip")} /> Keep what I have</label>
        <label><input type="radio" checked={existing === "replace"} onChange={() => setExisting("replace")} /> Use the file's quantities</label></fieldset>}
      {fresh > pv.capacity.room && <p className="mp-warn" role="status">Your plan holds {pv.capacity.limit} ETFs ({pv.capacity.used} in your list); untick {fresh - pv.capacity.room} {fresh - pv.capacity.room === 1 ? "line" : "lines"}.</p>}
      <div className="row"><button className="btn primary" onClick={go} disabled={!items.length || fresh > pv.capacity.room || w.commit.isPending}>{w.commit.isPending ? "Importing…" : `Import ${items.length} ${items.length === 1 ? "ETF" : "ETFs"}`}</button><button className="btn" onClick={() => setPv(null)}>Cancel</button></div>
    </section>}
  </>);
}

/* --------------------------------------------------------------- quantities */
function Quantities({ items, onDone }: { items: EtfRow[]; onDone: (m: string) => void }) {
  const w = useEtfWrites();
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(items.map((e) => [e.symbol, e.qty == null ? "" : String(e.qty)]))), [err, setErr] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    try { await w.quantities.mutateAsync(items.map((x) => ({ symbol: x.symbol, qty: v[x.symbol]?.trim() || null }))); onDone("Quantities saved."); }
    catch (x) { setErr(errText(x)); }
  };
  return (
    <form className="efp-qty" onSubmit={save} aria-label="Quantities">
      <p className="sp-note">Units of each ETF you hold. Until every ETF has a quantity, each counts the same on this page; with all of them, each counts by its value at the last close. Leave a box empty to clear it.</p>
      <div className="efp-qgrid">{items.map((e) => <label key={e.symbol}><span>{e.symbol}{e.price != null && <small> · {rupee(e.price)}</small>}</span>
        <input inputMode="decimal" value={v[e.symbol] ?? ""} onChange={(x) => setV((s) => ({ ...s, [e.symbol]: x.target.value }))} placeholder="Units" maxLength={20} aria-label={`Units of ${e.symbol}`} /></label>)}</div>
      {err && <p className="mp-err" role="alert">{err}</p>}
      <button className="btn primary" disabled={w.quantities.isPending}>{w.quantities.isPending ? "Saving…" : "Save quantities"}</button>
    </form>
  );
}


/* --------------------------------------------------------------- the top: the list box, then one tile per tab */
function ListBox({ box, onQty }: { box: ReturnType<typeof listBox>; onQty: () => void }) {
  return (
    <div className="mfp-listbox">
      <p className="mfp-lb-k">Your ETF list<Tip text="The ETFs in your list, by type: Indian shares, gold, silver, shares abroad, debt and liquid." how="Until quantities are added every ETF counts the same, so a liquid ETF weighs as much as a share ETF. Add quantities to weigh them by your money." label="About “Your ETF list”" /></p>
      <p className="mfp-lb-v"><b>{box.n}</b> {box.n === 1 ? "ETF" : "ETFs"}</p>
      <p className="mfp-lb-x">{box.line} {box.weights}</p>
      <button type="button" className="mfp-lb-go" onClick={onQty}>{box.valued ? "Change quantities" : "Add quantities"}</button>
    </div>
  );
}

function Tabs({ view, onView }: { view: EtfTab; onView: (v: EtfTab) => void }) {
  const tabs: [EtfTab, string, string][] = [["etfs", "Your ETFs", "Cost, returns, trading and risk of each ETF"], ["inside", "What's inside", "Asset mix, how alike they are, company sizes"], ["risk", "Risk analytics", "Against the wider market, and the list together"]];
  return <div className="mfp-tabs" role="tablist" aria-label="ETF portfolio views">{tabs.map(([k, t, sub]) => <button key={k} type="button" role="tab" id={`etp-tab-${k}`} aria-selected={view === k} aria-controls="etp-panel" onClick={() => onView(k)}><b>{t}</b><small>{sub}</small></button>)}</div>;
}

/* --------------------------------------------------------------- page */
export function EtfPortfolioPage() {
  useDocTitle("ETF portfolio", "What your ETFs track, what they cost, how close they trade to their value, what sits inside them and how risky they are together.");
  const { plan, has, toast } = useUI();
  const silver = has("silver");
  const q = useEtfPortfolio(silver), w = useEtfWrites();
  const d = q.data, n = d ? d.items.map((e) => `${e.symbol}:${e.qty ?? ""}`).join(",") : "";
  const rk = useEtfRisk(silver && !!d && d.count > 0, n), ins = useEtfInside(silver && !!d && d.count > 0, n);
  const [params, setParams] = useSearchParams();
  const view = (["inside", "risk"].includes(params.get("view") || "") ? params.get("view") : "etfs") as EtfTab;
  const setView = (v: EtfTab, scroll = false) => { const p = new URLSearchParams(params); if (v === "etfs") p.delete("view"); else p.set("view", v); setParams(p, { replace: true }); if (scroll) setTimeout(() => document.getElementById("etp-tabsbox")?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 50); };
  const [panel, setPanel] = useState<"" | "import" | "qty">(params.get("tab") === "import" ? "import" : "");
  const limit = d?.limit ?? limitsFor(plan).etf_holdings;
  const items = useMemo(() => d?.items ?? [], [d]);
  const remove = async (e: EtfRow) => { try { await w.remove.mutateAsync(e.symbol); toast(`${e.symbol} removed.`); } catch (x) { toast(errText(x)); } };
  const goTab = (t: EtfTab, then?: string) => { setView(t); if (then) setTimeout(() => jumpTo(then), 60); };
  // a Key figures card whose section sits on another tab opens that tab first, then the section (the sections bar's jump event)
  const viewRef = useRef(view); viewRef.current = view;
  useEffect(() => {
    const on = (e: Event) => { const id = (e as CustomEvent).detail as string;
      const t = (Object.keys(ETF_SECS) as EtfTab[]).find((k) => ETF_SECS[k].secs.some(([s]) => s === id)) ?? (id === "etp-trading" ? "etfs" : null);
      if (t && t !== viewRef.current) goTab(t, id); };
    addEventListener("eq-jump", on); return () => removeEventListener("eq-jump", on);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const live = items.filter((e) => !e.gone);
  return (
    <div className="wrap ipo mp sp mfp efp">
      <Gate tier="silver" title="Track your ETFs" points={["What each ETF tracks and costs, and how close it trades to its NAV", "What sits inside them: asset mix, overlap and the largest stocks", "Each ETF against the Nifty 500, and the list together", "Import a broker file, read by ISIN, then symbol"]}>
        <header className="sp-head mfp-head">
          <div><p className="mfp-plan"><span>{TIER[plan].n}</span></p><h1>ETF portfolio</h1>
            <p className="sp-desc">What your ETFs track, what they cost, how close they trade to their value, what sits inside them and how risky they are together. Start with names; add quantities when you want the figures to follow your money.</p>
            <nav className="mfp-links" aria-label="Related pages"><Link className="sp-link" to="/my-investments">All my investments →</Link><Link className="sp-link" to="/mf-portfolio">MF portfolio →</Link><Link className="sp-link" to="/holdings">Equity portfolio →</Link><Link className="sp-link" to="/etfs/compare">Compare ETFs →</Link></nav></div>
          <section className="mfp-add" aria-label="Add ETFs">
            <AddEtf full={!!d && d.count >= limit} onDone={toast} />
            <div className="mfp-add2"><button type="button" className="btn" aria-expanded={panel === "import"} onClick={() => setPanel((p) => (p === "import" ? "" : "import"))}>Import a broker file</button>
              <button type="button" className="btn" aria-expanded={panel === "qty"} disabled={!d?.count} onClick={() => setPanel((p) => (p === "qty" ? "" : "qty"))}>Add quantities</button>
              <ClearPortfolio count={d?.count ?? 0} noun="ETF" kind="ETF" className="btn" goes={["each ETF and its quantity", "the figures worked out from them: cost, what's inside and risk"]}
                onClear={async () => { await w.clear.mutateAsync(); }}
                onUndo={async () => { try { await w.undoClear.mutateAsync(); } catch (x) { if ((x as { status?: number }).status === 410) throw new Error("The clear is final: Undo is only possible for 10 seconds."); throw x; } }} />
              <span className="efp-count">{d ? `${d.count} ${d.count === 1 ? "ETF" : "ETFs"} · ${limit} on your plan` : `${limit} on your plan`}</span></div>
            <p className="pfx-note mfp-isinnote">Each ETF is read by its ISIN; a row without one is matched on the NSE symbol and shown for you to confirm. Nothing is sent to a broker.</p>
          </section>
        </header>
        {panel === "import" && <section className="sp-sec mfp-import" aria-label="Import a broker file"><ImportFile onDone={(m) => { toast(m); setPanel(""); }} /></section>}
        {panel === "qty" && d && <section className="sp-sec mfp-import" aria-label="Add quantities"><Quantities items={live} onDone={(m) => { toast(m); setPanel(""); }} /></section>}

        {q.isPending && silver && <div className="sp-sec" aria-busy="true"><b>Loading your ETFs…</b></div>}
        {q.isError && <div className="sp-sec" role="alert"><b>Your ETFs could not be loaded</b><p>{errText(q.error)}</p><button className="btn" onClick={() => q.refetch()}>Try again</button></div>}
        {d && !d.count && <section className="sp-sec mfp-empty" aria-labelledby="etp-empty-h"><h2 id="etp-empty-h">Your ETF portfolio is empty</h2>
          <p className="sp-note">Add an ETF by its name, NSE symbol or ISIN, or import a broker file. {limit} ETFs fit in your plan.</p>
          <div className="mfp-empty-b"><button type="button" className="btn primary" onClick={() => (document.querySelector(".mfp-add .mp-search input") as HTMLInputElement | null)?.focus()}>Add an ETF</button>
            <button type="button" className="btn" onClick={() => setPanel("import")}>Import a broker file</button></div></section>}
        {d && d.count > 0 && <>
          <TopGrid score={<ListBox box={listBox(d)} onQty={() => setPanel("qty")} />} tiles={etfTiles(d, ins.data, rk.data)} onOpen={(t) => setView(t, true)} label="Your ETF portfolio at a glance" />
          <div id="etp-tabsbox"><Tabs view={view} onView={(v) => setView(v)} /></div>
          <SectionsBar tab={view} all={ETF_SECS} onTab={goTab} />
          <KeyFigures store="finlit-etf-keyfig" tab={view} sub={view === "etfs" ? `What matters most in your ${live.length} ${live.length === 1 ? "ETF" : "ETFs"}` : view === "inside" ? "What your ETFs hold, and how alike they are" : "Where the list's risk sits"}
            cards={view === "etfs" ? etfsCards(d) : view === "inside" ? insideCards(d, ins.data, rk.data) : riskCards(rk.data)} />
          <div id="etp-panel" role="tabpanel" aria-labelledby={`etp-tab-${view}`}>
            {view === "etfs" && <>
              {rk.isError && <p className="sp-note" role="status">{errText(rk.error)}</p>}
              <EtfsTable d={d} rk={rk.data} actions={(e) => <button type="button" className="mff-rm" aria-label={`Remove ${e.symbol}`} onClick={() => remove(e)}>Remove</button>} />
            </>}
            {view === "inside" && <>
              {ins.isPending && <p className="sp-note" aria-busy="true">Reading what sits inside your ETFs…</p>}
              {ins.isError && <p className="sp-note" role="status">What sits inside your ETFs could not be read right now. {errText(ins.error)}</p>}
              {ins.data && ins.data.count > 0 && <InsideTab d={d} ins={ins.data} rk={rk.data} />}
            </>}
            {view === "risk" && <>
              {rk.isPending && <p className="sp-note" aria-busy="true">Working out the risk figures…</p>}
              {rk.isError && <p className="sp-note" role="status">{errText(rk.error)}</p>}
              {rk.data && rk.data.count > 0 && <RiskTab rk={rk.data} d={d} ins={ins.data} />}
            </>}
          </div>
          <InShort d={d} ins={ins.data} rk={rk.data} />
        </>}
      </Gate>
      <PageFaqs inline />
      <details className="sp-sec sp-fold mfp-disc"><summary><span><b className="sp-ft">Disclaimer</b><small>What this page is, and is not</small></span><span className="sp-show">Show ▾</span></summary><PortfolioDisclaimer kind="etf" /></details>
      <p className="mfp-foot">{SOURCES}</p>
    </div>
  );
}
