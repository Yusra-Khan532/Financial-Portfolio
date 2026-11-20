// Task #228 (18 Nov 2026, the team's picture of the company page's FinLit Prism block): "give a AI summary button for this just below it".
// Team note, 19 Nov 2026: "it is just showing numbers, i dont want it to show numbrrs but meaning of it; also give limit for this AI summarize limit
// to 10 keeping it seperate from chatbot question limit".
// The button sits under the two cards (Fundamental analysis and Technical analysis). A Silver or Gold member gets FinLit AI's summary of what the
// card means, in words (the server writes what is asked: backend ask/service.summary_question), streamed in place, using one of the month's
// 10 AI summaries, counted apart from the FinLit AI questions. Anyone else, or when written answers are off or the summaries are used, gets an
// instant summary of what the card means, written from the card itself, said plainly as such. Neither repeats the scores: they are on the card.
// Describes; never advises: the AI's own checks apply, and the card summary only puts the card into words.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { AskRefused, askSummary, type AskQuota } from "../lib/askAi";
import { apiGet } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Icon } from "../lib/icons";
import { trendBand, verdictView, type TechAssessment, type TrendBand } from "../lib/prismTechnical";
import { AnswerText } from "../components/AnswerText";
import { partWord, type CardPart } from "./prismCardLogic";
import { type PrismLatest } from "./PrismCard";

const DISCLAIMER = "Describes the company's financial health from its filings and prices; not a recommendation. Information only, not investment advice.";

type Tone = "good" | "mixed" | "weak";
const toneOf = (v: number): Tone => { const t = partWord(v)[1]; return t === "strong" || t === "healthy" ? "good" : t === "mixed" ? "mixed" : "weak"; };
/** What each band of each part means, in the words of what the model measures (prismCardLogic PART_LINE). A higher Risk score means lower risk. */
const MEANING: Record<string, Record<Tone, string>> = {
  fundamental: { good: "sales and profit have grown steadily, with sound margins", mixed: "sales and profit growth and margins are middling",
    weak: "sales and profit growth has been slow or uneven, or margins are thin" },
  valuation: { good: "the share price looks modest against its earnings and its own history", mixed: "the share price is roughly in line with its earnings and its own history",
    weak: "the share price looks high against its earnings and its own history" },
  quality: { good: "borrowing is under control, interest is well covered and profits are backed by cash", mixed: "borrowing, interest cover, returns and cash backing are middling",
    weak: "borrowing is heavy, interest cover or returns are thin, or profits are not well backed by cash" },
  risk: { good: "the share price has moved calmly, with smaller falls, ample trading and few pledged shares", mixed: "price swings, falls and trading activity are moderate",
    weak: "the share price swings widely or has fallen sharply, trading is thin or shares are pledged" },
};
/** The overall reading: its key word (bold on the page) and what it means. */
const OVERALL: Record<string, [string, string]> = {
  STRONG: ["strong", "most of what FinLit Prism measures is sound"],
  HEALTHY: ["healthy", "more of what FinLit Prism measures is sound than weighs on it"],
  AVERAGE: ["mixed", "some parts are sound while others weigh on it"],
  WEAK: ["weak", "more of what FinLit Prism measures weighs on it than is sound"],
  POOR: ["poor", "most of what FinLit Prism measures weighs on it"],
};
const TONE_WORD: Record<Tone, string> = { good: "sound", mixed: "in between", weak: "weighs on it" };
const SHORT: Record<TrendBand, string> = { positive: "the price has been rising over the last few weeks", neutral: "the price has moved sideways over the last few weeks",
  negative: "the price has been falling over the last few weeks" };
