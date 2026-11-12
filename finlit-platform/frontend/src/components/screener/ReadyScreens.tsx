// "Ready-made screens" on the Stock screener (task #64, file 04 §2 and §8): four groups (Everyday, Silver screens, On the FinLit model, My screens), four cards
// a row with the name, the plain rule text, the tier and today's count. A metric screen loads its rules into Your rules; a screen on the FinLit model is words
// only and runs on the server. Once the visitor has rules, the card folds to one line.
import { useState } from "react";
import { nf } from "../../lib/format";
import { activeCount, norm, useReady, type PState, type ReadyScreen } from "../../lib/proscreen";
import type { SavedScreen } from "../../lib/screens";
import { TIER, type Plan } from "../../lib/ui";

const ORDER: Plan[] = ["basic", "silver", "gold"];
const GROUPS: { id: "everyday" | "silver" | "model" | "mine"; label: string; tier?: string }[] = [
  { id: "everyday", label: "Everyday", tier: "FREE" }, { id: "silver", label: "Silver screens", tier: "SILVER" }, { id: "model", label: "On the FinLit model", tier: "GOLD" }, { id: "mine", label: "My screens" },
];

export function ReadyScreens({ plan, folded, started, onPick, saved, onOpenSaved, onDeleteSaved, ask }: {
  plan: Plan; folded: boolean; started: string | null; onPick: (s: ReadyScreen) => void; saved: SavedScreen[];
  onOpenSaved: (s: SavedScreen) => void; onDeleteSaved: (name: string) => void; ask: (tier: Plan, why: string) => void;
}) {
  const ready = useReady();
  const [grp, setGrp] = useState<(typeof GROUPS)[number]["id"]>("everyday"), [show, setShow] = useState(false);
  const can = (t: Plan) => ORDER.indexOf(plan) >= ORDER.indexOf(t);
  if (folded && !show) {
    return (
      <section className="card ssy ssy-slim" aria-label="Ready-made screens">
        <h2>Ready-made screens</h2>
        <p>{started ? <>Started from <b>{started}</b>. Change any of its rules under Your rules.</> : "Your own rules are set. A ready-made screen would replace them."}</p>
        <button type="button" className="btn" onClick={() => setShow(true)}>Show ready-made screens</button>
      </section>
    );
  }
  const list = (ready.data?.screens ?? []).filter((s) => s.group === grp);
  return (
    <section className="card ssy" aria-label="Ready-made screens">
      <div className="ssy-top">
        <h2>Ready-made screens</h2>
        <p>Pick one to start; its rules appear under Your rules, where you can change them. Counts are for today.</p>
        {folded && <button type="button" className="btn" onClick={() => setShow(false)}>Hide</button>}
      </div>
      <div className="ssy-grp" role="tablist" aria-label="Groups of ready-made screens">
        {GROUPS.map((g) => (
          <button key={g.id} type="button" role="tab" aria-selected={grp === g.id} onClick={() => setGrp(g.id)}>
            {g.label}{g.tier && <span className={"ssr-tier " + g.tier.toLowerCase()}>{g.tier}</span>}{g.id === "mine" && <span className="ssy-n">{saved.length}</span>}
          </button>))}
      </div>
      {grp === "mine" ? (
        saved.length ? <ul className="ssy-mine">{saved.map((s) => (
          <li key={s.name}><b>{s.name}</b><span>{activeCount(norm(s.state as Partial<PState>))} rules</span>
            <button type="button" className="btn" onClick={() => onOpenSaved(s)}>Open</button>
            <button type="button" className="btn" onClick={() => onDeleteSaved(s.name)} aria-label={`Delete ${s.name}`}>Delete</button></li>))}</ul>
          : <p className="ssy-empty">No saved screens yet. Set your rules, then use Save screen above the results; it will list here.</p>
      ) : ready.isError ? <p className="ssy-empty">The ready-made screens are not available right now. <button type="button" className="lnk" onClick={() => ready.refetch()}>Try again</button></p>
        : !ready.data ? <div className="skeleton" style={{ height: 96 }} aria-busy="true" />
        : (
          <div className="ssy-cards">{list.map((s) => {
            const lock = !can(s.tier);
            return (
              <button key={s.id} type="button" className={"ssy-c" + (lock ? " is-locked" : "")} aria-label={`${s.label}: ${s.says}${s.count != null ? `, ${s.count} companies today` : ""}${lock ? `, part of ${TIER[s.tier].n}` : ""}`}
                onClick={() => (lock ? ask(s.tier, `“${s.label}” is part of the ${TIER[s.tier].n} plan.`) : onPick(s))}>
                <b>{s.label}</b><span className="ssy-d">{s.says}</span>
                <span className="ssy-f"><span className={"ssr-tier " + (s.tier === "basic" ? "free" : s.tier)}>{s.tier === "basic" ? "FREE" : TIER[s.tier].n.toUpperCase()}</span>
                  <span className="ssy-cnt">{s.count == null ? "–" : `${nf(s.count, 0)} ${s.count === 1 ? "company" : "companies"}`}</span></span>
              </button>);
          })}</div>)}
    </section>
  );
}
