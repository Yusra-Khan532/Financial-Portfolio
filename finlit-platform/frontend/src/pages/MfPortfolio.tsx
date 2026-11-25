import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { AddSeveralDialog, PlanOptionDialog, groupOf, useFundGroupResults, type FundGroup } from "../mf/pack/MfAdd";
import { EditDialog, EditSell, SellDialog } from "../portfolio/kit/HoldingDialog";
import { AddBox, MenuButton } from "../portfolio/kit/AddBox";
import { TopMoney } from "../portfolio/kit/TopMoney";
import { NextView } from "../portfolio/kit/ViewCards";
import { AccountPicker, SectionsMenu, ViewBar, ViewSeg, useInside, type Pick, type ViewSteps } from "../portfolio/kit/ViewBar";
import { Tip } from "../components/sectors/pack/Common";
import { useAuth } from "../lib/auth";
import { MfAsOf, MfCards, MfParts, MfSince } from "../mf/pack/MfTop";
import { Step, StepCtx } from "../portfolio/pack/EqSteps385";
import { KnowPop, closePops } from "../portfolio/pack/Round388";
import { Info, RECORD_SALE, VisitFolds, andList, countOf, shortCo } from "../portfolio/shared";
import { PageBottom } from "../portfolio/shared/PageBottom";
import { dayMonth } from "../lib/whatChanged";
import "../portfolio/pack/eq385.css";
import { dm } from "../lib/etfKeyFigs";
import "../portfolio/kit/kit.css";
import "../styles/mf.css";
import "../styles/mfportfolio.css";
import "../styles/mfspread.css";
import { apiGet, type ApiError } from "../lib/api";
import { useUniverse } from "../lib/screener";
import { fundName, type MfRisk } from "../lib/mfPack";
import { type MfView } from "../mf/pack/MfPack";
import { RiskTab } from "../mf/pack/MfRisk";
import { FundsTable } from "../mf/pack/MfFunds";
import { MF_LABEL, listBox, mfStepOf, mfSteps, mfTiles, navDates, partsAverage, stepFromParam, stepParam, type MfStep } from "../lib/mfTop";
import { mfInsideCompanies, mfInsideLine, mfKeyFigures } from "../lib/mfKeyFigs";
import { WhatChanged, useWhatChanged } from "../components/changes/WhatChanged";
import { EYE, useHidden } from "../portfolio/kit/KitSection";
import "../styles/what-changed.css";
import { KeyFigsBox } from "../portfolio/kit/KeyFigsBox";
import type { KfGo } from "../portfolio/kit/keyFigs";
import { jumpTo } from "../portfolio/pack/PageTop";
import { AddPortfolioDialog, type PfInfo } from "../portfolio/Portfolios";
import { SoldList, soldOf } from "../portfolio/MoneyRow";
import { VIEW_COLOR } from "../portfolio/ViewKit";
import type { LotsProps } from "../portfolio/HoldingCells";
import { aggOf, lotActions, moneyOf } from "../lib/ledger";
import { DEFAULT_PF } from "../lib/portfolio";
import { keyOf, useMfBook } from "../lib/mfBook";
import "../portfolio/holdings-kit.css";

/** Pack C1: the places a member holds funds. */
export const PLATFORMS = ["Coin by Zerodha", "Groww", "Kuvera", "MF Central", "Paytm Money", "The fund house directly", "Upstox", "Zerodha", "Other"];
import { InShort, SOURCES, shortLines } from "../mf/pack/MfShort";
import { MixTab, type Big, type Reading } from "../mf/pack/MfMix";
import "../portfolio/pack/pagetop.css";
import "../styles/sectors-pack.css";
import "../styles/industry-pack.css";
import "../mf/pack/mf-pack.css";
import "../mf/pack/spacing389.css";   // task #389 (file 40 v4, Part D): the page's spacing, after the pack CSS
import { PLAN_FOR_PORTFOLIO, PLAN_FOR_PRISM } from "../lib/planGates";
import { PageTabs } from "../components/PageTabs";

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

