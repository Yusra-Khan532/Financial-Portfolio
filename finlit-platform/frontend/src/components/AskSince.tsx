// Task #349 PR 3: "Since you last asked". When a member asks the same or a similar question again after a while (1 hour to 30 days), FinLit AI
// leads with what changed. This card, above the answer, shows when it was asked, one row per change (each with its dates, worked out by the
// server without a model), the filings since then as links to FinLit's own pages, what was said then (folded), and "Full answer", which asks
// the question again without the comparison. Shared ui pieces and tokens only (styles/ask-since.css, scoped ais- classes).
import { useState } from "react";
import { Link } from "react-router";
import type { AskSinceData } from "../lib/askAi";
import { Button, Card } from "./ui";
import "../styles/ask-since.css";

const IST = "Asia/Kolkata";
/** "20 Nov 2026, 3:52 pm" in India time. */
export function sinceWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: IST });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST }).toLowerCase();
  return `${day}, ${time}`;
}
/** "22 Nov 2026" from "2026-11-22" (a day, no time zone shift). */
const dayOf = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

type Props = { data: AskSinceData; onFull?: () => void; busy?: boolean; onLeave?: () => void };

export function AskSince({ data, onFull, busy, onLeave }: Props) {
  const [open, setOpen] = useState(false);
  const when = sinceWhen(data.askedAt);
  return (
    <Card as="section" size="sm" className="ais" aria-label={`Since you last asked, ${when}`}>
      <h3 className="ais-h">Since you last asked · {when}</h3>
      {data.question && <p className="ais-q">You asked: “{data.question}”{data.match === "weak" ? " (a related question)" : ""}</p>}
      {data.changes.length > 0 && <ul className="ais-rows" aria-label="What changed">{data.changes.map((c) => <li key={c}>{c}</li>)}</ul>}
      {data.newItems.length > 0 && <>
        <p className="ais-l">New filings since then</p>
        <ul className="ais-rows ais-new" aria-label="New filings since then">{data.newItems.map((i) => (
          <li key={i.to + i.title}><Link to={i.to} onClick={onLeave}>{i.title}</Link> <span className="ais-d">{dayOf(i.date)}</span></li>))}</ul>
      </>}
      <div className="ais-acts">
        {data.said.length > 0 && <Button size="sm" variant="quiet" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Hide what I said then" : "What I said then"}</Button>}
        {onFull && <Button size="sm" onClick={onFull} disabled={busy}>Full answer</Button>}
      </div>
      {open && data.said.length > 0 && <ul className="ais-rows ais-said" aria-label="What FinLit AI said then">{data.said.map((s) => <li key={s}>{s}</li>)}</ul>}
    </Card>
  );
}
