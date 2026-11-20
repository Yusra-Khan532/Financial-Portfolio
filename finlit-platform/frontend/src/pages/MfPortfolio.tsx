import { PortfolioDisclaimer } from "../components/PortfolioDisclaimer";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { capBucket } from "../lib/capBuckets";
import { Link, useSearchParams } from "react-router";
import { Gate } from "../components/Gate";
import { Icon } from "../lib/icons";
import { useDocTitle } from "../lib/title";
import { TIER, useUI } from "../lib/ui";
import { limitsFor } from "../lib/auth";
import { ClearPortfolio } from "../components/ClearPortfolio";
import { statementFromFile, FIELD_LABEL, type Statement } from "../lib/mfStatement";
import { PdfPasswordError, isPdf } from "../lib/holdingsPdf";
import {
  STATUS_WORD, commitItems, initialDecisions, reviewCounts, rupees, searchFunds, sortHoldings,
  useMfPortfolio, useMfSpread, useMfWrites, type Decision, type Fund, type Preview, type ReviewRow,
} from "../lib/mfPortfolio";
import { dateIN } from "../lib/format";
import "../styles/mf.css";
import "../styles/mfportfolio.css";
import "../styles/mfspread.css";
import { apiGet, type ApiError } from "../lib/api";
import { useUniverse } from "../lib/screener";
import { fundName, type MfRisk } from "../lib/mfPack";
import { type MfView } from "../mf/pack/MfPack";
import { RiskTab } from "../mf/pack/MfRisk";
import { FundsTable } from "../mf/pack/MfFunds";
import { MF_SECS, fundsCards, listBox, mfTiles, mixCards, riskCards } from "../lib/mfTop";
import { KeyFigures, SectionsBar, TopGrid, jumpTo } from "../portfolio/pack/PageTop";
import { AddPortfolioDialog, AnalysingBar, GoTo, PortfoliosBar, type PfInfo } from "../portfolio/Portfolios";
import { MoneyRow, SoldList, soldOf } from "../portfolio/MoneyRow";
import { StickySwitch, VIEW_COLOR, VIEW_ICON, ViewTabsKit, type ViewDef } from "../portfolio/ViewKit";
import type { LotsProps } from "../portfolio/HoldingCells";
import { aggOf, lotActions, moneyOf } from "../lib/ledger";
import { DEFAULT_PF } from "../lib/portfolio";
import { keyOf, useMfBook } from "../lib/mfBook";
import "../portfolio/holdings-kit.css";

/** Pack C1: the places a member holds funds. */
export const PLATFORMS = ["Coin by Zerodha", "Groww", "Kuvera", "MF Central", "Paytm Money", "The fund house directly", "Upstox", "Zerodha", "Other"];
/** The three views (task #235, pack B2 and C1): a colour and an icon each; the same list drives the sticky switcher (B12). */
const mfViews = (n: number): ViewDef<MfView>[] => [
  { id: "funds", label: "Your funds", short: "Your funds", sub: `${n ? `${n} ${n === 1 ? "fund" : "funds"}: h` : "H"}ealth, returns, costs and risk of each`, color: VIEW_COLOR.first, icon: VIEW_ICON.case },
  { id: "mix", label: "Mix & overlap", short: "Mix & overlap", sub: "What they hold, how alike they are, company sizes", color: VIEW_COLOR.second, icon: VIEW_ICON.pie },
  { id: "risk", label: "Risk analytics", short: "Risk", sub: "Each fund against its own benchmark, and the list together", color: VIEW_COLOR.risk, icon: VIEW_ICON.pulse },
];
import { ListBox } from "../mf/pack/MfTop";
import { InShort, SOURCES } from "../mf/pack/MfShort";
import { MixTab, type Big, type Reading } from "../mf/pack/MfMix";
import "../portfolio/pack/pagetop.css";
import "../styles/sectors-pack.css";
import "../styles/industry-pack.css";
import "../mf/pack/mf-pack.css";

