// Task #258 (20 Nov handoff, Advanced screener SPEC §1 and §3): the all-companies view's filters in one header row, in place of the left panel:
// Market cap · Macro sector · Sector · Industry · Prism score · Technical view · 52-week high. Each opens a panel (a bottom sheet on a phone); every pick
// applies at once and is kept in the address. The active filters sit under the row as chips with ×, plus Clear all.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { MINUS, nf } from "../../lib/format";
import { Icon } from "../../lib/icons";
import {
  CAPS, CAP_RANGE, TECH_BANDS, TECH_BAND_ORDER, TECH_KEYS, TREND5, TREND5_WORD, levelOptions, pickLevel, prismOnCount, scoreCounts, withoutScoreFilters,
  type Cap, type Level, type TechKey,
} from "../../lib/scoreScreen";
import { NSE_INDUSTRIES, NSE_MACROS, NSE_SECTORS } from "../../lib/nseTree";
import { LABEL_WORD, PRISM_LABELS, PRISM_PARTS, type PrismRangeKey } from "../../lib/scorePrism";
import { HighFilter, highActive } from "./HighFilter";
import type { Screener } from "./useScreener";
import "../../styles/advfx.css";

type Open = string | null;
const LEVELS: { level: Level; key: "macros" | "nsecs" | "industries"; title: string; one: string; all: number; say: string }[] = [
  { level: "macro", key: "macros", title: "Macro sector", one: "macro sector", all: NSE_MACROS.length, say: "NSE's 12 broad groups." },
  { level: "nsec", key: "nsecs", title: "Sector", one: "sector", all: NSE_SECTORS.length, say: "NSE's 22 sectors." },
  { level: "ind", key: "industries", title: "Industry", one: "industry", all: NSE_INDUSTRIES.length, say: "NSE's 59 industries." },
];
const RANGES: { k: PrismRangeKey; label: string; em?: string }[] = [
  { k: "z", label: "Prism" }, ...PRISM_PARTS.map((x) => ({ k: x.range, label: x.label, em: x.range === "zr" ? "high = low risk" : undefined })),
];
/** Empty means no limit; anything typed is held to 0-100 (SPEC §3). */
const clamp = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? "" : String(Math.min(100, Math.max(0, Number(v)))));
const ratingCls = (l: string) => "afx-bw afx-bw-" + l.toLowerCase().replace(" ", "");

/** One button of the row and its panel. Only one panel is open at a time; Esc or a click outside closes it and returns focus to its button. */
function Drop({ id, open, setOpen, label, value, n, title, desc, note, wide, right, children, foot }: {
  id: string; open: Open; setOpen: (o: Open) => void; label: string; value?: string; n?: number; title: string; desc?: ReactNode; note?: ReactNode; wide?: boolean; right?: boolean;
  children: ReactNode; foot?: ReactNode;
}) {
  const on = open === id, btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null), pid = useId();
  useEffect(() => {
    if (!on) return;
    const out = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(null); btn.current?.focus(); } };
    document.addEventListener("mousedown", out); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", key); };
  }, [on, setOpen]);
  return (
    <div className="fx-f">
      <button ref={btn} type="button" className={"fx-btn" + (n ? " on" : "")} aria-expanded={on} aria-controls={pid} aria-haspopup="dialog" onClick={() => setOpen(on ? null : id)}
        aria-label={n ? `${label}, ${n} on` : label}>
        <span className="fx-l">{label}<span className="fx-v">{value ?? ""}</span></span>{n ? <span className="fx-n">{n}</span> : null}<span className="fx-car" aria-hidden="true">▾</span>
      </button>
      {on && <>
        <div className="fx-scrim" aria-hidden="true" onClick={() => setOpen(null)} />
        <div ref={pop} id={pid} className={"fx-pop" + (wide ? " wide" : "") + (right ? " r" : "")} role="dialog" aria-label={title}>
          <div className="fx-ph"><b>{title}</b>{desc && <p>{desc}</p>}{note}</div>
          {children}
          <div className="fx-pf">{foot ?? <span />}<button type="button" className="fx-done" onClick={() => { setOpen(null); btn.current?.focus(); }}>Done</button></div>
        </div>
      </>}
    </div>);
}

function Find({ value, set, label }: { value: string; set: (v: string) => void; label: string }) {
  return <label className="fx-q"><Icon name="search" /><input type="search" value={value} onChange={(e) => set(e.target.value)} placeholder={label} aria-label={label} /></label>;
}

