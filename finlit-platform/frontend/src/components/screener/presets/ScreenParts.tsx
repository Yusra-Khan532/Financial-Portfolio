// The open screen's parts on the Advanced stock screener. Task #243 (screeners update pack v4, 18 Nov 2026), section P:
//   P3 DateBar       "List as on": a list box of the saved lists (count and status; a trading day with no saved list is shown, greyed); the status pill, the
//                    day's figures ("N companies · +N joined · N left since {previous}"), an i and "Back to the latest list" on a past date
//   P4 Dropdown,     one wrapping row of pill drop-downs (Market cap, Sector, rating, More filters), each option with the rows it would leave given the other
//      FilterChips   filters that are on; the filters that are on as chips with × and Clear all
//   P6 SelectionBar  only with a selection: "N selected", Compare (2 to 4), Add to watchlist, Clear
//   P10 ExpandLayer  the whole list, every column, over the full window; Esc or "Close full table ✕"
//   P8 LeftDrop      Left the list as a drop-down, closed by default, with On / Up to / After {date}; only from saved lists
// Describes the lists; never advises. Styles: styles/screens243.css (psx3-).
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { nf, MINUS } from "../../../lib/format";
import { NO_BAR, type BarFilter, type BoardChip, type HistorySession, type LeftMode, type LeftRow, type PresetDetail, type Rating } from "../../../lib/presets";
import { INFO_BOARD, PsxInfo } from "./PsxInfo";
import { Shine } from "./ScreensStrip";
import { AdvScreenMenus, advChips } from "./AdvScreenFilters";
import { pulseSay, pulseWord } from "../../../lib/pulseWords";
import "../../../styles/screens243.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "16 Nov" from "2026-11-16". */
export const day = (iso: string | null | undefined) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? ""); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : iso ?? ""; };
const signed = (v: number, d = 1) => (v > 0 ? "+" : v < 0 ? MINUS : "") + nf(Math.abs(v), d);

/** The status line of one option of the date menu (pack P3). */
export function statusLine(s: HistorySession): string {
  switch (s.status) {
    case "latest": return `Latest list · built after the ${day(s.date)} close`;
    case "rules": return "Rules updated this day";
    case "first": return "First saved list";
    case "not_saved": return "Not saved: the night's run did not store a list for this close";   // task #325 (file 25, 2.1 row 8): say why it is missing (12 Nov)
    default: return `Saved after the ${day(s.date)} close`;
  }
}

/** Task #325 (developer file 25, 2.1 rows 3 and 4, and section 1 row 10): on a day the screen's rules changed, joined and left would mix the rule change with price moves. */
export const INFO_RULES = "The rules of this screen were updated at this close, so the list changed for that reason as well as for price moves. Joined and left are not shown for this day; they return from the next close.";
export const INFO_PAST = "A past date shows the list as it stood after that close: its companies, their price, market cap and scores that day. Added and Since added read as they did that day. Since then shows what happened after the list, to the latest list. Joined and left compare the list with the previous saved list.";

