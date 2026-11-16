import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../../lib/api";

/** Admin console > Jobs (founder, 16 Nov 2026): every background job, what runs now and how far it is, how long jobs take, how often and why they fail,
 *  and how much of each day they keep the server busy. Read-only; refreshes every 30 seconds. Data: GET /api/admin/jobs/overview and /runs. */

type Progress = { done: number; total: number; pct: number } | null;
type RunningRow = { name: string; startedAt: string | null; elapsedMin: number | null; limitMin: number | null; limitPct: number | null; progress: Progress; lastLine: string | null; peakMb: number | null; attempt: number | null };
type Stat = { runs: number; ok: number; failed: number; killed: number; timeout: number; partial: number; skipped: number; successPct: number | null; typicalMin: number | null; longestMin: number | null; lastMin: number | null; lastStatus: string | null; busyMin: number; peakMb: number | null; limitMin: number | null; resumable: boolean; lastFailure: { at: string | null; status: string; reason: string } | null };
type JobRow = { name: string; class: string; description: string; state: string; reason: string | null; lastSuccessAt: string | null; ageHours: number | null; slaHours: number | null; late: boolean; overdue: boolean; nextDueAt: string | null; lastAttemptAt: string | null; lastStatus: string | null; consecutiveFailures: number; retryAt: string | null; disabledByConfig: boolean };
type Overview = { asOf: string; days: number; running: RunningRow[]; stats: Record<string, Stat>; daily: { day: string; job: string; runs: number; bad: number; busyMin: number }[];
  status: { jobs: JobRow[]; overdue: string[]; failing: string[]; healthy: boolean; healthNote?: string; supervisor: { alive: boolean; heartbeatAgeSeconds: number | null; startedAt: string | null } } };
type Run = { id: number; job: string; startedAt: string | null; finishedAt: string | null; status: string; reason: string | null; attempt: number; minutes: number | null; peakMb: number | null };

