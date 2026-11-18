// The Macro sector and industry filter of the Basic and Advanced stock screeners (task #64, 14 Nov file, N-28 / N-34): NSE's 12 macro sectors first, each
// with its count, and its industries under it. Ticking a macro sector picks all its industries; opening it picks some. A search box filters both at once.
// The same 12 macro sectors and 59 industries the Stock screener uses. Named by the level of their values (task #64, from #192: 12 = macro sector).
import { useEffect, useRef, useState } from "react";
import type { SectorNode } from "../../lib/scoreScreen";
import { SearchBox } from "./FilterGroup";
import "../../styles/sectorTree.css";

function TriBox({ checked, some, onChange, label }: { checked: boolean; some: boolean; onChange: () => void; label: string }) {
  const r = useRef<HTMLInputElement>(null);
  useEffect(() => { if (r.current) r.current.indeterminate = some && !checked; }, [some, checked]);
  return <input ref={r} type="checkbox" checked={checked} onChange={onChange} aria-label={label} aria-checked={some && !checked ? "mixed" : checked} />;
}

export function SectorTree({ tree, picked, set, loading }: { tree: SectorNode[]; picked: string[]; set: (next: string[]) => void; loading?: boolean }) {
  const [q, setQ] = useState(""), [open, setOpen] = useState<Record<string, boolean>>({});
  const t = q.trim().toLowerCase();
  const nInd = tree.reduce((n, s) => n + s.industries.length, 0);
  const shown = tree.map((s) => {
    const secHit = !t || s.sector.toLowerCase().includes(t);
    return { ...s, secHit, inds: secHit ? s.industries : s.industries.filter((i) => i.name.toLowerCase().includes(t)) };
  }).filter((s) => s.secHit || s.inds.length);
  const toggleSector = (s: SectorNode) => {
    const names = s.industries.map((i) => i.name), all = names.every((n) => picked.includes(n));
    set(all ? picked.filter((n) => !names.includes(n)) : [...new Set([...picked, ...names])]);
  };
  const toggleInd = (n: string) => set(picked.includes(n) ? picked.filter((x) => x !== n) : [...picked, n]);
  if (!tree.length) return <p className="fgx-none">{loading ? "Loading macro sectors…" : "No macro sectors loaded yet."}</p>;
  return (
    <div className="sxt">
      <p className="sxt-hint">{tree.length} macro sectors, with their {nInd} industries under them. Tick a macro sector for all its industries, or open it to pick some.</p>
      <SearchBox value={q} onChange={setQ} placeholder="Search macro sector or industry" label="Search macro sectors and industries" />
      <ul className="sxt-list" aria-label="Macro sectors and industries">
        {shown.map((s) => {
          const names = s.industries.map((i) => i.name), all = names.length > 0 && names.every((n) => picked.includes(n)), some = names.some((n) => picked.includes(n));
          const isOpen = !!t || (open[s.sector] ?? some);
          return (
            <li key={s.sector} className={"sxt-sec" + (all || some ? " is-on" : "")}>
              <div className="sxt-srow">
                <label className="sxt-sl"><TriBox checked={all} some={some} onChange={() => toggleSector(s)} label={`${s.sector}: all its industries`} /><b>{s.sector}</b></label>
                <small className="fgx-n">{s.n}</small>
                <button type="button" className="sxt-open" aria-expanded={isOpen} aria-label={`${isOpen ? "Close" : "Open"} ${s.sector}'s industries`} onClick={() => setOpen((o) => ({ ...o, [s.sector]: !isOpen }))}>▾</button>
              </div>
              {isOpen && <ul className="sxt-inds" aria-label={`${s.sector} industries`}>{s.inds.map((i) => (
                <li key={i.name}><label className={"fgx-row" + (picked.includes(i.name) ? " is-on" : "")}><input type="checkbox" checked={picked.includes(i.name)} onChange={() => toggleInd(i.name)} /><span className="fgx-lab">{i.name}</span><small className="fgx-n">{i.n}</small></label></li>))}</ul>}
            </li>);
        })}
        {!shown.length && <li className="fgx-none">No sector or industry matches “{q}”.</li>}
      </ul>
    </div>);
}
