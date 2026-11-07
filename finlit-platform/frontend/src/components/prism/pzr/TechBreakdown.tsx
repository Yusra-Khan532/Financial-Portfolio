// The technical view, part two: how the two trends line up (the trend alignment and its 3 x 3 map). The numbers are the engine's own (nothing here
// recalculates a score); the words come from the shared wording file and only describe the chart. How the scores are built stays on the server.
// Styles: styles/prism-technical.css (pzt-*).
import { MINUS } from "../../../lib/format";
import {
  ALIGN_BAND_WORD, BAND_ORDER, fmtScore, trendAlignment, verdictView,
  type TechAssessment, type TrendAlignment, type VerdictTone,
} from "../../../lib/prismTechnical";

const VSHAPE: Record<VerdictTone, string> = { pos: "▲", mixed: "◆", neg: "▼", na: "–" };
const sgn = (x: number, d: number) => (x > 0 ? "+" : x < 0 ? MINUS : "") + Math.abs(x).toFixed(d);
/** A signal: two decimals with a sign; a points figure: one decimal. A zero has no sign. */
export const fmtSignal = (x: number) => sgn(Math.abs(x) < 0.005 ? 0 : x, 2);
export const fmtPoints = (x: number) => sgn(Math.abs(x) < 0.05 ? 0 : x, 1);

/** The sentence that shows the working: both scores, both bands, and the label. */
export function alignmentSentence(a: Pick<TechAssessment, "shortTerm" | "longTerm">): string {
  const al = trendAlignment(a.shortTerm.score, a.longTerm.score);
  if (!al) return "";
  return `Short-term ${fmtScore(a.shortTerm.score)} (${al.stBandWord}) × long-term ${fmtScore(a.longTerm.score)} (${al.ltBandWord}) = ${al.label}.`;
}

export function TrendMap({ al }: { al: TrendAlignment }) {
  const cell = (st: string, lt: string) => al.cells.find((c) => c.stBand === st && c.ltBand === lt)!;
  return (
    <div className="pzt-tw pzt-mapw">
      <table className="pzt-map">
        <caption>Trend map: the short-term band down the side, the long-term band across the top. The highlighted cell is where this company is now.</caption>
        <thead><tr><td aria-hidden="true" />{BAND_ORDER.map((lt) => <th scope="col" key={lt}><small>Long-term</small>{ALIGN_BAND_WORD[lt]}</th>)}</tr></thead>
        <tbody>
          {BAND_ORDER.map((st) => (
            <tr key={st}>
              <th scope="row"><small>Short-term</small>{ALIGN_BAND_WORD[st]}</th>
              {BAND_ORDER.map((lt) => {
                const c = cell(st, lt);
                return (
                  <td key={lt} className={"pzt-mc " + c.tone + (c.current ? " now" : "")} aria-current={c.current ? "true" : undefined} title={c.text || undefined}>
                    {c.label}{c.current && <><b className="pzt-now" aria-hidden="true">Now</b><span className="sr-only"> (this is where the company is now)</span></>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Under the two scores: the alignment label, how it was reached, and the map. Nothing when one score is missing. */
export function TrendAlignmentBlock({ a }: { a: TechAssessment }) {
  const v = verdictView(a), al = trendAlignment(a.shortTerm.score, a.longTerm.score);
  return (
    <section className={"pzt-verdict " + v.tone} aria-label={`Trend alignment: ${v.word}. ${v.detail}`}>
      <span className="pzt-vk">Trend alignment</span>
      <span className={"pzt-vchip " + v.tone}><i aria-hidden="true">{VSHAPE[v.tone]}</i>{v.word}</span>
      {al?.text && <span className="pzt-vtext">{al.text}.</span>}
      <span className="pzt-vd">{al ? alignmentSentence(a) : v.detail} It is separate from the 0 to 100 financial-health score.</span>
      {al && <TrendMap al={al} />}
    </section>
  );
}
