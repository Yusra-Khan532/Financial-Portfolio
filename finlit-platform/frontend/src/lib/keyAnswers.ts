// Task #274 (the 20 Nov equity pack, change 9): Key figures as three plain answers per view. Each card: what it is about, one full sentence with the
// numbers, a small bar with a legend, what the figure rests on, and a link. Vague headlines ("Mostly rising", "None", "Similar", "Weak · 34") are gone.
// A card with nothing to say is left out and the next one moves up. Pure: the page passes its own figures in. Describes; never advice.
import type { Share, Voice } from "./equityPack";
import type { RiskAnswer } from "./eqRisk";
import { scoreBand } from "./scoreBands";

export type KeyBar = { label: string; n: number; c: string };
export type KeyAnswer = { k: string; sentence: string; bar: KeyBar[]; rests: string; go: string; to: string;
  /** a bar drawn as rows with a line at 1.00 (the three highest betas) instead of one stacked bar */ rows?: { label: string; v: number }[]; sort?: string };

const C = { hi: "#2e7d5b", hiSoft: "#8cc5a3", mid: "#c08a1e", lo: "#c4553a", none: "#d6d0c4" };
export const SIZE_C: Record<string, string> = { Large: "#2f5a9e", Mid: "#0e6471", Small: "#c08a1e", Micro: "#a23b72" };
const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const num = (n: number) => (n <= 12 ? NUM[n] : String(n));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const ord = (n: number) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const pc = (x: number) => `${Math.round(x)}%`;
const side = (v: number) => { const r = Math.round(v); return r >= 20 ? 1 : r <= -20 ? -1 : 0; };   // the trend reading's own ±20 lines (finlit/mfportfolio/trend.py)
const keep = (b: KeyBar[]) => b.filter((x) => x.n > 0);

