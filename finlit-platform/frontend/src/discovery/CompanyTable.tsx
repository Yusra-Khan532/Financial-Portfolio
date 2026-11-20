// Task #251: the compact company table, the ready-made views, the filters with their chips, paging and the details row.
// Task #260 (the 20 Nov pack, SPEC §9–§11): the eleven columns (Sector · industry and Industry: Rotation · Pulse added), every column sorts (↕ ↓ ↑), the table
// scrolls inside its box with the header row and the Company column in place (SHARED §5), filings as at most two chips and a dashed "+N more";
// above it "Yours here" and ONE box for views and filters (rev 4): the views on a cream strip (a view with no company greyed), search with "Only my names",
// two labelled rows of 42 px drop-downs (About the company · Where it sits, NSE, the three NSE levels linked as in SHARED §1), active chips and Clear all;
// on a phone the views scroll sideways and "Filters ▾" opens the rows. The company panel (row ▸) as a grid of boxes (§10). Members without Gold see Prism,
// Short term and Long term locked, and the two views that filter on them locked too (the pack's open decision, decided: their counts would reveal the readings).
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import { Icon } from "../lib/icons";
import { citeUrl, useCompanyBrief } from "../lib/companyBrief";
import { I, type InfoKey } from "./Info";
import { useDsc } from "./ctx";
import { PulseChip, RankLine, RotChip, Stale } from "./Views";
import { ARROW, BANDS, CORNERS, EVENTS, LENSES, SIZES, STAGES, STAGE_CLASS, TRENDS, codeOf, crore, filterRows, fmtDate, industryPath, isUp, linkFilters, macroPath, pct,
  sectorPath, short, sortRows, themePath, tone, toneWord, type DRow, type TState } from "./model";
import type { CompanySize } from "../lib/companySize";

const EVL: Record<string, [string, string]> = { order: ["order", "orders"], capacity: ["capacity", "capacity"], partnership: ["partnership", "partnerships"], mna: ["M&A", "M&A"],
  fundraise: ["fund raise", "fund raises"], rating: ["rating", "ratings"], management: ["management", "management"], legal: ["legal", "legal"] };
/** Filing chips in words (SPEC §10: "7 management changes"). */
const EVW: Record<string, [string, string]> = { order: ["order win", "order wins"], capacity: ["capacity filing", "capacity filings"], partnership: ["partnership or MoU", "partnerships and MoUs"],
  mna: ["acquisition or merger", "acquisitions and mergers"], fundraise: ["fund raise", "fund raises"], rating: ["credit rating action", "credit rating actions"],
  management: ["management change", "management changes"], legal: ["legal or regulatory filing", "legal and regulatory filings"] };
const PRI = EVENTS.map((e) => e.k);
const evLabel = (k: string, n: number) => `${n} ${(EVL[k] ?? [k, k])[n === 1 ? 0 : 1]}`;

export function Stage({ st }: { st: string }) {
  return <span className="dsc-sg"><i className={"dsc-s-" + (STAGE_CLASS[st] ?? "ns")} aria-hidden="true" />{st}</span>;
}
/** At most `max` filing chips, then a dashed "+N more" whose hover text lists the rest (SPEC §9). */
export function Evs({ r, max = 2, none = "No event filing", words }: { r: Pick<DRow, "ev">; max?: number; none?: string; words?: boolean }) {
  const e = PRI.filter((k) => r.ev[k]);
  if (!e.length) return <span className="dsc-na">{none}</span>;
  const lab = (k: string) => (words ? `${r.ev[k]} ${(EVW[k] ?? [k, k])[r.ev[k] === 1 ? 0 : 1]}` : evLabel(k, r.ev[k]));
  const rest = e.slice(max);
  return <span className="dsc-evs">{e.slice(0, max).map((k) => <span key={k} className={"dsc-ev dsc-ev-" + k}>{lab(k)}</span>)}
    {rest.length ? <span className="dsc-ev more" title={rest.map(lab).join(", ")} tabIndex={0} aria-label={`${rest.length} more: ${rest.map(lab).join(", ")}`}>+{rest.length} more</span> : null}</span>;
}
export function Trend({ lt, locked }: { lt: string | null; locked?: boolean }) {
  if (!lt) return locked ? <Locked /> : <span className="dsc-na">Not rated</span>;
  return <span className={"dsc-trd " + (isUp({ lt }) ? "u" : /down/i.test(lt) ? "d" : "s")}>{lt}</span>;
}
export function Prism({ r, locked }: { r: Pick<DRow, "pr" | "pl">; locked?: boolean }) {
  if (r.pr == null) return locked ? <Locked /> : <span className="dsc-na">Not rated</span>;
  return <span className={"dsc-pp b-" + (r.pl ?? "").toLowerCase()}><b>{r.pr}</b><span>{r.pl}</span></span>;
}
/** A reading this plan does not include: a small "Gold" tag, never "Not rated" (SPEC §11). */
export function Locked() {
  return <Link to="/pricing" className="dsc-lock" title="FinLit Prism and the technical views are part of Gold">Gold</Link>;
}

