// Task #183 (Equity portfolio, the 15 Nov pack): the top of the page (the score and one tile per tab) and each tab's Key figures cards, in the pack's words.
// Every figure is the server's (the page engine, the overview's scores and each share's peer reading); this file only counts and words them.
// Task #283: FinLit Prism is FinLit's only company score. Gold sees it (in Prism's words: Strong, Healthy, Average, Weak); a plan without Prism sees no
// company score here (a "FinLit Prism · see plans" tile). Describes the list; never advice.
import type { Share } from "./equityPack";
import { trendBand } from "./prismTechnical";
import { PRISM_BAND_WORD, prismBandOf } from "./planScore";

export type TabKey = "portfolio" | "diversification" | "risk";
export type TopTile = { id: TabKey; k: string; v: string; sub: string; link: string; tone: "good" | "info" | "watch"; help: string; how: string; /** a small tag after the figure (ETF: "NIFTY 50 TWICE") */ tag?: string };
export type KeyCard = { tone: "good" | "info" | "watch" | "warn"; k: string; v: string; text: string; go: string; to: string };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const pct = (x: number) => `${Math.round(x)}%`;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** FinLit Prism's word for a score: Strong 80 or more, Healthy 65 to 79, Average 50 to 64, Weak below 50. */
export const prismWord = (v: number) => PRISM_BAND_WORD[prismBandOf(v)!];
/** Developer file 28: FinLit Prism's five words, as each share's own label and Your portfolio score: Strong 80 or more, Healthy 65 to 79, Average 50 to 64,
 *  Weak 35 to 49, Poor below 35 (the server's mfscore LABELS, also the MF portfolio and All my investments scores). */
export const prismWord5 = (v: number) => { const s = Math.round(v * 10) / 10; return s >= 80 ? "Strong" : s >= 65 ? "Healthy" : s >= 50 ? "Average" : s >= 35 ? "Weak" : "Poor"; };

type PageFigures = { score: { score: number; band: string }; market: { eq: { beta: number; vol: number; vol_nifty: number } } } | null;
/** Developer file 28: the figures the cards show once every share has a quantity (Your portfolio score's answer, Gold): the average Prism, the spread score
 *  and the NIFTY 50 measures with each share counted by its value now. Without it the cards count every share the same, as the views below do. */
export type ByValue = { prism?: number | null; spread?: { score: number; band: string } | null; market?: { beta: number; vol: number; vol_nifty: number } | null };

/** The three tiles, one per tab. `spread`: the counts behind the Diversification analytics tile (macro sectors, sectors, industries, sizes held).
 *  `byValue` (developer file 28): the figures by value once every share has a quantity; each tile's (i) says which way it counts. */
export function topTiles(shares: Share[], page: PageFigures, model: "prism" | "finlit", spread: { macro?: number; sectors?: number; industries: number; sizes: number }, byValue: ByValue | null = null,
  /** QA 23 Nov (item 14): the shares' scores are still loading: the tile says so, never "Not scored" or "45 not scored" */ loading = false): TopTile[] {
  // which way a tile counts, said in its (i): by value once the score sent the figure; on Gold, the same for every share until each has a quantity
  const basis = (on: boolean) => (on ? "Each share counts by its value now." : model === "prism" && !byValue ? "Every share counts the same until each share has a quantity; then each counts by its value now." : "Every share counts the same.");
  let portfolio: TopTile;
  if (model === "prism") {
    const sc = shares.filter((s) => s.prism != null), mean = sc.length ? Math.round(sc.reduce((a, s) => a + (s.prism as number), 0) / sc.length) : null;
    const avg = byValue?.prism != null ? Math.round(byValue.prism) : mean;
    const c = (w: string) => sc.filter((s) => prismWord5(s.prism as number) === w).length, poor = c("Poor");
    // QA 23 Nov (item 16): this tile is the average FinLit Prism of the shares; the score panel beside it is the six-part portfolio score, so each says which it is
    const wait = loading && !sc.length;
    portfolio = { id: "portfolio", k: "Portfolio", v: wait ? "Loading scores…" : avg == null ? "Not scored" : `${prismWord5(avg)} · ${avg}`, tone: "good", link: "Open Portfolio",
      sub: wait ? "Reading each share's stored FinLit Prism score…" : `Average FinLit Prism of your shares${byValue?.prism != null ? ", by value" : ""}: ${c("Strong")} strong · ${c("Healthy")} healthy · ${c("Average")} average · ${c("Weak")} weak${poor ? ` · ${poor} poor` : ""}${shares.length - sc.length ? ` · ${shares.length - sc.length} ${loading ? "still loading" : "not scored"}` : ""}`,
      help: `The average FinLit Prism score of your shares, from 0 to 100, and how many read Strong, Healthy, Average, Weak or Poor. ${basis(byValue?.prism != null)}`, how: "Strong is 80 and above, Healthy 65 to 79, Average 50 to 64, Weak 35 to 49, Poor below 35. Open the tab for each share." };
  } else {
    portfolio = { id: "portfolio", k: "Portfolio", v: "FinLit Prism · see plans", tone: "good", link: "Open Portfolio",
      sub: `${shares.length} ${shares.length === 1 ? "share" : "shares"}, listed without a score on this plan`,
      help: "FinLit Prism, FinLit's only company score, comes with Gold: it scores each share from 0 to 100.", how: "On this plan the Portfolio tab lists your shares with their prices, sizes and peers." };
  }
  const parts = [spread.macro != null ? `${spread.macro} macro ${spread.macro === 1 ? "sector" : "sectors"}` : null, spread.sectors != null ? `${spread.sectors} ${spread.sectors === 1 ? "sector" : "sectors"}` : null,
    `${spread.industries} ${spread.industries === 1 ? "industry" : "industries"}`, spread.sizes === 4 ? "all four sizes" : spread.sizes === 3 ? "three of the four sizes" : spread.sizes === 2 ? "two of the four sizes" : "one size"].filter(Boolean);
  const vs = byValue?.spread ?? null, vm = byValue?.market ?? null, m = vm ?? page?.market.eq;
  const sp = vs ?? page?.score;
  return [portfolio,
    { id: "diversification", k: "Diversification analytics", v: sp ? `${sp.score} · ${sp.band}` : "–", sub: (vs && page ? [`By value now (${page.score.score} by count)`, ...parts] : parts).join(" · "), tone: "info", link: "Open Diversification analytics",
      help: `How widely the list is spread across sectors and sizes, and how independently the shares move, from 0 to 100. ${basis(!!vs)}`,
      how: `Higher means more spread. The line under it counts the macro sectors, sectors, industries and sizes held.${vs ? " The view below counts each share once." : ""}` },
    { id: "risk", k: "Risk analytics", v: m ? `${m.beta > 1.1 ? "Above" : m.beta < 0.9 ? "Below" : "In line"} · β ${m.beta.toFixed(2)}` : "–", tone: "watch", link: "Open Risk analytics",
      sub: m ? `${vm ? "By value now, against the index" : "Against the index"}: ${m.vol > m.vol_nifty * 1.15 ? "bigger" : m.vol < m.vol_nifty * 0.85 ? "smaller" : "similar"} swings, ${m.vol.toFixed(1)}% a year vs ${m.vol_nifty.toFixed(1)}%` : "Needs a year of weekly prices",
      help: `Beta: how much the list tends to move when its index (the NIFTY 50) moves 1%. The swing: how much it rises and falls in a typical year. ${basis(!!vm)}`,
      how: `A beta above 1 has moved more than the index, below 1 less. The swing sits beside the index's.${vm ? " The view below has no amounts: every share counts the same there." : ""}` },
  ];
}