// ------------------------------------------------------------------------------------------------ Portfolio
export function portfolioAnswers(shares: Share[], gold: boolean, label: (s: Share) => string = (s) => s.symbol, voice: Voice = "own"): KeyAnswer[] {
  const LV = voice === "list";   // task #323 (file 22): the companies on a watchlist are watched, not owned
  const N = shares.length, out: KeyAnswer[] = [];
  if (!N) return out;
  const L = shares.filter((s) => s.peer?.label === "leader"), M = shares.filter((s) => s.peer?.label === "in_line"), G = shares.filter((s) => s.peer?.label === "laggard"), X = shares.filter((s) => !s.peer);
  if (L.length + M.length + G.length) {
    const worst = [...G].sort((a, b) => (b.peer!.rank / b.peer!.of) - (a.peer!.rank / a.peer!.of)).slice(0, 2);
    const why = [...new Set(X.map((s) => s.notCompared ?? "is not ranked"))];
    const nc = !X.length ? "" : X.length === 1 ? `${label(X[0])} ${why[0]}.` : why.length === 1 ? `${list(X.map(label))} ${plural(why[0])}.` : `${list(X.map(label))} are not compared yet.`;
    out.push({ k: "Against similar companies", go: "See peers", to: "eq-peers",
      sentence: `${L.length} of ${N} ${L.length === 1 ? "was" : "were"} among the strongest in ${L.length === 1 ? "its" : "their"} peer group over the last 12 months; ${G.length ? `${G.length} ${G.length === 1 ? "was" : "were"} among the weakest` : "none was among the weakest"}.`,
      bar: keep([{ label: "Strongest", n: L.length, c: C.hi }, { label: "Middle", n: M.length, c: C.mid }, { label: "Weakest", n: G.length, c: C.lo }, { label: "Not compared", n: X.length, c: C.none }]),
      rests: [worst.length ? `Furthest behind: ${list(worst.map((s) => `${label(s)} (${ord(s.peer!.rank)} of ${s.peer!.of})`))}.` : "", M.length ? `${M.length} ${M.length === 1 ? "sits" : "sit"} in the middle.` : "",
        // task #323 (developer file 21, part 3): a long list of shares not compared ran on after "sit in the middle;" as one sentence; past three it is counted
        X.length <= 3 ? nc : `${X.length} are not compared yet: ${list([...X.slice(0, 3).map(label), `${X.length - 3} more`])}, listed under Against their peers.`].filter(Boolean).join(" ") });
  }
  if (!gold) return out;
  const rated = shares.filter((s) => s.lt != null && s.st != null);
  if (rated.length) {
    const upL = rated.filter((s) => side(s.lt!) === 1), rising = upL.filter((s) => side(s.st!) === 1), rd = upL.length - rising.length;
    const flat = rated.filter((s) => side(s.lt!) === 0).length, fall = rated.filter((s) => side(s.lt!) === -1).length, nr = N - rated.length;
    out.push({ k: "Price trend", go: "See trends", to: "eq-trend",
      sentence: !upL.length ? `None of the ${rated.length} rated ${rated.length === 1 ? "share is" : "shares is"} in a long-term uptrend; ${fall} ${fall === 1 ? "is" : "are"} in a long-term downtrend.`
        : rd ? `${upL.length} of ${N} ${upL.length === 1 ? "is" : "are"} in a long-term uptrend, but ${rd} of them ${rd === 1 ? "is" : "are"} resting or dipping in recent weeks.`
        : `${upL.length} of ${N} ${upL.length === 1 ? "is" : "are"} in a long-term uptrend, and ${upL.length === 1 ? "it is" : "all of them are"} rising in recent weeks too.`,
      bar: keep([{ label: "Rising", n: rising.length, c: C.hi }, { label: "Resting or dipping", n: rd, c: C.hiSoft }, { label: "Flat", n: flat, c: C.none }, { label: "Falling", n: fall, c: C.lo }]),
      rests: `${upL.length ? `${fall} ${fall === 1 ? "is" : "are"} in a long-term downtrend and ${flat} ${flat === 1 ? "is" : "are"} flat. ` : ""}${nr ? `${nr} ${nr === 1 ? "has" : "have"} no trend reading yet. ` : ""}Long term is the trend over months, short term the last few weeks, from FinLit Prism's technical view; the trend table below shows each ${LV ? "company" : "share"}.` });
  }
  const val = shares.filter((s) => s.valuation != null);
  if (val.length) {
    const by = (b: string) => val.filter((s) => scoreBand(s.valuation) === b), S = by("hi"), F = by("mid"), W = by("lo");
    const avg = Math.round(val.reduce((a, s) => a + (s.valuation as number), 0) / val.length), top = Math.max(S.length, F.length, W.length);
    const lead = W.length === top ? `${W.length} of ${N} read weak on valuation: ${LV ? `${W.length === 1 ? "it trades" : "they trade"} at above-typical prices` : `you pay above-typical prices for ${W.length === 1 ? "it" : "them"}`}.`
      : S.length === top ? `${S.length} of ${N} read strong on valuation: ${LV ? `${S.length === 1 ? "it trades" : "they trade"} at below-typical prices` : `you pay below-typical prices for ${S.length === 1 ? "it" : "them"}`}.`
      : `${F.length} of ${N} read fair on valuation: prices close to typical.`;
    const named = (xs: Share[], w: string) => (!xs.length ? "" : xs.length <= 2 ? `${list(xs.map(label))} read${xs.length === 1 ? "s" : ""} ${w}` : `${xs.length} read ${w}`);
    const others = [W.length === top ? named(S, "strong") : named(W, "weak"), W.length === top || S.length === top ? named(F, "fair") : named(S, "strong")].filter(Boolean);
    out.push({ k: "Valuation", ...(LV ? { go: "See the list", to: "wp-list" } : { go: "Sort the table by valuation", to: "pf-shares", sort: "p_valuation" }), sentence: lead,
      bar: keep([{ label: "Strong", n: S.length, c: C.hi }, { label: "Fair", n: F.length, c: C.mid }, { label: "Weak", n: W.length, c: C.lo }]),
      rests: `The list averages ${avg} out of 100 on FinLit Prism's valuation reading.${others.length ? ` ${cap(others.join("; "))}.` : ""}${N - val.length ? ` ${N - val.length} not scored.` : ""}` });
  }
  return out;
}
/** "trades too thinly to rank fairly" → "trade too thinly to rank fairly" (several shares). */
function plural(why: string) { return why.replace(/^trades\b/, "trade").replace(/^has\b/, "have").replace(/^is\b/, "are"); }

// ------------------------------------------------------------------------------------------------ Diversification
export type DivFacts = { N: number; sectors: { name: string; n: number }[]; sectorLevelOfTop: string[];
  groups: { members: string[]; cross: boolean }[]; eff: number; counted: number };
