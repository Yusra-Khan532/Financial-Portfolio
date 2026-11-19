// Task #251 (the 19 Nov Discover pack): the views of /discovery. Tabs Themes (opening) · What changed · Sectors · All companies; each theme, event and sector
// has its own page and address (#theme-..., #change-..., #sector-...) with a breadcrumb, so Back works and a link can be shared.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { prefs, usePrefs } from "../lib/prefs";
import { I } from "./Info";
import { useDsc } from "./ctx";
import { CompanyTable, Corner, Evs, Prism, Stage, Trend } from "./CompanyTable";
import { BRIEF_CARDS, CORNERS, EVENTS, RECORD_FROM, STAGES, STAGE_CLASS, evBiz, fmtDate, pct, short, slug, stat, tone, type BoardTheme, type Corner as CornerT, type DRow } from "./model";

const pctOf = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
function StageBar({ rows, tall }: { rows: DRow[]; tall?: boolean }) {
  const sg: Record<string, number> = {};
  rows.forEach((r) => { sg[r.st] = (sg[r.st] || 0) + 1; });
  return <div className={"dsc-bar" + (tall ? " tall" : "")} aria-hidden="true">{STAGES.map((k) => sg[k] ? <i key={k} className={"dsc-s-" + STAGE_CLASS[k]} style={{ flex: sg[k] }} /> : null)}</div>;
}
export function StageLegend({ rows }: { rows?: DRow[] }) {
  const sg: Record<string, number> = {};
  rows?.forEach((r) => { sg[r.st] = (sg[r.st] || 0) + 1; });
  return <div className="dsc-leg">{STAGES.filter((k) => !rows || sg[k]).map((k) => <span key={k}><i className={"dsc-s-" + STAGE_CLASS[k]} />{k}{rows ? <b> {sg[k]}</b> : null}</span>)}</div>;
}
const Kv = ({ l, v, cls }: { l: string; v: React.ReactNode; cls?: string }) => <span>{l} <b className={cls}>{v}</b></span>;
function Kpi({ l, v, i, small, cls }: { l: string; v: React.ReactNode; i?: Parameters<typeof I>[0]["k"]; small?: React.ReactNode; cls?: string }) {
  return <div className="dsc-kpi"><div className="l">{l}{i ? <I k={i} /> : null}</div><div className={"v " + (cls ?? "")}>{v}</div>{small ? <small>{small}</small> : null}</div>;
}
function Crumb({ to, label, here }: { to: string; label: string; here: string }) {
  return <nav className="dsc-crumb" aria-label="Breadcrumb"><a href={to}>{label}</a><span aria-hidden="true">›</span><span aria-current="page">{here}</span></nav>;
}
const Jump = () => <button type="button" className="dsc-btn" onClick={() => document.getElementById("dsc-tbl-top")?.scrollIntoView({ block: "start" })}>Companies ↓</button>;
const highest = (rows: DRow[]) => rows.filter((r) => r.pr != null).sort((a, b) => (b.pr ?? 0) - (a.pr ?? 0)).slice(0, 3).map((r) => short(r.n)).join(", ");

