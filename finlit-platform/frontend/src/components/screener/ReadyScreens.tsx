// "Ready-made screens" on the Stock screener (task #64, file 04 §2 and §8; 13 Nov P-4): four groups (Everyday, Silver screens, On the plan's score, My screens),
// cards with the name, the plain rule text, the tier and today's count (each card's count is for that screen on its own, so cards compare). Screens STACK: several can
// be on, each adds its filters to the reader's and to the other screens', and a company must pass all of them. A screen on the plan's score (FinLit IQ or FinLit Prism) is words only and runs on
// the server (FinLit Prism for Gold, the FinLit IQ below).
import { useState } from "react";
import { nf } from "../../lib/format";
import { activeCount, norm, useReady, type PState, type ReadyScreen } from "../../lib/proscreen";
import type { SavedScreen } from "../../lib/screens";
import { TIER, type Plan } from "../../lib/ui";

const ORDER: Plan[] = ["basic", "silver", "gold"];
const GROUPS: { id: "everyday" | "silver" | "model" | "mine"; label: string; tier?: string }[] = [
  { id: "everyday", label: "Everyday", tier: "FREE" }, { id: "silver", label: "Silver screens", tier: "SILVER" }, { id: "model", label: "On the FinLit model", tier: "GOLD" }, { id: "mine", label: "My screens" },
];

export function ReadyScreens({ plan, prism = false, on, total, onToggle, onAllOff, saved, onOpenSaved, onDeleteSaved, ask, onNotify }: {
  plan: Plan; prism?: boolean; on: string[]; total: number | null; onToggle: (s: ReadyScreen) => void; onAllOff: () => void; saved: SavedScreen[];
  onOpenSaved: (s: SavedScreen) => void; onDeleteSaved: (name: string) => void; ask: (tier: Plan, why: string) => void;
  onNotify?: (name: string, on: boolean) => void;   // "Tell me when a company joins" on or off for a saved screen (signed-in members only)
}) {
  const ready = useReady();
  const [grp, setGrp] = useState<(typeof GROUPS)[number]["id"]>("everyday");
  const can = (t: Plan) => ORDER.indexOf(plan) >= ORDER.indexOf(t);
  const all = ready.data?.screens ?? [];
  const groups = GROUPS.map((g) => (g.id === "model" ? { ...g, label: prism ? "On FinLit Prism" : "On the FinLit IQ", tier: prism ? "GOLD" : "SILVER" } : g));
  const list = all.filter((s) => s.group === grp);
  const nOn = on.length;
  return (
    <section className="card ssy" aria-label="Ready-made screens">
      <div className="ssy-top">
        <h2>Ready-made screens</h2>
        <p>Screens stack. Each one you turn on adds its filters to yours and to the other screens that are on, so a company has to pass all of them. Counts are for each screen on its own, today.</p>
      </div>
      {nOn > 0 && <div className="ssy-on" role="status"><b>{nOn} on</b>{total != null && <span> · {nf(total, 0)} {total === 1 ? "company passes" : "companies pass"} all of them</span>}
        <button type="button" className="lnk" onClick={onAllOff}>Turn all off</button></div>}
      <div className="ssy-grp" role="tablist" aria-label="Groups of ready-made screens">
        {groups.map((g) => {
          const n = all.filter((s) => s.group === g.id && on.includes(s.id)).length;
          return (
            <button key={g.id} type="button" role="tab" aria-selected={grp === g.id} onClick={() => setGrp(g.id)}>
              {g.label}{g.tier && <span className={"ssr-tier " + g.tier.toLowerCase()}>{g.tier}</span>}{g.id === "mine" && <span className="ssy-n">{saved.length}</span>}{n > 0 && <span className="ssy-n is-on">{n} on</span>}
            </button>);
        })}
      </div>
      {grp === "mine" ? (
        saved.length ? <ul className="ssy-mine">{saved.map((s) => (
          <li key={s.name}><b>{s.name}</b><span>{activeCount(norm(s.state as Partial<PState>))} rules</span>
            {onNotify && <button type="button" className={"btn ssy-bell" + (s.notify ? " on" : "")} aria-pressed={!!s.notify} onClick={() => onNotify(s.name, !s.notify)}
              aria-label={`Messages for ${s.name}: ${s.notify ? "on" : "off"}`}>{s.notify ? "Messages on" : "Messages off"}</button>}
            <button type="button" className="btn" onClick={() => onOpenSaved(s)}>Open</button>
            <button type="button" className="btn" onClick={() => onDeleteSaved(s.name)} aria-label={`Delete ${s.name}`}>Delete</button></li>))}</ul>
          : <p className="ssy-empty">No saved screens yet. Set your rules, then use Save screen above the results; it will list here.</p>
      ) : ready.isError ? <p className="ssy-empty">The ready-made screens are not available right now. <button type="button" className="lnk" onClick={() => ready.refetch()}>Try again</button></p>
        : !ready.data ? <div className="skeleton" style={{ height: 96 }} aria-busy="true" />
        : (
          <div className="ssy-cards">{list.map((s) => {
            const lock = !can(s.tier), isOn = on.includes(s.id);
            return (
              <button key={s.id} type="button" className={"ssy-c" + (lock ? " is-locked" : "") + (isOn ? " is-on" : "")} aria-pressed={lock ? undefined : isOn}
                aria-label={`${s.label}: ${s.says}${s.count != null ? `, ${s.count} companies today` : ""}${lock ? `, part of ${TIER[s.tier].n}` : isOn ? ", on" : ""}`}
                onClick={() => (lock ? ask(s.tier, `“${s.label}” is part of the ${TIER[s.tier].n} plan.`) : onToggle(s))}>
                <b>{isOn && <i className="ssy-tick" aria-hidden="true">✓</i>}{s.label}</b><span className="ssy-d">{s.says}</span>
                <span className="ssy-f"><span className={"ssr-tier " + (s.tier === "basic" ? "free" : s.tier)}>{s.tier === "basic" ? "FREE" : TIER[s.tier].n.toUpperCase()}</span>
                  <span className="ssy-cnt">{s.count == null ? "–" : `${nf(s.count, 0)} ${s.count === 1 ? "company" : "companies"}`}</span></span>
              </button>);
          })}</div>)}
    </section>
  );
}