/** One of the three linked lists (SHARED §1): every name of the level, narrowed only by the parents picked, each with its count given the other filters. */
function LevelDrop({ s, open, setOpen, def, taken, setTaken }: { s: Screener; open: Open; setOpen: (o: Open) => void; def: (typeof LEVELS)[number]; taken: string | null; setTaken: (m: string | null) => void }) {
  const { draft, setDraft } = s;
  const [q, setQ] = useState("");
  const opts = useMemo(() => levelOptions(s.found, draft, def.level), [s.found, draft, def.level]);
  const k = q.trim().toLowerCase(), shown = k ? opts.filter((o) => o.name.toLowerCase().includes(k)) : opts;
  const picked = draft[def.key];
  const narrowed = opts.length < def.all;
  return (
    <Drop id={def.level} open={open} setOpen={setOpen} label={def.title} value={picked.length === 1 ? picked[0] : undefined} n={picked.length} wide
      title={`${def.title} · ${narrowed ? `${opts.length} of ${def.all}` : `all ${def.all}`}`}
      desc={<>{def.say} {narrowed ? "Narrowed by your other choice." : ""} Counts follow your other filters; tick more than one to see any of them.</>}
      note={<>{taken && <p className="fx-narrow" role="status">{taken} <button type="button" onClick={() => setTaken(null)}>OK</button></p>}<Find value={q} set={setQ} label={`Find ${/^[aeiou]/.test(def.one) ? "an" : "a"} ${def.one}`} /></>}
      foot={<button type="button" className="fx-lnk" disabled={!picked.length} onClick={() => setDraft((d) => ({ ...d, [def.key]: [] }))}>Clear</button>}>
      <div className="fx-list" role="group" aria-label={def.title}>
        {shown.map((o) => (
          <label key={o.name} className={"fx-o" + (!o.n && !picked.includes(o.name) ? " fx-zero" : "")}>
            <input type="checkbox" checked={picked.includes(o.name)} onChange={() => { const r = pickLevel(draft, def.level, o.name); setTaken(r.message); setDraft(() => r.filters); }} />
            <span>{o.name}</span><small>{nf(o.n, 0)}</small>
          </label>))}
        {!shown.length && <p className="fx-none">No {def.one} matches “{q.trim()}”.</p>}
      </div>
    </Drop>);
}

/** SPEC §3: the Prism score panel. Rating, score ranges, technical view in five words, and a footer with Clear score filters. */
function PrismDrop({ s, open, setOpen }: { s: Screener; open: Open; setOpen: (o: Open) => void }) {
  const { draft, setDraft } = s, c = useMemo(() => scoreCounts(s.found, draft), [s.found, draft]);
  const n = prismOnCount(draft);
  return (
    <Drop id="prism" open={open} setOpen={setOpen} label="Prism score" n={n} wide title="Prism score" desc="Describes financial health and price trend from filings and prices; not a recommendation."
      foot={<><button type="button" className="fx-lnk" disabled={!n} onClick={() => setDraft((d) => withoutScoreFilters(d))}>Clear score filters</button><span>{n ? `${n} on` : "Counts are for this list"}</span></>}>
      <div className="fx-list afx-sf">
        <section className="afx-sfs" aria-labelledby="afx-rt"><h4 id="afx-rt">Rating</h4>
          <div className="afx-bands" role="group" aria-label="Prism rating">
            {PRISM_LABELS.map((l) => { const on = draft.labels.includes(l), cnt = c.labels[l];
              return <label key={l} className={"afx-bchk" + (!cnt && !on ? " fx-zero" : "")}><input type="checkbox" checked={on} disabled={!cnt && !on} onChange={() => s.setLabel(l)} /><span className={ratingCls(l)}>{LABEL_WORD[l]}</span><small>{nf(cnt, 0)}</small></label>; })}
          </div>
        </section>
        <section className="afx-sfs" aria-labelledby="afx-sr"><h4 id="afx-sr">Score range <span>0 to 100, higher is better</span></h4>
          {RANGES.map((x) => { const r = draft.ranges[x.k];
            return <div key={x.k} className="afx-rg" role="group" aria-label={`${x.label} score range`}><span>{x.label}{x.em && <em>{x.em}</em>}</span>
              <input type="number" inputMode="decimal" min={0} max={100} placeholder="0" aria-label={`${x.label} from`} value={r.min ?? ""} onChange={(e) => s.setRange(x.k, "min", clamp(e.target.value))} />
              <i aria-hidden="true">–</i>
              <input type="number" inputMode="decimal" min={0} max={100} placeholder="100" aria-label={`${x.label} to`} value={r.max ?? ""} onChange={(e) => s.setRange(x.k, "max", clamp(e.target.value))} /></div>; })}
          <p className="fx-hint">An empty box means no limit.{s.problems.z || s.problems.zf || s.problems.zv || s.problems.zq || s.problems.zr ? " The lowest value is above the highest in one row." : ""}</p>
        </section>
        <section className="afx-sfs" aria-labelledby="afx-tv"><h4 id="afx-tv">Technical view <span>{MINUS}100 to +100</span></h4>
          {TECH_KEYS.map((k: TechKey) => (
            <div key={k} className="afx-tvr" role="group" aria-label={`${k === "st" ? "Short term" : "Long term"} technical view`}><span>{k === "st" ? "Short term" : "Long term"}</span>
              <div>{TREND5.map((b) => { const on = draft.trend[k].includes(b), cnt = c.trend[k][b];
                return <label key={b} className={"afx-tvc" + (!cnt && !on ? " fx-zero" : "")}><input type="checkbox" checked={on} disabled={!cnt && !on} onChange={() => s.setTrend(k, b)} />{TREND5_WORD[b]}<small>{nf(cnt, 0)}</small></label>; })}</div>
            </div>))}
        </section>
      </div>
    </Drop>);
}

