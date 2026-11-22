// Task #258 (20 Nov handoff, Advanced screener SPEC §2 and §3): an open Advanced screen's Macro sector, Sector and Industry lists and its Prism score panel.
// Every one of NSE's 12, 22 and 59 is listed, narrowed only by the parent picked: those with companies on this list first, by count, then the rest under
// "Not on this list · N", greyed and not clickable. The server applies the filters to the screen's own list and sends the counts (facets).
import { useState } from "react";
import { MINUS, nf } from "../../../lib/format";
import { NSE_INDUSTRIES, NSE_MACROS, NSE_SECTORS } from "../../../lib/nseTree";
import { DISC_EVENTS, SCORE_RANGE_KEYS, barScoreCount, type BarFilter, type PresetDetail, type ScoreRangeKey } from "../../../lib/presets";
import { LABEL_WORD, PRISM_LABELS, PRISM_PARTS } from "../../../lib/scorePrism";
import { TREND5, TREND5_WORD, pickNse, screenLevel, type Level } from "../../../lib/scoreScreen";
import { Dropdown, Opt } from "./ScreenParts";

type Set = (b: BarFilter) => void;
const LEVELS: { level: Level; key: "macros" | "nsecs" | "indus"; facet: "macros" | "nsecs" | "industries"; title: string; one: string; all: number }[] = [
  { level: "macro", key: "macros", facet: "macros", title: "Macro sector", one: "a macro sector", all: NSE_MACROS.length },
  { level: "nsec", key: "nsecs", facet: "nsecs", title: "Sector", one: "a sector", all: NSE_SECTORS.length },
  { level: "ind", key: "indus", facet: "industries", title: "Industry", one: "an industry", all: NSE_INDUSTRIES.length },
];
const SLUG: Record<string, string> = { STRONG: "strong", HEALTHY: "healthy", AVERAGE: "average", WEAK: "weak", POOR: "poor", "NOT RATED": "notrated" };
const RANGES: { k: ScoreRangeKey; label: string; em?: string }[] = [
  { k: "z", label: "Prism" }, ...PRISM_PARTS.map((x) => ({ k: x.range as ScoreRangeKey, label: x.label, em: x.range === "zr" ? "high = low risk" : undefined })),
];
const flip = (xs: string[] | undefined, x: string) => ((xs ?? []).includes(x) ? (xs ?? []).filter((y) => y !== x) : [...(xs ?? []), x]);
const clamp = (v: string): number | null => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Math.min(100, Math.max(0, Number(v))));

function LevelMenu({ d, bar, set, def, taken, setTaken }: { d: PresetDetail; bar: BarFilter; set: Set; def: (typeof LEVELS)[number]; taken: string | null; setTaken: (m: string | null) => void }) {
  const [find, setFind] = useState("");
  const sel = { macros: bar.macros ?? [], nsecs: bar.nsecs ?? [], industries: bar.indus ?? [] };
  const picked = bar[def.key] ?? [];
  const { on, off, all } = screenLevel(sel, def.level, d.facets?.[def.facet]);
  const k = find.trim().toLowerCase(), hit = (x: string) => !k || x.toLowerCase().includes(k);
  // a picked option stays clickable (to untick it) even when the other filters leave it no company
  const onList = [...on, ...off.filter((x) => picked.includes(x)).map((name) => ({ name, n: 0 }))].filter((o) => hit(o.name));
  const offList = off.filter((x) => !picked.includes(x) && hit(x));
  const tick = (name: string) => {
    const r = pickNse(sel, def.level, name);
    setTaken(r.message);
    set({ ...bar, macros: r.sel.macros, nsecs: r.sel.nsecs, indus: r.sel.industries });
  };
  return (
    <Dropdown label={picked.length ? `${def.title} · ${picked.length === 1 ? picked[0] : picked.length}` : def.title} on={picked.length > 0} wide>
      <h4 className="psx3-lvh">{def.title} · {all === def.all ? `all ${def.all}` : `${all} of ${def.all}`} <span>— {nf(on.length, 0)} on this list</span></h4>
      {taken && <p className="psx3-taken" role="status">{taken}</p>}
      <input className="psx3-find" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder={`Find ${def.one}`} aria-label={`Find ${def.one}`} />
      <div className="psx3-optl" role="group" aria-label={def.title}>
        {onList.map((o) => (
          <label key={o.name} className="psx3-opt"><input type="checkbox" checked={picked.includes(o.name)} onChange={() => tick(o.name)} /><span><b>{o.name}</b></span><em>{nf(o.n, 0)}</em></label>))}
        {offList.length > 0 && <p className="psx3-offh">Not on this list · {nf(offList.length, 0)}</p>}
        {offList.map((x) => (
          <label key={x} className="psx3-opt is-off" title="No company on this list"><input type="checkbox" checked={false} disabled onChange={() => undefined} /><span><b>{x}</b></span><em>0</em></label>))}
        {!onList.length && !offList.length && <p className="psx3-none">No {def.title.toLowerCase()} matches “{find.trim()}”.</p>}
      </div>
    </Dropdown>);
}