export function divAnswers(d: DivFacts, label: (s: string) => string = (s) => s): KeyAnswer[] {
  const out: KeyAnswer[] = [], PAL = ["#4b4fc4", "#b5541c", "#a23b72", "#0e6471", "#7a8c2e", "#9a6b12", "#2f5a9e", "#5b6170", "#13606b", "#c08a1e"];
  const sec = [...d.sectors].sort((a, b) => b.n - a.n), top = sec[0];
  if (top) out.push({ k: "Largest sector", go: "See sectors", to: "eq-sectors",
    sentence: `${top.name} holds ${top.n} of your ${d.N} shares (${pc((top.n / Math.max(1, d.N)) * 100)}).`,
    bar: sec.map((s, i) => ({ label: s.name, n: s.n, c: PAL[i % PAL.length] })),
    rests: `${sec.length} macro ${sec.length === 1 ? "sector" : "sectors"} in all, counted by number of shares${d.sectorLevelOfTop.length === 1 ? `; every ${top.name} share is ${d.sectorLevelOfTop[0]} at sector level` : d.sectorLevelOfTop.length > 1 ? `; ${top.name} spans ${num(d.sectorLevelOfTop.length)} sectors` : ""}.` });
  const inG = new Set(d.groups.flatMap((g) => g.members)), cross = d.groups.filter((g) => g.cross).length, g = d.groups.length;
  out.push({ k: "Shares that move together", go: "See the groups", to: "eq-groups",
    sentence: !g ? "No group of shares moves closely together: each goes more or less its own way."
      : g === 1 ? `One group of ${inG.size} shares tends to move together, and ${cross ? "it crosses sector lines" : `all ${inG.size} are in one sector`}.`
      : `${cap(num(g))} groups (${inG.size} shares) tend to move together; ${cross ? `${cross} of them ${cross === 1 ? "crosses" : "cross"} sector lines` : "each sits inside one sector"}.`,
    bar: keep([{ label: "In a group", n: inG.size, c: "#b5541c" }, { label: "Move on their own", n: d.counted - inG.size, c: C.none }]),
    rests: g ? `${list(d.groups.slice(0, 2).map((x) => list(x.members.slice(0, 4).map(label)) + (x.members.length > 4 ? ` and ${x.members.length - 4} more` : "")))}${g > 2 ? `, and ${g - 2} more ${g - 2 === 1 ? "group" : "groups"}` : ""}. From a year of weekly prices.` : "From a year of weekly prices." });
  if (d.counted > 1) out.push({ k: "Separate bets", go: "See share by share", to: "eq-grid",
    sentence: `Your ${d.counted} shares behave like about ${d.eff.toFixed(1)} separate ones.`,
    bar: [{ label: "Separate bets", n: d.eff, c: "#4b4fc4" }, { label: "Overlap", n: Math.max(0, d.counted - d.eff), c: C.none }],
    rests: "The more two shares move together, the more they count as one bet. Worked out from how closely every pair moved over a year of weekly prices." });
  return out;
}

// ------------------------------------------------------------------------------------------------ Risk
export function riskAnswers(r: RiskAnswer, bySize: Record<string, { list: number; risk: number }>, label: (s: string) => string = (s) => s): KeyAnswer[] {
  const out: KeyAnswer[] = [], w = r.betas.weighted;
  if (w != null) out.push({ k: "Moves with the market", go: "See how it is built", to: "eq-build",
    sentence: `The list has moved about ${w.toFixed(1)}% for each 1% move in its markets (β ${w.toFixed(2)}${r.betas.weightedBand ? `, ${r.betas.weightedBand.word.toLowerCase()}` : ""}).`,
    bar: r.sizes.filter((s) => s.adds != null && s.adds > 0).map((s) => ({ label: `${s.size} ${s.adds!.toFixed(2)}`, n: s.adds!, c: SIZE_C[s.size] })),
    rests: "What each size adds to the list's beta. Each share is read against the index of companies its size, from weekly prices over the past year." });
  const sizes = Object.entries(bySize).filter(([k]) => SIZE_C[k]).sort((a, b) => (b[1].risk - b[1].list) - (a[1].risk - a[1].list));
  const big = sizes[0];
  if (big) out.push({ k: "Where the risk comes from", go: "See the risk split", to: "eq-mr",
    sentence: big[1].risk > big[1].list + 2 ? `${big[0]} companies are ${pc(big[1].list)} of the list but carry ${pc(big[1].risk)} of its ups and downs.` : `Each size carries about its share of the list's ups and downs; ${big[0].toLowerCase()} companies the most (${pc(big[1].risk)} of the risk for ${pc(big[1].list)} of the list).`,
    bar: Object.entries(bySize).filter(([k]) => SIZE_C[k]).map(([k, v]) => ({ label: `${k} ${pc(v.risk)}`, n: v.risk, c: SIZE_C[k] })),
    rests: "Each size's share of the list's risk, if equal amounts were held, from a year of weekly prices." });
  const hi = r.shares.filter((s) => s.beta != null).sort((a, b) => (b.beta as number) - (a.beta as number)).slice(0, 3);
  if (hi.length) out.push({ k: "Swings the most", go: "See each share", to: "eq-each", bar: [], rows: hi.map((s) => ({ label: label(s.symbol), v: s.beta as number })),
    sentence: `${label(hi[0].symbol)} has moved about ${(hi[0].beta as number).toFixed(1)}% for each 1% move in the ${hi[0].benchmark ?? "index of companies its size"} (β ${(hi[0].beta as number).toFixed(2)}).`,
    rests: `The three highest betas, with a line at 1.00 (moves as much as its index). ${hi.length > 1 ? `Next: ${list(hi.slice(1).map((s) => `${label(s.symbol)} (β ${(s.beta as number).toFixed(2)})`))}.` : ""}`.trim() });
  return out;
}
