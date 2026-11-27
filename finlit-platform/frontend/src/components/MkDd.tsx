// Task #322 (developer file 24): the dashboard's dropdown (file 22, components/dashboard/dx.tsx) with the pack's two additions: a search box inside
// (.dx-dd-q) and group headings (.dx-dd-h). Kept apart from the dashboard's own file, which another task is changing; same keys and look.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

export type MkOption<T extends string> = { v: T; label: string; small?: ReactNode } | { head: string };
const isHead = <T extends string,>(o: MkOption<T>): o is { head: string } => "head" in o;

const Chev = () => <svg className="dx-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6" /></svg>;

export function MkDd<T extends string>({ k, value, options, onChange, search, className = "", label }: {
  k: string; value: T; options: readonly MkOption<T>[]; onChange: (v: T) => void; /** a search box inside, with this placeholder */ search?: string; className?: string; label?: string }) {
  const [open, setOpen] = useState(false), [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null), list = useRef<HTMLUListElement>(null), find = useRef<HTMLInputElement>(null);
  const id = "mk-dd-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const cur = options.find((o): o is { v: T; label: string; small?: ReactNode } => !isHead(o) && o.v === value);
  const close = useCallback((focus = false) => { setOpen(false); setQ(""); if (focus) btn.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) close(); };
    document.addEventListener("mousedown", out);
    if (search) find.current?.focus({ preventScroll: true });
    else (list.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? list.current?.querySelector<HTMLElement>("[role=option]"))?.focus({ preventScroll: true });
    return () => document.removeEventListener("mousedown", out);
  }, [open, search, close]);
  const t = q.trim().toLowerCase();
  // a heading shows only when one of its options does
  const shown: MkOption<T>[] = [];
  let pendingHead: { head: string } | null = null;
  for (const o of options) {
    if (isHead(o)) { pendingHead = o; continue; }
    if (t && !o.label.toLowerCase().includes(t)) continue;
    if (pendingHead) { shown.push(pendingHead); pendingHead = null; }
    shown.push(o);
  }
  const keys = (e: React.KeyboardEvent) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>("[role=option]") ?? [])], i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (e.key === "ArrowDown") go(i + 1); else if (e.key === "ArrowUp") { if (i <= 0 && search) { e.preventDefault(); find.current?.focus(); } else go(i - 1); }
    else if (e.key === "Home" && i >= 0) go(0); else if (e.key === "End" && i >= 0) go(items.length - 1);
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === "Tab") close();
    else if ((e.key === "Enter" || e.key === " ") && i >= 0) { e.preventDefault(); items[i].click(); }
    else if (e.key === "Enter" && document.activeElement === find.current && items[0]) { e.preventDefault(); items[0].click(); }
  };
  return (
    <div className={"dx-dd " + className} ref={box}>
      <button ref={btn} type="button" className="dx-dd-b" aria-haspopup="listbox" aria-expanded={open} aria-controls={id} aria-label={label ?? `${k}: ${cur?.label ?? ""}`}
        onClick={() => (open ? close() : setOpen(true))}>
        <span className="dx-dd-k">{k}</span><b>{cur?.label ?? ""}</b><Chev />
      </button>
      {open && <div className="dx-dd-m" onKeyDown={keys}>
        {search && <input ref={find} className="dx-dd-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={search} aria-label={search} />}
        <ul ref={list} id={id} role="listbox" aria-label={k}>
          {shown.map((o, i) => isHead(o)
            ? <li key={"h" + i} className="dx-dd-h" role="presentation">{o.head}</li>
            : <li key={o.v} role="option" aria-selected={o.v === value} tabIndex={-1} onClick={() => { close(true); onChange(o.v); }}><span>{o.label}</span>{o.small != null && o.small !== "" ? <small>{o.small}</small> : null}</li>)}
          {!shown.length && <li className="dx-dd-h" role="presentation">Nothing matches</li>}
        </ul>
      </div>}
    </div>
  );
}

/** Buttons on a wide screen and the dropdown on a phone, for the same choice. */
export function MkSeg<T extends string>({ k, value, options, onChange, label }: { k: string; value: T; options: readonly { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return <>
    <div className="pm-seg dx-only-l" role="group" aria-label={label}>{options.map((o) => <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.label}</button>)}</div>
    <MkDd k={k} value={value} options={options} onChange={onChange} className="dx-only-s" label={`${label}: ${options.find((o) => o.v === value)?.label ?? ""}`} />
  </>;
}
