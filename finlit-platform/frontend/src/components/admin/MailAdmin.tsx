// Console > Email: mail from contact@finlitventures.com through Amazon SES (finlit/mailer.py). Administrators only; the server checks the role
// and the authenticator code on every call.
// The founder (28 Nov 2026): "too much confusing to send ... make it easy to use, easy to send the mail". One screen, top to bottom:
//   1. what stands in the way, in plain words (not set up, SES test mode, the daily limit, a stopped send with Carry on);
//   2. "Send an email": who gets it (every FinLit member and/or an uploaded list, with the count), subject, message, an optional button, and
//      the mail as people will see it beside the form; two buttons: Send me a test, Send to N people. The draft saves itself.
//   3. the send in progress, then every mail sent before, each with its problems in plain words and "Try the failed ones again";
//   4. "Add people from a list" (paste or upload), folded away.
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiGet, apiSend, apiUrl } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import "../../styles/mailadmin.css";

type Campaign = { id: number; subject: string; body: string; why: string; button_text: string | null; button_url: string | null; format?: Format | null; from_name?: string | null; from_address?: string | null; created_at: string;
  queued: number; sent: number; failed: number; skipped: number; remaining: number };
type Account = { read: boolean; production?: boolean; sendingEnabled?: boolean; max24h?: number | null; sent24h?: number | null; maxPerSecond?: number | null; why?: string };
type Summary = { ready: boolean; from: string; ratePerSecond: number; sendingNow: boolean; halted?: { reason: string; error?: string; at?: string } | null;
  account?: Account; members?: { members: number; unconfirmed: number; mailable: number; optedout: number }; lists?: { source: string; n: number; out: number }[];
  contacts: { source: string; status: string; n: number }[]; campaigns: Campaign[]; errors: { campaign_id: number; error: string; plain?: string; n: number; last: string | null }[] };
type ImportResult = { rows: number; added: number; alreadyThere: number; duplicates: number; invalid: string[]; invalidCount: number; typos: string[]; typoCount: number;
  noMailServer: string[]; noMailServerCount: number };
type Format = "personal" | "plain" | "html";
type Draft = { subject: string; body: string; why: string; buttonText: string; buttonUrl: string; format: Format; fromName: string; fromAddress: string };

const msg = (e: unknown) => (e instanceof ApiError ? (typeof e.body.detail === "string" ? e.body.detail : e.body.status) || `Failed (${e.status})` : "Could not reach the server.");
const nf = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("en-IN"));
const MEMBERS = "FinLit members";
// "Hi there," (founder, 28 Nov 2026): no name is filled in unless the mail itself asks for one with {name}. Plain email first: a mail that reads like one
// person writing to another is the one Gmail most often keeps in Primary.
const EMPTY: Draft = { subject: "", body: "Hi there,\n\n", why: "", buttonText: "", buttonUrl: "", format: "personal", fromName: "", fromAddress: "" };
const DOMAIN = "finlitventures.com";
/** "Personal note" (founder, 28 Nov 2026: a plain-text test still landed in Promotions): no unsubscribe header, so small sends only. */
export const PERSONAL_MAX = 500;
/** The From address box holds the part before @finlitventures.com; empty means contact@. */
export const fromLocalOk = (v: string) => !v.trim() || /^[a-z0-9._-]{1,40}$/.test(v.trim().toLowerCase());
const DRAFT_KEY = "finlit-mail-draft";
// The same words the server refuses (finlit/mailer.py ADVICE): shown as the person types, so a send is never refused at the last step.
const ADVICE = /\b(buy|sell|hold|accumulate|avoid|reduce|target price|top pick|multibagger|sure[- ]shot|guaranteed returns?|best stocks?)\b/gi;
export const adviceWords = (...t: string[]) => [...new Set(t.flatMap((x) => (x.match(ADVICE) ?? []).map((w) => w.toLowerCase())))].sort();

/** The footer line "why you get this", from who the mail goes to. */
export function whyLine(members: boolean, sources: string[], hand = false): string {
  const parts = [members ? "have a FinLit account" : "", sources.length === 1 ? `registered for ${sources[0]}` : sources.length > 1 ? "gave us your address at a FinLit event" : "",
    hand ? "shared your email address with FinLit Ventures" : ""].filter(Boolean);
  return parts.length ? `You get this because you ${parts.join(" or ")}.` : "";
}

/** What still has to be filled in before the mail can go, in the order of the form. Empty when it is ready. `hand`: how many addresses are pasted
 *  under "These addresses" (when that choice is ticked). */
export function missing(f: Draft, n: number | null, members: boolean, sources: string[], hand = 0): string[] {
  const out: string[] = [];
  if (!members && !sources.length && !hand) out.push("choose who gets it");
  else if (n === 0) out.push("the people chosen have all had this mail or unsubscribed");
  if (f.subject.trim().length < 3) out.push("a subject");
  if (f.body.replace(/^\s*Hi (there|\{name\}),/, "").trim().length < 10 || f.body.trim().length < 20) out.push("the message");
  if (f.why.trim().length < 10) out.push("the 'why you get this' line (More options)");
  const bt = f.buttonText.trim(), bu = f.buttonUrl.trim();
  if (bt && !bu) out.push("the button's link");
  if (bu && !bt) out.push("the button's words");
  if (bu && !/^https:\/\/\S+$/.test(bu)) out.push("a button link that starts with https://");
  const bad = adviceWords(f.subject, f.body, bt);
  if (bad.length) out.push(`no advice words (${bad.join(", ")})`);
  return out;
}

