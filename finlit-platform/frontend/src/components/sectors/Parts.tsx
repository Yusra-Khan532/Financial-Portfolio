// Small pieces the Sector Pulse pages share: the state chip, a locked block and a blank that says why. Styles: styles/sectors.css (sx-).
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "../../lib/icons";
import { TIER, useUI, type Plan } from "../../lib/ui";
import { stateClass, stateWord } from "../../lib/sectors";
import "../../styles/sectors.css";

/** The state as a coloured chip; the word is always written, so colour is never the only signal. */
export function StateChip({ state, big, extra, word }: { state: string | null | undefined; big?: boolean; extra?: string; word?: string }) {
  return <span className={`sx-chip ${stateClass(state)}${big ? " big" : ""}`}>{word ?? stateWord(state) ?? "No reading"}{extra ? ` · ${extra}` : ""}</span>;   // `word`: a shorter form for a table cell (the rest is written under the chip)
}

/** A figure the plan does not include: said in words, with the plan that opens it. Never an empty cell. */
export function LockedBlock({ plan, title, children }: { plan: Plan; title: string; children?: ReactNode }) {
  const { upgrade } = useUI();
  const t = TIER[plan];
  return (
    <div className="sx-lock" role="note">
      <b><Icon name="lock" /> {title}</b>
      <p>{children}</p>
      <button type="button" className="btn" onClick={() => upgrade(plan, `${title} is part of the ${t.n} plan.`)}>See {t.n}</button>
    </div>
  );
}

/** A section with nothing to show: the reason, and where to go. */
export function Blank({ title, reason, children }: { title: string; reason: string; children?: ReactNode }) {
  return (
    <section className="sx-blank" role="status">
      <h2>{title}</h2>
      <p>{reason}</p>
      {children}
    </section>
  );
}

/** The footer every sector page carries: one disclaimer and the sources. */
export function SectorFooter({ disclaimer }: { disclaimer?: string | null }) {
  return (
    <footer className="sx-footer">
      <p>{disclaimer || "Describes price and breadth data for NSE industries. Not a recommendation to buy, sell or hold any security."}</p>
      <p>Sources: NSE daily files and industry classification; AMFI market caps. Prices are adjusted for splits, bonuses and rights. <Link className="sx-link" to="/learn/sector-signals">How to use Sector Pulse</Link></p>
    </footer>
  );
}
