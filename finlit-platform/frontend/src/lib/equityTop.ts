// Task #183 (Equity portfolio, the 15 Nov pack): the top of the page (the score and one tile per tab) and each tab's Key figures cards, in the pack's words.
// Every figure is the server's (the page engine, the overview's scores and each share's peer reading); this file only counts and words them.
// Silver sees the FinLit IQ and Gold sees FinLit Prism, never both. Describes the list; never advice.
import type { Share } from "./equityPack";
import { trendBand } from "./prismTechnical";

export type TabKey = "portfolio" | "diversification" | "risk";
export type TopTile = { id: TabKey; k: string; v: string; sub: string; link: string; tone: "good" | "info" | "watch"; help: string; how: string; /** a small tag after the figure (ETF: "NIFTY 50 TWICE") */ tag?: string };
export type KeyCard = { tone: "good" | "info" | "watch" | "warn"; k: string; v: string; text: string; go: string; to: string };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const pct = (x: number) => `${Math.round(x)}%`;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const prismWord = (v: number) => (v >= 70 ? "Strong" : v >= 50 ? "Fair" : "Weak");
/** The FinLit IQ word of an average, by the IQ's own bands (the per-share words come from the server). */
export const iqWord = (v: number) => (v >= 80 ? "Strong" : v >= 65 ? "Healthy" : v >= 50 ? "Mixed" : "Watch");

type PageFigures = { score: { score: number; band: string }; market: { eq: { beta: number; vol: number; vol_nifty: number } } } | null;

/** The three tiles, one per tab. `spread`: the counts behind the Diversification analytics tile (macro sectors, sectors, industries, sizes held). */
export function topTiles(shares: Share[], page: PageFigures, model: "prism" | "finlit", spread: { macro?: number; sectors?: number; industries: number; sizes: number }): TopTile[] {
  let portfolio: TopTile;
  if (model === "prism") {
    const sc = shares.filter((s) => s.prism != null), avg = sc.length ? Math.round(sc.reduce((a, s) => a + (s.prism as number), 0) / sc.length) : null;
    const strong = sc.filter((s) => (s.prism as number) >= 70).length, weak = sc.filter((s) => (s.prism as number) < 50).length;
    portfolio = { id: "portfolio", k: "Portfolio", v: avg == null ? "Not scored" : `${prismWord(avg)} · ${avg}`, tone: "good", link: "Open Portfolio",
      sub: `Holding strength: average Prism, ${strong} strong · ${sc.length - strong - weak} fair · ${weak} weak${shares.length - sc.length ? ` · ${shares.length - sc.length} not scored` : ""}`,
      help: "The average FinLit Prism score of your shares, from 0 to 100, and how many are strong, fair or weak.", how: "Strong is 70 and above, fair 50 to 69, weak below 50. Open the tab for each share." };
  } else {
    const sc = shares.filter((s) => s.iq != null), avg = sc.length ? Math.round(sc.reduce((a, s) => a + (s.iq as number), 0) / sc.length) : null;
    const c = (w: string) => sc.filter((s) => (s.iqWord || "").toLowerCase() === w).length;
    portfolio = { id: "portfolio", k: "Portfolio", v: avg == null ? "Not scored" : `${iqWord(avg)} · ${avg}`, tone: "good", link: "Open Portfolio",
      sub: `Average FinLit IQ: ${c("strong")} strong · ${c("healthy")} healthy · ${c("mixed")} mixed${c("watch") ? ` · ${c("watch")} watch` : ""}${shares.length - sc.length ? ` · ${shares.length - sc.length} not scored` : ""}`,
      help: "The average FinLit IQ of your shares, from 0 to 100, and how many read Strong, Healthy, Mixed or Watch.", how: "Higher reads stronger. Each share's word comes from its own FinLit IQ. Open the tab for each share." };
  }
  const parts = [spread.macro != null ? `${spread.macro} macro ${spread.macro === 1 ? "sector" : "sectors"}` : null, spread.sectors != null ? `${spread.sectors} ${spread.sectors === 1 ? "sector" : "sectors"}` : null,
    `${spread.industries} ${spread.industries === 1 ? "industry" : "industries"}`, spread.sizes === 3 ? "all three sizes" : spread.sizes === 2 ? "two of the three sizes" : "one size"].filter(Boolean);
  const m = page?.market.eq;
  return [portfolio,
    { id: "diversification", k: "Diversification analytics", v: page ? `${page.score.score} · ${page.score.band}` : "–", sub: parts.join(" · "), tone: "info", link: "Open Diversification analytics",
      help: "How widely the list is spread across sectors and sizes, and how independently the shares move, from 0 to 100.", how: "Higher means more spread. The line under it counts the macro sectors, sectors, industries and sizes held." },
    { id: "risk", k: "Risk analytics", v: m ? `${m.beta > 1.1 ? "Above" : m.beta < 0.9 ? "Below" : "In line"} · β ${m.beta.toFixed(2)}` : "–", tone: "watch", link: "Open Risk analytics",
      sub: m ? `Against the index: ${m.vol > m.vol_nifty * 1.15 ? "bigger" : m.vol < m.vol_nifty * 0.85 ? "smaller" : "similar"} swings, ${m.vol.toFixed(1)}% a year vs ${m.vol_nifty.toFixed(1)}%` : "Needs a year of weekly prices",
      help: "Beta: how much the list tends to move when its index moves 1%. The swing: how much it rises and falls in a typical year.", how: "A beta above 1 has moved more than the index, below 1 less. The swing sits beside the index's." },
  ];
}

