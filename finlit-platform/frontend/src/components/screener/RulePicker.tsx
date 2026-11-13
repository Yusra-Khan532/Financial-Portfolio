// "+ Add a rule" (task #64, file 04 §4): a dialog with the search box focused. Left: Popular and the groups with their counts and tier. Right: each filter's
// name, tier, one-line meaning, where most companies sit (10th to 90th percentile) and + Add (or "Added"). Filters above the visitor's plan show their tier
// and an upgrade line instead. Search matches names first, then meanings. Esc or Close shuts it and focus goes back to the button that opened it.
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtMetric, type GroupInfo, type MetricInfo } from "../../lib/proscreen";
import { rankMetrics } from "../../lib/metricSearch";
import { TIER, type Plan } from "../../lib/ui";

export const POPULAR = ["pe", "roe", "roce", "debt_to_equity", "sales_cagr_3y", "profit_cagr_3y", "dividend_yield", "ret_1y", "pct_from_high", "own_promoters", "vs_ema200"];

export function RulePicker({ groups, byKey, has, add, ask, onClose, startGroup = "popular", startQuery = "" }: {
  groups: GroupInfo[]; byKey: Map<string, MetricInfo>; has: (k: string) => boolean; add: (m: MetricInfo) => void; ask: (tier: Plan, why: string) => void; onClose: () => void;
  /** Opened from a group row or the search box of the panel (task #64, S-1): that group, or that search. */ startGroup?: string; startQuery?: string;
}) {
  const [q, setQ] = useState(startQuery), [grp, setGrp] = useState(startGroup);
  const box = useRef<HTMLDivElement>(null), find = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    find.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "Tab" && box.current) {        // keep the keyboard inside the dialog
        const f = [...box.current.querySelectorAll<HTMLElement>("button,input,[tabindex='0']")].filter((x) => !x.hasAttribute("disabled"));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); back?.focus?.(); };
  }, [onClose]);
  const visible = (m: MetricInfo) => !m.hidden;
  const all = useMemo(() => groups.flatMap((g) => g.metrics.filter(visible)), [groups]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t) {
      const named = rankMetrics(all, q);
      const meant = all.filter((m) => !named.includes(m) && m.say.toLowerCase().includes(t));
      return [...named, ...meant];
    }
    if (grp === "popular") return POPULAR.map((k) => byKey.get(k)).filter((m): m is MetricInfo => !!m);
    return groups.find((g) => g.id === grp)?.metrics.filter(visible) ?? [];
  }, [q, grp, all, groups, byKey]);
  return (
    <div className="ssk-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ssk" role="dialog" aria-modal="true" aria-labelledby="ssk-h" ref={box}>
        <div className="ssk-top">
          <h2 id="ssk-h">Add a rule</h2>
          <input ref={find} className="ssk-find" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a filter, e.g. ROE or promoter" aria-label="Find a filter" />
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="ssk-body">
          <nav className="ssk-groups" aria-label="Filter groups">
            {[{ id: "popular", label: "Popular", n: POPULAR.filter((k) => byKey.has(k)).length, tier: "basic" as Plan }, ...groups.map((g) => ({ id: g.id, label: g.label, n: g.metrics.filter(visible).length, tier: g.tier }))].map((g) => (
              <button key={g.id} type="button" aria-pressed={!q.trim() && grp === g.id} onClick={() => { setGrp(g.id); setQ(""); }}>
                <span>{g.label}</span>{g.tier === "gold" && <span className="ssr-tier gold">GOLD</span>}<small>{g.n}</small>
              </button>))}
          </nav>
          <ul className="ssk-list" aria-label={q.trim() ? `Filters matching ${q}` : "Filters"}>
            {list.map((m) => {
              const on = has(m.key) || !!(m.variants && Object.values(m.variants).some(has));
              return (
                <li key={m.key}>
                  <div className="ssk-t"><b>{m.label}</b>{m.tier !== "basic" && <span className={"ssr-tier " + m.tier}>{TIER[m.tier].n.toUpperCase()}</span>}</div>
                  <p>{m.say}{m.stats && m.unit !== "flag" ? <> Most companies: {fmtMetric(m, m.stats.p10)} to {fmtMetric(m, m.stats.p90)}.</> : null}</p>
                  <div className="ssk-a">{on ? <span className="ssk-added">Added</span>
                    : m.locked ? <button type="button" className="btn" onClick={() => ask(m.tier, `${m.label} is part of the ${TIER[m.tier].n} plan.`)}>Part of {TIER[m.tier].n}</button>
                    : <button type="button" className="btn" onClick={() => add(m)} aria-label={`Add ${m.label}`}>+ Add</button>}</div>
                </li>);
            })}
            {/\b(sector|industr|index|nifty|size|large|mid|small)/i.test(q) && <li className="ssk-none" role="note">Sector, index and company size are not rules on numbers: pick them under Your rules, in the Size and the Sector and index sections.</li>}
            {!list.length && <li className="ssk-none">No filter matches “{q}”. Try another word, such as debt, growth or promoter.</li>}
          </ul>
        </div>
        <p className="ssk-foot">{all.length} filters in {groups.length} groups. Pick one to add it as a rule; you can change its range at once.</p>
      </div>
    </div>
  );
}