// ------------------------------------------------------------------------------------------------ Themes
type TSort = "n" | "m3" | "up" | "f";
function ThemeCard({ t, rows }: { t: BoardTheme; rows: DRow[] }) {
  const c = useDsc(), s = stat(rows), yours = rows.filter((r) => c.onList(r.s)).length, top = highest(rows);
  return <a className="dsc-cd" href={"#theme-" + slug(t.name)}>
    <div className="top"><h3>{t.label}</h3>{t.broad && <span className="dsc-flg">Broad</span>}</div>
    <div className="n">{s.n}<small>companies{t.also ? ` · ${t.also} more mention it` : ""}</small></div>
    <StageBar rows={rows} />
    <div className="dsc-kv"><Kv l="3-month median" v={pct(s.m3)} cls={tone(s.m3)} /><Kv l="1-year median" v={pct(s.m1y)} cls={tone(s.m1y)} />
      <Kv l="In a long-term uptrend" v={`${s.up} of ${s.n}`} /><Kv l="Filings, 90 days" v={t.news.filings} /></div>
    <div className="dsc-ex">{yours ? <span className="dsc-yours">{yours} of yours · </span> : null}{top ? `Highest Prism: ${top}` : c.prismOpen ? "No company here has a Prism score yet" : "Prism: part of Gold"}</div>
  </a>;
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
      <label>Sort by <select value={sort} onChange={(e) => setSort(e.target.value as TSort)}><option value="n">Most companies</option><option value="m3">3-month median</option><option value="up">Share in an uptrend</option><option value="f">Most filings, 90 days</option></select></label></div>
    <StageLegend />
    <div className="dsc-grid">{spec.map((t) => <ThemeCard key={t.name} t={t} rows={byTheme.get(t.name)!} />)}</div>
    {broad.length > 0 && <><div className="dsc-secth"><h3>Broad groups</h3><I k="broad" /></div>
      <div className="dsc-grid">{broad.map((t) => <ThemeCard key={t.name} t={t} rows={byTheme.get(t.name)!} />)}</div></>}
    {(zero.length > 0 || merged.length > 0) && <p className="dsc-foot">{zero.map((t) => `${t.label}: no company has it as its main theme yet; ${t.also} mention it. `).join("")}
      {merged.map(([m, into]) => `“${m}” is shown inside “${into}”. `).join("")}</p>}
  </>;
}
export function ThemePage({ theme }: { theme: string }) {
  const c = useDsc(), b = c.d.board!, t = b.themes.find((x) => x.name === theme)!;
  const rows = useMemo(() => c.d.rows.filter((r) => r.th === theme), [c.d.rows, theme]);
  const s = stat(rows), yours = rows.filter((r) => c.onList(r.s));
  const secs: Record<string, number> = {};
  rows.forEach((r) => { const k = r.mac ?? "Not classified"; secs[k] = (secs[k] || 0) + 1; });
  const sl = Object.entries(secs).sort((a, x) => x[1] - a[1]).slice(0, 6), smax = sl[0]?.[1] ?? 1;
  const fil = (b.tfil[theme] ?? []).slice(0, 6);
  const p = usePrefs(), id = slug(theme), following = p.followThemes.includes(id);
  const follow = () => prefs.set({ followThemes: following ? p.followThemes.filter((x) => x !== id) : [...p.followThemes, id] });
  return <>
    <Crumb to="#themes" label="Themes" here={t.label} />
    <div className="dsc-dh"><div><h2>{t.label}{t.broad && <><span className="dsc-flg">Broad</span><I k="broad" /></>}</h2>
      <p>{s.n} companies have this as their main theme{t.also ? <>, and {t.also} more mention it <I k="also" /></> : null}.</p></div>
      <div className="dsc-dha"><Jump />
        <button type="button" className="dsc-btn dsc-follow" aria-pressed={following} onClick={follow} title="Kept with your settings; FinLit does not send a message about a theme yet">{following ? "✓ Following" : "☆ Follow this theme"}</button></div></div>
    <div className="dsc-kpis">
      <Kpi l="Companies" v={s.n} small={yours.length ? `${yours.length} of yours` : c.signedIn ? "none of yours" : undefined} />
      <Kpi l="3-month median" i="median" v={pct(s.m3)} cls={tone(s.m3)} />
      <Kpi l="1-year median" v={pct(s.m1y)} cls={tone(s.m1y)} />
      <Kpi l="In a long-term uptrend" i="uptrend" v={s.up} small={`of ${s.n} (${pctOf(s.up, s.n)}%)`} />
      <Kpi l="Filings, 90 days" v={t.news.filings} small={`${t.news.positive} positive, ${t.news.negative} negative tone`} />
    </div>
    <div className="dsc-two">
      <div className="dsc-panel"><h3>Stages <I k="stage" /></h3><StageBar rows={rows} tall /><StageLegend rows={rows} />
        <h3>NSE sectors</h3><div className="dsc-hbars">{sl.map(([n, k]) => <div key={n} className="dsc-hb">
          {n === "Not classified" ? <span title={n}>{n}</span> : <a href={"#sector-" + slug(n)} title={n}>{n}</a>}<span className="t"><i style={{ width: `${(k / smax) * 100}%` }} /></span><b>{k}</b></div>)}</div></div>
      <div className="dsc-panel"><h3>What to check <I k="check" /></h3>
        {t.verify.length ? <ul>{t.verify.slice(0, 5).map((v) => <li key={v}>{v}</li>)}</ul> : <p className="dsc-na">No checklist for this theme yet.</p>}
        <h3 className="dsc-mt">Latest filings in this theme</h3>
        {fil.length ? <ul className="dsc-fl">{fil.map((f) => <li key={f.s + f.d + f.t}><b>{short(c.by.get(f.s)?.n ?? c.d.uni.get(f.s)?.name ?? f.n)}</b> · {f.t}<small>{fmtDate(f.d)} · {f.el}</small></li>)}</ul>
          : <p className="dsc-na">No tagged filing in the last 90 days.</p>}</div>
    </div>
    <CompanyTable title={"Companies in " + t.label} base={rows} />
  </>;
}

