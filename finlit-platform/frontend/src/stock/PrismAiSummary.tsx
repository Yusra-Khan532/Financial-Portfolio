// Task #228 (18 Nov 2026, the team's picture of the company page's FinLit Prism block): "give a AI summary button for this just below it".
// Team note, 19 Nov 2026: "it is just showing numbers, i dont want it to show numbrrs but meaning of it; also give limit for this AI summarize limit
// to 10 keeping it seperate from chatbot question limit".
// The button sits under the two cards (Fundamental analysis and Technical analysis). A Silver or Gold member gets FinLit AI's summary of what the
// card means, in words (the server writes what is asked: backend ask/service.summary_question), streamed in place, using one of the month's
// 10 AI summaries, counted apart from the FinLit AI questions. Anyone else, or when written answers are off or the summaries are used, gets an
// instant summary of what the card means, written from the card itself, said plainly as such. Task #382: both keep every figure and say what it
// means, read off the method's own bands and words (stock/prismMeaning; the server's copy is ask/prism_meaning).
// Task #404 (the team, 26 Nov 2026): "just need a 3-4 lines stance like inference of finlit prism or conclusion ... just dont put up the score":
// FinLit AI's summary is now the conclusion the card leads to, in 3 to 4 sentences with no score or band word (the server asks and checks it,
// ask/service.summary_question and stance_problems; a first draft that restates the card is rewritten and replaces it here). The card's own
// summary below (cardSummary, for visitors and when the AI summaries are used) still lists every figure with its meaning.
// Describes; never advises: the AI's own checks apply, and the card summary only puts the card into words.
import { AiFeedback } from "../components/AiFeedback";   // task #366
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { AskRefused, askSummary, type AskQuota } from "../lib/askAi";
import { apiGet } from "../lib/api";
import { Icon } from "../lib/icons";
import { useAuth } from "../lib/auth";
import { type TechAssessment, type TechHorizon, type TrendTone } from "../lib/prismTechnical";
import { LABEL_WORD } from "../lib/prism";
import { AnswerText } from "../components/AnswerText";
import { partWord, type CardPart } from "./prismCardLogic";
import { type PrismLatest, type PrismReviewItem } from "./PrismCard";
import { figure, OVERALL, OVERALL_DETAIL, PARTS, partDetail, trendAlignment, trendDetail, trendMeaning, type Tone } from "./prismMeaning";

const DISCLAIMER = "Describes the company's financial health from its filings and prices; not a recommendation. Information only, not investment advice.";

const toneOf = (v: number): Tone => { const t = partWord(v)[1]; return t === "strong" || t === "healthy" ? "good" : t === "mixed" ? "mixed" : "weak"; };
const trendTone = (t: TrendTone): Tone => (t === "strongpos" || t === "pos" ? "good" : t === "neutral" ? "mixed" : "weak");
const TONE_OF_VERDICT: Record<string, Tone> = { pos: "good", mixed: "mixed", neg: "weak" };
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const FLAG = "Cannot be interpreted";

/** One pointer: a bold label, the figure as the card states it and its band (task #382), the one-line meaning with its key words in bold, the
 *  method's main reason where the report gives one, and the detail behind its (i). `group` keeps the business apart from the share price. */
export type Pointer = { head: string; text: string; key?: string; fig?: string; band?: string; tone?: Tone | "na"; reason?: string; more?: string;
  group?: "score" | "price" };

/** The method's own reason for a part, from its first pro (a sound part) or con (a part that weighs on it). A streak reads as growth quarters out of
 *  the quarters judged, each against the same quarter a year before (site-api premium_engine.streak). */
export function reasonOf(item: PrismReviewItem | undefined): string | undefined {
  if (!item?.label) return undefined;
  const m = /(\d+) growth quarters? across (\d+) comparable quarters?/.exec(item.summary || "");
  if (m) return `${item.label}: growth in ${m[1]} of ${m[2]} quarters judged, each against the same quarter a year before${/Loss-making/.test(item.summary) ? "; loss-making quarters do not count" : ""}.`;
  const first = (item.summary || "").split(/(?<=\.)\s/)[0];
  return `${item.label}${item.valueText && !/^Not /.test(item.valueText) ? ` (${item.valueText})` : ""}: ${first}`.trim();
}

/** What the card means, as short pointers from the card itself (no model). Task #228 rework 2 (the team, 20 Nov 2026): pointers with key words in
 *  bold. Task #382 (the team, 24 Nov 2026): every figure is kept, prominent, with its band, a one-line meaning and why it matters (its (i)), all
 *  read off the method's own bands and words (stock/prismMeaning); a figure without a score is flagged, never guessed. The overall reading, then
 *  each part (strongest first), then the share price trends, kept apart from the business. Exported for the tests. */