function readDraft(): (Draft & { members?: boolean; sources?: string[]; whyEdited?: boolean; hand?: boolean; pasted?: string }) | null {
  try { const v = localStorage.getItem(DRAFT_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
function writeDraft(v: unknown) { try { if (v) localStorage.setItem(DRAFT_KEY, JSON.stringify(v)); else localStorage.removeItem(DRAFT_KEY); } catch { /* blocked storage: the draft just is not kept */ } }

/** The file as base64, for the JSON upload. */
function toBase64(f: File): Promise<string> {
  return new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",", 2)[1] || ""); r.onerror = () => fail(r.error); r.readAsDataURL(f); });
}

/** A stored mail back in the form (an unsent one, such as a mail written before this screen). */
export const draftOf = (c: Campaign): Draft => ({ subject: c.subject, body: c.body, why: c.why, buttonText: c.button_text ?? "", buttonUrl: c.button_url ?? "",
  format: c.format === "html" || c.format === "personal" ? c.format : "plain", fromName: c.from_name ?? "",
  fromAddress: (c.from_address ?? "").replace(`@${DOMAIN}`, "") });

export function MailAdmin() {
  const { user } = useAuth(), qc = useQueryClient();
  const [open, setOpen] = useState<Campaign | null>(null);   // an unsent mail opened into the form
  const s = useQuery<Summary>({ queryKey: ["mail-admin"], queryFn: () => apiGet("/api/admin/mail", { cache: "no-store" }), retry: false,
    refetchInterval: (q) => (q.state.data?.sendingNow ? 3000 : false) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["mail-admin"] });
  if (s.isError) return <div className="card mla"><p className="mla-err" role="alert">{msg(s.error)}</p></div>;
  if (!s.data) return <div className="card mla"><p className="muted">Loading…</p></div>;
  const d = s.data;
  const live = d.campaigns.find((c) => c.queued > 0);
  return (
    <div className="mla">
      <Status d={d} onChange={refresh} />
      {live && <Progress c={live} halted={!!d.halted} />}
      <Composer key={open ? `mail-${open.id}` : "new"} start={open} d={d} me={user?.email ?? ""} onSent={() => { setOpen(null); refresh(); }} onClose={() => setOpen(null)} />
      <History d={d} onChange={refresh} onOpen={(c) => { setOpen(c); document.querySelector("#mla-h")?.scrollIntoView?.({ behavior: "smooth" }); }} />
      <StopBox onDone={refresh} />
      <details className="card mla-sec mla-add">
        <summary><h3>Add people from a list</h3><span className="faint">Paste addresses or upload a CSV or Excel file (for example people from an event)</span></summary>
        <ListCounts d={d} />
        <Upload onDone={refresh} />
      </details>
      <p className="faint mla-foot">Plain and designed mails carry a one-click unsubscribe link; a personal note asks people to reply 'stop' (record it above). Anyone who unsubscribes is never mailed again. Nobody gets the same mail twice. Addresses that bounce or are marked as spam are held back by Amazon SES.</p>
    </div>
  );
}

/** What stands in the way, before anything is typed: set-up, test mode, the daily limit, a stopped send. */
function Status({ d, onChange }: { d: Summary; onChange: () => void }) {
  const resume = useMutation({ mutationFn: () => apiSend("POST", "/api/admin/mail/resume"), onSuccess: onChange });
  const a = d.account;
  const sandbox = !!(a?.read && a.production === false);
  const bad = !d.ready || !!d.halted || a?.sendingEnabled === false;
  return (
    <div className={"card mla-status " + (bad ? "bad" : sandbox ? "warn" : "ok")} role="status">
      <b>{!d.ready ? "Not set up" : d.halted ? "Sending stopped" : a?.sendingEnabled === false ? "Sending is paused by Amazon" : sandbox ? "Test mode" : "Ready to send"}</b>
      <span>{!d.ready ? "The Amazon SES key is missing on the server (SES_REGION, SES_ACCESS_KEY_ID and SES_SECRET_ACCESS_KEY in .env.aws). Nothing can be sent until it is added."
        : `From ${d.from} through Amazon SES.`}</span>
      {d.ready && a?.read && <span className="mla-quota">Daily limit: <b>{nf(a.max24h)}</b> mails · sent in the last 24 hours: <b>{nf(a.sent24h)}</b></span>}
      {d.ready && a && !a.read && <span className="faint">The Amazon SES account could not be read, so the daily limit is not shown; sending works as usual.</span>}
      {sandbox && !d.halted && <p className="mla-why">Amazon SES is in test mode (the sandbox): mail only reaches addresses verified in SES, so a test to yourself can arrive while a send to everyone stops at the first address. To send to everyone, open the AWS console, SES, Account dashboard, and press <b>Request production access</b>; Amazon usually answers within a day.</p>}
      {d.halted && <div className="mla-halt"><p>{d.halted.reason}</p>{d.halted.error && <p className="faint">Amazon SES said: {d.halted.error}</p>}
        <p className="faint">Nobody was marked as failed: everyone not reached yet is waiting, and goes when you carry on.</p>
        <button type="button" className="btn primary" disabled={resume.isPending} onClick={() => resume.mutate()}>{resume.isPending ? "Starting…" : "Carry on sending"}</button></div>}
      {d.sendingNow && <span className="mla-live">Sending now: this page updates by itself.</span>}
    </div>
  );
}

