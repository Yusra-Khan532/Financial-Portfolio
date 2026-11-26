// "Where <company> stands" on the company report, as the final pages pack draws it (board 17): one section with its industry, its peers and its
// risk, one question per tab. It replaces "Where its industry stands" and "Where this stock stands among its peers". Every figure is the server's (the stock's
// sector reading, the industry page, Sector Rotation, the peer reading, the price and Prism); this file only puts them into sentences. Describes; never advice.
import type { Card } from "./pulsePack";
import type { IndustryPage, RankedStock, StockSector } from "./sectors";
import type { RotationCard } from "./rotation";
import { pendingOf, type LeadershipOn, type LeadLabel } from "./leadership";

const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const num = (n: number) => (n < NUM.length ? NUM[n] : String(n));
export const ordinal = (n: number) => { const r = n % 100; return `${n}${r >= 11 && r <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] || "th"}`; };
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const sp = (x: number, dp = 1) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(dp)}%`;
const p1 = (x: number) => Math.abs(x).toFixed(1);
export const LABEL: Record<LeadLabel, string> = { leader: "Leader", in_line: "In line", laggard: "Laggard" };
const RANK: Record<LeadLabel, number> = { leader: 0, in_line: 1, laggard: 2 };

/** How strong the industry is against the others: from its Sector Rotation box and rank. */
export function industryTone(rot: Pick<RotationCard, "corner" | "rank" | "ranked"> | null | undefined): "strong" | "weak" | "middle" | null {
  if (!rot || rot.rank == null || !rot.ranked) return null;
  if (rot.corner === "ahead_gaining" || rot.corner === "ahead_slowing" || rot.rank * 4 <= rot.ranked) return "strong";
  if (rot.corner === "behind_slipping" || rot.rank * 4 > rot.ranked * 3) return "weak";
  return "middle";
}
/** How the share has done inside its industry over 6 months: its quarter of the counted stocks. */
export function shareTone(s: Pick<StockSector, "quarter"> | null | undefined, lead: LeadershipOn | null): "leading" | "lagging" | "middle" | null {
  if (s?.quarter === 4 || (s?.quarter == null && lead?.label === "laggard")) return "lagging";
  if (s?.quarter === 1 || (s?.quarter == null && lead?.label === "leader")) return "leading";
  return s?.quarter != null || lead ? "middle" : null;
}

// ------------------------------------------------------------------------------------------------ the lead and the strip
export type Lead = { lead: string; rest: string; recent: string | null };
export function headline(name: string, ind: string | null, stateWord: string | null, s: StockSector | null, rot: RotationCard | null | undefined, lead: LeadershipOn | null): Lead | null {
  const it = industryTone(rot), st = shareTone(s, lead);
  if (!it && !st) return null;
  const iw = it === "strong" ? "A strong industry" : it === "weak" ? "A weak industry" : it === "middle" ? "An industry in the middle" : null;
  const sw = st === "lagging" ? "a lagging share" : st === "leading" ? "a leading share" : st === "middle" ? "a share in the middle" : null;
  const head = iw && sw ? `${iw}, ${sw}.` : iw ? `${iw}.` : `${sw!.charAt(0).toUpperCase()}${sw!.slice(1)}.`;
  const parts: string[] = [];
  if (ind && (stateWord || rot?.rank)) parts.push(`${ind} is ${[stateWord ? stateWord.toLowerCase() : null, rot?.rank && rot.ranked ? `the ${ordinal(rot.rank)} strongest of ${rot.ranked} industries` : null].filter(Boolean).join(" and is ")}`);
  const inside = s?.rank_6m != null && s.ranked_6m ? (s.rank_6m === s.ranked_6m ? `${name} is its weakest stock over 6 months` : s.rank_6m === 1 ? `${name} is its strongest stock over 6 months` : `${name} is ${ordinal(s.rank_6m)} of its ${s.ranked_6m} counted stocks over 6 months`) : null;
  const peers = lead ? `${ordinal(lead.rank)} of ${lead.peerGroup.ranked} ${groupWord(lead.peerGroup.short)}peers` : null;
  const share = inside && peers ? `${inside} and ${peers}` : inside ?? (peers ? `${name} is ${peers}` : null);
  const contrast = (it === "strong" && st === "lagging") || (it === "weak" && st === "leading");
  const rest = parts.length && share ? `${parts[0]}, ${contrast ? "but" : "and"} ${share}.` : parts.length ? `${parts[0]}.` : share ? `${share}.` : "";
  let recent: string | null = null;
  const next = lead ? pendingOf(lead) : null;
  if (lead && next) recent = `The recent direction is ${RANK[next] < RANK[lead.label] ? "better" : "weaker"}: this week's peer reading says ${LABEL[next]}.`;
  return { lead: head, rest: rest ? " " + rest : "", recent };
}

