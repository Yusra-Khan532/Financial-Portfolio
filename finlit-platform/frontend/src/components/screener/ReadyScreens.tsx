// "Ready-made screens" on the Stock screener (task #64, file 04 §2 and §8; 13 Nov P-4): four groups (Everyday, More screens, On the plan's score, My screens),
// each screen with its name, the plain rule text and today's count. No plan tags (14 Nov, N-10): every screen here is open to every plan that has the page (each
// count is for that screen on its own, so they compare). Screens STACK: several can be on, each adds its filters to the reader's and to the other screens', and a
// company must pass all of them. A screen on FinLit Prism is words only and runs on the server; its group is shown only to a plan with Prism (task #283: FinLit Prism
// is FinLit's only company score).
// Task #243 (screeners pack v4, S): the screens moved from the section above the results into the "Ready-made" tab of the left panel, as one toggle row each
// (a box, the name, today's count and the rule); "ReadyOn" lists the screens that are on at the top of the "Your rules" tab, each with × to turn it off.
import { useState } from "react";
import { nf } from "../../lib/format";
import { activeCount, norm, useReady, type PState, type ReadyScreen } from "../../lib/proscreen";
import type { SavedScreen } from "../../lib/screens";
import { TIER, type Plan } from "../../lib/ui";

const ORDER: Plan[] = ["basic", "silver", "gold"];
const GROUPS: { id: "everyday" | "silver" | "model" | "mine"; label: string }[] = [
  { id: "everyday", label: "Everyday" }, { id: "silver", label: "More screens" }, { id: "model", label: "On the FinLit model" }, { id: "mine", label: "My screens" },
];
export const READY_INTRO = "Screens stack: each one you turn on joins your rules, so a company has to pass all of them. Counts are for each screen on its own, today.";

export function ReadyScreens({ plan, prism = false, on, total, onToggle, onAllOff, saved, onOpenSaved, onDeleteSaved, ask, onNotify }: {
  plan: Plan; prism?: boolean; on: string[]; total: number | null; onToggle: (s: ReadyScreen) => void; onAllOff: () => void; saved: SavedScreen[];
  onOpenSaved: (s: SavedScreen) => void; onDeleteSaved: (name: string) => void; ask: (tier: Plan, why: string) => void;
  onNotify?: (name: string, on: boolean) => void;   // "Tell me when a company joins" on or off for a saved screen (signed-in members only)
}) {
  const ready = useReady();
  const [grp, setGrp] = useState<(typeof GROUPS)[number]["id"]>("everyday");
  const can = (t: Plan) => ORDER.indexOf(plan) >= ORDER.indexOf(t);
  const all = ready.data?.screens ?? [];
  const groups = GROUPS.filter((g) => g.id !== "model" || prism).map((g) => (g.id === "model" ? { ...g, label: "On FinLit Prism" } : g));
  const list = all.filter((s) => s.group === grp);
  const nOn = on.length;
  return (
    <div className="xsp-ready" aria-label="Ready-made screens">
      <p className="xsp-intro">{READY_INTRO}</p>
      {nOn > 0 && <div className="xsp-allon" role="status"><b>{nOn} on</b>{total != null && <span> · {nf(total, 0)} {total === 1 ? "company passes" : "companies pass"} all of them</span>}
        <button type="button" className="lnk" onClick={onAllOff}>Turn all off</button></div>}
      <div className="xsp-gsel" role="tablist" aria-label="Groups of ready-made screens">
        {groups.map((g) => {
          const n = g.id === "mine" ? saved.length : all.filter((s) => s.group === g.id).length, k = all.filter((s) => s.group === g.id && on.includes(s.id)).length;
          return (
            <button key={g.id} type="button" role="tab" aria-selected={grp === g.id} onClick={() => setGrp(g.id)}>
              {g.label} <b>{n}</b>{k > 0 && <span className="xsp-gon">{k} on</span>}
            </button>);
        })}
      </div>
      {grp === "mine" ? (
        saved.length ? <ul className="xsp-mine">{saved.map((s) => (
          <li key={s.name}><b>{s.name}</b><span>{activeCount(norm(s.state as Partial<PState>))} rules</span>
            {onNotify && <button type="button" className={"btn ssy-bell" + (s.notify ? " on" : "")} aria-pressed={!!s.notify} onClick={() => onNotify(s.name, !s.notify)}
              aria-label={`Messages for ${s.name}: ${s.notify ? "on" : "off"}`}>{s.notify ? "Messages on" : "Messages off"}</button>}
            <button type="button" className="btn" onClick={() => onOpenSaved(s)}>Open</button>
            <button type="button" className="btn" onClick={() => onDeleteSaved(s.name)} aria-label={`Delete ${s.name}`}>Delete</button>
            {s.converted?.text && <small className="xsp-conv" role="note">{s.converted.text}</small>}</li>))}</ul>
          : <p className="xsp-empty">No saved screens yet. Set your rules, then use Save screen above the results; it will list here.</p>
      ) : ready.isError ? <p className="xsp-empty">The ready-made screens are not available right now. <button type="button" className="lnk" onClick={() => ready.refetch()}>Try again</button></p>
        : !ready.data ? <div className="skeleton" style={{ height: 96 }} aria-busy="true" />
        : (
          <div className="xsp-list">{list.map((s) => {
            const lock = !can(s.tier), isOn = on.includes(s.id);
            return (
              <button key={s.id} type="button" className={"xsp-r" + (lock ? " is-locked" : "")} aria-pressed={lock ? undefined : isOn}
                aria-label={`${s.label}: ${s.says}${s.count != null ? `, ${s.count} companies today` : ""}${lock ? `, part of ${TIER[s.tier].n}` : isOn ? ", on" : ""}`}
                onClick={() => (lock ? ask(s.tier, `“${s.label}” is part of the ${TIER[s.tier].n} plan.`) : onToggle(s))}>
                <i className="xsp-rb" aria-hidden="true">✓</i><b>{s.label}</b>
                <span className="xsp-rn">{s.count == null ? "–" : nf(s.count, 0)}</span>
                <small>{s.says}</small>
              </button>);
          })}</div>)}
    </div>
  );
}