const errText = (e: unknown) => ((e as { body?: { detail?: string } })?.body?.detail) || (e instanceof Error ? e.message : "Something went wrong. Please try again.");

/* --------------------------------------------------------------- fund search */
function FundSearch({ onPick, placeholder = "Search a fund by name or ISIN…" }: { onPick: (f: Fund) => void; placeholder?: string }) {
  const [q, setQ] = useState(""), [items, setItems] = useState<Fund[]>([]), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  useEffect(() => {
    if (q.trim().length < 3) { setItems([]); setErr(""); return; }
    setBusy(true);
    const t = setTimeout(() => searchFunds(q.trim()).then((r) => { setItems(r); setErr(""); }).catch(() => setErr("The fund search is not available right now.")).finally(() => setBusy(false)), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="mp-search">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Search a mutual fund by name or ISIN" maxLength={80} autoComplete="off" />
      {q.trim().length >= 3 && (
        <ul role="listbox" aria-label="Funds found" aria-busy={busy}>
          {err && <li className="none">{err}</li>}
          {!err && !busy && !items.length && <li className="none">No fund matches “{q}”.</li>}
          {items.map((f) => <li key={f.code} role="option" aria-selected="false"><button type="button" onClick={() => { onPick(f); setQ(""); setItems([]); }}><b>{f.name}</b><small>{f.amc} · {f.plan} · {f.option}{f.navDate ? ` · NAV ${dateIN(f.navDate)}` : ""}</small></button></li>)}
        </ul>)}
    </div>
  );
}

/* --------------------------------------------------------------- add one */
function AddFund({ disabled, onDone }: { disabled: boolean; onDone: (msg: string) => void }) {
  const w = useMfWrites();
  const [fund, setFund] = useState<Fund | null>(null), [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    if (!fund) { setErr("Choose a fund from the search first."); return; }
    try {
      const r = await w.add.mutateAsync({ code: fund.code, follow: true });    // the page lists funds with their score, returns and place in the charts; no holdings are kept
      onDone(r.merged ? "That fund is already in your list." : "Fund added."); setFund(null);
    } catch (x) { setErr(errText(x)); }
  };
  return (
    <form className="mp-form" onSubmit={submit}>
      {fund ? <div className="mp-picked"><b>{fund.name}</b><small>{fund.amc} · {fund.plan} · {fund.option}</small><button type="button" className="btn" onClick={() => setFund(null)}>Change</button></div> : <FundSearch onPick={setFund} />}
      {err && <p className="mp-err" role="alert">{err}</p>}
      <button className="btn primary" disabled={disabled || w.add.isPending}>{w.add.isPending ? "Adding…" : "Add fund"}</button>
    </form>
  );
}

/* --------------------------------------------------------------- import review */
function Review({ st, pv, onClose, onDone }: { st: Statement; pv: Preview; onClose: () => void; onDone: (msg: string) => void }) {
  const w = useMfWrites();
  const [dec, setDec] = useState<Record<number, Decision>>(() => initialDecisions(pv.rows));
  const [skip, setSkip] = useState<Set<number>>(new Set()), [existing, setExisting] = useState<"skip" | "replace">("skip"), [err, setErr] = useState(""), [changing, setChanging] = useState<number | null>(null);
  const c = reviewCounts(pv.rows, dec, skip), room = pv.capacity.room;
  const items = commitItems(pv.rows, dec, skip);
  const hdr = Object.entries(st.headers).map(([k, v]) => `${v} → ${FIELD_LABEL[k as keyof typeof FIELD_LABEL]}`).join(" · ");
  const pick = (r: ReviewRow, code: number | null, fund: Fund | null) => setDec((d) => ({ ...d, [r.i]: { code, fund } }));
  const go = async () => {
    setErr("");
    try { const r = await w.commit.mutateAsync({ items, existing }); onDone(`Imported: ${r.added} added${r.replaced ? `, ${r.replaced} replaced` : ""}${r.skipped ? `, ${r.skipped} already held (skipped)` : ""}${r.duplicates ? `, ${r.duplicates} repeated line(s) counted once` : ""}.`); }
    catch (x) { setErr(errText(x)); }
  };
  return (
    <section className="card mp-review" aria-label="Import review">
      <div className="card-h"><h3>Review before importing</h3><span className="s">{pv.total} rows read</span></div>
      <p className="muted">Columns read: {hdr}. Nothing is imported until you confirm. Rows that are not matched to a fund, and company shares, are never imported.</p>
      {st.notes?.map((n) => <p key={n} className="faint mp-note" role="note">{n}</p>)}
      <ul className="mp-counts">{(Object.keys(STATUS_WORD) as (keyof typeof STATUS_WORD)[]).filter((k) => pv.counts[k]).map((k) => <li key={k} className={"st-" + k}><b>{pv.counts[k]}</b> {STATUS_WORD[k].toLowerCase()}</li>)}</ul>
      <div className="mp-tablewrap"><table className="mp-rt">
        <thead><tr><th>Line</th><th>In your file</th><th>Status</th><th>Fund in FinLit</th><th>Notes</th><th>Import</th></tr></thead>
        <tbody>{pv.rows.map((r) => {
          const can = r.status === "matched" || r.status === "choose" || r.status === "not_found", d = dec[r.i];
          return (
            <tr key={r.i} className={"st-" + r.status}>
              <td data-label="Line">{r.row || r.i + 1}</td>
              <td data-label="In your file"><b>{r.name || r.isin || "(no name)"}</b><small>{r.units != null ? `${r.units} units` : ""}{r.invested != null ? ` · ${rupees(r.invested)}` : ""}{r.boughtOn ? ` · ${dateIN(r.boughtOn)}` : ""}{r.folio ? ` · folio ${r.folio}` : ""}</small></td>
              <td data-label="Status"><span className={"mp-chip st-" + r.status}>{STATUS_WORD[r.status]}</span></td>
              <td data-label="Fund in FinLit">
                {can && d?.fund && changing !== r.i && <div><b>{d.fund.name}</b><small>{d.fund.amc} · {d.fund.plan} · {d.fund.option}</small> <button className="mp-link" onClick={() => setChanging(r.i)}>Change</button></div>}
                {can && (!d?.fund || changing === r.i) && (<>
                  {r.candidates.length > 0 && <select aria-label={`Choose the fund for line ${r.row || r.i + 1}`} value={d?.code ?? ""} onChange={(e) => { const f = r.candidates.find((x) => x.code === Number(e.target.value)) || null; pick(r, f ? f.code : null, f); setChanging(null); }}>
                    <option value="">Choose a fund…</option>{r.candidates.map((f) => <option key={f.code} value={f.code}>{f.name} ({f.plan}, {f.option}{f.active ? "" : ", stopped"})</option>)}</select>}
                  <FundSearch placeholder={r.candidates.length ? "…or search another fund" : "Search for this fund…"} onPick={(f) => { pick(r, f.code, f); setChanging(null); }} />
                </>)}
                {!can && <span className="faint">—</span>}
              </td>
              <td data-label="Notes"><small>{r.reason}{r.existing && d?.code === r.fund?.code ? " Already in your portfolio." : ""}{r.warnings.map((x) => " " + x)}</small></td>
              <td data-label="Import">{can ? <input type="checkbox" aria-label={`Import line ${r.row || r.i + 1}`} checked={!skip.has(r.i) && d?.code != null} disabled={d?.code == null} onChange={(e) => setSkip((s) => { const n = new Set(s); if (e.target.checked) n.delete(r.i); else n.add(r.i); return n; })} /> : <span className="faint">No</span>}</td>
            </tr>);
        })}</tbody></table></div>
      {c.existing > 0 && <fieldset className="mp-ex"><legend>{c.existing} fund(s) are already in your portfolio</legend>
        <label><input type="radio" checked={existing === "skip"} onChange={() => setExisting("skip")} /> Keep what I have (skip them; nothing is counted twice)</label>
        <label><input type="radio" checked={existing === "replace"} onChange={() => setExisting("replace")} /> Replace their purchases with the file's</label></fieldset>}
      {c.needChoice > 0 && <p className="mp-warn" role="status">{c.needChoice} row(s) still need a fund chosen and will not be imported.</p>}
      {c.ready > room + c.existing && <p className="mp-warn" role="status">Your plan holds {pv.capacity.limit} funds ({pv.capacity.used} used); untick some rows.</p>}
      {err && <p className="mp-err" role="alert">{err}</p>}
      <div className="row"><button className="btn primary" onClick={go} disabled={!items.length || w.commit.isPending}>{w.commit.isPending ? "Importing…" : `Import ${items.length} ${items.length === 1 ? "row" : "rows"}`}</button><button className="btn" onClick={onClose}>Cancel</button></div>
    </section>
  );
}

function ImportFile({ onDone }: { onDone: (msg: string) => void }) {
  const w = useMfWrites(), ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [rev, setRev] = useState<{ st: Statement; pv: Preview } | null>(null);
  const [locked, setLocked] = useState<{ file: File; wrong: boolean } | null>(null), [pw, setPw] = useState("");
  const read = async (f: File, password?: string) => {
    setBusy(true); setErr(""); setRev(null);
    try {
      const st = isPdf(f) ? await (await import("../lib/mfCas")).statementFromPdf(f, password) : await statementFromFile(f);
      setLocked(null); setPw("");
      setRev({ st, pv: await w.preview.mutateAsync(st.rows) });
    } catch (x) {
      if (x instanceof PdfPasswordError) setLocked({ file: f, wrong: x.wrong });
      else { setLocked(null); setErr(errText(x)); }
    } finally { setBusy(false); }
  };
  return (<>
    <div className="row mp-file"><button className="btn primary" onClick={() => ref.current?.click()} disabled={busy}><Icon name="table" />{busy ? "Reading…" : "Choose a statement…"}</button>
      <input ref={ref} type="file" hidden accept=".pdf,.xlsx,.xls,.csv,.tsv,.txt,.html,.htm" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) read(f); }} />
      <span className="faint">The CAS PDF that CAMS, KFintech or MF Central emails you (detailed statement), or an .xlsx, .xls or .csv export, up to 2,000 rows. Each fund is read by its ISIN, which names the exact plan and option; a row without one is matched by its name and shown for you to confirm. Read in your browser: the file and its password never leave your device; only the fund rows are sent.</span></div>
    {locked && <form className="row mp-pw" onSubmit={(e) => { e.preventDefault(); if (pw) read(locked.file, pw); }}>
      <label>{locked.wrong ? "That password is not correct. Try again" : "This statement is password protected. A CAS is usually locked with your PAN in capitals, or the password you chose when you asked for it"}
        <input type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></label>
      <button className="btn primary" disabled={!pw || busy}>Open</button><button type="button" className="btn" onClick={() => { setLocked(null); setPw(""); }}>Cancel</button></form>}
    {err && <p className="mp-err" role="alert">{err}</p>}
    {rev && <Review st={rev.st} pv={rev.pv} onClose={() => setRev(null)} onDone={(m) => { setRev(null); onDone(m); }} />}
  </>);
}