// task #275 (change 16): the three views, their colours and what each holds (the equity and ETF pages' view cards)
const VIEW_LABEL: Record<MfView, string> = { funds: "Your funds", mix: "Mix & overlap", risk: "Risk analytics" };
const VIEW_COLORS: Record<MfView, string> = { funds: VIEW_COLOR.first, mix: VIEW_COLOR.second, risk: VIEW_COLOR.risk };
const VIEW_WHAT: Record<MfView, string> = { funds: "Inside: scores, returns, costs and risk of each", mix: "Inside: what they own, overlap, sectors, sizes", risk: "Inside: beta, swings, falls, each fund" };
const NEXT_VIEW: Record<MfView, MfView> = { funds: "mix", mix: "risk", risk: "funds" };
const VIEW_DEFS = (Object.keys(VIEW_LABEL) as MfView[]).map((id) => ({ id, label: VIEW_LABEL[id], color: VIEW_COLORS[id] }));
const ALL_SEEN = new Set<string>(["funds", "mix", "risk"]);
const isView = (v: string | null | undefined): v is MfView => v === "funds" || v === "mix" || v === "risk";

// Task #389 (developer file 32, Rules to build): the member's last view and step on this page, kept in this browser per member as the Results page keeps
// its view. An address that names a view or a step wins; a remembered "Key figures" opens step 1 (lib/mfTop stepFromParam).
const PLACE_KEY = (who: string | number | null | undefined) => `finlit-mf-portfolio-place:${who || "guest"}`;
export function readPlace(who: string | number | null | undefined): { view: MfView; step: string } | null {
  try { const v = JSON.parse(localStorage.getItem(PLACE_KEY(who)) || "null"); return v && isView(v.view) && typeof v.step === "string" ? { view: v.view, step: v.step } : null; } catch { return null; }
}
const savePlace = (who: string | number | null | undefined, view: MfView, step: string) => { try { localStorage.setItem(PLACE_KEY(who), JSON.stringify({ view, step })); } catch { /* private window: the address still holds it */ } };