/** SPEC §3 on an open screen: rating words with counts (zero greyed), five from-to ranges, the two technical views in five words, Clear score filters. */
function PrismMenu({ d, bar, set }: { d: PresetDetail; bar: BarFilter; set: Set }) {
  const n = barScoreCount(bar), fc = d.facets;
  const setRange = (k: ScoreRangeKey, end: 0 | 1, v: string) => {
    const cur = bar.rg?.[k] ?? [null, null], next: [number | null, number | null] = end === 0 ? [clamp(v), cur[1]] : [cur[0], clamp(v)];
    set({ ...bar, rg: { ...(bar.rg ?? {}), [k]: next } });
  };
  return (
    <Dropdown label={n ? `Prism score · ${n}` : "Prism score"} on={n > 0} wide>
      <div className="afx afx-in">
        <section className="afx-sfs"><h4>Fundamental rating</h4>
          <div className="afx-bands" role="group" aria-label="Prism fundamental rating">
            {PRISM_LABELS.map((l) => { const s = SLUG[l], on = (bar.pl ?? []).includes(s), c = fc?.ratings?.[s] ?? 0;
              return <label key={l} className={"afx-bchk" + (!c && !on ? " fx-zero" : "")}><input type="checkbox" checked={on} disabled={!c && !on} onChange={() => set({ ...bar, pl: flip(bar.pl, s) })} />
                <span className={"afx-bw afx-bw-" + s}>{LABEL_WORD[l]}</span><small>{nf(c, 0)}</small></label>; })}
          </div>
        </section>
        <section className="afx-sfs"><h4>Score range <span>0 to 100, higher is better</span></h4>
          {RANGES.map((x) => { const r = bar.rg?.[x.k] ?? [null, null];
            return <div key={x.k} className="afx-rg" role="group" aria-label={`${x.label} score range`}><span>{x.label}{x.em && <em>{x.em}</em>}</span>
              <input type="number" inputMode="numeric" min={0} max={100} placeholder="0" aria-label={`${x.label} from`} value={r[0] ?? ""} onChange={(e) => setRange(x.k, 0, e.target.value)} />
              <i aria-hidden="true">–</i>
              <input type="number" inputMode="numeric" min={0} max={100} placeholder="100" aria-label={`${x.label} to`} value={r[1] ?? ""} onChange={(e) => setRange(x.k, 1, e.target.value)} /></div>; })}
        </section>
        <section className="afx-sfs"><h4>Technical view <span>{MINUS}100 to +100</span></h4>
          {(["st5", "lt5"] as const).map((k) => (
            <div key={k} className="afx-tvr" role="group" aria-label={`${k === "st5" ? "Short term" : "Long term"} technical view`}><span>{k === "st5" ? "Short term" : "Long term"}</span>
              <div>{TREND5.map((b) => { const on = (bar[k] ?? []).includes(b), c = fc?.trend?.[k === "st5" ? "st" : "lt"]?.[b] ?? 0;
                return <label key={b} className={"afx-tvc" + (!c && !on ? " fx-zero" : "")}><input type="checkbox" checked={on} disabled={!c && !on} onChange={() => set({ ...bar, [k]: flip(bar[k], b) })} />{TREND5_WORD[b]}<small>{nf(c, 0)}</small></label>; })}</div>
            </div>))}
        </section>
        <div className="fx-pf"><button type="button" className="fx-lnk" disabled={!n} onClick={() => set({ ...bar, pl: [], rg: {}, st5: [], lt5: [] })}>Clear score filters</button><span>{n ? `${n} on` : "Counts are for this list"}</span></div>
      </div>
    </Dropdown>);
}