export function cardSummary(name: string, r: PrismLatest["rating"], parts: CardPart[], a: TechAssessment | null, review?: PrismLatest["review"]): Pointer[] {
  const out: Pointer[] = [];
  const o = OVERALL[r.label];
  if (r.status === "NOT RATED" || r.final == null || !o) out.push({ head: "Overall", band: FLAG, tone: "na", group: "score", text: `${name} has no overall FinLit Prism rating at the moment: too little of the data it needs is available.` });
  else out.push({ head: "Overall", fig: figure(r.final), band: `${LABEL_WORD[r.label]} · ${r.status === "PROVISIONAL" ? "Provisional" : "Rated"}`,
    tone: toneOf(r.final), group: "score", more: OVERALL_DETAIL,
    text: `${name}'s business and finances read as ${o[0]}: ${o[1]}.${r.status === "PROVISIONAL" ? " A first view: some of the data it needs is missing." : ""}`, key: `read as ${o[0]}` });
  const four = parts.filter((p) => p.key !== "technical" && PARTS[p.key] && p.value != null) as (CardPart & { value: number })[];
  const rank: Record<Tone, number> = { good: 0, mixed: 1, weak: 2 };
  const rv = (key: string, t: Tone) => { const part = review?.parts?.find((x) => x.key === key); return t === "mixed" ? undefined : reasonOf((t === "good" ? part?.pros : part?.cons)?.[0]); };
  for (const p of [...four].sort((x, y) => rank[toneOf(x.value)] - rank[toneOf(y.value)])) {
    const t = toneOf(p.value);
    out.push({ head: p.name, fig: figure(p.value), band: partWord(p.value)[0], tone: t, group: "score", text: cap(PARTS[p.key][t]) + ".", reason: rv(p.key, t),
      more: partDetail(p.key) ?? undefined });
  }
  if (r.status !== "NOT RATED")
    for (const p of parts.filter((p) => p.key !== "technical" && PARTS[p.key] && p.value == null))
      out.push({ head: p.name, band: FLAG, tone: "na", group: "score", text: "No score yet: too little data for this part, so it is not read here.", more: partDetail(p.key) ?? undefined });
  if (a) {
    const span = (h: TechHorizon, fallback: string) => (h?.horizon ? `the last ${h.horizon.replace(/sessions?/, "trading sessions")}` : fallback);
    for (const [h, head, fb] of [[a.shortTerm, "Short-term trend", "the last 5–20 trading sessions"], [a.longTerm, "Long-term trend", "the last 6–18 months"]] as const) {
      const m = trendMeaning(h);
      out.push(m && h.score != null
        ? { head, fig: figure(h.score, true), band: m.word, tone: trendTone(m.tone), group: "price", text: `${m.text}, over ${span(h, fb)}.`, more: trendDetail(span(h, fb)) }
        : { head, band: FLAG, tone: "na", group: "price", text: "No score: a required price signal is missing." });
    }
    const al = trendAlignment(a.shortTerm?.score, a.longTerm?.score);
    out.push(al ? { head: "Alignment", band: al.label, tone: TONE_OF_VERDICT[al.tone] ?? "mixed", group: "price", text: `${al.text}.`,
      more: "The short-term and the long-term trend read together. It describes the share price, not the business." }
      : { head: "Alignment", band: FLAG, tone: "na", group: "price", text: "It needs both trend scores." });
  }
  return out;
}

/** A pointer drawn (task #382): the label and the figure in bold, the band beside them, the one-line meaning below, the method's reason, and an (i)
 *  that opens the detail in place (a tap on a phone, a click or Enter with a keyboard). */
function PointerText({ p }: { p: Pointer }) {
  const [open, setOpen] = useState(false);
  const i = p.key ? p.text.indexOf(p.key) : -1;
  return (
    <li className="pai2-p" data-tone={p.tone}>
      <span className="pai2-h"><b>{p.head}{p.fig ? <> <span className="pai2-num">{p.fig}</span></> : null}</b>
        <span className="pai2-bi">{p.band ? <span className="pai2-band">{p.band}</span> : null}
        {p.more ? <button type="button" className="pai2-i" aria-expanded={open} aria-label={`What ${p.head} means`} onClick={() => setOpen((x) => !x)}>i</button> : null}</span></span>
      <span className="pai2-m">{i < 0 ? p.text : <>{p.text.slice(0, i)}<b>{p.key}</b>{p.text.slice(i + (p.key as string).length)}</>}</span>
      {p.reason ? <span className="pai2-r">Main reason: {p.reason}</span> : null}
      {open && p.more ? <span className="pai2-more">{p.more}</span> : null}
    </li>);
}

