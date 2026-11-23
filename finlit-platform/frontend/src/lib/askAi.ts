// Ask FinLit AI's written answers (backend finlit/ask, docs/ASK-AI.md): a question the listed answers do not cover is sent to POST /api/ask, which reads
// FinLit's own data as the signed-in member and streams the answer back as Server-Sent Events. Each plan has a monthly allowance (Basic 5, Silver 50,
// Gold 100); GET /api/ask/quota says what is left. Everything here is the transport and the event parsing; the panel decides what to show.
import { useQuery } from "@tanstack/react-query";
import { API_BASE, apiGet, apiUrl, csrfToken, errorBody, type ApiError } from "./api";
import { viewAsHeader } from "./adminView";
import { useAuth } from "./auth";

export type AskAllowance = { limit: number; used: number; left: number; resets: string };
/** `summary` (task #228): the AI summaries of the FinLit Prism card, 10 a month on Silver and Gold, counted apart from the questions. */
export type AskQuota = { enabled: boolean; signedIn: boolean; plan?: string; limit?: number; used?: number; left?: number; resets?: string; summary?: AskAllowance };
export type AskTurn = { role: "user" | "assistant"; content: string };
export type AskEvent =
  | { type: "meta"; limit: number; used: number; left: number; resets: string; cached: boolean }
  | { type: "status"; text: string }
  | { type: "text"; text: string }
  | { type: "replace"; text: string }
  | { type: "done"; disclaimer: string; sources: string[]; pages?: AskPage[] }
  | { type: "error"; code: string; text: string };

/** A FinLit page an answer read (task #218): shown under the answer as "Read on FinLit" links. */
export type AskPage = { to: string; label: string };
/** Only this site's own pages, at most four, each once: a link is never taken to another site, whatever the server sends. */
export function safePages(p: unknown): AskPage[] {
  if (!Array.isArray(p)) return [];
  const out: AskPage[] = [];
  for (const x of p) {
    const to = typeof x?.to === "string" ? x.to : "", label = typeof x?.label === "string" ? x.label.trim().slice(0, 60) : "";
    if (/^\/[a-z0-9]/i.test(to) && !to.startsWith("//") && !/[\s\\]/.test(to) && label && !out.some((o) => o.to === to)) out.push({ to, label });
  }
  return out.slice(0, 4);
}

/** Why a question could not be sent at all (before any answer): not signed in, the allowance used, not switched on, or another refusal. */
export class AskRefused extends Error {
  constructor(public status: number, public code: string, message: string, public body: ApiError["body"] & { left?: number; resets?: string } = {}) { super(message); }
}

/** Whether written answers are on and, for a signed-in member, the questions left this month. */
export function useAskQuota(enabled = true) {
  const { user } = useAuth();
  return useQuery<AskQuota, ApiError>({ queryKey: ["ask-quota", user?.id ?? null], queryFn: () => apiGet<AskQuota>("/api/ask/quota"), enabled, staleTime: 60_000, retry: false });
}

/** Splits a Server-Sent Events buffer into finished events and the unfinished rest. */
export function parseSse(buffer: string): { events: AskEvent[]; rest: string } {
  const events: AskEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const chunk of parts) {
    let name = "", data = "";
    for (const line of chunk.split("\n")) {
      if (line.startsWith("event: ")) name = line.slice(7).trim();
      else if (line.startsWith("data: ")) data += line.slice(6);
    }
    if (!name || !data) continue;
    try { events.push({ type: name, ...JSON.parse(data) } as AskEvent); } catch { /* a broken event is skipped, never shown */ }
  }
  return { events, rest };
}

/** Task #349: each earlier turn sent with a follow-up is cut to this many characters (the server takes up to 4,000 and cuts the rest), so a long
 *  answer never makes the next question fail. */
export const TURN_CHARS = 3500;
/** Task #349: a written answer gets this long in all; then it is stopped and the member is told, never left on "Reading…". */
export const ASK_TIMEOUT_MS = 120_000;
/** The codes of the error events the browser makes itself (task #349): the stream ended with no "done" or "error", or the answer took too long. */
export const INTERRUPTED = "interrupted", TIMED_OUT = "timeout";

export const trimTurn = (t: AskTurn): AskTurn => (t.content.length <= TURN_CHARS ? t : { ...t, content: t.content.slice(0, TURN_CHARS - 1).trimEnd() + "…" });

/** Sends one question and calls `on` for every event as it arrives. Throws AskRefused when the server refuses before answering, and the abort
 *  reason when `signal` stops it (the Stop button). Task #349: the answer always ends with "done" or "error": a stream that ends without either is
 *  reported as an error event with code INTERRUPTED, and an answer still running after `timeoutMs` is stopped and reported with code TIMED_OUT. */
export async function askAi(question: string, history: AskTurn[], symbol: string | null, on: (e: AskEvent) => void, signal?: AbortSignal,
  timeoutMs = ASK_TIMEOUT_MS): Promise<void> {
  const ctl = new AbortController();
  const stop = () => ctl.abort(signal?.reason);
  if (signal?.aborted) stop(); else signal?.addEventListener("abort", stop, { once: true });
  let late = false;
  const timer = setTimeout(() => { late = true; ctl.abort(); }, timeoutMs);
  let ended = false;
  const seen = (e: AskEvent) => { if (e.type === "done" || e.type === "error") ended = true; on(e); };
  try {
    await send({ question, history: history.slice(-6).map(trimTurn), ...(symbol ? { symbol } : {}) }, seen, ctl.signal);
  } catch (err) {
    if (!late || signal?.aborted) throw err;              // a refusal, a network failure, or the member's Stop
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
  if (ended) return;
  on(late ? { type: "error", code: TIMED_OUT, text: "The answer took too long and was stopped. Ask again." }
    : { type: "error", code: INTERRUPTED, text: "The answer was interrupted. Ask again." });
}

/** Task #228: the AI summary of the company's FinLit Prism card: what it means, in words. The server writes what is asked; it uses one of the
 *  month's AI summaries (10 on Silver and Gold), never one of the questions. */
export async function askSummary(symbol: string, on: (e: AskEvent) => void, signal?: AbortSignal): Promise<void> {
  return send({ kind: "summary", symbol }, on, signal);
}

async function send(body: Record<string, unknown>, on: (e: AskEvent) => void, signal?: AbortSignal): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "text/event-stream", ...viewAsHeader() };
  const token = csrfToken();
  if (token) headers["X-CSRF-Token"] = token;
  const res = await fetch(apiUrl("/api/ask"), { method: "POST", headers, credentials: API_BASE ? "include" : "same-origin", signal, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    let body: AskRefused["body"] = {};
    try { body = errorBody(await res.json()) as AskRefused["body"]; } catch { /* not JSON */ }
    throw new AskRefused(res.status, body.status || "failed", body.detail || "FinLit AI could not answer just now. Please try again.", body);
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  // Task #349: stopping (Stop, the time limit) ends the read at once, whatever the transport does with the signal
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener("abort", cancel, { once: true });
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (signal?.aborted) break;
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const { events, rest } = parseSse(buf);
      buf = rest;
      events.forEach(on);
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  const { events } = parseSse(buf + "\n\n");
  events.forEach(on);
}
