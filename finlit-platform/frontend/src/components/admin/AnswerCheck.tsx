// Console > FinLit AI (the founder, 25 Nov 2026: "work on the answer structure ... at the end we need perfect things"; the model stays Haiku). The Answer
// check asks the same fixed questions in today's answer style (v1) and in the new one (v2: a shape per kind of question, small slips mended), scores
// every answer, and shows the two side by side, so the switch "ask_answer_v2" is turned only when v2 is shown to be better. Runs on the server
// (ask/check.py): no allowance is used, nothing is cached or kept in anyone's question memory.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiGet, apiSend } from "../../lib/api";
import { useUI } from "../../lib/ui";

export type CheckRun = { id: number; style: "v1" | "v2"; started_at: string; finished_at: string | null; started_by: string | null; questions: number; done: number;
  score: number | string | null; status: "running" | "done" | "failed" | "stopped"; note: string | null };
type Fixed = { score: number; notes: string[]; advice: boolean; problems: string[] };
type Grade = { direct: number; specific: number; clear: number; why: string } | null;
export type CheckAnswer = { qid: string; question: string; kind: string | null; answer: string | null; score: number | string | null; seconds: number | string | null;
  tokens_in: number | null; tokens_out: number | null; error: string | null; checks: { fixed?: Fixed; grade?: Grade } };
type Runs = { runs: CheckRun[]; questions: number; styleOn: "v1" | "v2"; gapSeconds: number };
type One = { run: CheckRun; answers: CheckAnswer[] };

const num = (v: number | string | null | undefined) => (v == null ? null : Number(v));
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const msg = (e: unknown) => (e instanceof ApiError ? e.body.detail || e.body.status || "Failed" : "Could not reach the server.");
const STYLE = { v1: "Today's answers (v1)", v2: "New answer shape (v2)" } as const;

/** The latest finished run of each style, and what the comparison says (pure: tested on its own). */
export function verdict(v1: One | undefined, v2: One | undefined): { line: string; better: boolean } | null {
  if (!v1 || !v2) return null;
  const s1 = num(v1.run.score) ?? 0, s2 = num(v2.run.score) ?? 0;
  const adv = (o: One) => o.answers.filter((a) => a.checks?.fixed?.advice).length;
  const failed = (o: One) => o.answers.filter((a) => a.error || !a.answer).length;
  const better = s2 - s1 >= 3 && adv(v2) <= adv(v1) && failed(v2) <= failed(v1);
  const d = (s2 - s1).toFixed(1);
  return { better, line: better ? `v2 scores ${s2} against ${s1} (+${d}), with no more advice-like or failed answers: switching to v2 is supported by this check.`
    : `v2 scores ${s2} against ${s1} (${Number(d) >= 0 ? "+" : ""}${d}). Not clearly better yet (it must be at least 3 points higher, with no more advice-like or failed answers).` };
}

function useRun(id: number | undefined, running: boolean) {
  return useQuery({ queryKey: ["ask-check", id], queryFn: () => apiGet<One>(`/api/admin/ask-check/${id}`), enabled: !!id, refetchInterval: running ? 5000 : false });
}

