// Task #245 (19 Nov 2026, "make the UI like this for discovery tab", three screenshots): the /discovery page as the team drew it.
//   Themes   a bar (By theme / By sector, Find a theme, Sort), chips (All themes, Positive tone, Recent filings), theme cards (count, tone chip,
//            View companies, Details) and "Show all N themes".
//   Theme    Find a company, Sector, Sort, "How far along is the company?" stage chips, company cards (tone, filings, latest presentation, main
//            topics, Read presentation, Company report, What they say).
//   Sectors  sector cards (count, top themes, View companies, All themes).
// Data: GET /api/discovery (backend finlit/discovery), the same as the FinLit AI panel's compact Discovery (components/AskDiscovery), which is unchanged.
// Describes what companies say about themselves; never a pick. Styles: discovery/discovery.css (class prefix dsb-).
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import { Icon } from "../lib/icons";
import type { Discovery, DiscoveryCompany, DiscoveryTheme } from "../components/AskDiscovery";
import { SECTOR_ABOUT, STAGE_ABOUT, STAGES, THEME_ABOUT } from "./text";
import "./discovery.css";

export type ThemeTone = { label: "Positive" | "Mixed" | "Negative" | null; positive: number; mixed: number; negative: number; rated: number };
export type BoardTheme = DiscoveryTheme & { tone?: ThemeTone };
export type View = "themes" | "sectors";
export type Go = (to: { theme?: string | null; sector?: string | null; view?: View }) => void;

export const useDiscovery = () => useQuery({ queryKey: ["discovery"], queryFn: () => apiGet<Discovery>("/api/discovery"), staleTime: 10 * 60_000 });

