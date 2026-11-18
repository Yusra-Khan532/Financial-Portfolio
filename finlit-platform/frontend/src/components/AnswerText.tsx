// FinLit AI's answers, drawn for reading (task #201: "short, precise answers in bullet points rather than lengthy paragraphs; highlight important numbers,
// percentages, financial figures, CAGR, growth rates, margins and valuation multiples in bold; compact tables or charts wherever they improve understanding;
// include relevant sources"). Every answer is plain text: each line becomes a bullet, figures with a unit (₹, %, ×, crore) are bold, the source and the
// disclaimer sit apart under the points, and a line that is a series of years or quarters ("FY22 ₹7.22 L Cr, FY23 ₹8.93 L Cr, …") also gets a small bar
// chart. Nothing is read as HTML: the text is split and drawn as React text. Styles: styles/ask-ai.css (aif-a-).
import { useEffect, useRef, useState, type ReactNode } from "react";

const MINUS = "−";
/** A figure worth bold: money, a percentage, a multiple or a crore/lakh amount (a bare year or count is left plain). */
const FIG = /((?:[+−-])?₹\s?[\d,]+(?:\.\d+)?(?:\s?(?:L Cr|Cr|lakh crore|crore|lakh))?|(?:[+−-])?\d[\d,]*(?:\.\d+)?\s?(?:%|×|x\b|L Cr\b|Cr\b|crore\b|lakh crore\b|bps\b))/g;
const SOURCE = /^\s*(Source|Sources|Data|From)\s*:/i;
const DISCLAIMER = /not a recommendation|not investment advice|Information only|Past returns do not guarantee/i;

/** **bold** marked by the answer itself, then the figures. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  text.split(/(\*\*[^*\n]+\*\*)/g).forEach((part, i) => {
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) { out.push(<b key={`${key}b${i}`}>{part.slice(2, -2)}</b>); return; }
    part.split(FIG).forEach((bit, j) => { if (!bit) return; out.push(j % 2 ? <b key={`${key}f${i}.${j}`} className="aif-a-n">{bit}</b> : bit); });
  });
  return out;
}

export type SeriesPoint = { label: string; value: number; text: string };
const POINT = /(FY\d{2}|Q[1-4](?:\s?FY\d{2})?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s\d{4})\s+([+−-]?₹?\s?[\d,]+(?:\.\d+)?)\s?(L Cr|Cr|%|×)?/g;
/** A line that lists a figure for three or more periods in one unit, as a series for a small chart; null otherwise. */
export function seriesOf(line: string): { points: SeriesPoint[]; unit: string } | null {
  const pts: SeriesPoint[] = [], units = new Set<string>();
  for (const m of line.matchAll(POINT)) {
    const v = Number(m[2].replace(/[₹,\s+]/g, "").replace(/^[−-]/, "-"));
    if (!Number.isFinite(v)) continue;
    // the figure as the answer wrote it (9.80 stays 9.80)
    pts.push({ label: m[1], value: v, text: m[2].replace(/[₹\s+]/g, "").replace(/^-/, MINUS) }); units.add((m[3] ?? "") + (m[2].includes("₹") ? "₹" : ""));
  }
  return pts.length >= 3 && units.size === 1 ? { points: pts, unit: [...units][0] } : null;
}

function Bars({ points, unit }: { points: SeriesPoint[]; unit: string }) {
  // drawn at its real width, so the 11px labels stay 11px on a phone; when a bar is too narrow for its figures, every other one is labelled (the latest always is)
  const ref = useRef<SVGSVGElement>(null), [W, setW] = useState(440);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { const w = Math.round(el.getBoundingClientRect().width); if (w > 0) setW(w); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 112, top = 20, bottom = 20, max = Math.max(...points.map((p) => p.value), 0), min = Math.min(...points.map((p) => p.value), 0), span = max - min || 1;
  const bw = W / points.length, zero = top + (max / span) * (H - top - bottom);
  // about 6.6px a character at 11px: the widest label or figure, with a little air, against the width of one bar
  const need = Math.max(...points.map((p) => Math.max(p.text.length, p.label.replace(/^([A-Z][a-z]{2})\w*\s\d{2}(\d{2})$/, "$1 ’$2").length))) * 6.6 + 6;
  const step = need > W / points.length ? 2 : 1, shown = (i: number) => (points.length - 1 - i) % step === 0;
  const short = (l: string) => l.replace(/^([A-Z][a-z]{2})\w*\s(\d{2})(\d{2})$/, "$1 ’$3");   // "Dec 2024" -> "Dec ’24", so eight quarters fit
  return (
    <svg ref={ref} className="aif-a-bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={points.map((p) => `${p.label} ${p.text}${unit.replace("₹", "")}`).join(", ")}>
      <line x1="0" x2={W} y1={zero} y2={zero} className="aif-a-axis" />
      {points.map((p, i) => {
        const y = top + ((max - Math.max(p.value, 0)) / span) * (H - top - bottom), h = Math.max(1, (Math.abs(p.value) / span) * (H - top - bottom));
        const last = i === points.length - 1;
        // on a narrow chart the end labels are pinned inside its edges, so "Sep ’26" is never cut off
        const tight = need > bw, cx = i * bw + bw / 2, ax = tight && last ? W - 1 : tight && i === 0 ? 1 : cx, anchor = tight && last ? "end" : tight && i === 0 ? "start" : "middle";
        return (<g key={p.label + i}>
          <rect x={i * bw + bw * 0.18} y={p.value >= 0 ? y : zero} width={bw * 0.64} height={h} rx="2" className={"aif-a-bar" + (last ? " on" : "") + (p.value < 0 ? " neg" : "")} />
          {shown(i) && <text x={cx} y={p.value >= 0 ? y - 4 : zero + h + 12} textAnchor="middle" className="aif-a-v">{p.text}</text>}
          {shown(i) && <text x={ax} y={H - 4} textAnchor={anchor} className="aif-a-l">{short(p.label)}</text>}
        </g>);
      })}
    </svg>);
}

/** The answer, drawn: points, then the source and the disclaimer. */
export function AnswerText({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const points = lines.filter((l) => !SOURCE.test(l) && !DISCLAIMER.test(l)), sources = lines.filter((l) => SOURCE.test(l)), notes = lines.filter((l) => !SOURCE.test(l) && DISCLAIMER.test(l));
  return (
    <div className="aif-a">
      {points.length > 0 && <ul className="aif-a-pts">{points.map((l, i) => {
        const body = l.replace(/^[•\-*]\s+/, ""), s = seriesOf(body);
        return <li key={i}>{inline(body, String(i))}{s && <Bars points={s.points} unit={s.unit} />}</li>;
      })}</ul>}
      {sources.map((l, i) => <p key={"s" + i} className="aif-a-src">{inline(l, "s" + i)}</p>)}
      {notes.map((l, i) => <p key={"d" + i} className="aif-a-disc">{l}</p>)}
    </div>);
}
