// Trading Lab > Order Flow > Signals desk: the answer of /api/lab/signals/{symbol} (backend finlit/lab/signals.py), the streamed run and the words
// around it. The ONE place of the site that shows Buy-to-Sell ratings, a trader's plan and trade sizes: only for members whose Lab grant has the
// signals switch an administrator turned on (founder, 25 Nov 2026). Every other page keeps describe-only wording.
import { API_BASE, ApiError, apiGet, apiUrl, csrfToken, errorBody } from "./api";
import { viewAsHeader } from "./adminView";
import type { CaseFact, CaseSentence } from "./labCase";

export type Rating = "Buy" | "Overweight" | "Hold" | "Underweight" | "Sell";
export type StepId = "analysts" | "debate" | "rating" | "plan" | "sizes";
export type StepStatus = "waiting" | "running" | "done" | "failed" | "capped" | "skipped" | "not_run";
export type DeskNote = { id: "technical" | "fundamentals" | "news" | "flow"; title: string; sentences: CaseSentence[]; written: boolean };
export type DeskRound = { round: number; bull: CaseSentence[]; bear: CaseSentence[]; tries?: number };
export type DeskRating = { value: Rating; scale: Rating[]; step: number; reasons: CaseSentence[] };
export type DeskTarget = { price: number; basis: string; rr: number };
export type DeskPlan = {
  rating: Rating; side: "long" | "short" | "none"; last: number; atr: number; timeFrame: string; watch: { support: number | null; resistance: number | null };
  entryLow: number | null; entryHigh: number | null; mid?: number; stop: number | null; stopBasis?: string; targets: DeskTarget[];
  riskPerShare: number | null; riskPct: number | null; reason: "hold" | "no_short" | null; note?: string; sources: number[]; sentences: CaseSentence[];
};
export type DeskSize = { id: "cautious" | "balanced" | "aggressive"; title: string; riskPct: number; riskAim: number; positionPct: number; capPct: number; capped: boolean; stopPct: number; source: number; sentences: CaseSentence[] };
export type DeskStep = { id: StepId; title: string; status: StepStatus; note?: string; notes?: DeskNote[]; rounds?: DeskRound[]; tries?: number; calls?: number; tokens?: number };
export type DeskCaps = { maxCalls: number; calls: number; tokenBudget: number; tokens: number; inputTokens: number; outputTokens: number; maxTokensPerCall: number; rounds: number; maxRounds: number };
export type DeskLimit = { limit: number; used: number; left: number; resets: string };
export type DeskPrice = { d: string; h: number | null; l: number | null; c: number };
export type LabSignals = {
  status: string; symbol: string; name: string; method: string; label: string; disclaimer: string;
  outcome: "done" | "stopped" | "none" | "too_few"; steps: DeskStep[]; rating: DeskRating | null; plan: DeskPlan | null; sizes: DeskSize[];
  sources: CaseFact[]; prices: DeskPrice[]; generatedAt: string | null; cached: boolean;
  inputs: { statement: string; filingDate: string | null; priceDate: string | null; newsDate: string | null; news: boolean; fno: boolean; candles: string };
  caps: DeskCaps; limit: DeskLimit; enabled: boolean; message?: string;
};
export type DeskEvent = { type: "step"; step: DeskStep } | { type: "done"; run: LabSignals } | { type: "error"; status: string; detail: string };

export const SIGNALS_LABEL = "Signals on · internal test";
export const SIGNALS_NOTE = "Internal test for the FinLit team, not investment advice. Giving buy or sell calls to the public in India falls under SEBI's research-analyst rules.";
/** The page's disclaimer on the Signals desk tab (the other tabs keep Order Flow's describe-only one). */
export const SIGNALS_PAGE_DISCLAIMER = "Signals on · internal test. The Signals desk is the one part of FinLit that gives a rating, a trader's plan and trade sizes, "
  + "written by FinLit AI from FinLit's stored figures for the FinLit team's internal test. It is not investment advice and not a research report; "
  + "giving buy or sell calls to the public in India falls under SEBI's research-analyst rules. It never places an order. Intraday and F&O trading "
  + "carry a high risk of loss; most people who trade them lose money.";