/** "Ready-made screens on · N" at the top of the Your rules tab: one pill per screen that is on, with × to turn it off. */
export function ReadyOn({ screens, onOff }: { screens: { id: string; label: string }[]; onOff: (id: string) => void }) {
  if (!screens.length) return null;
  return (
    <div className="xsp-onbox" role="group" aria-label={`Ready-made screens on: ${screens.length}`}>
      <h3>Ready-made screens on · {screens.length}</h3>
      <ul>{screens.map((x) => <li key={x.id}><button type="button" onClick={() => onOff(x.id)} aria-label={`Turn off the ${x.label} screen`}>{x.label} <span aria-hidden="true">×</span></button></li>)}</ul>
    </div>
  );
}

export type PanelTab = "rules" | "ready" | "ratio";
const PTABS: { id: PanelTab; label: string }[] = [{ id: "rules", label: "Your rules" }, { id: "ready", label: "Ready-made" }, { id: "ratio", label: "Custom ratio" }];

/** The three tabs of the Stock screener's left panel (pack S2): Your rules (open on load) · Ready-made ("N on" in a gold pill while any are on; the number of
 *  screens is in its tooltip) · ✦ Custom ratio (gold). ←, →, Home and End move between them and select. */
export function PanelTabs({ tab, setTab, nOn, nReady }: { tab: PanelTab; setTab: (t: PanelTab) => void; nOn: number; nReady: number | null }) {
  const onKey = (e: React.KeyboardEvent) => {
    const i = PTABS.findIndex((t) => t.id === tab);
    const to = e.key === "ArrowRight" ? (i + 1) % 3 : e.key === "ArrowLeft" ? (i + 2) % 3 : e.key === "Home" ? 0 : e.key === "End" ? 2 : -1;
    if (to < 0) return;
    e.preventDefault(); setTab(PTABS[to].id);
    (e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[to])?.focus();
  };
  return (
    <div className="ui-tabs xsp-tabs" role="tablist" aria-label="Score and Filters" onKeyDown={onKey}>
      {PTABS.map((t) => (
        <button key={t.id} type="button" role="tab" id={`xsp-t-${t.id}`} aria-controls={`xsp-p-${t.id}`} aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1}
          className={"ui-tab" + (t.id === "ratio" ? " xsp-t-ratio" : "")} onClick={() => setTab(t.id)}
          title={t.id === "ready" && nReady != null ? `${nReady} ready-made screens` : undefined}>
          {t.id === "ratio" && <span className="xsp-spark" aria-hidden="true">✦</span>}{t.label}{t.id === "ready" && nOn > 0 && <b className="xsp-on">{nOn} on</b>}
        </button>))}
    </div>
  );
}