// ------------------------------------------------------------------------------------------------ Its industry
export function industryCards(name: string, ind: string, s: StockSector | null, p: IndustryPage | null, rot: RotationCard | null | undefined, stateKey: string | null): Card[] {
  const out: Card[] = [], it = industryTone(rot);
  const bouncing = stateKey === "bouncing" || stateKey === "crash" || stateKey === "rising";
  if (it === "strong" && rot?.rank) out.push({ kind: "good", title: "A strong industry", text: `${ind} is the ${ordinal(rot.rank)} strongest of ${rot.ranked} industries${bouncing ? ` and its stocks have ${stateKey === "rising" ? "been rising together" : "just bounced together"}` : ""}.` });
  else if (it === "weak" && rot?.rank) out.push({ kind: "warning", title: "A weak industry", text: `${ind} is ${ordinal(rot.rank)} of ${rot.ranked} industries: it has done worse than most over the last several months.` });
  const stocks = (p?.stocks ?? []) as RankedStock[];
  if (s?.rank_6m != null && s.ranked_6m) {
    const top = stocks.filter((x) => x.symbol !== s.symbol).slice(0, 2).map((x) => x.symbol);
    const ret = s.return_6m_pct == null ? "" : ` (${sp(s.return_6m_pct)})`;
    if (s.rank_6m === s.ranked_6m) out.push({ kind: "warning", title: `${name} is its weakest stock`, text: `Of the ${s.ranked_6m} counted ${ind} stocks, ${name} ranks ${ordinal(s.rank_6m)} over 6 months${ret}.${top.length ? ` ${list(top)} led the industry.` : ""}` });
    else if (s.quarter === 4) out.push({ kind: "watch", title: `${name} is in its weakest quarter`, text: `Of the ${s.ranked_6m} counted ${ind} stocks, ${name} ranks ${ordinal(s.rank_6m)} over 6 months${ret}.` });
    else if (s.rank_6m === 1) out.push({ kind: "good", title: `${name} is its strongest stock`, text: `Of the ${s.ranked_6m} counted ${ind} stocks, ${name} ranks 1st over 6 months${ret}.` });
    else if (s.quarter === 1) out.push({ kind: "good", title: `${name} is in its strongest quarter`, text: `Of the ${s.ranked_6m} counted ${ind} stocks, ${name} ranks ${ordinal(s.rank_6m)} over 6 months${ret}.` });
  }
  const st = shareTone(s, null);
  if (it === "strong" && st === "lagging") out.push({ kind: "insight", title: "What it means", text: `The industry is not what is holding ${name} back: most of its industry has done better over 6 months.` });
  else if (it === "weak" && st === "leading") out.push({ kind: "insight", title: "What it means", text: `${name} has held up while most of its industry has not: its own story has mattered more than the industry's.` });
  else if (it && st) out.push({ kind: "insight", title: "What it means", text: `${name} has moved broadly in step with its industry over 6 months.` });
  return out;
}
/** Sector Rotation: the sentence under the box. */
export function rotationLine(ind: string, rot: RotationCard): string {
  const ahead = rot.strength_pts == null ? null : rot.strength_pts >= 0;
  const lately = rot.corner === "ahead_gaining" || rot.corner === "behind_gaining" ? "and it is still gaining lately" : rot.corner === "ahead_slowing" ? "but the lead has slowed lately" : rot.corner === "behind_slipping" ? "and it is still slipping lately" : null;
  const where = rot.rank && rot.ranked ? `it is the ${ordinal(rot.rank)} strongest of ${rot.ranked}` : null;
  return `${ind} has done ${ahead == null ? "about as well as" : ahead ? "better than" : "worse than"} the average industry over the last several months${where ? `, and ${where}` : ""}${lately && !where ? `, ${lately}` : ""}.`;
}

