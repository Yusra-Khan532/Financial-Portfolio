// The public status page (/status): whether the website and its main data pages answer right now, from the uptime checker (Gatus) that runs
// every minute on the server. Only names, up or down and each check's recent record are shown (docs/MONITORING.md).
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import { useDocTitle } from "../lib/title";
import { Chip } from "../components/ui";
import { recordLine, stateTone, stateWord, when } from "../lib/monitorText";

export type PublicStatus = { checks: { name: string; up: boolean | null; goodPct: number | null; checks: number; checkedAt: string | null }[]; allUp: boolean; note: string | null; asOf: string };

export function StatusPage() {
  useDocTitle("FinLit status", "Whether FinLit's website and its main data pages are answering right now, checked every minute.");
  const q = useQuery({ queryKey: ["status-public"], queryFn: () => apiGet<PublicStatus>("/api/status/public"), refetchInterval: 60_000, retry: 1 });
  const s = q.data;
  return (
    <div className="wrap">
      <header className="dash-h"><div><div className="eyebrow">FinLit</div><h1 className="ui-title">Status</h1>
        <p className="muted">The website and its main data pages, checked every minute from the server. This page refreshes by itself.</p></div></header>
      {q.isError && <div className="formerr" role="alert">The status could not be read just now. If the site itself is slow, it may be under repair; try again in a minute.</div>}
      {!s && !q.isError && <div className="skeleton" style={{ height: 160 }} role="status" aria-label="Loading the status" />}
      {s && (
        <section className="card acct-c" aria-live="polite">
          <h2>{s.note ? "Status not available right now" : s.allUp ? "Everything is up" : "Something is down"}</h2>
          {s.note && <p className="muted">{s.note} The website itself may still be working normally.</p>}
          {s.checks.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
              {s.checks.map((c) => (
                <li key={c.name} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px", justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <b>{c.name}</b>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span className="muted">{recordLine(c.goodPct, c.checks)} · last checked {when(c.checkedAt)}</span>
                    <Chip tone={stateTone(c.up)}>{stateWord(c.up)}</Chip>
                  </span>
                </li>))}
            </ul>)}
          <p className="muted" style={{ marginTop: 12 }}>Read {when(s.asOf)}.</p>
        </section>)}
    </div>
  );
}
