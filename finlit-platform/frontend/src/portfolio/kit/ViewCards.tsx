// Task #276 (shared portfolio parts, §16 "Score and views"): the score card, then the views drawn as tabs. The open view has a check, a heavier border and a
// notch; the others an arrow and open from anywhere on the card. "Your list, seen 3 ways" counts the views opened; a view not opened yet has an orange
// "Not opened yet" tag, edge and dot, kept per user in this browser. A Next view card ends each view.
import { useEffect, useState, type ReactNode } from "react";
import "./kit.css";

const NUMW = ["no", "one", "two", "three", "four", "five", "six"];
const read = (k: string): string[] => { try { const v = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; } };
/** The views this user has opened on this page (the open one counts at once). `who`: the signed-in user's id, so two people on one browser keep their own. */
export function useSeenViews(page: string, who: string | null | undefined, view: string): Set<string> {
  const k = `finlit-views-seen:${page}:${who || "guest"}`;
  const [seen, setSeen] = useState<Set<string>>(() => new Set([...read(k), view]));
  useEffect(() => { setSeen(new Set([...read(k), view])); }, [k]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setSeen((s) => { if (s.has(view)) return s; const n = new Set([...s, view]); try { localStorage.setItem(k, JSON.stringify([...n])); } catch { /* not kept */ } return n; });
    try { const all = new Set([...read(k), view]); localStorage.setItem(k, JSON.stringify([...all])); } catch { /* private window: lasts for this visit */ }
  }, [k, view]);
  return seen;
}

export type ViewCard<T extends string> = { id: T; k: string; v: ReactNode; x: string; viz?: ReactNode; what: string; color: string; tone: "good" | "info" | "watch" };

const CHECK = <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>;
const ARROW = <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;

export function ViewCards<T extends string>({ score, cards, view, onView, seen, label = "The score and the views", tabsId, panel }: {
  score: ReactNode; cards: ViewCard<T>[]; view: T; onView: (v: T) => void; seen: Set<string>; label?: string; tabsId?: string; panel?: string;
}) {
  const n = cards.filter((c) => seen.has(c.id)).length, left = cards.filter((c) => !seen.has(c.id)).map((c) => c.k);
  return (
    <section className="ptk-views" aria-label={label}>
      {score}
      <div className="ptk-vwrap" id={tabsId}>
        <div className="ptk-vhead" id="ptk-vhint"><b>Your list, seen {NUMW[cards.length] ?? cards.length} ways</b>
          <span className="ptk-vprog" aria-hidden="true">{cards.map((c) => <i key={c.id} className={seen.has(c.id) ? "on" : ""} />)}</span>
          <span>{n === cards.length ? `All ${cards.length} views opened` : `${n} of ${cards.length} opened · ${left.join(" and ")} still to see`}</span></div>
        <div className="ptk-vcards" role="tablist" aria-label="Views">{cards.map((c) => {
          const on = c.id === view, unseen = !seen.has(c.id);
          return <div key={c.id} role="tab" id={`ptk-tab-${c.id}`} aria-selected={on} aria-controls={panel} tabIndex={on ? 0 : -1}
            className={"ptk-vc ptk-vt-" + c.tone + (on ? " on" : "") + (unseen ? " unseen" : "")} style={{ ["--va" as string]: c.color }}
            onClick={() => onView(c.id)} onKeyDown={(e) => {
              const i = cards.findIndex((x) => x.id === c.id), d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(c.id); }
              else if (d) { e.preventDefault(); const nx = cards[(i + d + cards.length) % cards.length]; onView(nx.id); setTimeout(() => document.getElementById(`ptk-tab-${nx.id}`)?.focus(), 0); }
            }}>
            <p className="ptk-vk">{c.k}</p>
            {on ? <span className="ptk-vstate" title="You are on this view">{CHECK}<span className="sr-only">You are on this view</span></span>
              : <span className="ptk-vgo" aria-hidden="true">{ARROW}</span>}
            <p className="ptk-vv">{c.v}</p>
            <p className="ptk-vx">{c.x}</p>
            {c.viz && <span className="ptk-viz" aria-hidden="true">{c.viz}</span>}
            <p className="ptk-vw">{unseen && <span className="ptk-vnew">Not opened yet</span>}{c.what}</p>
          </div>; })}</div>
      </div>
    </section>
  );
}

/** The card at the end of a view that opens the next one. */
export function NextView({ k, what, color, onGo }: { k: string; what: string; color: string; onGo: () => void }) {
  return <button type="button" className="ptk-next" style={{ ["--va" as string]: color }} onClick={onGo}>
    <span><small>Next view</small><b>{k}</b><span>{what}</span></span><i aria-hidden="true">{ARROW}</i></button>;
}