export const RATINGS: Rating[] = ["Buy", "Overweight", "Hold", "Underweight", "Sell"];
export const STEP_NAMES: Record<StepId, string> = {
  analysts: "Analyst notes", debate: "Bull and bear debate", rating: "Research manager's rating", plan: "Trader's plan", sizes: "Trade-size debate",
};
export const STEP_STATUS: Record<StepStatus, string> = {
  waiting: "Waiting", running: "Writing…", done: "Done", failed: "Stopped: did not keep to the rules", capped: "Stopped: cap reached", skipped: "Not needed", not_run: "Not run",
};
export const DESK_HOW = "One press runs five steps in turn, each written by FinLit AI from the numbered sheet below: four analyst notes (technical, financials, "
  + "news and sentiment only when FinLit stores news for the stock, Order Flow for F&O stocks), two rounds of a bull and a bear researcher, a research "
  + "manager's rating on a five-step scale with its reasons, a trader's plan and a cautious, balanced and aggressive trade-size debate. The plan's entry "
  + "zone, stop, targets and time frame and the cautious, balanced and aggressive sizes are worked out by FinLit from the stored levels (14-session ATR, 20-session high and low, "
  + "Order Flow pivots, the 52-week closing range); FinLit AI only explains them. Every figure cites its fact, every step is checked and asked again once "
  + "if it fails; a run is capped in AI calls and tokens and stops plainly when a step cannot keep to the rules. A finished run is kept until a new "
  + "filing, new prices or new stored news.";

export const getSignals = (s: string) => apiGet<LabSignals>(`/api/lab/signals/${encodeURIComponent(s)}`);

/** One server-sent event block ("event: x\ndata: {...}") as a DeskEvent; anything else is skipped. */
export function parseBlock(block: string): DeskEvent | null {
  const ev = /^event: (\w+)$/m.exec(block)?.[1], raw = /^data: (.*)$/m.exec(block)?.[1];
  if (!ev || !raw) return null;
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return null; }
  if (ev === "step") return { type: "step", step: data as DeskStep };
  if (ev === "done") return { type: "done", run: data as LabSignals };
  if (ev === "error") { const d = data as { status?: string; detail?: string }; return { type: "error", status: d.status || "failed", detail: d.detail || "" }; }
  return null;
}

/** Runs the desk: POST, then each step's progress as it streams, then the run. A refusal (403, 429, 503) throws an ApiError with the server's words. */
export async function runSignals(symbol: string, on: (e: DeskEvent) => void, signal?: AbortSignal): Promise<void> {
  const headers: Record<string, string> = { Accept: "text/event-stream", ...viewAsHeader() };
  const token = csrfToken();
  if (token) headers["X-CSRF-Token"] = token;
  const res = await fetch(apiUrl(`/api/lab/signals/${encodeURIComponent(symbol)}`), { method: "POST", headers, credentials: API_BASE ? "include" : "same-origin", signal });
  if (!res.ok || !res.body) {
    let b: ApiError["body"] = {};
    try { b = errorBody(await res.json()); } catch { /* not JSON */ }
    throw new ApiError(res.status, b);
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) { const e = parseBlock(p); if (e) on(e); }
  }
  const last = parseBlock(buf);
  if (last) on(last);
}

/** "good" for Buy and Overweight, "bad" for Underweight and Sell, "mid" for Hold: the badge's colour. */
export const ratingTone = (r: Rating): "good" | "mid" | "bad" => (r === "Buy" || r === "Overweight" ? "good" : r === "Hold" ? "mid" : "bad");

export const rupees = (v: number | null | undefined) => (v == null ? "—" : `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/** The line under the button: how many runs are left today and when they renew. */
export function deskLimitLine(l: DeskLimit): string {
  if (l.left <= 0) return `All ${l.limit} runs of today are used. They renew at midnight India time; a run already made still opens.`;
  return `${l.left} of ${l.limit} runs left today. A run already made for a stock opens free.`;
}

/** "6 of 8 AI calls · 720 of 60,000 tokens" for a run; the caps alone before one. */
export function capsLine(c: DeskCaps, ran: boolean): string {
  const cap = `at most ${c.maxCalls} AI calls, ${c.tokenBudget.toLocaleString("en-IN")} tokens and ${c.rounds} debate rounds a run`;
  return ran ? `${c.calls} of ${c.maxCalls} AI calls · ${c.tokens.toLocaleString("en-IN")} of ${c.tokenBudget.toLocaleString("en-IN")} tokens used` : `Caps: ${cap}`;
}

/** The steps as they stand: the run's, else the steps streamed so far over the waiting list. */
export function mergeSteps(base: DeskStep[], live: Partial<Record<StepId, DeskStep>>): DeskStep[] {
  return base.map((s) => live[s.id] ?? s);
}
