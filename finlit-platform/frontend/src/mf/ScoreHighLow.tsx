// Task #403: a small, always-visible note under the Mutual Fund Score's part bars saying what a high and a low figure mean
// ("high Risk = lower risk: a calmer ride, smaller falls; high Cost = lower costs"). One component, so every card says the same. Describes, never advises.
import { HIGH_LOW_LEAD, HIGH_LOW_ORDER, HIGH_LOW_TAIL, PART_HIGH } from "../lib/mfScore";
import "./score-high-low.css";

export function ScoreHighLow({ className = "" }: { className?: string }) {
  return (
    <p className={("mfs-hl " + className).trim()} data-testid="score-high-low">
      <b>{HIGH_LOW_LEAD}</b> {HIGH_LOW_TAIL}{" "}
      {HIGH_LOW_ORDER.map(([k, name], i) => <span key={k} className="mfs-hl-i">{i > 0 && <i aria-hidden="true"> · </i>}High {name} = {PART_HIGH[k]}</span>)}.
    </p>
  );
}
