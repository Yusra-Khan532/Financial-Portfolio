// "Raise a Query" and "Share Feedback" (task #214), with the one dialog both open. Since task #310 part D they are menu actions (HelpActions), not a floating dock.
// Every message goes to the team tagged with the page it was written on (lib/pageFeedback.ts). Styles: styles/pagefeedback.css (pf-).
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useInRouterContext, useLocation } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useFocusTrap } from "../lib/focusTrap";
import { Icon } from "../lib/icons";
import { FEEDBACK_TYPES, MESSAGE_MAX, QUERY_MIN, QUERY_TYPES, RATING_WORDS, draftProblem, pageTag, panel, sendPageFeedback, type Kind } from "../lib/pageFeedback";
import "../styles/pagefeedback.css";

const openKind = () => useSyncExternalStore(panel.sub, panel.get, () => null);

/** An inline "Raise a Query" for a spot inside a page that invites a question (the screener's "A question about a score?"); it opens the same dialog. */
export function RaiseQueryButton() {
  return <button type="button" className="ph-qbtn" onClick={() => panel.set("query")} aria-haspopup="dialog"><Icon name="bubble" />Raise a Query</button>;
}

const msg = (e: unknown) => (e instanceof ApiError ? e.body.detail || e.body.status || "We could not send that." : "Could not reach the server. Please try again.");

function Chips({ label, options, value, onChange }: { label: string; options: readonly (readonly [string, string])[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="pf-chips" role="radiogroup" aria-label={label}>
      {options.map(([k, l]) => <button type="button" key={k} role="radio" aria-checked={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="pf-stars" role="radiogroup" aria-label="Your rating of this page, 1 to 5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button type="button" key={n} role="radio" aria-checked={value === n} aria-label={`${n} of 5, ${RATING_WORDS[n]}`} className={n <= value ? "on" : ""} onClick={() => onChange(value === n ? 0 : n)}><Icon name="star" /></button>
      ))}
      <span className="pf-rw" aria-live="polite">{value ? RATING_WORDS[value] : "Tap a star"}</span>
    </div>
  );
}

export function FeedbackDialog({ kind, pathname, search, plan, onClose }: { kind: Kind; pathname: string; search?: string; plan: string | null; onClose: () => void }) {
  const { user } = useAuth();
  const signedIn = !!user;
  const tag = useMemo(() => pageTag(pathname + (search ?? ""), plan), [pathname, plan]);   // read once when the dialog opens: it describes the page the member was on
  const ref = useRef<HTMLDivElement>(null), tid = useId(), mid = useId();
  const [category, setCategory] = useState<string>(kind === "query" ? "question" : "suggestion");
  const [message, setMessage] = useState(""), [rating, setRating] = useState(0), [email, setEmail] = useState(""), [tried, setTried] = useState(false);
  useFocusTrap(ref, true);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", k, true);
    return () => document.removeEventListener("keydown", k, true);
  }, [onClose]);
  const m = useMutation({ mutationFn: () => sendPageFeedback({ kind, tag, category, message, rating, email }) });
  const problem = draftProblem({ kind, message, rating, email }, signedIn);
  const submit = (e: FormEvent) => { e.preventDefault(); setTried(true); if (!problem && !m.isPending) m.mutate(); };
  const isQ = kind === "query", left = MESSAGE_MAX - message.length;
  return createPortal(
    <>
      <div className="scrim pf-scrim" onClick={onClose} aria-hidden="true" />
      <div className="pf-modal" role="dialog" aria-modal="true" aria-labelledby={tid} ref={ref} tabIndex={-1}>
        <div className="pf-h">
          <h2 id={tid}>{isQ ? "Raise a query" : "Share feedback"}</h2>
          <button type="button" className="pf-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <p className="pf-about"><Icon name="info" />About: <b>{tag.pageName}</b><span className="faint"> · {tag.page}</span></p>
        {m.isSuccess ? (
          <div className="pf-done" role="status">
            <span className="pf-ok" aria-hidden="true"><Icon name="check" /></span>
            <h3>{isQ ? "Query sent" : "Thank you"}</h3>
            <p>{isQ ? `The team has it, tagged to ${tag.pageName}. ${signedIn ? "We will reply to your account email" : "We will reply by email"}, usually within one working day.` : `Your feedback is saved against ${tag.pageName}. It goes straight to the team.`}</p>
            <button type="button" className="btn primary" onClick={onClose}>Close</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            {!isQ && <Stars value={rating} onChange={setRating} />}
            <Chips label={isQ ? "What kind of query" : "What kind of feedback"} options={isQ ? QUERY_TYPES : FEEDBACK_TYPES} value={category} onChange={setCategory} />
            <label htmlFor={mid}>{isQ ? "Your question, the problem you saw, or what you would like explained" : "What would make this page better? (optional if you chose a rating)"}</label>
            <textarea id={mid} rows={5} value={message} maxLength={MESSAGE_MAX} onChange={(e) => setMessage(e.target.value)} autoFocus
              placeholder={isQ ? "For example: how is the Sector filter counted together with Market cap?" : "A suggestion, something confusing, a number that looks wrong, or what you like"} />
            <div className="pf-meta"><span>{isQ && message.trim().length < QUERY_MIN ? `At least ${QUERY_MIN} characters` : ""}</span><span className={left < 100 ? "warn" : ""}>{left} left</span></div>
            {!signedIn && <label className="pf-em">Your email, so we can reply<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} /></label>}
            {signedIn && <p className="pf-who faint">Sent as your account. Do not include passwords or card details.</p>}
            {(tried && problem) && <div className="pf-err" role="alert">{problem}</div>}
            {m.isError && <div className="pf-err" role="alert">{msg(m.error)}</div>}
            <div className="pf-act">
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button className="btn primary" disabled={m.isPending}>{m.isPending ? "Sending…" : isQ ? "Send query" : "Send feedback"}</button>
            </div>
          </form>
        )}
      </div>
    </>, document.body);
}

