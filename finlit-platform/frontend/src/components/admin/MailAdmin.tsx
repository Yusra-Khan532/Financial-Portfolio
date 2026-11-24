// Console > Email (task #387): mail from contact@finlitventures.com through Amazon SES (finlit/mailer.py). Administrators only; the server checks
// the role and the authenticator code on every call. Four steps on one page: add people (CSV or Excel), write the mail (with its one button),
// look at it and send a test to yourself, then send in batches and watch the counts. Every problem is shown with SES's own reason.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiGet, apiSend, apiUrl } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import "../../styles/mailadmin.css";

type Campaign = { id: number; subject: string; body: string; why: string; button_text: string | null; button_url: string | null; created_at: string;
  queued: number; sent: number; failed: number; skipped: number; remaining: number };
type Summary = { ready: boolean; from: string; ratePerSecond: number; sendingNow: boolean; contacts: { source: string; status: string; n: number }[];
  campaigns: Campaign[]; errors: { campaign_id: number; error: string; n: number; last: string | null }[] };
type ImportResult = { rows: number; added: number; alreadyThere: number; duplicates: number; invalid: string[]; invalidCount: number; typos: string[]; typoCount: number;
  noMailServer: string[]; noMailServerCount: number };
type Draft = { subject: string; body: string; why: string; buttonText: string; buttonUrl: string };

const msg = (e: unknown) => (e instanceof ApiError ? (typeof e.body.detail === "string" ? e.body.detail : e.body.status) || `Failed (${e.status})` : "Could not reach the server.");
const nf = (n: number) => n.toLocaleString("en-IN");
const EMPTY: Draft = { subject: "", body: "Hi {name},\n\n", why: "", buttonText: "Create your free account", buttonUrl: "https://finlitventures.com/signup" };
const STATUS_WORD: Record<string, string> = { active: "Can be mailed", unsubscribed: "Unsubscribed", bounced: "Bounced", complained: "Marked as spam" };

/** The file as base64, for the JSON upload. */
function toBase64(f: File): Promise<string> {
  return new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",", 2)[1] || ""); r.onerror = () => fail(r.error); r.readAsDataURL(f); });
}

