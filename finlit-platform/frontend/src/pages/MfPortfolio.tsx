import { PortfolioDisclaimer } from "../components/PortfolioDisclaimer";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { Gate } from "../components/Gate";
import { Donut } from "../charts/Atlas";
import { Icon } from "../lib/icons";
import { useDocTitle } from "../lib/title";
import { useUI } from "../lib/ui";
import { limitsFor } from "../lib/auth";
import { saveFile } from "../stock/derive";
import { statementFromFile, FIELD_LABEL, type Statement } from "../lib/mfStatement";
import { PdfPasswordError, isPdf } from "../lib/holdingsPdf";
import {
  STATUS_WORD, commitItems, crores, csvFileName, initialDecisions, pct1, reviewCounts, rupees, searchFunds, sortHoldings, toCsv,
  useMfPortfolio, useMfSpread, useMfWrites, type Decision, type Fund, type Holding, type Preview, type ReviewRow,
  shares, typeOf,
} from "../lib/mfPortfolio";
import { dateIN } from "../lib/format";
import "../styles/mf.css";
import "../styles/mfportfolio.css";
import "../styles/mfspread.css";
import { SpreadSection } from "../mf/Spread";
import { ChartZoom } from "../components/ChartZoom";
import { apiGet, type ApiError } from "../lib/api";
import { useUniverse } from "../lib/screener";
import { capBucket } from "../lib/capBuckets";
import type { Leadership } from "../lib/leadership";
import { mfTiles, type MfRisk, type Under } from "../lib/mfPack";
import { FundsSection, ListRisk, MfTabs, MfTiles, UnderSection, type MfView } from "../mf/pack/MfPack";
import "../styles/sectors-pack.css";
import "../styles/industry-pack.css";
import "../mf/pack/mf-pack.css";

const K = ["var(--k1)", "var(--k2)", "var(--k3)", "var(--k7)", "var(--k5)", "var(--k4)", "var(--k6)", "var(--k8)", "var(--k1)"];
const errText = (e: unknown) => ((e as { body?: { detail?: string } })?.body?.detail) || (e instanceof Error ? e.message : "Something went wrong. Please try again.");
const Dash = ({ why }: { why?: string | null }) => <span className="pf-dash" title={why || undefined} aria-label={why ? `Not shown. ${why}` : "Not available"} tabIndex={why ? 0 : undefined}>–</span>;

