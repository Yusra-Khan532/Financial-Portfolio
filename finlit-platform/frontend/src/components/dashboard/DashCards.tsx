// Task #135 (dashboard pack 06, version 2): every Good sign, Insight and Watch out card on the dashboard opens and closes. Closed (the default) it is one row:
// the round icon, the label and the headline, and a round chevron. Open, it shows the full sentence, the company names as chips that open each company
// report (grouped with a count; Lead in green, Lag in red) and the small note. Which cards a member opened is remembered for that member until they close
// them. The shared Cards component (Sector Pulse and the other pages) is not changed. Descriptive only.
import { createContext, useCallback, useContext, useId, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { Card } from "../../lib/pulsePack";
import { KIND_ICON, KIND_WORD } from "../sectors/pack/Common";

type OpenStore = { isOpen: (id: string) => boolean; setOpen: (ids: string[], open: boolean) => void };
const Ctx = createContext<OpenStore | null>(null);
const keyOf = (userId: string | number | null | undefined) => `finlit.dash.cards.${userId ?? "anon"}`;

function read(key: string): Set<string> {
  try { const v = JSON.parse(localStorage.getItem(key) || "[]"); return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 200) : []); } catch { return new Set(); }
}

/** Holds which cards the member has opened (in this browser, per member). Without it the cards still open and close, for this visit only. */
export function DashCardsProvider({ userId, children }: { userId: string | number | null | undefined; children: ReactNode }) {
  const key = keyOf(userId);
  const [open, set] = useState<Set<string>>(() => read(key));
  const setOpen = useCallback((ids: string[], on: boolean) => set((prev) => {
    const next = new Set(prev);
    for (const id of ids) { if (on) next.add(id); else next.delete(id); }
    try { localStorage.setItem(key, JSON.stringify([...next])); } catch { /* private window: lasts for this visit */ }
    return next;
  }), [key]);
  const v = useMemo<OpenStore>(() => ({ isOpen: (id) => open.has(id), setOpen }), [open, setOpen]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export function useOpenStore(): OpenStore {
  const ctx = useContext(Ctx);
  const [local, setLocal] = useState<Set<string>>(new Set());
  const fallback = useMemo<OpenStore>(() => ({ isOpen: (id) => local.has(id), setOpen: (ids, on) => setLocal((p) => { const n = new Set(p); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; }) }), [local]);
  return ctx ?? fallback;
}

/** The ids of a group of cards: `scope:0`, `scope:1`… (the position, so a headline that changes with the figures keeps its open state). */
export const cardIds = (scope: string, n: number) => Array.from({ length: n }, (_, i) => `${scope}:${i}`);

function Chevron({ up }: { up: boolean }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ transform: up ? "rotate(180deg)" : undefined }}><path d="M6 9l6 6 6-6" /></svg>;
}

export function DashCard({ c, id }: { c: Card; id: string }) {
  const store = useOpenStore();
  const open = store.isOpen(id);
  const bodyId = "dsh-ic-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <div className={"sp-card dsh-ic sp-" + c.kind + (open ? " open" : "")} data-card={id}>
      <button type="button" className="dsh-ic-row" aria-expanded={open} aria-controls={bodyId} onClick={() => store.setOpen([id], !open)}>
        <span className="sp-card-ic" aria-hidden="true"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{KIND_ICON[c.kind]}</svg></span>
        <span className="dsh-ic-t"><span className="sp-kind">{KIND_WORD[c.kind]}</span><span className="sp-ct">{c.title}</span></span>
        <span className="dsh-ic-chev"><Chevron up={open} /></span>
      </button>
      <div className="dsh-ic-body" id={bodyId} hidden={!open}>
        <p className="sp-cx">{c.text}</p>
        {(c.groups ?? []).map((g) => (
          <div className={"dsh-ic-g" + (g.tone ? " " + g.tone : "")} key={g.label}>
            <p className="dsh-ic-gl">{g.label}</p>
            <ul>{g.chips.map((ch) => <li key={ch.symbol}><Link className="dsh-ichip" to={`/stocks/${encodeURIComponent(ch.symbol)}`} title={`Open the ${ch.label} report`}>{ch.label}{ch.note ? <small>{ch.note}</small> : null}</Link></li>)}</ul>
          </div>))}
        {c.note && <p className="dsh-ic-note">{c.note}</p>}
      </div>
    </div>
  );
}

/** A row of dropdown insight cards. Cards in a row align to the top, so opening one does not stretch its neighbour. */
export function DashCards({ items, scope, cols }: { items: Card[]; scope: string; cols?: number }) {
  if (!items.length) return null;
  const ids = cardIds(scope, items.length);
  return <div className="sp-cards dsh-ics" style={{ ["--cols" as string]: cols ?? items.length }}>{items.map((c, i) => <DashCard key={ids[i]} c={c} id={ids[i]} />)}</div>;
}

/** "Open all" / "Close all" for one section's cards: every card open makes it "Close all". */
export function OpenAll({ scope, n }: { scope: string; n: number }) {
  const store = useOpenStore();
  if (!n) return null;
  const ids = cardIds(scope, n), allOpen = ids.every((id) => store.isOpen(id));
  return <button type="button" className="dsh-btn dsh-openall" onClick={() => store.setOpen(ids, !allOpen)}>{allOpen ? "Close all" : "Open all"}</button>;
}
