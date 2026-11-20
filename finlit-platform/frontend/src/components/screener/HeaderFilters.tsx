// Task #257 (Basic screener pack of 20 Nov 2026, SPEC §1 and §3): every filter of the all-companies view opens from the header row, in this order:
// Market cap · Macro sector · Sector · Industry · FinLit IQ · 52-week high. Macro sector, Sector and Industry are three linked lists (SHARED §1): all of
// NSE's names with a search box and each option's count, a macro sector narrows Sector and Industry, a sector narrows Industry, and a choice that no
// longer fits is taken off with a short message. FinLit IQ opens a panel: the rating in three groups, then a from-to score range for the FinLit IQ and each
// of its five scores, clamped to 0-100. Filters apply as soon as they change and are kept in the address (useScreener). On a phone the row scrolls
// sideways and each filter opens as a bottom sheet. Styles: styles/hf.css (class prefix hf-).
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CAP_BUCKETS } from "../../lib/capBuckets";
import { CAPS, IQ_GROUPS, PILLARS, iqGroupOn, type LevelOpt, type RangeKey } from "../../lib/scoreScreen";
import { nf } from "../../lib/format";
import { HighFilter, highActive } from "./HighFilter";
import type { Screener } from "./useScreener";
import "../../styles/hf.css";

type Panel = "cap" | "mac" | "sec" | "ind" | "iq" | "high";
/** FinLit IQ and its five scores, in the order the table shows them. */
export const IQ_SCORES: { k: RangeKey; label: string }[] = [{ k: "o", label: "FinLit IQ" }, ...PILLARS.map((x) => ({ k: x.k as RangeKey, label: x.label })), { k: "t", label: "Technical" }];
const SCORE_KEYS = IQ_SCORES.map((x) => x.k);
const RANGE_OF: Record<string, string> = Object.fromEntries(CAP_BUCKETS.map((b) => [b.label.replace(" cap", ""), b.range]));

/** How many score filters are on: the rating groups ticked, and each score with a range or band. */
export const scoreCount = (s: Screener) => IQ_GROUPS.filter((g) => iqGroupOn(s.draft, g)).length
  + SCORE_KEYS.filter((k) => s.draft.ranges[k].min != null || s.draft.ranges[k].max != null || ((s.draft.bands as Record<string, unknown[]>)[k]?.length ?? 0) > 0).length;
const clamp = (v: string) => { if (v.trim() === "") return ""; const n = Number(v); return !Number.isFinite(n) ? v : String(Math.min(100, Math.max(0, n))); };