/* --------------------------------------------------------------- fund search */
function FundSearch({ onPick, placeholder = "Search a fund by name…" }: { onPick: (f: Fund) => void; placeholder?: string }) {
  const [q, setQ] = useState(""), [items, setItems] = useState<Fund[]>([]), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  useEffect(() => {
    if (q.trim().length < 3) { setItems([]); setErr(""); return; }
    setBusy(true);
    const t = setTimeout(() => searchFunds(q.trim()).then((r) => { setItems(r); setErr(""); }).catch(() => setErr("The fund search is not available right now.")).finally(() => setBusy(false)), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="mp-search">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Search a mutual fund" maxLength={80} autoComplete="off" />
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
      <span className="faint">The CAS PDF that CAMS, KFintech or MF Central emails you (detailed statement), or an .xlsx, .xls or .csv export, up to 2,000 rows. Read in your browser: the file and its password never leave your device; only the fund rows are sent.</span></div>
    {locked && <form className="row mp-pw" onSubmit={(e) => { e.preventDefault(); if (pw) read(locked.file, pw); }}>
      <label>{locked.wrong ? "That password is not correct. Try again" : "This statement is password protected. A CAS is usually locked with your PAN in capitals, or the password you chose when you asked for it"}
        <input type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></label>
      <button className="btn primary" disabled={!pw || busy}>Open</button><button type="button" className="btn" onClick={() => { setLocked(null); setPw(""); }}>Cancel</button></form>}
    {err && <p className="mp-err" role="alert">{err}</p>}
    {rev && <Review st={rev.st} pv={rev.pv} onClose={() => setRev(null)} onDone={(m) => { setRev(null); onDone(m); }} />}
  </>);
}

/* --------------------------------------------------------------- page */
const pctOrDash = (v: number | null | undefined, why?: string | null) => (v == null ? <Dash why={why} /> : pct1(v));
const NOT_RANKED: Record<string, string> = { history: "has under a year of prices", liquidity: "trades too thinly to rank fairly", stale: "has no recent prices", group: "has no peer group", hidden: "is not ranked", pending: "is waiting for its first weekly reading" };

export function MfPortfolioPage() {
  useDocTitle("MF portfolio", "How healthy your mutual funds are, how much they overlap, what sits inside them, and how risky they are together.");
  const { plan, has, toast, upgrade } = useUI();
  const silver = has("silver");
  const q = useMfPortfolio(silver), w = useMfWrites(), sp = useMfSpread(silver && !!q.data && q.data.count > 0);
  const rk = useQuery<MfRisk, ApiError>({ queryKey: ["mf-portfolio", "risk", q.data?.count ?? 0], queryFn: () => apiGet<MfRisk>("/api/me/mf-portfolio/risk"), enabled: silver && !!q.data && q.data.count > 0, staleTime: 5 * 60_000, retry: false });
  const [params, setParams] = useSearchParams();
  const view = (["mix", "risk"].includes(params.get("view") || "") ? params.get("view") : "funds") as MfView;
  const setView = (v: MfView, scroll = false) => { const n = new URLSearchParams(params); if (v === "funds") n.delete("view"); else n.set("view", v); setParams(n, { replace: true }); if (scroll) setTimeout(() => document.getElementById("mfp-tabsbox")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); };
  const [importing, setImporting] = useState(params.get("tab") === "import"), [cols, setCols] = useState<"risk" | "returns">("risk");
  const [group, setGroup] = useState<string>("All funds");   // the group tab (the categories under it are shown for reading only, they are not a filter)
  const d = q.data, locked = d ? d.scoreLocked : !has("gold");
  const all = useMemo(() => d?.holdings ?? [], [d]);
  const catOf = (h: Holding) => h.categoryLabel || "Other";
  const inGroup = useMemo(() => (group === "All funds" ? all : all.filter((h) => typeOf(h.category) === group)), [all, group]);
  const cats = useMemo(() => { const m = new Map<string, number>(); for (const h of inGroup) m.set(catOf(h), (m.get(catOf(h)) || 0) + 1); return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])); }, [inGroup]);
  const pie = useMemo(() => shares(inGroup, (h) => (group === "All funds" ? typeOf(h.category) : catOf(h))), [inGroup, group]);
  const rows = useMemo(() => sortHoldings(all, "name", "asc"), [all]);
  const groups = useMemo(() => ["All funds", ...["Equity", "Hybrid", "Debt", "Solution oriented", "Others"].filter((g) => all.some((h) => typeOf(h.category) === g))], [all]);
  const noReturns = all.filter((h) => h.returns.r1y == null && h.returns.r3y == null && h.returns.r5y == null).length;
  const [polls, setPolls] = useState(0);
  useEffect(() => {   // returns of a just-added fund are filled in within seconds: look again a few times so the numbers appear without a reload
    if (noReturns === 0 || polls >= 6) return;
    const t = setTimeout(() => { setPolls((n) => n + 1); q.refetch(); }, 20000);
    return () => clearTimeout(t);
  }, [noReturns, polls, q]);
  const limit = d?.limit ?? limitsFor(plan).mf_holdings;
  const unlock = () => upgrade("gold", "The FinLit Mutual Fund Health Score is part of Gold.");

  // the largest stocks underneath: industry and FinLit size from the stock list, how each did against its peers from its weekly reading
  const uni = useUniverse(), byU = useMemo(() => new Map((uni.data?.rows ?? []).map((r) => [r.symbol, r])), [uni.data]);
  const top = useMemo(() => sp.data?.topStocks ?? [], [sp.data]);
  const leads = useQueries({ queries: top.map((t) => ({ queryKey: ["leadership", t.symbol], queryFn: () => apiGet<Leadership>(`/api/stocks/${encodeURIComponent(t.symbol || "")}/leadership`), staleTime: 15 * 60_000, retry: false, enabled: !!t.symbol })) });
  const under: Under[] = useMemo(() => top.map((t, i) => {
    const u = t.symbol ? byU.get(t.symbol) : undefined, ld = leads[i]?.data;
    return { name: t.name, symbol: t.symbol, industry: u?.sector ?? t.sector, size: capBucket(u?.market_cap ?? null)?.label.replace(" cap", "") ?? null, w: t.w, funds: t.funds,
      peer: ld && ld.available ? { label: ld.label, raw: ld.rawLabel ?? null, rank: ld.rank, of: ld.peerGroup.ranked, group: ld.peerGroup.short || ld.peerGroup.name } : null,
      notCompared: ld && !ld.available ? NOT_RANKED[ld.reason] ?? "is not ranked" : null };
  }), [top, byU, leads]);   // eslint-disable-line react-hooks/exhaustive-deps
  const tiles = mfTiles(all, locked, sp.data, rk.data, under);

  return (
    <div className="wrap ipo mp sp mfp">
      <Gate tier="silver" title="Track your mutual funds" points={["How healthy each fund is (Health Score on Gold)", "How much your funds overlap, and the stocks underneath", "Each fund's swing, worst fall and beta against the Nifty 500", "Import your CAS PDF, or Excel / CSV statements"]}>
        <header className="sp-head mfp-head">
          <div><p className="mfp-plan"><span>Silver</span></p><h1>MF portfolio</h1>
            <p className="sp-desc">How healthy your mutual funds are, how much they overlap, what sits inside them, and how risky they are together.</p>
            <nav className="mfp-links" aria-label="Related pages"><Link className="sp-link" to="/holdings">Equity portfolio →</Link><Link className="sp-link" to="/funds/compare">Compare funds →</Link><Link className="sp-link" to="/fund-score-screener">Fund Health Score →</Link></nav></div>
          <section className="mfp-add" aria-label="Add funds">
            <AddFund disabled={false} onDone={toast} />
            <div className="mfp-add2"><button type="button" className="btn" aria-expanded={importing} onClick={() => setImporting((v) => !v)}>Import a file</button><span>{d ? `${d.count} of ${limit} funds` : ""}</span></div>
          </section>
        </header>
        {importing && <section className="sp-sec mfp-import" aria-label="Import a file"><ImportFile onDone={(m) => { toast(m); setImporting(false); }} /></section>}

        {q.isPending && silver && <div className="sp-sec" aria-busy="true"><b>Loading your funds…</b></div>}
        {q.isError && <div className="sp-sec" role="alert"><b>Your funds could not be loaded</b><p>{errText(q.error)}</p><button className="btn" onClick={() => q.refetch()}>Try again</button></div>}
        {d && !d.count && <div className="sp-sec"><b>No mutual funds yet</b><p className="sp-note">Search a fund above to add it, or import a statement. {limit} funds fit in your plan.</p></div>}
        {d && d.count > 0 && <>
          <MfTiles tiles={tiles} onGo={(to) => setView(to, true)} />
          {d.summary.notes.map((n) => <p key={n} className="sp-note" role="note">{n}</p>)}
          <div id="mfp-tabsbox"><MfTabs view={view} onView={(v) => setView(v)} /></div>
          <div id="mfp-panel" role="tabpanel" aria-labelledby={`mfp-tab-${view}`}>
          {view === "funds" && <>
            <FundsSection hs={rows} rk={rk.data} rkErr={rk.isError ? errText(rk.error) : null} sp={sp.data} locked={locked} onUnlock={unlock} cols={cols} onCols={setCols}
              tools={<><button className="btn" onClick={() => saveFile(csvFileName(), toCsv(rows, locked), "text/csv;charset=utf-8")}>Export CSV</button></>}
              extra={(h) => <>
                <td className="r">{h.nav == null ? <Dash why="This scheme has no NAV yet." /> : <><b>{rupees(h.nav)}</b><small className={"mfp-sub" + (h.navStale ? " warn" : "")} title={h.navNote || undefined}>{h.navDate ? dateIN(h.navDate) : ""}</small></>}</td>
                {(["r1y", "r3y", "r5y"] as const).map((k) => <td key={k} className="r">{pctOrDash(h.returns[k], h.returns.why || h.returns.partialWhy)}</td>)}
                <td className="r">{pctOrDash(h.ter, h.terWhy)}</td><td className="r">{h.aum == null ? <Dash why={h.aumWhy} /> : crores(h.aum)}</td></>}
              actions={(h) => <button className="btn" aria-label={`Remove ${h.name}`} title={`Remove ${h.name}`} onClick={async () => { try { await w.remove.mutateAsync(h.id); toast("Fund removed."); } catch (x) { toast(errText(x)); } }}>✕</button>} />
            {cols === "returns" && noReturns > 0 && <p className="sp-note" role="status">1Y, 3Y and 5Y returns are being worked out now for {noReturns} of your funds (from the fund's published NAV history). They appear here by themselves within a minute or two. A fund younger than a year has no 1Y return, and one younger than 3 or 5 years has no 3Y or 5Y return.</p>}
            {sp.isPending && <p className="sp-note" aria-busy="true">Reading the stocks inside your funds…</p>}
            {sp.data && sp.data.count > 0 && under.length > 0 && <UnderSection under={under} sp={sp.data} n={d.count} />}
          </>}
          {view === "mix" && <>
            <section className="sp-sec mp-cat" aria-label="Your funds by category">
              <h2>Your funds by type</h2>
              <div className="mp-cat-tabs" role="tablist">{groups.map((g) => <button key={g} role="tab" aria-selected={group === g} className={group === g ? "on" : ""} onClick={() => setGroup(g)}>{g}</button>)}</div>
              <ChartZoom label="Your funds by category">
              <div className="mp-cat-body"><div className="mp-cat-chips">{cats.map(([c, n]) => <div key={c} className="mp-cat-chip"><span>{c}</span><em>{n}</em></div>)}</div>
                <div className="mp-cat-pie">
                  {pie.slices.length ? <Donut parts={pie.slices.map((p, i) => ({ label: p.label, value: p.value, color: K[i % K.length] }))} center={String(inGroup.length)} sub={inGroup.length === 1 ? "FUND" : "FUNDS"} /> : <p className="sp-note">No funds to show yet.</p>}
                  <p className="sp-note">{group === "All funds" ? "Share of your funds by type." : `Share of your ${group.toLowerCase()} funds by category.`}</p>
                </div></div>
              </ChartZoom>
            </section>
            {sp.isPending && <p className="sp-note" aria-busy="true">Working out how spread your funds are…</p>}
            {sp.isError && <p className="sp-note" role="status">How spread your funds are could not be worked out right now. {errText(sp.error)}</p>}
            {sp.data && sp.data.count > 0 && <SpreadSection d={sp.data} part="mix" />}
          </>}
          {view === "risk" && <>
            {rk.isPending && <p className="sp-note" aria-busy="true">Working out the risk figures…</p>}
            {rk.isError && <p className="sp-note" role="status">{errText(rk.error)}</p>}
            {rk.data && rk.data.count > 0 && <ListRisk rk={rk.data} />}
            {sp.data && sp.data.count > 0 && <SpreadSection d={sp.data} part="together" />}
          </>}
          </div>
        </>}
      </Gate>
      <details className="sp-sec sp-fold mfp-disc"><summary><span><b className="sp-ft">Disclaimer</b><small>What this page is, and is not</small></span><span className="sp-show">Show ▾</span></summary><PortfolioDisclaimer kind="mf" /></details>
    </div>
  );
}
