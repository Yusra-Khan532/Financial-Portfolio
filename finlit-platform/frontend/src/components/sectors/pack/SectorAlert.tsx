// Sector Pulse "Alert me" (task #333, developer file 30, addition 5): a small bell on a row opens a card with three tick boxes (when its state changes, when it moves
// to another box, when it enters or leaves the top 5 by rank). "Set alert" is green; once set, the bell reads "Alert set" in green. The choices are saved in the
// member's preferences (sectorAlerts) and sent after the weekly close by the server (finlit/sector_alerts.py). Each group with an alert counts as one of the
// member's alerts; the card says so and stops at the plan's limit. Describes, never advises. Styles: styles/sector-pages.css (sx-al, sx-apop).
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { prefs, usePrefs } from "../../../lib/prefs";
import { placeFloating } from "../../../lib/floating";
import { useUI } from "../../../lib/ui";
import { wordsShow } from "../../../lib/groupWords";

export type AlertKind = "state" | "box" | "top5";
const KINDS: { k: AlertKind; label: (unit: string) => string }[] = [
  { k: "state", label: () => "When its state changes (Sector Pulse)" },
  { k: "box", label: () => "When it moves to another box (Sector Rotation)" },
  { k: "top5", label: () => "When it enters or leaves the top 5 by rank" },
];
const entry = (k: AlertKind, view: string, slug: string) => `${k}:${view}:${slug}`;

/** The kinds set for one group in the current view. */
export function useSectorAlert(slug: string): AlertKind[] {
  const list = usePrefs().sectorAlerts ?? [], view = wordsShow();
  return KINDS.map((x) => x.k).filter((k) => list.includes(entry(k, view, slug)));
}

export function AlertBell({ slug, name, compact }: { slug: string; name: string; compact?: boolean }) {
  const { user } = useAuth();
  const { plan } = useUI();
  const view = wordsShow(), unit = view === "sectors" ? "sector" : "industry";
  const set = useSectorAlert(slug), all = usePrefs().sectorAlerts ?? [];
  const [open, setOpen] = useState(false), [pick, setPick] = useState<AlertKind[]>(set);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null), card = useRef<HTMLDivElement>(null), id = "sx-al-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const alerts = useQuery<{ alerts: { status: string }[]; limit: number }>({ queryKey: ["alerts", "count"], queryFn: () => apiGet("/api/alerts"), enabled: open && !!user, staleTime: 60_000, retry: false });
  const place = useCallback(() => { if (btn.current && card.current) { const p = placeFloating(btn.current, card.current); setPos({ left: p.left, top: p.top }); } }, []);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(place);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    const away = (e: MouseEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !card.current?.contains(t)) setOpen(false); };
    addEventListener("keydown", key); addEventListener("mousedown", away); addEventListener("resize", place); addEventListener("scroll", place, true);
    return () => { removeEventListener("keydown", key); removeEventListener("mousedown", away); removeEventListener("resize", place); removeEventListener("scroll", place, true); };
  }, [open, place]);
  const groups = new Set(all.map((e) => e.split(":").slice(1).join(":")));
  const mine = groups.has(`${view}:${slug}`);
  const used = (alerts.data?.alerts.filter((a) => a.status !== "done").length ?? 0) + groups.size, limit = alerts.data?.limit;
  const full = !mine && limit != null && used >= limit;
  const save = () => {
    const rest = all.filter((e) => { const [, v, s] = e.split(":"); return !(v === view && s === slug); });
    prefs.set({ sectorAlerts: [...rest, ...pick.map((k) => entry(k, view, slug))] });
    setOpen(false);
  };
  const on = set.length > 0;
  return (
    <>
      <button ref={btn} type="button" className={"sx-al" + (on ? " on" : "") + (compact ? " sx-al-s" : "")} aria-expanded={open} aria-controls={open ? id : undefined}
        aria-label={on ? `Alert set for ${name}` : `Alert me about ${name}`} title={on ? `Alert set for ${name}` : `Alert me about ${name}`}
        onClick={() => { setPick(set.length ? set : ["state", "box"]); setOpen((v) => !v); }}>
        <span aria-hidden="true">🔔</span>{compact ? null : on ? " Alert set" : " Alert me"}
      </button>
      {open && createPortal(
        <div ref={card} id={id} role="dialog" aria-label={`Alert me about ${name}`} className="sx-apop" style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}>
          <b>Alert me about {name}</b>
          {!user ? <p><Link to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>Sign in</Link> to set an alert on this {unit}.</p>
            : plan === "basic" ? <p>Alerts on a {unit} come with the Platinum plan, as the rest of this page.</p>
            : <>
              {KINDS.map((x) => <label key={x.k}><input type="checkbox" checked={pick.includes(x.k)} onChange={(e) => setPick(e.target.checked ? [...pick, x.k] : pick.filter((k) => k !== x.k))} />{x.label(unit)}</label>)}
              <p>Sent after the weekly close. Counts towards your alert limit: each {unit} you set is one of your {limit ?? "…"} alerts.</p>
              {full && <p role="alert">Your plan includes {limit} alerts at a time, and they are all in use. Remove one on the Alerts page first.</p>}
              <div>
                <button type="button" className="sx-go" disabled={full} onClick={save}>{pick.length || !mine ? "Set alert" : "Remove alert"}</button>
                <button type="button" className="sx-go2" onClick={() => setOpen(false)}>Cancel</button>
              </div>
            </>}
        </div>, document.body)}
    </>
  );
}