/** Macro sector · Sector · Industry: the three NSE lists of an open screen. */
export function NseLevelMenus({ d, bar, set }: { d: PresetDetail; bar: BarFilter; set: Set }) {
  const [taken, setTaken] = useState<{ level: Level; msg: string } | null>(null);
  return (<>
    {LEVELS.map((def) => <LevelMenu key={def.level} d={d} bar={bar} set={set} def={def} taken={taken?.level === def.level ? taken.msg : null} setTaken={(m) => setTaken(m ? { level: def.level, msg: m } : null)} />)}
  </>);
}

/** Macro sector · Sector · Industry · Prism score, between Market cap and More filters on an open Advanced screen. */
export function AdvScreenMenus({ d, bar, set }: { d: PresetDetail; bar: BarFilter; set: Set }) {
  return (<>
    <NseLevelMenus d={d} bar={bar} set={set} />
    <PrismMenu d={d} bar={bar} set={set} />
    {d.discover && <FilingMenu d={d} bar={bar} set={set} />}
  </>);
}

/** Task #325 (developer file 25, section 4): Emerging tech's "Filings, 90 days" from Discover. Several kinds ticked: a company with any of them. */
export function FilingMenu({ d, bar, set }: { d: PresetDetail; bar: BarFilter; set: Set }) {
  const on = bar.filing ?? [], fc = d.facets?.filings;
  return (
    <Dropdown label={on.length ? `Filings, 90 days · ${on.length}` : "Filings, 90 days"} on={on.length > 0}>
      {DISC_EVENTS.map(([k, label]) => <Opt key={k} checked={on.includes(k)} onChange={() => set({ ...bar, filing: flip(on, k) })} label={label} n={fc?.[k] ?? null} />)}
      <p className="psx3-ddn">Exchange filings of the last 90 days, as Discover reads them. ESOP allotments, ESG ratings and tax notices are not counted.</p>
    </Dropdown>);
}

/** The chips of these filters (under the header row with the screen's other chips). */
export function advChips(bar: BarFilter, set: Set): { k: string; label: string; off: () => void }[] {
  const RW: Record<string, string> = Object.fromEntries(PRISM_LABELS.map((l) => [SLUG[l], LABEL_WORD[l]]));
  return [
    ...(bar.macros ?? []).map((x) => ({ k: "m" + x, label: `Macro sector: ${x}`, off: () => set({ ...bar, macros: (bar.macros ?? []).filter((y) => y !== x) }) })),
    ...(bar.nsecs ?? []).map((x) => ({ k: "c" + x, label: `Sector: ${x}`, off: () => set({ ...bar, nsecs: (bar.nsecs ?? []).filter((y) => y !== x) }) })),
    ...(bar.indus ?? []).map((x) => ({ k: "d" + x, label: `Industry: ${x}`, off: () => set({ ...bar, indus: (bar.indus ?? []).filter((y) => y !== x) }) })),
    ...(bar.pl?.length ? [{ k: "pl", label: `Prism rating: ${bar.pl.map((s) => RW[s] ?? s).join(", ")}`, off: () => set({ ...bar, pl: [] }) }] : []),
    ...SCORE_RANGE_KEYS.filter((k) => bar.rg?.[k] && (bar.rg[k]![0] != null || bar.rg[k]![1] != null)).map((k) => {
      const [lo, hi] = bar.rg![k]!, name = RANGES.find((x) => x.k === k)?.label ?? k;
      return { k: "rg" + k, label: `${name}: ${lo != null && hi != null ? `${lo} to ${hi}` : lo != null ? `${lo} or more` : `${hi} or less`}`, off: () => set({ ...bar, rg: { ...(bar.rg ?? {}), [k]: [null, null] } }) };
    }),
    ...(bar.filing?.length ? [{ k: "filing", label: `Filings, 90 days: ${bar.filing.map((x) => DISC_EVENTS.find(([k]) => k === x)?.[1] ?? x).join(", ")}`, off: () => set({ ...bar, filing: [] }) }] : []),
    ...(["st5", "lt5"] as const).filter((k) => bar[k]?.length).map((k) => ({ k, label: `${k === "st5" ? "Short term" : "Long term"}: ${(bar[k] ?? []).map((b) => TREND5_WORD[b as keyof typeof TREND5_WORD] ?? b).join(", ")}`, off: () => set({ ...bar, [k]: [] }) })),
  ];
}
