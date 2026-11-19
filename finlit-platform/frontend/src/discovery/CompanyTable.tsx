// Task #251 (pack rows 9, 10, 11): the compact company table that fits a 1,206 px frame (10 columns, headers wrap, the company column sticks), the
// ready-made views (they combine; each shows how many it would leave), the filters with their chips (✕ and Clear all), a live count, paging, and the details
// row that opens in place from the name or ▸.
import { Fragment, useEffect, useMemo, type ReactNode } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import { I, type InfoKey } from "./Info";
import { useDsc } from "./ctx";
import { CORNERS, EVENTS, LENSES, SIZES, STAGES, STAGE_CLASS, TRENDS, BANDS, codeOf, crore, filterRows, fmtDate, isUp, pct, routeKey, short, sizeOf, slug, sortRows, tone,
  type DRow, type TState } from "./model";

const EVL: Record<string, string> = Object.fromEntries(EVENTS.map((e) => [e.k, e.short]));
const PRI = EVENTS.map((e) => e.k);

export function Stage({ st }: { st: string }) {
  return <span className="dsc-sg"><i className={"dsc-s-" + (STAGE_CLASS[st] ?? "ns")} aria-hidden="true" />{st}</span>;
}
export function Evs({ r, max = 3, none = "No event filing" }: { r: Pick<DRow, "ev">; max?: number; none?: string }) {
  const e = PRI.filter((k) => r.ev[k]);
  if (!e.length) return <span className="dsc-na">{none}</span>;
  return <span className="dsc-evs">{e.slice(0, max).map((k) => <span key={k} className={"dsc-ev dsc-ev-" + k}>{r.ev[k]} {EVL[k]}</span>)}{e.length > max ? <span className="dsc-ev">+{e.length - max}</span> : null}</span>;
}
export function Trend({ lt, locked }: { lt: string | null; locked?: boolean }) {
  if (!lt) return locked ? <Locked /> : <span className="dsc-na">Not rated</span>;
  return <span className={"dsc-trd " + (isUp({ lt }) ? "u" : /down/i.test(lt) ? "d" : "s")}>{lt}</span>;
}
export function Prism({ r, locked }: { r: Pick<DRow, "pr" | "pl">; locked?: boolean }) {
  if (r.pr == null) return locked ? <Locked /> : <span className="dsc-na">Not rated</span>;
  return <span className={"dsc-pp b-" + (r.pl ?? "").toLowerCase()}><b>{r.pr}</b><span>{r.pl}</span></span>;
}
/** A reading this plan does not include: it says so, never "Not rated". */
export function Locked() {
  return <Link to="/pricing" className="dsc-lock" title="FinLit Prism and the technical views are part of Gold">Gold</Link>;
}
export function Corner({ r }: { r: Pick<DRow, "cc" | "cn"> }) {
  return r.cc ? <span className="dsc-crn"><i className={"dsc-c-" + r.cc} aria-hidden="true" />{r.cn}</span> : <span className="dsc-na">No reading</span>;
}

type Col = { k: string; l: string; i?: InfoKey; cls?: string };
const COLS: Col[] = [{ k: "co", l: "Company" }, { k: "th", l: "Theme · stage", i: "stage", cls: "w-th" }, { k: "ev", l: "Filings, 90 days", i: "filings", cls: "w-ev" },
  { k: "pr", l: "Prism", i: "prism" }, { k: "lt", l: "Long-term trend", i: "lt", cls: "w-lt" }, { k: "r3m", l: "3 months", i: "r3m", cls: "r" },
  { k: "r1y", l: "1 year", i: "r1y", cls: "r" }, { k: "hi", l: "Below 52-week high", i: "high", cls: "r" }, { k: "mc", l: "Market cap", i: "mc", cls: "r" },
  { k: "cn", l: "Industry corner", i: "corner", cls: "w-cn" }];

