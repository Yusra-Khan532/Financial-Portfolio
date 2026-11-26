// Task #388 (developer file 38, A2 and E1; SHARED.md KF and SP11): the site's own fold (`details.sp-sec.sp-fold`, as "Company size: how FinLit defines
// it") for the portfolio pages. Every fold is closed on every visit; one the member opens stays open for the rest of the visit, even when its view or step
// is drawn again (the page keeps a VisitFolds provider; leaving the page forgets it). Its summary ends in "Show ▾", and "Hide ▴" when open.
// Classes: pgb- (scoped in shared.css). Describes; never advice.
import { createContext, useCallback, useContext, useState, type ReactNode, type SyntheticEvent } from "react";

type Store = Map<string, boolean>;
const Visit = createContext<Store | null>(null);

/** The page's memory of its open folds, for this visit only (a new visit starts with a new, empty store, so every fold starts closed). */
export function VisitFolds({ children }: { children: ReactNode }) {
  const [store] = useState<Store>(() => new Map());
  return <Visit.Provider value={store}>{children}</Visit.Provider>;
}

/** A fold's open state: closed at first; with a VisitFolds provider, kept for the visit under `id`. */
export function useVisitFold(id: string): [boolean, (open: boolean) => void] {
  const store = useContext(Visit);
  const [open, setOpenState] = useState(() => store?.get(id) ?? false);
  const setOpen = useCallback((o: boolean) => { store?.set(id, o); setOpenState(o); }, [store, id]);
  return [open, setOpen];
}

/** "Show ▾" closed, "Hide ▴" open, at the right of the summary (the sp-show look, kept visible when open). */
export const ShowHide = ({ open }: { open: boolean }) => <span className="sp-show pgb-hs" aria-hidden="true">{open ? "Hide ▴" : "Show ▾"}</span>;

/** Keeps a click on a control inside a summary (the i) from opening or closing the fold. */
export const keepFold = (e: SyntheticEvent) => e.preventDefault();

/** One fold: a title (plain, or a heading the page links to), its one line, and the body. */
/** `elId` (task #391, developer file 41 v4 K1): an id on the fold itself, for a page whose links land on the fold (All my investments' #mi-kf). */
export function VisitFold({ id, title, line, className = "", elId, children }: { id: string; title: ReactNode; line?: ReactNode; className?: string; elId?: string; children: ReactNode }) {
  const [open, setOpen] = useVisitFold(id);
  return (
    <details id={elId} className={"sp-sec sp-fold pgb-fold" + (className ? " " + className : "")} open={open} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; if (o !== open) setOpen(o); }}>
      <summary><span className="pgb-t">{title}{line ? <small>{line}</small> : null}</span><ShowHide open={open} /></summary>
      {children}
    </details>
  );
}