// ------------------------------------------------------------------------------------------------ What changed
export function EventsView() {
  const c = useDsc(), b = c.d.board!;
  const rec = [...EVENTS.slice(0, 5).map((e) => e.t), "Each theme"];
  const at = (m: number) => { const d = new Date(RECORD_FROM + "T00:00:00"); d.setMonth(d.getMonth() + m); return fmtDate(d.toISOString().slice(0, 10)); };
  return <>
    <div className="dsc-toolbar"><p>Companies with at least one such exchange filing in the last {b.days} days. A company can be in more than one group. <I k="filings" /></p></div>
    <div className="dsc-grid">{EVENTS.map((e) => {
      const rows = c.d.rows.filter((r) => r.ev[e.k]), s = stat(rows), yours = rows.filter((r) => c.onList(r.s)).length;
      const ex = rows.slice().sort((x, y) => (y.ev[e.k] - x.ev[e.k]) || ((y.pr ?? 0) - (x.pr ?? 0))).slice(0, 3).map((r) => short(r.n)).join(", ");
      return <a key={e.k} className="dsc-cd" href={"#change-" + e.k}><h3>{e.t}</h3><div className="n">{s.n}<small>companies · {b.days} days</small></div>
        <div className="dsc-kv"><Kv l="3-month median" v={pct(s.m3)} cls={tone(s.m3)} /><Kv l="In a long-term uptrend" v={`${s.up} of ${s.n}`} /></div>
        <div className="dsc-ex">{yours ? <span className="dsc-yours">{yours} of yours · </span> : null}{ex || "No such filing in this window"}</div></a>;
    })}</div>
    <div className="dsc-secth"><h3>From company briefs</h3><I k="brief" /></div>
    <div className="dsc-grid">{BRIEF_CARDS.map((x) => <a key={x.k} className="dsc-cd dashed" href={"#change-" + x.k}><div className="top"><h3>{x.t}</h3><span className="dsc-flg teal">From briefs</span></div>
      <div className="n">0<small>companies so far</small></div><div className="dsc-ex dsc-wrap">No full company brief with these items is published yet. They appear here, each with its page, as briefs are published.</div></a>)}</div>
    <div className="dsc-secth"><h3>How each group has done since companies joined it</h3><I k="record" /><span className="dsc-flg teal">Starts on launch</span></div>
    <div className="dsc-tw"><table className="dsc-rec"><thead><tr><th scope="col">Group</th><th scope="col" className="r">1 month later</th><th scope="col" className="r">3 months</th><th scope="col" className="r">6 months</th><th scope="col" className="r">12 months</th><th scope="col" className="r">Nifty 500, same days</th></tr></thead>
      <tbody>{rec.map((g) => <tr key={g}><td>{g}</td><td className="r dsc-na">from {at(1)}</td><td className="r dsc-na">{at(3)}</td><td className="r dsc-na">{at(6)}</td><td className="r dsc-na">{at(12)}</td><td className="r dsc-na">same dates</td></tr>)}</tbody></table></div>
    <p className="dsc-foot">The record starts on {fmtDate(RECORD_FROM)}: each figure shows once its date has passed.</p>
  </>;
}
export function EventPage({ k }: { k: string }) {
  const c = useDsc(), b = c.d.board!;
  const brief = BRIEF_CARDS.find((x) => x.k === k);
  if (brief) return <>
    <Crumb to="#what-changed" label="What changed" here={brief.t} />
    <div className="dsc-dh"><div><h2>{brief.t} <span className="dsc-flg teal">From briefs</span></h2><p>Each item comes from a full company brief, with its value, its date and the page of the filing it is on. More companies appear as briefs are written.</p></div></div>
    <div className="dsc-panel"><p className="dsc-na">No full company brief with these items is published yet.</p></div>
  </>;
  const e = EVENTS.find((x) => x.k === k)!;
  const rows = c.d.rows.filter((r) => r.ev[k]), s = stat(rows), lat = (b.efil[k] ?? []).slice(0, 6);
  return <>
    <Crumb to="#what-changed" label="What changed" here={e.t} />
    <div className="dsc-dh"><div><h2>{e.t}</h2><p>{s.n} companies {e.d} in the last {b.days} days. Sorted by how many such filings each made.</p></div><div className="dsc-dha"><Jump /></div></div>
    <div className="dsc-kpis"><Kpi l="Companies" v={s.n} /><Kpi l="3-month median" i="median" v={pct(s.m3)} cls={tone(s.m3)} /><Kpi l="1-year median" v={pct(s.m1y)} cls={tone(s.m1y)} />
      <Kpi l="In a long-term uptrend" i="uptrend" v={s.up} small={`of ${s.n}`} /></div>
    {lat.length > 0 && <div className="dsc-panel dsc-mb"><h3>Latest of these filings</h3><ul className="dsc-fl">{lat.map((f) => <li key={f.s + f.d + f.t}><b>{short(c.by.get(f.s)?.n ?? c.d.uni.get(f.s)?.name ?? f.n)}</b> · {f.t}<small>{fmtDate(f.d)} · {f.el}</small></li>)}</ul></div>}
    <CompanyTable title={"Companies with " + e.t.toLowerCase()} base={rows} defaultSort="ev" event={k} />
  </>;
}

