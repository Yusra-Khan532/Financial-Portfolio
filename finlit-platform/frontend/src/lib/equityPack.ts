// The Equity portfolio as the "FinLit final pages" pack draws it (founder, 13 Nov 2026; docs/design/finlit-final-pages/12-14): the score tiles, the cards and the sentences
// of the Portfolio, Diversification and Risk analytics tabs, worked out from what the page already loads (POST /api/portfolio/page, /overview, /score; each share's
// leadership answer; the screener table's 1-month return and distance below the 1-year high). Every figure is the server's; this file only counts and words them.
// Describes the list; never advice.
import type { Card } from "./pulsePack";
import { trendBand } from "./prismTechnical";

const MINUS = "−";
const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const num = (n: number) => (n <= 12 ? NUM[n] : String(n));
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
export const sp = (v: number | null | undefined, d = 1) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? MINUS : ""}${Math.abs(v).toFixed(d)}%`);
const pc = (x: number) => `${Math.round(x)}%`;

export type Size = "Large" | "Mid" | "Small";
export type PeerLabel = "leader" | "in_line" | "laggard";
/** One share as the pack reads it. `prism`: the total; `risk`: the Prism Risk part (higher means lower risk); `lt`/`st`: the Prism trend scores (−100 to 100). */
export type Share = {
  symbol: string; industry: string | null; size: Size | null; chg: number | null; prism: number | null; prismWord: string | null; valuation: number | null; risk: number | null;
  st: number | null; lt: number | null; below52: number | null; m1: number | null;
  peer: { label: PeerLabel; raw: PeerLabel | null; rank: number; of: number; group: string; vs: number | null; bench: string; direction: "gaining" | "weakening" | null } | null;
  notCompared: string | null;
};
/** "has under a year of prices" → "have under a year of prices", for two or more shares. */
const plural = (why: string) => why.replace(/^has /, "have ").replace(/^is /, "are ").replace(/^trades /, "trade ");
export const PEER_WORD: Record<PeerLabel, string> = { leader: "Leader", in_line: "In line", laggard: "Laggard" };
const strongP = (v: number | null) => v != null && v >= 70, weakP = (v: number | null) => v != null && v < 50;
export const prismWord = (v: number | null) => (v == null ? null : v >= 70 ? "Healthy" : v >= 50 ? "Average" : "Weak");

// ------------------------------------------------------------------------------------------------ the score tiles
export type Tile = { id: string; k: string; v: string; sub: string; to: "shares" | "diversification" | "risk"; link: string; tone: "good" | "info" | "watch" | "bad" | "mute"; help: string };
type Readings = Record<string, { word: string; figure?: number; why?: string; upShare?: number; downShare?: number; beta?: number; swing?: number; swingIndex?: number } & Record<string, unknown>>;
export function scoreTiles(shares: Share[], r: Readings | undefined, page: { score: { score: number; band: string; effective_stocks: number }; market: { eq: { beta: number; vol: number; vol_nifty: number } }; order: string[] } | null,
  industries: number, sizes: number, bigPack: { n: number; name: string } | null): Tile[] {
  const n = shares.length, scored = shares.filter((s) => s.prism != null);
  const strong = scored.filter((s) => strongP(s.prism)).length, weak = scored.filter((s) => weakP(s.prism)).length, fair = scored.length - strong - weak;
  const avg = scored.length ? Math.round(scored.reduce((a, s) => a + s.prism!, 0) / scored.length) : null;
  const lead = shares.filter((s) => s.peer?.label === "leader").length, lag = shares.filter((s) => s.peer?.label === "laggard").length, inl = shares.filter((s) => s.peer?.label === "in_line").length, nc = n - lead - lag - inl;
  const lt = shares.filter((s) => s.lt != null), up = lt.filter((s) => trendBand(s.lt) === "positive").length, down = lt.filter((s) => trendBand(s.lt) === "negative").length;
  const val = r?.valuation?.word ?? "–";
  const m = page?.market.eq;
  const tiles: Tile[] = [
    { id: "strength", k: "Holding strength", v: avg == null ? "Not scored" : `${avg >= 70 ? "Strong" : avg >= 50 ? "Fair" : "Weak"} · ${avg}`, sub: `Average Prism: ${strong} strong · ${fair} fair · ${weak} weak${n - scored.length ? ` · ${n - scored.length} not scored` : ""}`, to: "shares", link: "See your shares", tone: "good",
      help: "Holding strength. The average FinLit Prism score of your shares, from 0 to 100: green 70 and above is strong, orange 50 to 69 fair, red below 50 weak." },
    { id: "peers", k: "Against peers", v: `${lead} lead · ${lag} lag`, sub: `${inl} in line · ${nc} not compared`, to: "shares", link: "See your shares", tone: "good",
      help: "Against peers. How many of your shares were among the strongest (Leader) or the weakest (Laggard) of similar companies over the last 12 months." },
    { id: "trend", k: "Price trend", v: !lt.length ? "Not rated" : up * 100 >= lt.length * 55 ? "Mostly rising" : down * 100 >= lt.length * 55 ? "Mostly falling" : "Split", sub: lt.length ? `${pc((up / lt.length) * 100)} of the list in a long-term uptrend; ${pc((down / lt.length) * 100)} in a downtrend` : "No Prism trend reading yet", to: "shares", link: "See your shares", tone: "info",
      help: "Price trend. How many of your shares are in a long-term uptrend or downtrend, from FinLit Prism's technical view." },
    { id: "spread", k: "Diversification", v: page ? `${page.score.score} · ${page.score.band}` : "–", sub: `${num(industries) === "one" ? "1 industry" : `${industries} industries`}, ${sizes === 3 ? "all three sizes" : sizes === 2 ? "two of the three sizes" : "one size"}`, to: "diversification", link: "See diversification", tone: "info",
      help: "Diversification. How widely the list is spread across industries and sizes, and how independently the shares move, from 0 to 100." },
    { id: "moves", k: "Moves like", v: page ? `${page.score.effective_stocks.toFixed(1)} of ${page.order.length}` : "–", sub: `independent shares${bigPack ? `; the ${num(bigPack.n)} ${bigPack.name.toLowerCase()} shares move as a pack` : ""}`, to: "diversification", link: "See diversification", tone: "info",
      help: "Moves like. Shares that rise and fall together count as one bet. This is how many independent shares the list behaves like." },
    { id: "risk", k: "Risk vs the index", v: m ? `${m.beta > 1.1 ? "Above" : m.beta < 0.9 ? "Below" : "In line"} · β ${m.beta.toFixed(2)}` : "–", sub: m ? `${m.vol > m.vol_nifty * 1.15 ? "but bigger swings" : m.vol < m.vol_nifty * 0.85 ? "and smaller swings" : "with similar swings"}: ${m.vol.toFixed(1)}% a year vs ${m.vol_nifty.toFixed(1)}%` : "Needs a year of weekly prices", to: "risk", link: "See risk analytics", tone: "watch",
      help: "Risk vs the index. Beta: how much the list tends to move when the Nifty 50 moves 1%. The swing is how much it rises and falls in a typical year." },
    { id: "valuation", k: "Valuation", v: val, sub: val === "Weak" ? "Average Prism valuation reading: you pay above-typical prices" : val === "Strong" ? "Average Prism valuation reading: you pay below-typical prices" : "Average Prism valuation reading: close to typical prices", to: "shares", link: "See your shares", tone: val === "Weak" ? "watch" : "good",
      help: "Valuation. The average FinLit Prism valuation reading of your shares: how their prices compare with what similar companies cost." },
    { id: "conc", k: "Concentration", v: r?.concentration?.word ?? "Needs quantities", sub: r?.concentration?.largestName ? `Largest holding ${String(r.concentration.largestName)}; top five ${pc(Number(r.concentration.topFive) * 100)} of the value` : "Largest holding and top five, once amounts are in", to: "shares", link: "See your shares", tone: "mute",
      help: "Concentration. How much of your money sits in the largest holding and the top five. It needs the quantities you own." },
  ];
  return tiles;
}

// ------------------------------------------------------------------------------------------------ Your shares: the three cards
export function sharesCards(shares: Share[], day: string): Card[] {
  const out: Card[] = [];
  const allRound = shares.filter((s) => s.peer?.label === "leader" && strongP(s.prism) && trendBand(s.st) === "positive" && trendBand(s.lt) === "positive").sort((a, b) => (a.peer!.rank - b.peer!.rank) || (b.prism! - a.prism!))[0];
  if (allRound) { const p = allRound.peer!; out.push({ kind: "good", title: `${allRound.symbol} is your strongest all-rounder`, text: `${p.rank === 1 ? "First" : `${p.rank}${["th", "st", "nd", "rd"][p.rank % 10] ?? "th"}`} of ${p.of} ${p.group} peers, ${prismWord(allRound.prism)!.toLowerCase()} Prism (${Math.round(allRound.prism!)}), uptrend in both the short and long term${allRound.below52 != null && allRound.below52 <= 5 ? ", and near its 1-year high" : ""}.` }); }
  const on = day === "Today" ? "today" : `on ${day}`;
  const fell = shares.filter((s) => s.chg != null && s.chg <= -10).sort((a, b) => a.chg! - b.chg!);
  if (fell.length) { const small = fell.every((s) => s.size === "Small"); out.push({ kind: "warning", title: `${fell.length === 1 ? "One share" : `${fell.length} shares`} fell 10% or more ${on}`, text: `${list(fell.map((s) => `${s.symbol} ${sp(s.chg)}`))}.${small ? ` ${fell.length === 1 ? "It is a small company" : `All ${num(fell.length)} are small companies`}, which tend to swing more.` : ""}` }); }
  const runAhead = shares.filter((s) => weakP(s.prism) && trendBand(s.lt) === "positive");
  if (runAhead.length) out.push({ kind: "watch", title: `Weak Prism, strong price: ${list(runAhead.map((s) => s.symbol))}`, text: `${runAhead.length === 1 ? "It has a weak business score" : `${runAhead.length === 2 ? "Both" : "All"} have weak business scores`} (${list(runAhead.map((s) => String(Math.round(s.prism!))))}) but rising prices. Prices can run ahead of the business; check why.` });
  return out;
}

// ------------------------------------------------------------------------------------------------ Against their peers
export function peerSentence(shares: Share[]): string {
  const lead = shares.filter((s) => s.peer?.label === "leader"), lag = shares.filter((s) => s.peer?.label === "laggard");
  let s = `${cap(num(lead.length))} of your ${shares.length} shares lead their peers and ${num(lag.length)} lag.`;
  const by = new Map<string, Share[]>(); shares.forEach((x) => { if (x.industry) by.set(x.industry, [...(by.get(x.industry) ?? []), x]); });
  const mixed = [...by.entries()].filter(([, xs]) => xs.length >= 3 && xs.some((x) => x.peer?.label === "leader") && xs.some((x) => x.peer?.label === "laggard")).sort((a, b) => b[1].length - a[1].length)[0];
  if (mixed) { const [ind, xs] = mixed; s += ` Among your ${num(xs.length)} ${ind.toLowerCase()} shares, ${list(xs.filter((x) => x.peer?.label === "leader").map((x) => x.symbol))} lead while ${list(xs.filter((x) => x.peer?.label === "laggard").map((x) => x.symbol))} lag.`; }
  return s;
}
export const peerLine = (s: Share) => (!s.peer ? "" : `${s.peer.vs == null ? "" : `${s.peer.vs >= 0 ? "+" : MINUS}${Math.abs(s.peer.vs).toFixed(1)} pts vs ${s.peer.bench} over 12 months`}${s.peer.direction ? `, ${s.peer.direction === "gaining" ? "gaining" : "weakening"} lately` : ""}`);
export function peerCards(shares: Share[]): Card[] {
  const out: Card[] = [];
  const flip = shares.filter((s) => s.peer && s.peer.raw && s.peer.raw !== s.peer.label);
  if (flip.length) out.push({ kind: "insight", title: "May change next week", text: `${list(flip.map((s) => `${s.symbol} reads ${PEER_WORD[s.peer!.raw!]}`))} this week. Labels change only if the next weekly reading agrees.` });
  const nc = shares.filter((s) => !s.peer);
  if (nc.length) out.push({ kind: "watch", title: `Not compared: ${nc.length} ${nc.length === 1 ? "share" : "shares"}`, text: [...new Set(nc.map((s) => s.notCompared ?? "is not ranked"))].map((why) => { const who = nc.filter((s) => (s.notCompared ?? "is not ranked") === why).map((s) => s.symbol); return `${list(who)} ${who.length > 1 ? plural(why) : why}`; }).join("; ") + "." });
  return out;
}
/** The pack's "What if you had owned the group leader instead?": ₹1 lakh a year ago in each laggard and in its group's #1. */
export type LeaderPair = { symbol: string; leader: string; group: string; mine: number; theirs: number; leaderBigger: boolean | null; nextWeek: PeerLabel | null; gaining: boolean };
export function leaderCards(pairs: LeaderPair[]): Card[] {
  if (!pairs.length) return [];
  const mine = pairs.reduce((a, p) => a + p.mine, 0), theirs = pairs.reduce((a, p) => a + p.theirs, 0), lakh = (v: number) => `₹${(v / 100000).toFixed(2)} lakh`;
  const out: Card[] = [{ kind: "insight", title: theirs > mine ? "In hindsight, the group leaders did far better" : "In hindsight, your shares held their own", text: `₹${pairs.length} lakh split across your ${num(pairs.length)} laggards a year ago is worth about ${lakh(mine)} today; the same money in the ${num(pairs.length)} group leaders, about ${lakh(theirs)}.` }];
  const smaller = [...new Map(pairs.filter((p) => p.leaderBigger === false).map((p) => [p.leader, p])).values()];   // each leader once
  out.push({ kind: "watch", title: "Hindsight is not a plan", text: `Last year's leader is not always next year's.${smaller.length ? ` Some leaders are much smaller and riskier companies (${smaller.slice(0, 2).map((p) => `${p.leader} against ${p.symbol}`).join(", ")}).` : ""} Use this to ask why your share lagged: the business, the price paid, or something temporary.` });
  const turning = pairs.filter((p) => p.nextWeek && p.nextWeek !== "laggard"), gaining = pairs.filter((p) => p.gaining && !turning.includes(p));
  const moves = (["leader", "in_line"] as PeerLabel[]).map((lab) => turning.filter((p) => p.nextWeek === lab)).filter((xs) => xs.length).map((xs) => `${list(xs.map((p) => p.symbol))} may move to ${PEER_WORD[xs[0].nextWeek!]} next week`);
  if (turning.length || gaining.length) out.push({ kind: "good", title: "Not all lags are equal", text: [...moves, gaining.length ? `${list(gaining.map((p) => p.symbol))} ${gaining.length === 1 ? "has" : "have"} been gaining on ${gaining.length === 1 ? "its" : "their"} peers over the last 3 months` : ""].filter(Boolean).join(", and ") + "." });
  return out;
}

// ------------------------------------------------------------------------------------------------ Diversification
export function spreadCards(weights: Record<string, number>, counts: Record<string, string[]>, sizeCount: Record<Size, number>, packs: { members: string[]; avg: number; name: string }[]): Card[] {
  const out: Card[] = [], inds = Object.keys(counts), multi = inds.filter((i) => counts[i].length > 1).sort((a, b) => counts[b].length - counts[a].length);
  out.push({ kind: inds.length >= 6 ? "good" : "watch", title: `Spread across ${inds.length} ${inds.length === 1 ? "industry" : "industries"}`, text: multi.length ? `Apart from ${list(multi.map((i) => `${i.toLowerCase()} (${counts[i].length} shares)`))}, every industry in the list has just one share.` : "Every industry in the list holds just one share." });
  const top = Object.entries(weights).sort((a, b) => b[1] - a[1])[0];
  // "tend to move together" only when every share of that industry is in the same pack; otherwise they are only in the same industry.
  if (top && top[1] >= 20) { const pack = packs.find((p) => p.name === top[0] && (counts[top[0]] ?? []).every((m) => p.members.includes(m))); out.push({ kind: "watch", title: `${top[0]} is ${pc(top[1])} of the list`, text: `${list(counts[top[0]] ?? [])}${pack ? " tend to move together" : " are in the same industry"}. A bad month for ${top[0].toLowerCase()} hits ${num((counts[top[0]] ?? []).length)} shares at once.` }); }
  const { Large: l = 0, Mid: m = 0, Small: s = 0 } = sizeCount;
  out.push({ kind: "insight", title: l && m && s ? "Balanced by size" : "Leaning to one size", text: `${l} large, ${m} mid and ${s} small companies.${l && s ? " Large companies steady the list; the small ones add most of the swings." : ""}` });
  return out;
}

// ------------------------------------------------------------------------------------------------ Risk analytics
export type MarketFig = { beta: number; vol: number; vol_nifty: number; max_fall: number; max_fall_nifty: number; worst10_list: number; worst10_nifty: number };
export function riskLead(m: MarketFig, top3: { symbols: string[]; risk: number; money: number } | null): { lead: string; rest: string; more: string } {
  const step = m.beta > 1.1 ? "moves more than" : m.beta < 0.9 ? "moves less than" : "moves roughly in step with";
  const swing = m.vol > m.vol_nifty * 1.15 ? "but its swings are bigger" : m.vol < m.vol_nifty * 0.85 ? "and its swings are smaller" : "and its swings are similar";
  const worst = m.worst10_list < m.worst10_nifty - 1.5 ? "fell more than" : m.worst10_list < m.worst10_nifty - 0.3 ? "fell a little more than" : m.worst10_list > m.worst10_nifty + 0.3 ? "fell less than" : "fell about as much as";
  return { lead: `Your list ${step} the Nifty 50 (beta ${m.beta.toFixed(2)}), ${swing}:`, rest: ` ${m.vol.toFixed(1)}% in a typical year against ${m.vol_nifty.toFixed(1)}%.`,
    more: `In the market's worst weeks it ${worst} the index.${top3 ? ` ${cap(num(top3.symbols.length))} shares, ${list(top3.symbols)}, carry ${pc(top3.risk)} of the ups and downs, though they are only ${pc(top3.money)} of the list.` : ""}` };
}
export function riskTiles(m: MarketFig): { k: string; v: string; nifty: string; sub: string; help: string }[] {
  return [
    { k: "Typical swing in a year", v: `${m.vol.toFixed(1)}%`, nifty: `${m.vol_nifty.toFixed(1)}%`, sub: m.vol > m.vol_nifty * 1.15 ? "A bumpier ride than the index." : m.vol < m.vol_nifty * 0.85 ? "A smoother ride than the index." : "About as bumpy as the index.", help: "Typical swing in a year. How much the list's value rises and falls in a typical year (the yearly volatility of its weekly returns)." },
    { k: "Worst fall from a high", v: sp(m.max_fall), nifty: sp(m.max_fall_nifty), sub: "The deepest drop in the period.", help: "Worst fall from a high. The biggest drop from a peak to a later low, over the weekly prices used." },
    { k: "In the 10 worst weeks", v: sp(m.worst10_list), nifty: sp(m.worst10_nifty), sub: m.worst10_list < m.worst10_nifty - 0.3 ? "Falls a little more when the market falls." : m.worst10_list > m.worst10_nifty + 0.3 ? "Falls less when the market falls." : "Falls about as much when the market falls.", help: "In the 10 worst weeks. The list's average move in the Nifty 50's ten worst weeks." },
    { k: "Beta", v: m.beta.toFixed(2), nifty: "1.00", sub: m.beta > 1.1 ? "Moves more than the index." : m.beta < 0.9 ? "Moves less than the index." : "Moves about in line with the index.", help: "Beta. How much the list tends to move when the Nifty 50 moves 1%. Above 1 means it moves more." },
  ];
}
export function riskCards(shares: Share[], shareRisk: Record<string, number>, shareMoney: Record<string, number>, day: string): Card[] {
  const out: Card[] = [];
  const rated = shares.filter((s) => s.risk != null).sort((a, b) => a.risk! - b.risk!);
  const worst = rated[0];
  if (worst && worst.risk! < 50) out.push({ kind: "warning", title: `${worst.symbol} is the riskiest share`, text: `Prism Risk ${Math.round(worst.risk!)}${weakP(worst.prism) ? ` and a weak business score (${Math.round(worst.prism!)})` : ""}.${shareRisk[worst.symbol] != null ? ` It is ${pc(shareMoney[worst.symbol] ?? 0)} of the list but ${pc(shareRisk[worst.symbol])} of the ups and downs.` : ""}` });
  const fell = shares.filter((s) => s.chg != null && s.chg <= -10 && s.size === "Small");
  const on = day === "Today" ? "today" : `on ${day}`;
  if (fell.length) out.push({ kind: "watch", title: `${cap(num(fell.length))} small-company ${fell.length === 1 ? "fall" : "falls"} ${on}`, text: `${list(fell.map((s) => s.symbol))} ${fell.length === 1 ? "fell" : "each fell"} more than 10% in one day. Small companies can move this much on little news.` });
  const steady = rated.filter((s) => s.risk! >= 80).sort((a, b) => a.symbol.localeCompare(b.symbol));
  if (steady.length) out.push({ kind: "good", title: `${cap(num(steady.length))} ${steady.length === 1 ? "share steadies" : "shares steady"} the list`, text: `${list(steady.map((s) => s.symbol))} ${steady.length === 1 ? "scores" : "all score"} ${Math.floor(Math.min(...steady.map((s) => s.risk!)))} or more on Prism Risk.` });
  return out;
}
export const riskWord = (v: number | null) => (v == null ? null : v < 52 ? "Higher risk" : v < 70 ? "Medium" : "Lower risk");
export function standsOut(s: Share, risky: boolean, day: string): string {
  const x: string[] = [];
  if (risky) x.push("Big price swings");
  if (s.m1 != null && s.m1 <= -10) x.push(`Fell ${Math.round(-s.m1)}% last month`);
  if (s.chg != null && s.chg <= -10) x.push(`${sp(s.chg)} on ${day === "Today" ? "today" : day}`.replace("on today", "today"));
  if (s.below52 != null && s.below52 >= 30) x.push("Far below its 1-year high");
  else if (s.below52 != null && s.below52 <= 5) x.push("Near its 1-year high");
  return x.join(" · ") || "—";
}

