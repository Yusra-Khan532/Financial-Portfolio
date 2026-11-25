// Task #183 part 3 (ETF portfolio, pack 03): "What this means, in short", written from the ETFs' figures, and the sources line that ends the page.
// Describes; never advice. Task #390 PR B (developer file 34, W14, F4): the risk line in the new words ("moves 0.58× as much as the Nifty 500", no "beta"),
// lists as "A, B and C".
import { andList, movesAsMuch } from "../../portfolio/shared";
import type { EtfPortfolio, EtfRisk, Inside } from "../../lib/etfPortfolio";
import { furthest, live } from "../../lib/etfTop";

const num = (n: number) => ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] ?? String(n);
/** The four lines. Exported for tests. */
export function shortLines(d: EtfPortfolio | undefined, ins: Inside | undefined, rk: EtfRisk | undefined): [string, string][] {
  const out: [string, string][] = [];
  if (!d) return out;
  const xs = live(d);
  if (ins) {
    const miss = ins.files.filter((f) => f.why).map((f) => f.symbol), noTer = xs.filter((e) => e.ter?.value == null).map((e) => e.symbol);
    out.push(["Data", [miss.length ? `${andList(miss.map((m) => `${m}'s`))} monthly ${miss.length === 1 ? "file is" : "files are"} not loaded yet. ${miss.length === 1 ? "Its price is" : "Their prices are"} used for the risk figures.` : "Every ETF's monthly file is loaded.",
      noTer.length ? `No expense ratio is published for ${andList(noTer)} in AMFI's file.` : "Expense ratios are AMFI's."].join(" ")]);
  }
  for (const r of d.repeats) {
    const p = ins?.overlap.pairs.find((x) => r.symbols.includes(x.a) && r.symbols.includes(x.b)), share = xs.filter((e) => r.symbols.includes(e.symbol)).reduce((a, e) => a + (e.weight ?? 0), 0);
    out.push(["Same index", `${andList(r.symbols)} hold the same ${p?.n ?? ""} companies${p ? ` (${p.pct.toFixed(1)}% overlap)` : ""}; together they are ${Math.round(share)}% of the list.`.replace("same  companies", "same companies")]);
  }
  const f = furthest(d);
  if (f.far && Math.abs(f.far.premium as number) >= 1) out.push(["Price against value", `${f.far.symbol} closed ${Math.abs(f.far.premium as number).toFixed(1)}% ${(f.far.premium as number) > 0 ? "above" : "below"} its last NAV. ${f.near === f.others ? `The other ${num(f.others)} were within 0.2%.` : `${f.near} of the other ${num(f.others)} were within 0.2%.`}`]);
  const o = rk?.own?.list, ind = xs.filter((e) => e.type?.key === "indian").length, calm = [...new Set(xs.filter((e) => e.type?.key !== "indian").map((e) => e.type?.key === "liquid" ? "the liquid ETF" : e.type?.word.toLowerCase()))];
  if (o?.betaOwn != null) out.push(["Risk", `${ind ? `The ${num(ind)} Indian share ${ind === 1 ? "ETF moves" : "ETFs move"} ${(o.betaIndian ?? 0) >= 0.9 ? "almost as one with the market" : "less than the market"}. ` : ""}${calm.length ? `${andList(calm as string[]).replace(/^./, (c) => c.toUpperCase())} bring the list down: it moves ${movesAsMuch(o.betaOwn, "the Nifty 500")}.` : `The list moves ${movesAsMuch(o.betaOwn, "the Nifty 500")}.`}`]);
  return out;
}

export function InShort({ d, ins, rk }: { d: EtfPortfolio | undefined; ins: Inside | undefined; rk: EtfRisk | undefined }) {
  const lines = shortLines(d, ins, rk);
  if (!lines.length) return null;
  return (
    <section className="sp-sec mfs-short" aria-labelledby="etp-short-h"><h2 id="etp-short-h">What this means, in short</h2>
      <p className="sp-sub">Written from your ETFs' figures, {d?.basis === "value" ? "each ETF counting by the value of your quantity" : "each counting the same"}.</p>
      <dl>{lines.map(([k, v], i) => <div key={k + i}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section>
  );
}

export const SOURCES = "Prices: NSE closing prices. NAV, costs and fund houses from AMFI; holdings from each fund house's monthly portfolio file; index levels from NSE. Information only, not investment advice.";
