import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import { Icon } from "../lib/icons";
import { codeText } from "../lib/companyLabel";

/** Discovery (task #221): companies grouped by the themes their newest investor presentation talks about (backend finlit/discovery, GET /api/discovery),
 *  bucketed as the Investor Presentation Keyword Directory (each keyword with its related terms and what to verify). Upgrade (owner, 18 Nov 2026):
 *  the stage the company's own sentences show (the directory's screening discipline), the tone of its words, every exchange filing of the last 90
 *  days by event, theme and tone, and NSE's sectors ("By sector", and a sector filter in a theme). Describes what companies say; never a pick. */
export type Filings = { count: number; positive: number; negative: number; events: Record<string, number> };
export type DiscoveryCompany = {
  symbol: string; company: string | null; primary: string; secondary: string[]; score: number | null; keywords: string[]; verify: string[]; evidence: string[]; hasFigures: boolean;
  stage: string | null; stageLabel: string; tone: { score: number | null; label: string | null };
  sector: { macro: string | null; sector: string | null; industry: string | null }; filings: Filings;
  document: { title: string | null; date: string | null; link: string; pages: number | null }; readAt: string | null;
};
export type Signal = { symbol: string; company?: string | null; date: string; event: string; eventLabel: string; tone: number; themes: string[]; stage?: string | null; title: string; link: string | null };
export type DiscoveryTheme = {
  name: string; primary: number; secondary: number; preview?: string[]; sectors: Record<string, number>; stages: Record<string, number>;
  news: { filings: number; positive: number; negative: number }; companies?: DiscoveryCompany[]; alsoMentions?: DiscoveryCompany[]; verify?: string[]; recentFilings?: Signal[];
};
export type Discovery = {
  themes: DiscoveryTheme[]; companies: number; read: number; statuses: Record<string, number>; updated: string | null; caution: string; method: string;
  sector: string | null; bySector: Record<string, Record<string, number>>;
};

