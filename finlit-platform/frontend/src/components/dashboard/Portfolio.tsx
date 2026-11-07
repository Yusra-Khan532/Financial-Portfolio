// Your portfolio at a glance: the shares in the member's Equity portfolio, read with FinLit Prism like the Equity portfolio page (average score, score
// colours, the average of each Prism part) and their spread across sectors and company sizes. Size follows AMFI's rule: the 100 largest listed companies
// by market value are large, the next 150 mid, the rest small. Descriptive only; information only.
import { useMemo } from "react";
import { Link } from "react-router";
import type { Row } from "../../lib/screener";
import { useUI } from "../../lib/ui";
import { Card, Rows } from "./parts";

const PARTS: [keyof Row, string][] = [["prism_fundamental", "Growth & Profitability"], ["prism_valuation", "Valuation"], ["prism_quality", "Quality"], ["prism_risk", "Risk (higher is safer)"]];
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
export const colourOf = (v: number | null) => (v == null ? "n" : v >= 70 ? "g" : v >= 50 ? "o" : "r");

/** AMFI size of each listed company: rank by market value; 1-100 large, 101-250 mid, the rest small. */
export function amfiSizes(rows: Row[]): Map<string, "Large" | "Mid" | "Small"> {
  const ranked = rows.filter((r) => (r.market_cap ?? 0) > 0).sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));
  return new Map(ranked.map((r, i) => [r.symbol, i < 100 ? "Large" : i < 250 ? "Mid" : "Small"] as const));
}

export type Glance = {
  count: number; scored: number; avgPrism: number | null; colours: { g: number; o: number; r: number; n: number };
  parts: { label: string; value: number | null }[]; sectors: number; largest: { name: string; count: number } | null; sizes: { label: string; count: number }[];
};
export function glance(held: string[], rows: Row[]): Glance {
  const by = new Map(rows.map((r) => [r.symbol, r])), sizeOf = amfiSizes(rows);
  const mine = held.map((s) => by.get(s)).filter((r): r is Row => !!r);
  const finals = mine.map((r) => num(r.prism_final));
  const colours = { g: 0, o: 0, r: 0, n: held.length - mine.length };
  for (const v of finals) colours[colourOf(v)] += 1;
  const sectors = new Map<string, number>();
  for (const r of mine) sectors.set(r.sector || "Not classified", (sectors.get(r.sector || "Not classified") ?? 0) + 1);
  const largest = [...sectors.entries()].sort((a, b) => b[1] - a[1])[0];
  const sizes = new Map<string, number>();
  for (const r of mine) { const s = sizeOf.get(r.symbol); if (s) sizes.set(s, (sizes.get(s) ?? 0) + 1); }
  return {
    count: held.length, scored: finals.filter((v) => v != null).length, avgPrism: avg(finals), colours,
    parts: PARTS.map(([k, label]) => ({ label, value: avg(mine.map((r) => num(r[k]))) })),
    sectors: sectors.size, largest: largest ? { name: largest[0], count: largest[1] } : null,
    sizes: (["Large", "Mid", "Small"] as const).filter((l) => sizes.get(l)).map((l) => ({ label: l, count: sizes.get(l)! })),
  };
}

export function PortfolioGlance({ held, rows, loading }: { held: string[]; rows: Row[]; loading: boolean }) {
  const g = useMemo(() => glance(held, rows), [held, rows]);
  const { has } = useUI();
  if (!held.length) return (
    <Card id="portfolio" title="Your portfolio at a glance">
      <div className="dsh-empty"><b>No shares added yet</b><p>Add the shares you hold to see their average score, score colours and sector spread.</p><Link className="dsh-btn" to="/holdings">Add your shares</Link></div>
    </Card>
  );
  const total = Math.max(1, g.colours.g + g.colours.o + g.colours.r + g.colours.n);
  const w = (n: number) => `${(n / total) * 100}%`;
  const sizeLine = g.sizes.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(", ");
  return (
    <Card id="portfolio" title="Your portfolio at a glance" className="dsh-pg"
      sub={`${g.count} ${g.count === 1 ? "share" : "shares"} · read with FinLit Prism, like the Equity portfolio page`}>
      {loading ? <Rows n={3} h={40} /> : <>
        {g.scored === 0 ? (has("gold")
          ? <p className="dsh-note">No Prism score is stored yet for these shares. A share's score appears here once its FinLit Prism rating has been calculated; <Link to="/prism">open FinLit Prism</Link>.</p>
          : <p className="dsh-note">The average score, score colours and Prism parts use FinLit Prism, part of Gold. <Link to="/plans">See plans</Link>.</p>) : <>
          <div className="dsh-pg-top">
            <div className="dsh-pg-kpi"><span className="k">Average Prism</span><b>{g.avgPrism ?? "—"}</b></div>
            <div>
              <p className="dsh-lh first">Score colours</p>
              <div className="dsh-pg-mix" role="img" aria-label={`${g.colours.g} green (70 or more), ${g.colours.o} orange (50 to 69), ${g.colours.r} red (below 50)${g.colours.n ? `, ${g.colours.n} without a score` : ""}`}>
                {g.colours.g > 0 && <i className="g" style={{ width: w(g.colours.g) }} />}{g.colours.o > 0 && <i className="o" style={{ width: w(g.colours.o) }} />}
                {g.colours.r > 0 && <i className="r" style={{ width: w(g.colours.r) }} />}{g.colours.n > 0 && <i className="n" style={{ width: w(g.colours.n) }} />}
              </div>
              <p className="dsh-pg-legend"><span><b className="g">{g.colours.g}</b> green 70+</span><span><b className="o">{g.colours.o}</b> orange 50–69</span><span><b className="r">{g.colours.r}</b> red</span>{g.colours.n > 0 && <span><b>{g.colours.n}</b> no score</span>}</p>
            </div>
          </div>
          <p className="dsh-lh">Average by Prism part</p>
          <div className="dsh-pg-parts">{g.parts.map((p) => (
            <div className="dsh-pg-part" key={p.label}><span>{p.label}</span><span className="t" aria-hidden="true"><i className={colourOf(p.value)} style={{ width: `${p.value ?? 0}%` }} /></span><b>{p.value ?? "—"}</b></div>))}</div>
        </>}
        <p className="dsh-note dsh-pg-spread">{g.sectors} {g.sectors === 1 ? "sector" : "sectors"}{g.largest && g.sectors > 1 ? `, the largest holds ${g.largest.count} of ${g.count}` : ""}{sizeLine ? ` · ${sizeLine} cap (AMFI)` : ""}</p>
        <Link className="dsh-link foot" to="/holdings">Open Equity portfolio →</Link>
      </>}
    </Card>
  );
}
