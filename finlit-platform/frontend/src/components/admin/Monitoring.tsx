// Admin console, Monitoring tab (docs/MONITORING.md): every uptime check with its response time and record, the recent incidents, the failing
// jobs, the outside check from GitHub, the last load test (k6) and the link to Uptime Kuma.
import { useQuery } from "@tanstack/react-query";
import * as acct from "../../lib/account";
import { ApiError } from "../../lib/api";
import { Chip } from "../ui";
import { recordLine, stateTone, stateWord, when } from "../../lib/monitorText";

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "The monitoring summary could not be loaded.");
const row = { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "4px 12px", borderTop: "1px solid var(--border)", padding: "8px 0" } as const;

export function Monitoring() {
  const q = useQuery({ queryKey: ["admin-monitoring"], queryFn: acct.adminMonitoring, retry: false, refetchInterval: 60_000 });
  if (q.isError) return <div className="formerr">{msg(q.error)}</div>;
  const m = q.data;
  if (!m) return <div className="skeleton" style={{ height: 200 }} role="status" aria-label="Loading monitoring" />;
  const down = m.checks.filter((c) => c.up === false);
  return (
    <>
      <section className="card acct-c">
        <h2>Uptime checks (Gatus, every minute)</h2>
        <p className="muted">{m.note ? m.note + " Gatus may not be running yet: see docs/MONITORING.md." : down.length ? `${down.length} of ${m.checks.length} checks are failing now.` : `All ${m.checks.length} checks are passing.`} Email alerts go out on a failure and on recovery once SMTP is set.</p>
        {m.checks.map((c) => (
          <div key={c.key} style={row}>
            <span><b>{c.name}</b> <span className="muted">· {c.group || "site"}</span>{c.errors.length > 0 && <><br /><small className="muted">{c.errors.join(" · ")}</small></>}</span>
            <span style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className="muted">{c.latencyMs != null ? `${c.latencyMs} ms` : "—"} · {recordLine(c.goodPct, c.checks)} · {when(c.checkedAt)}</span>
              <Chip tone={stateTone(c.up)}>{stateWord(c.up)}</Chip>
            </span>
          </div>))}
      </section>
      <section className="card acct-c">
        <h2>Recent incidents</h2>
        {m.incidents.length ? m.incidents.map((i, n) => <div key={n} style={row}><span>{i.name}</span><span className="muted">{i.type === "UNHEALTHY" ? "went down" : "came back"} · {when(i.at)}</span></div>)
          : <p className="muted">No check has gone down in the period Gatus keeps.</p>}
      </section>
      <section className="card acct-c">
        <h2>Background jobs</h2>
        <p className="muted">{m.failingJobs.length ? `Failing now: ${m.failingJobs.join(", ")}. Details in the Data health tab and on /api/jobs/status.` : "No job is failing now."}</p>
      </section>
      <section className="card acct-c">
        <h2>Outside check (GitHub, every 5 minutes)</h2>
        {m.outside ? <p className="muted">Last: <b>{m.outside.ok ? "the site answered" : "the site did NOT answer"}</b>{m.outside.status != null ? ` (HTTP ${m.outside.status}` : " ("}{m.outside.ms != null ? `, ${m.outside.ms} ms)` : ")"}{m.outside.version ? ` · version ${m.outside.version}` : ""} · {when(m.outside.at)}. {m.outsideRecent.filter((x) => !x.ok).length} failed of the last {m.outsideRecent.length}.</p>
          : <p className="muted">No outside check has reported yet. It starts once MONITOR_INGEST_KEY is set on the server and in GitHub (docs/MONITORING.md).</p>}
      </section>
      <section className="card acct-c">
        <h2>Load test (k6)</h2>
        {m.k6 ? <p className="muted">Last {m.k6.run} run {when(m.k6.at)}: <b>{m.k6.passed ? "passed its limits" : "missed its limits"}</b> · {m.k6.requests.toLocaleString("en-IN")} requests{m.k6.vus != null ? ` from ${m.k6.vus} virtual visitors` : ""} · 95% answered within {m.k6.p95Ms != null ? `${Math.round(m.k6.p95Ms)} ms` : "—"} · errors {m.k6.errorPct != null ? `${m.k6.errorPct}%` : "—"}.{m.k6.runUrl && <> <a href={m.k6.runUrl} target="_blank" rel="noreferrer">Open the run ↗</a></>}</p>
          : <p className="muted">No load test has reported yet. The smoke test runs every night and the fuller one on Sunday night.</p>}
      </section>
      <section className="card acct-c">
        <h2>Uptime Kuma</h2>
        <p className="muted">{m.kumaUrl ? <>The second monitor with its own dashboard and alerts: <a href={m.kumaUrl} target="_blank" rel="noreferrer">open Uptime Kuma ↗</a> (its own sign-in).</> : "Not switched on yet. The steps are in docs/MONITORING.md."}</p>
        <p className="muted">Read {when(m.asOf)}.</p>
      </section>
    </>
  );
}