const fmtDate = (d: string | null) => (d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
/** Only the exchanges' own archive links are opened from here (the backend reads nothing else either). */
const safeDoc = (u: string | null) => !!u && /^https:\/\/([a-z0-9-]+\.)*(nseindia\.(com|in)|bseindia\.com)\//i.test(u);
const plural = (n: number, one: string, many = one + "s") => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const toneWord = (t: number) => (t > 0 ? "positive" : t < 0 ? "negative" : "neutral");
const STAGE_CLASS: Record<string, string> = { Operating: "op", "Under execution": "ex", Planned: "pl", "MoU / pilot": "mou" };

function ToneDot({ t }: { t: number }) {
  return <span className={"aid-dot aid-" + toneWord(t)} role="img" aria-label={`Tone: ${toneWord(t)}`} />;
}

function FilingsLine({ f }: { f: { filings?: number; count?: number; positive: number; negative: number } }) {
  const n = f.filings ?? f.count ?? 0;
  if (!n) return <span>No exchange filing in 90 days</span>;
  return <span>{plural(n, "filing")} in 90 days: {f.positive} positive, {f.negative} negative tone</span>;
}

export function AskDiscovery({ onLeave }: { onLeave?: () => void }) {
  const [theme, setTheme] = useState<string | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [mode, setMode] = useState<"themes" | "sectors">("themes");
  const all = useQuery({ queryKey: ["discovery"], queryFn: () => apiGet<Discovery>("/api/discovery"), staleTime: 10 * 60_000 });
  const qs = theme ? `?theme=${encodeURIComponent(theme)}${sector ? `&sector=${encodeURIComponent(sector)}` : ""}` : "";
  const one = useQuery({ queryKey: ["discovery", theme, sector], queryFn: () => apiGet<Discovery>(`/api/discovery${qs}`), enabled: !!theme, staleTime: 10 * 60_000 });
  const caution = (all.data ?? one.data)?.caution;
  const open = (t: string, s: string | null = null) => { setTheme(t); setSector(s); };

  if (all.isError) return <p className="aif-none" role="alert">Discovery could not be loaded just now. Please try again in a moment.</p>;
  if (!all.data) return <p className="aif-none" aria-busy="true">Loading Discovery…</p>;

  if (!theme) {
    const themes = [...all.data.themes].sort((a, b) => b.primary - a.primary || b.secondary - a.secondary || a.name.localeCompare(b.name));
    const sectors = Object.entries(all.data.bySector ?? {});
    return (
      <div className="aid">
        <p className="aid-lead">Companies grouped by the themes their newest investor presentation talks about, with the stage their own words show, their tone,
          their recent exchange filings and their NSE sector.{" "}
          {all.data.companies ? <>{plural(all.data.companies, "company", "companies")} placed{all.data.updated ? <>, updated {fmtDate(all.data.updated.slice(0, 10))}</> : null}.</> : null}</p>
        {!all.data.companies && <p className="aif-none">No presentation has been read yet. Discovery reads every company's newest investor presentation each night, so the themes fill in from the next run.</p>}
        <div className="aid-mode" role="tablist" aria-label="Group Discovery">
          <button type="button" role="tab" aria-selected={mode === "themes"} className={mode === "themes" ? "on" : ""} onClick={() => setMode("themes")}>By theme</button>
          <button type="button" role="tab" aria-selected={mode === "sectors"} className={mode === "sectors" ? "on" : ""} onClick={() => setMode("sectors")}>By sector</button>
        </div>
        {mode === "themes" ? <ul className="aid-themes" aria-label="Discovery themes">
          {themes.map((t) => (
            <li key={t.name}><button type="button" onClick={() => open(t.name)} disabled={!t.primary && !t.secondary && !t.news?.filings}>
              <b>{t.name}</b>
              <span className="aid-n">{t.primary ? plural(t.primary, "company", "companies") : "None yet"}{t.secondary ? ` · ${t.secondary} more mention it` : ""}</span>
              {t.preview && t.preview.length > 0 && <small>{t.preview.join(", ")}</small>}
              {t.news && <small className="aid-tn"><FilingsLine f={t.news} /></small>}
              <Icon name="arrow" /></button></li>))}
        </ul> : <ul className="aid-sectors" aria-label="Discovery by sector">
          {sectors.length === 0 && <li className="aif-none">No company placed yet.</li>}
          {sectors.map(([sec, ts]) => <li key={sec}><b>{sec}</b>
            <p>{Object.entries(ts).map(([t, n]) => <button key={t} type="button" onClick={() => open(t, sec === "Not classified" ? null : sec)}>{t} <span>{n}</span></button>)}</p></li>)}
        </ul>}
        <p className="aid-note"><Icon name="info" /> {caution}</p>
        <p className="aid-method">{all.data.method}</p>
      </div>);
  }

  const t = one.data?.themes.find((x) => x.name === theme);
  const base = all.data.themes.find((x) => x.name === theme);
  const secs = Object.keys(base?.sectors ?? t?.sectors ?? {});
  return (
    <div className="aid">
      <p className="aid-crumb"><button type="button" onClick={() => { setTheme(null); setSector(null); }}><Icon name="arrow" /> All themes</button><b>{theme}</b></p>
      {secs.length > 1 && <p className="aid-chips" role="group" aria-label="Sector">
        <button type="button" aria-pressed={!sector} className={!sector ? "on" : ""} onClick={() => setSector(null)}>All sectors</button>
        {secs.map((s) => <button key={s} type="button" aria-pressed={sector === s} className={sector === s ? "on" : ""} onClick={() => setSector(s === "Not classified" ? null : s)}>{s} <span>{base?.sectors[s]}</span></button>)}
      </p>}
      {one.isError && <p className="aif-none" role="alert">This theme could not be loaded just now. Please try again.</p>}
      {!one.data && !one.isError && <p className="aif-none" aria-busy="true">Loading…</p>}
      {t && <>
        {Object.keys(t.stages ?? {}).length > 0 && <p className="aid-stages" aria-label="Stages">{Object.entries(t.stages).map(([s, n]) => <span key={s} className={"aid-st aid-st-" + (STAGE_CLASS[s] ?? "na")}>{s} {n}</span>)}</p>}
        {!t.companies?.length && <p className="aif-none">No company's presentation has this as its main theme{sector ? ` in ${sector}` : ""} yet.</p>}
        <ul className="aid-cos" aria-label={`Companies: ${theme}`}>
          {(t.companies ?? []).map((c) => <li key={c.symbol} className="aid-co">
            <p className="aid-coh"><Link to={`/stocks/${encodeURIComponent(c.symbol)}`} onClick={onLeave}><b>{c.company ?? c.symbol}</b> <span>{codeText(c.symbol)}</span></Link>
              <span className={"aid-st aid-st-" + (STAGE_CLASS[c.stageLabel] ?? "na")} title="The most advanced stage the company's own sentences on this theme show">{c.stageLabel}</span></p>
            {(c.sector.macro || c.sector.industry) && <p className="aid-sec">{[c.sector.macro, c.sector.sector !== c.sector.macro ? c.sector.sector : null, c.sector.industry !== c.sector.sector ? c.sector.industry : null].filter(Boolean).join(" › ")}</p>}
            {c.keywords.length > 0 && <p className="aid-kw" aria-label="Keywords found">{c.keywords.map((k) => <span key={k}>{k}</span>)}</p>}
            {c.evidence.length > 0
              ? <ul className="aid-ev" aria-label="From the presentation">{c.evidence.map((e, i) => <li key={i}>“{e}”</li>)}</ul>
              : <p className="aid-nofig">The keywords appear, but no sentence with a figure (capacity, orders, revenue) was found.</p>}
            <p className="aid-meta">
              {c.tone?.label && <span>Tone of the presentation: <b>{c.tone.label}</b>{c.tone.score != null ? ` (${c.tone.score > 0 ? "+" : ""}${c.tone.score.toFixed(2)})` : ""}</span>}
              <span><FilingsLine f={c.filings} /></span>
            </p>
            {c.secondary.length > 0 && <p className="aid-sec">Also talks about: {c.secondary.join(", ")}</p>}
            <p className="aid-doc">{safeDoc(c.document.link)
              ? <a href={c.document.link} target="_blank" rel="noopener noreferrer"><Icon name="download" /> Investor presentation{c.document.date ? `, ${fmtDate(c.document.date)}` : ""}</a>
              : <span>Investor presentation{c.document.date ? `, ${fmtDate(c.document.date)}` : ""}</span>}{c.document.pages ? <small> · {c.document.pages} pages read</small> : null}</p>
          </li>)}
        </ul>
        {(t.alsoMentions?.length ?? 0) > 0 && <><p className="aif-label">Also mention {theme}</p>
          <p className="aid-also">{t.alsoMentions!.map((c, i) => <span key={c.symbol}>{i ? ", " : ""}<Link to={`/stocks/${encodeURIComponent(c.symbol)}`} onClick={onLeave}>{c.company ?? c.symbol}</Link> <small>(main theme: {c.primary}; {c.stageLabel.toLowerCase()})</small></span>)}</p></>}
        {(t.recentFilings?.length ?? 0) > 0 && <><p className="aif-label">Exchange filings that name {theme} (90 days)</p>
          <ul className="aid-fil" aria-label={`Filings: ${theme}`}>{t.recentFilings!.map((f, i) => <li key={i}>
            <ToneDot t={f.tone} /><span><b>{f.company ?? f.symbol}</b> · {f.eventLabel} · {fmtDate(f.date)}{f.stage ? ` · ${f.stage}` : ""}
              <small>{safeDoc(f.link) ? <a href={f.link!} target="_blank" rel="noopener noreferrer">{f.title}</a> : f.title}</small></span></li>)}</ul></>}
        {(t.verify?.length ?? 0) > 0 && <details className="aid-verify"><summary>What to verify in the presentation</summary><ul>{t.verify!.map((v) => <li key={v}>{v}</li>)}</ul></details>}
      </>}
      <p className="aid-note"><Icon name="info" /> {caution}</p>
    </div>);
}