/** P3: the date bar. `sessions` latest first; `asOn` null for the latest list. */
export function DateBar({ sessions, asOn, setAsOn, list }: { sessions: HistorySession[]; asOn: string | null; setAsOn: (d: string | null) => void; list: PresetDetail["list"] }) {
  const [open, setOpen] = useState(false), [act, setAct] = useState(0);
  const btn = useRef<HTMLButtonElement>(null), box = useRef<HTMLUListElement>(null), lid = useId();
  const latest = sessions.find((s) => s.status === "latest" || s.saved !== false) ?? sessions[0];
  const cur = asOn ?? latest?.date ?? null, past = !!asOn && asOn !== latest?.date;
  const pickable = (s: HistorySession) => s.saved !== false;
  useEffect(() => { if (open) { const i = Math.max(0, sessions.findIndex((s) => s.date === cur)); setAct(i); box.current?.focus({ preventScroll: true }); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", out); return () => document.removeEventListener("mousedown", out);
  }, [open]);
  const choose = (s: HistorySession) => { if (!pickable(s)) return; setAsOn(s.date === latest?.date ? null : s.date); setOpen(false); btn.current?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); btn.current?.focus(); return; }
    if (e.key === "Tab") { setOpen(false); return; }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const s = sessions[act]; if (s) choose(s); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      let i = act;
      for (let k = 0; k < sessions.length; k++) { i = (i + (e.key === "ArrowDown" ? 1 : -1) + sessions.length) % sessions.length; if (pickable(sessions[i])) break; }
      setAct(i);
    }
  };
  if (!sessions.length) return null;
  const label = (s: HistorySession) => (s.status === "latest" ? `Latest · ${day(s.date)}` : day(s.date));
  const curS = sessions.find((s) => s.date === cur);
  const figs = list && list.date === cur ? list : null;
  return (
    <div className={"psx3-date" + (past ? " is-past" : "")} role="group" aria-label="List as on">
      <span className="psx3-dk">List as on</span>
      <span className="psx3-dw">
        <button ref={btn} type="button" className="psx3-db" aria-haspopup="listbox" aria-expanded={open} aria-controls={lid} onClick={() => setOpen((v) => !v)}>
          {curS ? label(curS) : day(cur)} <span aria-hidden="true">▾</span></button>
        {open && <ul ref={box} id={lid} role="listbox" tabIndex={-1} className="psx3-dl" aria-label="Saved lists" aria-activedescendant={`${lid}-${act}`} onKeyDown={onKey}>
          {sessions.map((s, i) => (
            <li key={s.date} id={`${lid}-${i}`} role="option" aria-selected={s.date === cur} aria-disabled={!pickable(s) || undefined}
              className={(i === act ? "is-act" : "") + (pickable(s) ? "" : " is-off")} onMouseMove={() => { if (act !== i) setAct(i); }} onClick={() => choose(s)}>
              <b>{label(s)}</b><span className="psx3-dn">{s.count == null ? MINUS : nf(s.count, 0)}</span><small>{statusLine(s)}</small>
            </li>))}
        </ul>}
      </span>
      <span className={"psx3-pill" + (past ? " is-past" : "")}>{past ? <>Past list · as it stood after the {day(cur)} close</> : sessions.filter((s) => s.saved).length === 1
        ? <><i aria-hidden="true" />New screen · first list, after the {day(cur)} close</>          /* task #243 (pack R5): the screen's only saved list */
        : <><i aria-hidden="true" />Latest list · after the {day(cur)} close</>}</span>
      {figs && <span className="psx3-figs" aria-live="polite"><b>{nf(figs.count, 0)}</b> {figs.count === 1 ? "company" : "companies"}
        {figs.prev && figs.rulesUpdated ? <> · rules updated on {day(cur)} <PsxInfo text={INFO_RULES} label="Rules updated" /></>
          : figs.prev ? <> · <span className="psx3-j">+{nf(figs.joined ?? 0, 0)} joined</span> · {nf(figs.left ?? 0, 0)} left since {day(figs.prev)}</> : <> · first saved list</>}</span>}
      <PsxInfo text={INFO_PAST} label="List as on" />
      {past && <button type="button" className="fgx-link psx3-back" onClick={() => setAsOn(null)}>Back to the latest list</button>}
    </div>);
}

/** A pill drop-down of the toolbar (pack P4): the label says what is on; ticking keeps it open; Esc or a click outside closes it and returns focus. */
export function Dropdown({ label, on, children, wide }: { label: ReactNode; on: boolean; children: ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), pid = useId();
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", out); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <span className="psx3-dd">
      <button ref={btn} type="button" className={"psx3-ddb" + (on ? " is-on" : "")} aria-expanded={open} aria-controls={pid} onClick={() => setOpen((v) => !v)}>{label} <span aria-hidden="true">▾</span></button>
      {open && <div ref={panel} id={pid} className={"psx3-ddp" + (wide ? " is-wide" : "")} role="group">{children}</div>}
    </span>);
}

/** One option of a drop-down: a check box (or a radio) with its count and an optional line under it. */
export function Opt({ type = "checkbox", name, checked, onChange, label, n, desc }: { type?: "checkbox" | "radio"; name?: string; checked: boolean; onChange: () => void; label: string; n?: number | null; desc?: string }) {
  return (
    <label className="psx3-opt"><input type={type} name={name} checked={checked} onChange={onChange} />
      <span><b>{label}</b>{desc && <small>{desc}</small>}</span>{n != null && <em>{nf(n, 0)}</em>}</label>);
}

