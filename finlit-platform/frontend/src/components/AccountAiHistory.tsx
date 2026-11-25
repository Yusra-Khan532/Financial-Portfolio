// Task #349 PR 2: Account > FinLit AI: the "FinLit AI history" section. Remember my questions (prefs.aiMemory, saved with the account), how many are
// kept, and "Clear my AI history" with a confirm step. Questions are kept only for Silver and Gold, where written answers exist.
import { useEffect, useState } from "react";
import { Button, Card, H2 } from "./ui";
import { prefs, usePrefs } from "../lib/prefs";
import { clearAskHistory, loadAskHistory, memoryApplies, RETENTION_DAYS } from "../lib/askMemory";
import { useAuth } from "../lib/auth";
import { loadRecent } from "../lib/askExplorer";
import { onDevice } from "./AskHistory";
import "../styles/ask-memory.css";

export function AccountAiHistory() {
  const p = usePrefs();
  const { user, plan } = useAuth();
  const kept = memoryApplies(!!user, plan);
  const [count, setCount] = useState<number | null>(null);
  const [device, setDevice] = useState(0);                 // task #349 fix E: questions kept in this browser only, shown in Chat History too
  const [readErr, setReadErr] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!user) return;
    let live = true;
    loadAskHistory(200).then((d) => { if (live) { setCount(d.count); setDevice(onDevice(loadRecent(), d.items).length); } }).catch(() => { if (live) setReadErr(true); });
    return () => { live = false; };
  }, [user]);
  const clear = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await clearAskHistory();
      setCount(0); setConfirm(false);
      setMsg({ ok: true, text: r.deleted === 1 ? "1 question was deleted." : `${r.deleted} questions were deleted.` });
    } catch {
      setMsg({ ok: false, text: "Your FinLit AI history could not be cleared just now. Please try again." });
    } finally { setBusy(false); }
  };
  return (
    <Card as="section" className="aim-acct" aria-labelledby="aim-acct-h">
      <H2 id="aim-acct-h">FinLit AI history</H2>
      <p className="muted">FinLit AI keeps the questions you ask, with the key lines of each answer and the figures it read, for {RETENTION_DAYS} days
        (at most 200), so it can tell you what changed since you last asked. Only you can see them.{kept ? "" : " They are kept only on the Silver and Gold plans, where FinLit AI writes answers."}</p>
      <label className="sw"><input type="checkbox" checked={p.aiMemory} onChange={(e) => prefs.set({ aiMemory: e.target.checked })} /><span aria-hidden="true" /><b>Remember my FinLit AI questions</b></label>
      {!p.aiMemory && <p className="muted">Switched off: new questions are not kept. The ones already kept stay until you clear them or they are {RETENTION_DAYS} days old.</p>}
      <p className="aim-count" role="status">{readErr ? "The number of kept questions could not be read just now." : count === null ? "Counting your kept questions…"
        : count === 1 ? "1 question is kept." : `${count} questions are kept.`}{device > 0 && !readErr && count !== null ? ` ${device === 1 ? "1 earlier question is" : `${device} earlier questions are`} also kept in this browser only; Chat History shows them under "On this device".` : ""}</p>
      {!confirm ? <div className="aim-row"><Button onClick={() => { setMsg(null); setConfirm(true); }} disabled={!count}>Clear my AI history</Button></div> : (
        <div className="aim-confirm" role="group" aria-label="Confirm clearing your FinLit AI history">
          <p>Delete all {count} kept question{count === 1 ? "" : "s"}? This cannot be undone.</p>
          <div className="aim-row"><Button variant="primary" onClick={() => void clear()} disabled={busy}>Yes, clear my AI history</Button>
            <Button onClick={() => setConfirm(false)} disabled={busy}>Keep them</Button></div>
        </div>)}
      {msg && <p className={msg.ok ? "formok" : "formerr"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
    </Card>
  );
}
