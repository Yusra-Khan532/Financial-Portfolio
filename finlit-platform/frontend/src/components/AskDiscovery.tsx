import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import { Icon } from "../lib/icons";

/** Discovery (task #221): companies grouped by the themes their newest investor presentation talks about (backend finlit/discovery, GET /api/discovery).
 *  The theme list first (counts and the first names), then one theme: each company with its keywords, the sentences that hold figures and the
 *  presentation itself. Describes what companies say about themselves; the directory's caution is shown on every screen. */
export type DiscoveryCompany = {
  symbol: string; company: string | null; primary: string; secondary: string[]; score: number | null; keywords: string[]; evidence: string[]; hasFigures: boolean;
  document: { title: string | null; date: string | null; link: string; pages: number | null }; readAt: string | null;
};
export type DiscoveryTheme = { name: string; primary: number; secondary: number; preview?: string[]; companies?: DiscoveryCompany[]; alsoMentions?: DiscoveryCompany[] };
export type Discovery = { themes: DiscoveryTheme[]; companies: number; read: number; statuses: Record<string, number>; updated: string | null; caution: string; method: string };

const fmtDate = (d: string | null) => (d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
/** Only the exchanges' own archive links are opened from here (the backend reads nothing else either). */
const safeDoc = (u: string) => /^https:\/\/([a-z0-9-]+\.)*(nseindia\.(com|in)|bseindia\.com)\//i.test(u);

export function AskDiscovery({ onLeave }: { onLeave?: () => void }) {
  const [theme, setTheme] = useState<string | null>(null);
  const all = useQuery({ queryKey: ["discovery"], queryFn: () => apiGet<Discovery>("/api/discovery"), staleTime: 10 * 60_000 });
  const one = useQuery({ queryKey: ["discovery", theme], queryFn: () => apiGet<Discovery>(`/api/discovery?theme=${encodeURIComponent(theme!)}`), enabled: !!theme, staleTime: 10 * 60_000 });
  const caution = (all.data ?? one.data)?.caution;

  if (all.isError) return <p className="aif-none" role="alert">Discovery could not be loaded just now. Please try again in a moment.</p>;
  if (!all.data) return <p className="aif-none" aria-busy="true">Loading Discovery…</p>;

  if (!theme) {
    const themes = [...all.data.themes].sort((a, b) => b.primary - a.primary || b.secondary - a.secondary || a.name.localeCompare(b.name));
    return (
      <div className="aid">
        <p className="aid-lead">Companies grouped by the themes their newest investor presentation talks about.{" "}
          {all.data.companies ? <>{all.data.companies.toLocaleString("en-IN")} companies placed{all.data.updated ? <>, updated {fmtDate(all.data.updated.slice(0, 10))}</> : null}.</> : null}</p>
        {!all.data.companies && <p className="aif-none">No presentation has been read yet. Discovery reads every company's newest investor presentation each night, so the themes fill in from the next run.</p>}
        <ul className="aid-themes" aria-label="Discovery themes">
          {themes.map((t) => (
            <li key={t.name}><button type="button" onClick={() => setTheme(t.name)} disabled={!t.primary && !t.secondary}>
              <b>{t.name}</b>
              <span className="aid-n">{t.primary ? `${t.primary} ${t.primary === 1 ? "company" : "companies"}` : "None yet"}{t.secondary ? ` · ${t.secondary} more mention it` : ""}</span>
              {t.preview && t.preview.length > 0 && <small>{t.preview.join(", ")}</small>}
              <Icon name="arrow" /></button></li>))}
        </ul>
        <p className="aid-note"><Icon name="info" /> {caution}</p>
        <p className="aid-method">{all.data.method}</p>
      </div>);
  }

  const t = one.data?.themes.find((x) => x.name === theme);
  return (
    <div className="aid">
      <p className="aid-crumb"><button type="button" onClick={() => setTheme(null)}><Icon name="arrow" /> All themes</button><b>{theme}</b></p>
      {one.isError && <p className="aif-none" role="alert">This theme could not be loaded just now. Please try again.</p>}
      {!one.data && !one.isError && <p className="aif-none" aria-busy="true">Loading…</p>}
      {t && <>
        {!t.companies?.length && <p className="aif-none">No company's presentation has this as its main theme yet.</p>}
        <ul className="aid-cos" aria-label={`Companies: ${theme}`}>
          {(t.companies ?? []).map((c) => <li key={c.symbol} className="aid-co">
            <p className="aid-coh"><Link to={`/stocks/${encodeURIComponent(c.symbol)}`} onClick={onLeave}><b>{c.company ?? c.symbol}</b> <span>{c.symbol}</span></Link></p>
            {c.keywords.length > 0 && <p className="aid-kw" aria-label="Keywords found">{c.keywords.map((k) => <span key={k}>{k}</span>)}</p>}
            {c.evidence.length > 0
              ? <ul className="aid-ev" aria-label="From the presentation">{c.evidence.map((e, i) => <li key={i}>“{e}”</li>)}</ul>
              : <p className="aid-nofig">The keywords appear, but no sentence with a figure (capacity, orders, revenue) was found.</p>}
            {c.secondary.length > 0 && <p className="aid-sec">Also talks about: {c.secondary.join(", ")}</p>}
            <p className="aid-doc">{safeDoc(c.document.link)
              ? <a href={c.document.link} target="_blank" rel="noopener noreferrer"><Icon name="download" /> Investor presentation{c.document.date ? `, ${fmtDate(c.document.date)}` : ""}</a>
              : <span>Investor presentation{c.document.date ? `, ${fmtDate(c.document.date)}` : ""}</span>}{c.document.pages ? <small> · {c.document.pages} pages read</small> : null}</p>
          </li>)}
        </ul>
        {(t.alsoMentions?.length ?? 0) > 0 && <><p className="aif-label">Also mention {theme}</p>
          <p className="aid-also">{t.alsoMentions!.map((c, i) => <span key={c.symbol}>{i ? ", " : ""}<Link to={`/stocks/${encodeURIComponent(c.symbol)}`} onClick={onLeave}>{c.company ?? c.symbol}</Link> <small>(main theme: {c.primary})</small></span>)}</p></>}
      </>}
      <p className="aid-note"><Icon name="info" /> {caution}</p>
    </div>);
}
