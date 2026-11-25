// Task #349 PR 2: the Chat History view of the FinLit AI panel, and the one-line notice under its input.
// A signed-in Silver or Gold member sees the questions FinLit AI keeps on the server (date, subject, question; tap to ask again; delete one).
// Visitors and Basic members keep the list held in this browser only (askExplorer.loadRecent), exactly as before.
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Icon } from "../lib/icons";
import { Button } from "./ui";
import { usePrefs } from "../lib/prefs";
import { ACCOUNT_AI_PATH, MEMORY_NOTICE, askedOn, deleteAskHistoryItem, loadAskHistory, subjectLabel, type AskHistory as History } from "../lib/askMemory";
import "../styles/ask-memory.css";

type Props = {
  /** true: read the server history (memoryApplies); false: the browser-only list */
  server: boolean;
  recent: string[];
  onAsk: (question: string) => void;
  onClearLocal: () => void;
  /** closes the panel when the member follows the link to Account */
  onLeave?: () => void;
};

export function AskHistoryView({ server, recent, onAsk, onClearLocal, onLeave }: Props) {
  const [data, setData] = useState<History | null>(null);
  const [failed, setFailed] = useState(false);
  const [gone, setGone] = useState<number[]>([]);
  const [delErr, setDelErr] = useState("");
  useEffect(() => {
    if (!server) return;
    let live = true;
    setFailed(false);
    loadAskHistory(50).then((d) => { if (live) setData(d); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [server]);

  const local = (note?: string) => <>
    <div className="aif-h"><h2>Chat History</h2><p>{note ?? "Your recent questions, kept in this browser only."}</p></div>
    {recent.length ? <><ul className="aif-qs" aria-label="Recent questions">{recent.map((t) => <li key={t}><button type="button" className="aif-q" onClick={() => onAsk(t)}><Icon name="chat" /><span>{t}</span><Icon name="arrow" /></button></li>)}</ul>
      <button type="button" className="aif-clear" onClick={onClearLocal}>Clear history</button></> : <p className="aif-none">No questions yet. Ask one and it appears here.</p>}
  </>;
  if (!server) return local();
  if (failed) return local("Your FinLit AI history could not be read just now. These are the questions asked in this browser.");
  if (!data) return <><div className="aif-h"><h2>Chat History</h2></div><p className="aif-none" role="status">Reading your FinLit AI history…</p></>;

  const items = data.items.filter((i) => !gone.includes(i.id));
  // Task #349 fix E (the founder's Gold QA, 24 Nov 2026): questions asked before the server kept them (23 Nov), and listed questions, live only in
  // this browser's list; they were hidden once the server list showed. They stay, under the server's, marked "on this device".
  const deviceOnly = onDevice(recent, data.items);
  const remove = (id: number) => {
    setDelErr("");
    deleteAskHistoryItem(id).then(() => setGone((g) => [...g, id])).catch(() => setDelErr("That question could not be deleted just now. Please try again."));
  };
  return <>
    <div className="aif-h"><h2>Chat History</h2>
      <p>Your FinLit AI questions, kept for {data.retentionDays} days. <Link to={ACCOUNT_AI_PATH} onClick={onLeave}>Manage in Account</Link></p></div>
    {!data.remember && <p className="aim-off" role="note">New questions are not being kept: remembering is switched off in <Link to={ACCOUNT_AI_PATH} onClick={onLeave}>Account</Link>.</p>}
    {delErr && <p className="aif-err" role="alert">{delErr}</p>}
    {items.length ? <ul className="aif-qs" aria-label="Your FinLit AI questions">{items.map((i) => (
      <li key={i.id} className="aif-sv">
        <button type="button" className="aif-q" onClick={() => onAsk(i.question)} title="Ask again"><Icon name="chat" />
          <span className="aim-q"><span>{i.question}</span><small className="aim-meta">{askedOn(i.askedAt)} · {subjectLabel(i)}</small></span><Icon name="arrow" /></button>
        <button type="button" className="aif-unsave" aria-label={`Delete from history: ${i.question}`} title="Delete" onClick={() => remove(i.id)}>×</button>
      </li>))}</ul>
      : !deviceOnly.length && <p className="aif-none">No questions kept yet. Your written answers from FinLit AI appear here.</p>}
    {deviceOnly.length > 0 && <section className="aim-dev" aria-label="Asked on this device">
      <p className="aif-label">On this device</p>
      <p className="aim-off">Earlier questions kept in this browser only (listed answers, and questions from before FinLit AI kept them for you).</p>
      <ul className="aif-qs" aria-label="Questions asked on this device">{deviceOnly.map((t) => <li key={t}><button type="button" className="aif-q" onClick={() => onAsk(t)} title="Ask again"><Icon name="chat" />
        <span className="aim-q"><span>{t}</span><small className="aim-meta">On this device</small></span><Icon name="arrow" /></button></li>)}</ul>
      <button type="button" className="aif-clear" onClick={onClearLocal}>Clear this device's list</button>
    </section>}
  </>;
}

/** Task #349 fix E: the browser's own questions that the server list does not hold (same words, ignoring case and spaces), newest first. */
export function onDevice(recent: string[], server: { question: string }[]): string[] {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const kept = new Set(server.map((i) => norm(i.question)));
  return recent.filter((t) => t.trim() && !kept.has(norm(t)));
}

/** The panel header's way into Chat History (the lead, 23 Nov 2026): the full window's side menu holds it from 981px up, but the small window
 *  and any window under 981px (phones, narrow windows) had no way in. The header button opens the same view; CSS hides it where the side menu shows. */
export function AskHistoryButton({ onOpen }: { onOpen: () => void }) {
  return <Button variant="quiet" size="sm" className="aim-hist" onClick={onOpen} aria-label="Chat History" title="Chat History"><Icon name="refresh" /><span className="aim-hist-l">History</span></Button>;
}

/** The line under the input for a signed-in Silver or Gold member (memoryApplies), while remembering is on (prefs.aiMemory). */
export function AskMemoryNotice({ onLeave }: { onLeave?: () => void }) {
  if (!usePrefs().aiMemory) return null;
  const [text, link] = MEMORY_NOTICE.split("Manage in Account.");
  return <p className="aim-note">{text}<Link to={ACCOUNT_AI_PATH} onClick={onLeave}>Manage in Account.</Link>{link}</p>;
}