export function MailAdmin() {
  const { user } = useAuth(), qc = useQueryClient();
  const s = useQuery<Summary>({ queryKey: ["mail-admin"], queryFn: () => apiGet("/api/admin/mail", { cache: "no-store" }), retry: false,
    refetchInterval: (q) => (q.state.data?.sendingNow ? 3000 : false) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["mail-admin"] });
  if (s.isError) return <div className="card mla"><p className="mla-err" role="alert">{msg(s.error)}</p></div>;
  if (!s.data) return <div className="card mla"><p className="muted">Loading…</p></div>;
  const d = s.data;
  const sources = [...new Set(d.contacts.map((c) => c.source))];
  const total = (st: string) => d.contacts.filter((c) => c.status === st).reduce((a, c) => a + c.n, 0);
  return (
    <div className="mla">
      <div className={"card mla-status " + (d.ready ? "ok" : "bad")} role="status">
        <b>{d.ready ? "Ready to send" : "Not set up"}</b>
        <span>{d.ready ? `From ${d.from} through Amazon SES, at ${d.ratePerSecond} mails a second.` : "The SES key is missing on the server (SES_REGION, SES_ACCESS_KEY_ID, SES_SECRET_ACCESS_KEY in .env.aws)."}</span>
        {d.sendingNow && <span className="mla-live">Sending now: this page updates by itself.</span>}
      </div>

      <section className="card mla-sec" aria-labelledby="mla-h1">
        <h3 id="mla-h1"><span className="mla-n">1</span>People on the list</h3>
        <div className="mla-kpis">
          <div><b>{nf(total("active"))}</b><span>can be mailed</span></div>
          <div><b>{nf(total("unsubscribed"))}</b><span>unsubscribed</span></div>
          <div><b>{nf(total("bounced") + total("complained"))}</b><span>bounced or marked as spam</span></div>
        </div>
        {sources.length > 0 && <div className="tw"><table className="admin-t"><thead><tr><th scope="col">Where they signed up</th>{Object.keys(STATUS_WORD).map((k) => <th key={k} scope="col" className="num">{STATUS_WORD[k]}</th>)}</tr></thead>
          <tbody>{sources.map((src) => <tr key={src}><th scope="row">{src}</th>{Object.keys(STATUS_WORD).map((k) => <td key={k} className="num">{nf(d.contacts.find((c) => c.source === src && c.status === k)?.n ?? 0)}</td>)}</tr>)}</tbody></table></div>}
        <Upload onDone={refresh} />
      </section>

      <section className="card mla-sec" aria-labelledby="mla-h2">
        <h3 id="mla-h2"><span className="mla-n">2</span>Write a mail</h3>
        <Compose sources={sources} onSaved={refresh} />
      </section>

      <section className="card mla-sec" aria-labelledby="mla-h3">
        <h3 id="mla-h3"><span className="mla-n">3</span>Your mails: look, test, send</h3>
        {d.campaigns.length === 0 ? <p className="muted">No mail yet. Write one above.</p>
          : d.campaigns.map((c) => <CampaignCard key={c.id} c={c} sources={sources} errors={d.errors.filter((e) => e.campaign_id === c.id)} me={user?.email ?? ""} onChange={refresh} />)}
      </section>
      <p className="faint mla-foot">Every mail carries a one-click unsubscribe link; anyone who unsubscribes is never mailed again. Addresses that bounce or are marked as spam are held back by Amazon SES. Nobody gets the same mail twice.</p>
    </div>
  );
}