export type FilterSet = { bar: BarFilter; set: (b: BarFilter) => void };
const RATING_WORD: Record<Exclude<Rating, "">, string> = { healthy: "Strong or Healthy", strong: "Strong only" };

/** P4: Market cap ▾ · Sector ▾ · rating ▾ · More filters ▾, from the screen's facets. */
export function FilterMenus({ d, f, onAddRule }: { d: PresetDetail; f: FilterSet; onAddRule: () => void }) {
  const { bar, set } = f, fc = d.facets;
  if (!fc) return null;
  const sizes = (["Large", "Mid", "Small", "Micro"] as const).filter((z) => (fc.sizes[z] ?? 0) > 0 || bar.sizes.includes(z));
  const flip = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
  const nMore = (bar.fresh ? 1 : 0) + (bar.ahead ? 1 : 0) + (bar.nse ? 1 : 0) + (bar.fno ? 1 : 0) + (bar.liquid ? 1 : 0) + (bar.sag ? 1 : 0) + (bar.plead ? 1 : 0);
  return (<>
    {(sizes.length > 1 || bar.sizes.length > 0) && (
      <Dropdown label={bar.sizes.length ? `Market cap · ${bar.sizes.length === 1 ? bar.sizes[0] : bar.sizes.length}` : "Market cap"} on={bar.sizes.length > 0}>
        {sizes.map((z) => <Opt key={z} checked={bar.sizes.includes(z)} onChange={() => set({ ...bar, sizes: flip(bar.sizes, z) })} label={`${z} cap`} n={fc.sizes[z] ?? 0} />)}
      </Dropdown>)}
    <AdvScreenMenus d={d} bar={bar} set={set} />{/* task #258 (SPEC §2): Macro sector · Sector · Industry · Prism score */}
    <Dropdown label={nMore ? `More filters · ${nMore}` : "More filters"} on={nMore > 0} wide>
      <Opt checked={bar.fresh} onChange={() => set({ ...bar, fresh: !bar.fresh })} label="New on this list" n={fc.new} desc="Joined since the previous saved list." />
      <Opt checked={bar.ahead} onChange={() => set({ ...bar, ahead: !bar.ahead })} label="Ahead of NIFTY 500 since added" n={fc.ahead} desc="Since added is above NIFTY 500 over the same days." />
      {/* task #243 (pack v4): on every screen */}
      <Opt checked={!!bar.fno} onChange={() => set({ ...bar, fno: !bar.fno })} label="F&O stocks only" n={fc.fno} desc="Stocks with futures and options contracts on NSE." />
      <Opt checked={!!bar.liquid} onChange={() => set({ ...bar, liquid: !bar.liquid })} label="Liquid only" n={fc.liquid} desc="An average of ₹10 Cr or more traded a day over the last 20 sessions." />
      {/* task #243 round 3b (pack v4) */}
      <Opt checked={!!bar.sag} onChange={() => set({ ...bar, sag: !bar.sag })} label="Industry ahead and gaining" n={fc.sag} desc="The company's industry is Ahead and gaining on Sector Rotation." />
      <Opt checked={!!bar.plead} onChange={() => set({ ...bar, plead: !bar.plead })} label="Peer leaders only" n={fc.plead} desc="The company is a Leader against the other companies of its industry." />
      {((fc.bse ?? 0) > 0 || bar.nse) && <Opt checked={bar.nse} onChange={() => set({ ...bar, nse: !bar.nse })} label="NSE-listed only" n={fc.nse} desc={`Leaves out the ${nf(fc.bse ?? 0, 0)} listed only on the BSE.`} />}
      <button type="button" className="psx3-addrule" onClick={onAddRule}>+ Add a rule on any figure</button>
    </Dropdown>
  </>);
}