export function AnswerCheck() {
  const qc = useQueryClient(); const { toast } = useUI();
  const list = useQuery({ queryKey: ["ask-checks"], queryFn: () => apiGet<Runs>("/api/admin/ask-check"), retry: false,
    refetchInterval: (q) => (q.state.data?.runs.some((r) => r.status === "running") ? 5000 : false) });
  const runs = list.data?.runs ?? [];
  const running = runs.find((r) => r.status === "running");
  const last = (s: "v1" | "v2") => runs.find((r) => r.style === s && (r.status === "done" || r.status === "stopped") && r.done > 0);
  const r1 = useRun(last("v1")?.id, false), r2 = useRun(last("v2")?.id, false), rNow = useRun(running?.id, true);
  const start = useMutation({
    mutationFn: (style: "v1" | "v2") => apiSend<{ id: number; questions: number; minutes: number }>("POST", "/api/admin/ask-check", { style }),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["ask-checks"] }); toast(`Started: ${d.questions} questions, about ${Math.ceil(d.minutes)} minutes.`); },
    onError: (e) => toast(msg(e)),
  });
  const stop = useMutation({ mutationFn: (id: number) => apiSend("POST", `/api/admin/ask-check/${id}/stop`, {}), onSuccess: () => qc.invalidateQueries({ queryKey: ["ask-checks"] }) });
  const flip = useMutation({
    mutationFn: (on: boolean) => apiSend("PUT", "/api/admin/features/ask_answer_v2", { enabled: on }),
    onSuccess: (_d, on) => { qc.invalidateQueries({ queryKey: ["ask-checks"] }); qc.invalidateQueries({ queryKey: ["admin-features"] }); toast(on ? "Members now get the new answer shape (v2)." : "Members are back on today's answers (v1)."); },
    onError: (e) => toast(msg(e)),
  });
  const [open, setOpen] = useState<string | null>(null);
  if (list.isError) return <section className="card acct-c"><h2>FinLit AI answer check</h2><p className="muted">{msg(list.error)}</p></section>;
  const v = verdict(r1.data, r2.data);
  const by2 = new Map((r2.data?.answers ?? []).map((a) => [a.qid, a]));
  const rows = (r1.data?.answers ?? r2.data?.answers ?? []).map((a) => ({ qid: a.qid, question: a.question, kind: a.kind, a1: r1.data?.answers.find((x) => x.qid === a.qid), a2: by2.get(a.qid) }));
  return (
    <section className="card acct-c ack">
      <h2>FinLit AI answer check</h2>
      <p className="muted">The same {list.data?.questions ?? "48"} questions, asked in each answer style, scored out of 100 (fixed checks: no advice, what the question
        must cover, the shape, a source on every figure, the length; plus a grade of directness, specific figures and clarity). It uses no member's allowance and takes about
        {list.data ? ` ${Math.ceil((list.data.questions * list.data.gapSeconds) / 60)}` : " 10"} minutes. Each run costs about what the same number of member questions cost.</p>
      <p className="ack-now">Members get: <b>{list.data ? STYLE[list.data.styleOn] : "…"}</b>
        {list.data && <button className={"btn" + (list.data.styleOn === "v1" && v?.better ? " primary" : "")} disabled={flip.isPending}
          onClick={() => flip.mutate(list.data!.styleOn === "v1")}>{list.data.styleOn === "v1" ? "Switch members to v2" : "Switch members back to v1"}</button>}</p>
      <div className="ack-go">
        <button className="btn" disabled={!!running || start.isPending} onClick={() => start.mutate("v1")}>Check today's answers (v1)</button>
        <button className="btn" disabled={!!running || start.isPending} onClick={() => start.mutate("v2")}>Check the new shape (v2)</button>
        {running && <span className="ack-run" role="status">Running {running.style}: {rNow.data?.run.done ?? running.done} of {running.questions}
          <button className="btn" onClick={() => stop.mutate(running.id)} disabled={stop.isPending}>Stop</button></span>}
      </div>
      {v && <p className={"ack-v" + (v.better ? " ok" : "")} role="note">{v.line}</p>}
      {rows.length > 0 && <div className="tw"><table className="acct-t ack-t">
        <thead><tr><th>Question</th><th>Kind</th><th>v1</th><th>v2</th><th>Change</th></tr></thead>
        <tbody>{rows.map((r) => {
          const s1 = num(r.a1?.score), s2 = num(r.a2?.score), d = s1 != null && s2 != null ? s2 - s1 : null;
          return [<tr key={r.qid}>
            <td><button className="ack-q" aria-expanded={open === r.qid} onClick={() => setOpen(open === r.qid ? null : r.qid)}>{r.question}</button></td>
            <td>{r.a2?.kind ?? r.kind ?? "—"}</td><td>{s1 ?? "—"}</td><td>{s2 ?? "—"}</td>
            <td className={d == null ? "" : d > 0 ? "up" : d < 0 ? "dn" : ""}>{d == null ? "—" : (d > 0 ? "+" : "") + d.toFixed(1)}</td></tr>,
          open === r.qid && <tr key={r.qid + "-x"} className="ack-x"><td colSpan={5}><div className="ack-pair">
            {([["v1", r.a1], ["v2", r.a2]] as const).map(([s, a]) => <div key={s}><b>{STYLE[s]}</b>
              {!a ? <p className="muted">Not asked in this style yet.</p> : <>
                <pre>{a.answer || a.error || "(no answer)"}</pre>
                {[...(a.checks?.fixed?.notes ?? []), ...(a.checks?.fixed?.problems ?? [])].length > 0 && <ul>{[...(a.checks.fixed!.notes), ...(a.checks.fixed!.problems)].map((n) => <li key={n}>{n}</li>)}</ul>}
                {a.checks?.grade && <p className="muted">Grade: direct {a.checks.grade.direct}/5, specific {a.checks.grade.specific}/5, clear {a.checks.grade.clear}/5. {a.checks.grade.why}</p>}
                <p className="muted">{num(a.seconds)} s · {a.tokens_in ?? "—"} in, {a.tokens_out ?? "—"} out</p></>}
            </div>)}</div></td></tr>];
        })}</tbody></table></div>}
      {runs.length > 0 && <details className="ack-h"><summary>Earlier runs</summary><ul>{runs.map((r) => <li key={r.id}>{when(r.started_at)} · {r.style} · {r.status} · {r.done} of {r.questions}
        {num(r.score) != null ? ` · score ${num(r.score)}` : ""}{r.started_by ? ` · ${r.started_by}` : ""}{r.note ? ` · ${r.note}` : ""}</li>)}</ul></details>}
    </section>
  );
}