function Progress({ c, halted }: { c: Campaign; halted: boolean }) {
  const all = c.sent + c.failed + c.skipped + c.queued, pct = all ? Math.round(((c.sent + c.failed + c.skipped) / all) * 100) : 0;
  return (
    <section className="card mla-sec mla-prog" aria-label="The mail being sent">
      <h3>{halted ? "Stopped" : "Sending"}: {c.subject}</h3>
      <div className="mla-bar big" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Done so far"><i style={{ width: `${pct}%` }} /></div>
      <dl className="mla-counts big">
        <div><dt>Sent</dt><dd>{nf(c.sent)}</dd></div><div><dt>Still to go</dt><dd>{nf(c.queued)}</dd></div>
        <div><dt>Failed</dt><dd className={c.failed ? "bad" : ""}>{nf(c.failed)}</dd></div><div><dt>Skipped (unsubscribed)</dt><dd>{nf(c.skipped)}</dd></div>
      </dl>
      <p className="faint">{halted ? "Waiting: see the reason at the top of the page." : `About ${Math.max(1, Math.ceil(c.queued / 8 / 60))} minute${c.queued > 480 ? "s" : ""} to go. You can leave this page; sending carries on.`}</p>
    </section>
  );
}

type LeftOut = { invalid: string[]; typos: string[]; noMailServer: string[]; unsubscribed: string[] };
type TestResult = { status: string; sent?: string[]; failed?: { to: string; detail: string }[] };

/** "Send a test to": up to five addresses, separated by commas, semicolons or spaces. */
export function testAddresses(text: string): { list: string[]; ok: boolean; why: string } {
  const list = [...new Set(text.split(/[,;\s]+/).map((t) => t.trim().replace(/^<|>$/g, "").toLowerCase()).filter(Boolean))];
  const bad = list.filter((t) => !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(t));
  if (!list.length) return { list, ok: false, why: "Type an address for the test." };
  if (bad.length) return { list, ok: false, why: `Not an email address: ${bad.join(", ")}` };
  if (list.length > 5) return { list, ok: false, why: "A test goes to at most 5 addresses." };
  return { list, ok: true, why: "" };
}

/** Which pasted addresses were not mailed, and why (from the server's checks at send time). */
function LeftOutNote({ l }: { l: LeftOut }) {
  const rows: [string, string[]][] = [["not valid email addresses", l.invalid], ["look misspelt (for example gmial.com)", l.typos],
    ["have a domain that cannot receive mail", l.noMailServer], ["unsubscribed earlier, so they are never mailed", l.unsubscribed]];
  if (!rows.some(([, xs]) => xs?.length)) return null;
  return <div className="mla-res" role="status"><p><b>Some pasted addresses were left out:</b></p>
    {rows.map(([t, xs]) => (xs?.length ? <Left key={t} title={t} n={xs.length} xs={xs} /> : null))}</div>;
}