const n0 = (n: number) => n.toLocaleString("en-IN");
const fmtDate = (d: string | null) => (d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
/** Only the exchanges' own archive links are opened from here (the backend reads nothing else either). */
const safeDoc = (u: string | null) => !!u && /^https:\/\/([a-z0-9-]+\.)*(nseindia\.(com|in)|bseindia\.com)\//i.test(u);
const STAGE_CLASS: Record<string, string> = { Operating: "op", "Under execution": "ex", Planned: "pl", "MoU / pilot": "mou" };
const THEMES_SHOWN = 8, COMPANIES_SHOWN = 12;
const toneOf = (t: BoardTheme) => t.tone?.label ?? null;
const shareText = (t: ThemeTone) => `${t.positive} of ${t.rated} ${t.rated === 1 ? "presentation reads" : "presentations read"} positive`;

function Sel({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return <label className="dsb-sel"><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}>{children}</select></label>;
}
function Find({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="dsb-find"><Icon name="search" /><input type="search" placeholder={label} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
function Toggle({ view, go }: { view: View; go: Go }) {
  return <div className="dsb-mode" role="tablist" aria-label="Group Discovery">
    {(["themes", "sectors"] as View[]).map((v) => <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => go({ view: v, theme: null, sector: null })}>{v === "themes" ? "By theme" : "By sector"}</button>)}
  </div>;
}
function ToneChip({ t }: { t: BoardTheme }) {
  const l = toneOf(t);
  if (!l) return <span className="dsb-tone na" title="No presentation in this theme has enough words to read its tone yet">No tone yet</span>;
  return <span className={"dsb-tone " + l.toLowerCase()} title={t.tone ? shareText(t.tone) : undefined}>{l} tone</span>;
}
function Notes({ d }: { d: Discovery }) {
  return <><p className="dsb-note"><Icon name="info" /> {d.caution}</p><p className="dsb-method">{d.method}</p></>;
}

// ------------------------------------------------------------------------------------------------ themes
type ThemeSort = "companies" | "tone" | "filings" | "name";
export function ThemesView({ d, go }: { d: Discovery; go: Go }) {
  const [q, setQ] = useState(""), [sort, setSort] = useState<ThemeSort>("companies"), [chip, setChip] = useState<"all" | "positive" | "filings">("all"), [all, setAll] = useState(false);
  const themes = d.themes as BoardTheme[];
  const pos = themes.filter((t) => toneOf(t) === "Positive").length, fil = themes.filter((t) => (t.news?.filings ?? 0) > 0).length;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const xs = themes.filter((t) => (chip === "all" || (chip === "positive" ? toneOf(t) === "Positive" : (t.news?.filings ?? 0) > 0))
      && (!s || t.name.toLowerCase().includes(s) || (THEME_ABOUT[t.name] ?? "").toLowerCase().includes(s)));
    const share = (t: BoardTheme) => (t.tone?.rated ? t.tone.positive / t.tone.rated : -1);
    return xs.sort((a, b) => (sort === "name" ? 0 : sort === "tone" ? share(b) - share(a) : sort === "filings" ? (b.news?.filings ?? 0) - (a.news?.filings ?? 0) : 0)
      || (sort === "name" ? a.name.localeCompare(b.name) : b.primary - a.primary || b.secondary - a.secondary || a.name.localeCompare(b.name)));
  }, [themes, q, sort, chip]);
  const shown = all || q.trim() ? list : list.slice(0, THEMES_SHOWN);
  return (
    <div className="dsb">
      <div className="dsb-bar"><Toggle view="themes" go={go} /><Find label="Find a theme" value={q} onChange={setQ} />
        <Sel label="Sort" value={sort} onChange={(v) => setSort(v as ThemeSort)}><option value="companies">Most companies</option><option value="tone">Most positive tone</option>
          <option value="filings">Most recent filings</option><option value="name">Name, A to Z</option></Sel></div>
      <div className="dsb-row">
        <p className="dsb-chips" role="group" aria-label="Show">
          {([["all", `All themes (${themes.length})`], ["positive", `Positive tone (${pos})`], ["filings", `Recent filings (${fil})`]] as const).map(([k, l]) =>
            <button key={k} type="button" aria-pressed={chip === k} onClick={() => { setChip(k); setAll(false); }}>{l}</button>)}
        </p>
        <p className="dsb-count" aria-live="polite">Showing {shown.length} of {list.length} {list.length === 1 ? "theme" : "themes"}</p>
      </div>
      {!d.companies && <p className="dsb-empty">No presentation has been read yet. Discovery reads every company's newest investor presentation each night, so the themes fill in from the next run.</p>}
      {list.length === 0 && d.companies > 0 && <p className="dsb-empty">No theme matches “{q.trim()}”{chip !== "all" ? " with this filter" : ""}.</p>}
      <ul className="dsb-grid" aria-label="Discovery themes">{shown.map((t) => <ThemeCard key={t.name} t={t} go={go} />)}</ul>
      {!all && !q.trim() && list.length > THEMES_SHOWN && <p className="dsb-more"><button type="button" onClick={() => setAll(true)}>Show all {list.length} themes</button></p>}
      <Notes d={d} />
    </div>);
}

function ThemeCard({ t, go }: { t: BoardTheme; go: Go }) {
  const [open, setOpen] = useState(false);
  const stages = STAGES.filter((s) => t.stages?.[s]).map((s) => `${s} ${t.stages[s]}`);
  const secs = Object.entries(t.sectors ?? {}).slice(0, 3);
  const id = "dsb-d-" + t.name.replace(/\W+/g, "-");
  return (
    <li className="dsb-card dsb-tc">
      <h3>{t.name}</h3>
      {THEME_ABOUT[t.name] && <p className="dsb-about">{THEME_ABOUT[t.name]}</p>}
      <p className="dsb-big"><b>{n0(t.primary)}</b> {t.primary === 1 ? "company" : "companies"}</p>
      {t.primary === 0 && <p className="dsb-sub">{t.secondary ? `None has it as the main theme yet; ${t.secondary} more mention it.` : "No presentation talks about it enough yet."}</p>}
      <p><ToneChip t={t} /></p>
      <div className="dsb-acts">
        <button type="button" className="dsb-btn on" onClick={() => go({ theme: t.name, sector: null })} disabled={!t.primary && !t.secondary && !t.news?.filings}>View companies</button>
        <button type="button" className="dsb-link" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>Details <span className="dsb-chev" aria-hidden="true" /></button>
      </div>
      {open && <dl className="dsb-dl" id={id}>
        {t.tone?.rated ? <><dt>Tone</dt><dd>{shareText(t.tone)}{t.tone.negative ? `, ${t.tone.negative} negative` : ""}</dd></> : null}
        {stages.length > 0 && <><dt>How far along</dt><dd>{stages.join(" · ")}</dd></>}
        {secs.length > 0 && <><dt>Main sectors</dt><dd>{secs.map(([s, n]) => `${s} ${n}`).join(" · ")}</dd></>}
        <dt>Exchange filings, last 90 days</dt><dd>{t.news?.filings ? `${n0(t.news.filings)} ${t.news.filings === 1 ? "filing" : "filings"} · ${t.news.positive} positive · ${t.news.negative} negative` : "None name this theme"}</dd>
        {t.secondary > 0 && <><dt>Also mention it</dt><dd>{n0(t.secondary)} more {t.secondary === 1 ? "company" : "companies"}</dd></>}
        {t.preview && t.preview.length > 0 && <><dt>First names</dt><dd>{t.preview.join(", ")}</dd></>}
      </dl>}
    </li>);
}

// ------------------------------------------------------------------------------------------------ sectors
type SectorSort = "companies" | "themes" | "name";
export function SectorsView({ d, go }: { d: Discovery; go: Go }) {
  const [q, setQ] = useState(""), [sort, setSort] = useState<SectorSort>("companies");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const xs = Object.entries(d.bySector ?? {}).map(([name, ts]) => ({ name, themes: Object.entries(ts), n: Object.values(ts).reduce((a, b) => a + b, 0) }))
      .filter((x) => !s || x.name.toLowerCase().includes(s) || x.themes.some(([t]) => t.toLowerCase().includes(s)));
    return xs.sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "themes" ? b.themes.length - a.themes.length || b.n - a.n : b.n - a.n || a.name.localeCompare(b.name)));
  }, [d.bySector, q, sort]);
  return (
    <div className="dsb">
      <div className="dsb-bar"><Toggle view="sectors" go={go} /><Find label="Find a sector or theme" value={q} onChange={setQ} />
        <Sel label="Sort" value={sort} onChange={(v) => setSort(v as SectorSort)}><option value="companies">Most companies</option><option value="themes">Most themes</option><option value="name">Name, A to Z</option></Sel></div>
      <p className="dsb-lead">Each company sits in its NSE sector. Pick a sector to see which themes its companies talk about.</p>
      {list.length === 0 && <p className="dsb-empty">{Object.keys(d.bySector ?? {}).length ? `No sector or theme matches “${q.trim()}”.` : "No company placed yet."}</p>}
      <ul className="dsb-grid dsb-wide" aria-label="Discovery by sector">{list.map((s) => <SectorCard key={s.name} s={s} go={go} />)}</ul>
      <Notes d={d} />
    </div>);
}