const LONG: Record<TrendBand, string> = { positive: "the longer trend over months is up", neutral: "the longer trend over months is flat", negative: "the longer trend over months is down" };
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** One pointer: a bold label, the text, and the key words inside it to bold too. */
export type Pointer = { head: string; text: string; key?: string };
/** What the card means, as short pointers from the card itself (no model) and without its numbers (they are on the card). Task #228 rework 2 (the
 *  team, 20 Nov 2026): "make it in pointers its too big of a paragaph and highlight keywords". The overall reading, then one pointer for each part
 *  (strongest first) labelled with what it is, then the price trends. Exported for the tests. */
export function cardSummary(name: string, r: PrismLatest["rating"], parts: CardPart[], a: TechAssessment | null): Pointer[] {
  const out: Pointer[] = [];
  const o = OVERALL[r.label];
  if (r.status === "NOT RATED" || r.final == null || !o) out.push({ head: "Overall", text: `${name} has no overall FinLit Prism rating at the moment: too little of the data it needs is available.` });
  else out.push({ head: "Overall", text: `${name}'s business and finances read as ${o[0]}: ${o[1]}.${r.status === "PROVISIONAL" ? " A first view: some of the data it needs is missing." : ""}`, key: `read as ${o[0]}` });
  const four = parts.filter((p) => p.key !== "technical" && MEANING[p.key] && p.value != null) as (CardPart & { value: number })[];
  const rank: Record<Tone, number> = { good: 0, mixed: 1, weak: 2 };
  for (const p of [...four].sort((x, y) => rank[toneOf(x.value)] - rank[toneOf(y.value)])) {
    const t = toneOf(p.value);
    out.push({ head: `${p.name}, ${TONE_WORD[t]}`, text: cap(MEANING[p.key][t]) + "." });
  }
  const none = parts.filter((p) => p.key !== "technical" && MEANING[p.key] && p.value == null).map((p) => p.name);
  if (none.length && r.status !== "NOT RATED") out.push({ head: "Not enough data yet", text: `${none.join(", ")}.` });
  if (a) {
    const st = trendBand(a.shortTerm.score), lt = trendBand(a.longTerm.score);
    if (st && lt) {
      const v = verdictView(a);
      out.push({ head: "Price trend", text: `${cap(SHORT[st])}, ${st === lt ? "and" : "while"} ${LONG[lt]}${v.tone !== "na" ? ` (${v.word.toLowerCase()})` : ""}.`, key: v.tone !== "na" ? v.word.toLowerCase() : undefined });
    } else if (st || lt) out.push({ head: "Price trend", text: `${st ? cap(SHORT[st]) : "The short-term view is not available"}; ${lt ? LONG[lt] : "the long-term view is not available"}.` });
  }
  return out;
}

/** A pointer drawn: its label in bold, then the text with its key words in bold. */
function PointerText({ p }: { p: Pointer }) {
  const i = p.key ? p.text.indexOf(p.key) : -1;
  return <li><b>{p.head}:</b> {i < 0 ? p.text : <>{p.text.slice(0, i)}<b>{p.key}</b>{p.text.slice(i + (p.key as string).length)}</>}</li>;
}

/** The session, or null where the page is drawn without the sign-in context (a preview, the card's own tests): then it acts as for a visitor. */
function useViewer(): ReturnType<typeof useAuth> | null {
  try { return useAuth(); } catch { return null; }
}

type State = { kind: "idle" } | { kind: "ai"; text: string; status: string | null; done: boolean; error: string | null } | { kind: "card"; note: string };

const renews = (iso: string) => { const d = new Date(`${iso}T00:00:00`); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };

export function PrismAiSummary({ symbol, name, r, parts, a }: { symbol: string; name: string; r: PrismLatest["rating"]; parts: CardPart[]; a: TechAssessment | null }) {
  const auth = useViewer(), user = auth?.user ?? null, plan = auth?.plan ?? "basic";
  // the same query (and cache key) as lib/askAi useAskQuota, read only for a signed-in member
  const quota = useQuery<AskQuota>({ queryKey: ["ask-quota", user?.id ?? null], queryFn: () => apiGet<AskQuota>("/api/ask/quota"), enabled: !!user, staleTime: 60_000, retry: false });
  const [state, setState] = useState<State>({ kind: "idle" });
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);
  const q = quota.data;
  const paid = user?.role === "admin" || plan === "silver" || plan === "gold";
  const sq = q?.summary;   // the AI summaries of the month (10), apart from the questions
  const canAi = !!user && paid && !!q?.enabled && (sq?.left ?? 0) > 0;

  const fallback = (why: string) => setState({ kind: "card", note: why });
  const run = async () => {
    if (!canAi) {
      fallback(!q?.enabled && user && paid ? "FinLit AI's written answers are not switched on right now, so this summary is written from the card itself."
        : user && paid ? `You have used this month's ${sq?.limit ?? 10} AI summaries${sq?.resets ? ` (they renew on ${renews(sq.resets)})` : ""}, so this summary is written from the card itself. Your FinLit AI questions are counted separately.`
          : "This summary is written from the card itself. An AI summary from FinLit AI (10 a month) is part of the Silver and Gold plans.");
      return;
    }
    ctl.current?.abort();
    const c = new AbortController(); ctl.current = c;
    setState({ kind: "ai", text: "", status: "Reading the FinLit Prism card", done: false, error: null });
    try {
      await askSummary(symbol, (e) => {
        if (e.type === "status") setState((s) => (s.kind === "ai" ? { ...s, status: e.text } : s));
        else if (e.type === "text") setState((s) => (s.kind === "ai" ? { ...s, text: s.text + e.text, status: null } : s));
        else if (e.type === "replace") setState((s) => (s.kind === "ai" ? { ...s, text: e.text } : s));
        else if (e.type === "done") setState((s) => (s.kind === "ai" ? { ...s, status: null, done: true } : s));
        else if (e.type === "error") setState((s) => (s.kind === "ai" ? { ...s, status: null, done: true, error: e.text } : s));
      }, c.signal);
      void quota.refetch();
    } catch (err) {
      if (c.signal.aborted) return;
      fallback(err instanceof AskRefused ? `${err.message} Meanwhile, this summary is written from the card itself.` : "FinLit AI could not be reached just now, so this summary is written from the card itself.");
    }
  };

  const left = canAi && sq ? ` · ${sq.left} of ${sq.limit} AI summaries left this month, apart from your FinLit AI questions` : "";
  return (
    <div className="pai" aria-live="polite">
      <p className="pai-row">
        <button type="button" className="btn pai-btn" onClick={() => void run()} disabled={state.kind === "ai" && !state.done} aria-expanded={state.kind !== "idle"}>
          <Icon name="spark" />{state.kind === "ai" && !state.done ? "Writing the summary…" : state.kind === "idle" ? "AI summary" : "Summarise again"}
        </button>
        <small className="pai-hint">{canAi ? `What this card means, in a few lines from FinLit AI${left}` : "What this card means, in a few lines"}</small>
      </p>
      {state.kind === "ai" && (
        <div className="pai-box" role="region" aria-label={`AI summary of the FinLit Prism rating of ${name}`}>
          {state.status && <p className="pai-status" aria-busy="true">{state.status}…</p>}
          {state.text && <AnswerText text={state.text} />}
          {state.error && <p className="pai-err" role="alert">{state.error}</p>}
          {state.done && !state.error && <p className="pai-disc">{DISCLAIMER}</p>}
        </div>
      )}
      {state.kind === "card" && (
        <div className="pai-box" role="region" aria-label={`Summary of the FinLit Prism rating of ${name}`}>
          <ul className="pai-list">{cardSummary(name, r, parts, a).map((p) => <PointerText key={p.head} p={p} />)}</ul>
          <p className="pai-note"><Icon name="info" /> {state.note}{!user || !paid ? <> <Link to="/plans">Compare plans</Link></> : null}</p>
          <p className="pai-disc">{DISCLAIMER}</p>
        </div>
      )}
    </div>
  );
}