/** The table of one page. `base` is the page's own list (a theme, an event, a sector or every company). */
export function CompanyTable({ title, base, defaultSort = "pr", event }: { title: string; base: DRow[]; defaultSort?: string; event?: string }) {
  const c = useDsc();
  const key = routeKey(c.route), S = c.T(key, defaultSort), set = (p: Partial<TState>) => c.setT(key, p);
  const hideTh = !!c.route.theme;
  const unlens = useMemo(() => filterRows(base, S, c.onList, false), [base, S, c]);
  const all = useMemo(() => sortRows(filterRows(base, S, c.onList), S, event), [base, S, c, event]);
  const pages = Math.max(1, Math.ceil(all.length / S.per)), page = Math.min(S.page, pages - 1);
  const vis = all.slice(page * S.per, (page + 1) * S.per);
  const cols = COLS.filter((x) => !(hideTh && x.k === "th"));
  const yours = c.route.theme || c.route.event || c.route.sector ? base.filter((r) => c.onList(r.s)) : [];
  useEffect(() => { if (S.page !== page) set({ page }); }); // eslint-disable-line react-hooks/exhaustive-deps

  const chips: [string, string][] = [];
  const lab: Record<string, string> = { stage: "Stage", size: "Size", lt: "Long-term trend", pr: "Prism", cn: "Industry" };
  (["stage", "size", "lt", "pr", "cn"] as const).forEach((k) => { if (S[k]) chips.push([k, `${lab[k]}: ${k === "size" ? SIZES[S[k]] : k === "cn" ? CORNERS[S[k] as keyof typeof CORNERS] : S[k] === "none" ? "Not rated" : S[k]}`]); });
  if (S.mine) chips.push(["mine", "Only my names"]);
  if (S.q) chips.push(["q", `“${S.q}”`]);
  S.lenses.forEach((l) => chips.push(["lens:" + l, LENSES.find((x) => x.k === l)!.t]));
  if (S.cell) chips.push(["cell", "Theme: " + (c.d.board?.themes.find((t) => t.name === S.cell)?.label ?? S.cell)]);
  const unset = (k: string) => {
    if (k === "all") return set({ stage: "", size: "", lt: "", pr: "", cn: "", mine: false, q: "", lenses: [], cell: null, page: 0 });
    if (k.startsWith("lens:")) return set({ lenses: S.lenses.filter((x) => x !== k.slice(5)), page: 0 });
    if (k === "mine") return set({ mine: false, page: 0 });
    if (k === "cell") return set({ cell: null, page: 0 });
    set({ [k]: "", page: 0 } as Partial<TState>);
  };
  const sortBy = (k: string) => set(S.sort === k ? { dir: S.dir === -1 ? 1 : -1 } : { sort: k, dir: k === "co" || k === "th" ? 1 : -1 });
  const sel = (k: keyof TState, label: string, opts: [string, string][]) => (
    <select aria-label={label} value={String(S[k] ?? "")} onChange={(e) => set({ [k]: e.target.value, page: 0 } as Partial<TState>)}>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>);

  return <section className="dsc-tsec" aria-labelledby="dsc-tbl-h">
    <div className="dsc-secth" id="dsc-tbl-top"><h3 id="dsc-tbl-h">{title}</h3></div>
    {yours.length > 0 && <div className="dsc-yh"><span>Yours here (★ watchlist):</span>{yours.map((r) => (
      <button key={r.s} type="button" className="dsc-chip" onClick={() => { set({ q: r.n, page: 0 }); c.toggleOpen(r.s, true); }}>{short(r.n)}{c.isHeld(r.s) ? "" : " ★"}</button>))}</div>}
    <div className="dsc-views" role="group" aria-label="Ready-made views"><span className="dsc-lab">Ready-made views</span><I k="views" />
      {LENSES.map((l) => {
        // task #251: the trend and Prism views need readings this plan does not include; they say so, never "0" (a blank shows its reason)
        const gold = (l.k === "uptrend" || l.k === "prism") && !c.prismOpen;
        const on = S.lenses.includes(l.k), n = unlens.filter(l.f).length, off = (l.k === "leader" && !c.d.leaders) || gold;
        return <button key={l.k} type="button" className="dsc-ln" aria-pressed={on} disabled={off && !on} title={gold ? "FinLit Prism and the technical views are part of Gold" : off ? "The peer labels are not published yet" : undefined}
          onClick={() => set({ lenses: on ? S.lenses.filter((x) => x !== l.k) : [...S.lenses, l.k], page: 0 })}>{l.t}<span className="dsc-c">{gold ? "Gold" : off ? "−" : n}</span></button>;
      })}</div>
    <div className="dsc-fbar">
      <input type="search" placeholder="Search in this list" aria-label="Search in this list" value={S.q} onChange={(e) => set({ q: e.target.value, page: 0 })} />
      {sel("stage", "Stage", [["", "Any stage"], ...STAGES.map((s) => [s, s] as [string, string])])}
      {sel("size", "Size", [["", "Any size"], ["L", "Large"], ["M", "Mid"], ["S", "Small"], ["X", "Micro"]])}
      {sel("lt", "Long-term trend", [["", "Any long-term trend"], ...TRENDS.map((s) => [s, s] as [string, string]), ["none", "Not rated"]])}
      {sel("pr", "FinLit Prism", [["", "Any Prism"], ...BANDS.map((s) => [s, s] as [string, string])])}
      {sel("cn", "Industry in Sector Rotation", [["", "Any industry corner"], ...Object.entries(CORNERS)])}
      <label className="dsc-tg"><input type="checkbox" checked={S.mine} onChange={(e) => set({ mine: e.target.checked, page: 0 })} disabled={!c.signedIn} /> Only my names</label>
    </div>
    {chips.length > 0 && <div className="dsc-active" role="group" aria-label="Filters on"><span>Filters:</span>{chips.map(([k, t]) => (
      <button key={k} type="button" className="dsc-ac" aria-label={`Remove filter ${t}`} onClick={() => unset(k)}>{t} ✕</button>))}
      <button type="button" className="dsc-linkish" onClick={() => unset("all")}>Clear all</button></div>}
    <div className="dsc-rhead"><span className="dsc-cnt" aria-live="polite">{all.length.toLocaleString("en-IN")} {all.length === 1 ? "company" : "companies"}</span>
      <span className="dsc-foot">Click ▸ for what the company says, its filings and FinLit’s reading.</span></div>
    <div className="dsc-tw"><table className="dsc-tb">
      <thead><tr>{cols.map((x) => (
        <th key={x.k} scope="col" className={[x.k === "co" ? "co" : "", x.cls ?? ""].join(" ").trim() || undefined} aria-sort={S.sort === x.k ? (S.dir < 0 ? "descending" : "ascending") : "none"}>
          <button type="button" className="dsc-sb" onClick={() => sortBy(x.k)}>{x.l}</button>{x.i ? <I k={x.i} /> : null}</th>))}</tr></thead>
      <tbody>{vis.length ? vis.map((r) => <RowGroup key={r.s} r={r} cols={cols.map((x) => x.k)} hideTh={hideTh} />)
        : <tr><td colSpan={cols.length} className="dsc-empty">No company matches these filters. Remove one or two above.</td></tr>}</tbody>
    </table></div>
    <div className="dsc-pager"><span>{all.length ? `${(page * S.per + 1).toLocaleString("en-IN")}–${Math.min(all.length, (page + 1) * S.per).toLocaleString("en-IN")} of ${all.length.toLocaleString("en-IN")}` : ""}</span>
      <span className="dsc-pgr"><label>Rows <select aria-label="Rows per page" value={S.per} onChange={(e) => set({ per: Number(e.target.value), page: 0 })}>{[25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select></label>
        <button type="button" className="dsc-btn" disabled={!page} onClick={() => set({ page: page - 1 })}>← Previous</button>
        <button type="button" className="dsc-btn" disabled={page >= pages - 1} onClick={() => set({ page: page + 1 })}>Next →</button></span></div>
  </section>;
}

function RowGroup({ r, cols, hideTh }: { r: DRow; cols: string[]; hideTh: boolean }) {
  const c = useDsc(), o = c.open.has(r.s), theme = c.d.board?.themes.find((t) => t.name === r.th);
  const cells: Record<string, ReactNode> = {
    co: <td className="co"><div className="dsc-cow">
      <button type="button" className="dsc-cv" aria-expanded={o} aria-label={`Details for ${r.n}`} onClick={() => c.toggleOpen(r.s)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
      <div><button type="button" className="dsc-nm" onClick={() => c.toggleOpen(r.s)}>{short(r.n)}</button>
        {c.isHeld(r.s) && <span className="dsc-tag pf">Portfolio</span>}{c.isWatched(r.s) && <span className="dsc-tag wl">Watchlist</span>}
        <small>{codeOf(r.s)}{r.ind ? ` · ${r.ind}` : ""}</small></div></div></td>,
    th: <td className="dsc-thc"><b>{theme?.short ?? r.th}</b><Stage st={r.st} /></td>,
    ev: <td><Evs r={r} /></td>,
    pr: <td><Prism r={r} locked={!c.prismOpen && r.pr == null} /></td>,
    lt: <td><Trend lt={r.lt} locked={!c.prismOpen && !r.lt} />{hideTh && <><br /><Stage st={r.st} /></>}</td>,
    r3m: <td className={"r num " + tone(r.r3m)}>{pct(r.r3m)}</td>,
    r1y: <td className={"r num " + tone(r.r1y)}>{pct(r.r1y)}</td>,
    hi: <td className="r num">{r.hi == null ? "−" : r.hi <= 0.05 ? "at the high" : r.hi.toFixed(1) + "%"}</td>,
    mc: <td className="r num">{crore(r.mc)}<small className="dsc-sz">{r.mc ? SIZES[sizeOf(r.mc)!] : ""}</small></td>,
    cn: <td><Corner r={r} /></td>,
  };
  return <>
    <tr>{cols.map((k) => <Fragment key={k}>{cells[k]}</Fragment>)}</tr>
    {o && <tr className="dsc-det"><td colSpan={cols.length}><Details r={r} /></td></tr>}
  </>;
}

type SymbolAnswer = { themes: { name: string; companies?: { symbol: string; evidence: string[]; keywords: string[]; verify: string[]; document: { date: string | null; pages: number | null; link: string } }[] }[];
  filings?: { date: string; eventLabel: string; title: string; event: string }[] };
const safeDoc = (u: string | null | undefined) => !!u && /^https:\/\/([a-z0-9-]+\.)*(nseindia\.(com|in)|bseindia\.com)\//i.test(u);

/** The details row: why it is in the theme, its filings and what to check, FinLit's reading, and the actions. */
function Details({ r }: { r: DRow }) {
  const c = useDsc(), theme = c.d.board?.themes.find((t) => t.name === r.th);
  const q = useQuery({ queryKey: ["discovery", "symbol", r.s], queryFn: () => apiGet<SymbolAnswer>(`/api/discovery?symbol=${encodeURIComponent(r.s)}`), staleTime: 10 * 60_000 });
  const mine = q.data?.themes.flatMap((t) => (t.companies ?? []).map((co) => ({ t: t.name, co }))).find((x) => x.co.symbol === r.s && x.co.evidence.length >= 0);
  const quotes = mine?.co.evidence ?? [], words = mine?.co.keywords ?? [], doc = mine?.co.document;
  const verify = (theme?.verify ?? mine?.co.verify ?? []).slice(0, 3);
  const watched = c.isWatched(r.s);
  return <div className="dsc-dg">
    <div><h4>Why it is in {theme?.label ?? r.th}</h4>
      {q.isPending ? <p className="dsc-src" role="status">Loading what the company says…</p>
        : quotes.length ? quotes.map((x, i) => <blockquote key={i}>“{x}”</blockquote>)
        : <p className="dsc-src">No clean sentence could be taken from this presentation (often a scanned or image-heavy file), so it was placed by its words alone.</p>}
      <p className="dsc-src">Words that placed it: {words.length ? words.join(", ") : "−"}</p>
      <p className="dsc-src">Investor presentation of {fmtDate(r.dd) || "an unknown date"} · {r.pg ?? "?"} pages read{doc && safeDoc(doc.link) ? <> · <a href={doc.link} target="_blank" rel="noopener noreferrer">Read the presentation</a></> : null}
        {r.sec.length ? ` · also mentions ${r.sec.map((t) => c.d.board?.themes.find((x) => x.name === t)?.label ?? t).join(", ")}` : ""}</p>
      <p className="dsc-src">Stage: <b>{r.st}</b> <I k="stage" /> · Tone {r.tone != null ? (r.tone > 0 ? "+" : r.tone < 0 ? "−" : "") + Math.abs(r.tone).toFixed(2) : "−"} <I k="tone" /></p></div>
    <div><h4>Filings, last 90 days <I k="filings" /></h4>
      <p className="dsc-p0"><Evs r={r} max={8} none="No order, capacity, deal, fund-raise, rating, management or legal filing." /></p>
      <p className="dsc-src">{r.fc} {r.fc === 1 ? "filing" : "filings"} in all.</p>
      {r.lf && <p className="dsc-lf">Latest: <b>{r.lf.t}</b><br /><span className="dsc-src">{fmtDate(r.lf.d)} · {r.lf.el}</span></p>}
      <h4 className="dsc-mt">What to check <I k="check" /></h4>
      {verify.length ? <ul>{verify.map((v) => <li key={v}>{v}</li>)}</ul> : <p className="dsc-src">No checklist for this theme yet.</p>}</div>
    <div><h4>FinLit’s reading</h4>
      <dl>
        <dt>Prism</dt><dd>{r.pr != null ? `${r.pr} ${r.pl ?? ""}` : c.prismOpen ? "Not rated" : "Part of Gold"}</dd>
        <dt>Short term</dt><dd>{r.st2 ?? (c.prismOpen ? "Not rated" : "Part of Gold")}</dd>
        <dt>Long term</dt><dd>{r.lt ?? (c.prismOpen ? "Not rated" : "Part of Gold")}</dd>
        <dt>Against peers</dt><dd>{r.ll ?? "Not compared"}</dd>
        <dt>P/E</dt><dd>{r.pe != null ? r.pe.toFixed(1) : "−"}</dd>
        <dt>ROCE</dt><dd>{r.roce != null ? r.roce.toFixed(1) + "%" : "−"}</dd>
        <dt>1 month</dt><dd className={tone(r.r1m)}>{pct(r.r1m)}</dd>
        <dt>Industry</dt><dd>{r.ind ?? "−"}{r.cn ? ` · ${r.cn}` : ""}</dd>
      </dl>
      <div className="dsc-acts">
        <button type="button" className="dsc-btn dsc-wbtn" aria-pressed={watched} onClick={() => c.toggleWatch(r.s, short(r.n))}>{watched ? "★ On your watchlist" : "☆ Add to watchlist"}</button>
        <Link className="dsc-btn" to={`/stocks/${encodeURIComponent(r.s)}`}>Company report →</Link>
        {!c.route.theme && <a className="dsc-btn" href={"#theme-" + slug(r.th)}>Theme page →</a>}
      </div></div>
  </div>;
}

