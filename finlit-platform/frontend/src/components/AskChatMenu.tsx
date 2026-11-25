// A chat in FinLit AI's History with its ⋯ menu (owner, 25 Nov 2026): Pin, Rename, Save to Saved Questions, Copy question, Delete.
// Each item has its letter, as in the owner's example (P, R, S, C, D); Esc or a click outside closes the menu. Rename edits in place: Enter keeps it, Esc leaves it.
import { useEffect, useRef, useState } from "react";

const Pin = () => <svg viewBox="0 0 24 24" aria-hidden="true" className="aif-pin-i"><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6zM12 14v7" /></svg>;

export function AskChatItem({ text, name, pinned, saved, onAsk, onPin, onRename, onSave, onDelete, onCopied }: {
  text: string; name?: string; pinned: boolean; saved: boolean; onAsk: () => void; onPin: () => void; onRename: (name: string) => void;
  onSave: () => void; onDelete: () => void; onCopied?: () => void;
}) {
  const [open, setOpen] = useState(false), [editing, setEditing] = useState(false), [draft, setDraft] = useState("");
  const box = useRef<HTMLLIElement>(null), more = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const label = name || text;
  const close = (focus = true) => { setOpen(false); if (focus) more.current?.focus(); };
  const startRename = () => { setOpen(false); setDraft(label); setEditing(true); };
  const copy = () => { void navigator.clipboard?.writeText(text).then(() => onCopied?.()).catch(() => {}); close(); };
  const items: [string, string, () => void, string?][] = [
    [pinned ? "Unpin" : "Pin", "P", () => { onPin(); close(); }],
    ["Rename", "R", startRename],
    [saved ? "Remove from Saved Questions" : "Save to Saved Questions", "S", () => { onSave(); close(); }],
    ["Copy question", "C", copy],
    ["Delete", "D", () => { setOpen(false); onDelete(); }, "danger"],
  ];
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
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
      <button type="button" ref={more} className="aif-hm" aria-haspopup="menu" aria-expanded={open} aria-label={`More for “${label}”`} title="Pin, rename, delete…" onClick={() => setOpen((o) => !o)}>⋯</button>
      {open && <div ref={menu} className="aif-hmenu" role="menu" aria-label={`“${label}”`} onKeyDown={onKey}>
        {items.map(([l, k, run, tone]) => <button key={k} type="button" role="menuitem" className={tone ? `is-${tone}` : undefined} onClick={run} aria-keyshortcuts={k}>
          <span>{l}</span><kbd aria-hidden="true">{k}</kbd></button>)}
      </div>}
    </li>);
}
