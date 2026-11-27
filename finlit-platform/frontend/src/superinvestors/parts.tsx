// Task #289: the small parts every superinvestor table shares: the move tag, FinLit Prism, the technical words, the peer label, the size and the figures.
// Styles: styles/superinvestors.css (sx-). Describes, never advises.
import { Link } from "react-router";
import type { Move, Peers, Prism, Size, Tech } from "./types";

export const MOVE_WORD: Record<Move, string> = { new: "New stake", added: "Stake up", reduced: "Stake cut", exited: "No longer named", unchanged: "No change" };

export const crore = (v: number | null | undefined) => v == null ? "—" : `₹${v >= 100 ? Math.round(v).toLocaleString("en-IN") : v.toLocaleString("en-IN", { maximumFractionDigits: 1 })} cr`;
export const pct = (v: number | null | undefined, d = 2) => v == null ? "—" : `${v.toFixed(d)}%`;
/** A signed percentage with a real minus: +14.2% / −3.0%. */
export const signed = (v: number | null | undefined, d = 1) => v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}%`;
export const ptsText = (v: number | null | undefined) => v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)} pts`;
const shortName = (n: string) => n.replace(/\s+(Ltd|Limited)\.?$/i, "");

export function MoveTag({ m }: { m: Move }) {
  return <span className={"sx-mv " + m}>{MOVE_WORD[m]}</span>;
}

export function PrismTag({ p }: { p: Prism }) {
  if (!p.label) return <span className="sx-dash" title="No FinLit Prism rating stored for this company">—</span>;
  const cls = p.label.split(" ")[0];
  return <span className={"sx-pr " + cls}>{p.label}{p.score != null && <b>{p.score.toFixed(1)}</b>}</span>;
}

const tone = (w: string | null) => !w ? "sx-ts" : /up/i.test(w) ? "sx-tu" : /down/i.test(w) ? "sx-td" : "sx-ts";
export function TechCell({ t }: { t: Tech }) {
  if (!t.short && !t.long) return <span className="sx-dash" title="No technical score stored for this company">—</span>;
  return <span className="sx-tc"><span><i>Short </i><span className={tone(t.short)}>{t.short ?? "—"}</span></span><span><i>Long </i><span className={tone(t.long)}>{t.long ?? "—"}</span></span></span>;
}

export function PeersTag({ p }: { p: Peers }) {
  if (!p.chip) return <span className="sx-dash" title="No peer group for this company">—</span>;
  return <span className={"sx-ld " + p.chip.replace(/\s+/g, "")} title={p.text ?? undefined}>{p.chip}</span>;
}

export function Ret({ v }: { v: number | null }) {
  return v == null ? <span className="sx-dash" title="No 1-year price for this company">—</span> : <span className={v > 0 ? "sx-tu" : v < 0 ? "sx-td" : ""}>{signed(v)}</span>;
}

export function Co({ symbol, name, size, asOf, names }: { symbol: string; name: string; size?: Size | null; asOf?: string | null; names?: number }) {
  return <><Link to={`/stocks/${encodeURIComponent(symbol)}`}>{shortName(name)}</Link>
    <small>{[symbol, size, asOf ? `filing ${asOf}` : null, names && names > 1 ? `${names} names` : null].filter(Boolean).join(" · ")}</small></>;
}

/** "Mukul Agrawal, Ashish Kacholia, Vijay Kedia +2" with each name linked. */
export function Who({ keys, names }: { keys: string[]; names: Record<string, string> }) {
  const first = keys.slice(0, 3);
  return <span className="sx-who">{first.map((k, i) => <span key={k}>{i > 0 && ", "}<Link to={`/superinvestors/${k}`}>{names[k] ?? k}</Link></span>)}{keys.length > 3 && <> +{keys.length - 3}</>}</span>;
}

/** Stake then → now: "not named" for no line in the earlier filing, "under 1%" for no line now; the change in points below. */
export function StakeThenNow({ then, now, move, change, sourceError }: { then: number | null; now: number | null; move: Move; change: number | null; sourceError?: boolean }) {
  return <>{then == null ? <span className="si-why">not named</span> : pct(then)} → {now == null ? <span className="si-why">under 1%</span> : pct(now)}
    {sourceError ? <small>year-ago figure: source error</small> : move !== "new" && move !== "exited" && change != null ? <small>{ptsText(change)}</small> : null}</>;
}