// ------------------------------------------------------------------------------------------------ What moves together (the grid)
type SegFig = { pairs: number; avg: number | null; at_least_05: number; top: { a: string; b: string; corr: number }[] };
/** One correlation as the pack prints it in a cell: ".54", "−.02", "1.00". */
export const corrCell = (v: number) => { const r = Math.round(Math.abs(v) * 100); return `${v < 0 && r ? "−" : ""}${r >= 100 ? "1.00" : "." + String(r).padStart(2, "0")}`; };
/** The tile beside the grid: "average; all 6 pairs at 0.5 or more. Closest: TECHM and INFY (0.78)". */
export function segLine(s: SegFig): string {
  const at = s.at_least_05 === 0 ? "none at 0.5 or more" : s.at_least_05 === s.pairs ? (s.pairs === 1 ? "the one pair is at 0.5 or more" : `all ${s.pairs} pairs at 0.5 or more`) : `${s.at_least_05} of ${s.pairs} pairs at 0.5 or more`;
  const t = s.top[0];
  return `average; ${at}.${t ? ` Closest: ${t.a} and ${t.b} (${t.corr.toFixed(2)})` : ""}`;
}
/** The two cards under the tiles: the biggest pack that moves together, and how the rest of the list moves. */
export function togetherCards(packs: { members: string[]; avg: number; name: string }[], crossAvg: number | null): Card[] {
  const out: Card[] = [];
  const big = packs.filter((p) => p.members.length >= 3).sort((a, b) => b.members.length - a.members.length || b.avg - a.avg)[0];
  if (big) out.push({ kind: "watch", title: `The ${big.members.length} ${big.name.toLowerCase()} shares ${big.avg >= 0.6 ? "move almost as one" : "tend to move together"}`,
    text: `${list(big.members)}: ${big.avg.toFixed(2)} on average. For spreading risk, they count closer to one bet than ${num(big.members.length)}.` });
  if (crossAvg != null) out.push(crossAvg < 0.3
    ? { kind: "good", title: `${big ? "Everything else" : "The list"} moves fairly independently`, text: `Shares from different sectors average ${crossAvg.toFixed(2)}: owning them does spread your risk.` }
    : { kind: "watch", title: "Even different sectors move together", text: `Shares from different sectors average ${crossAvg.toFixed(2)}: in this list, owning them spreads the risk less.` });
  return out;
}
