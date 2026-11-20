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

type PageFigures = { score: { score: number; band: string }; market: { eq: { beta: number; vol: number; vol_nifty: number } } } | null;

/** The three tiles, one per tab. `spread`: the counts behind the Diversification analytics tile (macro sectors, sectors, industries, sizes held). */
export function topTiles(shares: Share[], page: PageFigures, model: "prism" | "finlit", spread: { macro?: number; sectors?: number; industries: number; sizes: number }): TopTile[] {
  let portfolio: TopTile;
  if (model === "prism") {
    const sc = shares.filter((s) => s.prism != null), avg = sc.length ? Math.round(sc.reduce((a, s) => a + (s.prism as number), 0) / sc.length) : null;
    const c = (b: "strong" | "healthy" | "average" | "weak") => sc.filter((s) => prismBandOf(s.prism) === b).length;
    portfolio = { id: "portfolio", k: "Portfolio", v: avg == null ? "Not scored" : `${prismWord(avg)} · ${avg}`, tone: "good", link: "Open Portfolio",
      sub: `Average FinLit Prism: ${c("strong")} strong · ${c("healthy")} healthy · ${c("average")} average · ${c("weak")} weak${shares.length - sc.length ? ` · ${shares.length - sc.length} not scored` : ""}`,
      help: "The average FinLit Prism score of your shares, from 0 to 100, and how many read Strong, Healthy, Average or Weak.", how: "Strong is 80 and above, Healthy 65 to 79, Average 50 to 64, Weak below 50. Open the tab for each share." };
  } else {
    portfolio = { id: "portfolio", k: "Portfolio", v: "FinLit Prism · see plans", tone: "good", link: "Open Portfolio",
      sub: `${shares.length} ${shares.length === 1 ? "share" : "shares"}, listed without a score on this plan`,
      help: "FinLit Prism, FinLit's only company score, comes with Gold: it scores each share from 0 to 100.", how: "On this plan the Portfolio tab lists your shares with their prices, sizes and peers." };
  }
  const parts = [spread.macro != null ? `${spread.macro} macro ${spread.macro === 1 ? "sector" : "sectors"}` : null, spread.sectors != null ? `${spread.sectors} ${spread.sectors === 1 ? "sector" : "sectors"}` : null,
    `${spread.industries} ${spread.industries === 1 ? "industry" : "industries"}`, spread.sizes === 4 ? "all four sizes" : spread.sizes === 3 ? "three of the four sizes" : spread.sizes === 2 ? "two of the four sizes" : "one size"].filter(Boolean);
  const m = page?.market.eq;
  return [portfolio,
    { id: "diversification", k: "Diversification analytics", v: page ? `${page.score.score} · ${page.score.band}` : "–", sub: parts.join(" · "), tone: "info", link: "Open Diversification analytics",
      help: "How widely the list is spread across sectors and sizes, and how independently the shares move, from 0 to 100.", how: "Higher means more spread. The line under it counts the macro sectors, sectors, industries and sizes held." },
    { id: "risk", k: "Risk analytics", v: m ? `${m.beta > 1.1 ? "Above" : m.beta < 0.9 ? "Below" : "In line"} · β ${m.beta.toFixed(2)}` : "–", tone: "watch", link: "Open Risk analytics",
      sub: m ? `Against the index: ${m.vol > m.vol_nifty * 1.15 ? "bigger" : m.vol < m.vol_nifty * 0.85 ? "smaller" : "similar"} swings, ${m.vol.toFixed(1)}% a year vs ${m.vol_nifty.toFixed(1)}%` : "Needs a year of weekly prices",
      help: "Beta: how much the list tends to move when its index moves 1%. The swing: how much it rises and falls in a typical year.", how: "A beta above 1 has moved more than the index, below 1 less. The swing sits beside the index's." },
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
