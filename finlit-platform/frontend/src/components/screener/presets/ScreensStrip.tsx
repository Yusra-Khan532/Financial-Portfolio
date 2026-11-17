// "Ready-made screens" on the Basic and Advanced stock screeners (task #64, N-38 of the 14 Nov file, version 4): a highlighted strip above the list.
// A tab for each group with its icon (a crown on Top rated, open first); every screen is a card with its pass count, how many joined at the latest
// close, the first three companies with the figure the card names, and one call. The Top 10 / Highest-rated lists are deep green with gold.
// Every figure comes from the stored lists the preset API serves; a card without a stored list says why. Describes the lists; never advises.
import { useState, type ReactNode } from "react";
import { Icon } from "../../../lib/icons";
import { nf, MINUS } from "../../../lib/format";
import { PLAN_OF, type Preset, type PresetGroup } from "../../../lib/presets";
import { useUI } from "../../../lib/ui";
import type { PresetRoute } from "./usePresetRoute";
import "../../../styles/presets.css";
import "../../../styles/readyScreens.css";

export function Crown({ size }: { size: number }) {
  return <svg className="rms-crown" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8.5l4.6 3.9L12 5l4.4 7.4L21 8.5 19.2 18H4.8z" /><path d="M5 20.5h14" /></svg>;
}

/** Each group's icon and its tint (the crown stays for Top rated only). Keyed by the group's id and its name, so a renamed id keeps its icon. */
const GI: Record<string, { d: string[]; tone: string }> = {
  "prism views": { d: ["M12 3l9 16H3z", "M12 9v5"], tone: "g2" },
  trend: { d: ["M3 17l6-6 4 4 8-8", "M15 7h6v6"], tone: "g1" },
  "new highs": { d: ["M5 20h14", "M12 16V4", "M7 9l5-5 5 5"], tone: "g1" },
  "chart patterns": { d: ["M7 4v16", "M17 4v16", "M5 8h4v7H5z", "M15 6h4v9h-4z"], tone: "g2" },
  growth: { d: ["M4 20V14", "M10 20V10", "M16 20V6", "M22 20H2"], tone: "g1" },
  themes: { d: ["M3 12l9-9h9v9l-9 9z", "M16 8h.01"], tone: "g2" },
  "value and income": { d: ["M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z", "M9 8h6", "M9 12h6", "M11 8c3 0 3 4 0 4l4 4"], tone: "g4" },
  safety: { d: ["M12 3l8 3v6c0 5-3.5 8-8 9c-4.5-1-8-4-8-9V6z", "M9 12l2 2 4-4"], tone: "g2" },
  ownership: { d: ["M9 11a4 4 0 1 0 0-8a4 4 0 1 0 0 8z", "M2 21c0-4 3-6 7-6s7 2 7 6", "M17 4a3 3 0 0 1 0 6", "M22 21c0-3-2-5-4-5.5"], tone: "g2" },
  "top gainers": { d: ["M7 17L17 7", "M9 7h8v8", "M12 21a9 9 0 1 1 0-18a9 9 0 0 1 0 18z"], tone: "g3" },
};
const giOf = (g: PresetGroup) => GI[g.name.trim().toLowerCase()];
export function GroupIcon({ group, size = 15 }: { group: PresetGroup; size?: number }) {
  const gi = giOf(group);
  if (!gi) return null;
  return <svg className="rms-gic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{gi.d.map((d) => <path key={d} d={d} />)}</svg>;
}
const isTopRated = (g: PresetGroup) => g.id === "top-rated" || g.name.trim().toLowerCase() === "top rated";

/** "12 Nov" from "2026-11-12". */
export function closeDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** The figure beside one of the first three: the score as a whole number; for New highs the distance from the 52-week high ("at high" or "−2.4%");
 *  for Top gainers the change since it joined ("+4.8%"). `up` marks the green chip. A missing figure is a dash with its reason. */
export function figureText(figure: string | undefined, v: number | null): { t: string; up: boolean; why?: string } {
  if (v == null) return { t: "—", up: false, why: "Not available for this company on the latest close" };
  if (figure === "From 52-week high") { const off = Math.abs(v); return off < 0.05 ? { t: "at high", up: true } : { t: `${MINUS}${nf(off, 1)}%`, up: false }; }
  if (figure === "Since it joined") return { t: `${v > 0 ? "+" : v < 0 ? MINUS : ""}${nf(Math.abs(v), 1)}%`, up: v > 0 };
  return { t: nf(v, 0), up: false };
}