const stamp = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const mins = (m: number | null | undefined) => (m == null ? "—" : m < 1 ? "<1 min" : m < 120 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`);
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;
};
const msg = (e: unknown) => (e instanceof ApiError ? e.body.detail || e.body.status || "Failed" : "Could not reach the server.");
const BAD = new Set(["failed", "killed", "timeout"]);
const tone = (s: string | null) => (s === "ok" ? "pos" : s && BAD.has(s) ? "neg" : "muted");
const RESULT_WORD: Record<string, string> = { ok: "OK", failed: "Failed", killed: "Killed", timeout: "Timed out", partial: "Partly done", skipped: "Skipped", running: "Running" };

function Bar({ pct, label }: { pct: number; label: string }) {
  return <div className="prog" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label} title={label} style={{ minWidth: 120 }}><i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div>;
}

export function JobsAdmin() {
  const [days, setDays] = useState(7);
  const [view, setView] = useState<"problems" | "all" | "running">("problems");
  const [runFilter, setRunFilter] = useState<"" | "failed" | "killed" | "timeout">("");
  const [pick, setPick] = useState<string>("");
  const q = useQuery({ queryKey: ["admin-jobs", days], queryFn: () => apiGet<Overview>(`/api/admin/jobs/overview?days=${days}`), refetchInterval: 30_000, retry: false });
  const runs = useQuery({ queryKey: ["admin-job-runs", pick, runFilter], queryFn: () => apiGet<{ runs: Run[] }>(`/api/admin/jobs/runs?limit=100${pick ? `&job=${encodeURIComponent(pick)}` : ""}${runFilter ? `&status=${runFilter}` : ""}`), refetchInterval: 30_000, retry: false });
  const o = q.data;

  const rows = useMemo(() => {
    if (!o) return [];
    const running = new Set(o.running.map((r) => r.name));
    return o.status.jobs.filter((j) => j.class !== "ondemand").filter((j) => {
      const s = o.stats[j.name];
      if (view === "running") return running.has(j.name);
      if (view === "problems") return j.overdue || j.late || j.consecutiveFailures > 0 || BAD.has(j.lastStatus || "") || (s && s.successPct != null && s.successPct < 90) || running.has(j.name);
      return true;
    }).sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.consecutiveFailures - a.consecutiveFailures || (o.stats[b.name]?.busyMin || 0) - (o.stats[a.name]?.busyMin || 0));
  }, [o, view]);

  const perDay = useMemo(() => {
    if (!o) return { days: [] as string[], max: 1, total: {} as Record<string, number>, top: [] as string[], cell: {} as Record<string, number> };
    const total: Record<string, number> = {}, byJob: Record<string, number> = {}, cell: Record<string, number> = {};
    for (const d of o.daily) { total[d.day] = (total[d.day] || 0) + d.busyMin; byJob[d.job] = (byJob[d.job] || 0) + d.busyMin; cell[`${d.day}|${d.job}`] = d.busyMin; }
    const dayList = Object.keys(total).sort();
    const top = Object.entries(byJob).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);
    return { days: dayList, max: Math.max(1, ...Object.values(total)), total, top, cell };
  }, [o]);

  if (q.isError) return <div className="formerr">{msg(q.error)}</div>;
  if (!o) return <div className="skeleton" style={{ height: 240 }} />;
  const span = o.days === 1 ? "24 hours" : `${o.days} days`;
  const finished = Object.values(o.stats).reduce((a, s) => a + s.runs, 0);
  const okRuns = Object.values(o.stats).reduce((a, s) => a + s.ok, 0);
  const today = perDay.days.length ? perDay.total[perDay.days[perDay.days.length - 1]] : 0;

  return (
    <>
      <section className="card acct-c" data-testid="jobs-admin">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>Background jobs</h2>
          <div className="seg" role="group" aria-label="Period">
            {[1, 7, 14, 30].map((d) => <button key={d} aria-pressed={days === d} onClick={() => setDays(d)}>{d === 1 ? "24 h" : `${d} days`}</button>)}
          </div>
        </div>
        <p className="muted">Every job the server runs by itself. Refreshes every 30 seconds · as of {stamp(o.asOf)}. Job supervisor: {o.status.supervisor.alive
          ? <span className="pos">● running (heartbeat {o.status.supervisor.heartbeatAgeSeconds ?? "?"} s ago, started {stamp(o.status.supervisor.startedAt)})</span>
          : <span className="neg">● not answering: no job is being started</span>}</p>
        <div className="hstat">
          <div><b>{o.running.length}</b><span>running now</span></div>
          <div><b className={o.status.overdue.length ? "neg" : ""}>{o.status.overdue.length}</b><span>overdue</span></div>
          <div><b className={o.status.failing.length ? "neg" : ""}>{o.status.failing.length}</b><span>failing (3+ in a row)</span></div>
          <div><b>{finished ? `${Math.round((100 * okRuns) / finished)}%` : "—"}</b><span>runs OK, last {span}</span></div>
          <div><b>{mins(today)}</b><span>job time today</span></div>
        </div>
        {(o.status.overdue.length > 0 || o.status.failing.length > 0) && <div className="formerr" role="alert">
          {o.status.overdue.length > 0 && <div><b>Overdue:</b> {o.status.overdue.join(", ")}</div>}
          {o.status.failing.length > 0 && <div><b>Failing:</b> {o.status.failing.join(", ")}</div>}
        </div>}
      </section>

      <section className="card acct-c">
        <h2>Running now</h2>
        {o.running.length === 0 ? <p className="muted">Nothing is running at this moment.</p> : (
          <div className="tw"><table className="qtt"><thead><tr><th>Job</th><th>Started</th><th>Running for</th><th>How far</th><th>Time limit used</th><th>Memory</th><th>Latest output</th></tr></thead>
            <tbody>{o.running.map((r) => <tr key={r.name}>
              <td><b>{r.name}</b>{r.attempt && r.attempt > 1 ? <small className="muted"> · try {r.attempt}</small> : null}</td>
              <td>{stamp(r.startedAt)}</td><td>{mins(r.elapsedMin)}</td>
              <td>{r.progress ? <><Bar pct={r.progress.pct} label={`${r.progress.done} of ${r.progress.total} done`} /><small>{r.progress.pct}% · {r.progress.done.toLocaleString("en-IN")} of {r.progress.total.toLocaleString("en-IN")}</small></> : <small className="muted">not reported by this job</small>}</td>
              <td>{r.limitPct != null ? <><Bar pct={r.limitPct} label={`${r.limitPct}% of its ${r.limitMin} minute limit`} /><small className={r.limitPct >= 85 ? "neg" : undefined}>{r.limitPct}% of {mins(r.limitMin)}</small></> : "—"}</td>
              <td>{r.peakMb ? `${r.peakMb} MB` : "—"}</td>
              <td className="mono" style={{ maxWidth: 360, overflowWrap: "anywhere" }}>{r.lastLine || "—"}</td></tr>)}</tbody></table></div>)}
      </section>

      <section className="card acct-c">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>Every job</h2>
          <div className="seg" role="group" aria-label="Which jobs">
            {([["problems", "Needs attention"], ["running", "Running"], ["all", "All"]] as const).map(([k, l]) => <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>)}
          </div>
        </div>
        <p className="muted">Times are of runs that finished OK in the last {span}. "Success" counts finished runs (skipped ones not counted). Click a job to see its runs below.</p>
        {rows.length === 0 ? <p className="pos">Nothing needs attention: every job is current and its recent runs are OK.</p> : (
          <div className="tw"><table className="qtt"><thead><tr><th>Job</th><th>State</th><th>Last result</th><th>Last success</th><th>Typical</th><th>Last</th><th>Longest</th><th>Limit</th><th>Success</th><th>Runs (bad)</th><th>Memory</th></tr></thead>
            <tbody>{rows.map((j) => {
              const s = o.stats[j.name];
              const bad = s ? s.failed + s.killed + s.timeout : 0;
              return <tr key={j.name} onClick={() => setPick(j.name)} style={{ cursor: "pointer" }} aria-selected={pick === j.name}>
                <td><b>{j.name}</b><br /><small className="muted">{j.class}</small></td>
                <td><span className={j.overdue ? "neg" : j.state === "running" ? "pos" : undefined}>{j.overdue ? "Overdue" : j.state}</span><br /><small className="muted">{j.reason || ""}</small></td>
                <td className={tone(j.lastStatus)}>{RESULT_WORD[j.lastStatus || ""] || j.lastStatus || "—"}{j.consecutiveFailures > 0 && <small> · {j.consecutiveFailures} in a row</small>}</td>
                <td title={stamp(j.lastSuccessAt)}>{ago(j.lastSuccessAt)}</td>
                <td>{mins(s?.typicalMin)}</td><td>{mins(s?.lastMin)}</td><td>{mins(s?.longestMin)}</td><td>{mins(s?.limitMin)}</td>
                <td className={s?.successPct != null && s.successPct < 90 ? "neg" : undefined}>{s?.successPct != null ? `${s.successPct}%` : "—"}</td>
                <td>{s ? `${s.runs}${bad ? ` (${bad})` : ""}` : "—"}</td>
                <td>{s?.peakMb ? `${s.peakMb} MB` : "—"}</td></tr>;
            })}</tbody></table></div>)}
      </section>

      <section className="card acct-c">
        <h2>Job time per day</h2>
        <p className="muted">Minutes of job time each day (jobs that run side by side each count). A day well above the others means more work or jobs that were stopped and started again.</p>
        <div role="img" aria-label="Minutes of job time per day" style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
          {perDay.days.map((d) => {
            const v = perDay.total[d];
            return <div key={d} title={`${d}: ${mins(v)} of job time`} style={{ flex: 1, minWidth: 18, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", cursor: "default" }}>
              <div style={{ height: `${Math.max(2, (100 * v) / perDay.max)}%`, background: "var(--gold)", borderRadius: "4px 4px 0 0" }} />
            </div>;
          })}
        </div>
        <div style={{ display: "flex", gap: 6 }}>{perDay.days.map((d) => <small key={d} className="muted" style={{ flex: 1, minWidth: 18, textAlign: "center" }}>{d.slice(8)}</small>)}</div>
        <div className="tw" style={{ marginTop: 12 }}><table className="qtt"><thead><tr><th>Job</th>{perDay.days.map((d) => <th key={d}>{d.slice(5)}</th>)}</tr></thead>
          <tbody>{perDay.top.map((job) => <tr key={job}><td><b>{job}</b></td>{perDay.days.map((d) => <td key={d}>{perDay.cell[`${d}|${job}`] ? mins(perDay.cell[`${d}|${job}`]) : "—"}</td>)}</tr>)}
            <tr><td><b>All jobs</b></td>{perDay.days.map((d) => <td key={d}><b>{mins(perDay.total[d])}</b></td>)}</tr></tbody></table></div>
      </section>

      <section className="card acct-c">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>Recent runs{pick ? ` of ${pick}` : ""}</h2>
          <div className="seg" role="group" aria-label="Which runs">
            {pick && <button onClick={() => setPick("")}>All jobs</button>}
            {([["", "All"], ["failed", "Failed"], ["killed", "Killed"], ["timeout", "Timed out"]] as const).map(([k, l]) => <button key={k || "all"} aria-pressed={runFilter === k} onClick={() => setRunFilter(k)}>{l}</button>)}
          </div>
        </div>
        {pick && o.stats[pick]?.lastFailure && <p className="muted"><b>Last failure</b> {stamp(o.stats[pick].lastFailure!.at)}: {o.stats[pick].lastFailure!.reason}</p>}
        {runs.isError ? <div className="formerr">{msg(runs.error)}</div> : !runs.data ? <div className="skeleton" style={{ height: 120 }} /> : runs.data.runs.length === 0 ? <p className="muted">No runs match.</p> : (
          <div className="tw"><table className="qtt"><thead><tr><th>Started</th><th>Job</th><th>Result</th><th>Took</th><th>Memory</th><th>Why</th></tr></thead>
            <tbody>{runs.data.runs.map((r) => <tr key={r.id}><td>{stamp(r.startedAt)}</td><td><b>{r.job}</b>{r.attempt > 1 ? <small className="muted"> · try {r.attempt}</small> : null}</td>
              <td className={tone(r.status)}>{RESULT_WORD[r.status] || r.status}</td><td>{mins(r.minutes)}</td><td>{r.peakMb ? `${r.peakMb} MB` : "—"}</td>
              <td className="mono" style={{ maxWidth: 420, overflowWrap: "anywhere" }}>{r.reason || ""}</td></tr>)}</tbody></table></div>)}
      </section>
    </>
  );
}