/* --------------------------------------------------------------- page */

export function MfPortfolioPage() {
  useDocTitle("MF portfolio", "How healthy your mutual funds are, what sits inside them, how alike they are, and how risky they are together.");
  const { plan, has, toast } = useUI();
  const silver = has("silver");
  const [params, setParams] = useSearchParams();
  // task #235 (pack C1): one tab per platform; ?pf= picks one, All platforms adds them up
  const qAll = useMfPortfolio(silver), w = useMfWrites();
  const book = useMfBook(silver, qAll.data);
  const pfList: PfInfo[] = book.pfs.length ? book.pfs : [{ id: DEFAULT_PF, name: "My funds" }];
  const pfParam = params.get("pf") || "all", cur = pfParam === "all" || pfList.some((x) => x.id === pfParam) ? pfParam : "all";
  const setCur = (id: string) => { const n = new URLSearchParams(params); if (id === "all") n.delete("pf"); else n.set("pf", id); setParams(n, { replace: true }); setOpenLots(new Set()); };
  const qPf = useMfPortfolio(silver && cur !== "all", cur);
  const q = cur === "all" ? qAll : qPf;
  const sp = useMfSpread(silver && !!q.data && q.data.count > 0, cur);
  const rk = useQuery<MfRisk, ApiError>({ queryKey: ["mf-portfolio", "risk", q.data?.count ?? 0, cur], queryFn: () => apiGet<MfRisk>("/api/me/mf-portfolio/risk" + (cur !== "all" ? `?pf=${cur}` : "")), enabled: silver && !!q.data && q.data.count > 0, staleTime: 5 * 60_000, retry: false });
  const [goToSel, setGoTo] = useState(pfList[0].id), [adding, setAdding] = useState(false);
  const goTo = cur !== "all" ? cur : pfList.some((x) => x.id === goToSel) ? goToSel : pfList[0].id;
  const pfName = (id: string) => pfList.find((x) => x.id === id)?.name ?? "My funds";
  const navs = useMemo(() => new Map((qAll.data?.holdings ?? []).map((h) => [keyOf(h.id), h])), [qAll.data]);
  const nameOf = (k: string) => navs.get(k)?.name ?? qAll.data?.sold?.find((x) => keyOf(x.id) === k)?.name ?? "this fund";
  const priceOf = (k: string) => navs.get(k)?.nav ?? null, changeOf = () => null;
  const acts = useMemo(() => lotActions(book.get, book.store), [book.get, book.store]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [openLots, setOpenLots] = useState<Set<string>>(new Set()), [focus, setFocus] = useState<LotsProps["focus"]>(null);
  const lots: LotsProps = {
    holdings: book.rows, cur, pfName, nPortfolios: pfList.length, priceOf, changeOf, goTo, open: openLots, focus, mf: true, nameOf,
    onOpen: (k, on) => setOpenLots((c) => { const x = new Set(c); if (on) x.add(k); else x.delete(k); return x; }),
    add: (k, pf, side) => { acts.add(k, pf, side); setOpenLots((c) => new Set([...c, k])); setFocus(null); },
    edit: (id, patch) => acts.edit(id, patch), remove: (id) => { acts.remove(id); toast("Removed."); },
  };
  const money = moneyOf(book.rows, cur, priceOf, changeOf);
  const sold = soldOf(book.rows, cur).map((x) => ({ ...x, symbol: nameOf(x.symbol) }));
  const pfFigs = (id: string | "all") => { const m = moneyOf(book.rows, id, priceOf, changeOf); return { n: m.n, now: m.now, withQty: m.withQty, gainPct: m.full && m.invested ? (m.gain / m.invested) * 100 : null }; };
  const openFor = (k: string) => { setView("funds"); setFocus({ symbol: k, what: "qty" }); setOpenLots((c) => new Set([...c, k]));
    if (!(aggOf(book.rows, k, cur)?.nBuys)) acts.add(k, cur === "all" ? (aggOf(book.rows, k, "all")?.pfs[0] ?? goTo) : cur, "buy");
    setTimeout(() => document.getElementById(`lots-${k}`)?.scrollIntoView?.({ behavior: "smooth", block: "center" }), 150); };
  // "Add units" (pack C1, C5): opens the first fund without units and focuses its empty box
  const addUnits = () => { const h = (q.data?.holdings ?? []).find((x) => !(aggOf(book.rows, keyOf(x.id), cur)?.qty)) ?? q.data?.holdings[0]; if (h) openFor(keyOf(h.id)); };
  const view = (["mix", "risk"].includes(params.get("view") || "") ? params.get("view") : "funds") as MfView;
  const setView = (v: MfView, scroll = false) => { const n = new URLSearchParams(params); if (v === "funds") n.delete("view"); else n.set("view", v); setParams(n, { replace: true }); if (scroll) setTimeout(() => document.getElementById("mfp-tabsbox")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); };
  const [importing, setImporting] = useState(params.get("tab") === "import");
  const d = q.data;
  const all = useMemo(() => d?.holdings ?? [], [d]);
  const rows = useMemo(() => sortHoldings(all, "name", "asc"), [all]);
  const noReturns = all.filter((h) => !/idcw|dividend/i.test(h.option || "") && h.returns.r1y == null && h.returns.r3y == null && h.returns.r5y == null && !h.returns.why).length;   // IDCW and funds with a stated reason are not "being worked out"
  const [polls, setPolls] = useState(0);
  useEffect(() => {   // returns of a just-added fund are filled in within seconds: look again a few times so the numbers appear without a reload
    if (noReturns === 0 || polls >= 6) return;
    const t = setTimeout(() => { setPolls((n) => n + 1); q.refetch(); }, 20000);
    return () => clearTimeout(t);
  }, [noReturns, polls, q]);
  const limit = d?.limit ?? limitsFor(plan).mf_holdings;

  // the largest stocks underneath: NSE's industry from the fund files (task #192), FinLit size from the stock list, how each did against its peers from its weekly reading
  const uni = useUniverse(), byU = useMemo(() => new Map((uni.data?.rows ?? []).map((r) => [r.symbol, r])), [uni.data]);
  const top = useMemo(() => sp.data?.topStocks ?? [], [sp.data]);
  const tiles = mfTiles(all, sp.data, rk.data), box = listBox(all, sp.data);
  // the plan's reading of a stock inside the funds (COMMON-RULES 3): FinLit Prism on Gold, FinLit IQ on Silver; the words are the server's
  const readingOf = (sym: string | null): Reading => { const u = sym ? byU.get(sym) : undefined; if (!u) return null;
    return has("gold") ? (u.prism_final != null ? { word: u.prism_label ? u.prism_label.charAt(0) + u.prism_label.slice(1).toLowerCase() : null, score: u.prism_final } : null)
      : (u.overall != null ? { word: u.band ? u.band.charAt(0).toUpperCase() + u.band.slice(1) : null, score: u.overall } : null); };
  const big: Big[] = useMemo(() => top.map((t) => { const u = t.symbol ? byU.get(t.symbol) : undefined, mc = u?.market_cap;
    return { name: t.name, symbol: t.symbol, macro: u?.nse_sector ?? null, size: capBucket(mc)?.short ?? null, w: t.w, funds: t.funds }; }), [top, byU]);
  // a Key figures card that names "Add units" opens the dialog; one in another tab opens that tab first, then its section (the sections bar's jump)
  useEffect(() => { const on = (e: Event) => { if ((e as CustomEvent).detail === "mfp-units") addUnits(); }; addEventListener("eq-jump", on); return () => removeEventListener("eq-jump", on); }, []);
  const goTab = (t: MfView, then?: string) => { setView(t); if (then) setTimeout(() => jumpTo(then), 60); };

  return (
    <div className="wrap ipo mp sp mfp">
      <Gate tier="silver" title="Track your mutual funds" points={["How healthy each fund is: the Fund Health Score and its four parts", "What sits inside your funds, and how alike they are", "Each fund against its own benchmark, and the list together", "Import your CAS PDF, or Excel / CSV statements, read by ISIN"]}>
        <header className="sp-head mfp-head">
          <div><p className="mfp-plan"><span>{TIER[plan].n}</span></p><h1>MF portfolio</h1>
            <p className="sp-desc">How healthy your mutual funds are, what sits inside them, how alike they are, and how risky they are together. Start with names; add units when you want the figures to follow your money.</p>
            <nav className="mfp-links" aria-label="Related pages"><Link className="sp-link" to="/holdings">Equity portfolio →</Link><Link className="sp-link" to="/etf-portfolio">ETF portfolio →</Link><Link className="sp-link" to="/funds/compare">Compare funds →</Link><Link className="sp-link" to="/methodology/mf-score">Fund Health Score →</Link></nav></div>
          <section className="mfp-add" aria-label="Add funds">
            <AddFund disabled={false} onDone={toast} />
            <div className="mfp-add2"><button type="button" className="btn" aria-expanded={importing} onClick={() => setImporting((v) => !v)}>Import a file</button>
              <button type="button" className="btn" onClick={addUnits} disabled={!d?.count}>Add units and buy NAVs</button>
              <ClearPortfolio count={d?.count ?? 0} noun="fund" kind="MF" className="btn" goes={["each fund's units, purchases and folio", "the figures worked out from them: health, mix, overlap and risk"]}
                onClear={async () => { await w.clear.mutateAsync(); }}
                onUndo={async () => { try { await w.undoClear.mutateAsync(); } catch (x) { if ((x as { status?: number }).status === 410) throw new Error("The clear is final: Undo is only possible for 10 seconds."); throw x; } }} />
              <span>{d ? `${d.count} of ${limit} funds` : ""}</span></div>
            <p className="pfx-note mfp-isinnote">CAS statements, Excel or CSV. Each fund is read by its ISIN, which names the exact plan and option; a row without an ISIN is matched by name and shown for you to confirm.</p>
          </section>
        </header>
        {/* task #235 (pack C1): the platforms bar, the Add platform dialog and where new funds go */}
        <PortfoliosBar list={pfList} cur={cur} onPick={setCur} figs={pfFigs} onAdd={() => setAdding(true)} noun={["fund", "funds"]} sub="One tab for each place you hold funds: an app, a broker or the fund house."
          onRename={(id, name) => { const m = name.trim(); if (!m) return "Give the platform a name."; if (pfList.some((x) => x.id !== id && x.name.trim().toLowerCase() === m.toLowerCase())) return `You already have a platform called ${m}. Try another name, such as "${m} (joint)".`;
            book.accounts.rename(id, m, pfList); toast("Platform renamed."); return null; }}
          onRemove={(id) => { const name = pfName(id); book.accounts.remove(id, pfList); setCur("all"); toast(`${name} removed.`); }} />
        <GoTo list={pfList} value={goTo} onChange={(id) => (cur === "all" ? setGoTo(id) : setCur(id))} noun="Funds" />
        {adding && <AddPortfolioDialog taken={pfList.map((x) => x.name)} kinds={PLATFORMS}
          start={[["empty", "An empty platform", "Add funds to it by name, then their buys."], ["file", "An app statement", "Brings each fund with its units; add the buy NAVs after."], ["cas", "A CAS from CAMS, KFintech or NSDL/CDSL", "Lists every folio with units and cost."]]}
          onClose={() => setAdding(false)} onSave={({ name, broker, start }) => { const id = book.accounts.add({ name, broker }, pfList); setAdding(false); setCur(id); setGoTo(id); toast(`${name} added.`); if (start !== "empty") setImporting(true); }} />}
        {book.err && <p className="pfx-warn" role="alert">{book.err}</p>}
        {importing && <section className="sp-sec mfp-import" aria-label="Import a file"><ImportFile onDone={(m) => { toast(m); setImporting(false); }} /></section>}

        {q.isPending && silver && <div className="sp-sec" aria-busy="true"><b>Loading your funds…</b></div>}
        {q.isError && <div className="sp-sec" role="alert"><b>Your funds could not be loaded</b><p>{errText(q.error)}</p><button className="btn" onClick={() => q.refetch()}>Try again</button></div>}
        {d && !d.count && <section className="sp-sec mfp-empty" aria-labelledby="mfp-empty-h"><h2 id="mfp-empty-h">Your MF portfolio is empty</h2>
          <p className="sp-note">Add a fund by its name or ISIN, or import a statement (CAS PDF, Excel or CSV). {limit} funds fit in your plan.</p>
          <div className="mfp-empty-b"><button type="button" className="btn primary" onClick={() => (document.querySelector(".mfp-add .mp-search input") as HTMLInputElement | null)?.focus()}>Add a fund</button>
            <button type="button" className="btn" onClick={() => setImporting(true)}>Import a statement</button></div></section>}
        {d && d.count > 0 && <>
          <TopGrid score={<ListBox box={box} onUnits={addUnits} />} tiles={tiles} onOpen={(t) => setView(t, true)} label="Your MF portfolio at a glance" />
          {d.summary.notes.map((n) => <p key={n} className="sp-note" role="note">{n}</p>)}
          <div id="mfp-tabsbox"><ViewTabsKit defs={mfViews(all.length)} view={view} onView={(v) => setView(v)} label="MF portfolio views" idp="mfp-tab" panel="mfp-panel" what="your funds" /></div>
          <SectionsBar tab={view} all={MF_SECS} onTab={goTab}
            lead={<StickySwitch list={pfList} cur={cur} onPick={setCur} figs={pfFigs} defs={mfViews(all.length)} view={view} onView={(v) => setView(v)} tabsId="mfp-tabsbox" noun={["fund", "funds"]} />} />
          <KeyFigures store="finlit-mf-keyfig" tab={view} sub={view === "funds" ? `What matters most in your ${all.length} ${all.length === 1 ? "fund" : "funds"}` : view === "mix" ? "How alike your funds really are" : "Where the list's risk sits"}
            cards={view === "funds" ? fundsCards(all, sp.data) : view === "mix" ? mixCards(sp.data) : riskCards(rk.data)} />
          <div id="mfp-panel" role="tabpanel" aria-labelledby={`mfp-tab-${view}`}>
          {view !== "funds" && <AnalysingBar list={pfList} cur={cur} onPick={setCur} n={all.length} noun={["fund", "funds"]} />}
          {view === "funds" && <MoneyRow t={money} onAdd={(k) => openFor(k)} noun={["fund", "funds"]} today={false} nameOf={(k) => fundName(nameOf(k)) || nameOf(k)} />}
          {view === "funds" && <>
            {rk.isError && <p className="sp-note" role="status">{errText(rk.error)}</p>}
            <FundsTable hs={rows} rk={rk.data} sp={sp.data} listLabel={d.summary.score.label} lots={lots}
              actions={(h) => <button type="button" className="mff-rm" aria-label={`Remove ${h.name}`} onClick={async () => { try { await w.remove.mutateAsync(h.id); toast("Fund removed."); } catch (x) { toast(errText(x)); } }}>Remove</button>} />
            <SoldList items={sold} all={cur === "all" && pfList.length > 1} pfName={pfName} onRemoveSale={(id) => book.store.remove(id)} noun={["fund", "funds"]} />
            {noReturns > 0 && <p className="sp-note" role="status">1Y, 3Y and 5Y returns are being worked out now for {noReturns} of your funds (from the fund's published NAV history). They appear here by themselves within a minute or two. A fund younger than a year has no 1Y return, and one younger than 3 or 5 years has no 3Y or 5Y return.</p>}
          </>}
          {view === "mix" && <>
            {sp.isPending && <p className="sp-note" aria-busy="true">Working out how spread your funds are…</p>}
            {sp.isError && <p className="sp-note" role="status">How spread your funds are could not be worked out right now. {errText(sp.error)}</p>}
            {sp.data && sp.data.count > 0 && <MixTab sp={sp.data} readingOf={readingOf} gold={has("gold")} big={big} />}
          </>}
          {view === "risk" && <>
            {rk.isPending && <p className="sp-note" aria-busy="true">Working out the risk figures…</p>}
            {rk.isError && <p className="sp-note" role="status">{errText(rk.error)}</p>}
            {rk.data && rk.data.count > 0 && <RiskTab rk={rk.data} value={money.n && money.withQty === money.n ? { now: money.now, name: cur === "all" ? "All platforms" : pfName(cur) } : null} />}
          </>}
          </div>
          <InShort sp={sp.data} rk={rk.data} />
        </>}
      </Gate>
      <details className="sp-sec sp-fold mfp-disc"><summary><span><b className="sp-ft">Disclaimer</b><small>What this page is, and is not</small></span><span className="sp-show">Show ▾</span></summary><PortfolioDisclaimer kind="mf" /></details>
      <p className="mfp-foot">{SOURCES}</p>
    </div>
  );
}