function Card({ p, group, on, start, planName, onPick }: { p: Preset; group: PresetGroup; on: boolean; start: boolean; planName: string; onPick: () => void }) {
  const crowned = isTopRated(group), top = crowned && (p.top10 ?? /^Top \d+ of /.test(p.listText ?? "")),   // the API also says "Top 10 of N that pass" only for these
    blocked = p.status === "blocked";
  const kind = top ? "is-top" : crowned ? "is-star" : "is-plain", gi = giOf(group);
  const lead: ReactNode = top ? null : crowned ? <span className="rms-star" aria-hidden="true">★</span> : <span className={`rms-ic ${gi?.tone ?? "g2"}`}><GroupIcon group={group} /></span>;
  const n = p.count;
  const count: ReactNode = blocked ? <>Coming soon</> : p.locked ? <><Icon name="lock" /> Part of {planName}</>
    : n == null ? <>The list is not built yet: it is made after the close</> : top ? <><b>Top 10</b> of {nf(n, 0)} that pass</> : <><b>{nf(n, 0)}</b> match</>;
  const call = on ? "Showing below ↓" : blocked || p.locked || n == null ? null : top ? "See the 10 →" : `See all ${nf(n, 0)} →`;
  const first = !p.locked && p.first && p.first.length > 0 ? p.first : null;
  return (
    <button type="button" className={`rms-card ${kind}${on ? " is-on" : ""}${blocked ? " is-blocked" : ""}`} aria-pressed={blocked ? undefined : on} aria-disabled={blocked || undefined}
      title={blocked ? p.blockedReason || "Coming soon" : p.cardText} onClick={onPick}>
      {top && <span className="rms-cbadge"><Crown size={28} /></span>}
      {on ? <span className="rms-onl">✓ Showing below</span> : start ? <span className="rms-start">Start here</span> : top ? <span className="rms-rib">TOP 10</span> : null}
      <span className="rms-t">{lead}{p.name}</span>
      <span className="rms-m">{count}</span>
      {!!p.joined && p.joined > 0 && <span className="rms-new">+{nf(p.joined, 0)} joined since yesterday</span>}
      {first && <span className="rms-pv">
        <span className="rms-pvh"><span>First 3</span><span>{p.figure ?? ""}</span></span>
        {first.map((f) => { const ft = figureText(p.figure, f.value); return <span key={f.symbol} className="rms-pr"><span className="rms-nm">{f.name}</span>{ft.up ? <em>{ft.t}</em> : <i title={ft.why}>{ft.t}</i>}</span>; })}
      </span>}
      {call && <span className="rms-go">{call}</span>}
    </button>);
}

export function ScreensStrip({ route }: { route: PresetRoute }) {
  const { upgrade } = useUI();
  const [picked, setPicked] = useState<string | null>(null);
  const plan = PLAN_OF[route.tab], planName = plan === "gold" ? "Gold" : "Silver";
  const groups = route.groups;          // Prism views (the server's "prism-basics" group) leads the strip after Top rated on Advanced (14 Nov N-35)
  const activeGroup = groups.find((g) => g.presets.some((p) => p.id === route.id))?.id ?? null;
  const shown = groups.find((g) => g.id === (picked ?? activeGroup)) ?? groups.find(isTopRated) ?? groups[0];   // Top rated is open first
  const pick = (p: Preset) => { if (p.status === "blocked") return; if (p.locked) upgrade(plan, `Prebuilt screens on this page are part of ${planName}.`); else route.choose(p.id); };
  const day = closeDay(route.list.data?.asOf);
  const head = (
    <div className="rms-hd">
      <span className="rms-cw"><Crown size={32} /></span>
      <div><h2>Ready-made screens</h2><p>Lists FinLit builds after every close. Pick one to see the companies that made it, and who joined since yesterday.</p></div>
      {day && <span className="rms-upd"><i aria-hidden="true" />Updated after the {day} close</span>}
    </div>);
  if (route.list.isError) return <section className="card rms" aria-label="Ready-made screens">{head}<p className="psx-note" role="status">Ready-made screens are unavailable right now. Please try again in a minute.</p></section>;
  if (!groups.length) return route.list.isLoading ? <section className="card rms" aria-label="Ready-made screens">{head}<p className="psx-note" role="status">Loading ready-made screens…</p></section> : null;
  return (
    <section className="card rms" aria-label="Ready-made screens">
      {head}
      <div className="rms-tabs" role="tablist" aria-label="Screen groups">
        {groups.map((g) => {
          const crowned = isTopRated(g);
          return <button key={g.id} type="button" role="tab" id={`rms-gt-${g.id}`} aria-selected={shown?.id === g.id} aria-controls="rms-panel"
            className={"rms-tab" + (crowned ? " is-crown" : "") + (shown?.id === g.id ? " is-on" : "") + (g.id === activeGroup ? " has-open" : "")} onClick={() => setPicked(g.id)}>
            {crowned ? <Crown size={19} /> : <GroupIcon group={g} />}{g.name} <b>{g.presets.length}</b></button>;
        })}
      </div>
      {shown && <div id="rms-panel" role="tabpanel" aria-labelledby={`rms-gt-${shown.id}`} className="rms-cards">
        {shown.presets.map((p, k) => <Card key={p.id} p={p} group={shown} on={route.id === p.id} start={k === 0 && !route.id && isTopRated(shown)} planName={planName} onPick={() => pick(p)} />)}
      </div>}
    </section>);
}