/** Portfolio tab, Key figures. Gold: against peers, price trend, valuation (Prism). Silver: Mixed FinLit IQ, weak technical pillar, strong FinLit IQ. */
export function portfolioCards(shares: Share[], model: "prism" | "finlit", valuationWord: string | null): KeyCard[] {
  const n = shares.length;
  if (model === "prism") {
    const lead = shares.filter((s) => s.peer?.label === "leader").length, lag = shares.filter((s) => s.peer?.label === "laggard"), inl = shares.filter((s) => s.peer?.label === "in_line").length;
    const worst = [...lag].sort((a, b) => (b.peer!.rank / b.peer!.of) - (a.peer!.rank / a.peer!.of)).slice(0, 2);
    const lt = shares.filter((s) => s.lt != null), up = lt.filter((s) => trendBand(s.lt) === "positive").length, down = lt.filter((s) => trendBand(s.lt) === "negative").length;
    const behind = shares.filter((s) => s.st != null && s.lt != null && (s.st as number) < (s.lt as number)).length;
    const weakest = shares.filter((s) => s.prism != null).sort((a, b) => (a.prism as number) - (b.prism as number)).slice(0, 2);
    return [
      { tone: "watch", k: "Against peers", v: `${lead} lead · ${lag.length} lag`, go: "See peers", to: "eq-peers",
        text: `${inl} in line, ${n - lead - lag.length - inl} not compared.${worst.length ? ` ${list(worst.map((s) => `${s.symbol} (${s.peer!.rank} of ${s.peer!.of})`))} trail their groups most.` : ""}` },
      { tone: "info", k: "Price trend", v: !lt.length ? "Not rated" : up * 100 >= lt.length * 55 ? "Mostly rising" : down * 100 >= lt.length * 55 ? "Mostly falling" : "Split", go: "See trends", to: "eq-trend",
        text: lt.length ? `${pct((up / lt.length) * 100)} of the list in a long-term uptrend, ${pct((down / lt.length) * 100)} in a downtrend. The short term trails the long term for ${pct((behind / lt.length) * 100)}.` : "No Prism trend reading yet." },
      { tone: "warn", k: "Valuation", v: valuationWord ?? "–", go: "Show weak shares", to: "pf-shares",
        text: `${valuationWord === "Weak" ? "Average Prism valuation reading: you pay above-typical prices." : valuationWord === "Strong" ? "Average Prism valuation reading: you pay below-typical prices." : "Average Prism valuation reading: close to typical prices."}${weakest.length ? ` ${list(weakest.map((s) => `${s.symbol} (${Math.round(s.prism as number)})`))} have the weakest business scores.` : ""}` },
    ];
  }
  const by = (w: string) => shares.filter((s) => (s.iqWord || "").toLowerCase() === w).sort((a, b) => (a.iq ?? 0) - (b.iq ?? 0));
  const mixed = by("mixed"), strong = by("strong").reverse(), weakTech = shares.filter((s) => s.iqTech != null && (s.iqTech as number) < 40).sort((a, b) => (a.iqTech as number) - (b.iqTech as number));
  const named = (xs: Share[], f: (s: Share) => number | null | undefined) => list(xs.slice(0, 3).map((s) => `${s.symbol} (${Math.round(f(s) ?? 0)})`));
  return [
    { tone: "watch", k: "Mixed FinLit IQ", v: `${mixed.length} ${mixed.length === 1 ? "share" : "shares"}`, go: "Show Mixed shares", to: "pf-shares",
      text: mixed.length ? `${named(mixed, (s) => s.iq)} score lowest.` : "None of your shares reads Mixed." },
    { tone: "warn", k: "Weak technical pillar", v: `${weakTech.length} ${weakTech.length === 1 ? "share" : "shares"}`, go: "See your shares", to: "pf-shares",
      text: weakTech.length ? `Their price trend reads below 40, including ${named(weakTech, (s) => s.iqTech)}.` : "No share's price trend reads below 40." },
    { tone: "good", k: "Strong FinLit IQ", v: `${strong.length} ${strong.length === 1 ? "share" : "shares"}`, go: "Show Strong shares", to: "pf-shares",
      text: strong.length ? `${named(strong, (s) => s.iq)} score highest.` : "None of your shares reads Strong yet." },
  ];
}

export { cap };
