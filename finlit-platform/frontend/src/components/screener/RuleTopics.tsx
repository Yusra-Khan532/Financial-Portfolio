// Task #364 (Chinmay, 24 Nov 2026): the rule groups of the Stock screener's Score and Filters panel, under topic headings, each group an accordion that
// lists its filters, each with a checkbox (show its column) and a down arrow (its range, inline; task #402), or the plan that has it. Every group of the catalogue is shown, with its own count; a group this map
// does not know yet falls under "Other rules", so none is ever lost. The panel's search narrows every group at once to the filters that match, by name
// first and then by meaning, and opens those groups. Each filter's (i) shows its own one-line meaning from the catalogue (no new definitions).
import { useMemo, useState, type ReactNode } from "react";
import { Info } from "../Info";
import { rankMetrics } from "../../lib/metricSearch";
import { TIER, type Plan } from "../../lib/ui";
import type { GroupInfo, MetricInfo } from "../../lib/proscreen";

/** The topic headings and, in order, the catalogue groups under each (ids from /api/screener/catalog). */
export const TOPICS: { id: string; label: string; groups: string[] }[] = [
  { id: "fin", label: "Valuation & financial performance", groups: ["valuation", "profitability", "growth", "health", "liquidity", "solvency", "efficiency"] },
  { id: "biz", label: "Returns & business performance", groups: ["size", "returns", "quarterly", "trading"] },
  { id: "own", label: "Ownership & corporate activity", groups: ["ownership", "events", "banks"] },
  { id: "risk", label: "Risk & quality", groups: ["flags"] },
];
const KNOWN = new Set(TOPICS.flatMap((t) => t.groups));

/** The groups under their topics; groups the map does not know go under "Other rules", in catalogue order. */
export function topicsOf<G extends { id: string }>(groups: G[]): { id: string; label: string; groups: G[] }[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const out = TOPICS.map((t) => ({ id: t.id, label: t.label, groups: t.groups.map((id) => byId.get(id)).filter((g): g is G => !!g) }));
  const rest = groups.filter((g) => !KNOWN.has(g.id));
  if (rest.length) out.push({ id: "other", label: "Other rules", groups: rest });
  return out.filter((t) => t.groups.length > 0);
}

const better = (m: MetricInfo) => (m.better === "higher" ? "Higher is better." : m.better === "lower" ? "Lower is better." : undefined);

/** Task #402: each filter is a checkbox (ticked = its column is in the table with every company's figure, nothing filtered) and a down arrow that opens
 *  its range inline under the row; setting a range ticks the box. `range(m)` draws that metric's range card; `show`/`hide` add or take off its column. */
export function RuleTopics({ groups, q, has, show, hide, range, ask }: {
  groups: GroupInfo[]; q: string; has: (k: string) => boolean; show: (m: MetricInfo) => void; hide: (m: MetricInfo) => void;
  range: (m: MetricInfo) => ReactNode; ask: (tier: Plan, why: string) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [ranged, setRanged] = useState<Record<string, boolean>>({});
  const t = q.trim().toLowerCase();
  const shown = useMemo(() => groups.map((g) => {
    const all = g.metrics.filter((m) => !m.hidden);
    if (!t) return { g, all, list: all };
    const named = rankMetrics(all, q), meant = all.filter((m) => !named.includes(m) && m.say.toLowerCase().includes(t));
    return { g, all, list: [...named, ...meant] };
  }).filter((x) => x.all.length > 0 && (!t || x.list.length > 0)), [groups, q, t]);
  const isOn = (m: MetricInfo) => has(m.key) || !!(m.variants && Object.values(m.variants).some(has));
  const topics = topicsOf(shown.map((x) => ({ ...x, id: x.g.id })));
  if (t && !topics.length) return <p className="srt-none" role="status">No filter matches “{q}”. Try another word, such as debt, growth or promoter.</p>;
  return (
    <div className="srt">
      {topics.map((tp) => (
        <section key={tp.id} className="srt-topic" aria-labelledby={`srt-h-${tp.id}`}>
          <h3 className="srt-h" id={`srt-h-${tp.id}`}>{tp.label}</h3>
          {tp.groups.map(({ g, all, list }) => {
            const on = all.filter(isOn).length, isOpen = t ? true : !!open[g.id];
            return (
              <div key={g.id} className={"srt-acc" + (isOpen ? " is-open" : "") + (on ? " is-on" : "")}>
                <button type="button" className="srt-ah" id={`srt-a-${g.id}`} aria-expanded={isOpen} aria-controls={`srt-b-${g.id}`}
                  onClick={() => !t && setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))}>
                  <span className="srt-at">{g.label}</span>
                  {on > 0 && <em className="srt-on">{on} on</em>}
                  <small className="srt-n" aria-label={t ? `${list.length} of ${all.length} filters match` : `${all.length} filters`}>{t ? `${list.length} of ${all.length}` : all.length}</small>
                  <svg className="srt-car" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {isOpen && <ul className="srt-b" id={`srt-b-${g.id}`} role="region" aria-labelledby={`srt-a-${g.id}`}>
                  {list.map((m) => {
                    const on = isOn(m), rOpen = !!ranged[m.key], cb = `srt-c-${m.key}`, rid = `srt-r-${m.key}`;
                    return (
                      <li key={m.key} className={(on ? "is-on" : "") + (rOpen ? " is-ranged" : "") || undefined}>
                        {m.locked ? <>
                          <span className="srt-mt">{m.label}<Info g={{ key: "ssm." + m.key, label: m.label, what: m.say, read: better(m) }} /></span>
                          <button type="button" className="srt-act srt-lock" onClick={() => ask(m.tier, `${m.label} is part of the ${TIER[m.tier].n} plan.`)}>{TIER[m.tier].n}</button>
                        </> : <>
                          <span className="srt-mt srt-chk">
                            <input type="checkbox" id={cb} checked={on} onChange={(e) => (e.target.checked ? show(m) : hide(m))} />
                            <label htmlFor={cb}>{m.label}</label>
                            <Info g={{ key: "ssm." + m.key, label: m.label, what: m.say, read: better(m) }} />
                          </span>
                          <button type="button" className="srt-rng" aria-expanded={rOpen} aria-controls={rid} aria-label={`${rOpen ? "Close" : "Set"} a range for ${m.label}`}
                            onClick={() => setRanged((x) => ({ ...x, [m.key]: !x[m.key] }))}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                          </button>
                          {rOpen && <div className="srt-rbox" id={rid}>{range(m)}</div>}
                        </>}
                      </li>);
                  })}
                </ul>}
              </div>);
          })}
        </section>))}
    </div>
  );
}
