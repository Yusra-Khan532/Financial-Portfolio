// "Clear portfolio" (task #183, COMMON-RULES section 10): one component for the three portfolio pages. A button in the header opens a dialog that names
// the count and lists what goes; the safe choice ("Keep my portfolio") has the focus, Escape or a click outside closes it, the red button clears.
// After clearing, an Undo stays on screen for 10 seconds (the server holds the cleared list that long); after that the clear is final.
import { useEffect, useId, useRef, useState } from "react";
import "./clearportfolio.css";

export const UNDO_SECONDS = 10;

export function ClearPortfolio({ count, noun, plural, kind, goes, className, onClear, onUndo }: {
  count: number; noun: string; plural?: string; kind: string; goes: string[]; className: string;
  /** Clears the list; resolves when it is done (the page shows its empty state). */
  onClear: () => Promise<void>;
  /** Puts the list back; rejects when the clear is already final. */
  onUndo: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [toast, setToast] = useState<{ n: number; left: number } | null>(null), [err, setErr] = useState("");
  const keep = useRef<HTMLButtonElement>(null), opener = useRef<HTMLButtonElement>(null), id = useId();
  const word = (n: number) => `${n} ${n === 1 ? noun : plural ?? noun + "s"}`;
  useEffect(() => { if (open) keep.current?.focus(); }, [open]);
  useEffect(() => {
    if (!toast) return;
    if (toast.left <= 0) { setToast(null); return; }
    const t = setTimeout(() => setToast((x) => (x ? { ...x, left: x.left - 1 } : x)), 1000);
    return () => clearTimeout(t);
  }, [toast]);
  const close = () => { setOpen(false); opener.current?.focus(); };
  const clear = async () => {
    setBusy(true); setErr("");
    try { await onClear(); setOpen(false); setToast({ n: count, left: UNDO_SECONDS }); }
    catch (x) { setErr(x instanceof Error && x.message ? x.message : "The portfolio could not be cleared. Try again in a moment."); }
    finally { setBusy(false); }
  };
  const undo = async () => {
    const n = toast?.n ?? 0; setToast(null);
    try { await onUndo(); } catch (x) { setErr(x instanceof Error && x.message ? x.message : `The clear is final: Undo is only possible for ${UNDO_SECONDS} seconds.`); }
    if (n) opener.current?.focus();
  };
  return (<>
    <button ref={opener} type="button" className={className + " cpf-open"} onClick={() => setOpen(true)} disabled={count <= 0}>Clear portfolio</button>
    {open && <div className="cpf-back" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="cpf-dlg" role="dialog" aria-modal="true" aria-labelledby={id + "t"} aria-describedby={id + "d"} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
        <h2 id={id + "t"}>Clear your {kind} portfolio?</h2>
        <div id={id + "d"}>
          <p>This removes all <b>{word(count)}</b> from this portfolio, with:</p>
          <ul>{goes.map((g) => <li key={g}>{g}</li>)}</ul>
          <p className="cpf-safe">Your watchlists, alerts and other portfolios are not touched. You can undo for {UNDO_SECONDS} seconds.</p>
        </div>
        {err && <p className="cpf-err" role="alert">{err}</p>}
        <div className="cpf-row"><button ref={keep} type="button" className="cpf-keep" onClick={close}>Keep my portfolio</button>
          <button type="button" className="cpf-go" onClick={clear} disabled={busy}>{busy ? "Clearing…" : `Clear ${word(count)}`}</button></div>
      </div>
    </div>}
    {toast && <div className="cpf-toast" role="status"><span>{word(toast.n)} removed.</span><button type="button" onClick={undo}>Undo</button></div>}
    {!open && !toast && err && <p className="cpf-err" role="alert">{err}</p>}
  </>);
}
