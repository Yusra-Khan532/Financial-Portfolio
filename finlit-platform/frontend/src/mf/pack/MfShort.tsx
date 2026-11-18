// Task #183 part 2 (MF portfolio, pack 02): "What this means, in short" at the end of every tab (Data, Moves together, Inside, Risk), written from the funds'
// figures, and the sources line that ends the page. Describes; never advice.
import type { MfSpread } from "../../lib/mfPortfolio";
import { shortFund, type MfRisk } from "../../lib/mfPack";

const p0 = (x: number) => `${Math.round(x * 100)}%`;
/** The four lines. Exported for tests. */
export function shortLines(sp: MfSpread | undefined, rk: MfRisk | undefined): [string, string][] {
  const out: [string, string][] = [];
  if (sp) {
    const nm = (c: number) => shortFund(sp.funds.find((f) => f.code === c)?.name);
    const miss = sp.coverage.missing.map(nm);
    const data = [miss.length ? `${miss.join(" and ")}'s monthly holdings ${miss.length === 1 ? "are" : "are"} not loaded yet, so ${miss.length === 1 ? "it is" : "they are"} left out of the stock, sector and overlap readings. ${miss.length === 1 ? "Its" : "Their"} NAV is used for the risk figures.` : "Every fund's monthly holdings are loaded.",
      sp.coverage.notMatched ? `${sp.coverage.notMatched} share ${sp.coverage.notMatched === 1 ? "ISIN is" : "ISINs are"} not matched to a listed company: shown as "Not sized".` : ""].filter(Boolean).join(" ");
    out.push(["Data", data]);
    const t = sp.together;
    if (t.codes.length > 1) {
      let best: [number, number, number] | null = null;
      t.codes.forEach((a, i) => t.codes.forEach((b, j) => { if (j > i && (!best || t.C[i][j] > best[2])) best = [a, b, t.C[i][j]]; }));
      const [a, b, v] = best as unknown as [number, number, number], fa = sp.funds.find((f) => f.code === a), fb = sp.funds.find((f) => f.code === b);
      out.push(["Moves together", `Your ${t.codes.length === 4 ? "four" : t.codes.length} equity-type funds move like ${sp.readings.together.independent.toFixed(1)} independent funds. The closest pair is ${nm(a)} and ${nm(b)} (${v.toFixed(2)}), from ${fa?.category === fb?.category ? "the same category" : "different categories"}.`]);
    }
    const tot = sp.size.Large + sp.size.Mid + sp.size.Small;
    if (sp.knownShares > 0) out.push(["Inside", `${sp.knownShares >= 0.45 && sp.knownShares <= 0.55 ? "Half the list" : p0(sp.knownShares) + " of the list"} is in shares: ${p0(sp.size.Large / (tot || 1))} of those are in large companies and ${p0(sp.size.Small / (tot || 1))} in small, by FinLit's ₹ sizes.`]);
  }
  const o = rk?.own?.list;
  if (rk && o?.betaOwn != null) {
    const words = [...new Set(rk.funds.filter((f) => f.compared && f.band).sort((a, b) => (a.betaOwn ?? 0) - (b.betaOwn ?? 0)).map((f) => f.band!.word))];
    out.push(["Risk", `Against their own benchmarks the funds read ${words.length > 1 ? `${words[0]} to ${words[words.length - 1]}` : words[0] ?? "–"}.${o.liquidShare ? ` The liquid fund holds the list's beta down to ${o.betaOwn.toFixed(2)}.` : ` The list's beta is ${o.betaOwn.toFixed(2)}.`}`]);
  }
  return out;
}

export function InShort({ sp, rk }: { sp: MfSpread | undefined; rk: MfRisk | undefined }) {
  const lines = shortLines(sp, rk);
  if (!lines.length) return null;
  return (
    <section className="sp-sec mfs-short" aria-labelledby="mfs-short-h"><h2 id="mfs-short-h">What this means, in short</h2>
      <p className="sp-sub">Written from your funds' figures, {sp?.basis === "value" ? "each fund counting by the value of your units" : "each fund counting the same"}.</p>
      <dl>{lines.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section>
  );
}

export const SOURCES = "NAVs, costs and categories from AMFI; holdings from each fund house's monthly portfolio file; index levels from NSE. Information only, not investment advice.";
