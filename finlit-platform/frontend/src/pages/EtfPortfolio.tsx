// ETF portfolio (task #136, design pack 07): the member's ETFs, built like the MF portfolio: five tiles, three views (Your ETFs, What's inside,
// Risk analytics), insight cards, the page's questions and the disclaimer. Figures are the server's (/api/me/etf-portfolio, /inside, /risk); words come
// from lib/etfPack. Silver and Gold, up to the plan's number of ETFs. Describes; never advice. Information only, not investment advice.
import { useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { Gate } from "../components/Gate";
import { PageFaqs } from "../components/PageFaqs";
import { PortfolioDisclaimer } from "../components/PortfolioDisclaimer";
import { RemoveAll } from "../components/RemoveAll";
import { CoLogo } from "../components/CoLogo";
import { Cards, Scroll, Section, Tip } from "../components/sectors/pack/Common";
import { useDocTitle } from "../lib/title";
import { useUI } from "../lib/ui";
import { limitsFor } from "../lib/auth";
import { dateIN } from "../lib/format";
import { apiGet } from "../lib/api";
import { traded, useEtfSearch } from "../lib/etf";
import type { Leadership } from "../lib/leadership";
import { etfCards, etfTiles, pp, sameIndexText, type Tile } from "../lib/etfPack";
import { etfRowsFromFile, useEtfInside, useEtfPortfolio, useEtfRisk, useEtfWrites, type EtfRisk, type EtfRow, type Inside, type Preview } from "../lib/etfPortfolio";
import "../styles/mfportfolio.css";
import "../styles/sectors-pack.css";
import "../styles/industry-pack.css";
import "../mf/pack/mf-pack.css";
import "../styles/etfportfolio.css";

const errText = (e: unknown) => ((e as { body?: { detail?: string } })?.body?.detail) || (e instanceof Error ? e.message : "Something went wrong. Please try again.");
const Dash = ({ why }: { why?: string | null }) => <span className="pf-dash" title={why || undefined} aria-label={why ? `Not shown. ${why}` : "Not available"} tabIndex={why ? 0 : undefined}>—</span>;
const pc = (x: number | null | undefined, dp = 1) => (x == null ? "–" : `${x < 0 ? "−" : ""}${Math.abs(x).toFixed(dp)}%`);
const signTone = (x: number | null | undefined) => (x == null || x === 0 ? "" : x > 0 ? "sp-good" : "sp-red");
const rupee = (v: number | null | undefined) => (v == null ? "—" : "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

type View = "etfs" | "inside" | "risk";
type Cols = "returns" | "trading" | "risk";

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
          : <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search an ETF by name or symbol…" aria-label="Search an ETF by name or symbol" maxLength={60} autoComplete="off" />}
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

/* --------------------------------------------------------------- tiles and tabs */
const TONE: Record<Tile["tone"], string> = { info: "mfp-info", good: "mfp-good", watch: "mfp-watch", warn: "mfp-bad", mute: "mfp-mute" };
function Tiles({ tiles, onGo }: { tiles: Tile[]; onGo: (t: Tile) => void }) {
  return (
    <section className="mfp-tiles" aria-label="Your ETFs at a glance">
      {tiles.map((t) => <div key={t.k} className={"mfp-tile " + TONE[t.tone]}>
        <p className="mfp-tile-k">{t.k}</p><p className="mfp-tile-v">{t.v}</p>
        <p className="mfp-tile-x">{t.tag && <span className="efp-twice efp-tag">{t.tag}</span>} {t.sub}</p>
        <button type="button" className="mfp-tile-go" onClick={() => onGo(t)}>{t.link} →</button></div>)}
    </section>
  );
}
function Tabs({ view, onView }: { view: View; onView: (v: View) => void }) {
  const tabs: [View, string, string][] = [["etfs", "Your ETFs", "Cost, returns, trading and risk of each"], ["inside", "What's inside", "Asset mix, overlap and the biggest stocks"], ["risk", "Risk analytics", "How much they swing together"]];
  return <div className="mfp-tabs" role="tablist" aria-label="ETF portfolio views">{tabs.map(([k, t, s]) => <button key={k} type="button" role="tab" id={`efp-tab-${k}`} aria-selected={view === k} aria-controls="efp-panel" onClick={() => onView(k)}><b>{t}</b><small>{s}</small></button>)}</div>;
}

/* --------------------------------------------------------------- Your ETFs */
const NOTE: Record<Cols, (asOf: string) => string> = {
  returns: (d) => `Price returns to ${d}; 5 years is the total change, not a yearly rate. Expense ratio is the yearly cost, from AMFI or the fund house's own disclosure.`,
  trading: () => "Price vs NAV compares the NSE close with that day's NAV. Traded a day is the average value traded over 20 sessions. Tracking difference is the ETF's 1-year return less its index's (the price index, so the index's dividends sit in it).",
  risk: () => "From daily prices over 3 years. Beta and falls taken are against the Nifty 500.",
};
function YourEtfs({ items, asOf, basis, cols, onCols, rk, rkErr, onRemove }: { items: EtfRow[]; asOf: string | null; basis: string; cols: Cols; onCols: (c: Cols) => void; rk: EtfRisk | undefined; rkErr: string | null; onRemove: (e: EtfRow) => void }) {
  const by = new Map((rk?.etfs ?? []).map((e) => [e.symbol, e]));
  const day = asOf ? dateIN(asOf) : "the last close";
  const C: [Cols, string][] = [["returns", "Returns & cost"], ["trading", "Trading"], ["risk", "Risk"]];
  return (
    <Section id="efp-etfs" title="Your ETFs" sub={`Prices are NSE closes of ${day}. ${basis === "value" ? "Each ETF counts by the value of your units." : "Each ETF counts the same until you add quantities."}`}
      right={<div className="sp-view efp-seg" role="group" aria-label="Columns">{C.map(([k, l]) => <button key={k} type="button" className={"sp-vbtn" + (cols === k ? " on" : "")} aria-pressed={cols === k} onClick={() => onCols(k)}>{l}</button>)}</div>}>
      <Scroll label="your ETFs"><table className="sp-tb mfp-ft efp-tb">
        <thead><tr><th scope="col">ETF</th><th scope="col">Tracks</th>
          {cols === "returns" && <><th scope="col" className="r">Price</th><th scope="col" className="r">1 day</th><th scope="col" className="r">1 year</th><th scope="col" className="r">5 years<Tip text="The total change of the price over five years, not a yearly rate." /></th><th scope="col" className="r">Expense ratio</th></>}
          {cols === "trading" && <><th scope="col" className="r">Price vs NAV<Tip text="How far the last NSE close was above (+) or below (−) that day's NAV, the value of what each unit holds." /></th><th scope="col" className="r">Traded a day<Tip text="The average value of units traded on the NSE each day, over the last 20 sessions." /></th><th scope="col" className="r">Tracking difference, 1 year<Tip text="The ETF's price return over the last year less its index's, in percentage points (pp). Against the price index, so the index's dividends sit in it." /></th></>}
          {cols === "risk" && <><th scope="col" className="r">Swing a year<Tip text="How much the price rises and falls in a typical year: the spread of its daily changes over 3 years, scaled to a year." /></th><th scope="col" className="r">Worst fall, 3 years<Tip text="The deepest drop of the price from a high to a later low over the 3 years." /></th><th scope="col" className="r">Beta<Tip text="How much the ETF has tended to move when the Nifty 500 moved 1%, from daily changes over 3 years. 1 means in step." /></th><th scope="col" className="r">Falls taken<Tip text="Of the Nifty 500's falls, the share the ETF took: its average change on the days the index fell, against the index's." /></th></>}
          <th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
        <tbody>{items.map((e) => { const f = by.get(e.symbol); return (
          <tr key={e.symbol}>
            <th scope="row">{e.gone ? <span className="mfp-fund">{e.symbol}<small className="mfp-sub">{e.why}</small></span> : <Link to={`/etfs/${encodeURIComponent(e.symbol)}`} className="mfp-fund efp-name"><b>{e.name}</b><small className="mfp-sub efp-sym">{e.symbol}</small></Link>}</th>
            <td><span className="efp-track" title={e.benchmark ? `Stated benchmark: ${e.benchmark}` : undefined}>{e.tracks.label ?? "Not stated"}</span>{e.twice && <span className="efp-twice">Twice</span>}</td>
            {e.gone ? <td colSpan={cols === "returns" ? 5 : cols === "trading" ? 3 : 4} className="sp-note">{e.why}</td> : <>
              {cols === "returns" && <>
                <td className="r">{rupee(e.price)}</td><td className={"r " + signTone(e.changePct)}>{e.changePct == null ? <Dash why="No previous close." /> : pp(e.changePct)}</td>
                <td className={"r " + signTone(e.ret1y)}>{e.ret1y == null ? <Dash why={e.ret1yWhy} /> : pp(e.ret1y)}</td><td className={"r " + signTone(e.ret5y)}>{e.ret5y == null ? <Dash why={e.ret5yWhy} /> : pp(e.ret5y)}</td>
                <td className="r">{e.ter?.value == null ? <Dash why={e.ter?.why} /> : <span title={[e.ter.source, e.ter.asOf ? `as of ${dateIN(e.ter.asOf)}` : ""].filter(Boolean).join(", ")}>{e.ter.value.toFixed(2)}%</span>}</td></>}
              {cols === "trading" && <>
                <td className="r">{e.premium == null ? <Dash why={e.premiumWhy} /> : pp(e.premium)}</td><td className="r">{e.avgTurnover == null ? <Dash why={e.avgTurnoverWhy} /> : traded(e.avgTurnover)}</td>
                <td className="r">{e.tracking?.value == null ? <Dash why={e.tracking?.why} /> : <span title={e.tracking.from && e.tracking.to ? `${dateIN(e.tracking.from)} to ${dateIN(e.tracking.to)}` : undefined}>{`${e.tracking.value < 0 ? "−" : e.tracking.value > 0 ? "+" : ""}${Math.abs(e.tracking.value).toFixed(2)} pp`}</span>}</td></>}
              {cols === "risk" && (f && f.swing != null ? <>
                <td className="r">{pc(f.swing)}</td><td className="r sp-red">{pc(f.worstFall)}</td><td className="r">{f.beta == null ? "–" : f.beta.toFixed(2)}</td><td className="r">{f.fallsTaken == null ? "–" : pc(f.fallsTaken, 0)}</td>
              </> : <td colSpan={4} className="sp-note">{f?.why ?? rkErr ?? (rk ? "No risk figures for this ETF." : "Working out the risk figures…")}</td>)}
            </>}
            <td className="mfp-act"><button type="button" className="btn" aria-label={`Remove ${e.name ?? e.symbol}`} title={`Remove ${e.symbol}`} onClick={() => onRemove(e)}>✕</button></td>
          </tr>); })}</tbody>
      </table></Scroll>
      <p className="sp-note efp-note">{NOTE[cols](day)}{cols === "risk" && rk?.etfs.some((x) => x.why && x.swing != null) ? " " + rk.etfs.filter((x) => x.why && x.swing != null).map((x) => `${x.symbol}: ${x.why}`).join(" ") : ""}</p>
    </Section>
  );
}

/* --------------------------------------------------------------- What's inside */
const MIX: [keyof Inside["mix"], string, string][] = [["indian", "Indian shares", "efp-c1"], ["abroad", "Shares abroad", "efp-c2"], ["gold", "Gold", "efp-c3"], ["silver", "Silver", "efp-c4"], ["debt", "Debt or overnight lending", "efp-c5"]];
const PEER: Record<string, string> = { leader: "Leader", in_line: "In line", laggard: "Laggard" };
const NOT_RANKED: Record<string, string> = { history: "has under a year of prices", liquidity: "trades too thinly to rank fairly", stale: "has no recent prices", group: "has no peer group", hidden: "is not ranked", pending: "is waiting for its first weekly reading" };
const coName = (n: string) => n.replace(/\s+(limited|ltd\.?|corp(oration)?|inc\.?)$/i, "");
const wordCase = (w: string | null | undefined) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : "");
const ovTone = (p: number) => (p >= 60 ? "efp-hi" : p >= 25 ? "efp-mid" : "efp-lo");

function WhatsInside({ d, ins, items }: { d: { repeats: { label: string; symbols: string[] }[] }; ins: Inside; items: EtfRow[] }) {
  const leads = useQueries({ queries: ins.top.map((t) => ({ queryKey: ["leadership", t.symbol], queryFn: () => apiGet<Leadership>(`/api/stocks/${encodeURIComponent(t.symbol || "")}/leadership`), staleTime: 15 * 60_000, retry: false, enabled: !!t.symbol && !t.abroad })) });
  const filesDate = ins.asOf ? dateIN(ins.asOf) : null;
  const ov = new Map(ins.overlap.pairs.flatMap((p) => [[`${p.a}|${p.b}`, p.pct], [`${p.b}|${p.a}`, p.pct]] as [string, number][]));
  const noShares = items.filter((e) => !e.gone && !ins.overlap.symbols.includes(e.symbol)).map((e) => e.symbol);
  const same = sameIndexText({ items, repeats: d.repeats } as never, ins, traded);
  const sizeTotal = ins.size ? ins.size.Large + ins.size.Mid + ins.size.Small + ins.size["Not sized"] : 0;
  return (<>
    <section className="sp-sec efp-two" aria-label="What your money is in">
      <div>
        <h2>What your money is in</h2>
        <p className="sp-sub">From each ETF's monthly portfolio file{filesDate ? `, ${filesDate}` : ""}. {ins.basis === "value" ? "Weighted by the value of your units." : "Equal weights until quantities are added."}</p>
        <div className="efp-bar" role="img" aria-label={MIX.filter(([k]) => ins.mix[k]).map(([k, l]) => `${l} ${ins.mix[k]}%`).join(", ")}>{MIX.filter(([k]) => ins.mix[k] > 0).map(([k, , c]) => <span key={k} className={c} style={{ width: `${ins.mix[k]}%` }} />)}</div>
        <ul className="efp-legend">{MIX.filter(([k]) => ins.mix[k] > 0).map(([k, l, c]) => <li key={k}><i className={c} />{l} {Math.round(ins.mix[k])}%</li>)}</ul>
        {ins.mixFromType.length > 0 && <p className="sp-note">{ins.mixFromType.join(", ")}: no monthly portfolio file yet, so counted by {ins.mixFromType.length === 1 ? "its" : "their"} type.</p>}
        <h3 className="efp-h3">Company size of the Indian shares</h3>
        {ins.size && sizeTotal > 0 ? <div className="efp-sizes">{(["Large", "Mid", "Small"] as const).map((k) => <div key={k} className="efp-size"><span>{k} cap</span><span className="efp-track-bar"><i style={{ width: `${ins.size![k]}%` }} /></span><b>{Math.round(ins.size![k])}%</b></div>)}
          {ins.size["Not sized"] > 0.5 && <p className="sp-note">{Math.round(ins.size["Not sized"])}% could not be sized: the company is not in our list of listed companies.</p>}
          <p className="sp-note">FinLit's three sizes, by market value: the 100 biggest listed companies are large, the next 150 mid, the rest small.</p></div>
          : <p className="sp-note">None of your ETFs holds Indian shares in its latest monthly file.</p>}
      </div>
      <div>
        {d.repeats.length > 0 && <><h2>Same index twice</h2><Cards items={same} cols={1} /></>}
        <h3 className="efp-h3">Overlap between your share ETFs</h3>
        {ins.overlap.symbols.length >= 2 ? <><Scroll label="overlap between your share ETFs"><table className="sp-tb efp-mx">
          <thead><tr><th scope="col"><span className="sr-only">ETF</span></th>{ins.overlap.symbols.map((s) => <th key={s} scope="col" className="r">{s}</th>)}</tr></thead>
          <tbody>{ins.overlap.symbols.map((a) => <tr key={a}><th scope="row">{a}</th>{ins.overlap.symbols.map((b) => <td key={b} className="r">{a === b ? <span className="faint">—</span> : <span className={"efp-cell " + ovTone(ov.get(`${a}|${b}`) ?? 0)}>{Math.round(ov.get(`${a}|${b}`) ?? 0)}%</span>}</td>)}</tr>)}</tbody>
        </table></Scroll><p className="sp-note">Share of holdings in common, by weight: for each stock both hold, the smaller weight, added up.{noShares.length ? ` ${noShares.join(", ")} ${noShares.length === 1 ? "holds" : "hold"} no shares in ${noShares.length === 1 ? "its" : "their"} latest file.` : ""}</p></>
          : <p className="sp-note">Overlap needs two or more of your ETFs that hold shares, each with a monthly portfolio file.</p>}
      </div>
    </section>
    {ins.top.length > 0 && <Section id="efp-under" title="Largest stocks underneath" sub={`The ${ins.top.length} biggest companies across your ETFs, and how each did against its peers.`}>
      <Scroll label="largest stocks underneath"><table className="sp-tb mfp-ut">
        <thead><tr><th scope="col">Company</th><th scope="col" className="r">Of your ETFs<Tip text="The share of your ETF list that sits in this company, through all your ETFs together, from the fund houses' latest monthly files." /></th><th scope="col">Held through</th>
          <th scope="col">Against peers<Tip text="How the stock did against similar companies over the last 12 months: Leader, In line or Laggard, with its place in the group." /></th>
          <th scope="col">{ins.scoreModel === "prism" ? "FinLit Prism" : "FinLit IQ"}</th></tr></thead>
        <tbody>{ins.top.map((t, i) => { const ld = leads[i]?.data; return (
          <tr key={t.isin ?? t.name}>
            <th scope="row">{t.symbol && !t.abroad ? <Link to={`/stocks/${t.symbol}`} className="ip-sym"><CoLogo symbol={t.symbol} name={t.name} size={22} inline /><span><b>{coName(t.name)}</b><small>{[t.industry, t.size].filter(Boolean).join(" · ")}</small></span></Link>
              : <span className="ip-sym"><span><b>{coName(t.name)}</b><small>{t.abroad ? "Listed abroad" : t.industry}</small></span></span>}</th>
            <td className="r">{t.w.toFixed(1)}%</td><td>{t.etfs.join(", ")}</td>
            <td>{t.abroad ? <small className="sp-note">Not compared: listed abroad</small> : ld && ld.available ? <><span className={"mfp-peer " + ld.label}>{PEER[ld.label]}</span><small className="mfp-sub">{ld.rank} of {ld.peerGroup.ranked} {ld.peerGroup.short || ld.peerGroup.name}</small></>
              : ld && !ld.available ? <small className="sp-note">Not compared: {NOT_RANKED[ld.reason] ?? "is not ranked"}</small> : <small className="sp-note">{t.symbol ? "…" : "Not compared"}</small>}</td>
            <td>{t.score?.score != null ? <span className="mfp-h"><b>{Math.round(t.score.score)}</b> <span>{wordCase(t.score.label)}</span></span> : <span className="sp-note">{t.abroad ? "—" : t.scoreWhy}</span>}</td>
          </tr>); })}</tbody>
      </table></Scroll>
      <p className="sp-note">FinLit Prism shows for Gold; Silver sees the FinLit IQ. {ins.scoreModel === "iq" && <Link to="/plans">See plans</Link>}</p>
    </Section>}
    {ins.files.some((f) => f.why) && <p className="sp-note">{ins.files.filter((f) => f.why).map((f) => `${f.symbol}: ${f.why}.`).join(" ")}</p>}
  </>);
}

/* --------------------------------------------------------------- Risk analytics */
function RiskView({ rk }: { rk: EtfRisk }) {
  const l = rk.list, b = rk.bench, lv = l.level;
  const sym = rk.together.symbols, r = new Map(rk.together.pairs.flatMap((p) => [[`${p.a}|${p.b}`, p], [`${p.b}|${p.a}`, p]] as [string, EtfRisk["together"]["pairs"][number]][]));
  const adds = Object.entries(rk.adds.shares).sort((x, y) => y[1] - x[1]);
  const max = Math.max(1, ...adds.map(([, v]) => v));
  return (<>
    <Section id="efp-risk" title="Your ETFs against the Nifty 500" help="The whole list as one line, from each ETF's daily closes over 3 years, set against the Nifty 500 over the same days."
      sub={`${rk.basis === "value" ? "Each ETF counts by the value of your units" : "Each ETF counts the same until you add quantities"} · daily prices, ${dateIN(b.from)} to ${dateIN(b.to)}.`}>
      {l.why && <p className="sp-note">{l.why}</p>}
      {lv && <p className="sp-lead"><b>Risk level: {lv.word.toLowerCase()} {lv.word === "About the same" ? "as" : "than"} the Nifty 500</b>{lv.because ? `, ${lv.because}` : ""}.</p>}
      <div className="mfp-rtiles efp-rtiles">
        <div className="ip-tile"><p className="sp-cap">Swing a year</p><b>{pc(l.swing)}</b><small>Nifty 500: {pc(b.swing)}</small></div>
        <div className="ip-tile"><p className="sp-cap">Worst fall</p><b className="sp-red">{pc(l.worstFall)}</b><small>Nifty 500: {pc(b.worstFall)}</small></div>
        <div className="ip-tile"><p className="sp-cap">Falls taken</p><b>{l.fallsTaken == null ? "–" : pc(l.fallsTaken, 0)}</b><small>of the Nifty 500's falls</small></div>
      </div>
    </Section>
    <section className="sp-sec efp-two" aria-label="Moving together and what each one adds">
      <div>
        <h2>ETFs that move together</h2>
        <p className="sp-sub">How alike their weekly price moves were over the last year. 1 means they move as one.</p>
        {sym.length >= 2 ? <Scroll label="ETFs that move together"><table className="sp-tb efp-mx">
          <thead><tr><th scope="col"><span className="sr-only">ETF</span></th>{sym.slice(0, -1).map((s) => <th key={s} scope="col" className="r">{s}</th>)}</tr></thead>
          <tbody>{sym.slice(1).map((a, i) => <tr key={a}><th scope="row">{a}</th>{sym.slice(0, -1).map((c, j) => <td key={c} className="r">{j > i + 1 ? null : j === i + 1 ? <span className="faint">—</span> : (() => { const p = r.get(`${a}|${c}`); return p?.r == null ? <Dash why={p?.why} /> : <span className={"efp-cell " + (p.r >= 0.7 ? "efp-hi" : p.r >= 0.3 ? "efp-mid" : "efp-lo")}>{p.r.toFixed(2)}</span>; })()}</td>)}</tr>)}</tbody>
        </table></Scroll> : <p className="sp-note">Needs two or more ETFs whose price moves.</p>}
        {rk.together.leftOut.length > 0 && <p className="sp-note">{rk.together.leftOut.join(", ")} {rk.together.leftOut.length === 1 ? "is" : "are"} left out: a liquid ETF's price hardly moves.</p>}
      </div>
      <div>
        <h2>What each one adds</h2>
        <p className="sp-sub">Share of your list's swings that comes from each ETF, over the last year.</p>
        {adds.length ? <div className="efp-sizes">{adds.map(([s, v]) => <div key={s} className="efp-size"><span>{s}</span><span className="efp-track-bar"><i style={{ width: `${Math.max(0, v) / max * 100}%` }} /></span><b>{Math.round(v)}%</b></div>)}</div>
          : <p className="sp-note">{rk.adds.why}</p>}
      </div>
    </section>
  </>);
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
  const view = (["inside", "risk"].includes(params.get("view") || "") ? params.get("view") : "etfs") as View;
  const setView = (v: View, scroll = false) => { const p = new URLSearchParams(params); if (v === "etfs") p.delete("view"); else p.set("view", v); setParams(p, { replace: true }); if (scroll) setTimeout(() => document.getElementById("efp-tabsbox")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
  const [cols, setCols] = useState<Cols>("returns"), [panel, setPanel] = useState<"" | "import" | "qty">(params.get("tab") === "import" ? "import" : "");
  const limit = d?.limit ?? limitsFor(plan).etf_holdings;
  const items = useMemo(() => d?.items ?? [], [d]);
  const rkWhy = rk.isError ? errText(rk.error) : null;
  const tiles = d && d.count ? etfTiles(d, rk.data, rkWhy) : [];
  const cards = d && d.count ? etfCards(d, rk.data) : [];
  const remove = async (e: EtfRow) => { try { await w.remove.mutateAsync(e.symbol); toast(`${e.symbol} removed.`); } catch (x) { toast(errText(x)); } };
  return (
    <div className="wrap ipo mp sp mfp efp">
      <Gate tier="silver" title="Track your ETFs" points={["What each ETF tracks and costs, and how close it trades to its NAV", "What sits inside them: asset mix, overlap and the biggest stocks", "Their swing, worst fall and beta against the Nifty 500", "Import a broker file, matched on ISIN, then symbol"]}>
        <header className="sp-head mfp-head">
          <div><p className="mfp-plan"><span>Silver</span></p><h1>ETF portfolio</h1>
            <p className="sp-desc">What your ETFs track, what they cost, how close they trade to their value, what sits inside them and how risky they are together.</p>
            <nav className="mfp-links" aria-label="Related pages"><Link className="sp-link" to="/my-investments">All my investments →</Link><Link className="sp-link" to="/mf-portfolio">MF portfolio →</Link><Link className="sp-link" to="/holdings">Equity portfolio →</Link><Link className="sp-link" to="/etfs/compare">Compare ETFs →</Link></nav></div>
          <section className="mfp-add" aria-label="Add ETFs">
            <AddEtf full={!!d && d.count >= limit} onDone={toast} />
            <div className="mfp-add2"><button type="button" className="btn" aria-expanded={panel === "import"} onClick={() => setPanel((p) => (p === "import" ? "" : "import"))}>Import a broker file</button>
              <button type="button" className="btn" aria-expanded={panel === "qty"} disabled={!d?.count} onClick={() => setPanel((p) => (p === "qty" ? "" : "qty"))}>Add quantities</button>
              <RemoveAll count={d?.count ?? 0} noun="ETF" className="btn" busy={w.clear.isPending} note="Their quantities go too. This cannot be undone."
                onConfirm={async () => { try { const r = await w.clear.mutateAsync(); toast(`Removed ${r.removed} ${r.removed === 1 ? "ETF" : "ETFs"}.`); } catch (x) { toast(errText(x)); } }} /></div>
            <p className="efp-count">{d ? `${d.count} ${d.count === 1 ? "ETF" : "ETFs"} · ${limit} on your plan` : `${limit} on your plan`}</p>
          </section>
        </header>
        {panel === "import" && <section className="sp-sec mfp-import" aria-label="Import a broker file"><ImportFile onDone={(m) => { toast(m); setPanel(""); }} /></section>}
        {panel === "qty" && d && <section className="sp-sec mfp-import" aria-label="Add quantities"><Quantities items={items.filter((e) => !e.gone)} onDone={(m) => { toast(m); setPanel(""); }} /></section>}

        {q.isPending && silver && <div className="sp-sec" aria-busy="true"><b>Loading your ETFs…</b></div>}
        {q.isError && <div className="sp-sec" role="alert"><b>Your ETFs could not be loaded</b><p>{errText(q.error)}</p><button className="btn" onClick={() => q.refetch()}>Try again</button></div>}
        {d && !d.count && <div className="sp-sec"><b>No ETFs yet</b><p className="sp-note">Search an ETF above to add it, or import a broker file. {limit} ETFs fit in your plan.</p></div>}
        {d && d.count > 0 && <>
          <Tiles tiles={tiles} onGo={(t) => { if (t.cols) setCols(t.cols); setView(t.to, true); }} />
          <div id="efp-tabsbox"><Tabs view={view} onView={(v) => setView(v)} /></div>
          <div id="efp-panel" role="tabpanel" aria-labelledby={`efp-tab-${view}`}>
            {view === "etfs" && <>
              <YourEtfs items={items} asOf={d.asOf} basis={d.basis} cols={cols} onCols={setCols} rk={rk.data} rkErr={rkWhy} onRemove={remove} />
              <Cards items={cards} />
            </>}
            {view === "inside" && <>
              {ins.isPending && <p className="sp-note" aria-busy="true">Reading what sits inside your ETFs…</p>}
              {ins.isError && <p className="sp-note" role="status">What sits inside your ETFs could not be read right now. {errText(ins.error)}</p>}
              {ins.data && ins.data.count > 0 && <WhatsInside d={d} ins={ins.data} items={items} />}
            </>}
            {view === "risk" && <>
              {rk.isPending && <p className="sp-note" aria-busy="true">Working out the risk figures…</p>}
              {rk.isError && <p className="sp-note" role="status">{rkWhy}</p>}
              {rk.data && rk.data.count > 0 && <RiskView rk={rk.data} />}
            </>}
          </div>
        </>}
      </Gate>
      <PageFaqs inline />
      <PortfolioDisclaimer kind="etf" />
    </div>
  );
}