// ------------------------------------------------------------------------------------------------ Sectors
const SECTOR_COLORS = ["var(--dsc-t1)", "var(--dsc-t2)", "var(--dsc-t3)"];
function cornersOf(rows: DRow[]) {
  const inds = new Map<string, CornerT | null>();
  rows.forEach((r) => { if (r.ind && !inds.has(r.ind)) inds.set(r.ind, r.cc); else if (r.ind && !inds.get(r.ind) && r.cc) inds.set(r.ind, r.cc); });
  const cc: Partial<Record<CornerT, number>> = {};
  inds.forEach((v) => { if (v) cc[v] = (cc[v] || 0) + 1; });
  return { n: inds.size, cc };
}
function SectorCard({ m, rows }: { m: string; rows: DRow[] }) {
  const c = useDsc(), s = stat(rows), th: Record<string, number> = {};
  rows.forEach((r) => { th[r.th] = (th[r.th] || 0) + 1; });
  const top = Object.entries(th).sort((a, b) => b[1] - a[1]), t3 = top.slice(0, 3), rest = rows.length - t3.reduce((a, x) => a + x[1], 0);
  const { n, cc } = cornersOf(rows), lab = (t: string) => c.d.board?.themes.find((x) => x.name === t)?.short ?? t;
  return <a className="dsc-cd" href={"#sector-" + slug(m)}><h3>{m}</h3><div className="n">{s.n}<small>companies · {n} {n === 1 ? "industry" : "industries"}</small></div>
    <div className="dsc-bar mid" aria-hidden="true">{t3.map(([t, k], i) => <i key={t} style={{ flex: k, background: SECTOR_COLORS[i] }} />)}{rest > 0 ? <i style={{ flex: rest, background: "var(--border)" }} /> : null}</div>
    <div className="dsc-leg">{t3.map(([t, k], i) => <span key={t}><i style={{ background: SECTOR_COLORS[i] }} />{lab(t)} {k}</span>)}</div>
    <div className="dsc-kv"><Kv l="3-month median" v={pct(s.m3)} cls={tone(s.m3)} /><Kv l="In a long-term uptrend" v={`${s.up} of ${s.n}`} /></div>
    <div className="dsc-rot"><span>Industries:</span>{(Object.keys(CORNERS) as CornerT[]).filter((k) => cc[k]).map((k) => <span key={k}><i className={"dsc-c-" + k} />{cc[k]} {CORNERS[k].toLowerCase()}</span>)}
      {!Object.keys(cc).length && <span>no Sector Rotation reading</span>}</div></a>;
}
export function SectorsView() {
  const c = useDsc(), b = c.d.board!;
  const [mode, setMode] = useState<"n" | "p">("n");
  const macs = useMemo(() => { const m = new Map<string, DRow[]>(); c.d.rows.forEach((r) => { if (r.mac) m.set(r.mac, [...(m.get(r.mac) ?? []), r]); }); return [...m.entries()].sort((a, x) => x[1].length - a[1].length); }, [c.d.rows]);
  const counts = new Map<string, number>(); c.d.rows.forEach((r) => counts.set(r.th, (counts.get(r.th) || 0) + 1));
  const cols = [...b.themes.filter((t) => !t.broad && counts.get(t.name)).sort((a, x) => (counts.get(x.name) || 0) - (counts.get(a.name) || 0)).slice(0, 10), ...b.themes.filter((t) => t.broad)];
  return <>
    <div className="dsc-toolbar"><p>NSE’s own sectors. Each card shows its three biggest themes, how its stocks have moved, and where its industries sit in Sector Rotation <I k="corner" />. Open one for its industries and companies.</p></div>
    <div className="dsc-grid">{macs.map(([m, r]) => <SectorCard key={m} m={m} rows={r} />)}</div>
    <div className="dsc-secth"><h3>Sector × theme map</h3></div>
    <div className="dsc-toolbar"><p>Where each sector’s companies sit across the largest themes. Click a number to list those companies.</p>
      <div className="dsc-seg" role="group" aria-label="Show"><button type="button" aria-pressed={mode === "n"} onClick={() => setMode("n")}>Companies</button><button type="button" aria-pressed={mode === "p"} onClick={() => setMode("p")}>% of the sector</button></div></div>
    <div className="dsc-tw"><table className="dsc-map"><thead><tr><th scope="col">Sector</th>{cols.map((t) => <th key={t.name} scope="col" title={t.label}>{t.short}</th>)}<th scope="col">All</th></tr></thead>
      <tbody>{macs.map(([m, rows]) => <tr key={m}><th scope="row" className="rowh"><a href={"#sector-" + slug(m)}>{m}</a></th>
        {cols.map((t) => {
          const n = rows.filter((r) => r.th === t.name).length, v = mode === "n" ? n : pctOf(n, rows.length), a = Math.min(0.85, (mode === "n" ? n : v) / 60);
          return <td key={t.name}>{n ? <button type="button" style={{ background: `color-mix(in srgb, var(--dsc-teal) ${Math.round(a * 100)}%, transparent)`, color: a > 0.45 ? "#fff" : undefined }}
            aria-label={`${n} ${m} companies in ${t.label}`} onClick={() => { c.setT("sector-" + slug(m), { cell: t.name, page: 0 }); c.go("#sector-" + slug(m)); }}>{v}{mode === "p" ? "%" : ""}</button> : <span className="dsc-na" aria-label="none">·</span>}</td>;
        })}<td className="tot">{rows.length}</td></tr>)}</tbody></table></div>
  </>;
}
export function SectorPage({ m }: { m: string }) {
  const c = useDsc();
  const rows = useMemo(() => c.d.rows.filter((r) => r.mac === m), [c.d.rows, m]);
  const s = stat(rows), inds = new Map<string, DRow[]>();
  rows.forEach((r) => { const k = r.ind ?? "Other"; inds.set(k, [...(inds.get(k) ?? []), r]); });
  const th: Record<string, number> = {};
  rows.forEach((r) => { th[r.th] = (th[r.th] || 0) + 1; });
  const tl = Object.entries(th).sort((a, b) => b[1] - a[1]), tmax = tl[0]?.[1] ?? 1;
  const theme = (t: string) => c.d.board?.themes.find((x) => x.name === t);
  const tKey = "sector-" + slug(m), cell = c.T(tKey).cell;
  return <>
    <Crumb to="#sectors" label="Sectors" here={m} />
    <div className="dsc-dh"><div><h2>{m}</h2><p>{s.n} companies in {inds.size} {inds.size === 1 ? "industry" : "industries"}, placed in {tl.length} themes.</p></div><div className="dsc-dha"><Jump /></div></div>
    <div className="dsc-kpis"><Kpi l="Companies" v={s.n} /><Kpi l="3-month median" i="median" v={pct(s.m3)} cls={tone(s.m3)} /><Kpi l="1-year median" v={pct(s.m1y)} cls={tone(s.m1y)} />
      <Kpi l="In a long-term uptrend" i="uptrend" v={s.up} small={`of ${s.n}`} /></div>
    <div className="dsc-panel dsc-mb"><h3>Industries in this sector</h3>
      <div className="dsc-tw"><table className="dsc-ind"><thead><tr><th scope="col">Industry</th><th scope="col" className="r">Companies</th><th scope="col">Sector Rotation <I k="corner" /></th><th scope="col" className="r">Rank <I k="rank" /></th>
        <th scope="col">Sector Pulse <I k="pulse" /></th><th scope="col" className="r">3-month median</th><th scope="col" className="r">Uptrend</th><th scope="col">Largest specific theme</th></tr></thead>
        <tbody>{[...inds.entries()].sort((a, b) => b[1].length - a[1].length).map(([i, rs]) => {
          const ro = rs.find((r) => r.cc) ?? rs.find((r) => r.pulse) ?? rs[0], st = stat(rs), t: Record<string, number> = {};
          rs.forEach((r) => { t[r.th] = (t[r.th] || 0) + 1; });
          const ts = Object.entries(t).sort((a, b) => b[1] - a[1]), tt = ts.find(([x]) => !theme(x)?.broad) ?? ts[0];
          return <tr key={i}><td>{i}</td><td className="r">{rs.length}</td><td><Corner r={ro} /></td><td className="r num">{ro.rk ? `${ro.rk} of ${ro.of}` : "−"}</td>
            <td>{ro.pulse ?? <span className="dsc-na">No reading</span>}</td><td className={"r num " + tone(st.m3)}>{pct(st.m3)}</td><td className="r num">{st.up} of {st.n}</td>
            <td>{tt ? <><a className="dsc-linkish" href={"#theme-" + slug(tt[0])}>{theme(tt[0])?.short ?? tt[0]}</a> <span className="dsc-na">{tt[1]}</span></> : null}</td></tr>;
        })}</tbody></table></div>
      <p className="dsc-foot">Sector Rotation and Sector Pulse readings of {c.d.rotLabel ?? (fmtDate(c.d.rotDate) || "the latest week")}. An industry with no reading has too few liquid stocks, or no NSE group.</p></div>
    <div className="dsc-panel dsc-mb"><h3>Themes in this sector</h3><div className="dsc-hbars">{tl.map(([t, k]) => <div key={t} className="dsc-hb">
      <button type="button" aria-pressed={cell === t} onClick={() => { c.setT(tKey, { cell: cell === t ? null : t, page: 0 }); document.getElementById("dsc-tbl-top")?.scrollIntoView({ block: "start" }); }}>{theme(t)?.label ?? t}</button>
      <span className="t"><i style={{ width: `${(k / tmax) * 100}%` }} /></span><b>{k}</b></div>)}</div></div>
    <CompanyTable title={"Companies in " + m} base={rows} />
  </>;
}

