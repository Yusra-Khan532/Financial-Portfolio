// "Ready-made screens" on the Basic and Advanced stock screeners (task #64, 14 Nov file v4, N-38): the first highlighted card on the page.
// A header with a crown, a tab for each group (Top rated first and open, deep green and gold; every other group with its icon), and every screen as a card:
// its count, how many joined at the latest close, its first three companies with one figure, and the call. The whole card is one button; the list opens below.
// Every number comes from the stored lists the preset API serves. The crown marks the Top rated group; it is not a recommendation.
import { useState, type ReactNode } from "react";
import { Icon } from "../../../lib/icons";
import { nf } from "../../../lib/format";
import { PLAN_OF, type Preset, type PresetGroup } from "../../../lib/presets";
import { useUI } from "../../../lib/ui";
import type { PresetRoute } from "./usePresetRoute";
import "../../../styles/presets.css";
import "../../../styles/screensStrip.css";

const svg = (d: ReactNode) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{d}</svg>;
/** The group icons of the 14 Nov file (the crown stays for Top rated only). Drawn here, so the site's shared icon set is left as it is. */
const GROUP_ICON: Record<string, ReactNode> = {
  "prism-views": <Icon name="prism" />,
  trend: svg(<><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>),
  setups: svg(<><path d="M5 4h14" /><path d="M12 20V8" /><path d="M7 13l5-5 5 5" /></>),
  "chart-patterns": svg(<><path d="M8 3v4M8 15v6M16 3v2M16 13v8" /><rect x="5.5" y="7" width="5" height="8" rx="1" /><rect x="13.5" y="5" width="5" height="8" rx="1" /></>),
  growth: svg(<><path d="M4 20h16" /><path d="M7 16v-3M12 16V9M17 16V5" /></>),
  themes: svg(<><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>),
  "value-income": svg(<><circle cx="12" cy="12" r="9" /><path d="M9 8h6M9 11.5h6M12 11.5c2.5 0 2.5 4-1 4.5l3 2.5" /></>),
  safety: svg(<><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></>),
  ownership: <Icon name="users" />,
  "top-gainers": svg(<><circle cx="12" cy="12" r="9" /><path d="M9 15l6-6" /><path d="M10 9h5v5" /></>),
};
const Crown = ({ size }: { size: number }) => <span className="rms-crown" style={{ width: size, height: size }} aria-hidden="true"><Icon name="crown" /></span>;

/** A Top 10 list, or a Highest-rated list: the deep green and gold cards with the large crown badge. */
export const isTop10 = (p: Pick<Preset, "name">) => /^(top 10|highest-rated)\b/i.test(p.name.trim());
const closeLabel = (iso: string | null | undefined) => { if (!iso) return null; const d = new Date(iso + "T00:00:00Z"); return isNaN(+d) ? null : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }); };

/** The figure beside each of the first three names, as the card's heading names it. */
function figureHead(p: Preset, tab: PresetRoute["tab"]): string {
  return p.figure === "from_high" ? "From 52-week high" : p.figure === "since" ? "Since it joined" : tab === "basic" ? "FinLit IQ" : "FinLit Prism";
}
function FigureValue({ p, v }: { p: Preset; v: number | null }) {
  if (v == null) return <span className="rms-fv is-none" title="No figure for this company yet">–</span>;
  if (p.figure === "from_high") return v <= 0.05 ? <span className="rms-fv is-up">at high</span> : <span className="rms-fv">−{nf(v, 1)}%</span>;
  if (p.figure === "since") return <span className={"rms-fv " + (v > 0 ? "is-up" : v < 0 ? "is-down" : "")}>{v > 0 ? "+" : v < 0 ? "−" : ""}{nf(Math.abs(v), 1)}%</span>;
  return <span className="rms-fv is-score">{nf(v, 0)}</span>;
}

