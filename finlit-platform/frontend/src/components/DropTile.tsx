// A tile with a dropdown (results calendar pack, 15 Nov 2026, START-HERE "Tiles with a dropdown"; task #193). Shared, so every page that needs one uses this:
// a label in capitals, one key number coloured by what it says (good green, mixed gold, bad red, or plain), a sub-line, an optional "change from last period"
// pill, and a small "▾" button that opens detail (a short table and a note). The detail floats over the page, so the tile keeps its size and a row of tiles
// stays the same height. Escape or a click outside closes it. Describes figures; never advice.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import "../styles/droptile.css";

export type TileTone = "good" | "mixed" | "bad" | "plain";
export type TileAccent = "green" | "blue" | "gold" | "red" | "ink";

export function DropTile({ label, value, unit, sub, tone = "plain", accent = "ink", pill, bar, more, moreLabel, testId }: {
  label: ReactNode; value: ReactNode; unit?: ReactNode; sub?: ReactNode; tone?: TileTone; accent?: TileAccent;
  pill?: { text: string; tone: TileTone } | null; bar?: ReactNode; more?: ReactNode; moreLabel?: string; testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const panelId = "dtl-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className={"dtl dtl-" + accent + (open ? " open" : "")} ref={box} data-testid={testId}>
      <p className="dtl-k">{label}</p>
      <p className="dtl-v"><b className={"dtl-n dtl-" + tone}>{value}</b>{unit && <span className="dtl-u">{unit}</span>}{pill && <span className={"dtl-pill dtl-" + pill.tone}>{pill.text}</span>}</p>
      {bar}
      {sub && <p className="dtl-sub">{sub}</p>}
      {more && <>
        <button type="button" className="dtl-btn" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>{moreLabel ?? "Details"} <span aria-hidden="true">{open ? "▴" : "▾"}</span></button>
        <div className="dtl-panel" id={panelId} role="region" aria-label={typeof label === "string" ? `${label}: details` : "Details"} hidden={!open}>{more}</div>
      </>}
    </div>
  );
}
