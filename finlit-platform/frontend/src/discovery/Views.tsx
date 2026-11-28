// Task #251 (the 19 Nov Discover pack), task #260 (the 20 Nov pack): the views of /discover. Themes (opening) · What changed · Sectors · All companies;
// each theme, event, macro sector, sector and industry has its own page and path with a breadcrumb, so Back works and a link can be shared (model.ts).
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { prefs, usePrefs } from "../lib/prefs";
import { StateChip } from "../components/sectors/Parts";
import { stateParts } from "../lib/sectors";
import { I, type InfoKey } from "./Info";
import { useDsc } from "./ctx";
import { CompanyTable, Evs, Locked, Prism, Stage, Trend, useStickyHead } from "./CompanyTable";
import { feedFor } from "./bucket";
import { Dd, Ico } from "./Toolbar";
import { ARROW, BASE, BRIEF_CARDS, CORNERS, EVENTS, RECORD_FROM, addMonthsLocal, fmtLocal, STAGES, STAGE_CLASS, VIEW_PATH, daysOld, evBiz, eventPath, filterRows, fmtDate, useFeed, industryPath, macroPath, pct,
  sectorPath, short, slug, stat, themePath, tone, type BoardTheme, type Corner as CornerT, type Filing, type DRow, type TState } from "./model";

