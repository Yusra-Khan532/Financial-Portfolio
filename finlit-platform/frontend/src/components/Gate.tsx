import { createContext, useContext, type ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "../lib/icons";
import { planName } from "../lib/planNames";
import { TIER, useUI, type Gate as PlanGate } from "../lib/ui";

/** True on the page of a free example company: the server already sent everything, so nothing on it is locked. */
export const OpenAccess = createContext(false);

/** Task #411 (the team's 27 Nov list, bug 1): the Silver plan is gone; a Silver gate reads as Gold (lib/planNames), so it is drawn as Gold too, with
 *  Gold's colour and crown, never the retired Silver medal and grey. The gate itself is unchanged (who it opens for is lib/ui's has()). */
export const shownTier = (tier: PlanGate): PlanGate => (tier === "silver" ? "gold" : tier);

/** Locks content the current plan doesn't include. In production the API never sends locked
 *  data; this overlay is what users see in its place. */
export function Gate({ tier, title, points, children }: { tier: PlanGate; title: string; points: string[]; children: ReactNode }) {
  const { has, upgrade } = useUI();
  const open = useContext(OpenAccess);
  const locked = !open && !has(tier);
  const look = shownTier(tier), t = TIER[look] ?? { n: planName(tier), ic: "crown", tc: "--t-gold" };   // task #410: a gate a mocked or older table does not name reads its plan name
  return (
    <div className={"gate" + (locked ? " is-locked" : "")}>
      <div inert={locked || undefined}>{children}</div>
      <div className="lock" style={{ "--tc": `var(${t.tc})` } as React.CSSProperties}>
        <div className="lock-card">
          <div className="lk-ic"><Icon name="lock" /></div>
          <span className={"tier " + look}><Icon name={t.ic} />{t.n} plan</span>
          <h4 aria-level={2}>{title}</h4>
          <ul>{points.map((p) => <li key={p}><Icon name="check" /><span>{p}</span></li>)}</ul>
          <button className="btn" onClick={() => upgrade(tier, `${title} is part of ${t.n}.`)}>
            Unlock with {t.n} <Icon name="arrow" />
          </button>
          <span className="sub">Pricing at launch · <Link to="/plans">Compare plans</Link></span>
        </div>
      </div>
    </div>
  );
}

export function TierChip({ tier }: { tier: PlanGate }) {
  return <span className={"tier " + shownTier(tier)}>{TIER[tier]?.n ?? planName(tier)}</span>;
}
