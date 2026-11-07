// Block 6, Stress Lab: today's conditions. The Stress Lab nightly run (site_data/stress/SYM.json) is not part of this codebase yet, so it covers none of the member's
// stocks: one line says so, instead of a tall card that listed "Not covered yet" for every stock. Nothing is estimated; the block grows into the full card
// (the shocks and earnings changes per stock) once the run covers a stock.
import type { Followed } from "./MyStocks";

export function Stress({ followed, loading }: { followed: Followed[]; loading: boolean; sectors?: Map<string, string | null> }) {
  const n = followed.length;
  return (
    <section className="dsh-card dsh-strip" aria-label="Stress Lab: today's conditions">
      <span className="dsh-new">New</span>
      <b className="t">Stress Lab</b>
      <span className="m">{loading ? "Checking your stocks…" : n
        ? `None of your ${n} stock${n === 1 ? " is" : "s are"} in the nightly run yet. How crude, rupee, inflation and rate shocks would touch them will show here once they are.`
        : "Follow stocks to see how crude, rupee, inflation and rate shocks would touch them, once the nightly run covers them."}</span>
    </section>
  );
}