export function MfPortfolioPage() {
  useDocTitle("MF portfolio", "How healthy your mutual funds are, what sits inside them, how alike they are, and how risky they are together.");
  const { plan, has, toast } = useUI();
  const silver = has(PLAN_FOR_PORTFOLIO);
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
  const [goToSel, setGoTo] = useState(pfList[0].id), [adding, setAdding] = useState(false), [partsOpen, setPartsOpen] = useState(false);
  const goTo = cur !== "all" ? cur : pfList.some((x) => x.id === goToSel) ? goToSel : pfList[0].id;
  const pfName = (id: string) => pfList.find((x) => x.id === id)?.name ?? "My funds";
  const navs = useMemo(() => new Map((qAll.data?.holdings ?? []).map((h) => [keyOf(h.id), h])), [qAll.data]);
  const nameOf = (k: string) => navs.get(k)?.name ?? qAll.data?.sold?.find((x) => keyOf(x.id) === k)?.name ?? "this fund";
  // task #389 (fault 8): the day's NAV change from the NAV feed (the row's `change`, the public fund page's figure); Today is known when every valued fund has it
  const priceOf = (k: string) => navs.get(k)?.nav ?? null, changeOf = (k: string) => navs.get(k)?.change?.pct ?? null;
  const acts = useMemo(() => lotActions(book.get, book.store), [book.get, book.store]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [openLots, setOpenLots] = useState<Set<string>>(new Set()), [focus, setFocus] = useState<LotsProps["focus"]>(null);
  // task #275 (change 3): Edit | Sell under each fund, in the shared dialogs (portfolio/kit), in place of Remove; Remove sits in Edit
  const [dlg, setDlg] = useState<{ kind: "edit" | "sell"; k: string } | null>(null);
  const dlgPfs = pfList.map((x) => ({ id: x.id, name: x.name }));
  const pfOfFund = (k: string) => (cur !== "all" ? cur : aggOf(book.rows, k, "all")?.pfs[0] ?? goTo);
  const holdingOf = (k: string) => (qAll.data?.holdings ?? []).find((h) => keyOf(h.id) === k);
  const removeFund = async (k: string, pf: string) => {
    const h = holdingOf(k); if (!h) return;
    const elsewhere = pfList.length > 1 && book.rows.some((r) => r.symbol === k && r.owned && (r.pf ?? DEFAULT_PF) !== pf);
    try {
      if (elsewhere) { for (const r of book.rows.filter((x) => x.symbol === k && x.owned && (x.pf ?? DEFAULT_PF) === pf)) book.store.remove(r.id); toast(`Removed from ${pfName(pf)}.`); }
      else { await w.remove.mutateAsync(h.id); toast("Fund removed."); }
      setDlg(null);
    } catch (x) { toast(errText(x)); }
  };
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
  const today = useMemo(() => { const valued = (q.data?.holdings ?? []).filter((h) => h.nav != null && h.current != null);
    return { known: valued.length > 0 && valued.every((h) => h.change != null) }; }, [q.data]);
  // task #275 (changes 2, 16, 11): the shared top, view cards and view bar (portfolio/kit)
  const { user } = useAuth();
  const [picked, setPicked] = useState<FundGroup | null>(null), [several, setSeveral] = useState(false);
  const pick: Pick = { list: pfList, cur, onPick: setCur, figs: pfFigs, noun: ["fund", "funds"] };
  // task #389 (developer file 32, Top 4): the "not opened" badges go; every view reads as seen in the bar
  const seen = ALL_SEEN;
  // task #389: the place kept for this member; a bare address opens there
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !user) return; restored.current = true;
    if (params.get("view") || params.get("step")) return;
    const s = readPlace(user.id); if (!s) return;
    const n = new URLSearchParams(params); if (s.view === "funds") n.delete("view"); else n.set("view", s.view); n.set("step", stepParam(s.step)); setParams(n, { replace: true });
  }, [user]);   // eslint-disable-line react-hooks/exhaustive-deps
  // task #275 (change 19): What changed at the companies inside the funds, after Key figures; In short closes each view
  const cos = useMemo(() => mfInsideCompanies(sp.data), [sp.data]);
  const coBy = useMemo(() => new Map(cos.map((c) => [c.symbol, c])), [cos]);
  const wc = useWhatChanged(cos.map((c) => c.symbol), "mf-portfolio");
  const [wcHidden, setWcHidden] = useHidden("mfp-wc");
  // task #389 (developer file 32, Section bar and Update 25 Nov row 1): one section per step, Key figures inside step 1 of every view; the step in the address
  // (&step=, "all" for All sections, none for the first step); a change of view opens its first step and closes any pop-up
  const hasShort = shortLines(sp.data, rk.data).length > 0;
  const stepsOf = (v: MfView): MfStep[] => mfSteps(v, { wcNew: wc.newN, biggest: (sp.data?.topStocks?.length ?? 0) > 0 || !sp.data }).filter((x) => x.id !== "mfp-short" || hasShort);
  const steps = stepsOf(view), step = stepFromParam(steps, params.get("step"));
  const barSteps = Object.fromEntries((["funds", "mix", "risk"] as MfView[]).map((v) => [v, { label: MF_LABEL[v], steps: stepsOf(v).map(({ id, label, badge }) => ({ id, label, ...(badge ? { badge } : {}) })) }])) as ViewSteps<MfView>;
  useEffect(() => { if (user) savePlace(user.id, view, step); }, [user, view, step]);
  /** Opens the step that holds a section, in its view; then goes to the section (or to the top of the view when the page is below it). */
  const openSec = (id: string, v0?: MfView) => {
    const v = v0 ?? ((["funds", "mix", "risk"] as MfView[]).find((x) => mfStepOf(stepsOf(x), id)) ?? view), to = mfStepOf(stepsOf(v), id) ?? id;
    const n = new URLSearchParams(params); if (v === "funds") n.delete("view"); else n.set("view", v); n.set("step", stepParam(to)); setParams(n, { replace: true });
    if (v !== view) closePops();
    setTimeout(() => { if (id !== to && document.getElementById(id)) { jumpTo(id); return; }
      const p = document.getElementById("mfp-panel"); if (p && p.getBoundingClientRect().top < 0) p.scrollIntoView?.({ behavior: "smooth", block: "start" }); }, 90);
  };
  const setStep = (id: string) => { if (id === "all") { const n = new URLSearchParams(params); n.set("step", "all"); setParams(n, { replace: true }); return; } openSec(id, view); };
  useEffect(() => { const f = (e: Event) => { const id = (e as CustomEvent<string>).detail; if (typeof id === "string" && id) openSec(id); }; addEventListener("eq-step", f); return () => removeEventListener("eq-step", f); });
  const goTab = (t: MfView) => { setView(t); setTimeout(() => document.getElementById("mfp-tabsbox")?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 50); };
  const onSec = (v: MfView, id: string) => openSec(id, v);
  // task #275 (change 9, fix 8): Key figures in step 1 of each view; a link to another view opens it first
  const onGo = (g: KfGo) => {
    if (g.kind === "sort" && g.arg.startsWith("health:")) { openSec("mfp-funds", "funds"); setTimeout(() => dispatchEvent(new CustomEvent("mff-filter", { detail: { key: "health", v: g.arg.slice(7) } })), 120); return; }
    if (g.arg === "mfp-units") { addUnits(); return; }
    openSec(g.arg);
  };
  const coName = (sym: string | null, name: string) => { const u = sym ? byU.get(sym) : undefined; return shortCo(u?.name ?? name, sym ?? ""); };
  const kf = (v: MfView, sub: string) => <KeyFigsBox id={`mfp-kf-${v}`} sub={sub} cards={mfKeyFigures(v, { hs: all, sp: sp.data, rk: rk.data, list: d ? { value: d.summary.score.value, label: d.summary.score.label } : undefined, nameOf: coName })} onGo={onGo} visit />;   // A2 (file 40 v4): closed on every visit
  const lead: ReactNode = <><AccountPicker p={pick} compact /><ViewSeg defs={VIEW_DEFS.map((x) => (x.id === "risk" ? { ...x, label: "Risk" } : x))} view={view} onView={(v) => goTab(v)} seen={seen} />
    <SectionsMenu all={barSteps} view={view} onSec={onSec} here={step === "all" ? undefined : step} label="Sections ▾" btnClass="ptk-btn ptk-secb" mode="view" /></>;
  const setView = (v: MfView, scroll = false) => { const n = new URLSearchParams(params); if (v === "funds") n.delete("view"); else n.set("view", v); n.delete("step"); setParams(n, { replace: true }); if (v !== view) closePops();
    if (scroll) setTimeout(() => document.getElementById("mfp-tabsbox")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); };
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
  const full = !!d && d.count >= limit;
  const inTable = useInside("mfp-zone", view === "funds" && (d?.count ?? 0) > 0);
  // the money box names the funds without units (the book's key is a holding id)
  const moneyNamed = { ...money, missing: money.missing.map((m) => ({ ...m, symbol: fundName(nameOf(m.symbol)) || nameOf(m.symbol) })) };

  // the largest stocks underneath: NSE's industry from the fund files (task #192), FinLit size from the stock list, how each did against its peers from its weekly reading
  const uni = useUniverse(), byU = useMemo(() => new Map((uni.data?.rows ?? []).map((r) => [r.symbol, r])), [uni.data]);
  const top = useMemo(() => sp.data?.topStocks ?? [], [sp.data]);
  const tiles = mfTiles(all, sp.data, rk.data), box = listBox(all, sp.data);
  // task #389 (Top 6): which date each kind of figure runs to
  const holdDates = [...new Set((sp.data?.funds ?? []).map((f) => f.holdingsAsOf).filter((x): x is string => !!x))].sort().reverse().map((x) => dm(x) + " " + x.slice(0, 4));
  const asOf: [string, ReactNode][] = [
    ["NAVs", `close of ${navDates(all).length ? andList(navDates(all)) : "the last trading day"}`],
    ...(view === "funds" ? [["Filings", `the last ${wc.q.data?.days ?? 90} days`] as [string, ReactNode]] : []),
    ...(view !== "risk" && holdDates.length ? [["Holdings", holdDates.length === 1 ? `each fund’s ${holdDates[0]} file` : `each fund’s latest file (${holdDates.join(", ")})`] as [string, ReactNode]] : []),
    ...(view === "risk" ? [["Risk figures", "weekly NAVs, past year · swings and falls over 3 years"] as [string, ReactNode]] : []),
  ];
  // task #389 (Phone): What changed folds to "N companies filed in the last 90 days · N new since D"
  const wcFiled = new Set(wc.rows.map((r) => r.s)).size;
  const wcLine = !wc.q.data ? "Reading what the companies inside your funds filed…" : `${countOf(wcFiled, "company", "companies")} filed in the last ${wc.q.data.days ?? 90} days${wc.lastVisit ? ` · ${wc.newN} new since ${dayMonth(wc.lastVisit)}` : ""}`;
  // the reading of a stock inside the funds (COMMON-RULES 3): FinLit Prism, on a plan that has it (task #283); none otherwise; the words are the server's
  const readingOf = (sym: string | null): Reading => { const u = sym ? byU.get(sym) : undefined; if (!u || !has(PLAN_FOR_PRISM)) return null;
    return u.prism_final != null ? { word: u.prism_label ? u.prism_label.charAt(0) + u.prism_label.slice(1).toLowerCase() : null, score: u.prism_final } : null; };
  const big: Big[] = useMemo(() => top.map((t) => { const u = t.symbol ? byU.get(t.symbol) : undefined, mc = u?.market_cap;
    return { name: t.name, symbol: t.symbol, macro: u?.nse_sector ?? null, size: capBucket(mc)?.short ?? null, w: t.w, funds: t.funds }; }), [top, byU]);
  // a Key figures card that names "Add units" opens the dialog; one in another tab opens that tab first, then its section (the sections bar's jump)
  useEffect(() => { const on = (e: Event) => { if ((e as CustomEvent).detail === "mfp-units") addUnits(); }; addEventListener("eq-jump", on); return () => removeEventListener("eq-jump", on); }, []);

  return (
    // task #389 (developer file 40 v4, D1 / SHARED.md SP1): `pfx`, as on the Equity and ETF pages, so the page has their width (with funds and without);
    // A2: VisitFolds keeps Key figures (and the bottom's two folds) open for the rest of the visit once opened, closed on every new visit
    <KnowPop.Provider value={true}><VisitFolds><div className="wrap ipo mp sp mfp pfx">
      <Gate tier={PLAN_FOR_PORTFOLIO} title="Track your mutual funds" points={["How healthy each fund is: the Mutual Fund Score and its four parts", "What sits inside your funds, and how alike they are", "Each fund against its own benchmark, and the list together", "Import your CAS PDF, or Excel / CSV statements, read by ISIN"]}>
        {/* task #275 (change 2): the compact top: title, plan, as-of and the add box in one row; the money box that says what it covers, and Your portfolios */}
        <header className="ptk-head card" id="mfp-top">
          <div className="ptk-t1">
            <div className="ptk-ht"><h1 className="ui-title">MF portfolio</h1><p className="ptk-plan mfp-plan"><span>{TIER[plan].n}</span></p>
              <Tip text="How healthy your mutual funds are, what sits inside them, how alike they are, and how risky they are together." how="Start with names; add units when you want the figures to follow your money. Each fund is read by its ISIN, which names the exact plan and option." label="About the MF portfolio" />
              {d?.dataDate && <span className="ptk-asof">NAVs at close · {dm(d.dataDate)}</span>}</div>
            <AddBox placeholder="Add a fund by name or ISIN" noun={["fund", "funds"]} useResults={useFundGroupResults} full={full} fullWhy={`Your plan holds ${limit} funds. Remove one to add another.`}
              resolve={async () => null} onSeveral={async () => undefined} onSeveralOpen={() => setSeveral(true)}
              onAdd={(sg) => { const g = groupOf(sg.id); if (g) setPicked(g); }}
              menus={<>
                <MenuButton label="Import ▾" aria="Import">{(close) => <>
                  <button type="button" role="menuitem" onClick={() => { close(); setImporting(true); }}>A statement: CAS PDF, Excel or CSV</button>
                  <p>Each fund is read by its ISIN, which names the exact plan and option; a row without an ISIN is matched by name and shown for you to confirm.</p></>}</MenuButton>
                <MenuButton label="⋯" aria="More: other pages, units and Clear portfolio" className="ptk-btn" keep>{(close) => <>
                  <button type="button" role="menuitem" disabled={!d?.count} onClick={() => { close(); addUnits(); }}>Add units and buy NAVs</button>
                  <hr /><Link role="menuitem" to="/my-investments" onClick={close}>All my investments →</Link><Link role="menuitem" to="/holdings" onClick={close}>Equity portfolio →</Link>
                  <Link role="menuitem" to="/etf-portfolio" onClick={close}>ETF portfolio →</Link><Link role="menuitem" to="/funds/compare" onClick={close}>Compare funds →</Link><hr />
                  <ClearPortfolio count={d?.count ?? 0} noun="fund" kind="MF" className="btn" goes={["each fund's units, purchases and folio", "the figures worked out from them: health, mix, overlap and risk"]}
                    onClear={async () => { await w.clear.mutateAsync(); }}
                    onUndo={async () => { try { await w.undoClear.mutateAsync(); } catch (x) { if ((x as { status?: number }).status === 410) throw new Error("The clear is final: Undo is only possible for 10 seconds."); throw x; } }} />
                  <p>{d ? `${d.count} ${d.count === 1 ? "fund" : "funds"} · ${limit} on your plan` : `${limit} on your plan`}</p></>}</MenuButton>
                {/* task #389 (developer file 32, Top 1): "Add to [select]" in the add row, after Import and ⋯ (the full-width "Funds you add or upload go to" bar goes) */}
                {pfList.length > 1 && <label className="px-addto"><span>Add to</span><select aria-label="Funds you add go to" value={goTo} onChange={(e) => (cur === "all" ? setGoTo(e.target.value) : setCur(e.target.value))}>
                  {pfList.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}</>} />
          </div>
          <PageTabs set="portfolios" className="pf-sibs" />{/* task #310 part D: the three portfolios as page tabs under the title */}
          {d && d.count > 0 && <TopMoney t={moneyNamed} all={all.map((h) => keyOf(h.id))} noun={["fund", "funds"]} pick={pick} onAddQty={addUnits} onAddPf={() => setAdding(true)} qtyWord="units" addLabel="Add units" todayKnown={today.known}
            onRename={(id, name) => { const m = name.trim(); if (!m) return "Give the platform a name."; if (pfList.some((x) => x.id !== id && x.name.trim().toLowerCase() === m.toLowerCase())) return `You already have a platform called ${m}. Try another name, such as "${m} (joint)".`;
              book.accounts.rename(id, m, pfList); toast("Platform renamed."); return null; }}
            onRemove={(id) => { const name = pfName(id); book.accounts.remove(id, pfList); setCur("all"); toast(`${name} removed.`); }} />}
        </header>
        {picked && <PlanOptionDialog g={picked} onClose={() => setPicked(null)} onDone={toast} />}
        {several && <AddSeveralDialog room={d ? Math.max(0, limit - d.count) : undefined} onClose={() => setSeveral(false)} onDone={toast} />}
        {adding && <AddPortfolioDialog taken={pfList.map((x) => x.name)} kinds={PLATFORMS}
          start={[["empty", "An empty platform", "Add funds to it by name, then their buys."], ["file", "An app statement", "Brings each fund with its units; add the buy NAVs after."], ["cas", "A CAS from CAMS, KFintech or NSDL/CDSL", "Lists every folio with units and cost."]]}
          onClose={() => setAdding(false)} onSave={({ name, broker, start }) => { const id = book.accounts.add({ name, broker }, pfList); setAdding(false); setCur(id); setGoTo(id); toast(`${name} added.`); if (start !== "empty") setImporting(true); }} />}
        {book.err && <p className="pfx-warn" role="alert">{book.err}</p>}
        {importing && <section className="sp-sec mfp-import" aria-label="Import a file"><ImportFile onDone={(m) => { toast(m); setImporting(false); }} /></section>}

        {q.isPending && silver && <div className="sp-sec" aria-busy="true"><b>Loading your funds…</b></div>}
        {q.isError && <div className="sp-sec" role="alert"><b>Your funds could not be loaded</b><p>{errText(q.error)}</p><button className="btn" onClick={() => q.refetch()}>Try again</button></div>}
        {d && !d.count && <section className="sp-sec mfp-empty" aria-labelledby="mfp-empty-h"><h2 id="mfp-empty-h">Your MF portfolio is empty</h2>
          <p className="sp-note">Add a fund by its name or ISIN, or import a statement (CAS PDF, Excel or CSV). {limit} funds fit in your plan.</p>
          <div className="mfp-empty-b"><button type="button" className="btn primary" onClick={() => (document.querySelector(".ptk-input input") as HTMLInputElement | null)?.focus()}>Add a fund</button>
            <button type="button" className="btn" onClick={() => setImporting(true)}>Import a statement</button></div></section>}
        {d && d.count > 0 && <>
          {d.summary.notes.map((n) => <p key={n} className="sp-note" role="note">{n}</p>)}
          {/* task #389 (developer file 32, Top 2–5): four calm crowned cards (Mutual Fund Score, then the three views), the four Score parts, Since your last visit */}
          <div id="mfp-tabsbox">
          <MfCards score={{ value: d.summary.score.value, label: d.summary.score.label, why: d.summary.score.why, valued: box.valued, n: all.length }} tiles={tiles} colors={VIEW_COLORS} view={view} onView={(v) => setView(v)}
            partsOpen={partsOpen} onParts={() => setPartsOpen((o) => !o)} hasParts={all.some((h) => h.score.parts)} />
          <MfParts parts={partsAverage(all)} open={partsOpen} />
          {sp.data && wc.q.data && <MfSince visit={wc.lastVisit ? dayMonth(wc.lastVisit) : null} fresh={wc.newN} onSee={() => openSec("mfp-wc", "funds")} />}
          </div>
          <ViewBar pick={pick} defs={VIEW_DEFS} view={view} onView={(v) => setView(v)} seen={seen} all={barSteps} onSec={onSec} away={inTable} step={step} onStep={setStep} />
          <StepCtx.Provider value={{ step, firstStep: steps[0]?.id ?? "" }}>
          <div id="mfp-panel" role="region" aria-label={`${VIEW_LABEL[view]} view`}>
          <MfAsOf parts={asOf} />
          {view === "funds" && <>
            {rk.isError && <p className="sp-note" role="status">{errText(rk.error)}</p>}
            <Step id="mfp-funds" title="Your funds" line="">
            <FundsTable hs={rows} rk={rk.data} sp={sp.data} listLabel={d.summary.score.label} lots={lots} stuck={inTable} lead={lead}
              actions={(h) => { const k = keyOf(h.id); return <EditSell name={fundName(h.name) || `Scheme ${h.code}`} sell={RECORD_SALE} held={aggOf(book.rows, k, cur)?.qty ?? 0} onEdit={() => setDlg({ kind: "edit", k })} onSell={() => setDlg({ kind: "sell", k })} />; }} />
            <SoldList items={sold} all={cur === "all" && pfList.length > 1} pfName={pfName} onRemoveSale={(id) => book.store.remove(id)} noun={["fund", "funds"]} />
            {kf("funds", `What your ${all.length === 1 ? "fund adds" : `${all.length} funds add`} up to, from the table above and the sections below.`)}
            </Step>
            <Step id="mfp-wc" title="What changed at the companies inside your funds" line={wcLine}>
            {wcHidden ? <section className="ptk-hz" aria-labelledby="wc-h-mf"><div className="ptk-hz-t"><h2 id="wc-h-mf">What changed at the companies inside your funds</h2><p>Hidden · From Discover: what the companies inside your funds filed in the last 90 days</p></div>
              <button type="button" className="ptk-hz-b" aria-expanded="false" aria-label="Show: What changed at the companies inside your funds" onClick={() => setWcHidden(false)}>Show ▾</button></section>
              : <div className="hz">
                {sp.isPending ? <section className="sp-sec wc" aria-labelledby="wc-h-mf"><h2 id="wc-h-mf">What changed at the companies inside your funds</h2><p className="sp-note" aria-busy="true">Reading the companies inside your funds…</p></section>
                  : sp.isError ? <section className="sp-sec wc" aria-labelledby="wc-h-mf"><h2 id="wc-h-mf">What changed at the companies inside your funds</h2><p className="sp-note" role="status">The companies inside your funds could not be read right now, so what they filed is not shown. {errText(sp.error)}</p></section>
                  : <WhatChanged symbols={cos.map((c) => c.symbol)} listName="the companies inside your funds" countLabel="Inside your funds" listRef="mf" page="mf-portfolio" className="sp-sec wc ptk-wc" hId="wc-h-mf" id="what-changed"
                    title="What changed at the companies inside your funds" nameOf={(x) => byU.get(x)?.name ?? coBy.get(x)?.name} sub={(x) => { const c = coBy.get(x); return c ? mfInsideLine(c) : undefined; }}
                    plain shortName={(s, n) => coName(s, n)}
                    help={<Info about="What changed at the companies inside your funds" text="Exchange filings from the last 90 days for the companies that make up 0.3% or more of your funds, grouped by kind. From Discover." how="An update is one kind of news from one company; a row may bundle several filings." />}
                    lede={`From Discover: companies that make up 0.3% or more of your funds and filed one of these in the last 90 days.${box.valued ? "" : " Each fund counts the same until you add units."}${!cos.length ? " None of your funds holds a company at 0.3% or more of the list." : ""}`}
                    foot={`Holdings from each fund house's latest monthly file${sp.data?.funds?.find((f) => f.holdingsAsOf)?.holdingsAsOf ? ` (${dm(sp.data.funds.find((f) => f.holdingsAsOf)!.holdingsAsOf as string)} ${(sp.data.funds.find((f) => f.holdingsAsOf)!.holdingsAsOf as string).slice(0, 4)})` : ""}; smaller holdings than 0.3% of your funds are left out here and open in Discover with Only my names.`} />}
                <button type="button" className="hz-btn hz-on" aria-expanded="true" aria-label="Hide: What changed at the companies inside your funds" onClick={() => setWcHidden(true)}>{EYE}Hide</button></div>}
            </Step>
            {noReturns > 0 && <p className="sp-note" role="status">1Y, 3Y and 5Y returns are being worked out now for {noReturns} of your funds (from the fund's published NAV history). They appear here by themselves within a minute or two. A fund younger than a year has no 1Y return, and one younger than 3 or 5 years has no 3Y or 5Y return.</p>}
          </>}
          {view === "mix" && <>
            {sp.isPending && <p className="sp-note" aria-busy="true">Working out how spread your funds are…</p>}
            {sp.isError && <p className="sp-note" role="status">How spread your funds are could not be worked out right now. {errText(sp.error)}</p>}
            {sp.data && sp.data.count > 0 && <MixTab sp={sp.data} readingOf={readingOf} gold={has("gold")} big={big} kf={kf("mix", "What sits inside, from the sections above and below.")} />}
          </>}
          {view === "risk" && <>
            {rk.isPending && <p className="sp-note" aria-busy="true">Working out the risk figures…</p>}
            {rk.isError && <p className="sp-note" role="status">{errText(rk.error)}</p>}
            {rk.data && rk.data.count > 0 && <RiskTab rk={rk.data} kf={kf("risk", "What the risk adds up to, from the figures above and the sections below.")} value={money.n && money.withQty === money.n ? { now: money.now, name: cur === "all" ? "All platforms" : pfName(cur) } : null} />}
          </>}
          {hasShort && <Step id="mfp-short" title="What this means, in short" line=""><InShort sp={sp.data} rk={rk.data} /></Step>}
          <NextView k={VIEW_LABEL[NEXT_VIEW[view]]} what={VIEW_WHAT[NEXT_VIEW[view]]} color={VIEW_COLORS[NEXT_VIEW[view]]} onGo={() => goTab(NEXT_VIEW[view])} />
          </div>
          </StepCtx.Provider>
        </>}
      {dlg?.kind === "edit" && <EditDialog key={dlg.k} noun="fund" name={fundName(nameOf(dlg.k)) || nameOf(dlg.k)} priceWord="NAV" symbol={dlg.k} holdings={book.rows} pfs={dlgPfs} pf0={pfOfFund(dlg.k)} ops={book.store}
          onRemove={(pf) => removeFund(dlg.k, pf)} onClose={() => setDlg(null)} />}
        {dlg?.kind === "sell" && <SellDialog key={dlg.k} record name={fundName(nameOf(dlg.k)) || nameOf(dlg.k)} priceWord="NAV" symbol={dlg.k} holdings={book.rows} pfs={dlgPfs} pf0={pfOfFund(dlg.k)} ops={book.store} price={priceOf(dlg.k)} onClose={() => setDlg(null)} />}
      </Gate>
      {/* task #389 (developer file 40 v4, D3 and E1 / SHARED.md SP9, SP11): the shared page bottom inside the page column: Questions (closed, at every
          width), then the Disclaimer fold, then the sources line, 18 px apart; the layout no longer adds its own Questions box below the page */}
      <PageBottom kind="mf" sources={SOURCES} />
    </div></VisitFolds></KnowPop.Provider>
  );
}
