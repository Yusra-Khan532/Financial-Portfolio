// Task #349 PR 2: the Chat History view of the FinLit AI panel, and the one-line notice under its input.
// A signed-in Silver or Gold member sees the questions FinLit AI keeps on the server (date, subject, question; tap to ask again; delete one).
// Visitors and Basic members keep the list held in this browser only (askExplorer.loadRecent), exactly as before.
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Icon } from "../lib/icons";
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
      : <p className="aif-none">No questions kept yet. Your written answers from FinLit AI appear here.</p>}
  </>;
}

/** The line under the input for a signed-in Silver or Gold member (memoryApplies), while remembering is on (prefs.aiMemory). */
export function AskMemoryNotice({ onLeave }: { onLeave?: () => void }) {
  if (!usePrefs().aiMemory) return null;
  const [text, link] = MEMORY_NOTICE.split("Manage in Account.");
  return <p className="aim-note">{text}<Link to={ACCOUNT_AI_PATH} onClick={onLeave}>Manage in Account.</Link>{link}</p>;
}
