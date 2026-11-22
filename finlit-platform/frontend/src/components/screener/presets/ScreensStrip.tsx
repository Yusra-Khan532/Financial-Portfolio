// "Ready-made screens" on the Basic and Advanced stock screeners.
// Task #243 (screeners update pack v4, 18 Nov 2026), section R, replaces the strip of task #64 (N-38):
//   R1 one header row: "Ready-made screens", one short line (hidden on a phone) and "Updated after the {day} close";
//   R2 every tab in view, wrapping, in two groups: FEATURED (Top rated · Momentum · Growth · Themes, and on Advanced Sectors) in a gold pill, each a light-gold
//      tab with a gold crown that glows and has a light pass over it (still with reduced motion), the selected one filled gold; then MORE (Prism views on
//      Advanced · Setups · Chart patterns · Top gainers · Value and income · Safety · Ownership), the selected one gold-tinted;
//   R3 compact cards (about 58 px): the name and one line of figures (the API's listText where there is one, else "N match · +N joined") with → on the right;
//      cards in a featured group are tinted gold; a Top 10 screen has a crown, a TOP 10 tag and a gold rule; the open screen's card has a gold rule and ●;
//   R4 a tab shows every one of its cards. No "First 3", no "Start here", no star, no gold card fill.
// Every figure comes from the stored lists the preset API serves; a card without a stored list says why. Describes the lists; never advises.
import { useState } from "react";
import { nf, MINUS } from "../../../lib/format";
import { PLAN_OF, type Preset, type PresetGroup } from "../../../lib/presets";
import { useUI } from "../../../lib/ui";
import type { PresetRoute } from "./usePresetRoute";
import { PsxInfo } from "./PsxInfo";
import "../../../styles/presets.css";
import "../../../styles/readyScreens.css";

const CROWN_D = "M3 8.5l4.6 3.9L12 5l4.4 7.4L21 8.5 19.2 18H4.8z";
export function Crown({ size }: { size: number }) {
  return <svg className="rms-crown" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={CROWN_D} /><path d="M5 20.5h14" /></svg>;
}
/** The shining crown (pack R2 and P2): gold, with a soft glow and a light that passes over it every few seconds; still for people who turn motion off. */
export function Shine({ size = 16 }: { size?: number }) {
  return <span className="rms-shine" style={{ width: size, height: size }} aria-hidden="true"><svg viewBox="0 0 24 24"><path d={CROWN_D} /></svg></span>;
}

/** The featured groups (pack R2): the most used, first and crowned. Sectors is Advanced only and arrives with its screens. */
export const FEATURED = ["top-rated", "trend", "growth", "themes", "sectors"];
export const isFeatured = (g: { id: string; featured?: boolean }) => g.featured ?? FEATURED.includes(g.id);

/** Each group's icon (the featured groups carry the crown instead). Keyed by the group's id and its name, so a renamed id keeps its icon. */
const GI: Record<string, string[]> = {
  "prism views": ["M12 3l9 16H3z", "M12 9v5"],
  setups: ["M5 20h14", "M12 16V4", "M7 9l5-5 5 5"],
  "new highs": ["M5 20h14", "M12 16V4", "M7 9l5-5 5 5"],
  "chart patterns": ["M7 4v16", "M17 4v16", "M5 8h4v7H5z", "M15 6h4v9h-4z"],
  "value and income": ["M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z", "M9 8h6", "M9 12h6", "M11 8c3 0 3 4 0 4l4 4"],
  safety: ["M12 3l8 3v6c0 5-3.5 8-8 9c-4.5-1-8-4-8-9V6z", "M9 12l2 2 4-4"],
  ownership: ["M9 11a4 4 0 1 0 0-8a4 4 0 1 0 0 8z", "M2 21c0-4 3-6 7-6s7 2 7 6", "M17 4a3 3 0 0 1 0 6", "M22 21c0-3-2-5-4-5.5"],
  "top gainers": ["M7 17L17 7", "M9 7h8v8", "M12 21a9 9 0 1 1 0-18a9 9 0 0 1 0 18z"],
};
export function GroupIcon({ group, size = 15 }: { group: PresetGroup; size?: number }) {
  const d = GI[group.name.trim().toLowerCase()];
  if (!d) return null;
  return <svg className="rms-gic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{d.map((x) => <path key={x} d={x} />)}</svg>;
}

/** "12 Nov" from "2026-11-12". */
export function closeDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** The figure beside a company on a list: the score as a whole number; for Setups the distance from the 52-week high ("at high" or "−2.4%"); for Top gainers
 *  the change since it joined ("+4.8%"). `up` marks the green chip. A missing figure is a dash with its reason. */
export function figureText(figure: string | undefined, v: number | null): { t: string; up: boolean; why?: string } {
  if (v == null) return { t: "—", up: false, why: "Not available for this company on the latest close" };
  if (figure === "From 52-week high") { const off = Math.abs(v); return off < 0.05 ? { t: "at high", up: true } : { t: `${MINUS}${nf(off, 1)}%`, up: false }; }
  if (figure === "Since it joined") return { t: `${v > 0 ? "+" : v < 0 ? MINUS : ""}${nf(Math.abs(v), 1)}%`, up: v > 0 };
  return { t: nf(v, 0), up: false };
}

/** A Top 10 screen: the API names it so ("Top 10 of 40 that pass"), or flags it. */
export const isTop10 = (p: Preset) => !!p.top10 || /^Top \d+ of /.test(p.listText ?? "");

