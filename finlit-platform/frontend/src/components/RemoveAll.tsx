// "Remove all" for a list the member owns (task #127): the Equity portfolio's shares and the MF portfolio's funds. One press shows the question in place,
// with the count ("Remove all 38 shares?"), a "Yes, remove all" button and Cancel; nothing is removed until the second press. Escape or Cancel goes back.
// No overlay: the question sits where the button was, so it works the same on a phone and never covers the page.
import { useEffect, useRef, useState } from "react";
import "./removeall.css";

export function RemoveAll({ count, noun, plural, note, className, busy = false, onConfirm }: {
  count: number; noun: string; plural?: string; note?: string; className: string; busy?: boolean; onConfirm: () => void | Promise<void>;
}) {
  const [asking, setAsking] = useState(false), cancel = useRef<HTMLButtonElement>(null), open = useRef<HTMLButtonElement>(null), wasAsking = useRef(false);
  const many = count === 1 ? `the 1 ${noun}` : `all ${count} ${plural ?? noun + "s"}`;
  useEffect(() => {   // the safe choice has the focus while the question is open; the button gets it back when the question closes
    if (asking) cancel.current?.focus(); else if (wasAsking.current) open.current?.focus();
    wasAsking.current = asking;
  }, [asking]);
  if (count <= 0) return null;   // nothing to remove: no button
  if (!asking) return <button ref={open} type="button" className={className + " rma-open"} onClick={() => setAsking(true)} disabled={busy}>Remove all</button>;
  return (
    <span className="rma-ask" role="group" aria-label={`Remove ${many}?`} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setAsking(false); } }}>
      <span className="rma-q">Remove {many}?{note ? <small> {note}</small> : null}</span>
      <button type="button" className={className + " rma-yes"} disabled={busy} onClick={async () => { await onConfirm(); setAsking(false); }}>{busy ? "Removing…" : "Yes, remove all"}</button>
      <button ref={cancel} type="button" className={className} disabled={busy} onClick={() => setAsking(false)}>Cancel</button>
    </span>);
}