/** "Raise a Query" and "Share feedback" as two plain actions (task #310 part D, the 22 Nov pack's 04-navigation.md: the floating dock that sat over content on
 *  every page is gone). They sit in the account menu, at the foot of the left menu, in the phone Menu sheet and in the footer; `asMenu` makes them menu items. */
export function HelpActions({ asMenu, className, onPick }: { asMenu?: boolean; className?: string; onPick?: () => void }) {
  const role = asMenu ? "menuitem" : undefined;
  const go = (k: Kind) => { onPick?.(); panel.set(k); };
  const body = (icon: string, label: string) => asMenu ? <><span className="ddi"><Icon name={icon} /></span><span><b>{label}</b></span></> : <><Icon name={icon} /><span>{label}</span></>;
  return <>
    <button type="button" role={role} className={className} onClick={() => go("query")} aria-haspopup="dialog">{body("bubble", "Raise a Query")}</button>
    <button type="button" role={role} className={className} onClick={() => go("feedback")} aria-haspopup="dialog">{body("pencil", "Share feedback")}</button>
  </>;
}

/** The one dialog behind Raise a Query and Share feedback, tagged with the page it was opened on (task #214). Nothing is on screen until one of them is chosen. */
export function PageFeedbackHost() {
  const inRouter = useInRouterContext();
  const loc = inRouter ? useLocation() : null;   // eslint-disable-line react-hooks/rules-of-hooks
  const pathname = loc?.pathname ?? "/", search = loc?.search ?? "";
  const { user, plan } = useAuth();
  const open = openKind();
  useEffect(() => { panel.set(null); }, [pathname]);   // moving to another page closes it: it was about the page left behind
  if (/^\/admin(\/|$)/.test(pathname) || !open) return null;
  return <FeedbackDialog key={open + pathname} kind={open} pathname={pathname} search={search} plan={user ? plan : null} onClose={() => panel.set(null)} />;
}