/** The pointers in two lists, so the business is never read as the share price (task #382 rule 5). */
function Pointers({ ps }: { ps: Pointer[] }) {
  const score = ps.filter((p) => p.group !== "price"), price = ps.filter((p) => p.group === "price");
  return <>
    <p className="pai2-g">Business and finances: the FinLit Prism score</p>
    <ul className="pai2-list">{score.map((p) => <PointerText key={p.head} p={p} />)}</ul>
    {price.length ? <><p className="pai2-g">Share price trend: the price, not the business</p>
      <ul className="pai2-list">{price.map((p) => <PointerText key={p.head} p={p} />)}</ul></> : null}
  </>;
}

/** The session, or null where the page is drawn without the sign-in context (a preview, the card's own tests): then it acts as for a visitor. */
function useViewer(): ReturnType<typeof useAuth> | null {
  try { return useAuth(); } catch { return null; }
}

/** Task #312 (developer file 20, change 3): the states of the bar. "writing" streams in; "done" only when text arrived and the server said done;
 *  "empty" is every failure (no text, the stream cut, too slow, an error), shown with the reason and the card's own summary; "card" is the card's own
 *  summary for a visitor, a Basic member, or when the summaries are used or switched off. */
type State = { kind: "idle" } | { kind: "writing"; text: string; status: string | null } | { kind: "done"; text: string; at: Date; cached: boolean }
  | { kind: "empty"; reason: string } | { kind: "card"; note: string };

/** No event for 30 s (the server sends a keep-alive every 10 s), or 90 s in all: the summary is given up and said so. */
export const QUIET_MS = 30_000, TOTAL_MS = 90_000;

const renews = (iso: string) => { const d = new Date(`${iso}T00:00:00`); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };
const dayOf = (iso?: string | null) => { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };
const stamp = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Read the summary's stream safely (the pack's reference/ai-summary-stream.ts): a stream that ends without "done", a "done" with no text, an "error"
 *  or silence all end in "empty" with a plain reason, never a box stuck on "Writing the summary…". The server gives back the summary in every one of
 *  these cases, so "not counted" is true. Exported for the tests. */
export async function runSummary(symbol: string, set: (s: State) => void, outer: AbortSignal,
  ask: typeof askSummary = askSummary, ms = { quiet: QUIET_MS, total: TOTAL_MS }): Promise<void> {
  const ctl = new AbortController();
  const stop = () => ctl.abort();
  outer.addEventListener("abort", stop, { once: true });
  let text = "", finished = false, cached = false, quiet: ReturnType<typeof setTimeout> | undefined;
  const total = setTimeout(stop, ms.total);
  const poke = () => { clearTimeout(quiet); quiet = setTimeout(stop, ms.quiet); };
  const fail = (reason: string) => { finished = true; set({ kind: "empty", reason }); };
  set({ kind: "writing", text: "", status: "Reading the card" });
  poke();
  try {
    await ask(symbol, (e) => {
      poke();
      if (finished) return;
      if (e.type === "meta") cached = !!(e as { cached?: boolean }).cached;
      else if (e.type === "status") set({ kind: "writing", text, status: e.text });
      else if (e.type === "text") { text += e.text; set({ kind: "writing", text, status: null }); }
      else if (e.type === "replace") { text = e.text; set({ kind: "writing", text, status: null }); }
      else if (e.type === "error") fail(`${e.text || "FinLit AI could not finish this summary."} It was not counted.`);
      else if (e.type === "done") {
        if (!text.trim()) fail("FinLit AI sent back no text, so this was not counted.");
        else { finished = true; set({ kind: "done", text, at: new Date(), cached }); }
      }
    }, ctl.signal);
    if (!finished) fail(text.trim() ? "The summary stopped before it was finished, so it was not counted." : "FinLit AI did not answer, so this was not counted.");
  } catch (err) {
    if (outer.aborted) { set({ kind: "idle" }); return; }               // Stop, or the page was left
    if (err instanceof AskRefused) fail(/updat/i.test(err.message) || (err.status === 503 && /updat/i.test(err.code))
      ? "FinLit is being updated. Try again in a minute; this was not counted." : `${err.message}`);
    else fail(ctl.signal.aborted ? "FinLit AI took too long, so this was not counted." : "FinLit AI could not be reached just now, so this was not counted.");
  } finally {
    clearTimeout(quiet); clearTimeout(total);
    outer.removeEventListener("abort", stop);
  }
}

/** Task #312 change 3: the AI summary as the first thing in the FinLit Prism card: one bar ("AI summary of this card · A few lines from FinLit AI ·
 *  9 of 10 left this month" and Summarise); while writing, three dots, the status and Stop; the text opens under the bar, before the panels it
 *  summarises; done: the bullets, who wrote it from what and when, and Hide; a failure says why, that it was not counted, and gives the card's own
 *  summary. `scoredAt`: the date of the card's scores. */
