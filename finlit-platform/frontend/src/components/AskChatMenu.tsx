// A chat in FinLit AI's History with its ⋯ menu (owner, 25 Nov 2026): Pin, Rename, Save to Saved Questions, Copy question, Delete.
// Each item has its letter, as in the owner's example (P, R, S, C, D); Esc or a click outside closes the menu. Rename edits in place: Enter keeps it, Esc leaves it.
// Task #405: the menu is drawn at the ⋯ button, outside the History column. That column clips its overflow, and its backdrop blur makes it the box even
// for position: fixed, so a menu inside it was cut off on the left. It opens below ⋯ (above it near the bottom of the screen), never past an edge,
// and closes when the list scrolls or the window resizes.
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../lib/icons";

const Pin = ({ className = "aif-pin-i" }: { className?: string }) => <svg viewBox="0 0 24 24" aria-hidden="true" className={className}><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6zM12 14v7" /></svg>;
const Dots = () => <svg viewBox="0 0 24 24" aria-hidden="true" className="aif-hm-i"><circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" /></svg>;
const GAP = 6, EDGE = 8;
/** Where the menu goes: under the ⋯ button, its left edge at the button's left, kept inside the window; above the button when there is no room below. */
export function placeMenu(btn: { left: number; top: number; bottom: number }, menu: { width: number; height: number }, vw: number, vh: number) {
  const left = Math.max(EDGE, Math.min(btn.left, vw - menu.width - EDGE));
  const below = btn.bottom + GAP, above = btn.top - GAP - menu.height;
  const top = below + menu.height <= vh - EDGE || above < EDGE ? Math.max(EDGE, Math.min(below, vh - menu.height - EDGE)) : above;
  return { left: Math.round(left), top: Math.round(top), up: top < btn.top };
}

export function AskChatItem({ text, name, pinned, saved, onAsk, onPin, onRename, onSave, onDelete, onCopied }: {
  text: string; name?: string; pinned: boolean; saved: boolean; onAsk: () => void; onPin: () => void; onRename: (name: string) => void;
  onSave: () => void; onDelete: () => void; onCopied?: () => void;
}) {
  const [open, setOpen] = useState(false), [editing, setEditing] = useState(false), [draft, setDraft] = useState("");
  const [at, setAt] = useState<{ left: number; top: number; up: boolean } | null>(null);
  const box = useRef<HTMLLIElement>(null), more = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const label = name || text;
  const close = (focus = true) => { setOpen(false); if (focus) more.current?.focus(); };
  const startRename = () => { setOpen(false); setDraft(label); setEditing(true); };
  const copy = () => { void navigator.clipboard?.writeText(text).then(() => onCopied?.()).catch(() => {}); close(); };
  const items: [string, string, () => void, React.ReactNode, string?][] = [
    [pinned ? "Unpin" : "Pin", "P", () => { onPin(); close(); }, <Pin className="aif-hmenu-i" />],
    ["Rename", "R", startRename, <Icon name="pencil" className="aif-hmenu-i" />],
    [saved ? "Remove from Saved Questions" : "Save to Saved Questions", "S", () => { onSave(); close(); }, <Icon name="star" className="aif-hmenu-i" />],
    ["Copy question", "C", copy, <Icon name="clipboard" className="aif-hmenu-i" />],
    ["Delete", "D", () => { setOpen(false); onDelete(); }, <Icon name="trash" className="aif-hmenu-i" />, "danger"],
  ];
  useLayoutEffect(() => {   // measured before the first paint, so the menu never shows in the wrong place
    const b = more.current?.getBoundingClientRect(), m = menu.current;
    setAt(open && b && m ? placeMenu(b, { width: m.offsetWidth, height: m.offsetHeight }, document.documentElement.clientWidth || innerWidth, innerHeight) : null);
  }, [open]);
  const placed = at !== null;
  useEffect(() => { if (open && placed) menu.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true }); }, [open, placed]);   // the keyboard lands in the menu
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !menu.current?.contains(t)) setOpen(false); };
    const moved = (e: Event) => { if (!menu.current?.contains(e.target as Node)) setOpen(false); };   // the list scrolled away from the menu
    document.addEventListener("mousedown", out);
    addEventListener("scroll", moved, true); addEventListener("resize", moved);
    return () => { document.removeEventListener("mousedown", out); removeEventListener("scroll", moved, true); removeEventListener("resize", moved); };
  }, [open]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    const all = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? []), i = all.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); all[(i + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length]?.focus(); return; }
    const hit = items.find(([, k]) => k === e.key.toUpperCase());
    if (hit && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); hit[2](); }
  };
  if (editing) return (
    <li ref={box} className="aif-hi editing">
      <input className="aif-ren" value={draft} autoFocus maxLength={80} aria-label={`New name for “${text}”`} onChange={(e) => setDraft(e.target.value)} onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onRename(draft); setEditing(false); } if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(false); } }}
        onBlur={() => { onRename(draft); setEditing(false); }} />
    </li>);
  return (
    <li ref={box} className={"aif-hi" + (pinned ? " pinned" : "") + (open ? " open" : "")}>
      <button type="button" className="aif-hq" title={name ? `${name}: ${text}` : text} onClick={onAsk}>{pinned && <Pin />}<span>{label}</span></button>
      <button type="button" ref={more} className="aif-hm" aria-haspopup="menu" aria-expanded={open} aria-label={`More for “${label}”`} title="Pin, rename, delete…" onClick={() => setOpen((o) => !o)}><Dots /></button>
      {open && createPortal(
        <div ref={menu} className={"aif-hmenu" + (at?.up ? " up" : "")} role="menu" aria-label={`“${label}”`} onKeyDown={onKey}
          style={at ? { left: at.left, top: at.top } : { left: 0, top: 0, visibility: "hidden" }}>
          {items.map(([l, k, run, icon, tone]) => <button key={k} type="button" role="menuitem" className={tone ? `is-${tone}` : undefined} onClick={run} aria-keyshortcuts={k}>
            {icon}<span>{l}</span><kbd aria-hidden="true">{k}</kbd></button>)}
        </div>, box.current?.closest(".aif") ?? document.body)}
    </li>);
}