function Upload({ onDone }: { onDone: () => void }) {
  const [source, setSource] = useState(""), [file, setFile] = useState<File | null>(null), [res, setRes] = useState<ImportResult | null>(null), [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const go = useMutation({
    mutationFn: async () => apiSend<ImportResult>("POST", "/api/admin/mail/import", { filename: file!.name, data: await toBase64(file!), source }),
    onSuccess: (r) => { setRes(r); setErr(""); setFile(null); if (input.current) input.current.value = ""; onDone(); }, onError: (e) => { setErr(msg(e)); setRes(null); },
  });
  return (
    <form className="form mla-form" onSubmit={(e) => { e.preventDefault(); if (file) go.mutate(); }}>
      <h4>Add people</h4>
      <p className="muted">A CSV or Excel file with a column whose heading contains "email" (and, if you have it, "name"). Up to 5 MB. Uploading the same people again adds nobody twice.</p>
      <label>Where these people gave their address (required)<input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. XYZ Hackathon, Oct 2026" maxLength={160} required minLength={3} /></label>
      <label>File<input ref={input} type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required /></label>
      <button className="btn primary" disabled={!file || source.trim().length < 3 || go.isPending}>{go.isPending ? "Checking the list…" : "Check and add"}</button>
      {err && <p className="mla-err" role="alert">{err}</p>}
      {res && <div className="mla-res" role="status">
        <p><b>{nf(res.added)} added</b> of {nf(res.rows)} rows. {res.alreadyThere ? `${nf(res.alreadyThere)} were already on the list. ` : ""}{res.duplicates ? `${nf(res.duplicates)} repeated in the file. ` : ""}</p>
        <Left title="not valid email addresses" n={res.invalidCount} xs={res.invalid} />
        <Left title="look misspelt (for example gmial.com); fix them in the file and upload again" n={res.typoCount} xs={res.typos} />
        <Left title="have a domain that cannot receive mail" n={res.noMailServerCount} xs={res.noMailServer} />
      </div>}
    </form>
  );
}

function Left({ title, n, xs }: { title: string; n: number; xs: string[] }) {
  if (!n) return null;
  return <details className="mla-left"><summary>{nf(n)} left out: {title}</summary><p>{xs.join(", ")}{n > xs.length ? ` and ${nf(n - xs.length)} more` : ""}</p></details>;
}

function Compose({ sources, onSaved, edit, done }: { sources: string[]; onSaved: () => void; edit?: Campaign; done?: () => void }) {
  const [f, setF] = useState<Draft>(edit ? { subject: edit.subject, body: edit.body, why: edit.why, buttonText: edit.button_text ?? "", buttonUrl: edit.button_url ?? "" } : EMPTY);
  const [err, setErr] = useState(""), [ok, setOk] = useState("");
  useEffect(() => { if (!edit && !f.why && sources.length === 1) setF((x) => ({ ...x, why: `You get this because you registered for ${sources[0]}.` })); }, [sources, edit, f.why]);
  const save = useMutation({
    mutationFn: () => apiSend<{ id: number }>("POST", `/api/admin/mail/campaigns${edit ? `?id=${edit.id}` : ""}`, f),
    onSuccess: () => { setErr(""); setOk(edit ? "Saved." : "Saved: see it under step 3."); if (!edit) setF(EMPTY); onSaved(); done?.(); }, onError: (e) => { setErr(msg(e)); setOk(""); },
  });
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="form mla-form" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <label>Subject<input value={f.subject} onChange={set("subject")} maxLength={150} required minLength={3} placeholder="e.g. Thanks for joining XYZ Hackathon: your FinLit access" /></label>
      <label>Mail text<textarea rows={9} value={f.body} onChange={set("body")} maxLength={20000} required minLength={20} /></label>
      <p className="faint mla-hint">{"{name}"} becomes each person's first name. A blank line starts a new paragraph; a web address becomes a link. Describe, never advise: words like buy, sell or "best stocks" are refused.</p>
      <div className="mla-two">
        <label>Button words<input value={f.buttonText} onChange={set("buttonText")} maxLength={60} placeholder="e.g. Create your free account" /></label>
        <label>Button link<input value={f.buttonUrl} onChange={set("buttonUrl")} maxLength={500} placeholder="https://finlitventures.com/signup" /></label>
      </div>
      <label>Why they get this (shown at the foot, next to Unsubscribe)<input value={f.why} onChange={set("why")} maxLength={300} required minLength={10} placeholder="You get this because you registered for XYZ Hackathon, Oct 2026." /></label>
      <div className="mla-acts"><button className="btn primary" disabled={save.isPending}>{save.isPending ? "Saving…" : edit ? "Save changes" : "Save the mail"}</button>{done && <button type="button" className="btn" onClick={done}>Cancel</button>}</div>
      {err && <p className="mla-err" role="alert">{err}</p>}{ok && <p className="mla-ok" role="status">{ok}</p>}
    </form>
  );
}