// ------------------------------------------------------------------------------------------------ Against peers
export function peerCards(name: string, lead: LeadershipOn, val: { pe: number | null; roe: number | null; peers: { pe: number | null; roe: number | null }[] } | null): Card[] {
  const out: Card[] = [], g = lead.peerGroup, sec = lead.benchmarks.sector.name, mk = lead.benchmarks.market?.name ?? "the Nifty 50";
  const w52 = lead.rel.w52 == null ? null : lead.rel.w52 * 100, m52 = lead.rel.w52Market == null ? null : lead.rel.w52Market * 100, w13 = lead.rel.w13 == null ? null : lead.rel.w13 * 100;
  const vs = (x: number | null, who: string) => (x == null ? null : `${p1(x)} points ${x >= 0 ? "ahead of" : "behind"} ${who}`);
  const fig = [vs(w52, sec), m52 == null ? null : `${p1(m52)} ${m52 >= 0 ? "ahead of" : "behind"} ${mk}`].filter(Boolean).join(" and ");
  const where = `${name} ranks ${ordinal(lead.rank)} of ${g.ranked} by price over 12 months${fig ? `: ${fig}` : ""}.`;
  out.push(lead.label === "laggard" ? { kind: "warning", title: `A laggard among ${g.short} companies`, text: where } : lead.label === "leader" ? { kind: "good", title: `A leader among ${g.short} companies`, text: where } : { kind: "insight", title: `In line with ${g.short} companies`, text: where });
  if (w13 != null) {
    const next = pendingOf(lead);
    const turned = next ? `, and this week's reading says ${LABEL[next]}. The label changes if next week's reading agrees.` : ".";
    if (lead.label !== "leader" && w13 > 0) out.push({ kind: "good", title: "But the recent direction has turned", text: `Over the last 3 months it is ${p1(w13)} points ahead of ${sec}${turned}` });
    else if (lead.label !== "laggard" && w13 < 0) out.push({ kind: "watch", title: "The recent direction has slowed", text: `Over the last 3 months it is ${p1(w13)} points behind ${sec}${turned}` });
  }
  if (val?.pe != null && val.pe > 0) {
    const pes = val.peers.map((x) => x.pe).filter((x): x is number => x != null && x > 0);
    if (pes.length >= 2) {
      const lo = Math.min(...pes), hi = Math.max(...pes), above = val.pe > hi, below = val.pe < lo;
      const roes = val.peers.map((x) => x.roe).filter((x): x is number => x != null), mroe = roes.length ? roes.reduce((a, b) => a + b, 0) / roes.length : null;
      const roe = val.roe == null || mroe == null ? "" : `, with a ${val.roe < mroe ? "lower" : "higher"} return on equity (${val.roe.toFixed(1)}%) than their average (${mroe.toFixed(1)}%)`;
      out.push({ kind: "insight", title: "Cheap or expensive?", text: `${name} trades at ${val.pe.toFixed(1)} times profit, ${above ? "above" : below ? "below" : "within the range of"} the other companies in its industry (${lo.toFixed(0)} to ${hi.toFixed(0)} times)${roe}.` });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ Risk
export function riskCards(name: string, risk: number | null, m12: number | null, nifty12: number | null): Card[] {
  const out: Card[] = [];
  if (risk != null) out.push(risk >= 70 ? { kind: "good", title: "One of the steadier shares on NSE", text: `Prism Risk ${Math.round(risk)} puts ${name} among the lower-risk companies on NSE.` }
    : risk < 50 ? { kind: "warning", title: "One of the riskier shares on NSE", text: `Prism Risk ${Math.round(risk)} puts ${name} among the higher-risk companies on NSE.` }
      : { kind: "insight", title: "Middle of the range for risk", text: `Prism Risk ${Math.round(risk)} puts ${name} in the middle of NSE companies.` });
  if (m12 != null && nifty12 != null) {
    const mv = (x: number) => `${x >= 0 ? "rose" : "fell"} ${Math.abs(x).toFixed(0)}%`;
    if (risk != null && risk >= 70 && m12 < nifty12) out.push({ kind: "insight", title: "Lower risk is not the same as a good return", text: `Over the last 12 months the share ${mv(m12)} while the Nifty 50 ${mv(nifty12)}. Steady and strong are different things.` });
    else out.push({ kind: "insight", title: "Risk and return", text: `Over the last 12 months the share ${mv(m12)} while the Nifty 50 ${mv(nifty12)}. Risk describes how much a share swings, not where it goes.` });
  }
  return out;
}
export { num };
/** The group's short name before "peers" or "companies"; a group already called "peers" is not named twice (task #216, README 3.14). */
export const groupWord = (short: string | null | undefined): string => (!short || /^peers?$/i.test(short.trim()) ? "" : short.trim() + " ");
