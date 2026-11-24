// Task #366 (Chinmay, 24 Nov 2026): under every piece of AI-written text: Copy (the whole text), thumbs up and thumbs down (stored for the team, so we
// learn which answers help). Pressing a pressed thumb withdraws the vote. Works for visitors too; nothing personal is sent.
import { useState } from "react";
import { rememberVote, sendVote, storedVote, type AiSurface, type Vote } from "../lib/aiFeedback";
import "../styles/aifeedback.css";

const Copy = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>;
const Thumb = ({ down }: { down?: boolean }) => <svg viewBox="0 0 24 24" aria-hidden="true" style={down ? { transform: "rotate(180deg)" } : undefined}>
  <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3zm0 0 4-7a2 2 0 0 1 3 1.7V9h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 16.8 20H7" /></svg>;
const Tick = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;

export function AiFeedback({ surface, refKey, text, getText, question, label = "this answer" }: {
  surface: AiSurface; /** which answer: stable for the same text */ refKey: string; /** what Copy copies, and the start of it is kept with a vote */ text?: string;
  /** or read it when needed (a long rendered block) */ getText?: () => string; question?: string; label?: string;
}) {
  const body = () => (getText ? getText() : text) || "";
  const [vote, setVote] = useState<Vote>(() => storedVote(surface, refKey));
  const [copied, setCopied] = useState(false), [note, setNote] = useState<string | null>(null);
  const copy = async () => {
    try { await navigator.clipboard.writeText(body()); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setNote("Copy is blocked in this browser; select the text instead."); }
  };
  const cast = async (v: 1 | -1) => {
    const next: Vote = vote === v ? 0 : v, before = vote;
    setVote(next); rememberVote(surface, refKey, next); setNote(null);
    try {
      await sendVote({ surface, ref: refKey, rating: next, question, excerpt: body() });
      if (next) setNote(next === 1 ? "Thanks, glad it helped." : "Thanks, noted. The team reads every thumbs down.");
    } catch {
      setVote(before); rememberVote(surface, refKey, before); setNote("Could not send your vote just now. Please try again.");
    }
  };
  return (
    <div className="aifb" role="group" aria-label={`Copy or rate ${label}`}>
      <button type="button" className="aifb-b" onClick={copy} aria-label={copied ? "Copied" : `Copy ${label}`} title={copied ? "Copied" : "Copy"}>{copied ? <Tick /> : <Copy />}</button>
      <button type="button" className="aifb-b" aria-pressed={vote === 1} onClick={() => cast(1)} aria-label="Good answer" title="Good answer"><Thumb /></button>
      <button type="button" className="aifb-b" aria-pressed={vote === -1} onClick={() => cast(-1)} aria-label="Bad answer" title="Bad answer"><Thumb down /></button>
      {note && <span className="aifb-note" role="status">{note}</span>}
    </div>
  );
}
