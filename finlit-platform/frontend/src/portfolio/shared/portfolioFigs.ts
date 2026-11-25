// Task #385 (developer file 33, Portfolio view): the figures the Portfolio view works out from what the page already loads. Pure, so each rule is tested.
//   portfolioKeyFigs   the three Key figures cards (peers, price trend, valuation), reading lists of one and two shares.
//   gainLoss           "Where your gain or loss came from": each share's rupee gain or loss and the summary line, by the pack's rule.
// Describes figures; never advice.
import type { Share } from "../../lib/equityPack";
import { scoreBand } from "../../lib/scoreBands";
import type { KeyFig } from "./KeyFigures";
import { rupees, rupeesSigned } from "./numbers";
import { andList, cap1, coName, countOf, numWord, pluralOf, trendReading, trendSide } from "./words";

export const KF_C = { hi: "var(--gain)", hiSoft: "color-mix(in srgb, var(--gain) 45%, var(--s1))", mid: "var(--warn)", lo: "var(--loss)", none: "var(--border-strong)" };
export const ordinal = (n: number) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
/** "is" or "are" after "1 of 2": the card's short answer carries its verb on a list of one or two shares (file 33: "1 of 2 is in a long-term uptrend"). */
const verb = (n: number, N: number, one: string, many: string) => (N <= 2 ? (n === 1 ? one : many) + " " : "");

