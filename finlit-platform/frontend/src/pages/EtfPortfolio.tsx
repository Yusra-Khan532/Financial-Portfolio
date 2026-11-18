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
import { AddPortfolioDialog, AnalysingBar, BROKERS, GoTo, PortfoliosBar, type PfInfo } from "../portfolio/Portfolios";
import { MoneyRow, SoldList, soldOf } from "../portfolio/MoneyRow";
import { StickySwitch, VIEW_COLOR, VIEW_ICON, ViewTabsKit, type ViewDef } from "../portfolio/ViewKit";
import type { LotsProps } from "../portfolio/HoldingCells";
import { aggOf, lotActions, moneyOf } from "../lib/ledger";
import { DEFAULT_PF } from "../lib/portfolio";
import { useEtfBook } from "../lib/etfBook";
import "../portfolio/holdings-kit.css";
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
function ImportFile({ onDone }: { onDone: (m: string, items?: { symbol: string; qty: number | null }[]) => void }) {
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
    try { const r = await w.commit.mutateAsync({ items, existing }); onDone(`Imported: ${r.added} added${r.replaced ? `, ${r.replaced} updated` : ""}${r.skipped ? `, ${r.skipped} already in your list (kept)` : ""}.`, items); setPv(null); }
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
/* --------------------------------------------------------------- the top: the list box, then one tile per tab */
function ListBox({ box, onQty }: { box: ReturnType<typeof listBox>; onQty: () => void }) {
  return (
    <div className="mfp-listbox">
      <p className="mfp-lb-k">Your ETF list<Tip text="The ETFs in your list, by type: Indian shares, gold, silver, shares abroad, debt and liquid." how="Until quantities are added every ETF counts the same, so a liquid ETF weighs as much as a share ETF. Add quantities to weigh them by your money." label="About “Your ETF list”" /></p>
      <p className="mfp-lb-v"><b>{box.n}</b> {box.n === 1 ? "ETF" : "ETFs"}</p>
      <p className="mfp-lb-x">{box.line} {box.weights}</p>
      <button type="button" className="mfp-lb-go" onClick={onQty}>{box.valued ? "Change buys and sales" : "Add quantities and buy prices"}</button>
    </div>
  );
}

/** The three views (task #235, pack B2 and C2): a colour and an icon each; the same list drives the sticky switcher (B12). */
const etfViews = (n: number): ViewDef<EtfTab>[] => [
  { id: "etfs", label: "Your ETFs", short: "Your ETFs", sub: `${n ? `${n} ${n === 1 ? "ETF" : "ETFs"}: c` : "C"}ost, returns, trading and risk of each`, color: VIEW_COLOR.first, icon: VIEW_ICON.case },
  { id: "inside", label: "What's inside", short: "What's inside", sub: "Asset mix, how alike they are, company sizes", color: VIEW_COLOR.second, icon: VIEW_ICON.pie },
  { id: "risk", label: "Risk analytics", short: "Risk", sub: "Against the wider market, and the list together", color: VIEW_COLOR.risk, icon: VIEW_ICON.pulse },
];

/* --------------------------------------------------------------- page */
export function EtfPortfolioPage() {
  useDocTitle("ETF portfolio", "What your ETFs track, what they cost, how close they trade to their value, what sits inside them and how risky they are together.");
  const { plan, has, toast } = useUI();
  const silver = has("silver");
  const [params, setParams] = useSearchParams();
  // task #235 (pack C2): one tab per demat account; ?pf= picks one, All accounts adds them up
  const qAll = useEtfPortfolio(silver), w = useEtfWrites();
  const book = useEtfBook(silver, (qAll.data?.items ?? []).filter((e) => !e.gone && e.qty == null).map((e) => e.symbol));
  const pfList: PfInfo[] = book.pfs.length ? book.pfs : [{ id: DEFAULT_PF, name: "My ETFs" }];
  const pfParam = params.get("pf") || "all", cur = pfParam === "all" || pfList.some((x) => x.id === pfParam) ? pfParam : "all";
  const setCur = (id: string) => { const p = new URLSearchParams(params); if (id === "all") p.delete("pf"); else p.set("pf", id); setParams(p, { replace: true }); setOpenLots(new Set()); };
  const qPf = useEtfPortfolio(silver && cur !== "all", cur);
  const q = cur === "all" ? qAll : qPf;
  const d = q.data, n = d ? d.items.map((e) => `${e.symbol}:${e.qty ?? ""}`).join(",") : "";
  const rk = useEtfRisk(silver && !!d && d.count > 0, n, cur), ins = useEtfInside(silver && !!d && d.count > 0, n, cur);
  const [goToSel, setGoTo] = useState(pfList[0].id), [adding, setAdding] = useState(false);
  const goTo = cur !== "all" ? cur : pfList.some((x) => x.id === goToSel) ? goToSel : pfList[0].id;
  const pfName = (id: string) => pfList.find((x) => x.id === id)?.name ?? "My ETFs";
  const px = useMemo(() => new Map((qAll.data?.items ?? []).map((e) => [e.symbol, e])), [qAll.data]);
  const priceOf = (sym: string) => px.get(sym)?.price ?? null, changeOf = (sym: string) => px.get(sym)?.changePct ?? null;
  const acts = useMemo(() => lotActions(book.get, book.store), [book.get, book.store]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [openLots, setOpenLots] = useState<Set<string>>(new Set()), [focus, setFocus] = useState<LotsProps["focus"]>(null);
  const lots: LotsProps = {
    holdings: book.rows, cur, pfName, nPortfolios: pfList.length, priceOf, changeOf, goTo, open: openLots, focus,
    onOpen: (sym, on) => setOpenLots((c) => { const x = new Set(c); if (on) x.add(sym); else x.delete(sym); return x; }),
    add: (sym, pf, side) => { acts.add(sym, pf, side); setOpenLots((c) => new Set([...c, sym])); setFocus(null); },
    edit: (id, patch) => acts.edit(id, patch), remove: (id) => { acts.remove(id); toast("Removed."); },
  };
  const money = moneyOf(book.rows, cur, priceOf, changeOf), sold = soldOf(book.rows, cur);
  const pfFigs = (id: string | "all") => { const m = moneyOf(book.rows, id, priceOf, changeOf); return { n: m.n, now: m.now, withQty: m.withQty, gainPct: m.full && m.invested ? (m.gain / m.invested) * 100 : null }; };
  const openFor = (sym: string, what: "qty" | "price" = "qty") => { setView("etfs"); setFocus({ symbol: sym, what }); setOpenLots((c) => new Set([...c, sym]));
    if (what === "qty" && !(aggOf(book.rows, sym, cur)?.nBuys)) acts.add(sym, cur === "all" ? (aggOf(book.rows, sym, "all")?.pfs[0] ?? goTo) : cur, "buy");
    setTimeout(() => document.getElementById(`lots-${sym}`)?.scrollIntoView?.({ behavior: "smooth", block: "center" }), 150); };
  // "Add quantities and buy prices" (pack C2): opens the first ETF without a quantity and focuses its empty box
  const addQty = () => { const e = (d?.items ?? []).find((x) => !x.gone && !(aggOf(book.rows, x.symbol, cur)?.qty)) ?? d?.items.find((x) => !x.gone); if (e) openFor(e.symbol); };
  const view = (["inside", "risk"].includes(params.get("view") || "") ? params.get("view") : "etfs") as EtfTab;
  const setView = (v: EtfTab, scroll = false) => { const p = new URLSearchParams(params); if (v === "etfs") p.delete("view"); else p.set("view", v); setParams(p, { replace: true }); if (scroll) setTimeout(() => document.getElementById("etp-tabsbox")?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 50); };
  const [panel, setPanel] = useState<"" | "import">(params.get("tab") === "import" ? "import" : "");
  const limit = d?.limit ?? limitsFor(plan).etf_holdings;
  const items = useMemo(() => d?.items ?? [], [d]);
  const remove = async (e: EtfRow) => {
    if (cur !== "all" && pfList.length > 1) { book.own.filter((h) => h.symbol === e.symbol && (h.pf ?? DEFAULT_PF) === cur).forEach((h) => book.store.remove(h.id)); toast(`${e.symbol} removed from ${pfName(cur)}.`); return; }
    try { await w.remove.mutateAsync(e.symbol); book.own.filter((h) => h.symbol === e.symbol).forEach((h) => book.store.remove(h.id)); toast(`${e.symbol} removed.`); } catch (x) { toast(errText(x)); } };
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
              <button type="button" className="btn" disabled={!d?.count} onClick={addQty}>Add quantities and buy prices</button>
              <ClearPortfolio count={d?.count ?? 0} noun="ETF" kind="ETF" className="btn" goes={["each ETF and its quantity", "the figures worked out from them: cost, what's inside and risk"]}
                onClear={async () => { await w.clear.mutateAsync(); }}
                onUndo={async () => { try { await w.undoClear.mutateAsync(); } catch (x) { if ((x as { status?: number }).status === 410) throw new Error("The clear is final: Undo is only possible for 10 seconds."); throw x; } }} />
              <span className="efp-count">{d ? `${d.count} ${d.count === 1 ? "ETF" : "ETFs"} · ${limit} on your plan` : `${limit} on your plan`}</span></div>
            <p className="pfx-note mfp-isinnote">Each ETF is read by its ISIN; a row without one is matched on the NSE symbol and shown for you to confirm. Nothing is sent to a broker.</p>
          </section>
        </header>
        {panel === "import" && <section className="sp-sec mfp-import" aria-label="Import a broker file"><ImportFile onDone={(m, items) => { toast(m); setPanel("");
          // task #235: each imported ETF with a quantity becomes a buy in the account picked in "ETFs you add or upload go to" (unless it already has buys there)
          for (const it of items ?? []) if (it.qty && !book.own.some((h) => h.symbol === it.symbol && (h.pf ?? DEFAULT_PF) === goTo)) book.store.add({ symbol: it.symbol, qty: it.qty, price: 0, owned: true, pf: goTo });
          book.touch(); }} /></section>}
        {/* task #235 (pack C2): the accounts bar, the Add account dialog and where new ETFs go */}
        <PortfoliosBar list={pfList} cur={cur} onPick={setCur} figs={pfFigs} onAdd={() => setAdding(true)} noun={["ETF", "ETFs"]} sub="One tab for each demat account. All accounts adds them up and reads them as one list."
          onRename={(id, name) => { const m = name.trim(); if (!m) return "Give the account a name."; if (pfList.some((x) => x.id !== id && x.name.trim().toLowerCase() === m.toLowerCase())) return `You already have an account called ${m}. Try another name, such as "${m} (joint)".`;
            book.accounts.rename(id, m, pfList); toast("Account renamed."); return null; }}
          onRemove={(id) => { const name = pfName(id); book.accounts.remove(id, pfList); setCur("all"); toast(`${name} removed.`); }} />
        <GoTo list={pfList} value={goTo} onChange={(id) => (cur === "all" ? setGoTo(id) : setCur(id))} noun="ETFs" />
        {adding && <AddPortfolioDialog taken={pfList.map((x) => x.name)} kinds={BROKERS} start={[["empty", "An empty account", "Add ETFs to it by name, then their buys."], ["file", "The broker's holdings file", "Brings each ETF with its quantity; add the buy prices after."]]}
          onClose={() => setAdding(false)} onSave={({ name, broker, start }) => { const id = book.accounts.add({ name, broker }, pfList); setAdding(false); setCur(id); setGoTo(id); toast(`${name} added.`); if (start === "file") setPanel("import"); }} />}
        {book.err && <p className="pfx-warn" role="alert">{book.err}</p>}

        {q.isPending && silver && <div className="sp-sec" aria-busy="true"><b>Loading your ETFs…</b></div>}
        {q.isError && <div className="sp-sec" role="alert"><b>Your ETFs could not be loaded</b><p>{errText(q.error)}</p><button className="btn" onClick={() => q.refetch()}>Try again</button></div>}
        {d && !d.count && <section className="sp-sec mfp-empty" aria-labelledby="etp-empty-h"><h2 id="etp-empty-h">Your ETF portfolio is empty</h2>
          <p className="sp-note">Add an ETF by its name, NSE symbol or ISIN, or import a broker file. {limit} ETFs fit in your plan.</p>
          <div className="mfp-empty-b"><button type="button" className="btn primary" onClick={() => (document.querySelector(".mfp-add .mp-search input") as HTMLInputElement | null)?.focus()}>Add an ETF</button>
            <button type="button" className="btn" onClick={() => setPanel("import")}>Import a broker file</button></div></section>}
        {d && d.count > 0 && <>
          <TopGrid score={<ListBox box={listBox(d)} onQty={addQty} />} tiles={etfTiles(d, ins.data, rk.data)} onOpen={(t) => setView(t, true)} label="Your ETF portfolio at a glance" />
          <div id="etp-tabsbox"><ViewTabsKit defs={etfViews(live.length)} view={view} onView={(v) => setView(v)} label="ETF portfolio views" idp="etp-tab" panel="etp-panel" what="your ETFs" /></div>
          <SectionsBar tab={view} all={ETF_SECS} onTab={goTab}
            lead={<StickySwitch list={pfList} cur={cur} onPick={setCur} figs={pfFigs} defs={etfViews(live.length)} view={view} onView={(v) => setView(v)} tabsId="etp-tabsbox" noun={["ETF", "ETFs"]} />} />
          <KeyFigures store="finlit-etf-keyfig" tab={view} sub={view === "etfs" ? `What matters most in your ${live.length} ${live.length === 1 ? "ETF" : "ETFs"}` : view === "inside" ? "What your ETFs hold, and how alike they are" : "Where the list's risk sits"}
            cards={view === "etfs" ? etfsCards(d) : view === "inside" ? insideCards(d, ins.data, rk.data) : riskCards(rk.data)} />
          <div id="etp-panel" role="tabpanel" aria-labelledby={`etp-tab-${view}`}>
            {view !== "etfs" && <AnalysingBar list={pfList} cur={cur} onPick={setCur} n={live.length} noun={["ETF", "ETFs"]} />}
            {view === "etfs" && <MoneyRow t={money} onAdd={(sym) => openFor(sym)} noun={["ETF", "ETFs"]} />}
            {view === "etfs" && <>
              {rk.isError && <p className="sp-note" role="status">{errText(rk.error)}</p>}
              <EtfsTable d={d} rk={rk.data} lots={book.ready ? lots : undefined} actions={(e) => <button type="button" className="mff-rm" aria-label={`Remove ${e.symbol}`} onClick={() => remove(e)}>Remove</button>} />
              <SoldList items={sold} all={cur === "all" && pfList.length > 1} pfName={pfName} onRemoveSale={(id) => book.store.remove(id)} noun={["ETF", "ETFs"]} />
            </>}
            {view === "inside" && <>
              {ins.isPending && <p className="sp-note" aria-busy="true">Reading what sits inside your ETFs…</p>}
              {ins.isError && <p className="sp-note" role="status">What sits inside your ETFs could not be read right now. {errText(ins.error)}</p>}
              {ins.data && ins.data.count > 0 && <InsideTab d={d} ins={ins.data} rk={rk.data} />}
            </>}
            {view === "risk" && <>
              {rk.isPending && <p className="sp-note" aria-busy="true">Working out the risk figures…</p>}
              {rk.isError && <p className="sp-note" role="status">{errText(rk.error)}</p>}
              {rk.data && rk.data.count > 0 && <RiskTab rk={rk.data} d={d} ins={ins.data} value={money.n && money.withQty === money.n ? { now: money.now, name: cur === "all" ? "All accounts" : pfName(cur) } : null} />}
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