function Composer({ d, me, onSent, start, onClose }: { d: Summary; me: string; onSent: () => void; start?: Campaign | null; onClose?: () => void }) {
  const saved = useMemo(() => (start ? null : readDraft()), [start]);
  const lists = (d.lists ?? []).filter((l) => l.source !== MEMBERS);
  const [f, setF] = useState<Draft>(start ? draftOf(start) : saved ? { ...EMPTY, ...saved } : EMPTY);
  const [members, setMembers] = useState<boolean>(saved?.members ?? true);
  const [sources, setSources] = useState<string[]>((saved?.sources ?? []).filter((x) => lists.some((l) => l.source === x)));
  // "These addresses" (owner, 28 Nov 2026: "I can send the mail for like 5 to 6 persons ... just paste at there and send"): any addresses pasted here
  const [hand, setHand] = useState<boolean>(!!saved?.hand), [pasted, setPasted] = useState<string>(saved?.pasted ?? "");
  const paste = useMemo(() => parsePasted(pasted), [pasted]);
  const emails = useMemo(() => (hand ? [...new Set(paste.rows.map((r) => r.email.trim().toLowerCase()))] : []), [hand, paste]);
  const [testTo, setTestTo] = useState(me);
  useEffect(() => { if (me) setTestTo((t) => t || me); }, [me]);
  const [leftOut, setLeftOut] = useState<LeftOut | null>(null);
  const [whyEdited, setWhyEdited] = useState(start ? true : !!saved?.whyEdited);   // an opened mail keeps its own footer line
  const [steps, setSteps] = useState(false), [stepCount, setStepCount] = useState(500);
  const [id, setId] = useState<number | null>(start?.id ?? null);
  const [note, setNote] = useState(""), [err, setErr] = useState("");
  const [btnOpen, setBtnOpen] = useState(!!(f.buttonText || f.buttonUrl));

  // the footer follows who it goes to, until someone writes their own
  useEffect(() => { if (!whyEdited) setF((x) => ({ ...x, why: whyLine(members, sources, hand) })); }, [members, sources, hand, whyEdited]);
  useEffect(() => { if (!start) writeDraft({ ...f, members, sources, whyEdited, hand, pasted }); }, [f, members, sources, whyEdited, start, hand, pasted]);

  const chosen = members || sources.length > 0 || emails.length > 0;
  const aud = useQuery<{ n: number }>({ queryKey: ["mail-aud", members, sources.join("|"), emails.join("|")],
    queryFn: () => apiSend("POST", "/api/admin/mail/audience", { members, sources, emails }), enabled: chosen, retry: false });
  const n = chosen ? (aud.data?.n ?? null) : 0;

  const [pv, setPv] = useState<{ html: string; adviceWords: string[]; from?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { apiSend<{ html: string; adviceWords: string[]; from?: string }>("POST", "/api/admin/mail/preview", { ...f, fromName: f.fromName.trim() || null, fromAddress: f.fromAddress.trim() || null }).then(setPv).catch(() => setPv(null)); }, 400);
    return () => clearTimeout(timer.current);
  }, [f]);

  const todo = [...missing(f, n, members, sources, emails.length),
    ...(f.format === "personal" && n != null && n > PERSONAL_MAX ? [`at most ${nf(PERSONAL_MAX)} people for a personal note (choose Plain email for more: it keeps the one-click unsubscribe Gmail requires of bulk senders)`] : []),
    ...(fromLocalOk(f.fromAddress) ? [] : [`a From address of letters, digits, dots or dashes before @${DOMAIN}`])];
  const bad = adviceWords(f.subject, f.body, f.buttonText);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setF({ ...f, [k]: e.target.value }); setNote(""); };
  const plain = f.format !== "html";   // text only: a personal note or a plain email
  const toggle = (src: string) => setSources((xs) => (xs.includes(src) ? xs.filter((x) => x !== src) : [...xs, src]));

  /** Save the draft as a mail (a new one once the last one has gone out), returning its id. */
  async function save(): Promise<number> {
    const body = { ...f, buttonText: f.buttonText.trim() || null, buttonUrl: f.buttonUrl.trim() || null, fromName: f.fromName.trim() || null,
      fromAddress: f.fromAddress.trim().toLowerCase() || null };
    if (id) {
      try { await apiSend("POST", `/api/admin/mail/campaigns?id=${id}`, body); return id; } catch (e) { if (!(e instanceof ApiError && e.status === 409)) throw e; }
    }
    const r = await apiSend<{ id: number }>("POST", "/api/admin/mail/campaigns", body);
    setId(r.id);
    return r.id;
  }
  const tests = testAddresses(testTo);
  const test = useMutation({
    mutationFn: async (to: string) => { const cid = await save(); return apiSend<TestResult>("POST", `/api/admin/mail/campaigns/${cid}/test`, { to }); },
    onSuccess: (r, to) => {
      const ok = r.sent?.length ? r.sent : [to];
      setErr(r.failed?.length ? r.failed.map((x) => `${x.to}: ${x.detail}`).join(" · ") : "");
      setNote(`Test sent to ${ok.join(", ")}. Look in ${ok.length === 1 ? "that inbox" : "those inboxes"} (and Spam) in a minute.`);
    },
    onError: (e) => { setErr(msg(e)); setNote(""); } });
  const send = useMutation({
    mutationFn: async () => { const cid = await save(); return apiSend<{ queued: number; leftOut?: LeftOut }>("POST", `/api/admin/mail/campaigns/${cid}/send`,
      { members, sources, emails: emails.length ? emails : undefined, count: steps ? stepCount : undefined }); },
    onSuccess: (r) => {
      setErr("");
      setLeftOut(r.leftOut ?? null);
      setNote(r.queued ? `Sending to ${nf(r.queued)} ${r.queued === 1 ? "person" : "people"}: see the progress at the top.` : "Everyone chosen already has this mail.");
      if (r.queued) { setF({ ...EMPTY, why: whyEdited ? f.why : whyLine(members, sources, hand) }); setId(null); setBtnOpen(false); setPasted(""); writeDraft(null); document.querySelector(".mla")?.scrollIntoView?.({ behavior: "smooth" }); }
      onSent();
    },
    onError: (e) => { setErr(msg(e)); setNote(""); },
  });
  const go = () => {
    if (todo.length) return;
    const who = steps ? `the next ${nf(Math.min(stepCount, n ?? stepCount))} of ${nf(n)} people` : `${nf(n)} ${n === 1 ? "person" : "people"}`;
    if (window.confirm(`Send "${f.subject.trim()}" to ${who} now?\n\nThis cannot be undone.`)) send.mutate();
  };

  return (
    <section className="card mla-sec mla-compose" aria-labelledby="mla-h">
      <div className="mla-camp-h"><h3 id="mla-h">{start ? `Send an email: ${start.subject}` : "Send an email"}</h3>
        {start && <button type="button" className="btn small" onClick={onClose}>Start a new mail instead</button>}</div>
      <div className="mla-grid">
        <form className="form mla-form" onSubmit={(e) => { e.preventDefault(); go(); }}>
          <fieldset className="mla-to">
            <legend>To</legend>
            <label className="mla-check"><input type="checkbox" checked={members} onChange={(e) => setMembers(e.target.checked)} />
              <span><span className="mla-who"><b>All FinLit members</b> <span className="mla-n">{nf(d.members?.mailable ?? 0)}</span></span>
                {d.members && (d.members.unconfirmed > 0 || d.members.optedout > 0) && <small className="faint">{[d.members.unconfirmed ? `${nf(d.members.unconfirmed)} have not confirmed their address yet` : "", d.members.optedout ? `${nf(d.members.optedout)} unsubscribed and are left out` : ""].filter(Boolean).join(" · ")}</small>}</span></label>
            {lists.map((l) => <label key={l.source} className="mla-check"><input type="checkbox" checked={sources.includes(l.source)} onChange={() => toggle(l.source)} />
              <span><span className="mla-who"><b>{l.source}</b> <span className="mla-n">{nf(l.n)}</span></span></span></label>)}
            <label className="mla-check"><input type="checkbox" checked={hand} onChange={(e) => setHand(e.target.checked)} />
              <span><span className="mla-who"><b>These addresses</b>{hand && emails.length > 0 && <span className="mla-n">{nf(emails.length)}</span>}</span>
                <small className="faint">Paste the addresses of the people you want: one or many.</small></span></label>
            {hand && <label className="mla-paste">Email addresses<textarea value={pasted} onChange={(e) => { setPasted(e.target.value); setNote(""); }} rows={4} spellCheck={false}
              placeholder={"priya@example.com, rahul@example.com\nAnu Shah <anu@example.com>"} />
              <small className="faint" aria-live="polite">{emails.length ? `${nf(emails.length)} ${emails.length === 1 ? "address" : "addresses"} found` : "No address yet"}{paste.skipped.length ? ` · ${nf(paste.skipped.length)} not ${paste.skipped.length === 1 ? "an address" : "addresses"} (left out)` : ""}. One per line, or separated by commas or semicolons.</small></label>}
            {!lists.length && !hand && <small className="faint">To mail a whole list (for example from an event), add it under "Add people from a list" below.</small>}
            <p className="mla-total" aria-live="polite">{!chosen ? "Choose who gets it." : n == null ? "Counting…" : <>Will go to <b>{nf(n)}</b> {n === 1 ? "person" : "people"}{[members, sources.length > 0, emails.length > 0].filter(Boolean).length > 1 ? " (each person once)" : ""}.</>}</p>
          </fieldset>
          <fieldset className="mla-to mla-fmt">
            <legend>Kind of email</legend>
            <label className="mla-check"><input type="radio" name="mla-fmt" checked={f.format === "personal"} onChange={() => setF({ ...f, format: "personal" })} />
              <span><b>Personal note</b><small className="faint">Reads like a mail from a person: exactly your text, no unsubscribe header and no footer. The best chance of Gmail's Primary tab for small sends (up to {nf(PERSONAL_MAX)} people). Gmail still decides per person.</small></span></label>
            <label className="mla-check"><input type="radio" name="mla-fmt" checked={f.format === "plain"} onChange={() => setF({ ...f, format: "plain" })} />
              <span><b>Plain email</b><small className="faint">Text only, with the one-click unsubscribe link and footer: for big sends (Gmail requires one-click unsubscribe from bulk senders). Links are written out.</small></span></label>
            <label className="mla-check"><input type="radio" name="mla-fmt" checked={f.format === "html"} onChange={() => setF({ ...f, format: "html" })} />
              <span><b>Designed email with a button</b><small className="faint">Styled, with a green button. Gmail more often files designed mail under Promotions.</small></span></label>
            <small className="faint">Gmail decides the tab for each person, so Primary is likely, not guaranteed. A short personal mail with few links has the best chance.</small>
          </fieldset>
          <div className="mla-two">
            <label>From name <span className="faint">(optional)</span><input value={f.fromName} onChange={set("fromName")} maxLength={80} placeholder="FinLit Ventures (e.g. Pranshu from FinLit Ventures)" /></label>
            <label>From address <span className="faint">(optional)</span><span className="mla-addr"><input value={f.fromAddress} onChange={set("fromAddress")} maxLength={40} spellCheck={false} placeholder="contact" aria-describedby="mla-addr-d" /><span id="mla-addr-d">@{DOMAIN}</span></span></label>
          </div>
          <label>Subject<input value={f.subject} onChange={set("subject")} maxLength={150} placeholder="e.g. FinLit is open: your account is ready" /></label>
          <label>Message<textarea rows={10} value={f.body} onChange={set("body")} maxLength={20000} /></label>
          <p className="faint mla-hint">Write it as you would to one person. Only if you type {"{name}"} is it replaced by each person's first name ("there" when it is not known). A blank line starts a new paragraph.</p>
          {bad.length > 0 && <p className="mla-err" role="alert">Please take out: <b>{bad.join(", ")}</b>. FinLit describes; it never advises, so a mail with these words cannot be sent.</p>}
          <details className="mla-more" open={btnOpen} onToggle={(e) => setBtnOpen((e.target as HTMLDetailsElement).open)}>
            <summary>{plain ? "Add a link line" : "Add a button"}</summary>
            {plain && <small className="faint">In a plain email this is one line under the message: "words: link".</small>}
            <div className="mla-two">
              <label>{plain ? "Words" : "Button words"}<input value={f.buttonText} onChange={set("buttonText")} maxLength={60} placeholder="e.g. Open FinLit" /></label>
              <label>{plain ? "Link" : "Button link"}<input value={f.buttonUrl} onChange={set("buttonUrl")} maxLength={500} placeholder="https://finlitventures.com" /></label>
            </div>
          </details>
          <details className="mla-more">
            <summary>More options</summary>
            <label>Why they get this (shown at the foot, next to Unsubscribe)<input value={f.why} onChange={(e) => { setWhyEdited(true); set("why")(e); }} maxLength={300} /></label>
            {whyEdited && <button type="button" className="btn small" onClick={() => setWhyEdited(false)}>Use the automatic line</button>}
            <label className="mla-check"><input type="checkbox" checked={steps} onChange={(e) => setSteps(e.target.checked)} />
              <span>Send in steps <small className="faint">For a new sender: about 500 on the first day, 1,500 the next, then the rest. Send again later to reach the next people; nobody gets it twice.</small></span></label>
            {steps && <label>People in this step<input type="number" min={1} max={100000} value={stepCount} onChange={(e) => setStepCount(Math.max(1, Math.min(100000, Number(e.target.value) || 1)))} /></label>}
          </details>
          <div className="mla-acts mla-send">
            <button type="button" className="btn" disabled={test.isPending || send.isPending || missing(f, 1, true, []).length > 0 || !me} onClick={() => test.mutate(me)}>{test.isPending ? "Sending the test…" : "Send me a test"}</button>
            <button type="submit" className="btn primary" disabled={todo.length > 0 || send.isPending || !d.ready}>{send.isPending ? "Starting…" : `Send to ${n == null ? "…" : nf(n)} ${n === 1 ? "person" : "people"}`}</button>
          </div>
          <div className="mla-row mla-testto">
            <label>Send a test to <small className="faint">(up to 5, separated by commas)</small><input value={testTo} onChange={(e) => setTestTo(e.target.value)} spellCheck={false} placeholder="you@example.com, colleague@example.com" /></label>
            <button type="button" className="btn" disabled={test.isPending || send.isPending || missing(f, 1, true, []).length > 0 || !tests.ok} onClick={() => test.mutate(tests.list.join(", "))}>Send test</button>
          </div>
          {!tests.ok && testTo.trim() !== "" && <p className="faint mla-todo">{tests.why}</p>}
          {todo.length > 0 && <p className="faint mla-todo">Still needed: {todo.join(" · ")}.</p>}
          {note && <p className="mla-ok" role="status">{note}</p>}{err && <p className="mla-err" role="alert">{err}</p>}
          {leftOut && <LeftOutNote l={leftOut} />}
        </form>
        <div className="mla-look">
          <p className="faint">How it looks{f.body.includes("{name}") ? " ({name} shown with your own first name)" : ""}</p>
          {pv ? <iframe className="mla-frame" title="How the mail looks" srcDoc={pv.html} sandbox="" /> : <p className="muted">Write something to see it here.</p>}
          <p className="faint">From: <b>{pv?.from ?? d.from}</b> · Subject: <b>{f.subject || "(no subject yet)"}</b></p>
        </div>
      </div>
    </section>
  );
}