/** The Portfolio view's Key figures. `gold`: the plan sees FinLit Prism (trend and valuation cards). `valueOf`: rupee value now, for "most money in". */
export function portfolioKeyFigs(shares: Share[], gold: boolean, valueOf: (symbol: string) => number | null = () => null): KeyFig[] {
  const N = shares.length, out: KeyFig[] = [];
  if (!N) return out;
  const L = shares.filter((s) => s.peer?.label === "leader"), M = shares.filter((s) => s.peer?.label === "in_line"), G = shares.filter((s) => s.peer?.label === "laggard"), X = shares.filter((s) => !s.peer);
  if (L.length + M.length + G.length) {
    const worst = [...G].sort((a, b) => b.peer!.rank / b.peer!.of - a.peer!.rank / a.peer!.of);
    out.push({ q: "Do your shares beat similar companies?", big: `${L.length} of ${N}`, ans: N === 1 || (N === 2 && L.length === 1) ? "leads its peer group" : "lead their peer group",
      sub: [`${G.length} ${G.length === 1 ? "trails" : "trail"} it`, `${M.length} in the middle`, X.length ? `${X.length} not compared` : "", "over the last 12 months"].filter(Boolean).join(" · "),
      tip: "Each share's price over the last 12 months against similar companies (its peer group). Leading: among the strongest of its group; trailing: among the weakest. It describes the past, not the future.",
      bar: [{ label: "Strongest", n: L.length, c: KF_C.hi }, { label: "Middle", n: M.length, c: KF_C.mid }, { label: "Weakest", n: G.length, c: KF_C.lo }, { label: "Not compared", n: X.length, c: KF_C.none }].filter((b) => b.n > 0),
      worth: worst.length ? { label: "Furthest behind", names: worst.map((s) => ({ symbol: s.symbol, label: coName(s), note: `${ordinal(s.peer!.rank)} of ${s.peer!.of}` })) } : null,
      go: "See peers", to: gold ? "eq-peers" : "pf-shares" });
  }
  if (!gold) return out;
  const rated = shares.filter((s) => trendSide(s.lt) != null && trendSide(s.st) != null);
  if (rated.length) {
    const upL = rated.filter((s) => trendSide(s.lt) === 1), rising = upL.filter((s) => trendSide(s.st) === 1), rd = upL.length - rising.length;
    const flat = rated.filter((s) => trendSide(s.lt) === 0).length, fall = rated.filter((s) => trendSide(s.lt) === -1).length, nr = N - rated.length;
    const both = rated.filter((s) => trendReading(s.st, s.lt) === "Falling");
    out.push({ q: "Are their prices rising?", big: `${upL.length} of ${N}`, ans: `${verb(upL.length, N, "is", "are")}in a long-term uptrend`,
      sub: [rd ? `${rd} of them dipping lately` : "", `${fall} falling`, nr ? `${nr} not rated yet` : ""].filter(Boolean).join(" · "),
      tip: "From FinLit Prism's technical view: the long-term trend is the price over months, the short-term trend the last few weeks. Dipping lately: a long-term uptrend whose short term is resting or falling.",
      bar: [{ label: "Rising", n: rising.length, c: KF_C.hi }, { label: "Resting or dipping", n: rd, c: KF_C.hiSoft }, { label: "Flat", n: flat, c: KF_C.none }, { label: "Falling", n: fall, c: KF_C.lo }].filter((b) => b.n > 0),
      worth: both.length ? { label: "Falling on both trends", names: both.map((s) => ({ symbol: s.symbol, label: coName(s) })) } : null,
      go: "See trends", to: "eq-trend" });
  }
  const val = shares.filter((s) => s.valuation != null);
  if (val.length) {
    const by = (b: string) => val.filter((s) => scoreBand(s.valuation) === b), S = by("hi"), F = by("mid"), W = by("lo");
    const rich = [...W].sort((a, b) => (valueOf(b.symbol) ?? -1) - (valueOf(a.symbol) ?? -1));
    out.push({ q: "Are you paying a lot for them?", big: `${W.length} of ${N}`, ans: `${verb(W.length, N, "is", "are")}priced above typical`,
      sub: [`${S.length} priced low`, `${F.length} fairly priced`, N - val.length ? `${N - val.length} not scored` : ""].filter(Boolean).join(" · "),
      tip: "FinLit Prism's valuation part for each share: how its price compares with its own earnings, book and history and with similar companies. Strong reads cheaper than typical, Weak dearer.",
      bar: [{ label: "Strong", n: S.length, c: KF_C.hi }, { label: "Fair", n: F.length, c: KF_C.mid }, { label: "Weak", n: W.length, c: KF_C.lo }].filter((b) => b.n > 0),
      worth: rich.length ? { label: "Priced above typical, most money in", names: rich.map((s) => ({ symbol: s.symbol, label: coName(s) })) } : null,
      go: "Sort the table by valuation", to: "pf-shares", sort: "p_valuation" });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ where the gain or loss came from
export type GLRow = { symbol: string; name: string; gain: number; pct: number | null };
export type GainLoss = { rows: GLRow[]; total: number; key: Set<string>; lead: { bold: string; rest: string } | null; noPrice: number; shown: (open: boolean) => GLRow[]; capped: boolean };

/** Rows (biggest gain first), their total, the named shares and the summary line (file 33):
 *  for a loss, take the biggest losses in order, at most three, until together they are as big as the whole loss. Found: "One share explains the whole
 *  loss. <A> is down ₹x; the other 12 shares are up ₹y together." (two or three: "<A> (−₹x) and <B> (−₹y) are down ₹z between them"). Not found: "The loss
 *  is spread out. The three biggest losses, <A>, <B> and <C>, come to ₹z; 6 of your 13 shares are in profit." Gains mirror this.
 *  `noPrice`: shares held without a buy price (left out, counted in one line). Above 12 rows the 5 biggest gains, the 5 biggest losses and any named share show. */
/** `countSide` (the ETF page, task #390 L4): a spread-out loss counts the lines in loss ("3 of your 6 ETFs are in loss"), a gain those in profit. */
export function gainLoss(input: GLRow[], noPrice = 0, noun = "share", countSide = false): GainLoss {
  // task #389 (developer file 32, Your funds 7): the MF page counts funds ("Three funds explain the whole gain"); the rule is the same
  const N1 = noun, Ns = pluralOf(noun);
  const rows = [...input].sort((a, b) => b.gain - a.gain), N = rows.length, total = rows.reduce((a, r) => a + r.gain, 0);
  const key = new Set<string>();
  let lead: GainLoss["lead"] = null;
  if (N >= 2 && Math.round(total) !== 0) {
    const loss = total < 0, w = loss ? "loss" : "gain";
    const side = rows.filter((r) => (loss ? r.gain < 0 : r.gain > 0)).sort((a, b) => (loss ? a.gain - b.gain : b.gain - a.gain));
    let c = 0, k = 0, hit = false;
    for (; k < side.length && k < 3; k++) { c += side[k].gain; if (loss ? c <= total : c >= total) { k++; hit = true; break; } }
    if (hit && k < N) {
      const who = side.slice(0, k), os = total - c, oth = N - k; who.forEach((r) => key.add(r.symbol));
      const named = k === 1 ? `${who[0].name} is ${loss ? "down" : "up"} ${rupees(Math.abs(who[0].gain))}` : `${andList(who.map((r) => `${r.name} (${rupeesSigned(r.gain)})`))} are ${loss ? "down" : "up"} ${rupees(Math.abs(c))} between them`;
      const others = Math.abs(os) < 1 ? `${oth === 1 ? `the other ${N1} is` : `the other ${oth} ${Ns} are`} flat` : `${oth === 1 ? `the other ${N1} is` : `the other ${oth} ${Ns} are`} ${os > 0 ? "up" : "down"} ${rupees(Math.abs(os))}${oth > 1 ? " together" : ""}`;
      lead = { bold: `${k === 1 ? `One ${N1} explains` : `${cap1(numWord(k))} ${Ns} explain`} the whole ${w}.`, rest: `${named}; ${others}.` };
    } else if (hit && k === N) {
      // every share is on the same side (a list of two or three): there are no "others" to set against them
      side.forEach((r) => key.add(r.symbol));
      lead = { bold: `${N === 2 ? `Both ${Ns} are` : `All ${numWord(N)} ${Ns} are`} ${loss ? "down" : "up"}.`, rest: `${andList(side.map((r) => `${r.name} (${rupeesSigned(r.gain)})`))} come to ${rupees(Math.abs(c))} together.` };
    } else {
      const top = side.slice(0, 3); top.forEach((r) => key.add(r.symbol));
      const sum = top.reduce((a, r) => a + r.gain, 0), up = rows.filter((r) => r.gain > 0).length, inLoss = countSide && loss, cnt = inLoss ? rows.filter((r) => r.gain < 0).length : up;
      if (top.length) lead = { bold: `The ${w} is spread out.`, rest: `${top.length > 1 ? `The ${numWord(top.length)} biggest ${loss ? "losses" : "gains"}, ${andList(top.map((r) => r.name))}, come` : `The biggest ${w}, ${top[0].name}, comes`} to ${rupees(Math.abs(sum))}; ${cnt} of your ${countOf(N, N1, Ns)} ${cnt === 1 ? "is" : "are"} in ${inLoss ? "loss" : "profit"}.` };
    }
  }
  const capped = N > 12;
  const shown = (open: boolean) => {
    if (!capped || open) return rows;
    const keep = new Set([...rows.filter((r) => r.gain > 0).slice(0, 5), ...rows.filter((r) => r.gain < 0).slice(-5)].map((r) => r.symbol));
    key.forEach((s) => keep.add(s));
    return rows.filter((r) => keep.has(r.symbol));
  };
  return { rows, total, key, lead, noPrice, shown, capped };
}