function SectorCard({ s, go }: { s: { name: string; themes: [string, number][]; n: number }; go: Go }) {
  const [open, setOpen] = useState(false);
  const sec = s.name === "Not classified" ? null : s.name;
  const rows = open ? s.themes : s.themes.slice(0, 3);
  const id = "dsb-s-" + s.name.replace(/\W+/g, "-");
  return (
    <li className="dsb-card dsb-sc">
      <h3>{s.name}</h3>
      {SECTOR_ABOUT[s.name] && <p className="dsb-about">{SECTOR_ABOUT[s.name]}</p>}
      <p className="dsb-big"><b>{n0(s.n)}</b> {s.n === 1 ? "company" : "companies"}</p>
      <p className="dsb-k">{open ? "All themes" : "Top themes"}</p>
      <ul className="dsb-tops" id={id}>{rows.map(([t, n]) => <li key={t}><button type="button" onClick={() => go({ theme: t, sector: sec })}><span>{t}</span><b>{n0(n)}</b></button></li>)}</ul>
      <div className="dsb-acts">
        <button type="button" className="dsb-btn on" onClick={() => s.themes[0] && go({ theme: s.themes[0][0], sector: sec })} disabled={!s.themes.length}>View companies</button>
        {s.themes.length > 3 && <button type="button" className="dsb-link" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{open ? "Top themes" : `All themes (${s.themes.length})`} <span className="dsb-chev" aria-hidden="true" /></button>}
      </div>
    </li>);
}

