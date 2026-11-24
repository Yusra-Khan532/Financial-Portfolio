// Task #235 (the 18 Nov portfolios pack, B8 v2 and v3): "If the market fell X%" as a picture. Above: the size of the fall (5%, 10% on load, the index's worst
// fall in 3 years, 20%). Left card: the scenario toggle, the list's fall, a chip against the market, the rupee line on the selected portfolio's value now
// (₹10 lakh without quantities) and where the figure comes from. Right card: bars hanging from a 0 line (market hatched, the list red, parts amber when
// shallower than the market and red when deeper) with a dashed line at the market's fall. Everything scales by size ÷ 10. Describes; not a forecast.
import { useState, type ReactNode } from "react";
import { Section } from "../../components/sectors/pack/Common";
import { lk } from "../money";
import "./market-fall.css";

export type FallScenario = { label: string; beta: number | null; src: string; parts: boolean; na?: string };
export type FallPart = { label: string; beta: number; sub: string };
export type FallProps = {
  id: string; scenarios: FallScenario[]; parts: FallPart[]; market?: { label: string; sub: string }; list?: { label: string; sub: string };
  worst?: { pct: number; line: string } | null; value: { now: number; name?: string } | null; idx?: string; after?: ReactNode; extraNote?: string;
  /** the heading's word: "market" (Equity) or "Nifty 500" (MF, ETF, All my investments) */ what?: string;
  /** no rupee line at all (All my investments shows no ₹ until quantities are in) */ noRupees?: boolean;
  /** the word after the gap in the chip: "pts" (default) or, on the Equity portfolio (task #385, no "pts" on that page), "points" */ unit?: string;
};

const f1 = (v: number) => `${v < 0 ? "−" : v > 0 ? "+" : ""}${Math.abs(v).toFixed(1)}%`;
const fs = (n: number) => String(Math.round(n * 10) / 10);
const H = 140;

/** The figures for one size of fall F (in %) and one scenario: the list's fall, the chip, the rupee line, the bars and the scale (pack market-fall.js). */
export function fallFigures(p: Pick<FallProps, "scenarios" | "parts" | "value" | "idx" | "unit">, F: number, i: number) {
  const d = p.scenarios[i]?.beta != null && !p.scenarios[i].na ? p.scenarios[i] : p.scenarios[0], idx = p.idx ?? "market";
  const big = d.beta == null ? null : -Math.round(d.beta * F * 10) / 10;
  const diff = big == null ? 0 : Math.abs(big) - F;
  const chip = big == null ? null : Math.abs(diff) < 0.05 ? { cls: "eq", text: `About the same as the ${idx}` }
    : { cls: diff > 0 ? "more" : "less", text: `${Math.abs(diff).toFixed(1)} ${p.unit === "points" && Math.abs(diff).toFixed(1) === "1.0" ? "point" : p.unit ?? "pts"} ${diff > 0 ? "more" : "less"} than the ${idx}’s ${fs(F)}%` };
  const on = p.value && p.value.now > 0 ? p.value : null;
  const rs = big == null ? null : { v: `−${lk(((on?.now ?? 1e6) * Math.abs(big)) / 100)}`, x: on ? `on your ${lk(on.now)} value now${on.name && on.name !== "All accounts" ? ` in ${on.name}` : ""}` : "on ₹10 lakh" };
  const parts = p.parts.map((x) => ({ ...x, fall: -Math.round(x.beta * F * 10) / 10 }));
  const mx = Math.max(F, 5, Math.abs(big ?? 0), ...parts.map((x) => Math.abs(x.fall)));
  const scale = Math.max(5, Math.ceil((mx * 1.12) / 5) * 5);
  return { d, big, chip, rs, parts, scale, ref: (F / scale) * H, h: (v: number) => (Math.abs(v) / scale) * H, deep: (v: number) => Math.abs(v) > F + 0.05 };
}

