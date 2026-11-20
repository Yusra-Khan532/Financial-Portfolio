// Task #183 part 2 (MF portfolio): the dark "Your MF list" box that opens the top of the page, beside one tile per tab (the Equity page's TopGrid).
import { Tip } from "../../components/sectors/pack/Common";
import type { listBox } from "../../lib/mfTop";

export function ListBox({ box, onUnits }: { box: ReturnType<typeof listBox>; onUnits: () => void }) {
  return (
    <div className="mfp-listbox">
      <p className="mfp-lb-k">Your MF list<Tip text="The funds in your list, by type, and how many stocks sit inside them, from the fund houses' latest monthly files." how="Until units are added every fund counts the same, so a liquid fund weighs as much as an equity fund. Add units to weigh them by your money." label="About “Your MF list”" /></p>
      <p className="mfp-lb-v"><b>{box.n}</b> {box.n === 1 ? "fund" : "funds"}</p>
      <p className="mfp-lb-x">{box.line} {box.weights}</p>
      <button type="button" className="mfp-lb-go" onClick={onUnits}>{box.valued ? "Change units" : "Add units"}</button>
    </div>
  );
}

/** Task #275 (change 16): the score beside the views, "Your funds' health" on its 0–100 scale: the list's average Fund Health Score and its band, in the
 *  server's words, with a marker on the scale. Until units are added every fund counts the same, and the card says so. */
export function HealthCard({ value, label, n, valued }: { value: number | null; label: string | null; n: number; valued: boolean }) {
  const w = label ? label.charAt(0) + label.slice(1).toLowerCase() : null, v = value == null ? null : Math.round(value);
  return (
    <div className="ptk-score mfp-hc">
      <p className="ptk-sk">{n === 1 ? "Your fund's health" : "Your funds' health"}<Tip text="The Fund Health Score of your funds, from 0 to 100: performance, risk, cost and quality against funds in the same category. With more than one fund, their average." how="Higher reads healthier. Each fund's score and its four parts are in Your funds." /></p>
      <p className="ptk-sline">{v == null ? "None of your funds has a Health Score yet" : <>{n === 1 ? "Your fund reads" : "Your funds read"} <b className={"mfp-hc-w " + (w ? w.toLowerCase() : "")}>{w ?? "–"}</b></>}</p>
      {v != null && <div className="mfp-hc-scale" role="img" aria-label={`${v} of 100, ${w ?? "no band"}`}>
        <span className="mfp-hc-m" style={{ left: `${Math.max(0, Math.min(100, v))}%` }}><b>{v}</b><i aria-hidden="true">▼</i></span>
        <span className="mfp-hc-bar" aria-hidden="true" /><span className="mfp-hc-t" aria-hidden="true">{[0, 25, 50, 75, 100].map((t) => <small key={t}>{t}</small>)}</span></div>}
      <p className="ptk-sx">{valued ? "Each fund counts by the value of your units." : "Add units to weight the score by value now."}</p>
    </div>
  );
}