// ------------------------------------------------------------------------------------------------ one theme
type CoSort = "tone" | "match" | "latest" | "filings" | "name";
const coSorts: Record<CoSort, (a: DiscoveryCompany, b: DiscoveryCompany) => number> = {
  tone: (a, b) => (b.tone?.score ?? -9) - (a.tone?.score ?? -9),
  match: (a, b) => (b.score ?? 0) - (a.score ?? 0),
  latest: (a, b) => (b.document.date ?? "").localeCompare(a.document.date ?? ""),
  filings: (a, b) => (b.filings?.count ?? 0) - (a.filings?.count ?? 0),
  name: () => 0,
};

export function ThemeView({ d, theme, sector, go }: { d: Discovery; theme: string; sector: string | null; go: Go }) {
  const qs = `?theme=${encodeURIComponent(theme)}${sector ? `&sector=${encodeURIComponent(sector)}` : ""}`;
  const one = useQuery({ queryKey: ["discovery", theme, sector], queryFn: () => apiGet<Discovery>(`/api/discovery${qs}`), staleTime: 10 * 60_000 });
  const [q, setQ] = useState(""), [sort, setSort] = useState<CoSort>("tone"), [stage, setStage] = useState<string | null>(null), [limit, setLimit] = useState(COMPANIES_SHOWN), [why, setWhy] = useState(false);
  const base = d.themes.find((x) => x.name === theme) as BoardTheme | undefined;
  const t = one.data?.themes.find((x) => x.name === theme) as BoardTheme | undefined;
  const cos = useMemo(() => t?.companies ?? [], [t]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return cos.filter((c) => (!stage || c.stageLabel === stage) && (!s || (c.company ?? "").toLowerCase().includes(s) || c.symbol.toLowerCase().includes(s)))
      .sort((a, b) => coSorts[sort](a, b) || (a.company ?? a.symbol).localeCompare(b.company ?? b.symbol));
  }, [cos, q, sort, stage]);
  const reset = () => setLimit(COMPANIES_SHOWN);
  if (!base) return <div className="dsb"><p className="dsb-empty" role="alert">There is no theme called “{theme}”. <button type="button" className="dsb-link" onClick={() => go({ theme: null, sector: null })}>See all themes</button></p></div>;
  const stages = STAGES.filter((s) => t?.stages?.[s]);
  return (
    <div className="dsb">
      <div className="dsb-panel">
        <div className="dsb-bar">
          <Find label="Find a company" value={q} onChange={(v) => { setQ(v); reset(); }} />
          <Sel label="Sector" value={sector ?? ""} onChange={(v) => { setStage(null); reset(); go({ theme, sector: v || null }); }}>
            <option value="">All sectors ({n0(base.primary)})</option>
            {Object.entries(base.sectors ?? {}).filter(([s]) => s !== "Not classified").map(([s, n]) => <option key={s} value={s}>{s} ({n0(n)})</option>)}
          </Sel>
          <Sel label="Sort" value={sort} onChange={(v) => setSort(v as CoSort)}><option value="tone">Most positive tone</option><option value="match">Strongest match to the theme</option>
            <option value="latest">Latest presentation</option><option value="filings">Most exchange filings</option><option value="name">Name, A to Z</option></Sel>
        </div>
        <div className="dsb-stg">
          <p className="dsb-k">How far along is the company? <button type="button" className="dsb-link sm" aria-expanded={why} onClick={() => setWhy(!why)}>What do these mean?</button></p>
          {why && <dl className="dsb-dl dsb-why">{STAGE_ABOUT.map(([s, m]) => <div key={s}><dt><span className={"dsb-st " + (STAGE_CLASS[s] ?? "na")}>{s}</span></dt><dd>{m}</dd></div>)}</dl>}
          <p className="dsb-chips" role="group" aria-label="Stage">
            <button type="button" aria-pressed={!stage} onClick={() => { setStage(null); reset(); }}>All stages ({n0(cos.length)})</button>
            {stages.map((s) => <button key={s} type="button" aria-pressed={stage === s} onClick={() => { setStage(stage === s ? null : s); reset(); }}>{s} ({n0(t!.stages[s])})</button>)}
          </p>
        </div>
      </div>
      {one.isError && <p className="dsb-empty" role="alert">This theme could not be loaded just now. Please try again in a moment.</p>}
      {!one.data && !one.isError && <p className="dsb-empty" aria-busy="true">Loading the companies…</p>}
      {t && <>
        <p className="dsb-count dsb-left" aria-live="polite">Showing {Math.min(limit, list.length)} of {n0(list.length)} {list.length === 1 ? "company" : "companies"}</p>
        {cos.length === 0 && <p className="dsb-empty">No company's presentation has this as its main theme{sector ? ` in ${sector}` : ""} yet.</p>}
        {cos.length > 0 && list.length === 0 && <p className="dsb-empty">No company matches{q.trim() ? ` “${q.trim()}”` : ""}{stage ? ` at the stage ${stage}` : ""}.</p>}
        <ul className="dsb-cos" aria-label={`Companies: ${theme}`}>{list.slice(0, limit).map((c) => <CompanyCard key={c.symbol} c={c} />)}</ul>
        {list.length > limit && <p className="dsb-more"><button type="button" onClick={() => setLimit(limit + COMPANIES_SHOWN * 2)}>Show {Math.min(COMPANIES_SHOWN * 2, list.length - limit)} more</button></p>}
        {(t.alsoMentions?.length ?? 0) > 0 && <section className="dsb-card dsb-plain"><h3>Also mention {theme}</h3>
          <p className="dsb-also">{t.alsoMentions!.map((c, i) => <span key={c.symbol}>{i ? ", " : ""}<Link to={`/stocks/${encodeURIComponent(c.symbol)}`}>{c.company ?? c.symbol}</Link> <small>(main theme: {c.primary}; {c.stageLabel.toLowerCase()})</small></span>)}</p></section>}
        {(t.recentFilings?.length ?? 0) > 0 && <section className="dsb-card dsb-plain"><h3>Exchange filings that name {theme}, last 90 days</h3>
          <ul className="dsb-fil">{t.recentFilings!.map((f, i) => <li key={i}><span className={"dsb-dot " + (f.tone > 0 ? "pos" : f.tone < 0 ? "neg" : "neu")} role="img" aria-label={`Tone: ${f.tone > 0 ? "positive" : f.tone < 0 ? "negative" : "neutral"}`} />
            <span><b>{f.company ?? f.symbol}</b> · {f.eventLabel} · {fmtDate(f.date)}{f.stage ? ` · ${f.stage}` : ""}<small>{safeDoc(f.link) ? <a href={f.link!} target="_blank" rel="noopener noreferrer">{f.title}</a> : f.title}</small></span></li>)}</ul></section>}
        {(t.verify?.length ?? 0) > 0 && <details className="dsb-card dsb-plain dsb-verify"><summary>What to verify in the presentation</summary><ul>{t.verify!.map((v) => <li key={v}>{v}</li>)}</ul></details>}
      </>}
      <Notes d={one.data ?? d} />
    </div>);
}