export function AllView() {
  const c = useDsc();
  return <><div className="dsc-toolbar"><p>Every company placed in Discover. Use the ready-made views and filters to narrow it down.</p></div><CompanyTable title="All companies" base={c.d.rows} /></>;
}

// ------------------------------------------------------------------------------------------------ Your names in Discover
export function YourNames() {
  const c = useDsc();
  const [tab, setTab] = useState<"held" | "watch">("held");
  const [min, setMin] = useState(() => { try { return localStorage.getItem("finlit-dsc-mine-min") === "1"; } catch { return false; } });
  const [all, setAll] = useState(false);
  if (!c.signedIn) return <section className="dsc-mine dsc-card" aria-labelledby="dsc-mine-h"><div className="dsc-mineh"><h2 id="dsc-mine-h">Your names in Discover <I k="mine" /></h2></div>
    <p className="dsc-minesum"><Link to="/login?next=%2Fdiscovery">Sign in</Link> to see where your portfolio and watchlist names sit in these themes.</p></section>;
  const list = tab === "held" ? c.held : c.watched;
  const placed = list.filter((s) => c.by.has(s)).map((s) => c.by.get(s)!).sort((a, b) => evBiz(b) - evBiz(a) || (b.pr ?? 0) - (a.pr ?? 0));
  const notp = list.filter((s) => !c.by.has(s));
  const pH = c.held.filter((s) => c.by.has(s)).length, pW = c.watched.filter((s) => c.by.has(s)).length;
  const hide = () => { const v = !min; setMin(v); try { localStorage.setItem("finlit-dsc-mine-min", v ? "1" : "0"); } catch { /* private mode */ } };
  const open = (r: DRow) => { c.setT("theme-" + slug(r.th), { q: r.n, page: 0 }); c.toggleOpen(r.s, true); c.go("#theme-" + slug(r.th)); };
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
          <div className="t2"><a className="dsc-linkish" href={"#theme-" + slug(r.th)}>{t?.short ?? r.th}</a><Stage st={r.st} />{other}</div>
          <div className="t3"><Prism r={r} locked={!c.prismOpen} /><Trend lt={r.lt} locked={!c.prismOpen} /><span className={"num " + tone(r.r3m)}>3M {pct(r.r3m)}</span></div>
          <div className="t4"><Evs r={r} none="No event filing in 90 days" /><button type="button" className="dsc-mini" onClick={() => open(r)}>Details ▸</button></div></div>;
      })}</div>{placed.length > 3 && !all && <button type="button" className="dsc-btn dsc-phone" onClick={() => setAll(true)}>Show all {placed.length}</button>}</>
        : <p className="dsc-empty">{list.length ? "None of these names is placed in a theme yet." : tab === "held" ? "Your portfolio has no shares yet." : "Your watchlist is empty. Add any company with ☆ in its details."}</p>}
      {notp.length > 0 && <details className="dsc-np"><summary>Not placed yet ({notp.length}) <span className="dsc-npn">{notp.map((s) => short(c.d.uni.get(s)?.name ?? s)).join(", ")}</span></summary>
        <ul>{notp.map((s) => {
          const u = c.d.uni.get(s), pr = u?.prism_final, info = [u?.sector, pr != null ? `Prism ${Math.round(pr)} ${u?.prism_label ? u.prism_label.charAt(0) + u.prism_label.slice(1).toLowerCase() : ""}`.trim() : null,
            u?.return_1y != null ? `1 year ${pct(u.return_1y)}` : null].filter(Boolean).join(" · ");
          return <li key={s}><b>{short(u?.name ?? s)}</b> · {/^\d{6}$/.test(s) ? "BSE " + s : s}{info ? <small>{info}</small> : null}<small>No theme found in its newest investor presentation, or none read yet.</small></li>;
        })}</ul></details>}
    </div>}
  </section>;
}
