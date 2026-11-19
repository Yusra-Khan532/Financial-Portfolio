// Task #248 (dashboard update pack of 19 Nov 2026): the "Showing" bar at the top of Step 1. One drop-down per kind (Equity, and on Silver and up Mutual funds
// and ETFs); each lists the kind's portfolios with a tick box, how many holdings each has and where it comes from, plus All accounts and an "Only" button per
// row. Unticking the last goes back to All accounts. "+ Add a portfolio" opens that kind's page; "Done", Escape or a click outside closes the list and focus
// returns to its button. The button shows the choice and turns amber when it is not All accounts. Styles: styles/dash248.css (dsh-show, ds-pk*, ds-pop, ds-opt*).
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { KIND_WORD, PAGE_OF, choiceLabel, toggle, type Account, type DashPick, type PickKind, type Resolved } from "../../lib/dashPick";
import "../../styles/dash248.css";

function Picker({ kind, accs, r, set }: { kind: PickKind; accs: Account[]; r: Resolved; set: (c: "all" | string[]) => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null), box = useRef<HTMLDivElement>(null), id = useId();
  const close = (focus = true) => { setOpen(false); if (focus) btn.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
    const click = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) close(false); };
    document.addEventListener("keydown", key); document.addEventListener("mousedown", click);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", click); };
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  const on = (a: Account) => r === "all" || r.includes(a.id);
  const label = choiceLabel(r, accs);
  return (
    <div className="ds-pk" ref={box}>
      <button ref={btn} type="button" className={"ds-pk-b" + (r === "all" ? "" : " on")} aria-haspopup="true" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span className={"ds-pk-dot ds-pk-" + kind} aria-hidden="true" /><span className="ds-pk-t"><span className="ds-pk-k">{KIND_WORD[kind]}</span><span className="ds-pk-v">{label}</span></span><span className="ds-pk-c" aria-hidden="true" /></button>
      {open && <div className="ds-pop" id={id} role="group" aria-label={`${KIND_WORD[kind]} portfolios the dashboard reads`}>
        <p className="ds-pop-h">{KIND_WORD[kind]} portfolios</p>
        <label className="ds-opt ds-opt-all"><input type="checkbox" checked={r === "all"} onChange={() => set("all")} /><span className="ds-opt-t"><b>All accounts</b><small>{accs.length} {accs.length === 1 ? "portfolio" : "portfolios"}</small></span></label>
        {accs.map((a) => <div key={a.id} className="ds-opt">
          <label><input type="checkbox" checked={on(a)} onChange={() => set(toggle(r, a.id, accs))} /><span className="ds-opt-t"><b>{a.name}</b><small>{a.n} {a.noun} · {a.from}</small></span></label>
          {accs.length > 1 && <button type="button" className="ds-opt-only" onClick={() => set([a.id])} aria-label={`Only ${a.name}`}>Only</button>}
        </div>)}
        <div className="ds-pop-f"><Link to={PAGE_OF[kind]}>+ Add a portfolio</Link><button type="button" className="ds-pop-done" onClick={() => close()}>Done</button></div>
      </div>}
    </div>);
}

export function ShowingBar({ pick, kinds }: { pick: DashPick; kinds: PickKind[] }) {
  const filtered = kinds.some((k) => pick.choice[k] !== "all");
  return (
    <section className="dsh-card dsh-show" aria-label="Which portfolios Step 1 shows">
      <span className="dsh-show-k">Showing</span>
      <div className="dsh-show-pk">{kinds.map((k) => <Picker key={k} kind={k} accs={pick.accounts[k]} r={pick.choice[k]} set={(c) => pick.set(k, c)} />)}</div>
      {filtered && <button type="button" className="dsh-show-all" onClick={() => kinds.forEach((k) => pick.set(k, "all"))}>Show all accounts</button>}
      <span className="dsh-show-note">Saved to your account and used on every device.</span>
    </section>);
}