export function CompanyCard({ c }: { c: DiscoveryCompany }) {
  const [open, setOpen] = useState(false), [topics, setTopics] = useState(false);
  const path = [c.sector.macro, c.sector.sector !== c.sector.macro ? c.sector.sector : null, c.sector.industry !== c.sector.sector ? c.sector.industry : null].filter(Boolean).join(" › ");
  const tone = c.tone?.label, ts = c.tone?.score;
  const f = c.filings ?? { count: 0, positive: 0, negative: 0 };
  const kws = topics ? c.keywords : c.keywords.slice(0, 3);
  const id = "dsb-w-" + c.symbol.replace(/\W+/g, "-");
  return (
    <li className="dsb-card dsb-co">
      <div className="dsb-coh">
        <div><h3><Link to={`/stocks/${encodeURIComponent(c.symbol)}`}>{c.company ?? c.symbol}</Link> <span className="dsb-sym">{c.symbol}</span></h3>
          <p className="dsb-path">{path || "NSE sector not given yet"}</p></div>
        <span className={"dsb-st " + (STAGE_CLASS[c.stageLabel] ?? "na")} title="The most advanced stage the company's own sentences on this theme show">{c.stageLabel}</span>
      </div>
      <dl className="dsb-cols">
        <div><dt>Tone of the presentation</dt><dd className={tone === "Positive" ? "pos" : tone === "Negative" ? "neg" : ""}>{tone ? <>{tone}{ts != null ? ` (${ts > 0 ? "+" : ts < 0 ? "−" : ""}${Math.abs(ts).toFixed(2)})` : ""}</> : "Not read yet"}</dd></div>
        <div><dt>Exchange filings, last 90 days</dt><dd>{f.count ? `${n0(f.count)} ${f.count === 1 ? "filing" : "filings"} · ${f.positive} positive · ${f.negative} negative` : "None in 90 days"}</dd></div>
        <div><dt>Latest presentation</dt><dd>{c.document.date ? fmtDate(c.document.date) : "Date not given"}{c.document.pages ? ` · ${c.document.pages} pages` : ""}</dd></div>
      </dl>
      {c.keywords.length > 0 && <div className="dsb-topics"><p className="dsb-k">Main topics</p><p className="dsb-tags">{kws.map((k) => <span key={k}>{k}</span>)}
        {c.keywords.length > 3 && <button type="button" className="dsb-link sm" aria-expanded={topics} onClick={() => setTopics(!topics)}>{topics ? "Fewer" : `+${c.keywords.length - 3} more`}</button>}</p></div>}
      <div className="dsb-acts">
        {safeDoc(c.document.link)
          ? <a className="dsb-btn on" href={c.document.link} target="_blank" rel="noopener noreferrer">Read presentation</a>
          : <span className="dsb-btn off" title="The exchange link for this presentation is not available">Read presentation</span>}
        <Link className="dsb-btn" to={`/stocks/${encodeURIComponent(c.symbol)}`}>Company report</Link>
        <button type="button" className="dsb-link dsb-end" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>What they say <span className="dsb-chev" aria-hidden="true" /></button>
      </div>
      {open && <div className="dsb-say" id={id}>
        {c.evidence.length > 0 ? <ul className="dsb-ev" aria-label="From the presentation">{c.evidence.map((e, i) => <li key={i}>“{e}”</li>)}</ul>
          : <p className="dsb-sub">The keywords appear, but no sentence with a figure (capacity, orders, revenue) was found.</p>}
        {c.secondary.length > 0 && <p className="dsb-sub">Also talks about: {c.secondary.join(", ")}</p>}
        {c.document.title && <p className="dsb-sub">From “{c.document.title}”{c.readAt ? `, read ${fmtDate(c.readAt.slice(0, 10))}` : ""}.</p>}
      </div>}
    </li>);
}
