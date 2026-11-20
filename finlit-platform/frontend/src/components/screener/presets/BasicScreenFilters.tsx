// Task #257 (20 Nov handoff, Basic screener SPEC §2 and §3): an open Basic screen's header row is Market cap · Macro sector · Sector · Industry · FinLit IQ ·
// More filters. The three NSE lists are the Advanced screen's own (task #258, AdvScreenFilters.NseLevelMenus: all 12 / 22 / 59, narrowed only by the parent
// picked, the rest greyed under "Not on this list · N"). The FinLit IQ panel: the rating in three groups with their counts (zero greyed), then a from-to range
// for the FinLit IQ and each of its five scores, held to 0-100; "Clear score filters" and "N on" or "Counts are for this list". On a phone each opens as a
// bottom sheet. The server applies them to the screen's own list (presets/api.py, ?iqg= and ?omin= ... ?ptmax=).
import { nf } from "../../../lib/format";
import { BASIC_RANGE_KEYS, type BarFilter, type BasicRangeKey, type PresetDetail } from "../../../lib/presets";
import { BASIC_RANGE_WORD, IQ_GROUP_WORD, NseLevelMenus } from "./AdvScreenFilters";
import { Dropdown } from "./ScreenParts";
import "../../../styles/psx257.css";

type Set = (b: BarFilter) => void;
const GROUPS = ["good", "below", "nr"] as const;
const clamp = (v: string): number | null => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Math.min(100, Math.max(0, Number(v))));
const rangeOn = (b: BarFilter, k: BasicRangeKey) => !!b.rg?.[k] && (b.rg[k]![0] != null || b.rg[k]![1] != null);
/** How many FinLit IQ filters are on: each rating group ticked and each score with a range ("FinLit IQ · 2"). */
export const iqCount = (b: BarFilter) => (b.iqg?.length ?? 0) + BASIC_RANGE_KEYS.filter((k) => rangeOn(b, k)).length;

export function IqMenu({ d, bar, set }: { d: PresetDetail; bar: BarFilter; set: Set }) {
  const n = iqCount(bar), g = bar.iqg ?? [], c = d.facets?.iqGroups ?? {};
  const setRange = (k: BasicRangeKey, end: 0 | 1, v: string) => {
    const cur = bar.rg?.[k] ?? [null, null], next: [number | null, number | null] = end === 0 ? [clamp(v), cur[1]] : [cur[0], clamp(v)];
    set({ ...bar, rg: { ...(bar.rg ?? {}), [k]: next } });
  };
  const clear = () => set({ ...bar, iqg: [], rg: Object.fromEntries(Object.entries(bar.rg ?? {}).filter(([k]) => !(BASIC_RANGE_KEYS as string[]).includes(k))) });
  return (
    <Dropdown label={n ? `FinLit IQ · ${n}` : "FinLit IQ"} on={n > 0} wide sheet>
      <div className="afx afx-in">
        <section className="afx-sfs"><h4>Rating</h4>
          <div className="afx-bands" role="group" aria-label="FinLit IQ rating">
            {GROUPS.map((id) => { const on = g.includes(id), k = c[id] ?? 0;
              return <label key={id} className={"afx-bchk" + (!k && !on ? " fx-zero" : "")}><input type="checkbox" checked={on} disabled={!k && !on}
                onChange={() => set({ ...bar, iqg: on ? g.filter((x) => x !== id) : [...g, id] })} /><span>{IQ_GROUP_WORD[id]}</span><small>{nf(k, 0)}</small></label>; })}
          </div>
        </section>
        <section className="afx-sfs"><h4>Score range <span>0 to 100, higher is better</span></h4>
          {BASIC_RANGE_KEYS.map((k) => { const r = bar.rg?.[k] ?? [null, null], w = BASIC_RANGE_WORD[k];
            return <div key={k} className="afx-rg" role="group" aria-label={`${w} score range`}><span>{w}</span>
              <input type="number" inputMode="numeric" min={0} max={100} placeholder="0" aria-label={`${w} from`} value={r[0] ?? ""} onChange={(e) => setRange(k, 0, e.target.value)} />
              <i aria-hidden="true">–</i>
              <input type="number" inputMode="numeric" min={0} max={100} placeholder="100" aria-label={`${w} to`} value={r[1] ?? ""} onChange={(e) => setRange(k, 1, e.target.value)} /></div>; })}
        </section>
        <div className="fx-pf"><button type="button" className="fx-lnk" disabled={!n} onClick={clear}>Clear score filters</button><span>{n ? `${n} on` : "Counts are for this list"}</span></div>
      </div>
    </Dropdown>);
}

/** Macro sector · Sector · Industry · FinLit IQ, between Market cap and More filters on an open Basic screen. */
export function BasicScreenMenus({ d, bar, set }: { d: PresetDetail; bar: BarFilter; set: Set }) {
  return (<><NseLevelMenus d={d} bar={bar} set={set} sheet /><IqMenu d={d} bar={bar} set={set} /></>);
}