/** P4: the filters that are on, as chips with ×, then Clear all. */
export function FilterChips({ f }: { f: FilterSet }) {
  const { bar, set } = f;
  const chips: { k: string; label: string; off: () => void }[] = [
    ...(bar.q.trim() ? [{ k: "q", label: `“${bar.q.trim()}”`, off: () => set({ ...bar, q: "" }) }] : []),
    ...bar.sizes.map((z) => ({ k: "z" + z, label: `${z} cap`, off: () => set({ ...bar, sizes: bar.sizes.filter((x) => x !== z) }) })),
    ...bar.sectors.map((n) => ({ k: "s" + n, label: n, off: () => set({ ...bar, sectors: bar.sectors.filter((x) => x !== n) }) })),
    ...(bar.rating ? [{ k: "r", label: `Prism ${RATING_WORD[bar.rating]}`, off: () => set({ ...bar, rating: "" as Rating }) }] : []),
    ...(bar.fresh ? [{ k: "n", label: "New on this list", off: () => set({ ...bar, fresh: false }) }] : []),
    ...(bar.ahead ? [{ k: "a", label: "Ahead of NIFTY 500", off: () => set({ ...bar, ahead: false }) }] : []),
    ...(bar.fno ? [{ k: "f", label: "F&O stocks only", off: () => set({ ...bar, fno: false }) }] : []),
    ...(bar.liquid ? [{ k: "l", label: "Liquid only", off: () => set({ ...bar, liquid: false }) }] : []),
    ...(bar.sag ? [{ k: "g", label: "Industry ahead and gaining", off: () => set({ ...bar, sag: false }) }] : []),
    ...(bar.plead ? [{ k: "p", label: "Peer leaders only", off: () => set({ ...bar, plead: false }) }] : []),
    ...(bar.ind ? [{ k: "i", label: `Industry: ${bar.ind.name}`, off: () => set({ ...bar, ind: null }) }] : []),
    ...(bar.nse ? [{ k: "e", label: "NSE-listed only", off: () => set({ ...bar, nse: false }) }] : []),
    ...advChips(bar, set),           // task #258: the levels, Prism words, ranges and trend words
  ];
  if (!chips.length) return null;
  return (
    <div className="psx3-chips" role="group" aria-label="Filters on">
      {chips.map((c) => <span key={c.k} className="psx3-chip">{c.label}<button type="button" onClick={c.off} aria-label={`Remove ${c.label}`}>×</button></span>)}
      <button type="button" className="fgx-link" onClick={() => set(NO_BAR)}>Clear all</button>
    </div>);
}

/** Task #243 round 3b (pack v4, section 3): the industry board of a Sectors screen. One chip per industry on the list, with its count, Sector Rotation corner and
 *  Sector Pulse state; the counts add up to the list. Picking a chip narrows the list (a filter chip shows it); picking it again shows every industry. */
export function IndustryBoard({ board, on, onPick }: { board: BoardChip[]; on: string | null; onPick: (c: BoardChip) => void }) {
  const total = board.reduce((a, c) => a + c.n, 0);
  return (
    <div className="psx3-board" role="group" aria-label={`Industries on this list: ${board.length}, ${total} ${total === 1 ? "company" : "companies"}`}>
      <p className="psx3-bh"><b>Industries on this list</b> <span>{nf(board.length, 0)} · {nf(total, 0)} {total === 1 ? "company" : "companies"}</span><PsxInfo text={INFO_BOARD} label="the industry board" /></p>
      <div className="psx3-bc">
        {board.map((c) => {
          const pressed = !!c.slug && on === c.slug;
          return (
            <button key={c.slug ?? "none"} type="button" className={"psx3-ind" + (pressed ? " is-on" : "") + (c.slug ? "" : " is-none")} aria-pressed={c.slug ? pressed : undefined} disabled={!c.slug}
              onClick={() => onPick(c)}>
              <span className="psx3-in"><b>{c.name}</b><span className="psx3-ic">{nf(c.n, 0)}</span></span>
              {c.slug && <span className="psx3-im"><span className={"psx3-rot is-" + (c.corner ?? "")}>{c.rotation ?? `${MINUS} no rotation reading`}</span><span className={"psx3-pls is-" + (c.pulseCode ?? "")} title={pulseSay(c.pulseCode) ?? undefined}>{pulseWord(c.pulseCode, c.pulse) ?? MINUS}</span></span>}
            </button>);
        })}
      </div>
    </div>);
}

