// Console > Visitors: FinLit's own cookie-free visitor counter (finlit/visits.py, GET /api/admin/visitors, administrators only).
// Daily page views, visits and sign-ups, where visits came from, the most-opened pages and phone versus desktop. Read-only.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../../lib/api";

export type VisitorsReport = {
  from: string; to: string; days: number; countingSince: string | null;
  totals: { views: number; visits: number; signups: number };
  daily: { day: string; views: number; visits: number; signups: number }[];
  sources: { source: string; visits: number; views: number }[];
  pages: { path: string; views: number; visits: number }[];
  devices: { device: string; views: number; visits: number }[];
  how: string;
};

const SOURCE_NAMES: Record<string, string> = {
  google: "Google", bing: "Bing", chatgpt: "ChatGPT", perplexity: "Perplexity", claude: "Claude", gemini: "Gemini", copilot: "Copilot", duckduckgo: "DuckDuckGo",
  yahoo: "Yahoo", brave: "Brave Search", linkedin: "LinkedIn", x: "X (Twitter)", facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", reddit: "Reddit",
  whatsapp: "WhatsApp", quora: "Quora", producthunt: "Product Hunt", alternativeto: "AlternativeTo", crunchbase: "Crunchbase",
  direct: "Typed in or bookmarked", campaign: "A tagged campaign link", other: "Other websites",
};
const AI = new Set(["chatgpt", "perplexity", "claude", "gemini", "copilot"]);
const num = (n: number) => n.toLocaleString("en-IN");
const day = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const share = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export function VisitorsAdmin() {
  const [days, setDays] = useState(30);
  const q = useQuery<VisitorsReport, ApiError>({ queryKey: ["admin-visitors", days], queryFn: () => apiGet<VisitorsReport>(`/api/admin/visitors?days=${days}`), retry: false, refetchInterval: 300_000 });
  if (q.isError) return <div className="formerr" role="alert">{(q.error.body?.detail as string) || "The visitor counts could not be read."}</div>;
  const r = q.data;
  if (!r) return <div className="skeleton" style={{ height: 200 }} aria-label="Loading visitor counts" />;
  const aiVisits = r.sources.filter((s) => AI.has(s.source)).reduce((a, s) => a + s.visits, 0);
  const searchVisits = r.sources.filter((s) => ["google", "bing", "duckduckgo", "yahoo", "brave"].includes(s.source)).reduce((a, s) => a + s.visits, 0);
  return (
    <>
      <section className="card acct-c">
        <h2>Visitors</h2>
        <p className="muted">{r.how}{r.countingSince ? ` Counting since ${day(r.countingSince)}.` : " Nothing counted yet."}</p>
        <div className="seg" role="tablist" aria-label="Period">
          {[7, 30, 90].map((d) => <button key={d} type="button" role="tab" aria-selected={days === d} onClick={() => setDays(d)}>Last {d} days</button>)}
        </div>
        <div className="hstat">
          <div><b>{num(r.totals.visits)}</b><span>visits</span></div>
          <div><b>{num(r.totals.views)}</b><span>pages opened</span></div>
          <div><b>{num(searchVisits)}</b><span>visits from search engines</span></div>
          <div><b>{num(aiVisits)}</b><span>visits from AI assistants</span></div>
          <div><b>{num(r.totals.signups)}</b><span>new members</span></div>
        </div>
      </section>

      <section className="card acct-c">
        <h2>Where visits came from</h2>
        {r.sources.length ? <div className="tw"><table className="qtt">
          <thead><tr><th>Source</th><th className="n">Visits</th><th className="n">Share</th><th className="n">Pages opened</th></tr></thead>
          <tbody>{r.sources.map((s) => <tr key={s.source}><td>{SOURCE_NAMES[s.source] || s.source}</td><td className="n">{num(s.visits)}</td><td className="n">{share(s.visits, r.totals.visits)}</td><td className="n">{num(s.views)}</td></tr>)}</tbody>
        </table></div> : <p className="muted">No visits in this period yet.</p>}
      </section>

      <section className="card acct-c">
        <h2>Most-opened pages</h2>
        {r.pages.length ? <div className="tw"><table className="qtt">
          <thead><tr><th>Page</th><th className="n">Opened</th><th className="n">Visits started here</th></tr></thead>
          <tbody>{r.pages.map((p) => <tr key={p.path}><td>{p.path}</td><td className="n">{num(p.views)}</td><td className="n">{num(p.visits)}</td></tr>)}</tbody>
        </table></div> : <p className="muted">No pages opened in this period yet.</p>}
        {r.devices.length > 0 && <p className="muted">{r.devices.map((d) => `${d.device === "mobile" ? "Phone" : "Desktop"}: ${share(d.views, r.totals.views)} of pages opened`).join(" · ")}</p>}
      </section>

      <section className="card acct-c">
        <h2>Day by day</h2>
        <div className="tw"><table className="qtt">
          <thead><tr><th>Day</th><th className="n">Visits</th><th className="n">Pages opened</th><th className="n">New members</th></tr></thead>
          <tbody>{[...r.daily].reverse().map((d) => <tr key={d.day}><td>{day(d.day)}</td><td className="n">{num(d.visits)}</td><td className="n">{num(d.views)}</td><td className="n">{num(d.signups)}</td></tr>)}</tbody>
        </table></div>
      </section>
    </>
  );
}
