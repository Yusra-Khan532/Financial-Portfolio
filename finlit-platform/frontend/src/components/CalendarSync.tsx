// Task #297 (the team, 21 Nov 2026: "integrate the IPO, listing etc. calendars of our website with Google Calendar; give the user a button or link
// with Google Calendar and associate it with the Gmail id used in sign-up"). "Add to Google Calendar" opens Google Calendar's own "add by URL" page
// with the member's private FinLit calendar address filled in, in the Google account of their sign-up email; Google then reads it again by itself.
// The address also works in Apple Calendar, Outlook and any other calendar app ("Copy the address"), and can be replaced. Data: GET /api/me/calendar
// (backend/finlit/calendar_feed.py). Visitors are asked to sign in. Describes dates; never advises.
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "../lib/api";
import { useAuthMaybe } from "../lib/auth";
import { Icon } from "../lib/icons";
import "../styles/calendar-sync.css";

export type CalFeed = { url: string; webcal: string; google: string; email: string | null; name: string; lastReadAt: string | null; holds: string[]; note: string };

export function CalendarSync() {
  const auth = useAuthMaybe();
  const loc = useLocation();
  if (!auth) return null;                       // no sign-in state here (a page drawn on its own): nothing to offer
  if (!auth.user) {
    return <div className="cs"><Link className="cs-btn" to={`/login?next=${encodeURIComponent(loc.pathname)}`}><Icon name="calendar" />Add to Google Calendar</Link>
      <span className="cs-note">Sign in to add IPO and results dates to your Google Calendar.</span></div>;
  }
  return <MemberCalendar />;
}

function MemberCalendar() {
  const qc = useQueryClient();
  const q = useQuery<CalFeed>({ queryKey: ["me", "calendar"], queryFn: () => apiGet("/api/me/calendar"), staleTime: 10 * 60_000, retry: 1 });
  const [open, setOpen] = useState(false), [copied, setCopied] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const d = q.data;
  const copy = async () => {
    if (!d) return;
    try { await navigator.clipboard.writeText(d.url); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setErr("Copy did not work here: select the address and copy it."); }
  };
  const reset = async () => {
    setBusy(true); setErr(null);
    try { qc.setQueryData(["me", "calendar"], await apiSend<CalFeed>("POST", "/api/me/calendar/reset")); }
    catch { setErr("A new address could not be made just now. Please try again."); }
    finally { setBusy(false); }
  };
  return (
    <div className="cs">
      {d ? <a className="cs-btn" href={d.google} target="_blank" rel="noopener noreferrer" title={d.email ? `Opens Google Calendar as ${d.email}` : undefined}>
        <Icon name="calendar" />Add to Google Calendar</a>
        : <button type="button" className="cs-btn" disabled>{q.isError ? "Calendar link not available just now" : "Preparing your calendar link…"}</button>}
      <button type="button" className="cs-more" aria-expanded={open} aria-controls="cs-panel" onClick={() => setOpen((v) => !v)} disabled={!d}>Other calendar apps</button>
      {d && d.email && <span className="cs-note">Opens in the Google account {d.email}.</span>}
      {open && d && <div className="cs-panel" id="cs-panel" role="region" aria-label="Your FinLit calendar address">
        <p><b>{d.name}</b>: {d.holds.join("; ")}.</p>
        <label className="cs-url"><span>Your calendar address</span><input readOnly value={d.url} onFocus={(e) => e.currentTarget.select()} /></label>
        <div className="cs-acts">
          <button type="button" onClick={copy}>{copied ? "Copied" : "Copy the address"}</button>
          <a href={d.webcal}>Open in my calendar app</a>
          <button type="button" onClick={reset} disabled={busy}>{busy ? "Replacing…" : "Replace the address"}</button>
        </div>
        <p className="cs-note">{d.note}{d.lastReadAt ? ` Last read by your calendar ${new Date(d.lastReadAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : ""}</p>
        {err && <p className="cs-err" role="alert">{err}</p>}
      </div>}
    </div>
  );
}