const pctOf = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
const scrollToTable = () => setTimeout(() => document.getElementById("dsc-tbl-top")?.scrollIntoView?.({ block: "start", behavior: "smooth" }), 40);
function count<T>(rows: T[], key: (r: T) => string | null | undefined): [string, number][] {
  const m = new Map<string, number>();
  rows.forEach((r) => { const k = key(r); if (k) m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// ------------------------------------------------------------------------------------------------ small parts
function StageBar({ rows, tall }: { rows: DRow[]; tall?: boolean }) {
  const sg: Record<string, number> = {};
  rows.forEach((r) => { sg[r.st] = (sg[r.st] || 0) + 1; });
  return <div className={"dsc-bar" + (tall ? " tall" : "")} aria-hidden="true">{STAGES.map((k) => sg[k] ? <i key={k} className={"dsc-s-" + STAGE_CLASS[k]} style={{ flex: sg[k] }} /> : null)}</div>;
}
export function StageLegend() {
  return <div className="dsc-leg">{STAGES.map((k) => <span key={k}><i className={"dsc-s-" + STAGE_CLASS[k]} />{k}</span>)}</div>;
}
const Kv = ({ l, v, cls }: { l: ReactNode; v: ReactNode; cls?: string }) => <span>{l} <b className={cls}>{v}</b></span>;
function Kpi({ l, v, i, small, cls }: { l: string; v: ReactNode; i?: InfoKey; small?: ReactNode; cls?: string }) {
  return <div className="dsc-kpi"><div className="l">{l}{i ? <I k={i} /> : null}</div><div className={"v " + (cls ?? "")}>{v}</div>{small ? <small>{small}</small> : null}</div>;
}
function Crumb({ trail, here }: { trail: [string, string][]; here: string }) {
  return <nav className="dsc-crumb" aria-label="Breadcrumb">{trail.map(([to, l]) => <span key={to} className="dsc-cr"><Link to={to}>{l}</Link><span aria-hidden="true">›</span></span>)}<span aria-current="page">{here}</span></nav>;
}
const Jump = () => <button type="button" className="dsc-btn" onClick={scrollToTable}>Companies ↓</button>;
const highest = (rows: DRow[]) => rows.filter((r) => r.pr != null).sort((a, b) => (b.pr ?? 0) - (a.pr ?? 0)).slice(0, 3).map((r) => short(r.n)).join(", ");

/** The Sector Rotation box with its arrow and colour (SHARED §3). */
export function RotChip({ cc, cn }: { cc: CornerT | null; cn?: string | null }) {
  return cc ? <span className={"dsc-rc dsc-rc-" + cc}><b aria-hidden="true">{ARROW[cc]}</b>{cn ?? CORNERS[cc]}</span> : <span className="dsc-na">No reading</span>;
}
/** The Sector Pulse state as on the Sector Pulse page: its chip and the shared words. */
/** The Sector Pulse state as on the Sector Pulse page's table (task #86): the chip carries the main words and "after a crash" sits under it, so it fits a
 *  column. `.sx` carries the Pulse page's chip colours. */
export function PulseChip({ name }: { name: string | null }) {
  if (!name) return <span className="dsc-na">No reading</span>;
  const w = stateParts(name);
  return <span className="sx dsc-sxw"><StateChip state={name} word={w.main} />{w.note ? <small className="dsc-pn">{w.note}</small> : null}</span>;
}
/** "rank 13 of 37 · 2 wks"; and "read as part of …" when a small industry is read inside its sector (SHARED §3). */
export function RankLine({ r, ind }: { r: Pick<DRow, "rk" | "of" | "wk" | "grpName">; ind?: string | null }) {
  const part = r.grpName && ind && r.grpName.replace(/,/g, "") !== ind.replace(/,/g, "") ? r.grpName : null;
  return <>{r.rk ? <small className="dsc-rk">rank {r.rk} of {r.of ?? 37}{r.wk != null ? ` · ${r.wk} wk${r.wk === 1 ? "" : "s"}` : ""}</small> : null}{part ? <small className="dsc-rk">read as part of {part}</small> : null}</>;
}
/** A red "N days old" tag when a reading is more than a week old (SHARED §3). */
export function Stale({ date }: { date: string | null }) {
  const n = daysOld(date);
  return n != null && n > 7 ? <span className="dsc-stale" title="Sector Pulse is read every day and Sector Rotation every week; this page shows the newest reading there is">{n} days old</span> : null;
}
function ReadingsNote() {
  const c = useDsc();
  return <p className="dsc-foot">Sector Rotation (weekly) and Sector Pulse (daily) readings of {c.d.rotLabel ?? (fmtDate(c.d.rotDate) || "the latest week")}.<Stale date={c.d.rotDate} /> An industry with no reading has too few liquid stocks; a small industry is read as part of its sector.</p>;
}
/** Six bars, then "Show all N …" with the rest (SPEC §5.3, §7). */
function HBars({ items, unit, onPick, picked, href }: { items: [string, number, string?][]; unit: string; onPick?: (k: string) => void; picked?: string | null; href?: (k: string) => string | null }) {
  const max = Math.max(1, ...items.map((x) => x[1]));
  const row = ([k, n, label]: [string, number, string?]) => {
    const to = href?.(k), l = label ?? k;
    return <div key={k} className="dsc-hb">
      {onPick ? <button type="button" aria-pressed={picked === k} title={l} onClick={() => onPick(k)}>{l}</button> : to ? <Link to={to} title={l}>{l}</Link> : <span title={l}>{l}</span>}
      <span className="t"><i style={{ width: `${Math.max(1.5, (n / max) * 100)}%` }} /></span><b>{n}</b></div>;
  };
  const top = items.slice(0, 6), rest = items.slice(6);
  return <><div className="dsc-hbars">{top.map(row)}</div>
    {rest.length > 0 && <details className="dsc-more"><summary><span>Show all {items.length} {unit}</span><i aria-hidden="true">▾</i></summary><div className="dsc-hbars">{rest.map(row)}</div></details>}</>;
}
/** Task #303 (version 3): the latest filings, one line each, full width: date · kind · company and headline · open; three shown, then "Show all N" (SPEC
 *  §5.4, §6). It follows the table's filters below it (task #296). */
const dshort = (d: string, now = new Date()) => {
  const x = new Date(d.length === 10 ? d + "T00:00:00" : d);
  if (Number.isNaN(x.getTime())) return "";
  return x.getFullYear() === now.getFullYear() ? x.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : x.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};
function FeedPanel({ title, list, filtered, total }: { title: string; list: Filing[]; filtered: boolean; total: number }) {
  const c = useDsc();
  const li = (f: Filing) => <li key={f.s + f.d + f.t}><span className="dw-fd" title={fmtDate(f.d)}>{dshort(f.d)}</span><span className="dw-fe">{f.el}</span>
    <span className="dw-ft" title={f.t}><b>{short(c.by.get(f.s)?.n ?? f.n)}</b> {f.t}</span>
    {f.l ? <a href={f.l} target="_blank" rel="noopener noreferrer" aria-label={`Open the filing: ${short(c.by.get(f.s)?.n ?? f.n)}`}>{Ico.ext}</a> : <span title="The exchange link is not held" />}</li>;
  return <section className="dsc-panel dsc-mb dw-feed" aria-label={title}><div className="dw-fh"><h3>{title}</h3>
    <span className="dw-fn">{filtered ? `${list.length} for your filters` : `${total} newest`}</span></div>
    {list.length ? <><ul className="dw-fl">{list.slice(0, 3).map(li)}</ul>
      {list.length > 3 && <details className="dw-fmore"><summary><span>Show all {list.length}</span><i aria-hidden="true">▾</i></summary><ul className="dw-fl">{list.slice(3).map(li)}</ul></details>}</>
      : <p className="dsc-na">{filtered ? "No filing from a company in your filters." : `No such filing in the last ${c.d.board?.days ?? 90} days.`}</p>}
  </section>;
}
/** Task #296: the "Latest …" panel of a theme or event page follows the table's filters below it: only the filings of companies that pass them (null = no
 *  filter on, the whole feed). */
function useFeedKeep(rows: DRow[], by: { event?: string; theme?: string }, board: Filing[], sort?: string): { list: Filing[]; filtered: boolean } {
  const c = useDsc(), S = c.T("", sort);
  const on = !!(S.stage || S.size || S.lt || S.pr || S.cn || S.mac || S.sct || S.ind || S.mine || S.q || S.lenses.length || S.cell);
  const full = useFeed(by, on);       // the board has the newest 12; a filtered panel reads the whole 90 days
  const keep = useMemo(() => (on ? new Set(filterRows(rows, S, c.onList).map((r) => r.s)) : null), [on, rows, S, c]); // eslint-disable-line react-hooks/exhaustive-deps
  return { list: feedFor(on ? full.data?.filings ?? board : board, keep), filtered: on };
}
function FourKpis({ rows }: { rows: DRow[] }) {
  const c = useDsc(), s = stat(rows);
  return <div className="dsc-kpis">
    <Kpi l="Companies" v={s.n} />
    <Kpi l="3-month median" i="median" v={pct(s.m3)} cls={tone(s.m3)} />
    <Kpi l="1-year median" i="m1y" v={pct(s.m1y)} cls={tone(s.m1y)} />
    <Kpi l="In a long-term uptrend" i="uptrend" v={c.prismOpen ? s.up : <Locked />} small={c.prismOpen ? `of ${s.n}` : "part of Gold"} />
  </div>;
}

// ------------------------------------------------------------------------------------------------ Themes (§4)
type TSort = "n" | "m3" | "up" | "f";
function ThemeCard({ t, rows }: { t: BoardTheme; rows: DRow[] }) {
  const c = useDsc(), s = stat(rows), yours = rows.filter((r) => c.onList(r.s)).length, top = highest(rows);
  return <Link className="dsc-cd" to={themePath(t.name)}>
    <div className="dsc-top"><h3>{t.label}</h3>{t.broad && <span className="dsc-flg">Broad</span>}</div>
    <div className="n">{s.n}<small>companies{t.also ? ` · ${t.also} more mention it` : ""}</small></div>
    <StageBar rows={rows} />
    <div className="dsc-kv"><Kv l="3-month median" v={pct(s.m3)} cls={tone(s.m3)} /><Kv l="1-year median" v={pct(s.m1y)} cls={tone(s.m1y)} />
      <Kv l="In a long-term uptrend" v={c.prismOpen ? `${s.up} of ${s.n}` : <Locked />} /><Kv l="Filings, 90 days" v={t.news.filings} /></div>
    <div className="dsc-ex">{yours ? <span className="dsc-yours">{yours} of yours · </span> : null}{top ? `Highest Prism: ${top}` : c.prismOpen ? "No company here has a Prism score yet" : "Prism: part of Gold"}</div>
  </Link>;
}
export function ThemesView() {
  const c = useDsc(), b = c.d.board!;
  const [sort, setSort] = useState<TSort>("n");
  const byTheme = useMemo(() => { const m = new Map<string, DRow[]>(); c.d.rows.forEach((r) => { m.set(r.th, [...(m.get(r.th) ?? []), r]); }); return m; }, [c.d.rows]);
  const key: Record<TSort, (t: BoardTheme) => number> = {
    n: (t) => (byTheme.get(t.name) ?? []).length, m3: (t) => stat(byTheme.get(t.name) ?? []).m3 ?? -999,
    up: (t) => { const r = byTheme.get(t.name) ?? []; return r.length ? stat(r).up / r.length : -1; }, f: (t) => t.news.filings,
  };
  const live = b.themes.filter((t) => (byTheme.get(t.name) ?? []).length > 0).sort((x, y) => key[sort](y) - key[sort](x));
  const spec = live.filter((t) => !t.broad), broad = live.filter((t) => t.broad), zero = b.themes.filter((t) => !(byTheme.get(t.name) ?? []).length);
  const merged = b.themes.flatMap((t) => t.merged.map((m) => [m, t.label] as const));
  return <>
    <div className="dsc-toolbar"><p>{spec.length} themes from the companies’ own investor presentations, then {broad.length} broad groups. Each card shows the stage mix <I k="stage" />, the median move <I k="median" /> and how many are in a long-term uptrend <I k="uptrend" />. Open one for its companies, latest filings and what to check.</p>
      <label>Sort by <select value={sort} onChange={(e) => setSort(e.target.value as TSort)}><option value="n">Most companies</option><option value="m3">3-month median</option>
        <option value="up" disabled={!c.prismOpen}>{c.prismOpen ? "Share in an uptrend" : "Share in an uptrend (Gold)"}</option><option value="f">Most filings, 90 days</option></select></label></div>
    <StageLegend />
    <div className="dsc-grid">{spec.map((t) => <ThemeCard key={t.name} t={t} rows={byTheme.get(t.name)!} />)}</div>
    {broad.length > 0 && <><div className="dsc-secth"><h3>Broad groups</h3><I k="broad" /></div>
      <div className="dsc-grid">{broad.map((t) => <ThemeCard key={t.name} t={t} rows={byTheme.get(t.name)!} />)}</div></>}
    {(zero.length > 0 || merged.length > 0) && <p className="dsc-foot">{zero.map((t) => `${t.label}: no company has it as its main theme yet; ${t.also} mention${t.also === 1 ? "s" : ""} it. `).join("")}
      {merged.map(([m, into]) => `“${m}” is shown inside “${into}”. `).join("")}</p>}
  </>;
}

// ------------------------------------------------------------------------------------------------ Theme page (§5)
type Lvl = "mac" | "sct" | "ind";
const LVL_WORD: Record<Lvl, [string, string, string]> = { mac: ["Macro sector", "macro sector", "macro sectors"], sct: ["Sector", "sector", "sectors"], ind: ["Industry", "industry", "industries"] };
function WhereTheySit({ rows }: { rows: DRow[] }) {
  const c = useDsc(), key = "", S = c.T(key);
  const [lvl, setLvl] = useState<Lvl>("ind");
  const items = count(rows, (r) => r[lvl === "mac" ? "mac" : lvl === "sct" ? "sct" : "ind"]);
  const pick = (k: string) => { const on = S[lvl] === k; c.setT(key, { mac: "", sct: "", ind: "", [lvl]: on ? "" : k, page: 0 } as Partial<TState>); if (!on) scrollToTable(); };
  const nClass = lvl === "mac" ? 12 : lvl === "sct" ? 22 : 59;
  return <div className="dsc-panel"><h3>Where these companies sit <I k="nse" /></h3>
    <div className="dsc-seg sm" role="group" aria-label="Level">{(["mac", "sct", "ind"] as Lvl[]).map((k) => <button key={k} type="button" aria-pressed={lvl === k} onClick={() => setLvl(k)}>{LVL_WORD[k][0]}</button>)}</div>
    <p className="dsc-line">{items.length} {items.length === 1 ? LVL_WORD[lvl][1] : LVL_WORD[lvl][2]} of NSE’s {nClass} on NSE’s classification. Pick one to list its companies below.</p>
    {items.length ? <HBars items={items} unit={LVL_WORD[lvl][2]} onPick={pick} picked={S[lvl] || null} /> : <p className="dsc-na">No NSE classification for these companies yet.</p>}
  </div>;
}
export function ThemePage({ theme }: { theme: string }) {
  const c = useDsc(), b = c.d.board!, t = b.themes.find((x) => x.name === theme)!;
  const rows = useMemo(() => c.d.rows.filter((r) => r.th === theme), [c.d.rows, theme]);
  const feed = useFeedKeep(rows, { theme }, b.thfil?.[theme] ?? []);
  const s = stat(rows), yours = rows.filter((r) => c.onList(r.s));
  const sg = count(rows, (r) => r.st), sgN = new Map(sg);
  const p = usePrefs(), id = slug(theme), following = p.followThemes.includes(id);
  const follow = () => prefs.set({ followThemes: following ? p.followThemes.filter((x) => x !== id) : [...p.followThemes, id] });
  return <>
    <Crumb trail={[[BASE, "Themes"]]} here={t.label} />
    <div className="dsc-dh"><div><h2>{t.label}{t.broad && <><span className="dsc-flg">Broad</span><I k="broad" /></>}</h2>
      <p>{s.n} {s.n === 1 ? "company has" : "companies have"} this as their main theme{t.also ? <>, and {t.also} more mention it <I k="also" /></> : null}.</p></div>
      <div className="dsc-dha"><Jump />
        <Dd label="What to check" icon={Ico.list} title="What to check in this theme" wide right cls="dw-chk">{() => <>
          {t.verify.length ? <ol className="dbx-vl">{t.verify.slice(0, 5).map((v) => <li key={v}>{v}</li>)}</ol> : <p className="dbx-pn">No checklist for this theme yet.</p>}
          <p className="dbx-pn">Questions to answer from the company’s own documents before taking a theme mention at face value.</p>
          <p className="dbx-pn">A theme word or a filing alone is not proof of real business. Check the figures, orders and status in the company’s own documents.</p></>}</Dd>
        <button type="button" className="dsc-btn dsc-follow" aria-pressed={following} onClick={follow} title="Kept with your settings; FinLit does not send a message about a theme yet">{following ? "✓ Following" : "☆ Follow this theme"}</button></div></div>
    <div className="dsc-kpis">
      <Kpi l="Companies" v={s.n} small={yours.length ? `${yours.length} of yours` : c.signedIn ? "none of yours" : undefined} />
      <Kpi l="3-month median" i="median" v={pct(s.m3)} cls={tone(s.m3)} />
      <Kpi l="1-year median" i="m1y" v={pct(s.m1y)} cls={tone(s.m1y)} />
      <Kpi l="In a long-term uptrend" i="uptrend" v={c.prismOpen ? s.up : <Locked />} small={c.prismOpen ? `of ${s.n} (${pctOf(s.up, s.n)}%)` : "part of Gold"} />
      <Kpi l="Filings, 90 days" i="filings" v={t.news.filings} small={`${t.news.positive} positive, ${t.news.negative} negative tone`} />
    </div>
    <div className="dsc-two">
      <div className="dsc-panel"><h3>How far along <I k="stage" /></h3><StageBar rows={rows} tall />
        <table className="dsc-stg"><tbody>{STAGES.map((k) => { const n = sgN.get(k) ?? 0; return <tr key={k}><td><Stage st={k} /></td><td className="r num">{n}</td><td className="r num dsc-na">{pctOf(n, s.n)}%</td></tr>; })}</tbody></table></div>
      <WhereTheySit rows={rows} />
    </div>
    <FeedPanel title="Latest filings in this theme" list={feed.list} filtered={feed.filtered} total={(b.thfil?.[theme] ?? []).length} />
    <CompanyTable title={"Companies in " + t.label} base={rows} />
  </>;
}

// ------------------------------------------------------------------------------------------------ What changed (§6)
export function EventsView() {
  const c = useDsc(), b = c.d.board!;
  const rec = [...EVENTS.slice(0, 5).map((e) => e.t), "Each theme"];
  const at = (m: number) => fmtLocal(addMonthsLocal(RECORD_FROM, m));      // task #303: local dates (toISOString read one day early in India)
  return <>
    <div className="dsc-toolbar"><p>Companies with at least one such exchange filing in the last {b.days} days. A company can be in more than one group. <I k="filings" /></p></div>
    <div className="dsc-grid">{EVENTS.map((e) => {
      const rows = c.d.rows.filter((r) => r.ev[e.k]), s = stat(rows), yours = rows.filter((r) => c.onList(r.s)).length;
      const ex = rows.slice().sort((x, y) => (y.ev[e.k] - x.ev[e.k]) || ((y.pr ?? 0) - (x.pr ?? 0))).slice(0, 3).map((r) => short(r.n)).join(", ");
      return <Link key={e.k} className="dsc-cd" to={eventPath(e.k)}><h3>{e.t}</h3><div className="n">{s.n}<small>companies · {b.days} days</small></div>
        <div className="dsc-kv"><Kv l="3-month median" v={pct(s.m3)} cls={tone(s.m3)} /><Kv l="In a long-term uptrend" v={c.prismOpen ? `${s.up} of ${s.n}` : <Locked />} /></div>
        <div className="dsc-ex">{yours ? <span className="dsc-yours">{yours} of yours · </span> : null}{ex || "No such filing in this window"}</div></Link>;
    })}</div>
    {/* task #303 (version 3): the two sections below stay closed until opened; they keep their state while the page redraws */}
    <details className="dw-acc" data-k="briefs"><summary className="dw-acch"><span className="dw-acct">From company briefs</span><I k="brief" /><span className="dsc-flg teal">From briefs</span>
      <span className="dw-accs">{BRIEF_CARDS.length} groups · no brief published yet</span><i className="dw-accc" aria-hidden="true">▾</i></summary>
    <div className="dw-accb"><div className="dsc-grid">{BRIEF_CARDS.map((x) => <Link key={x.k} className="dsc-cd dashed" to={eventPath(x.k)}><div className="dsc-top"><h3>{x.t}</h3><span className="dsc-flg teal">From briefs</span></div>
      <div className="n">0<small>companies so far</small></div><div className="dsc-ex dsc-wrap">No full company brief with these items is published yet. They appear here, each with its page, as briefs are published.</div></Link>)}</div></div></details>
    <details className="dw-acc" data-k="record"><summary className="dw-acch"><span className="dw-acct">How each group has done since companies joined it</span><I k="record" /><span className="dsc-flg teal">Starts on launch</span>
      <span className="dw-accs">First figures from {at(1)}</span><i className="dw-accc" aria-hidden="true">▾</i></summary>
    {/* developer file 53 ("see if everything makes sense"): before the first figure, the table repeated the same four dates in every one of its six rows and
        "same dates" in the last column; the dates are one row now, and the groups one line under it */}
    <div className="dw-accb"><div className="dsc-tw"><table className="dsc-rec"><thead><tr><th scope="col">Figures</th><th scope="col" className="r dsc-gs">1 month later</th><th scope="col" className="r">3 months</th><th scope="col" className="r">6 months</th><th scope="col" className="r">12 months</th></tr></thead>
      <tbody><tr><th scope="row">First shown on</th><td className="r dsc-gs">{at(1)}</td><td className="r">{at(3)}</td><td className="r">{at(6)}</td><td className="r">{at(12)}</td></tr></tbody></table></div>
    <p className="dsc-foot">Shown for each group ({rec.slice(0, -1).join(", ")}, and each theme), each against the Nifty 500 over the same days.</p>
    <p className="dsc-foot">The record starts on {fmtDate(RECORD_FROM)}: each figure shows once its date has passed.</p></div></details>
  </>;
}
export function EventPage({ k }: { k: string }) {
  const c = useDsc(), b = c.d.board!;
  const brief = BRIEF_CARDS.find((x) => x.k === k);
  const rows = useMemo(() => c.d.rows.filter((r) => r.ev[k]), [c.d.rows, k]);
  const feed = useFeedKeep(rows, { event: k }, b.efil[k] ?? [], "ev");
  if (brief) return <>
    <Crumb trail={[[VIEW_PATH["what-changed"], "What changed"]]} here={brief.t} />
    <div className="dsc-dh"><div><h2>{brief.t} <span className="dsc-flg teal">From briefs</span></h2><p>Each item comes from a full company brief, with its value, its date and the page of the filing it is on. More companies appear as briefs are written.</p></div></div>
    <div className="dsc-panel"><p className="dsc-na">No full company brief with these items is published yet.</p></div>
  </>;
  const e = EVENTS.find((x) => x.k === k)!;
  const s = stat(rows);
  return <>
    <Crumb trail={[[VIEW_PATH["what-changed"], "What changed"]]} here={e.t} />
    <div className="dsc-dh"><div><h2>{e.t}</h2><p>{s.n} companies {e.d} in the last {b.days} days. Sorted by how many such filings each made.</p></div><div className="dsc-dha"><Jump /></div></div>
    <FourKpis rows={rows} />
    <FeedPanel title="Latest of these filings" list={feed.list} filtered={feed.filtered} total={(b.efil[k] ?? []).length} />
    <CompanyTable title={"Companies with " + e.t.toLowerCase()} base={rows} defaultSort="ev" event={k} />
  </>;
}

// ------------------------------------------------------------------------------------------------ Sectors (§7)
const SECTOR_COLORS = ["var(--dsc-t1)", "var(--dsc-t2)", "var(--dsc-t3)"];
/** One reading per industry: the first company of it that carries a Rotation box (they all share their industry's group). */
function indReading(rows: DRow[]): DRow | undefined { return rows.find((r) => r.cc) ?? rows.find((r) => r.pulse) ?? rows[0]; }
function cornersOf(rows: DRow[]) {
  const inds = new Map<string, CornerT | null>();
  rows.forEach((r) => { if (r.ind && (!inds.has(r.ind) || (!inds.get(r.ind) && r.cc))) inds.set(r.ind, r.cc); });
  const cc: Partial<Record<CornerT, number>> = {};
  inds.forEach((v) => { if (v) cc[v] = (cc[v] || 0) + 1; });
  return { n: inds.size, cc };
}
function GroupCard({ name, rows, to }: { name: string; rows: DRow[]; to: string }) {
  const c = useDsc(), s = stat(rows), t3 = count(rows, (r) => r.th).slice(0, 3), rest = rows.length - t3.reduce((a, x) => a + x[1], 0);
  const { n, cc } = cornersOf(rows), nSec = new Set(rows.map((r) => r.sct).filter(Boolean)).size, lab = (t: string) => c.d.board?.themes.find((x) => x.name === t)?.short ?? t;
  return <Link className="dsc-cd" to={to}><h3>{name}</h3>
    <div className="n">{s.n}<small>companies · {nSec ? `${nSec} ${nSec === 1 ? "sector" : "sectors"} · ` : ""}{n} {n === 1 ? "industry" : "industries"}</small></div>
    <div className="dsc-bar mid" aria-hidden="true">{t3.map(([t, k], i) => <i key={t} style={{ flex: k, background: SECTOR_COLORS[i] }} />)}{rest > 0 ? <i style={{ flex: rest, background: "var(--border)" }} /> : null}</div>
    <div className="dsc-leg">{t3.map(([t, k], i) => <span key={t}><i style={{ background: SECTOR_COLORS[i] }} />{lab(t)} {k}</span>)}</div>
    <div className="dsc-kv"><Kv l="3-month median" v={pct(s.m3)} cls={tone(s.m3)} /><Kv l="In a long-term uptrend" v={c.prismOpen ? `${s.up} of ${s.n}` : <Locked />} /></div>
    <div className="dsc-rot"><span>Industries:</span>{(Object.keys(CORNERS) as CornerT[]).filter((k) => cc[k]).map((k) => <span key={k} className={"dsc-rt-" + k}><b aria-hidden="true">{ARROW[k]}</b>{cc[k]} {CORNERS[k].toLowerCase()}</span>)}
      {!Object.keys(cc).length && <span>no Sector Rotation reading</span>}</div></Link>;
}
type SLvl = "mac" | "sct" | "ind";
type ISort = "n" | "m3" | "up" | "rk";
export function SectorsView() {
  const c = useDsc();
  const [lvl, setLvl] = useState<SLvl>("mac");
  const macs = useMemo(() => { const m = new Map<string, DRow[]>(); c.d.rows.forEach((r) => { if (r.mac) m.set(r.mac, [...(m.get(r.mac) ?? []), r]); }); return [...m.entries()].sort((a, x) => x[1].length - a[1].length); }, [c.d.rows]);
  const nSct = c.tree.macroOf.size, nInd = c.industries.length;
  return <>
    <div className="dsc-toolbar"><p>NSE’s own classification <I k="nse" />: each group with its three biggest themes, how its stocks have moved, and where its industries sit in Sector Rotation <I k="corner" />. Open one for its industries and companies.</p>
      <div className="dsc-seg" role="group" aria-label="Level">
        <button type="button" aria-pressed={lvl === "mac"} onClick={() => setLvl("mac")}>Macro sectors <span className="n">{macs.length}</span></button>
        <button type="button" aria-pressed={lvl === "sct"} onClick={() => setLvl("sct")}>Sectors <span className="n">{nSct}</span></button>
        <button type="button" aria-pressed={lvl === "ind"} onClick={() => setLvl("ind")}>Industries <span className="n">{nInd}</span></button></div></div>
    {lvl === "ind" ? <IndustriesTable rows={c.d.rows} /> : <>
      {lvl === "mac" ? <div className="dsc-grid">{macs.map(([m, r]) => <GroupCard key={m} name={m} rows={r} to={macroPath(m)} />)}</div>
        : macs.map(([m, r]) => <section key={m} className="dsc-grp"><h3 className="dsc-grph"><Link to={macroPath(m)}>{m}</Link></h3>
          <div className="dsc-grid">{count(r, (x) => x.sct).map(([sc]) => <GroupCard key={sc} name={sc} rows={r.filter((x) => x.sct === sc)} to={sectorPath(m, sc)} />)}</div></section>)}
      <ThemeMap lvl={lvl} macs={macs} />
    </>}
  </>;
}
/** Task #303 (version 3): the map's six steps. By count: 1–2, 3–5, 6–10, 11–25, 26–60, more than 60; by %: below 5, 5–10, 10–20, 20–35, 35–50, above 50.
 *  The text is dark on the four lighter steps and light on the two darkest (discover.css, .dw-hc[data-l]). */
export function heatStep(v: number, mode: "n" | "p"): number {
  const cut = mode === "n" ? [2, 5, 10, 25, 60] : [5, 10, 20, 35, 50];
  return 1 + cut.filter((x) => v > x).length;
}
function ThemeMap({ lvl, macs }: { lvl: "mac" | "sct"; macs: [string, DRow[]][] }) {
  const c = useDsc(), b = c.d.board!;
  const [mode, setMode] = useState<"n" | "p">("n");
  const counts = new Map(count(c.d.rows, (r) => r.th));
  const cols = [...b.themes.filter((t) => !t.broad && counts.get(t.name)).sort((a, x) => (counts.get(x.name) || 0) - (counts.get(a.name) || 0)).slice(0, 10), ...b.themes.filter((t) => t.broad)];
  const spec = cols.filter((t) => !t.broad), broad = cols.filter((t) => t.broad), shown = new Set(cols.map((t) => t.name));
  const others = b.themes.filter((t) => !shown.has(t.name) && counts.get(t.name));
  const mapBox = useStickyHead();
  const groups: [string, DRow[], string][] = lvl === "mac" ? macs.map(([m, r]) => [m, r, macroPath(m)])
    : macs.flatMap(([m, r]) => count(r, (x) => x.sct).map(([sc]) => [sc, r.filter((x) => x.sct === sc), sectorPath(m, sc)] as [string, DRow[], string]));
  const word = lvl === "mac" ? "macro sector" : "sector";
  return <>
    <div className="dsc-secth"><h3>{lvl === "mac" ? "Macro sector" : "Sector"} × theme map</h3><I k="map" /></div>
    <div className="dsc-toolbar"><p>Where each {word}’s companies sit across the largest themes. Click a number to list those companies.</p>
      <span className="dw-heatk" aria-hidden="true">Fewer{[1, 2, 3, 4, 5, 6].map((l) => <i key={l} data-l={l} />)}More</span>
      <div className="dsc-seg" role="group" aria-label="Show"><button type="button" aria-pressed={mode === "n"} onClick={() => setMode("n")}>Companies</button><button type="button" aria-pressed={mode === "p"} onClick={() => setMode("p")}>% of the {word}</button></div></div>
    {/* developer file 53 (founder, 27 Nov 2026: "proper segregation/separation in the tables, and see if everything makes sense"): a header row names the
        column groups (the largest themes, the broad groups, the total), with a divider where each starts; "Other themes" counts the companies in the themes
        not shown, so every row adds up to All (Industrials' cells summed to 271 of its 277) */}
    <div className="dsc-tw dsc-stick dw-map" ref={mapBox}><table className="dsc-map"><thead>
      <tr className="dsc-grp"><th scope="col" className="rowh" /><th scope="colgroup" colSpan={spec.length + 1} className="dsc-gs"><span>The {spec.length} largest themes, then the rest</span></th>{broad.length > 0 && <th scope="colgroup" colSpan={broad.length} className="dsc-gs"><span>Broad groups</span></th>}<th scope="col" className="dsc-gs" /></tr>
      <tr className="dsc-cols"><th scope="col">{lvl === "mac" ? "Macro sector" : "Sector"}</th>{spec.map((t, j) => <th key={t.name} scope="col" title={t.label} className={j === 0 ? "dsc-gs" : undefined}>{t.short}</th>)}<th scope="col" className="oth" title={`Every other theme: ${others.map((t) => t.label).join(", ")}`}>Other themes</th>{broad.map((t, j) => <th key={t.name} scope="col" title={t.label} className={j === 0 ? "dsc-gs" : undefined}>{t.short}</th>)}<th scope="col" className="dsc-gs tot">All</th></tr></thead>
      <tbody>{groups.map(([g, rows, to]) => {
        const cell = (t: { name: string; label: string }, cls?: string) => {
          const n = rows.filter((r) => r.th === t.name).length, v = mode === "n" ? n : pctOf(n, rows.length);
          return <td key={t.name} className={cls}>{n ? <button type="button" className="dw-hc" data-l={heatStep(v, mode)}
            aria-label={`${n} ${g} companies in ${t.label}`} onClick={() => c.go(to, { cell: t.name })}>{v}{mode === "p" ? "%" : ""}</button> : <span className="dsc-na" aria-label="none">·</span>}</td>;
        };
        const on = rows.filter((r) => !shown.has(r.th)).length, ov = mode === "n" ? on : pctOf(on, rows.length);
        return <tr key={g}><th scope="row" className="rowh"><Link to={to}>{g}</Link></th>
          {spec.map((t, j) => cell(t, j === 0 ? "dsc-gs" : undefined))}
          <td className="oth">{on ? <span className="dw-ho" aria-label={`${on} ${g} companies in the other themes`}>{ov}{mode === "p" ? "%" : ""}</span> : <span className="dsc-na" aria-label="none">·</span>}</td>
          {broad.map((t, j) => cell(t, j === 0 ? "dsc-gs" : undefined))}<td className="dsc-gs tot">{rows.length}</td></tr>;
      })}</tbody></table></div>
  </>;
}
/** One industry row: the columns of SPEC §7 (Industry with "sector · macro sector", Companies, Largest specific theme, 3-month median, Long-term uptrend,
 *  Sector Rotation with "rank N of 37 · W wks", Sector Pulse). */
function IndRow({ ind, rows, sub = true, cls }: { ind: string; rows: DRow[]; sub?: boolean; cls?: string }) {
  const c = useDsc(), st = stat(rows), ro = indReading(rows), theme = (t: string) => c.d.board?.themes.find((x) => x.name === t);
  const ts = count(rows, (r) => r.th), tt = ts.find(([x]) => !theme(x)?.broad);
  return <tr className={cls}><td className="indc"><Link className="rowa" to={industryPath(ind)}>{ind}</Link>{sub && ro?.sct ? <small>{ro.sct} · {ro.mac}</small> : null}</td>
    <td className="r num dsc-gs">{rows.length}</td>
    <td>{tt ? <><Link className="dsc-tl" to={themePath(tt[0])}>{theme(tt[0])?.short ?? tt[0]}</Link> <span className="dsc-na">{tt[1]}</span></> : <span className="dsc-na">Broad groups only</span>}</td>
    <td className={"r num dsc-gs " + tone(st.m3)}>{pct(st.m3)}</td>
    <td className="r num">{c.prismOpen ? `${st.up} of ${st.n}` : <Locked />}</td>
    <td className="rotc dsc-gs"><RotChip cc={ro?.cc ?? null} cn={ro?.cn} />{ro && <RankLine r={ro} ind={ind} />}</td>
    <td><PulseChip name={ro?.pulse ?? null} /></td></tr>;
}
/** Developer file 53: the industries table's columns in three named groups over the column names, a divider where each starts (as in the company table). */
export const IND_GROUPS = ["Its companies in Discover", "Their price moves", "The industry's readings"];
const IND_HEAD = (first: string) => <>
  <tr className="dsc-grp"><th scope="col" className="indc" />{IND_GROUPS.map((g) => <th key={g} scope="colgroup" colSpan={2} className="dsc-gs"><span>{g}</span></th>)}</tr>
  <tr className="dsc-cols"><th scope="col">{first}</th><th scope="col" className="r dsc-gs">Companies</th><th scope="col">Largest specific theme <I k="largest" /></th>
  <th scope="col" className="r dsc-gs">3-month median <I k="median" /></th><th scope="col" className="r">Long-term uptrend <I k="uptrend" /></th>
  <th scope="col" className="dsc-gs">Sector Rotation <I k="corner" /></th><th scope="col">Sector Pulse <I k="pulse" /></th></tr></>;
function IndustriesTable({ rows }: { rows: DRow[] }) {
  const c = useDsc(), box = useStickyHead();
  const [sort, setSort] = useState<ISort>("n");
  const inds = useMemo(() => { const m = new Map<string, DRow[]>(); rows.forEach((r) => { if (r.ind) m.set(r.ind, [...(m.get(r.ind) ?? []), r]); }); return [...m.entries()]; }, [rows]);
  const key: Record<ISort, (x: [string, DRow[]]) => number> = {
    n: (x) => x[1].length, m3: (x) => stat(x[1]).m3 ?? -999, up: (x) => (x[1].length ? stat(x[1]).up / x[1].length : -1), rk: (x) => -(indReading(x[1])?.rk ?? 999),
  };
  const list = inds.slice().sort((a, b) => key[sort](b) - key[sort](a) || a[0].localeCompare(b[0]));
  return <>
    <div className="dsc-toolbar"><p>{list.length} of NSE’s 59 industries have a company in Discover <I k="inds" />.</p>
      <label>Sort by <select value={sort} onChange={(e) => setSort(e.target.value as ISort)}><option value="n">Most companies</option><option value="m3">Best 3-month median</option>
        <option value="up" disabled={!c.prismOpen}>{c.prismOpen ? "Most in a long-term uptrend" : "Most in a long-term uptrend (Gold)"}</option><option value="rk">Sector Rotation rank</option></select></label></div>
    <div className="dsc-tw dsc-stick" ref={box}><table className="dsc-ind"><thead>{IND_HEAD("Industry")}</thead><tbody>{list.map(([i, r]) => <IndRow key={i} ind={i} rows={r} />)}</tbody></table></div>
    <ReadingsNote />
  </>;
}

/** A macro sector page (/discover/sectors/<macro>) or a sector page (/discover/sectors/<macro>/<sector>). */
export function MacroPage({ m, sc }: { m: string; sc?: string }) {
  const c = useDsc();
  const rows = useMemo(() => c.d.rows.filter((r) => r.mac === m && (!sc || r.sct === sc)), [c.d.rows, m, sc]);
  const name = sc ?? m, s = stat(rows), tl = count(rows, (r) => r.th);
  const inds = count(rows, (r) => r.ind), secs = count(rows, (r) => r.sct);
  const theme = (t: string) => c.d.board?.themes.find((x) => x.name === t);
  const S = c.T(""), cell = S.cell, box = useStickyHead();
  const lead = sc ? `${s.n} ${s.n === 1 ? "company" : "companies"} in ${inds.length} ${inds.length === 1 ? "industry" : "industries"}, placed in ${tl.length} ${tl.length === 1 ? "theme" : "themes"}.`
    : `${s.n} ${s.n === 1 ? "company" : "companies"} in ${secs.length} ${secs.length === 1 ? "sector" : "sectors"} and ${inds.length} ${inds.length === 1 ? "industry" : "industries"}, placed in ${tl.length} ${tl.length === 1 ? "theme" : "themes"}.`;
  const indRows = (list: DRow[]) => count(list, (r) => r.ind).map(([i]) => [i, list.filter((r) => r.ind === i)] as [string, DRow[]]);
  return <>
    <Crumb trail={sc ? [[VIEW_PATH.sectors, "Sectors"], [macroPath(m), m]] : [[VIEW_PATH.sectors, "Sectors"]]} here={name} />
    <div className="dsc-dh"><div><p className="dsc-kind">{sc ? "Sector" : "Macro sector"} · NSE</p><h2>{name}</h2><p>{lead}</p></div><div className="dsc-dha"><Jump /></div></div>
    <FourKpis rows={rows} />
    <div className="dsc-panel dsc-mb"><h3>{sc ? "Industries in this sector" : "Sectors and industries"}</h3>
      <div className="dsc-tw dsc-stick" ref={box}><table className="dsc-ind"><thead>{IND_HEAD(sc ? "Industry" : "Sector › industry")}</thead>
        <tbody>{sc ? indRows(rows).map(([i, r]) => <IndRow key={i} ind={i} rows={r} sub={false} />)
          : secs.map(([sct]) => { const sr = rows.filter((r) => r.sct === sct), st = stat(sr); return [
            <tr key={"s-" + sct} className="dsc-secrow"><td className="indc"><Link className="rowa" to={sectorPath(m, sct)}>{sct}</Link><small>{((n) => `${n} ${n === 1 ? "industry" : "industries"}`)(new Set(sr.map((r) => r.ind).filter(Boolean)).size)}</small></td>
              <td className="r num dsc-gs">{sr.length}</td><td /><td className={"r num dsc-gs " + tone(st.m3)}>{pct(st.m3)}</td><td className="r num">{c.prismOpen ? `${st.up} of ${st.n}` : <Locked />}</td><td className="dsc-gs" /><td /></tr>,
            ...indRows(sr).map(([i, r]) => <IndRow key={i} ind={i} rows={r} sub={false} cls="dsc-indrow" />)]; })}</tbody></table></div>
      <ReadingsNote /></div>
    <div className="dsc-panel dsc-mb"><h3>Themes in this {sc ? "sector" : "macro sector"} <I k="themesin" /></h3>
      <HBars items={tl.map(([t, n]) => [t, n, theme(t)?.label ?? t])} unit="themes" picked={cell}
        onPick={(t) => { c.setT("", { cell: cell === t ? null : t, page: 0 }); if (cell !== t) scrollToTable(); }} /></div>
    <CompanyTable title={"Companies in " + name} base={rows} />
  </>;
}
/** An industry page (/discover/industries/<industry>), new in the 20 Nov pack. */
export function IndustryPage({ ind }: { ind: string }) {
  const c = useDsc();
  const rows = useMemo(() => c.d.rows.filter((r) => r.ind === ind), [c.d.rows, ind]);
  const ro = indReading(rows), mac = ro?.mac ?? null, sct = ro?.sct ?? null, tl = count(rows, (r) => r.th), S = c.T(""), cell = S.cell;
  const theme = (t: string) => c.d.board?.themes.find((x) => x.name === t);
  const trail: [string, string][] = [[VIEW_PATH.sectors, "Sectors"], ...(mac ? [[macroPath(mac), mac] as [string, string]] : []), ...(mac && sct ? [[sectorPath(mac, sct), sct] as [string, string]] : [])];
  return <>
    <Crumb trail={trail} here={ind} />
    <div className="dsc-dh"><div><p className="dsc-kind">Industry · NSE</p><h2>{ind}</h2><p>{rows.length} {rows.length === 1 ? "company" : "companies"}, placed in {tl.length} {tl.length === 1 ? "theme" : "themes"}.</p></div><div className="dsc-dha"><Jump /></div></div>
    <FourKpis rows={rows} />
    <div className="dsc-two">
      <div className="dsc-panel dsc-endp"><h3>This industry today</h3>
        <dl className="dsc-dl">
          <dt>Sector Rotation <I k="corner" /></dt><dd><RotChip cc={ro?.cc ?? null} cn={ro?.cn} />{ro && <RankLine r={ro} ind={ind} />}</dd>
          <dt>Sector Pulse <I k="pulse" /></dt><dd><PulseChip name={ro?.pulse ?? null} /></dd>
          <dt>Sector</dt><dd>{mac && sct ? <><Link to={sectorPath(mac, sct)}>{sct}</Link><small>in {mac}</small></> : <span className="dsc-na">Not classified</span>}</dd>
        </dl>
        <p className="dsc-foot dsc-end">Readings of {c.d.rotLabel ?? (fmtDate(c.d.rotDate) || "the latest week")}.<Stale date={c.d.rotDate} /></p></div>
      <div className="dsc-panel"><h3>Themes in this industry <I k="themesin" /></h3>
        <HBars items={tl.map(([t, n]) => [t, n, theme(t)?.label ?? t])} unit="themes" picked={cell}
          onPick={(t) => { c.setT("", { cell: cell === t ? null : t, page: 0 }); if (cell !== t) scrollToTable(); }} /></div>
    </div>
    <CompanyTable title={"Companies in " + ind} base={rows} hideCls />
  </>;
}

export function AllView() {
  const c = useDsc();
  return <><div className="dsc-toolbar"><p>Every company placed in Discover. Use the ready-made views and filters to narrow it down.</p></div><CompanyTable title="All companies" base={c.d.rows} /></>;
}

// ------------------------------------------------------------------------------------------------ Your names in Discover (§2)
export function YourNames() {
  const c = useDsc();
  const [tab, setTab] = useState<"held" | "watch">("held");
  const [min, setMin] = useState(() => { try { return localStorage.getItem("finlit-dsc-mine-min") === "1"; } catch { return false; } });
  const [all, setAll] = useState(false);
  if (!c.signedIn) return <section className="dsc-mine dsc-card" aria-labelledby="dsc-mine-h"><div className="dsc-mineh"><h2 id="dsc-mine-h">Your names in Discover <I k="mine" /></h2></div>
    <p className="dsc-minesum"><Link to="/login?next=%2Fdiscover">Sign in</Link> to see where your portfolio and watchlist names sit in these themes.</p></section>;
  const list = tab === "held" ? c.held : c.watched;
  const placed = list.filter((s) => c.by.has(s)).map((s) => c.by.get(s)!).sort((a, b) => evBiz(b) - evBiz(a) || (b.pr ?? 0) - (a.pr ?? 0));
  const notp = list.filter((s) => !c.by.has(s));
  const pH = c.held.filter((s) => c.by.has(s)).length, pW = c.watched.filter((s) => c.by.has(s)).length;
  const hide = () => { const v = !min; setMin(v); try { localStorage.setItem("finlit-dsc-mine-min", v ? "1" : "0"); } catch { /* private mode */ } };
  const open = (r: DRow) => { c.toggleOpen(r.s, true); c.go(themePath(r.th), { q: r.n }); scrollToTable(); };
  return <section className={"dsc-mine dsc-card" + (min ? " min" : "")} aria-labelledby="dsc-mine-h">
    <div className="dsc-mineh"><h2 id="dsc-mine-h">Your names in Discover <I k="mine" /></h2>
      <div className="right"><div className="dsc-seg" role="tablist" aria-label="Which list">
        <button type="button" role="tab" aria-selected={tab === "held"} onClick={() => setTab("held")}>Portfolio<span className="n">{c.held.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === "watch"} onClick={() => setTab("watch")}>Watchlist<span className="n">{c.watched.length}</span></button></div>
        <button type="button" className="dsc-btn sm" aria-expanded={!min} onClick={hide}>{min ? "Show ▾" : "Hide ▴"}</button></div></div>
    <p className="dsc-minesum">{pH} of your {c.held.length} portfolio holdings and {pW} of your {c.watched.length} watchlist names are placed in a theme.{tab === "watch" && !min ? " Add any company with ☆ in its details." : ""}</p>
    {!min && <div className="dsc-minebody">
      {placed.length ? <><div className={"dsc-mg" + (all ? "" : " clip")}>{placed.map((r) => {
        const other = tab === "held" ? (c.isWatched(r.s) ? <span className="dsc-tag wl">Watchlist too</span> : null) : (c.isHeld(r.s) ? <span className="dsc-tag pf">In portfolio</span> : null);
        const t = c.d.board?.themes.find((x) => x.name === r.th);
        return <div key={r.s} className="dsc-mc"><div className="t1"><b title={r.n}>{short(r.n)}</b><small>{/^\d{6}$/.test(r.s) ? "BSE " + r.s : r.s}</small></div>
          <div className="t2"><Link className="dsc-tl" to={themePath(r.th)}>{t?.short ?? r.th}</Link><Stage st={r.st} />{other}</div>
          <div className="t3"><Prism r={r} locked={!c.prismOpen} /><Trend lt={r.lt} locked={!c.prismOpen} /><span className={"num " + tone(r.r3m)}>3M {pct(r.r3m)}</span></div>
          <div className="t4"><Evs r={r} max={3} none="No event filing in 90 days" /><button type="button" className="dsc-mini" onClick={() => open(r)}>Details ▸</button></div></div>;
      })}</div>{placed.length > 3 && !all && <button type="button" className="dsc-btn dsc-phone" onClick={() => setAll(true)}>Show all {placed.length}</button>}</>
        : <p className="dsc-empty">{list.length ? "None of these names is placed in a theme yet." : tab === "held" ? "Your portfolio has no shares yet." : "Your watchlist is empty. Add any company with ☆ in its details."}</p>}
      {notp.length > 0 && <details className="dsc-np"><summary>Not placed yet ({notp.length}) <span className="dsc-npn">{notp.map((s) => short(c.d.uni.get(s)?.name ?? s)).join(", ")}</span></summary>
        <ul>{notp.map((s) => {
          const u = c.d.uni.get(s), pr = u?.prism_final, info = [u?.nse_industry ?? u?.sector, pr != null ? `Prism ${Math.round(pr)} ${u?.prism_label ? u.prism_label.charAt(0) + u.prism_label.slice(1).toLowerCase() : ""}`.trim() : null,
            u?.return_1y != null ? `1 year ${pct(u.return_1y)}` : null].filter(Boolean).join(" · ");
          return <li key={s}><b>{short(u?.name ?? s)}</b> · {/^\d{6}$/.test(s) ? "BSE " + s : s}{info ? <small>{info}</small> : null}<small>No theme found in its newest investor presentation, or none read yet.</small></li>;
        })}</ul></details>}
    </div>}
  </section>;
}
