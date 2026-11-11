import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { apiSend, ApiError } from "../lib/api";
import { DEMO } from "../lib/demo";
import { Icon } from "../lib/icons";
import { useDocTitle } from "../lib/title";
import { EMPTY, FEATURES, IMPROVE, MAX_TEXT, STEPS, WANTED, payload, problems, starWord, toggle, type Form } from "../lib/feedback";
import "../styles/feedback.css";

function Stars({ id, label, value, onChange, required }: { id: string; label: string; value: number; onChange: (n: number) => void; required?: boolean }) {
  return (
    <fieldset className="fb-q fb-stars" aria-required={required}>
      <legend id={id}>{label}{required && <i aria-hidden="true"> *</i>}</legend>
      <div className="fb-row" role="radiogroup" aria-labelledby={id}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} of 5, ${starWord(n)}`} className={"fb-star" + (n <= value ? " on" : "")} onClick={() => onChange(value === n ? 0 : n)}>
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></svg></button>))}
        <span className="fb-word" aria-live="polite">{starWord(value)}</span>
      </div>
    </fieldset>
  );
}

function Chips({ legend, hint, options, value, onToggle }: { legend: string; hint?: string; options: string[]; value: string[]; onToggle: (v: string) => void }) {
  return (
    <fieldset className="fb-q"><legend>{legend}{hint && <small> {hint}</small>}</legend>
      <div className="fb-chips">{options.map((o) => <label key={o} className={"fb-chip" + (value.includes(o) ? " on" : "")}><input type="checkbox" checked={value.includes(o)} onChange={() => onToggle(o)} /><span>{o}</span></label>)}</div>
    </fieldset>
  );
}

function Text({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="fb-q"><label htmlFor={id}>{label}</label>
      <textarea id={id} rows={3} maxLength={MAX_TEXT} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {value.length > MAX_TEXT * 0.8 && <small className="fb-count">{value.length} / {MAX_TEXT}</small>}</div>
  );
}

function YesNo({ legend, value, onChange }: { legend: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <fieldset className="fb-q"><legend>{legend}</legend>
      <div className="fb-seg" role="radiogroup" aria-label={legend}>{([[true, "Yes"], [false, "No"]] as const).map(([v, l]) => <button key={l} type="button" role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}</div>
    </fieldset>
  );
}

/** "Help us build a smarter FinLit": a three-step feedback form (overall experience, features and improvements, final thoughts). Answers are saved on our server; the email is kept only if the person asks to be contacted. */
export function FeedbackPage() {
  useDocTitle("Help us build a smarter FinLit", "Tell us what works, what is confusing and what is missing in FinLit. It takes three to five minutes and goes straight to the team.");
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(EMPTY);
  const [shown, setShown] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [trap, setTrap] = useState("");
  const top = useRef<HTMLDivElement>(null);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => { setF((p) => ({ ...p, [k]: v })); if (shown.length) setShown([]); };
  useEffect(() => { top.current?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }, [step, state]);

  const next = () => { const p = problems(step, f); if (p.length) { setShown(p); return; } setShown([]); setStep(step + 1); };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = [0, 1, 2].flatMap((s) => problems(s, f));
    if (p.length) { setShown(p); const first = [0, 1, 2].find((s) => problems(s, f).length); if (first != null) setStep(first); return; }
    setState("busy"); setMsg("");
    try { if (!DEMO) await apiSend("POST", "/api/feedback", payload(f, trap)); setState("done"); }
    catch (er) { setState("error"); setMsg(er instanceof ApiError && er.status === 429 ? "Too many tries from this network. Please try again in a little while." : er instanceof ApiError && er.status === 422 ? er.message || "Please check your answers." : "We could not send that just now. Your answers are still here: please try again."); }
  }

  return (
    <div className="wrap fb">
      <aside className="fb-side" aria-label="About this page">
        <span className="fb-pill"><Icon name="chat" /> Feedback</span>
        <h1>Help us build a <em>smarter FinLit</em></h1>
        <p>Your feedback helps us improve existing features, fix what does not work, and build what matters next.</p>
        <ul>
          <li><Icon name="spark" /><span><b>Product improvements</b>based on real user input</span></li>
          <li><Icon name="layers" /><span><b>Shape upcoming features</b>and priorities</span></li>
          <li><Icon name="lock" /><span><b>Your responses are private</b>and used only for product enhancement</span></li>
        </ul>
        <svg className="fb-art" viewBox="0 0 300 90" aria-hidden="true"><defs><linearGradient id="fbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--gold)" stopOpacity=".35" /><stop offset="1" stopColor="var(--gold)" stopOpacity="0" /></linearGradient></defs>
          <path d="M0 80 40 62 80 68 120 40 160 48 200 24 240 30 300 8V90H0z" fill="url(#fbg)" /><path d="M0 80 40 62 80 68 120 40 160 48 200 24 240 30 300 8" fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </aside>

      <main className="fb-card" ref={top}>
        {state === "done" ? (
          <div className="fb-done" role="status"><span className="fb-ok"><Icon name="check" /></span><h2>Thank you</h2>
            <p>Your feedback has reached the team. We read every response, and it helps decide what we build next.{f.contact_ok && f.email.trim() ? " We will write to you at the address you gave." : ""}</p>
            <div className="fb-actions"><Link className="btn primary" to="/dashboard">Back to FinLit <Icon name="arrow" /></Link></div></div>
        ) : (
          <form onSubmit={submit} noValidate>
            <header className="fb-head"><h2><Icon name="chat" /> Share your feedback</h2><span><Icon name="calendar" /> Takes 3 to 5 minutes</span></header>
            <ol className="fb-steps" aria-label="Progress">{STEPS.map((s, i) => <li key={s} className={i === step ? "now" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}><i>{i < step ? <Icon name="check" /> : i + 1}</i><span>{s}</span></li>)}</ol>
            <div className="fb-bar" aria-hidden="true"><i style={{ width: `${((step + (state === "busy" ? 1 : 0)) / 3) * 100}%` }} /></div>

            {step === 0 && <section className="fb-sec" aria-label={STEPS[0]}>
              <div className="fb-two">
                <Stars id="q-rate" label="How would you rate your overall experience with FinLit Ventures?" value={f.rating} onChange={set("rating")} required />
                <fieldset className="fb-q fb-npsq" aria-required><legend id="q-nps">How likely are you to recommend FinLit Ventures to a friend or colleague?<i aria-hidden="true"> *</i></legend>
                  <div className="fb-nps" role="radiogroup" aria-labelledby="q-nps">{Array.from({ length: 11 }, (_, n) => <button key={n} type="button" role="radio" aria-checked={f.nps === n} className={f.nps === n ? "on" : ""} onClick={() => set("nps")(n)}>{n}</button>)}</div>
                  <div className="fb-ends"><span>Not likely</span><span>Very likely</span></div></fieldset>
              </div>
              <div className="fb-three">
                <Stars id="q-nav" label="Ease of navigation" value={f.navigation} onChange={set("navigation")} required />
                <Stars id="q-data" label="Quality and depth of data" value={f.data_quality} onChange={set("data_quality")} required />
                <Stars id="q-tools" label="Usefulness of analysis and tools" value={f.tools} onChange={set("tools")} required />
              </div>
              <Stars id="q-speed" label="Speed and performance (optional)" value={f.speed} onChange={set("speed")} />
            </section>}

            {step === 1 && <section className="fb-sec" aria-label={STEPS[1]}>
              <Chips legend="Which FinLit features have you used?" hint="(select all that apply)" options={FEATURES} value={f.used} onToggle={(v) => { setF((p) => ({ ...p, used: toggle(p.used, v), most_valuable: toggle(p.used, v).includes(p.most_valuable) ? p.most_valuable : "" })); setShown([]); }} />
              <div className="fb-two">
                <div className="fb-q"><label htmlFor="q-most">Which feature gives you the most value?{f.used.length > 0 && <i aria-hidden="true"> *</i>}</label>
                  <select id="q-most" value={f.most_valuable} disabled={!f.used.length} onChange={(e) => set("most_valuable")(e.target.value)}><option value="">{f.used.length ? "Select a feature" : "Choose the features you used first"}</option>{f.used.map((u) => <option key={u}>{u}</option>)}</select></div>
                <Text id="q-hard" label="Is there any feature that you find difficult to understand or use?" value={f.hard_to_use} onChange={set("hard_to_use")} placeholder="Tell us which one and what confused you" />
              </div>
              <Chips legend="What would you most like us to improve?" hint="(select all that apply)" options={IMPROVE} value={f.improve} onToggle={(v) => set("improve")(toggle(f.improve, v))} />
              <Chips legend="What new features would you like to see on FinLit?" hint="(select all that apply)" options={WANTED} value={f.wanted} onToggle={(v) => set("wanted")(toggle(f.wanted, v))} />
            </section>}

            {step === 2 && <section className="fb-sec" aria-label={STEPS[2]}>
              <div className="fb-two">
                <Text id="q-like" label="What do you like most about FinLit Ventures?" value={f.likes} onChange={set("likes")} placeholder="A particular feature, the depth of analysis, the interface…" />
                <Text id="q-fix" label="What is one thing we should improve immediately?" value={f.fix_now} onChange={set("fix_now")} placeholder="The one change that would help you most" />
              </div>
              <Text id="q-exp" label="Is there anything you expected to find but could not?" value={f.expected} onChange={set("expected")} placeholder="A tool, a number, a page…" />
              <div className="fb-two">
                <YesNo legend="Would you like to join early access testing for upcoming features?" value={f.early_access} onChange={set("early_access")} />
                <YesNo legend="Would you like our team to contact you about your feedback?" value={f.contact_ok} onChange={set("contact_ok")} />
              </div>
              {f.contact_ok && <div className="fb-q"><label htmlFor="q-mail">Your email (optional)</label><input id="q-mail" type="email" inputMode="email" autoComplete="email" maxLength={254} value={f.email} placeholder="you@example.com" onChange={(e) => set("email")(e.target.value)} />
                <small>Used only to reply to this feedback. Leave it empty to stay anonymous.</small></div>}
              <input className="fb-trap" aria-label="Leave this field empty" tabIndex={-1} autoComplete="off" aria-hidden="true" value={trap} onChange={(e) => setTrap(e.target.value)} name="website" />
            </section>}

            {shown.length > 0 && <ul className="fb-err" role="alert">{shown.map((p) => <li key={p}>{p}</li>)}</ul>}
            {state === "error" && <p className="fb-err" role="alert">{msg}</p>}
            <footer className="fb-foot">
              {step > 0 ? <button type="button" className="btn" onClick={() => { setShown([]); setStep(step - 1); }}>← Back</button> : <span className="fb-priv"><Icon name="lock" /> Private. Only the FinLit team sees it.</span>}
              {step < 2 ? <button key="continue" type="button" className="btn primary lg" onClick={next}>Continue <Icon name="arrow" /></button>
                : <button key="submit" type="submit" className="btn primary lg" disabled={state === "busy"}>{state === "busy" ? "Sending…" : "Submit feedback"} <Icon name="arrow" /></button>}
            </footer>
            <p className="fb-fine">Information only. Nothing here is investment advice, and we never ask for passwords or account details.</p>
          </form>
        )}
      </main>
    </div>
  );
}
