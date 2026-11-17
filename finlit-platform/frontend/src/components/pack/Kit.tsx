// The shared parts of the 15 Nov page packs (START-HERE, "Shared rules"), built once for every page that uses them: the tile with a dropdown, the callout cards with
// a dropdown and one "Open all / Close all" button, and the grid table (styles/kit.css: tinted header rows, column-group rows marked by a coloured top border, column
// and row lines). First used on Latest results (task #194); the Results calendar (task #193) and the portfolio pages use the same parts. Every class is kit-.
// Describes, never advises: the words come from the page that fills them.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Tip, KIND_ICON, KIND_WORD } from "../sectors/pack/Common";
import "../../styles/kit.css";

// ------------------------------------------------------------------------------------------------ tile with a dropdown
/** good = green, bad = red, mid = gold (mixed), info = blue (a count, not a judgement), plain = no colour (e.g. a figure the plan does not open). */
export type KitTone = "good" | "bad" | "mid" | "info" | "plain";
export type KitDetail = { head: string[]; rows: (string | number)[][]; note?: ReactNode };
export type KitTileData = {
  key: string; label: string; value: string; of?: string; tone: KitTone; sub: string; help?: string;
  /** A thin 0-100 bar under the number (e.g. how many have declared). */
  bar?: number | null;
  /** The "change from last period" pill: ▲ green, ▼ red, ● grey. */
  pill?: { text: string; dir: "up" | "down" | "flat"; title?: string } | null;
  /** What the "▾" button opens: a short table and a note. None: no button. */
  detail?: KitDetail | null; detailLabel?: string;
};

/** Closes a floating panel on Escape (focus goes back to its button) or a click outside both. */
function useDismiss(open: boolean, close: () => void, refs: React.RefObject<HTMLElement | null>[]) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { close(); (refs[0].current as HTMLElement | null)?.focus(); } };
    const away = (e: MouseEvent) => { const t = e.target as Node; if (!refs.some((r) => r.current?.contains(t))) close(); };
    addEventListener("keydown", key); addEventListener("mousedown", away);
    return () => { removeEventListener("keydown", key); removeEventListener("mousedown", away); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}
export { useDismiss };

/** One tile: label in capitals, one coloured key number, an optional pill and bar, a sub-line, and a small "▾" button whose panel floats over the page, so the
 *  tile keeps its height (the pack's evening change: "tiles the same height; dropdowns float"). */
export function KitTile({ t }: { t: KitTileData }) {
  const [open, setOpen] = useState(false), btn = useRef<HTMLButtonElement>(null), pane = useRef<HTMLDivElement>(null), id = "kit-dd-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  useDismiss(open, () => setOpen(false), [btn, pane]);
  return (
    <div className={"kit-tile kit-" + t.tone + (open ? " kit-open" : "")}>
      <p className="kit-lab">{t.label}{t.help && <Tip text={t.help} label={`About “${t.label}”`} />}</p>
      <p className="kit-val">{t.value}{t.of && <small>{t.of}</small>}</p>
      {t.bar != null && <span className="kit-bar" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, t.bar))}%` }} /></span>}
      {t.pill && <span className={"kit-pill " + t.pill.dir} title={t.pill.title}>{t.pill.text}</span>}
      <p className="kit-sub">{t.sub}</p>
      {t.detail && <>
        <button type="button" ref={btn} className="kit-dd" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
          {t.detailLabel ?? "Details"}<Chevron /></button>
        {open && <div ref={pane} id={id} className="kit-ddbody" role="region" aria-label={`${t.label}: ${t.detailLabel ?? "details"}`}>
          <table><thead><tr>{t.detail.head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
            <tbody>{t.detail.rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j ? <td key={j}>{c}</td> : <th key={j} scope="row">{c}</th>))}</tr>)}</tbody></table>
          {t.detail.note && <p>{t.detail.note}</p>}
        </div>}
      </>}
    </div>
  );
}
/** A row of tiles, all the same height; `n` per row on a wide screen, 3 at 1300px, 2 at 900px, 1 on a phone. */
export function KitTiles({ tiles, n, label }: { tiles: KitTileData[]; n?: number; label: string }) {
  return <div className="kit-tiles" role="group" aria-label={label} style={{ ["--kit-n" as string]: n ?? tiles.length }}>{tiles.map((t) => <KitTile key={t.key} t={t} />)}</div>;
}

// ------------------------------------------------------------------------------------------------ callout cards with a dropdown
export type KitCard = { kind: "good" | "watch" | "insight" | "warning"; title: string; text: string; names?: string[]; namesLabel?: string; extra?: ReactNode };

/** Good sign / Insight / Watch out / Warning cards that show the kind and the headline; a round chevron opens the one line of meaning and the names (every one, never
 *  "and 15 more"). With more than one card, one "Open all / Close all" button sits above them. */
export function KitCards({ items, cols, label }: { items: KitCard[]; cols?: number; label: string }) {
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  if (!items.length) return null;
  const all = open.size === items.length;
  const flip = (i: number) => setOpen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  return (
    <div className="kit-cardset" role="group" aria-label={label}>
      {items.length > 1 && <div className="kit-cardbar"><button type="button" className="kit-openall" aria-pressed={all} onClick={() => setOpen(all ? new Set() : new Set(items.map((_, i) => i)))}>{all ? "Close all" : "Open all"}</button></div>}
      <div className="kit-cards" style={{ ["--kit-cols" as string]: cols ?? items.length }}>
        {items.map((c, i) => <KitCardOne key={c.kind + c.title} c={c} open={open.has(i)} onFlip={() => flip(i)} />)}
      </div>
    </div>
  );
}
function KitCardOne({ c, open, onFlip }: { c: KitCard; open: boolean; onFlip: () => void }) {
  const id = "kit-cb-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <div className={"kit-card kit-c-" + c.kind}>
      <span className="kit-card-ic" aria-hidden="true"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{KIND_ICON[c.kind]}</svg></span>
      <div className="kit-card-b">
        <p className="kit-kind">{KIND_WORD[c.kind]}</p>
        <h3 className="kit-ct">{c.title}</h3>
        {open && <div id={id} className="kit-cbody">
          <p className="kit-cx">{c.text}</p>
          {c.names && c.names.length > 0 && <><p className="kit-cl">{c.namesLabel ?? `All ${c.names.length}`}</p><ul className="kit-chips">{c.names.map((n) => <li key={n}>{n}</li>)}</ul></>}
          {c.extra}
        </div>}
      </div>
      <button type="button" className="kit-cchev" aria-expanded={open} aria-controls={id} aria-label={`${open ? "Close" : "Open"}: ${c.title}`} onClick={onFlip}><Chevron /></button>
    </div>
  );
}

export function Chevron() {
  return <svg className="kit-chev" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M3 4.5 6 7.5 9 4.5" /></svg>;
}