/** P6: shows only with a selection. */
export function SelectionBar({ n, maxCompare, onCompare, onWatch, onClear }: { n: number; maxCompare: number; onCompare: () => void; onWatch: () => void; onClear: () => void }) {
  if (!n) return null;
  return (
    <div className="psx3-sel" role="toolbar" aria-label="Selected companies">
      <b aria-live="polite">{nf(n, 0)} selected</b>
      <button type="button" disabled={n < 2 || n > maxCompare} onClick={onCompare} title={n > maxCompare ? `Your plan compares up to ${maxCompare} companies` : n < 2 ? "Select 2 or more to compare" : undefined}>Compare</button>
      <button type="button" onClick={onWatch}>Add to watchlist</button>
      <button type="button" onClick={onClear}>Clear</button>
    </div>);
}

/** P10: the whole list, every column, over the full window. Esc, the bar's button or the toolbar button close it; the page scroll is held while it is open. */
export function ExpandLayer({ title, crown, line, onClose, children }: { title: string; crown: boolean; line: string; onClose: () => void; children: ReactNode }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key); close.current?.focus();
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", key); };
  }, [onClose]);
  return (
    <div className="psx3-x" role="dialog" aria-modal="true" aria-label={`${title}: full table`}>
      <div className="psx3-xbar"><b>{crown && <Shine size={18} />}{title}</b><span>{line}</span>
        <button ref={close} type="button" className="btn" onClick={onClose}>Close full table ✕</button></div>
      <div className="psx3-xbody">{children}</div>
    </div>);
}

/** P8: Left the list, closed by default; its switch follows the date picked; built only from saved lists. */
export function LeftDrop({ rows, counts, asOn, latest, first, mode, setMode }: { rows: LeftRow[]; counts: Record<LeftMode, number> | undefined; asOn: string | null; latest: string | null;
  first: string | null | undefined; mode: LeftMode; setMode: (m: LeftMode) => void }) {
  const d = asOn ?? latest, past = !!asOn && asOn !== latest, isFirst = !!d && d === first;
  const modes: LeftMode[] = isFirst ? ["after"] : past ? ["on", "upto", "after"] : ["on", "upto"];
  const m = modes.includes(mode) ? mode : modes[0];
  const word: Record<LeftMode, string> = { on: `On ${day(d)}`, upto: `Up to ${day(d)}`, after: `After ${day(d)}` };
  const c = counts ?? { on: 0, upto: 0, after: 0 };
  const summary = <>{!isFirst && <><b>{nf(c.on, 0)}</b> left on {day(d)} · {nf(c.upto, 0)} since {day(first)}</>}{past && <>{!isFirst && " · "}{nf(c.after, 0)} of its companies left after {day(d)}</>}{isFirst && !past && "None yet. This is the screen's first list."}</>;
  return (
    <details className="psx3-left">
      <summary><span className="psx3-lh">Left the list</span><span className="psx3-ls">{summary}</span></summary>
      <div className="psx3-seg" role="group" aria-label="Which companies">
        {modes.map((k) => <button key={k} type="button" aria-pressed={m === k} onClick={() => setMode(k)}>{word[k]} <b>{nf(c[k], 0)}</b></button>)}
      </div>
      {rows.length === 0 ? <p className="psx3-lnone">No company left {m === "on" ? `on ${day(d)}` : m === "upto" ? `up to ${day(d)}` : `after ${day(d)}`}.</p> : (
        <div className="scr-tw"><table className="scr-t psx3-lt">
          <thead><tr><th scope="col">Company</th><th scope="col">Joined</th><th scope="col">Left</th><th scope="col">Lists it was on</th><th scope="col">From joining to leaving</th><th scope="col">Why it left</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.symbol + r.left_on}>
            <td><Link to={`/stocks/${encodeURIComponent(r.symbol)}`}>{r.symbol}</Link></td><td>{day(r.added_on)}</td><td>{day(r.left_on)}</td>
            <td className="num">{r.lists_on ?? r.sessions ?? MINUS}</td>
            <td className="num">{r.change_pct == null ? <span title="No saved price for one of the two days">{MINUS}</span> : <span className={r.change_pct >= 0 ? "up" : "dn"}>{signed(r.change_pct)}%</span>}</td>
            <td>{r.reason || <span className="psx3-muted">Not stated</span>}</td></tr>)}</tbody>
        </table></div>)}
    </details>);
}