/** Portfolio tab, Key figures. Gold: against peers, price trend, valuation (Prism). A plan without Prism: against peers only (task #283: no company score). */
export function portfolioCards(shares: Share[], model: "prism" | "finlit", valuationWord: string | null): KeyCard[] {
  const n = shares.length;
  const lead = shares.filter((s) => s.peer?.label === "leader").length, lag = shares.filter((s) => s.peer?.label === "laggard"), inl = shares.filter((s) => s.peer?.label === "in_line").length;
  const worst = [...lag].sort((a, b) => (b.peer!.rank / b.peer!.of) - (a.peer!.rank / a.peer!.of)).slice(0, 2);
  const peers: KeyCard = { tone: "watch", k: "Against peers", v: `${lead} lead · ${lag.length} lag`, go: "See peers", to: model === "prism" ? "eq-peers" : "pf-shares",
    text: `${inl} in line, ${n - lead - lag.length - inl} not compared.${worst.length ? ` ${list(worst.map((s) => `${s.symbol} (${s.peer!.rank} of ${s.peer!.of})`))} trail their groups most.` : ""}` };
  if (model !== "prism") return [peers];
  const lt = shares.filter((s) => s.lt != null), up = lt.filter((s) => trendBand(s.lt) === "positive").length, down = lt.filter((s) => trendBand(s.lt) === "negative").length;
  const behind = shares.filter((s) => s.st != null && s.lt != null && (s.st as number) < (s.lt as number)).length;
  const weakest = shares.filter((s) => s.prism != null).sort((a, b) => (a.prism as number) - (b.prism as number)).slice(0, 2);
  return [
    peers,
    { tone: "info", k: "Price trend", v: !lt.length ? "Not rated" : up * 100 >= lt.length * 55 ? "Mostly rising" : down * 100 >= lt.length * 55 ? "Mostly falling" : "Split", go: "See trends", to: "eq-trend",
      text: lt.length ? `${pct((up / lt.length) * 100)} of the list in a long-term uptrend, ${pct((down / lt.length) * 100)} in a downtrend. The short term trails the long term for ${pct((behind / lt.length) * 100)}.` : "No Prism trend reading yet." },
    { tone: "warn", k: "Valuation", v: valuationWord ?? "–", go: "Show weak shares", to: "pf-shares",
      text: `${valuationWord === "Weak" ? "Average Prism valuation reading: you pay above-typical prices." : valuationWord === "Strong" ? "Average Prism valuation reading: you pay below-typical prices." : "Average Prism valuation reading: close to typical prices."}${weakest.length ? ` ${list(weakest.map((s) => `${s.symbol} (${Math.round(s.prism as number)})`))} have the weakest business scores.` : ""}` },
  ];
}

export { cap };
