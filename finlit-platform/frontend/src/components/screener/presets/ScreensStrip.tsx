// The screens on the page, above the table (file 01 of the 11 Nov design): a tab for each group, then the group's screens as chips. The Filters drawer is left for filters.
import { useState } from "react";
import { Icon } from "../../../lib/icons";
import { nf } from "../../../lib/format";
import { PLAN_OF, type Preset } from "../../../lib/presets";
import { useUI } from "../../../lib/ui";
import type { PresetRoute } from "./usePresetRoute";
import "../../../styles/presets.css";

export function ScreensStrip({ route }: { route: PresetRoute }) {
  const { upgrade } = useUI();
  const [picked, setPicked] = useState<string | null>(null);
  const plan = PLAN_OF[route.tab], planName = plan === "gold" ? "Gold" : "Silver";
  const groups = route.groups.filter((g) => g.id !== "prism-basics");
  const activeGroup = groups.find((g) => g.presets.some((p) => p.id === route.id))?.id ?? null;
  const shown = groups.find((g) => g.id === (picked ?? activeGroup)) ?? groups[0];
  const pick = (p: Preset) => { if (p.status === "blocked") return; if (p.locked) upgrade(plan, `Prebuilt screens on this page are part of ${planName}.`); else route.choose(p.id); };
  if (route.list.isError) return <section className="card psx-strip" aria-label="Screens"><h3>Screens</h3><p className="psx-note" role="status">Prebuilt screens are unavailable right now.</p></section>;
  if (!groups.length) return route.list.isLoading ? <section className="card psx-strip" aria-label="Screens"><h3>Screens</h3><p className="psx-note" role="status">Loading prebuilt screens…</p></section> : null;
  return (
    <section className="card psx-strip" aria-label="Screens">
      <div className="psx-stt"><h3>Screens</h3><p>Pick a group, then a screen.</p></div>
      <div className="psx-gtabs" role="tablist" aria-label="Screen groups">
        {groups.map((g) => <button key={g.id} type="button" role="tab" id={`psx-gt-${g.id}`} aria-selected={shown?.id === g.id} aria-controls="psx-gpanel" className={"psx-gtab" + (g.id === activeGroup ? " has-open" : "")} onClick={() => setPicked(g.id)}>{g.name} <small>{g.presets.length}</small></button>)}
      </div>
      {shown && <div id="psx-gpanel" role="tabpanel" aria-labelledby={`psx-gt-${shown.id}`} className="psx-gscreens">
        {shown.presets.map((p) => {
          const on = route.id === p.id, blocked = p.status === "blocked";
          return (
            <button key={p.id} type="button" className={"psx-gs" + (on ? " is-on" : "") + (blocked ? " is-blocked" : "")} aria-pressed={blocked ? undefined : on} aria-disabled={blocked || undefined} title={blocked ? p.blockedReason || "Coming soon" : p.cardText} onClick={() => pick(p)}>
              <b>{p.name}</b>
              <small>{blocked ? "Coming soon" : p.locked ? <><Icon name="lock" /><span className="sr">{planName} plan</span></> : p.count != null ? p.listText || `${nf(p.count, 0)} match` : ""}</small>
            </button>);
        })}
      </div>}
    </section>);
}