function LevelList({ title, all, opts, picked, onPick, onClear, note }: { title: string; all: number; opts: LevelOpt[]; picked: string[]; onPick: (n: string) => void; onClear: () => void; note: string | null }) {
  const [q, setQ] = useState(""), id = useId();
  const k = q.trim().toLowerCase(), shown = k ? opts.filter((o) => o.name.toLowerCase().includes(k)) : opts;
  return (<>
    <div className="hf-ph"><b>{title} · all {all}</b><small>{nf(opts.filter((o) => o.on).length, 0)} with companies now</small></div>
    <input className="hf-find" type="search" placeholder={`Find a ${title.toLowerCase()}`} aria-label={`Find a ${title.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} aria-controls={id} />
    {note && <p className="hf-note" role="status">{note}</p>}
    <ul className="hf-opts" id={id} aria-label={title}>
      {shown.map((o) => { const on = picked.includes(o.name), off = !o.on && !on;
        return <li key={o.name}><label className={off ? "hf-off" : ""}><input type="checkbox" checked={on} disabled={off} onChange={() => onPick(o.name)} /><span>{o.name}</span><small>{nf(o.n, 0)}</small></label></li>; })}
      {!shown.length && <li className="hf-none">No {title.toLowerCase()} matches “{q.trim()}”.</li>}
    </ul>
    <div className="hf-pf"><button type="button" className="hf-lnk" onClick={onClear} disabled={!picked.length}>Clear</button><span>{picked.length ? `${picked.length} picked` : "Counts follow the other filters"}</span></div>
  </>);
}

export function ScorePanel({ s }: { s: Screener }) {
  const n = scoreCount(s);
  const setR = (k: RangeKey, end: "min" | "max", v: string) => s.setRange(k, end, clamp(v));
  const clear = () => s.edit((d) => ({ ...d, iqLabels: [], ranges: { ...d.ranges, ...Object.fromEntries(SCORE_KEYS.map((k) => [k, { min: null, max: null }])) },
    bands: { ...d.bands, ...Object.fromEntries(SCORE_KEYS.filter((k) => k in d.bands).map((k) => [k, []])) } }));
  return (<>
    <div className="hf-ph"><b>FinLit IQ</b><small>The score and its five parts, 0 to 100, higher is better.</small></div>
    <h4 className="hf-h">Fundamental rating</h4>
    <div className="hf-bands" role="group" aria-label="FinLit IQ fundamental rating">
      {IQ_GROUPS.map((g) => { const on = iqGroupOn(s.draft, g), c = s.iqCounts[g.id] ?? 0, off = !c && !on;
        return <label key={g.id} className={"hf-band" + (off ? " hf-off" : "")}><input type="checkbox" checked={on} disabled={off} onChange={() => s.setIqGroup(g.id)} /><span>{g.label}</span><small>{nf(c, 0)}</small></label>; })}
    </div>
    <h4 className="hf-h">Score range <span>0 to 100, higher is better</span></h4>
    <div className="hf-rgs">
      {IQ_SCORES.map((x) => { const r = s.draft.ranges[x.k];
        return <div key={x.k} className="hf-rg" role="group" aria-label={`${x.label} range`}><span>{x.label}</span>
          <input type="number" inputMode="numeric" min={0} max={100} placeholder="0" aria-label={`${x.label} from`} value={r.min ?? ""} aria-invalid={!!s.problems[x.k]} onChange={(e) => setR(x.k, "min", e.target.value)} />
          <i aria-hidden="true">–</i>
          <input type="number" inputMode="numeric" min={0} max={100} placeholder="100" aria-label={`${x.label} to`} value={r.max ?? ""} aria-invalid={!!s.problems[x.k]} onChange={(e) => setR(x.k, "max", e.target.value)} />
          {s.problems[x.k] && <em className="hf-err" role="alert">{s.problems[x.k]}</em>}</div>; })}
    </div>
    <div className="hf-pf"><button type="button" className="hf-lnk" onClick={clear} disabled={!n}>Clear score filters</button><span>{n ? `${n} on` : "Counts follow the other filters"}</span></div>
  </>);
}

/** The row of filter buttons; `after` is anything that sits at its end (the open screen's More filters). */
export function HeaderFilters({ s, levelNote }: { s: Screener; levelNote?: (dropped: string[]) => string | null }) {
  const [open, setOpen] = useState<Panel | null>(null), [note, setNote] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null), btns = useRef<Partial<Record<Panel, HTMLButtonElement | null>>>({});
  const close = (focus = true) => { const was = open; setOpen(null); setNote(null); if (focus && was) btns.current[was]?.focus(); };
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) close(false); };
    document.addEventListener("keydown", key); document.addEventListener("mousedown", out);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", out); };
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  const d = s.draft, sc = scoreCount(s);
  const pick = (level: "macros" | "nsecs" | "industries") => (name: string) => {
    const dropped = s.setLevel(level, name);
    setNote(dropped.length ? (levelNote?.(dropped) ?? `${dropped.join(", ")} ${dropped.length === 1 ? "was" : "were"} taken off: not inside your other choice.`) : null);
  };
  const B: { id: Panel; label: string; n: number; title?: string }[] = [
    { id: "cap", label: "Market cap", n: d.caps.length }, { id: "mac", label: "Macro sector", n: d.macros.length }, { id: "sec", label: "Sector", n: d.nsecs.length },
    { id: "ind", label: "Industry", n: d.industries.length }, { id: "iq", label: sc ? `FinLit IQ · ${sc}` : "FinLit IQ", n: 0 }, { id: "high", label: "52-week high", n: highActive(s) }];
  const body: Record<Panel, () => ReactNode> = {
    cap: () => (<>
      <div className="hf-ph"><b>Market cap</b><small>By market value, one scale for the whole site.</small></div>
      <ul className="hf-opts" aria-label="Market cap">{CAPS.map((c) => { const n = s.facets.caps[c] ?? 0, on = d.caps.includes(c), off = !n && !on;
        return <li key={c}><label className={off ? "hf-off" : ""}><input type="checkbox" checked={on} disabled={off} onChange={() => s.setDraft((x) => ({ ...x, caps: s.toggle(x.caps, c) }))} /><span>{c} cap<em>{RANGE_OF[c]}</em></span><small>{nf(n, 0)}</small></label></li>; })}</ul>
      <div className="hf-pf"><button type="button" className="hf-lnk" onClick={() => s.setDraft((x) => ({ ...x, caps: [] }))} disabled={!d.caps.length}>Clear</button><span>Counts follow the other filters</span></div>
    </>),
    mac: () => <LevelList title="Macro sector" all={12} opts={s.levels.macro} picked={d.macros} onPick={pick("macros")} onClear={() => s.clearLevel("macros")} note={note} />,
    sec: () => <LevelList title="Sector" all={22} opts={s.levels.sector} picked={d.nsecs} onPick={pick("nsecs")} onClear={() => s.clearLevel("nsecs")} note={note} />,
    ind: () => <LevelList title="Industry" all={59} opts={s.levels.industry} picked={d.industries} onPick={pick("industries")} onClear={() => s.clearLevel("industries")} note={note} />,
    iq: () => (s.locked ? <div className="hf-lock"><b>Score filters are part of Silver</b><span>Filter by the FinLit IQ and its five scores with Silver.</span>
      <button type="button" className="btn primary" onClick={() => s.upgrade("silver", "Score filters come with the Silver plan.")}>Unlock with Silver</button></div> : <ScorePanel s={s} />),
    high: () => <HighFilter s={s} />,
  };
  return (
    <div className="hf" ref={box} role="group" aria-label="Filters">
      <div className="hf-row">
        {B.map((b) => <div key={b.id} className="hf-w">
          <button ref={(e) => { btns.current[b.id] = e; }} type="button" className={"hf-b" + (b.n || (b.id === "iq" && sc) ? " on" : "")} aria-expanded={open === b.id} aria-controls={"hf-p-" + b.id}
            onClick={() => { setNote(null); setOpen(open === b.id ? null : b.id); }}>{b.label}{b.n > 0 && <span className="hf-n">{b.n}</span>}<span className="hf-c" aria-hidden="true" /></button>
          {open === b.id && <div className={"hf-p hf-p-" + b.id} id={"hf-p-" + b.id} role="dialog" aria-label={b.label}>
            <button type="button" className="hf-x" onClick={() => close()} aria-label="Close">×</button>
            {body[b.id]()}
          </div>}
        </div>)}
      </div>
      {open && <div className="hf-back" aria-hidden="true" onClick={() => close(false)} />}
    </div>);
}