/** The mail as sent, from the server, in a sandboxed frame: no scripts, no links followed from inside it. */
function Preview({ id, subject }: { id: number; subject: string }) {
  const q = useQuery({ queryKey: ["mail-preview", id], queryFn: async () => {
    const r = await fetch(apiUrl(`/api/admin/mail/campaigns/${id}/preview`), { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) throw new Error(`The mail could not be loaded (${r.status}).`);
    return r.text();
  }, retry: false });
  if (q.isError) return <p className="mla-err" role="alert">{(q.error as Error).message}</p>;
  return q.data ? <iframe className="mla-frame" title={`The mail: ${subject}`} srcDoc={q.data} sandbox="" /> : <p className="muted">Loading the mail…</p>;
}

function History({ d, onChange, onOpen }: { d: Summary; onChange: () => void; onOpen: (c: Campaign) => void }) {
  const started = (c: Campaign) => c.sent + c.failed + c.skipped + c.queued > 0;
  const done = d.campaigns.filter(started), drafts = d.campaigns.filter((c) => !started(c));
  return (<>
    {drafts.length > 0 && <section className="card mla-sec" aria-labelledby="mla-drafts">
      <h3 id="mla-drafts">Saved, not sent yet</h3>
      {drafts.map((c) => <div key={c.id} className="mla-camp mla-draft">
        <div className="mla-camp-h"><b>{c.subject}</b><span className="faint">Mail {c.id} · {c.format === "html" ? "Designed email" : c.format === "personal" ? "Personal note" : "Plain email"}</span></div>
        <div className="mla-acts"><button type="button" className="btn small primary" onClick={() => onOpen(c)}>Open in the form</button></div>
      </div>)}
    </section>}
    {done.length > 0 && <section className="card mla-sec" aria-labelledby="mla-hist">
      <h3 id="mla-hist">Mails sent</h3>
      {done.map((c) => <Sent key={c.id} c={c} errors={d.errors.filter((e) => e.campaign_id === c.id)} onChange={onChange} />)}
    </section>}
  </>);
}

function Sent({ c, errors, onChange }: { c: Campaign; errors: Summary["errors"]; onChange: () => void }) {
  const [look, setLook] = useState(false), [note, setNote] = useState(""), [err, setErr] = useState("");
  const retry = useMutation({ mutationFn: () => apiSend<{ queued: number }>("POST", `/api/admin/mail/campaigns/${c.id}/retry`),
    onSuccess: (r) => { setErr(""); setNote(`${nf(r.queued)} queued again.`); onChange(); }, onError: (e) => setErr(msg(e)) });
  const day = new Date(c.created_at);
  return (
    <div className="mla-camp">
      <div className="mla-camp-h"><b>{c.subject}</b><span className="faint">{isNaN(+day) ? "" : day.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span></div>
      <dl className="mla-counts">
        <div><dt>Sent</dt><dd>{nf(c.sent)}</dd></div>{c.queued > 0 && <div><dt>Still to go</dt><dd>{nf(c.queued)}</dd></div>}
        <div><dt>Failed</dt><dd className={c.failed ? "bad" : ""}>{nf(c.failed)}</dd></div><div><dt>Skipped (unsubscribed)</dt><dd>{nf(c.skipped)}</dd></div>
      </dl>
      {errors.length > 0 && <div className="mla-err" role="alert"><b>Why some failed</b><ul>{errors.map((e) => <li key={e.error}>{nf(e.n)} × {e.plain ?? e.error}</li>)}</ul></div>}
      <div className="mla-acts">
        <button type="button" className="btn small" aria-expanded={look} onClick={() => setLook(!look)}>{look ? "Hide the mail" : "Look at the mail"}</button>
        {c.failed > 0 && <button type="button" className="btn small" disabled={retry.isPending} onClick={() => retry.mutate()}>{retry.isPending ? "Queuing…" : "Try the failed ones again"}</button>}
      </div>
      {look && <Preview id={c.id} subject={c.subject} />}
      {note && <p className="mla-ok" role="status">{note}</p>}{err && <p className="mla-err" role="alert">{err}</p>}
    </div>
  );
}

const STATUS_WORD: Record<string, string> = { active: "Can be mailed", unsubscribed: "Unsubscribed", bounced: "Bounced", complained: "Marked as spam" };
function ListCounts({ d }: { d: Summary }) {
  const sources = [...new Set(d.contacts.map((c) => c.source))];
  if (!sources.length) return null;
  return <div className="tw"><table className="admin-t"><thead><tr><th scope="col">Where they gave their address</th>{Object.keys(STATUS_WORD).map((k) => <th key={k} scope="col" className="num">{STATUS_WORD[k]}</th>)}</tr></thead>
    <tbody>{sources.map((src) => <tr key={src}><th scope="row">{src}</th>{Object.keys(STATUS_WORD).map((k) => <td key={k} className="num">{nf(d.contacts.find((c) => c.source === src && c.status === k)?.n ?? 0)}</td>)}</tr>)}</tbody></table></div>;
}

// Pasted addresses (owner, 25 Nov 2026): one or many, one per line or separated by commas or semicolons, each either an address or "Name <address>".
// They become a small CSV (email, name) and go through the same import as a file, so the same checks run and nobody is added twice.
export function parsePasted(text: string): { rows: { email: string; name: string }[]; skipped: string[] } {
  const rows: { email: string; name: string }[] = [], skipped: string[] = [];
  const parts: string[] = [];
  let cur = "", quoted = false, angle = false;     // a comma inside "Shah, Priya" or <...> does not split
  for (const ch of text) {
    if (ch === '"') quoted = !quoted; else if (ch === "<") angle = true; else if (ch === ">") angle = false;
    if (ch === "\n" || ch === "\r" || ((ch === "," || ch === ";") && !quoted && !angle)) { parts.push(cur); cur = ""; quoted = false; angle = false; } else cur += ch;
  }
  parts.push(cur);
  for (const raw of parts) {
    const t = raw.trim();
    if (!t) continue;
    const m = t.match(/^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
    if (m) { rows.push({ email: m[2], name: m[1].trim().replace(/^["']|["']$/g, "") }); continue; }
    if (t.includes("@") && !/\s/.test(t)) rows.push({ email: t, name: "" });
    else skipped.push(t);
  }
  return { rows, skipped };
}
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export const pastedCsv = (rows: { email: string; name: string }[]) => ["email,name", ...rows.map((r) => `${csvCell(r.email)},${csvCell(r.name)}`)].join("\n") + "\n";
const textBase64 = (t: string) => { const b = new TextEncoder().encode(t); let s = ""; b.forEach((x) => { s += String.fromCharCode(x); }); return btoa(s); };

/** Someone replied 'stop' to a personal note: record it, and they are never mailed again (an address not on the list yet is added as unsubscribed). */
function StopBox({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState(""), [note, setNote] = useState(""), [err, setErr] = useState("");
  const go = useMutation({ mutationFn: () => apiSend<{ email: string; droppedFromQueue: number }>("POST", "/api/admin/mail/unsubscribe", { email: email.trim() }),
    onSuccess: (r) => { setErr(""); setNote(`${r.email} is unsubscribed and will never be mailed again.${r.droppedFromQueue ? ` ${nf(r.droppedFromQueue)} queued mail to them was dropped.` : ""}`); setEmail(""); onDone(); },
    onError: (e) => { setErr(msg(e)); setNote(""); } });
  return (
    <details className="card mla-sec mla-add">
      <summary><h3>Unsubscribe an address</h3><span className="faint">Someone replied 'stop'? Record it here so they are never mailed again</span></summary>
      <form className="form mla-row mla-testto" onSubmit={(e) => { e.preventDefault(); if (email.trim()) go.mutate(); }}>
        <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" required /></label>
        <button className="btn" disabled={go.isPending || !email.trim()}>{go.isPending ? "Saving…" : "Unsubscribe"}</button>
      </form>
      {note && <p className="mla-ok" role="status">{note}</p>}{err && <p className="mla-err" role="alert">{err}</p>}
    </details>
  );
}

function Upload({ onDone }: { onDone: () => void }) {
  const [source, setSource] = useState(""), [file, setFile] = useState<File | null>(null), [res, setRes] = useState<ImportResult | null>(null), [err, setErr] = useState("");
  const [mode, setMode] = useState<"paste" | "file">("paste"), [pasted, setPasted] = useState(""), [skipped, setSkipped] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const parsed = parsePasted(pasted);
  const go = useMutation({
    mutationFn: async () => mode === "paste"
      ? apiSend<ImportResult>("POST", "/api/admin/mail/import", { filename: "pasted.csv", data: textBase64(pastedCsv(parsed.rows)), source })
      : apiSend<ImportResult>("POST", "/api/admin/mail/import", { filename: file!.name, data: await toBase64(file!), source }),
    onSuccess: (r) => { setRes(r); setErr(""); if (mode === "paste") { setSkipped(parsed.skipped); setPasted(""); } else { setSkipped([]); setFile(null); if (input.current) input.current.value = ""; } onDone(); },
    onError: (e) => { setErr(msg(e)); setRes(null); },
  });
  const ready = source.trim().length >= 3 && (mode === "paste" ? parsed.rows.length > 0 : !!file);
  return (
    <form className="form mla-form" onSubmit={(e) => { e.preventDefault(); if (ready) go.mutate(); }}>
      <div className="mla-mode" role="radiogroup" aria-label="How to add them">
        <label><input type="radio" name="mla-mode" checked={mode === "paste"} onChange={() => { setMode("paste"); setErr(""); }} />Paste addresses</label>
        <label><input type="radio" name="mla-mode" checked={mode === "file"} onChange={() => { setMode("file"); setErr(""); }} />Upload a file</label>
      </div>
      <p className="muted">{mode === "paste"
        ? "Paste one address or many: one per line, or separated by commas or semicolons. \"Priya Shah <priya@example.com>\" keeps the name too. Adding the same people again adds nobody twice."
        : "A CSV or Excel file with a column whose heading contains \"email\" (and, if you have it, \"name\"). Up to 5 MB. Uploading the same people again adds nobody twice."}</p>
      <label>Name of this list: where these people gave their address<input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. XYZ Hackathon, Oct 2026" maxLength={160} required minLength={3} /></label>
      {mode === "paste"
        ? <label>Email addresses<textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6} placeholder={"priya@example.com\nRahul Verma <rahul@example.com>\nanu@example.com, dev@example.com"} spellCheck={false} />
            <small className="faint" aria-live="polite">{parsed.rows.length ? `${nf(parsed.rows.length)} ${parsed.rows.length === 1 ? "address" : "addresses"} found` : "No address yet"}{parsed.skipped.length ? ` · ${nf(parsed.skipped.length)} ${parsed.skipped.length === 1 ? "piece is" : "pieces are"} not an address and will be left out` : ""}</small></label>
        : <label>File<input ref={input} type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required /></label>}
      <button className="btn primary" disabled={!ready || go.isPending}>{go.isPending ? "Checking the list…" : "Check and add"}</button>
      {err && <p className="mla-err" role="alert">{err}</p>}
      {res && <div className="mla-res" role="status">
        <p><b>{nf(res.added)} added</b> of {nf(res.rows)} rows. {res.alreadyThere ? `${nf(res.alreadyThere)} were already on the list. ` : ""}{res.duplicates ? `${nf(res.duplicates)} repeated in the file. ` : ""}The list can now be chosen under "To" above.</p>
        <Left title="not valid email addresses" n={res.invalidCount} xs={res.invalid} />
        <Left title="look misspelt (for example gmial.com); fix them and add them again" n={res.typoCount} xs={res.typos} />
        <Left title="have a domain that cannot receive mail" n={res.noMailServerCount} xs={res.noMailServer} />
        <Left title="not an address (no @ in it)" n={skipped.length} xs={skipped.slice(0, 50)} />
      </div>}
    </form>
  );
}

function Left({ title, n, xs }: { title: string; n: number; xs: string[] }) {
  if (!n) return null;
  return <details className="mla-left"><summary>{nf(n)} left out: {title}</summary><p>{xs.join(", ")}{n > xs.length ? ` and ${nf(n - xs.length)} more` : ""}</p></details>;
}