/** The mail as people will see it (Priya Sharma as the sample name), in a sandboxed frame: no scripts, no links followed from inside it. */
function Preview({ id, subject }: { id: number; subject: string }) {
  const q = useQuery({ queryKey: ["mail-preview", id], queryFn: async () => {
    const r = await fetch(apiUrl(`/api/admin/mail/campaigns/${id}/preview`), { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) throw new Error(`The preview could not be loaded (${r.status}).`);
    return r.text();
  }, retry: false });
  if (q.isError) return <p className="mla-err" role="alert">{(q.error as Error).message}</p>;
  return q.data ? <iframe className="mla-frame" title={`The mail: ${subject}`} srcDoc={q.data} sandbox="" /> : <p className="muted">Loading the mail…</p>;
}

function CampaignCard({ c, sources, errors, me, onChange }: { c: Campaign; sources: string[]; errors: Summary["errors"]; me: string; onChange: () => void }) {
  const [to, setTo] = useState(me), [count, setCount] = useState(500), [src, setSrc] = useState(""), [note, setNote] = useState(""), [err, setErr] = useState("");
  const [look, setLook] = useState(false), [editing, setEditing] = useState(false);
  const started = c.sent + c.failed + c.skipped + c.queued > 0;
  const all = c.sent + c.failed + c.skipped + c.queued + c.remaining, pct = all ? Math.round((c.sent / all) * 100) : 0;
  const test = useMutation({ mutationFn: () => apiSend("POST", `/api/admin/mail/campaigns/${c.id}/test`, { to }),
    onSuccess: () => { setErr(""); setNote(`Test sent to ${to}. Check the inbox (and Spam) in a minute.`); }, onError: (e) => { setErr(msg(e)); setNote(""); } });
  const send = useMutation({ mutationFn: () => apiSend<{ queued: number }>("POST", `/api/admin/mail/campaigns/${c.id}/send`, { count, source: src || null }),
    onSuccess: (r) => { setErr(""); setNote(r.queued ? `${nf(r.queued)} mails queued; sending has started.` : "Nobody left to send this mail to."); onChange(); }, onError: (e) => { setErr(msg(e)); setNote(""); } });
  if (editing) return <div className="mla-camp"><Compose sources={sources} onSaved={onChange} edit={c} done={() => setEditing(false)} /></div>;
  return (
    <div className="mla-camp">
      <div className="mla-camp-h"><b>{c.subject}</b><span className="faint">Mail {c.id}</span></div>
      <div className="mla-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Sent so far"><i style={{ width: `${pct}%` }} /></div>
      <dl className="mla-counts">
        <div><dt>Sent</dt><dd>{nf(c.sent)}</dd></div><div><dt>Sending now</dt><dd>{nf(c.queued)}</dd></div><div><dt>Left to send</dt><dd>{nf(c.remaining)}</dd></div>
        <div><dt>Failed</dt><dd className={c.failed ? "bad" : ""}>{nf(c.failed)}</dd></div><div><dt>Skipped (unsubscribed)</dt><dd>{nf(c.skipped)}</dd></div>
      </dl>
      {errors.length > 0 && <div className="mla-err" role="alert"><b>Problems</b><ul>{errors.map((e) => <li key={e.error}>{nf(e.n)} × {e.error}</li>)}</ul></div>}
      <div className="mla-acts">
        <button type="button" className="btn" aria-expanded={look} onClick={() => setLook(!look)}>{look ? "Hide the mail" : "Look at the mail"}</button>
        {!started && <button type="button" className="btn" onClick={() => setEditing(true)}>Change it</button>}
      </div>
      {look && <Preview id={c.id} subject={c.subject} />}
      <form className="form mla-row" onSubmit={(e) => { e.preventDefault(); test.mutate(); }}>
        <label>Send a test to<input type="email" value={to} onChange={(e) => setTo(e.target.value)} required /></label>
        <button className="btn" disabled={test.isPending}>{test.isPending ? "Sending…" : "Send test"}</button>
      </form>
      <form className="form mla-row" onSubmit={(e) => { e.preventDefault(); if (window.confirm(`Send "${c.subject}" to the next ${nf(count)} people${src ? ` from ${src}` : ""}?`)) send.mutate(); }}>
        <label>Send to the next<input type="number" min={1} max={5000} value={count} onChange={(e) => setCount(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))} /></label>
        <label>From<select value={src} onChange={(e) => setSrc(e.target.value)}><option value="">Everyone on the list</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        <button className="btn primary" disabled={send.isPending || c.remaining === 0}>{send.isPending ? "Queuing…" : "Send this batch"}</button>
      </form>
      <p className="faint mla-hint">A new sender's first mails should go in steps: about 500 on day one, 1,500 on day two, then the rest. Send yourself a test first.</p>
      {note && <p className="mla-ok" role="status">{note}</p>}{err && <p className="mla-err" role="alert">{err}</p>}
    </div>
  );
}