/** One card: the name and one line of figures (pack R3). */
export function Card({ p, group, on, planName, onPick, past }: { p: Preset; group: PresetGroup; on: boolean; planName: string; onPick: () => void;
  /** On a past date, the open card names that day's list (pack R3, L2). */ past?: { day: string; count: number } | null }) {
  const blocked = p.status === "blocked", top = isTop10(p), feat = isFeatured(group), n = p.count;
  const line = blocked ? <>Coming soon</>
    : p.locked ? <>Part of {planName}</>
    : on && past ? <><b>{nf(past.count, 0)}</b> on {past.day} · past list</>
    : n == null ? <>Built after the close</>
    : n === 0 ? <>None tonight</>      /* task #325 (file 25, 2.1 row 6): an empty list (IPO base) is greyed and says so */
    : p.listText ? <>{p.listText}</>
    : <><b>{nf(n, 0)}</b> {n === 1 ? "company" : "companies"}{p.rulesUpdated ? <> · rules updated</> : p.joined ? <> · <span className="rms-cj">+{nf(p.joined, 0)}</span></> : null}</>;   /* task #325 (file 25, 1 row 9): "62 companies" and "+10"; no joined figure on a rule-update day */
  return (
    <button type="button" className={"rms-card" + (p.count === 0 && !blocked && !p.locked ? " is-empty" : "") + (feat ? " is-feat" : "") + (top ? " is-top10" : "") + (on ? " is-on" : "") + (blocked ? " is-blocked" : "")}
      aria-pressed={blocked ? undefined : on} aria-disabled={blocked || undefined} title={blocked ? p.blockedReason || "Coming soon" : p.cardText} onClick={onPick}>
      <span className="rms-t">{top && <Crown size={14} />}{p.name}{top && <span className="rms-tag">Top 10</span>}{p.isNew && <span className="rms-new">NEW</span>}</span>
      <span className="rms-m">{line}</span>{/* task #325 (file 25, 1 row 9): the green NEW tag says it; " · new screen" no longer repeats on the card */}
      <span className="rms-go" aria-hidden="true">{on ? "●" : "→"}</span>
    </button>);
}

export function ScreensStrip({ route, past }: { route: PresetRoute; past?: { day: string; count: number } | null }) {
  const { upgrade } = useUI();
  const [picked, setPicked] = useState<string | null>(null);
  const plan = PLAN_OF[route.tab], planName = plan === "gold" ? "Gold" : "Silver";
  const groups = route.groups;
  const activeGroup = groups.find((g) => g.presets.some((p) => p.id === route.id))?.id ?? null;
  const shown = groups.find((g) => g.id === (picked ?? activeGroup)) ?? groups.find(isFeatured) ?? groups[0];   // Top rated is open first
  const pick = (p: Preset) => { if (p.status === "blocked") return; if (p.locked) upgrade(plan, `Prebuilt screens on this page are part of ${planName}.`); else route.choose(p.id); };
  const day = closeDay(route.list.data?.asOf);
  const head = (
    <div className="rms-hd">
      <div><h2>Ready-made screens</h2><p>Lists FinLit builds after every close. Pick one to see the companies on it and who joined.</p></div>
      {day && <span className="rms-upd"><i aria-hidden="true" />Updated after the {day} close</span>}
    </div>);
  if (route.list.isError) return <section className="card rms" aria-label="Ready-made screens">{head}<p className="psx-note" role="status">Ready-made screens are unavailable right now. Please try again in a minute.</p></section>;
  if (!groups.length) return route.list.isLoading ? <section className="card rms" aria-label="Ready-made screens">{head}<p className="psx-note" role="status">Loading ready-made screens…</p></section> : null;
  const tab = (g: PresetGroup) => {
    const feat = isFeatured(g), sel = shown?.id === g.id;
    return <button key={g.id} type="button" role="tab" id={`rms-gt-${g.id}`} aria-selected={sel} aria-controls="rms-panel"
      className={"rms-tab" + (feat ? " is-feat" : "") + (sel ? " is-on" : "") + (g.id === activeGroup ? " has-open" : "")} onClick={() => setPicked(g.id)}>
      {feat ? <Shine /> : <GroupIcon group={g} />}{g.name} <b>{g.presets.length}</b>{(g.isNew ?? g.id === "sectors") && <span className="rms-newtab">New</span>}</button>;
  };
  const feat = groups.filter(isFeatured), more = groups.filter((g) => !isFeatured(g));
  return (
    <section className="card rms" aria-label="Ready-made screens">
      {head}
      <div className="rms-tabs" role="tablist" aria-label="Screen groups">
        {feat.length > 0 && <div className="rms-tgrp rms-tfeat" role="presentation"><span className="rms-tlab" aria-hidden="true">Featured</span>{feat.map(tab)}</div>}
        {more.length > 0 && <div className="rms-tgrp" role="presentation"><span className="rms-tlab" aria-hidden="true">More</span>{more.map(tab)}</div>}
      </div>
      {shown?.intro && <p className="rms-intro">{shown.intro}{shown.about && <PsxInfo label={shown.name} text={
        <span className="psx3-about"><b>What it shows</b><span>{shown.about.shows}</span><b>How to use it</b>
          <span role="list">{shown.about.use.map((u) => <span role="listitem" key={u}>{u}</span>)}</span></span>} />}</p>}
      {shown && <div id="rms-panel" role="tabpanel" aria-labelledby={`rms-gt-${shown.id}`} className="rms-cards">
        {shown.presets.map((p) => <Card key={p.id} p={p} group={shown} on={route.id === p.id} planName={planName} past={route.id === p.id ? past : null} onPick={() => pick(p)} />)}
      </div>}
    </section>);
}
