// Task #289: following tracked investors, alert choices, the latest alerts, and "Your stocks they hold" (the developer file's screenshots 04 to 06).
// Data: /api/me/superinvestors/* (Gold, signed in). Styles: styles/superinvestors.css (sx-). Describes, never advises.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { ApiError, apiGet, apiSend } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PrismTag, Ret } from "./parts";
import type { Move, Prism } from "./types";

type Prefs = Record<"new" | "added" | "reduced" | "exited", boolean>;
export type FollowState = { follows: string[]; prefs: Prefs; feed: { title: string; body: string; link: string; at: string }[]; note: string };
type OverlapRow = { symbol: string; name: string; in: ("Portfolio" | "Watchlist")[]; investors: { key: string; name: string; move: Move; moveText: string; sourceError: boolean }[]; prism: Prism; return1y: number | null };
type Overlap = { rows: OverlapRow[]; empty: boolean; emptyWhy: string | null };

const KEY = ["si-follows"];
const PREFS: [keyof Prefs, string][] = [["new", "New stake"], ["added", "Stake up"], ["reduced", "Stake cut"], ["exited", "No longer named"]];

/** The member's follows; nothing is asked for a visitor (a Gold page only, so the plan is already known). */
export function useFollows() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery<FollowState, ApiError>({ queryKey: KEY, queryFn: () => apiGet("/api/me/superinvestors/follows"), enabled: !!user, staleTime: 60_000, retry: false });
  const set = (s: FollowState) => qc.setQueryData(KEY, s);
  const toggle = useMutation({ mutationFn: ({ key, on }: { key: string; on: boolean }) => apiSend<FollowState>(on ? "PUT" : "DELETE", `/api/me/superinvestors/follows/${encodeURIComponent(key)}`), onSuccess: set });
  const prefs = useMutation({ mutationFn: (p: Prefs) => apiSend<FollowState>("PUT", "/api/me/superinvestors/alert-prefs", p), onSuccess: set });
  return { state: q.data, signedIn: !!user, following: (k: string) => !!q.data?.follows.includes(k), toggle: (key: string, on: boolean) => toggle.mutate({ key, on }), setPrefs: (p: Prefs) => prefs.mutate(p) };
}

const bell = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>;

export function FollowButton({ k, name, f }: { k: string; name: string; f: ReturnType<typeof useFollows> }) {
  if (!f.signedIn) return null;
  const on = f.following(k);
  return <button type="button" className="sx-fol" aria-pressed={on} aria-label={on ? `Stop following ${name}` : `Follow ${name}`} onClick={() => f.toggle(k, !on)}>{bell}{on ? "Following" : "Follow"}</button>;
}

export function YourStocks() {
  const { user } = useAuth();
  const q = useQuery<Overlap, ApiError>({ queryKey: ["si-overlap"], queryFn: () => apiGet("/api/me/superinvestors/overlap"), enabled: !!user, staleTime: 120_000, retry: false });
  return (
    <section className="card si-sec sx-sec" aria-labelledby="sx-h-yours">
      <h2 id="sx-h-yours">Your stocks they hold</h2>
      <p className="si-lead">Your equity portfolio and watchlists, checked against the tracked investors.</p>
      {q.isPending ? <p className="si-wait" role="status">Checking your stocks…</p>
        : q.isError ? <p className="formerr" role="alert">Your stocks could not be checked ({q.error.status || "network"}). Please try again in a moment.</p>
        : q.data.empty ? <p className="si-empty">Add stocks to your <Link to="/holdings">portfolio</Link> or a <Link to="/watchlist">watchlist</Link> to see who else holds them.</p>
        : <div className="si-scroll" tabIndex={0} role="region" aria-label="Your stocks they hold, scrolls sideways">
          <table className="si-t sx-t">
            <thead><tr><th scope="col">Company</th><th scope="col">In your</th><th scope="col">Tracked investors and their latest move</th><th scope="col">FinLit Prism</th><th scope="col" className="n">1-year move</th></tr></thead>
            <tbody>{q.data.rows.map((r) => (
              <tr key={r.symbol}>
                <th scope="row"><Link to={`/stocks/${encodeURIComponent(r.symbol)}`}>{r.name.replace(/\s+(Ltd|Limited)\.?$/i, "")}</Link><small>{r.symbol}</small></th>
                <td>{r.in.join(", ")}</td>
                <td className="sx-who">{r.investors.length ? r.investors.map((i) => <span key={i.key} className="sx-ov"><Link to={`/superinvestors/${i.key}`}>{i.name}</Link> <span className={"sx-mv " + (i.sourceError ? "unchanged" : i.move)}>{i.sourceError ? "No change" : i.moveText}</span></span>)
                  : <span className="sx-ts">No tracked investor named</span>}</td>
                <td><PrismTag p={r.prism} /></td>
                <td className="n"><Ret v={r.return1y} /></td>
              </tr>))}</tbody>
          </table>
        </div>}
    </section>
  );
}

export function FollowingAlerts({ f, names }: { f: ReturnType<typeof useFollows>; names: Record<string, string> }) {
  const s = f.state;
  return (
    <section className="card si-sec sx-sec" aria-labelledby="sx-h-follow">
      <h2 id="sx-h-follow">Following and alerts</h2>
      <p className="si-lead">Follow an investor from their card or page to get an alert when a new filing changes their stake. {s?.note ?? ""}</p>
      {!s ? <p className="si-wait" role="status">Loading your follows…</p> : <div className="sx-alerts">
        <div className="sx-al" role="group" aria-label="Alert me on"><strong>Alert me on</strong>
          {PREFS.map(([k, w]) => <label key={k}><input type="checkbox" checked={s.prefs[k]} onChange={(e) => f.setPrefs({ ...s.prefs, [k]: e.target.checked })} />{w}</label>)}</div>
        <div className="sx-al"><strong>Following</strong>
          {s.follows.length ? <span className="sx-mini">{s.follows.map((k) => <button key={k} type="button" className="sx-fol" aria-pressed aria-label={`Stop following ${names[k] ?? k}`} onClick={() => f.toggle(k, false)}>{names[k] ?? k} ×</button>)}</span>
            : <span className="sx-ts">No one yet.</span>}</div>
        <div><h3 className="sx-h3">Latest alerts</h3>
          {s.feed.length ? <ul className="sx-feed">{s.feed.map((a) => <li key={a.at + a.title}><Link to={a.link}>{a.title}</Link><time dateTime={a.at}>{new Date(a.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</time></li>)}</ul>
            : <p className="sx-note">No alert yet. They arrive when a company files a new shareholding pattern that changes a followed investor's stake.</p>}</div>
      </div>}
    </section>
  );
}