type Col = { k: string; l: string; i?: InfoKey; cls?: string };
const COLS: Col[] = [{ k: "co", l: "Company" }, { k: "cls", l: "Sector · industry", i: "sector", cls: "w-cls" }, { k: "th", l: "Theme · stage", i: "stage", cls: "w-th" },
  { k: "ev", l: "Filings, 90 days", i: "filings", cls: "w-ev" }, { k: "pr", l: "Prism", i: "prism" }, { k: "lt", l: "Long-term trend", i: "lt", cls: "w-lt" },
  { k: "r3m", l: "3 months", i: "r3m", cls: "r" }, { k: "r1y", l: "1 year", i: "r1y", cls: "r" }, { k: "hi", l: "Below 52-wk high", i: "high", cls: "r" },
  { k: "mc", l: "Market cap", i: "mc", cls: "r" }, { k: "cn", l: "Industry: Rotation · Pulse", i: "corner", cls: "w-cn" }];
const GOLD_VIEWS = new Set(["uptrend", "prism"]);
const SIZE_KEYS: CompanySize[] = ["large", "mid", "small", "micro"];

/** The table of one page. `base` is the page's own list (a theme, an event, a sector, an industry or every company). */
export function CompanyTable({ title, base, defaultSort = "pr", event, hideCls }: { title: string; base: DRow[]; defaultSort?: string; event?: string; hideCls?: boolean }) {
  const c = useDsc();
  const S = c.T("", defaultSort), set = (p: Partial<TState>) => c.setT("", p, defaultSort);
  const hideTh = !!c.route.theme;
  const [fOpen, setFOpen] = useState(false), [note, setNote] = useState<string | null>(null);
  const unlens = useMemo(() => filterRows(base, S, c.onList, false), [base, S, c]);
  const all = useMemo(() => sortRows(filterRows(base, S, c.onList), S, event), [base, S, c, event]);
  const pages = Math.max(1, Math.ceil(all.length / S.per)), page = Math.min(S.page, pages - 1);
  const vis = all.slice(page * S.per, (page + 1) * S.per);
  const cols = COLS.filter((x) => !(hideTh && x.k === "th") && !(hideCls && x.k === "cls"));
  const yours = c.route.theme || c.route.event || c.route.macro || c.route.industry ? base.filter((r) => c.onList(r.s)) : [];
  useEffect(() => { if (S.page !== page) set({ page }); }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 5000); return () => clearTimeout(t); }, [note]);

  // the NSE levels of this list, linked (SHARED §1): picking a macro sector narrows Sector and Industry; a choice that no longer fits is taken off
  const macs = useMemo(() => [...new Set(base.map((r) => r.mac).filter((x): x is string => !!x))].sort(), [base]);
  const scts = useMemo(() => [...new Set(base.filter((r) => !S.mac || r.mac === S.mac).map((r) => r.sct).filter((x): x is string => !!x))].sort(), [base, S.mac]);
  const inds = useMemo(() => [...new Set(base.filter((r) => (!S.mac || r.mac === S.mac) && (!S.sct || r.sct === S.sct)).map((r) => r.ind).filter((x): x is string => !!x))].sort(), [base, S.mac, S.sct]);
  const cnt = (k: "mac" | "sct" | "ind", v: string) => filterRows(base, { ...S, [k]: v, ...(k === "mac" ? { sct: "", ind: "" } : k === "sct" ? { ind: "" } : {}), page: 0 }, c.onList).length;
  const setNse = (k: "mac" | "sct" | "ind", v: string) => {
    const l = linkFilters({ mac: S.mac, sct: S.sct, ind: S.ind, [k]: v }, c.tree);
    if (l.dropped) setNote(l.dropped);
    set({ mac: l.mac, sct: l.sct, ind: l.ind, page: 0 });
  };

  const chips: [string, string][] = [];
  const lab: Record<string, string> = { stage: "Stage", size: "Size", lt: "Long-term trend", pr: "Prism", mac: "Macro sector", sct: "Sector", ind: "Industry", cn: "Sector Rotation" };
  (["stage", "size", "lt", "pr", "mac", "sct", "ind", "cn"] as const).forEach((k) => {
    if (!S[k]) return;
    const v = k === "size" ? SIZES[S[k] as CompanySize] ?? S[k] : k === "cn" ? `${ARROW[S[k] as keyof typeof ARROW] ?? ""} ${CORNERS[S[k] as keyof typeof CORNERS] ?? S[k]}` : S[k] === "none" ? "Not rated" : S[k];
    chips.push([k, `${lab[k]}: ${v}`]);
  });
  if (S.mine) chips.push(["mine", "Only my names"]);
  if (S.q) chips.push(["q", `“${S.q}”`]);
  S.lenses.forEach((l) => chips.push(["lens:" + l, LENSES.find((x) => x.k === l)!.t]));
  if (S.cell) chips.push(["cell", "Theme: " + (c.d.board?.themes.find((t) => t.name === S.cell)?.label ?? S.cell)]);
  const unset = (k: string) => {
    if (k === "all") return set({ stage: "", size: "", lt: "", pr: "", cn: "", mac: "", sct: "", ind: "", mine: false, q: "", lenses: [], cell: null, page: 0 });
    if (k.startsWith("lens:")) return set({ lenses: S.lenses.filter((x) => x !== k.slice(5)), page: 0 });
    if (k === "mine") return set({ mine: false, page: 0 });
    if (k === "cell") return set({ cell: null, page: 0 });
    if (k === "mac") return set({ mac: "", sct: "", ind: "", page: 0 });
    if (k === "sct") return set({ sct: "", ind: "", page: 0 });
    set({ [k]: "", page: 0 } as Partial<TState>);
  };
  const sortBy = (k: string) => set(S.sort === k ? { dir: S.dir === -1 ? 1 : -1 } : { sort: k, dir: k === "co" || k === "th" || k === "cls" ? 1 : -1 });
  const inMac = S.mac ? ` in ${S.mac}` : "", inSct = S.sct ? ` in ${S.sct}` : inMac;
  const sel = (k: keyof TState, label: string, info: InfoKey | null, opts: [string, string][], onChange?: (v: string) => void) => (
    <label className="dsc-ff"><span>{label}{info ? <I k={info} /> : null}</span>
      <select aria-label={label} value={String(S[k] ?? "")} data-on={S[k] ? true : undefined}
        onChange={(e) => (onChange ? onChange(e.target.value) : set({ [k]: e.target.value, page: 0 } as Partial<TState>))}>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>);

  return <section className="dsc-tsec" aria-labelledby="dsc-tbl-h">
    <div className="dsc-secth" id="dsc-tbl-top"><h3 id="dsc-tbl-h">{title}</h3></div>
    {yours.length > 0 && <div className="dsc-yh"><span>Yours here (★ watchlist):</span>{yours.map((r) => (
      <button key={r.s} type="button" className="dsc-chip" onClick={() => { set({ q: r.n, page: 0 }); c.toggleOpen(r.s, true); }}>{short(r.n)}{c.isHeld(r.s) ? "" : " ★"}</button>))}</div>}
    <div className="dsc-tools">
      <div className="dsc-views" role="group" aria-label="Ready-made views"><span className="dsc-lab">Ready-made views</span><I k="views" />
        {LENSES.map((l) => {
          const gold = GOLD_VIEWS.has(l.k) && !c.prismOpen;
          const on = S.lenses.includes(l.k), n = unlens.filter(l.f).length, noPeers = l.k === "leader" && !c.d.leaders, zero = !gold && !noPeers && n === 0;
          const off = gold || noPeers || zero;
          return <button key={l.k} type="button" className={"dsc-ln" + (zero || noPeers ? " zero" : "") + (gold ? " gold" : "")} aria-pressed={on} disabled={off && !on}
            title={gold ? "FinLit Prism and the technical views are part of Gold" : noPeers ? "The peer labels are not published yet" : zero ? "No company in this list" : undefined}
            onClick={() => set({ lenses: on ? S.lenses.filter((x) => x !== l.k) : [...S.lenses, l.k], page: 0 })}>{l.t}<span className="dsc-c">{gold ? "Gold" : noPeers ? "−" : n}</span></button>;
        })}</div>
      <div className={"dsc-fbar" + (fOpen ? " open" : "")} id="dsc-fbar">
        <div className="dsc-fbtop">
          <label className="dsc-fq"><Icon name="search" /><input type="search" placeholder="Search a company in this list" aria-label="Search in this list" value={S.q} onChange={(e) => set({ q: e.target.value, page: 0 })} /></label>
          <label className="dsc-mine-t" data-on={S.mine || undefined} title={c.signedIn ? undefined : "Sign in to use your portfolio and watchlist"}>
            <input type="checkbox" checked={S.mine} onChange={(e) => set({ mine: e.target.checked, page: 0 })} disabled={!c.signedIn} /><span>Only my names</span></label>
          <button type="button" className="dsc-fbtog" aria-expanded={fOpen} aria-controls="dsc-frows" onClick={() => setFOpen((v) => !v)}>Filters <i aria-hidden="true">▾</i></button>
        </div>
        <div className="dsc-frows" id="dsc-frows">
          <div className="dsc-frow" role="group" aria-labelledby="dsc-fh-co"><div className="dsc-fh" id="dsc-fh-co">About the company</div>
            {sel("stage", "Stage", "stage", [["", "Any stage"], ...STAGES.map((s) => [s, s] as [string, string])])}
            {sel("size", "Size", "mc", [["", "Any size"], ...SIZE_KEYS.map((s) => [s, SIZES[s]] as [string, string])])}
            {sel("lt", "Long-term trend", "lt", c.prismOpen ? [["", "Any trend"], ...TRENDS.map((s) => [s, s] as [string, string]), ["none", "Not rated"]] : [["", "Part of Gold"]])}
            {sel("pr", "FinLit Prism", "prism", c.prismOpen ? [["", "Any rating"], ...BANDS.map((s) => [s, s] as [string, string])] : [["", "Part of Gold"]])}
          </div>
          <div className="dsc-frow" role="group" aria-labelledby="dsc-fh-nse"><div className="dsc-fh" id="dsc-fh-nse">Where it sits <small>NSE</small></div>
            {sel("mac", "Macro sector", null, [["", "Any macro sector"], ...macs.map((m) => [m, `${m} (${cnt("mac", m)})`] as [string, string])], (v) => setNse("mac", v))}
            {sel("sct", "Sector", null, [["", "Any sector" + inMac], ...scts.map((m) => [m, `${m} (${cnt("sct", m)})`] as [string, string])], (v) => setNse("sct", v))}
            {sel("ind", "Industry", null, [["", "Any industry" + inSct], ...inds.map((m) => [m, `${m} (${cnt("ind", m)})`] as [string, string])], (v) => setNse("ind", v))}
            {sel("cn", "Sector Rotation", "corner", [["", "Any box"], ...Object.entries(CORNERS).map(([k, v]) => [k, `${ARROW[k as keyof typeof ARROW]} ${v}`] as [string, string])])}
          </div>
        </div>
      </div>
    </div>
    {note && <p className="dsc-taken" role="status">{note}</p>}
    {chips.length > 0 && <div className="dsc-active" role="group" aria-label="Filters on"><span>Filters:</span>{chips.map(([k, t]) => (
      <button key={k} type="button" className="dsc-ac" aria-label={`Remove filter ${t}`} onClick={() => unset(k)}>{t} ✕</button>))}
      <button type="button" className="dsc-linkish" onClick={() => unset("all")}>Clear all</button></div>}
    <div className="dsc-rhead"><span className="dsc-cnt" aria-live="polite">{all.length.toLocaleString("en-IN")} {all.length === 1 ? "company" : "companies"}</span>
      <span className="dsc-foot">Click ▸ for what the company says, its filings and FinLit’s reading.</span></div>
    <StickyTable>
      <thead><tr>{cols.map((x) => (
        <th key={x.k} scope="col" className={[x.k === "co" ? "co" : "", x.cls ?? ""].join(" ").trim() || undefined} aria-sort={S.sort === x.k ? (S.dir < 0 ? "descending" : "ascending") : "none"}>
          <button type="button" className="dsc-sb" onClick={() => sortBy(x.k)}>{x.l}</button>{x.i ? <I k={x.i} /> : null}</th>))}</tr></thead>
      <tbody>{vis.length ? vis.map((r) => <RowGroup key={r.s} r={r} cols={cols.map((x) => x.k)} hideTh={hideTh} />)
        : <tr><td colSpan={cols.length} className="dsc-empty">No company matches these filters. Remove one or two above.</td></tr>}</tbody>
    </StickyTable>
    <div className="dsc-pager"><span>{all.length ? `${(page * S.per + 1).toLocaleString("en-IN")}–${Math.min(all.length, (page + 1) * S.per).toLocaleString("en-IN")} of ${all.length.toLocaleString("en-IN")}` : ""}</span>
      <span className="dsc-pgr"><label>Rows <select aria-label="Rows per page" value={S.per} onChange={(e) => set({ per: Number(e.target.value), page: 0 })}>{[25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select></label>
        <button type="button" className="dsc-btn" disabled={!page} onClick={() => set({ page: page - 1 })}>← Previous</button>
        <button type="button" className="dsc-btn" disabled={page >= pages - 1} onClick={() => set({ page: page + 1 })}>Next →</button></span></div>
  </section>;
}

/** The table scrolls inside its box; its header row stays at the top and the Company column on the left (SHARED §5). The header's real height is
 *  measured (ResizeObserver) so nothing slides under it. */
function StickyTable({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current, th = el?.querySelector("thead tr");
    if (!el || !th || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { el.style.setProperty("--hr1", `${(th as HTMLElement).offsetHeight}px`); el.style.setProperty("--boxw", `${el.clientWidth}px`); });
    ro.observe(th); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div className="dsc-tw dsc-stick" ref={box}><table className="dsc-tb">{children}</table></div>;
}

function RowGroup({ r, cols, hideTh }: { r: DRow; cols: string[]; hideTh: boolean }) {
  const c = useDsc(), o = c.open.has(r.s), theme = c.d.board?.themes.find((t) => t.name === r.th);
  const cells: Record<string, ReactNode> = {
    co: <td className="co"><div className="dsc-cow">
      <button type="button" className="dsc-cv" aria-expanded={o} aria-label={`Details for ${r.n}`} onClick={() => c.toggleOpen(r.s)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
      <div><button type="button" className="dsc-nm" onClick={() => c.toggleOpen(r.s)}>{short(r.n)}</button>
        {c.isHeld(r.s) && <span className="dsc-tag pf">Portfolio</span>}{c.isWatched(r.s) && <span className="dsc-tag wl">Watchlist</span>}
        <small>{codeOf(r.s)}</small></div></div></td>,
    cls: <td className="dsc-clsc" title={[r.mac, r.sct, r.ind].filter(Boolean).join(" › ") || undefined}>{r.sct ? <b>{r.sct}</b> : null}
      {r.ind ? <Link to={industryPath(r.ind)}>{r.ind}</Link> : <span className="dsc-na">Not classified</span>}</td>,
    th: <td className="dsc-thc"><b>{theme?.short ?? r.th}</b><Stage st={r.st} /></td>,
    ev: <td><Evs r={r} /></td>,
    pr: <td><Prism r={r} locked={!c.prismOpen && r.pr == null} /></td>,
    lt: <td><Trend lt={r.lt} locked={!c.prismOpen && !r.lt} />{hideTh && <><br /><Stage st={r.st} /></>}</td>,
    r3m: <td className={"r num " + tone(r.r3m)}>{pct(r.r3m)}</td>,
    r1y: <td className={"r num " + tone(r.r1y)}>{pct(r.r1y)}</td>,
    hi: <td className="r num">{r.hi == null ? "−" : r.hi <= 0.05 ? "at the high" : r.hi.toFixed(1) + "%"}</td>,
    mc: <td className="r num">{crore(r.mc)}<small className="dsc-sz">{r.sz ? SIZES[r.sz] : r.mc == null ? "Not known" : ""}</small></td>,
    cn: <td className="dsc-cnc"><RotChip cc={r.cc} cn={r.cn} />{r.pulse ? <PulseChip name={r.pulse} /> : null}</td>,
  };
  return <>
    <tr className={o ? "dsc-open" : undefined} data-dsc-row={r.s}>{cols.map((k) => <Fragment key={k}>{cells[k]}</Fragment>)}</tr>
    {o && <tr className="dsc-det"><td colSpan={cols.length}><Panel r={r} /></td></tr>}
  </>;
}

// ------------------------------------------------------------------------------------------------ the company panel (§10)
type Passage = { t: string; kind: "sentence" | "slide"; names: boolean; page: number | null };
type CompanyAnswer = { symbol: string; theme: string; words: string[]; passages: Passage[];
  document: { title: string | null; date: string | null; pages: number | null; link: string | null; pagesKept: boolean };
  filings: { d: string; e: string; el: string; t: string; l: string | null }[] };
const LockIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
function Tile({ l, v, sub, cls }: { l: ReactNode; v: ReactNode; sub?: ReactNode; cls?: string }) {
  return <div className="dsc-dt"><span>{l}</span><b className={cls}>{v}</b>{sub ? <small>{sub}</small> : null}</div>;
}
function LockTile({ l }: { l: ReactNode }) {
  return <div className="dsc-dt dsc-lk"><span>{l}</span><b><LockIcon />Part of Gold</b><small><Link to="/pricing">See plans →</Link></small></div>;
}
const trCls = (v: string | null) => (!v ? "" : /up/i.test(v) && !/down/i.test(v) ? "up" : /down/i.test(v) ? "down" : "");

function Panel({ r }: { r: DRow }) {
  const c = useDsc(), theme = c.d.board?.themes.find((t) => t.name === r.th), thLabel = theme?.label ?? r.th;
  const q = useQuery({ queryKey: ["discovery", "company", r.s], queryFn: () => apiGet<CompanyAnswer>(`/api/discovery/company?symbol=${encodeURIComponent(r.s)}`), staleTime: 10 * 60_000, retry: 1 });
  const brief = useCompanyBrief(r.s);
  const watched = c.isWatched(r.s), verify = (theme?.verify ?? []).slice(0, 3);
  const ps = q.data?.passages ?? [], named = ps.filter((p) => p.names), lead = named[0], rest = ps.filter((p) => p !== lead);
  const doc = q.data?.document, words = q.data?.words ?? [];
  const lf = q.data?.filings?.find((f) => f.l) ?? (r.lf ? { ...r.lf, l: r.lf.l ?? null, e: "" } : null);
  const b = brief.data && brief.data.state === "published" ? brief.data.brief : null;
  return <div className="dsc-px">
    <div className="dsc-pxh">
      <nav className="dsc-path" aria-label="Where it sits on NSE">
        {r.mac ? <Link to={macroPath(r.mac)}><small>Macro sector</small>{r.mac}</Link> : <span className="dsc-na">Not classified</span>}
        {r.mac && r.sct ? <><span aria-hidden="true">›</span><Link to={sectorPath(r.mac, r.sct)}><small>Sector</small>{r.sct}</Link></> : null}
        {r.ind ? <><span aria-hidden="true">›</span><Link to={industryPath(r.ind)}><small>Industry</small>{r.ind}</Link></> : null}
      </nav>
      <div className="dsc-acts">
        <button type="button" className="dsc-btn dsc-wbtn" aria-pressed={watched} onClick={() => c.toggleWatch(r.s, short(r.n))}>{watched ? "★ On your watchlist" : "☆ Add to watchlist"}</button>
        <Link className="dsc-btn" to={`/stocks/${encodeURIComponent(r.s)}`}>Company report →</Link>
        {!c.route.theme && <Link className="dsc-btn" to={themePath(r.th)}>{theme?.short ?? r.th} theme →</Link>}
      </div>
    </div>
    <div className="dsc-pg">
      <section className="dsc-bx dsc-why"><h4>Why it is in {thLabel}</h4>
        {q.isPending ? <p className="dsc-src" role="status">Loading what the company says…</p>
          : q.isError ? <p className="dsc-src">The presentation’s passages could not be loaded just now. Please try again in a moment.</p>
          : lead ? (lead.kind === "sentence" ? <blockquote>“{lead.t}”{lead.page ? <small> · page {lead.page}</small> : null}</blockquote>
            : <div className="dsc-slide"><em>Slide text</em><p>{lead.t}</p>{lead.page ? <small>page {lead.page}</small> : null}</div>)
          : <p className="dsc-src">No passage FinLit kept names {thLabel} directly, so none is quoted. It was placed by the words below.</p>}
        {rest.length > 0 && <details className="dsc-pmore"><summary><span>{lead ? (rest.length === 1 ? "1 more passage" : `${rest.length} more passages`) : (rest.length === 1 ? "The 1 passage FinLit kept" : `The ${rest.length} passages FinLit kept`)} from this presentation</span><i aria-hidden="true">▾</i></summary>
          <ol>{rest.map((p, i) => <li key={i}><em className={p.names ? "qy" : "qn"}>{p.names ? "Names " + thLabel : "Does not name the theme"}{p.kind === "slide" ? " · slide text" : ""}{p.page ? ` · page ${p.page}` : ""}</em><p>{p.t}</p></li>)}</ol></details>}
        <p className="dsc-wl">Words that placed it</p>
        <div className="dsc-words">{words.length ? words.map((w) => <span key={w} className="dsc-chip">{w}</span>) : <span className="dsc-na">−</span>}</div>
        <div className="dsc-tiles two">
          <Tile l={<>Stage in this theme <I k="stage" /></>} v={r.st} cls="stg" />
          <Tile l={<>Tone of the presentation <I k="tone" /></>} v={toneWord(r.tone) ?? "Not read"} sub={r.tone != null ? `${r.tone > 0 ? "+" : r.tone < 0 ? "−" : ""}${Math.abs(r.tone).toFixed(2)} on −1 to +1` : undefined} />
        </div>
        <div className="dsc-end"><p className="dsc-src">Investor presentation of {fmtDate(doc?.date ?? r.dd) || "an unknown date"} · {doc?.pages ?? r.pg ?? "?"} pages read
          {r.sec.length ? ` · also mentions ${r.sec.map((t) => c.d.board?.themes.find((x) => x.name === t)?.label ?? t).join(", ")}` : ""}
          {/* task #260 (live check): a passage without a page says why, never a silent blank */}
          {doc && !doc.pagesKept && ps.length ? " · Page numbers show once FinLit reads this presentation again and keeps its pages." : ""}</p>
          {doc?.link ? <a className="dsc-btn sm" href={doc.link} target="_blank" rel="noopener noreferrer">Read the presentation ↗</a> : null}</div>
      </section>
      <section className="dsc-bx dsc-read"><h4>FinLit’s reading</h4>
        <div className="dsc-tiles">
          {c.prismOpen ? <Tile l={<>FinLit Prism <I k="prism" /></>} v={r.pr != null ? r.pr : "Not rated"} sub={r.pr != null ? r.pl : undefined} cls={r.pr != null ? "b-" + (r.pl ?? "").toLowerCase() : "nr"} />
            : <LockTile l={<>FinLit Prism <I k="prism" /></>} />}
          <Tile l="Against peers" v={r.lead ? { leader: "Leader", in_line: "In line", laggard: "Laggard" }[r.lead] : "Not compared"}
            sub={r.lead ? r.ll : (r.ll ?? (c.d.leaders ? "No peer reading for this company" : "Peer labels are not published yet"))}
            cls={r.lead === "leader" ? "up" : r.lead === "laggard" ? "down" : "nr"} />
          {c.prismOpen ? <Tile l="Short term" v={r.st2 ?? "Not rated"} cls={trCls(r.st2)} /> : <LockTile l="Short term" />}
          {c.prismOpen ? <Tile l={<>Long term <I k="lt" /></>} v={r.lt ?? "Not rated"} cls={trCls(r.lt)} /> : <LockTile l={<>Long term <I k="lt" /></>} />}
          <Tile l="P/E" v={r.pe != null ? r.pe.toFixed(1) : "−"} />
          <Tile l="ROCE" v={r.roce != null ? r.roce.toFixed(1) + "%" : "−"} />
          <Tile l="1 month" v={pct(r.r1m)} cls={tone(r.r1m)} />
          <Tile l="1 year" v={pct(r.r1y)} cls={tone(r.r1y)} />
        </div>
        <div className="dsc-end"><p className="dsc-src">{c.d.pricesAsOf ? `Prices and scores of the ${fmtDate(c.d.pricesAsOf)} close` : "Prices and scores of the latest close"}</p></div>
      </section>
      <section className="dsc-bx dsc-ind"><h4>Its industry today</h4>
        <dl className="dsc-dl">
          <dt>Industry</dt><dd>{r.ind ? <Link to={industryPath(r.ind)}><b>{r.ind}</b></Link> : <b>Not classified</b>}{r.sct ? <small>in {r.sct} · {r.mac}</small> : null}</dd>
          <dt>Sector Rotation <I k="corner" /></dt><dd><RotChip cc={r.cc} cn={r.cn} /><RankLine r={r} /></dd>
          <dt>Sector Pulse <I k="pulse" /></dt><dd><PulseChip name={r.pulse} />{r.grpName && r.ind && r.grpName.replace(/,/g, "") !== r.ind.replace(/,/g, "") ? <small>read as part of {r.grpName}</small> : null}</dd>
        </dl>
        <div className="dsc-end"><p className="dsc-src">Readings of {c.d.rotLabel ?? (fmtDate(c.d.rotDate) || "the latest week")}<Stale date={c.d.rotDate} /></p></div>
      </section>
      <section className="dsc-bx dsc-chk"><h4>What to check <I k="check" /></h4>
        {verify.length ? <ul>{verify.map((v) => <li key={v}>{v}</li>)}</ul> : <p className="dsc-src">No checklist for this theme yet.</p>}
      </section>
      <section className="dsc-bx dsc-fil"><h4>Filings, last 90 days <I k="filings" /></h4>
        <div className="dsc-filg"><div>
          <p className="dsc-p0"><Evs r={r} max={8} words none="No order, capacity, deal, fund-raise, rating, management or legal filing." /></p>
          <p className="dsc-src">{r.fc} {r.fc === 1 ? "filing" : "filings"} in all.</p></div>
          {lf ? <div className="dsc-lf"><span className="dsc-wl">Latest filing</span><b>{lf.t}</b><span className="dsc-src">{fmtDate(lf.d)} · {lf.el}</span>
            {lf.l ? <a className="dsc-btn sm" href={lf.l} target="_blank" rel="noopener noreferrer">Open the filing ↗</a> : null}</div> : null}</div>
      </section>
      {b && <section className="dsc-bx dsc-brief"><h4>From the company brief <I k="brief" /></h4>
        <div className="dsc-brg"><ul>{(b.key_figures ?? []).slice(0, 6).map((f, i) => { const cite = f.cites[0], d = cite ? b.docs[cite.doc] : undefined, u = citeUrl(d, cite?.page);
          return <li key={i}><b>{f.label}</b> {f.value}{d ? <small>{u ? <a href={u} target="_blank" rel="noopener noreferrer">{d.title}</a> : d.title}{cite?.page ? `, p. ${cite.page}` : ""}</small> : null}</li>; })}</ul>
          <ul>{(b.recent ?? []).slice(0, 5).map((x, i) => <li key={i}><span className="dsc-flg teal">{fmtDate(x.date) || "Dated"}</span> {x.title}</li>)}</ul></div>
        <div className="dsc-end"><p className="dsc-src">Brief as of {fmtDate(b.as_of)}. Written from the company’s own filings; every line cites its page.</p></div>
      </section>}
    </div>
  </div>;
}
