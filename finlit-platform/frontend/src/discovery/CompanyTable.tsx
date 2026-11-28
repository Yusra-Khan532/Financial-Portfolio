// Task #303 (developer file 15): the old filter box is replaced by the dropdown toolbar of developer file 13 (Toolbar.tsx): search · Theme · Stage · Sector ·
// Industry · Size · More filters · My names, the chips, and on the count line Ready-made views, Sort and Columns (the choice kept per member); a twelfth
// column, Short-term trend (the universe's prism_st), sorts as the long-term trend does. Filters, their address keys and counts are unchanged.
// Task #251: the compact company table, the ready-made views, the filters with their chips, paging and the details row.
// Task #260 (the 20 Nov pack, SPEC §9–§11): the eleven columns (Sector · industry and Industry: Rotation · Pulse added), every column sorts (↕ ↓ ↑), the table
// scrolls inside its box with the header row and the Company column in place (SHARED §5), filings as at most two chips and a dashed "+N more";
// above it "Yours here" and ONE box for views and filters (rev 4): the views on a cream strip (a view with no company greyed), search with "Only my names",
// two labelled rows of 42 px drop-downs (About the company · Where it sits, NSE, the three NSE levels linked as in SHARED §1), active chips and Clear all;
// on a phone the views scroll sideways and "Filters ▾" opens the rows. The company panel (row ▸) as a grid of boxes (§10). Members without Gold see Prism,
// Short term and Long term locked, and the two views that filter on them locked too (the pack's open decision, decided: their counts would reveal the readings).
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import { citeUrl, useCompanyBrief } from "../lib/companyBrief";
import { I, infoText, type InfoKey } from "./Info";
import { AboutCompany, Chips, Dd, Ico, OptList, PopFoot, Search, Sw, industryItems, pickIndustry, pickSector, sectorItems, sharedChips, sizeItems, stageItems, unsetShared } from "./Toolbar";
import { useDsc } from "./ctx";
import { PulseChip, RankLine, RotChip, Stale } from "./Views";
import { EVENTS, LENSES, SIZES, STAGE_CLASS, codeOf, crore, filterRows, fmtDate, industryPath, isUp, macroPath, pct,
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

/** Developer file 53 (founder, 27 Nov 2026, 7:36 pm: "in the tables on the Discover page we need proper segregation/separation"): the twelve columns ran
 *  side by side with nothing to show which belong together. Each column now has a group (`g`), named in a header row above the column names, with a
 *  divider where a group starts, down the header and the rows; under a group a column keeps a short name (`h`: "Short term" under "FinLit's reading"),
 *  and the Columns menu and the sort keep the full one (`l`). */
type Col = { k: string; l: string; h?: string; g: string; i?: InfoKey; cls?: string };
const COLS: Col[] = [{ k: "co", l: "Company", g: "co" }, { k: "cls", l: "Sector · industry", g: "where", i: "sector", cls: "w-cls" }, { k: "th", l: "Theme · stage", g: "where", i: "stage", cls: "w-th" },
  { k: "ev", l: "Filings, 90 days", h: "Last 90 days", g: "filed", i: "filings", cls: "w-ev" }, { k: "pr", l: "Prism", g: "read", i: "prism" }, { k: "st", l: "Short-term trend", h: "Short term", g: "read", i: "st", cls: "w-lt" },
  { k: "lt", l: "Long-term trend", h: "Long term", g: "read", i: "lt", cls: "w-lt" }, { k: "r3m", l: "3 months", g: "price", i: "r3m", cls: "r" }, { k: "r1y", l: "1 year", g: "price", i: "r1y", cls: "r" },
  { k: "hi", l: "Below 52-wk high", g: "price", i: "high", cls: "r" }, { k: "mc", l: "Market cap", g: "price", i: "mc", cls: "r" }, { k: "cn", l: "Industry: Rotation · Pulse", h: "Rotation · Pulse", g: "ind", i: "corner", cls: "w-cn" }];
/** The groups, in the columns' order. */
export const COL_GROUPS: Record<string, string> = { co: "", where: "Where it is placed", filed: "Filings", read: "FinLit's reading", price: "Price and size", ind: "Its industry" };
/** The header's group row: one cell a run of shown columns of the same group (a hidden column shortens its group's span; a group with none goes). */
export function groupSpans(keys: string[]): { g: string; n: number }[] {
  const out: { g: string; n: number }[] = [];
  for (const k of keys) { const g = COLS.find((x) => x.k === k)?.g ?? k; const last = out[out.length - 1]; if (last && last.g === g) last.n++; else out.push({ g, n: 1 }); }
  return out;
}
/** The first shown column of every group but the company's: it draws the group's divider. */
export const groupStarts = (keys: string[]): Set<string> => { const s = new Set<string>(); let prev = ""; for (const k of keys) { const g = COLS.find((x) => x.k === k)?.g ?? k; if (g !== prev && g !== "co") s.add(k); prev = g; } return s; };
const GOLD_VIEWS = new Set(["uptrend", "prism"]);
/** Task #303: the Sort dropdown's words; a sort keeps its own default direction (names A–Z, figures high first). */
const SORT_NAME: Record<string, string> = { pr: "FinLit Prism", ev: "Most filings, 90 days", st: "Short-term trend", lt: "Long-term trend", r3m: "3-month move", r1y: "1-year move",
  hi: "Nearest its 52-week high", mc: "Largest company", cn: "Sector Rotation box", co: "Company A–Z", cls: "Sector · industry", th: "Theme · stage" };
const ASC = new Set(["co", "th", "cls"]);

/** The table of one page. `base` is the page's own list (a theme, an event, a sector, an industry or every company). */
export function CompanyTable({ title, base, defaultSort = "pr", event, hideCls }: { title: string; base: DRow[]; defaultSort?: string; event?: string; hideCls?: boolean }) {
  const c = useDsc();
  const S = c.T("", defaultSort), set = (p: Partial<TState>) => c.setT("", p, defaultSort);
  const hideTh = !!c.route.theme;
  const unlens = useMemo(() => filterRows(base, S, c.onList, false), [base, S, c]);
  const all = useMemo(() => sortRows(filterRows(base, S, c.onList), S, event), [base, S, c, event]);
  const pages = Math.max(1, Math.ceil(all.length / S.per)), page = Math.min(S.page, pages - 1);
  const vis = all.slice(page * S.per, (page + 1) * S.per);
  const fixed = (k: string) => (hideTh && k === "th") || (hideCls && k === "cls");
  const cols = COLS.filter((x) => x.k === "co" || (!fixed(x.k) && c.cols.has(x.k)));
  const starts = groupStarts(cols.map((x) => x.k));
  useEffect(() => { if (S.page !== page) set({ page }); }); // eslint-disable-line react-hooks/exhaustive-deps

  const cnt = (p: Partial<TState>) => filterRows(base, { ...S, ...p }, c.onList).length;
  const thName = (t: string) => c.d.board?.themes.find((x) => x.name === t);
  const themes = useMemo(() => [...new Set(base.map((r) => r.th))], [base]);
  const mine = base.filter((r) => c.onList(r.s));
  const moreN = (["lt", "pr", "cn"] as const).filter((k) => S[k]).length;

  const chips = sharedChips(S, (t) => thName(t)?.label ?? t);
  S.lenses.forEach((l) => chips.push(["lens:" + l, LENSES.find((x) => x.k === l)!.t]));
  const unset = (k: string) => {
    if (k === "all") return set({ stage: "", size: "", lt: "", pr: "", cn: "", mac: "", sct: "", ind: "", mine: false, q: "", lenses: [], cell: null, page: 0 });
    const p = unsetShared(k, S); if (p) set(p);
  };
  const sortKeys = event ? ["ev", "pr", "st", "lt", "r3m", "r1y", "hi", "mc", "cn", "co"] : ["pr", "ev", "st", "lt", "r3m", "r1y", "hi", "mc", "cn", "co"];
  const sName = (k: string) => (k === "ev" && event ? `Most ${(EVW[event] ?? [event, event])[1]}` : SORT_NAME[k] ?? k);
  const sortBy = (k: string) => set(S.sort === k ? { dir: S.dir === -1 ? 1 : -1 } : { sort: k, dir: ASC.has(k) ? 1 : -1 });
  const shown = COLS.filter((x) => x.k !== "co" && !fixed(x.k));
  return <section className="dsc-tsec dw-list" aria-labelledby="dsc-tbl-h">
    <div className="dsc-secth" id="dsc-tbl-top"><h3 id="dsc-tbl-h">{title}</h3></div>
    <div className="dbx-bar">
      <Search value={S.q} onChange={(v) => set({ q: v, page: 0 })} />
      <div className="dbx-dds" role="group" aria-label="Filters">
        {!hideTh && <Dd label="Theme" value={S.cell ? thName(S.cell)?.short ?? S.cell : ""} wide>{(close) => <OptList title="Theme"
          items={[{ v: "", t: "Any theme", c: cnt({ cell: null }), sel: !S.cell }, ...themes.map((t) => ({ v: t, t: thName(t)?.label ?? t, c: cnt({ cell: t }), sel: S.cell === t })).sort((a, b) => b.c - a.c)]}
          onPick={(v) => { set({ cell: v || null, page: 0 }); close(); }} />}</Dd>}
        <Dd label="Stage" value={S.stage}>{(close) => <OptList title="Stage" items={stageItems(S, cnt)} onPick={(v) => { set({ stage: v, page: 0 }); close(); }} />}</Dd>
        {!hideCls && <Dd label="Sector" value={S.sct || (S.mac ? `All of ${S.mac}` : "")} wide>{(close) => <OptList title="Sector" search items={sectorItems(base, S, cnt)}
          onPick={(v) => { set(pickSector(v, base)); close(); }} />}</Dd>}
        {!hideCls && <Dd label="Industry" value={S.ind} wide>{(close) => <OptList title="Industry" search items={industryItems(base, S, cnt)}
          onPick={(v) => { set(pickIndustry(v, base)); close(); }} />}</Dd>}
        <Dd label="Size" value={S.size ? SIZES[S.size as CompanySize] ?? S.size : ""} wide>{(close) => <OptList title="Size" items={sizeItems(S, cnt)} onPick={(v) => { set({ size: v, page: 0 }); close(); }} />}</Dd>
        <Dd label="More filters" icon={Ico.tune} badge={moreN || null} popCls="dbx-mf dw-mf1">{(close) => <>
          <div className="dbx-mg one"><div className="dbx-mc"><h4>About the company</h4><AboutCompany S={S} set={set} cnt={cnt} prismOpen={c.prismOpen} /></div></div>
          <PopFoot n={all.length} clear={() => set({ lt: "", pr: "", cn: "", page: 0 })} close={close} /></>}</Dd>
        <MyNames S={S} set={set} mine={mine} />
      </div>
    </div>
    <Chips chips={chips} unset={unset} />
    <div className="dbx-rbar dw-rbar">
      <span className="dbx-cnt"><span className="dsc-cnt" aria-live="polite">{all.length === base.length ? <><b>{all.length.toLocaleString("en-IN")}</b> {all.length === 1 ? "company" : "companies"}</>
        : <><b>{all.length.toLocaleString("en-IN")}</b> of {base.length.toLocaleString("en-IN")} {base.length === 1 ? "company" : "companies"}</>}</span>
        <span className="dw-foot">Click ▸ for what the company says, its filings and FinLit’s reading.</span></span>
      <div className="dw-rr">
        <Dd label="Ready-made views" icon={Ico.list} badge={S.lenses.length || null} wide right>{(close) => <>
          {LENSES.map((l) => {
            const on = S.lenses.includes(l.k), n = unlens.filter(l.f).length, gold = GOLD_VIEWS.has(l.k) && !c.prismOpen, noPeers = l.k === "leader" && !c.d.leaders;
            return <Sw key={l.k} label={l.t} on={on} n={n} note={gold ? "Gold" : noPeers ? "Not published yet" : undefined} disabled={!on && (gold || noPeers || n === 0)}
              onChange={(v) => set({ lenses: v ? [...S.lenses, l.k] : S.lenses.filter((x) => x !== l.k), page: 0 })} />;
          })}
          <p className="dbx-pn">{infoText("views", "")}</p>
          <PopFoot n={all.length} clear={() => set({ lenses: [], page: 0 })} close={close} /></>}</Dd>
        <div className="dbx-sortd"><span className="dbx-sl">Sort</span>
          <Dd label={sName(S.sort) + (S.dir === 1 && !ASC.has(S.sort) ? " (low first)" : "")} title="Sort by" right>{(close) => <OptList title="Sort by"
            items={sortKeys.map((k) => ({ v: k, t: sName(k), sel: S.sort === k }))} onPick={(v) => { set({ sort: v, dir: ASC.has(v) ? 1 : -1, page: 0 }); close(); }} />}</Dd></div>
        <Dd label="Columns" icon={Ico.cols} value={cols.length - 1 < shown.length ? String(cols.length) : ""} right>{() => <>
          {shown.map((x, j) => <Fragment key={x.k}>{(j === 0 || shown[j - 1].g !== x.g) && COL_GROUPS[x.g] ? <p className="dbx-cg">{COL_GROUPS[x.g]}</p> : null}<Sw label={x.l} on={c.cols.has(x.k)} onChange={(v) => c.setCol(x.k, v)} /></Fragment>)}
          <p className="dbx-pn">Company is always shown. Your choice is kept for every Discover list.</p></>}</Dd>
      </div>
    </div>
    <StickyTable>
      <thead><tr className="dsc-grp">{groupSpans(cols.map((x) => x.k)).map((x, j) => <th key={x.g + j} scope="colgroup" colSpan={x.n} className={x.g === "co" ? "co" : "dsc-gs"}>{COL_GROUPS[x.g] ? <span>{COL_GROUPS[x.g]}</span> : null}</th>)}</tr>
        <tr className="dsc-cols">{cols.map((x) => (
        <th key={x.k} scope="col" className={[x.k === "co" ? "co" : "", x.cls ?? "", starts.has(x.k) ? "dsc-gs" : ""].join(" ").trim() || undefined} aria-sort={S.sort === x.k ? (S.dir < 0 ? "descending" : "ascending") : "none"}>
          <button type="button" className="dsc-sb" title={x.h ? x.l : undefined} onClick={() => sortBy(x.k)}>{x.h ?? x.l}</button>{x.i ? <I k={x.i} /> : null}</th>))}</tr></thead>
      <tbody>{vis.length ? vis.map((r, i) => <RowGroup key={r.s} r={r} cols={cols.map((x) => x.k)} hideTh={hideTh} starts={starts} odd={i % 2 === 1} />)
        : <tr><td colSpan={cols.length} className="dsc-empty">No company matches these filters. Remove one or two above.</td></tr>}</tbody>
    </StickyTable>
    <div className="dsc-pager"><span>{all.length ? `${(page * S.per + 1).toLocaleString("en-IN")}–${Math.min(all.length, (page + 1) * S.per).toLocaleString("en-IN")} of ${all.length.toLocaleString("en-IN")}` : ""}</span>
      <span className="dsc-pgr"><label>Rows <select aria-label="Rows per page" value={S.per} onChange={(e) => set({ per: Number(e.target.value), page: 0 })}>{[25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select></label>
        <button type="button" className="dsc-btn" disabled={!page} onClick={() => set({ page: page - 1 })}>← Previous</button>
        <button type="button" className="dsc-btn" disabled={page >= pages - 1} onClick={() => set({ page: page + 1 })}>Next →</button></span></div>
  </section>;
}

/** "My names": Only my names, and the member's names in this list (a tap finds that one). */
export function MyNames({ S, set, mine }: { S: TState; set: (p: Partial<TState>) => void; mine: { s: string; n: string }[] }) {
  const c = useDsc();
  return <Dd label="My names" icon={Ico.star} value={S.mine ? "Only these" : ""} badge={!S.mine && mine.length ? mine.length : null} title="My names in this list" right>{(close) => <>
    <Sw big label="Only my names" on={S.mine} n={c.signedIn ? mine.length : null} disabled={!c.signedIn} onChange={(v) => set({ mine: v, page: 0 })} />
    <p className="dbx-pn">{c.signedIn ? "From your portfolio and watchlist." : "Sign in to use your portfolio and watchlist."}</p>
    {c.signedIn && <div className="dbx-ol" role="listbox" aria-label="My names">{mine.length ? mine.map((r) => (
      <button key={r.s} type="button" role="option" aria-selected={false} className="dbx-opt" onClick={() => { set({ q: short(r.n), page: 0 }); c.toggleOpen(r.s, true); close(); }}>
        <span className="dbx-ot">{short(r.n)}{c.isWatched(r.s) && !c.isHeld(r.s) ? " ★" : ""}</span><span className="dbx-oc">{codeOf(r.s)}</span></button>))
      : <p className="dbx-none">None of your names is in this list.</p>}</div>}</>}</Dd>;
}

/** The table scrolls inside its box; its header row stays at the top and the Company column on the left (SHARED §5). The header's real height is
 *  measured (ResizeObserver) so nothing slides under it. */
function StickyTable({ children }: { children: ReactNode }) {
  const box = useStickyHead();
  return <div className="dsc-tw dsc-stick dw-stick" ref={box}><table className="dsc-tb">{children}</table></div>;
}
/** A sticky table box: measures its first header row (developer file 53: the column groups) as --hr1, so the column names stay pinned under it; its
 *  width as --boxw; and its pinned first column as --c1w, so a group's name stays in view beside it while any of the group's columns is. */
export function useStickyHead() {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current, th = el?.querySelector("thead tr"), c1 = th?.querySelector("th");
    if (!el || !th || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { el.style.setProperty("--hr1", `${(th as HTMLElement).offsetHeight}px`); el.style.setProperty("--boxw", `${el.clientWidth}px`);
      if (c1) el.style.setProperty("--c1w", `${(c1 as HTMLElement).offsetWidth}px`); });
    ro.observe(th); ro.observe(el); if (c1) ro.observe(c1);
    return () => ro.disconnect();
  }, []);
  return box;
}

function RowGroup({ r, cols, hideTh, starts, odd }: { r: DRow; cols: string[]; hideTh: boolean; starts: Set<string>; odd: boolean }) {
  const c = useDsc(), o = c.open.has(r.s), theme = c.d.board?.themes.find((t) => t.name === r.th);
  const gc = (k: string, cls = "") => [cls, starts.has(k) ? "dsc-gs" : ""].join(" ").trim() || undefined;   // a group's first column draws its divider
  const cells: Record<string, ReactNode> = {
    co: <td className="co"><div className="dsc-cow">
      <button type="button" className="dsc-cv" aria-expanded={o} aria-label={`Details for ${r.n}`} onClick={() => c.toggleOpen(r.s)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
      <div><button type="button" className="dsc-nm" onClick={() => c.toggleOpen(r.s)}>{short(r.n)}</button>
        {c.isHeld(r.s) && <span className="dsc-tag pf">Portfolio</span>}{c.isWatched(r.s) && <span className="dsc-tag wl">Watchlist</span>}
        <small>{codeOf(r.s)}</small></div></div></td>,
    cls: <td className={gc("cls", "dsc-clsc")} title={[r.mac, r.sct, r.ind].filter(Boolean).join(" › ") || undefined}>{r.sct ? <b>{r.sct}</b> : null}
      {r.ind ? <Link to={industryPath(r.ind)}>{r.ind}</Link> : <span className="dsc-na">Not classified</span>}</td>,
    th: <td className={gc("th", "dsc-thc")}><b>{theme?.short ?? r.th}</b><Stage st={r.st} /></td>,
    ev: <td className={gc("ev")}><Evs r={r} /></td>,
    pr: <td className={gc("pr")}><Prism r={r} locked={!c.prismOpen && r.pr == null} /></td>,
    st: <td className={gc("st")}><Trend lt={r.st2} locked={!c.prismOpen && !r.st2} /></td>,
    lt: <td className={gc("lt")}><Trend lt={r.lt} locked={!c.prismOpen && !r.lt} />{hideTh && <><br /><Stage st={r.st} /></>}</td>,
    r3m: <td className={gc("r3m", "r num " + tone(r.r3m))}>{pct(r.r3m)}</td>,
    r1y: <td className={gc("r1y", "r num " + tone(r.r1y))}>{pct(r.r1y)}</td>,
    hi: <td className={gc("hi", "r num")}>{r.hi == null ? "−" : r.hi <= 0.05 ? "at the high" : r.hi.toFixed(1) + "%"}</td>,
    mc: <td className={gc("mc", "r num")}>{crore(r.mc)}<small className="dsc-sz">{r.sz ? SIZES[r.sz] : r.mc == null ? "Not known" : ""}</small></td>,
    cn: <td className={gc("cn", "dsc-cnc")}><RotChip cc={r.cc} cn={r.cn} />{r.pulse ? <PulseChip name={r.pulse} /> : null}</td>,
  };
  return <>
    <tr className={[o ? "dsc-open" : "", odd ? "dsc-z" : ""].join(" ").trim() || undefined} data-dsc-row={r.s}>{cols.map((k) => <Fragment key={k}>{cells[k]}</Fragment>)}</tr>
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
          {c.prismOpen ? <Tile l={<>Short term <I k="st" /></>} v={r.st2 ?? "Not rated"} cls={trCls(r.st2)} /> : <LockTile l={<>Short term <I k="st" /></>} />}
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
