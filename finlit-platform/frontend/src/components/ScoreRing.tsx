// The shared score ring (dashboard pack, 15 Nov 2026, START-HERE rule 4): the stock page's Prism ring (stock/PrismCardView SegRing, .pcx-ring), used wherever a
// score out of 100 appears on a card. One arc per part (a Prism part, or a fund), each filled to its score and coloured by its band; ticks around the edge and a
// disc in the centre; inside, the score, "/ 100" and the band word. Bands, as the pack and the stock page's part words name them: Strong 80 and above, Healthy
// 65–79, Average 50–64, Weak 35–49, Poor below 35 (green for Strong and Healthy, orange for Average, red for Weak and Poor). With no score it is an empty ring
// with a word ("— NONE YET"); a small ring (under 80px, a one-line strip) shows only "—", since chart words never draw below 11px on screen (lib/svgText.ts). Hidden from screen readers: the card carries the numbers in words. Styles: styles/score-ring.css (classes srg-*).
import { useId, type CSSProperties } from "react";
import { arcPath, polar, ringArcs } from "../stock/prismCardLogic";
import "../styles/score-ring.css";

export type RingBand = "hi" | "mid" | "lo" | "na";
/** The band word of a score out of 100, and its colour band. */
export function bandWord(v: number | null | undefined): { word: string; band: RingBand } {
  if (v == null || !Number.isFinite(v)) return { word: "No score", band: "na" };
  return v >= 80 ? { word: "Strong", band: "hi" } : v >= 65 ? { word: "Healthy", band: "hi" } : v >= 50 ? { word: "Average", band: "mid" } : v >= 35 ? { word: "Weak", band: "lo" } : { word: "Poor", band: "lo" };
}
/** The CSS colour of a band (the site's --band-* tokens, set for light and dark). */
export const bandColour = (b: RingBand) => (b === "na" ? "var(--faint)" : `var(--band-${b})`);

const C = 80, RA = 64, SW = 10, CAP = ((SW / 2) / RA) * (180 / Math.PI);

export function ScoreRing({ parts, score, word, size = 152, empty = "NONE YET" }: { parts: { key: string; value: number | null }[]; score: number | null; word?: string | null; size?: number; empty?: string }) {
  const id = "srg" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const arcs = parts.length ? ringArcs(parts, parts.length > 1 ? 9 : 0) : [];
  const b = bandWord(score), label = (word || b.word).toUpperCase();
  return (
    <span className="srg" aria-hidden="true" style={{ width: size, height: size }}>
      <svg viewBox="0 0 160 160">
        <defs><radialGradient id={`${id}d`} cx=".5" cy=".3" r=".85"><stop offset="0" stopColor="var(--srg-disc-1)" /><stop offset=".6" stopColor="var(--srg-disc-2)" /><stop offset="1" stopColor="var(--srg-disc-3)" /></radialGradient></defs>
        {Array.from({ length: 60 }, (_, i) => { const [x0, y0] = polar(C, C, 77.5, i * 6), [x1, y1] = polar(C, C, i % 5 === 0 ? 73.5 : 75.5, i * 6); return <line key={i} className={"srg-tk" + (i % 5 === 0 ? " maj" : "")} x1={x0.toFixed(2)} y1={y0.toFixed(2)} x2={x1.toFixed(2)} y2={y1.toFixed(2)} />; })}
        {arcs.length === 0 && <circle className="srg-trk" cx={C} cy={C} r={RA} />}
        {arcs.map((a, i) => {
          const one = arcs.length === 1, s = one ? 0 : a.a0 + CAP, e = one ? 359.99 : Math.max(s + 0.5, a.a1 - CAP), v = a.value ?? 0;
          const [kx, ky] = polar(C, C, RA, s + ((e - s) * v) / 100);
          return (
            <g key={a.key} style={{ "--pc": bandColour(bandWord(a.value).band), "--i": i } as CSSProperties}>
              <path className="srg-trk" d={arcPath(C, C, RA, s, e)} />
              {v > 0 && <><path className="srg-fill" d={arcPath(C, C, RA, s, s + ((e - s) * v) / 100)} /><circle className="srg-knob" cx={kx.toFixed(2)} cy={ky.toFixed(2)} r="3" /></>}
            </g>
          );
        })}
        <circle className="srg-disc" cx={C} cy={C} r="49" fill={`url(#${id}d)`} />
        <circle className="srg-disc2" cx={C} cy={C} r="44" />
        {score == null
          ? <><text className="srg-num b-na" x={C} y={C + (size < 80 ? 10 : 6)} textAnchor="middle">—</text>{size >= 80 && <text className="srg-wd" x={C} y={C + 26} textAnchor="middle">{empty}</text>}</>
          : <><text className={"srg-num b-" + b.band} x={C} y={C + 4} textAnchor="middle">{Math.round(score)}</text><text className="srg-of" x={C} y={C + 18} textAnchor="middle">/ 100</text>
            <text className={"srg-wd b-" + b.band} x={C} y={C + 31} textAnchor="middle">{label}</text></>}
      </svg>
    </span>
  );
}