export function AdvFilterBar({ s }: { s: Screener }) {
  const [open, setOpen] = useState<Open>(null), [taken, setTaken] = useState<string | null>(null);
  const { draft, setDraft, facets } = s;
  // the sizes the data holds (task #262 sets them), each with its ₹ range and its count
  const sizes = useMemo(() => CAPS.filter((c) => s.items.some((r) => r.cap === c)), [s.items]);
  const techN = draft.tech.st.length + draft.tech.lt.length;
  useEffect(() => { if (!taken) return; const t = setTimeout(() => setTaken(null), 8000); return () => clearTimeout(t); }, [taken]);
  return (
    <div className="afx">
      <div className="fx-bar" role="toolbar" aria-label="Filters">
        <Drop id="cap" open={open} setOpen={setOpen} label="Market cap" value={draft.caps.length === 1 ? `${draft.caps[0]} cap` : undefined} n={draft.caps.length} title="Market cap" desc="By market value. Tick more than one to see any of them."
          foot={<button type="button" className="fx-lnk" disabled={!draft.caps.length} onClick={() => setDraft((d) => ({ ...d, caps: [] }))}>Clear</button>}>
          <div className="fx-list" role="group" aria-label="Market cap size">
            {sizes.map((c: Cap) => <label key={c} className={"fx-o" + (!facets.caps[c] && !draft.caps.includes(c) ? " fx-zero" : "")}><input type="checkbox" checked={draft.caps.includes(c)} onChange={() => setDraft((d) => ({ ...d, caps: s.toggle(d.caps, c) }))} />
              <span>{c} cap<span className="fx-sub">{CAP_RANGE[c]}</span></span><small>{nf(facets.caps[c] ?? 0, 0)}</small></label>)}
            {!sizes.length && <p className="fx-none">Sizes appear once the companies' market values have loaded.</p>}
          </div>
        </Drop>
        {LEVELS.map((d) => <LevelDrop key={d.level} s={s} open={open} setOpen={setOpen} def={d} taken={open === d.level ? taken : null} setTaken={setTaken} />)}
        <PrismDrop s={s} open={open} setOpen={setOpen} />
        <Drop id="tech" open={open} setOpen={setOpen} label="Technical view" n={techN} title="Technical view" right desc="Prism's short-term and long-term price-trend readings, in the bands of the Prism card."
          foot={<button type="button" className="fx-lnk" disabled={!techN} onClick={() => setDraft((d) => ({ ...d, tech: { st: [], lt: [] } }))}>Clear</button>}>
          <div className="fx-list">{TECH_KEYS.map((k) => (
            <div key={k} className="fx-sect" role="group" aria-label={`${k === "st" ? "Short-term" : "Long-term"} technical view`}><h4>{k === "st" ? "Short-term" : "Long-term"} technical view</h4>
              <div className="fx-chipset">{TECH_BAND_ORDER.map((b) => { const on = draft.tech[k].includes(b); return <button key={b} type="button" className="fx-tg" aria-pressed={on} onClick={() => s.setTech(k, b)}>{TECH_BANDS[b].label}</button>; })}</div>
            </div>))}</div>
        </Drop>
        <Drop id="high" open={open} setOpen={setOpen} label="52-week high" n={highActive(s)} title="Down from 52-week high" right
          foot={<button type="button" className="fx-lnk" disabled={!highActive(s)} onClick={() => { s.setRange("dh", "min", ""); s.setRange("dh", "max", ""); }}>Clear</button>}>
          <div className="fx-list fx-sect"><HighFilter s={s} /></div>
        </Drop>
      </div>
      {taken && open == null && <p className="afx-taken" role="status">{taken}</p>}
    </div>);
}