function Card({ p, g, tab, on, start, onPick }: { p: Preset; g: PresetGroup; tab: PresetRoute["tab"]; on: boolean; start: boolean; onPick: () => void }) {
  const top = g.id === "top-rated", ten = top && isTop10(p), blocked = p.status === "blocked";
  const count = p.count, first = p.first ?? [];
  const call = blocked ? "Coming soon" : p.locked ? "See what your plan adds" : on ? "Showing below" : ten ? `See the ${count != null ? Math.min(10, count) : 10}` : count != null ? `See all ${nf(count, 0)}` : "Open the screen";
  const kind = ten ? " is-top10" : top ? " is-toprated" : " is-plain";
  return (
    <button type="button" className={"rms-card" + kind + (on ? " is-on" : "") + (blocked ? " is-blocked" : "")} aria-pressed={blocked ? undefined : on} aria-disabled={blocked || undefined}
      title={blocked ? p.blockedReason || "Coming soon" : p.cardText} onClick={() => { if (!blocked) onPick(); }}>
      {ten && <span className="rms-badge"><Crown size={28} /></span>}
      {on ? <span className="rms-tag is-showing">✓ Showing below</span> : start ? <span className="rms-tag is-start">Start here</span> : ten ? <span className="rms-tag">Top 10</span> : null}
      <span className="rms-name">{ten ? null : top ? <span className="rms-star" aria-hidden="true">★</span> : <span className="rms-gi" aria-hidden="true">{GROUP_ICON[g.id] ?? <Icon name="grid" />}</span>}<b>{p.name}</b></span>
      {!p.locked && !blocked && count != null && <span className="rms-count">{p.listText && /^top 10/i.test(p.listText) ? <><b>Top 10</b>{p.listText.replace(/^top 10/i, "")}</> : <><b>{nf(count, 0)}</b> match</>}</span>}
      {!!p.joined && p.joined > 0 && <span className="rms-joined">+{nf(p.joined, 0)} joined since yesterday</span>}
      {first.length > 0 && <span className="rms-first">
        <span className="rms-fh"><span>First {first.length}</span><span>{figureHead(p, tab)}</span></span>
        {first.map((f) => <span key={f.symbol} className="rms-fr"><span className="rms-fn">{f.name}</span><FigureValue p={p} v={f.value} /></span>)}
      </span>}
      <span className="rms-call">{call} {on ? "↓" : blocked ? null : "→"}</span>
    </button>);
}

export function ScreensStrip({ route }: { route: PresetRoute }) {
  const { upgrade } = useUI();
  const [picked, setPicked] = useState<string | null>(null);
  const plan = PLAN_OF[route.tab], planName = plan === "gold" ? "Gold" : "Silver";
  const groups = route.groups.filter((g) => g.id !== "prism-basics");
  const activeGroup = groups.find((g) => g.presets.some((p) => p.id === route.id))?.id ?? null;
  const shown = groups.find((g) => g.id === (picked ?? activeGroup)) ?? groups[0];
  const pick = (p: Preset) => { if (p.status === "blocked") return; if (p.locked) upgrade(plan, `Prebuilt screens on this page are part of ${planName}.`); else route.choose(p.id); };
  const head = (status?: ReactNode) => (
    <header className="rms-head">
      <span className="rms-hcrown"><Crown size={32} /></span>
      <div><h3>Ready-made screens</h3><p>Lists FinLit builds after every close. Pick one to see the companies that made it, and who joined since yesterday.</p></div>
      {status}
    </header>);
  if (route.list.isError) return <section className="card rms" aria-label="Ready-made screens">{head()}<p className="rms-note" role="status">Prebuilt screens are unavailable right now.</p></section>;
  if (!groups.length) return route.list.isLoading ? <section className="card rms" aria-label="Ready-made screens">{head()}<p className="rms-note" role="status">Loading prebuilt screens…</p></section> : null;
  const close = closeLabel(route.list.data?.asOf);
  let startShown = false;
  return (
    <section className="card rms" aria-label="Ready-made screens">
      {head(close ? <span className="rms-upd"><i aria-hidden="true" />Updated after the {close} close</span> : undefined)}
      <div className="rms-tabs" role="tablist" aria-label="Screen groups">
        {groups.map((g) => (
          <button key={g.id} type="button" role="tab" id={`rms-t-${g.id}`} aria-selected={shown?.id === g.id} aria-controls="rms-panel"
            className={"rms-tab" + (g.id === "top-rated" ? " is-top" : "") + (g.id === activeGroup ? " has-open" : "")} onClick={() => setPicked(g.id)}>
            {g.id === "top-rated" ? <Crown size={19} /> : <span className="rms-ti" aria-hidden="true">{GROUP_ICON[g.id] ?? <Icon name="grid" />}</span>}
            {g.name} <small>{g.presets.length}</small>
          </button>))}
      </div>
      {shown && <div id="rms-panel" role="tabpanel" aria-labelledby={`rms-t-${shown.id}`} className="rms-cards">
        {shown.presets.map((p) => {
          const start = !route.id && shown.id === groups[0].id && !startShown && p.status !== "blocked";      // the strip's first card only
          if (start) startShown = true;
          return <Card key={p.id} p={p} g={shown} tab={route.tab} on={route.id === p.id} start={start} onPick={() => pick(p)} />;
        })}
      </div>}
    </section>);
}