export function PrismAiSummary({ symbol, name, r, parts, a, scoredAt, review }: { symbol: string; name: string; r: PrismLatest["rating"]; parts: CardPart[]; a: TechAssessment | null; scoredAt?: string | null; review?: PrismLatest["review"] }) {
  const auth = useViewer(), user = auth?.user ?? null, plan = auth?.plan ?? "basic";
  // the same query (and cache key) as lib/askAi useAskQuota, read only for a signed-in member
  const quota = useQuery<AskQuota>({ queryKey: ["ask-quota", user?.id ?? null], queryFn: () => apiGet<AskQuota>("/api/ask/quota"), enabled: !!user, staleTime: 60_000, retry: false });
  const [state, setState] = useState<State>({ kind: "idle" });
  const [hidden, setHidden] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);
  const q = quota.data;
  const paid = user?.role === "admin" || plan === "silver" || plan === "gold";
  const sq = q?.summary;   // the AI summaries of the month (10), apart from the questions
  const canAi = !!user && paid && !!q?.enabled && (sq?.left ?? 0) > 0;
  const day = dayOf(scoredAt);

  const run = async () => {
    setHidden(false);
    if (!canAi) {
      setState({ kind: "card", note: !q?.enabled && user && paid ? "FinLit AI's written answers are not switched on right now, so this summary is written from the card itself."
        : user && paid ? `You have used this month's ${sq?.limit ?? 10} AI summaries${sq?.resets ? ` (they renew on ${renews(sq.resets)})` : ""}, so this summary is written from the card itself. Your FinLit AI questions are counted separately.`
          : "This summary is written from the card itself. An AI summary from FinLit AI (10 a month) is part of the Silver and Gold plans." });
      return;
    }
    ctl.current?.abort();
    const c = new AbortController(); ctl.current = c;
    await runSummary(symbol, setState, c.signal);
    void quota.refetch();
  };
  const writing = state.kind === "writing";
  const left = canAi && sq ? ` · ${sq.left} of ${sq.limit} left this month` : "";
  const own = (note: string, warn: boolean) => (
    <>
      <p className={warn ? "pai2-msg" : "pai2-note"} role={warn ? "alert" : undefined}>{note}{!warn && (!user || !paid) ? <> <Link to="/plans">Compare plans</Link></> : null}</p>
      <Pointers ps={cardSummary(name, r, parts, a, review)} />
      <p className="pai2-meta"><span>The card's own summary{day ? `, from its scores of ${day}` : ""} · {DISCLAIMER}</span>
        <button type="button" className="pai2-x" onClick={() => setHidden(true)}>Hide</button></p>
    </>);
  return (
    <div className="pai2" data-state={state.kind} aria-live="polite">
      <div className="pai2-bar">
        <span className="pai2-ic"><Icon name="spark" /></span>
        <div className="pai2-t">
          <b>AI summary of this card</b>
          {writing ? <small className="pai2-st" role="status"><i aria-hidden="true" className="pai2-dots"><i /><i /><i /></i>{state.status ? `${state.status}…` : "Writing…"}</small>
            : <small>{canAi ? `A few lines from FinLit AI${left}` : user && paid ? "What this card means, in a few lines" : "What this card means, in a few lines · FinLit AI summaries are part of Silver and Gold"}</small>}
        </div>
        {writing ? <button type="button" className="btn pai2-stop" onClick={() => ctl.current?.abort()}>Stop</button>
          : <button type="button" className="btn pai2-btn" onClick={() => void run()} aria-expanded={state.kind !== "idle" && !hidden}>
            {state.kind === "done" || state.kind === "empty" ? "Summarise again" : "Summarise"}</button>}
      </div>
      {!hidden && state.kind !== "idle" && (
        <div className="pai2-out" role="region" aria-label={`AI summary of the FinLit Prism rating of ${name}`}>
          {state.kind === "writing" && (state.text ? <AnswerText text={state.text} plain /> : null)}
          {state.kind === "done" && <>
            <AnswerText text={state.text} plain />
            <p className="pai2-meta"><span>Written by FinLit AI from this card{day ? ` (scores of ${day})` : ""} · {stamp(state.at)}{state.cached ? " · written earlier today, opened free" : ""} · {DISCLAIMER}</span>
              <button type="button" className="pai2-x" onClick={() => setHidden(true)}>Hide</button></p>
            <AiFeedback surface="prism_summary" refKey={`${symbol}|${scoredAt?.slice(0, 10) || "-"}`} text={state.text} label="this summary" /></>}
          {state.kind === "empty" && own(state.reason, true)}
          {state.kind === "card" && own(state.note, false)}
        </div>)}
    </div>
  );
}