export function MarketFall(p: FallProps) {
  const [F, setF] = useState(10), [i, setI] = useState(0);
  const x = fallFigures(p, F, i), idx = p.idx ?? "market", si = x.d === p.scenarios[i] ? i : 0;
  const sizes: { f: number; small?: string }[] = [{ f: 5 }, { f: 10 }, ...(p.worst && p.worst.pct > 0 ? [{ f: Math.round(p.worst.pct * 10) / 10, small: p.worst.line }] : []), { f: 20 }];
  const mk = p.market ?? { label: "Market", sub: "each size’s own index" }, ls = p.list ?? { label: "Your list", sub: "size-weighted" };
  const bars = [{ k: "mkt", label: mk.label, sub: mk.sub, v: -F }, ...(x.big != null ? [{ k: "list", label: ls.label, sub: ls.sub, v: x.big }] : []),
    ...x.parts.map((q) => ({ k: "part " + (x.deep(q.fall) ? "deep" : "soft"), label: q.label, sub: q.sub, v: q.fall }))];
  return (
    <Section id={p.id} hide title={`If the ${p.what ?? "market"} fell ${fs(F)}%`} help="A rough size guide from past betas: each part falls about its beta times the market's fall." how="Pick the size of the fall above the cards. The rupee line uses the value now of the portfolio you picked, or ₹10 lakh until quantities are in. Real falls are uneven; this is not a forecast."
      sub="A rough size guide from past betas. Real falls are uneven; this is not a forecast.">
      <div className={"fx" + (x.d.parts ? "" : " fx-noparts")}>
        <div className="fx-top"><div className="fx-size" role="group" aria-label="Size of the fall"><span>Size of the fall</span>
          {sizes.map((s) => <button key={s.f} type="button" aria-pressed={s.f === F} onClick={() => setF(s.f)} title={s.small}>{fs(s.f)}%{s.small && <small>{s.small}</small>}</button>)}</div></div>
        <div className="fx-l">
          {p.scenarios.length > 1 && <div className="fx-seg" role="group" aria-label="Which fall">{p.scenarios.map((s, k) => <button key={s.label} type="button" aria-pressed={k === si} disabled={s.beta == null || !!s.na} title={s.na} onClick={() => setI(k)}>{s.label.replace(/\{F\}/, fs(F))}</button>)}</div>}
          <p className="fx-k">{ls.label} would fall about</p>
          <p className="fx-big"><b>{x.big == null ? "—" : f1(x.big)}</b></p>
          {x.chip && <p className="fx-vs"><span className={"fx-chip " + x.chip.cls}>{x.chip.text}</span></p>}
          {x.rs && !p.noRupees && <div className="fx-rs"><span className="fx-rs-k">In rupees</span><b>{x.rs.v}</b><small>{x.rs.x}</small></div>}
          <p className="fx-src">{x.d.beta == null ? "Not enough prices for a beta yet." : x.d.src}</p>
        </div>
        <div className="fx-r"><p className="fx-k">How deep each part would fall</p>
          <div className="fx-ch" role="img" aria-label={`If the ${idx} fell ${fs(F)}%: ${bars.map((b) => `${b.label} ${f1(b.v)}`).join("; ")}`}>
            <span className="fx-ref" style={{ top: `${x.ref}px` }} />
            {bars.map((b) => { const h = x.h(b.v); return <div key={b.label + b.k} className={"fx-c " + b.k}><div className="fx-bw"><i style={{ height: `${h}px` }} /><span className="fx-v" style={{ top: `${h + 4}px` }}>{f1(b.v)}</span></div><b>{b.label}</b><small>{b.sub}</small></div>; })}
          </div>
          <p className="fx-note"><span aria-hidden="true" className="fx-dash" />The {idx}’s {fs(F)}% fall. The bars scale with the size of the fall: each part falls about its beta times the {idx}’s fall. A rough guide from past betas; in big falls shares tend to move together more, so real falls can be deeper and uneven. Not a forecast.{p.extraNote ? ` ${p.extraNote}` : ""}</p>
        </div>
      </div>
      {p.after}
    </Section>
  );
}
