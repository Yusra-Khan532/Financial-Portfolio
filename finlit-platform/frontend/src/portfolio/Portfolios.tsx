// Task #235 (the 18 Nov portfolios pack, B1): the portfolios bar (All accounts first, then one tab per broker account, then "+ Add portfolio"), Rename and
// Remove confirmed in the page, the Add portfolio dialog (broker, name, how to start), and the line "Shares you add or upload go to [portfolio ▾]".
// The figures on each tab are lib/ledger's. Describes; never advice.
import { useEffect, useRef, useState } from "react";
import { lk, pct, tone } from "./money";

export type PfInfo = { id: string; name: string; broker?: string };
export type PfFigs = { n: number; now: number; withQty: number; gainPct: number | null };
export const BROKERS = ["Dhan", "Upstox", "Zerodha", "Groww", "Angel One", "ICICI Direct", "HDFC Securities", "Kotak Securities", "5paisa", "Motilal Oswal", "Paytm Money", "Other"];
export const MAX_PF = 10;
const AV = ["#0e6471", "#4b4fc4", "#b5541c", "#2f5a9e", "#9a6b12", "#7a3e8e", "#2e7d57", "#a3324a", "#5b6170", "#13606b"];
const initial = (s: string) => s.trim().charAt(0).toUpperCase() || "?";

function figsLine(f: PfFigs, noun: [string, string]) {
  return <>{f.n} {f.n === 1 ? noun[0] : noun[1]}{f.withQty ? ` · ${lk(f.now)}` : ""}{f.gainPct != null && <> · <span className={tone(f.gainPct)}>{pct(f.gainPct)}</span></>}</>;
}

export function PortfoliosBar({ list, cur, onPick, figs, onAdd, onRename, onRemove, noun = ["share", "shares"], sub = "One tab for each broker account. All accounts adds them up and scores them as one list." }: {
  list: PfInfo[]; cur: string | "all"; onPick: (id: string | "all") => void; figs: (id: string | "all") => PfFigs; onAdd: () => void;
  onRename: (id: string, name: string) => string | null; onRemove: (id: string) => void; noun?: [string, string]; sub?: string;
}) {
  const tabs: (PfInfo & { ini: string; av: string })[] = [{ id: "all", name: "All accounts", ini: "∑", av: "#3a3f4b" }, ...list.map((p, i) => ({ ...p, ini: initial(p.name), av: AV[i % AV.length] }))];
  const [mode, setMode] = useState<"" | "ren" | "rm">(""), [name, setName] = useState(""), [err, setErr] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const sel = list.find((p) => p.id === cur);
  useEffect(() => { setMode(""); setErr(""); }, [cur]);
  const key = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (n == null) return;
    e.preventDefault(); const t = tabs[(n + tabs.length) % tabs.length]; onPick(t.id); setTimeout(() => box.current?.querySelector<HTMLButtonElement>(`[data-acc="${t.id}"]`)?.focus(), 0);
  };
  return (
    <section className="acc-bar" aria-labelledby="acc-k">
      <div className="acc-h"><div><p className="acc-k" id="acc-k">Your portfolios</p><p className="acc-sub">{sub}</p></div>
        {sel && <div className="acc-act"><button type="button" onClick={() => { setMode("ren"); setName(sel.name); setErr(""); }}>Rename</button>
          {list.length > 1 && <button type="button" className="acc-rm" onClick={() => setMode("rm")}>Remove portfolio</button>}</div>}</div>
      <div className="acc-tabs" role="tablist" aria-label="Your portfolios" ref={box}>
        {tabs.map((t, i) => { const f = figs(t.id), on = t.id === cur;
          return <button key={t.id} type="button" role="tab" className="acc-t" data-acc={t.id} aria-selected={on} tabIndex={on ? 0 : -1} onClick={() => onPick(t.id)} onKeyDown={(e) => key(e, i)}>
            <span className="acc-av" style={{ ["--av" as string]: t.av }} aria-hidden="true">{t.ini}</span><b>{t.name}</b><small>{figsLine(f, noun)}</small></button>; })}
        <button type="button" className="acc-add" onClick={onAdd} disabled={list.length >= MAX_PF} title={list.length >= MAX_PF ? `Up to ${MAX_PF} portfolios` : undefined}>+ Add portfolio</button>
      </div>
      {sel && mode === "ren" && <form className="acc-confirm ren" onSubmit={(e) => { e.preventDefault(); const why = onRename(sel.id, name); if (why) setErr(why); else setMode(""); }}>
        <label htmlFor="acc-ren">New name</label><input id="acc-ren" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
        <button type="submit" className="go">Save</button><button type="button" onClick={() => setMode("")}>Cancel</button>{err && <p className="acc-err" role="alert">{err}</p>}</form>}
      {sel && mode === "rm" && <div className="acc-confirm" role="alertdialog" aria-label={`Remove ${sel.name}`}>
        <span>Remove {sel.name} and its {figs(sel.id).n} {figs(sel.id).n === 1 ? noun[0] : noun[1]} from FinLit? Nothing changes at your broker. This cannot be undone.</span>
        <button type="button" className="go del" onClick={() => { onRemove(sel.id); setMode(""); }} autoFocus>Remove</button><button type="button" onClick={() => setMode("")}>Cancel</button></div>}
    </section>
  );
}

/** "Shares you add or upload go to [portfolio ▾]" (pack B1): defaults to the selected tab; in All accounts the member picks one. */
export function GoTo({ list, value, onChange, noun = "Shares" }: { list: PfInfo[]; value: string; onChange: (id: string) => void; noun?: string }) {
  if (list.length < 2) return null;
  return <p className="acc-to"><label htmlFor="acc-to">{noun} you add or upload go to</label>
    <select id="acc-to" value={value} onChange={(e) => onChange(e.target.value)}>{list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></p>;
}

export type Start = "empty" | "file" | "cas";
/** The Add portfolio dialog (pack B1): the broker fills Name until the member types their own; the name is unique (the error suggests "Dhan (joint)"); three
 *  ways to start. Focus stays inside; Esc and Cancel close it. */
export function AddPortfolioDialog({ taken, onClose, onSave, kinds = BROKERS, start = [["empty", "An empty portfolio", "Add shares to it by name, then their buys."], ["file", "The broker's holdings file", "Brings each share; check the quantities and buy prices before saving."], ["cas", "A CAS from NSDL or CDSL", "One portfolio per demat account it lists, with quantities."]] }: {
  taken: string[]; onClose: () => void; onSave: (p: { name: string; broker: string; start: Start }) => void; kinds?: string[]; start?: [Start, string, string][];
}) {
  const [broker, setBroker] = useState(kinds[0]), [name, setName] = useState(kinds[0]), [typed, setTyped] = useState(false), [how, setHow] = useState<Start>("empty"), [err, setErr] = useState("");
  const box = useRef<HTMLDivElement>(null), opener = useRef<Element | null>(null);
  useEffect(() => {
    opener.current = document.activeElement;
    box.current?.querySelector<HTMLElement>("select, input")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || !box.current) return;
      const f = [...box.current.querySelectorAll<HTMLElement>("button, input, select")].filter((x) => !x.hasAttribute("disabled"));
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); (opener.current as HTMLElement | null)?.focus?.(); };
  }, [onClose]);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) { setErr("Give the portfolio a name."); return; }
    if (taken.some((t) => t.trim().toLowerCase() === n.toLowerCase())) { setErr(`You already have a portfolio called ${n}. Try another name, such as "${n} (joint)".`); return; }
    onSave({ name: n, broker, start: how });
  };
  return (
    <div className="acc-dlg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="acc-dlg-in" role="dialog" aria-modal="true" aria-labelledby="acc-dlg-h" ref={box}>
        <h2 id="acc-dlg-h">Add a portfolio</h2><p className="acc-dlg-p">One portfolio for each broker account, so each can be seen on its own and in All accounts.</p>
        <form onSubmit={save}>
          <label className="acc-f">Broker<select value={broker} onChange={(e) => { setBroker(e.target.value); if (!typed) setName(e.target.value === "Other" ? "" : e.target.value); }}>{kinds.map((b) => <option key={b}>{b}</option>)}</select></label>
          <label className="acc-f">Name<input value={name} maxLength={40} onChange={(e) => { setName(e.target.value); setTyped(true); setErr(""); }} /></label>
          {err && <p className="acc-err" role="alert">{err}</p>}
          <fieldset className="acc-st"><legend>Start with</legend>
            {start.map(([k, t, x]) => <label key={k}><input type="radio" name="acc-start" checked={how === k} onChange={() => setHow(k)} /><span><b>{t}</b><small>{x}</small></span></label>)}</fieldset>
          <div className="acc-dlg-b"><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="go">Add portfolio</button></div>
        </form>
      </div>
    </div>
  );
}

/** The "Analysing" bar on Diversification and Risk (pack B10): the same choice as the portfolios bar, so picking a chip picks that tab and the other way round.
 *  Shown only when there are two or more portfolios; with one, every figure is already that list's. */
export function AnalysingBar({ list, cur, onPick, n, noun = ["share", "shares"] }: { list: PfInfo[]; cur: string | "all"; onPick: (id: string | "all") => void; n: number; noun?: [string, string] }) {
  if (list.length < 2) return null;
  return (
    <div className="x-axbar" role="group" aria-label="Portfolio being analysed">
      <span className="x-axk">Analysing</span>
      {[{ id: "all", name: "All accounts" }, ...list].map((p) => <button key={p.id} type="button" className="x-axc" aria-pressed={p.id === cur} onClick={() => onPick(p.id)}>{p.name}</button>)}
      <span className="x-axn">{n} {n === 1 ? noun[0] : noun[1]} · every figure on this tab follows the portfolio you pick</span>
    </div>
  );
}
