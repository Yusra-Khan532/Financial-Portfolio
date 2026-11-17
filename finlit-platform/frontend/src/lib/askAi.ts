// Ask FinLit AI's written answers (backend finlit/ask, docs/ASK-AI.md): a question the listed answers do not cover is sent to POST /api/ask, which reads
// FinLit's own data as the signed-in member and streams the answer back as Server-Sent Events. Each plan has a monthly allowance (Basic 5, Silver 50,
// Gold 100); GET /api/ask/quota says what is left. Everything here is the transport and the event parsing; the panel decides what to show.
import { useQuery } from "@tanstack/react-query";
import { API_BASE, apiGet, apiUrl, csrfToken, errorBody, type ApiError } from "./api";
import { viewAsHeader } from "./adminView";
import { useAuth } from "./auth";

export type AskQuota = { enabled: boolean; signedIn: boolean; plan?: string; limit?: number; used?: number; left?: number; resets?: string };
export type AskTurn = { role: "user" | "assistant"; content: string };
export type AskEvent =
  | { type: "meta"; limit: number; used: number; left: number; resets: string; cached: boolean }
  | { type: "status"; text: string }
  | { type: "text"; text: string }
  | { type: "replace"; text: string }
  | { type: "done"; disclaimer: string; sources: string[] }
  | { type: "error"; code: string; text: string };

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

/** Sends one question and calls `on` for every event as it arrives. Throws AskRefused when the server refuses before answering. */
export async function askAi(question: string, history: AskTurn[], symbol: string | null, on: (e: AskEvent) => void, signal?: AbortSignal): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "text/event-stream", ...viewAsHeader() };
  const token = csrfToken();
  if (token) headers["X-CSRF-Token"] = token;
  const res = await fetch(apiUrl("/api/ask"), { method: "POST", headers, credentials: API_BASE ? "include" : "same-origin", signal,
    body: JSON.stringify({ question, history: history.slice(-6), ...(symbol ? { symbol } : {}) }) });
  if (!res.ok || !res.body) {
    let body: AskRefused["body"] = {};
    try { body = errorBody(await res.json()) as AskRefused["body"]; } catch { /* not JSON */ }
    throw new AskRefused(res.status, body.status || "failed", body.detail || "FinLit AI could not answer just now. Please try again.", body);
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const { events, rest } = parseSse(buf);
    buf = rest;
    events.forEach(on);
  }
  const { events } = parseSse(buf + "\n\n");
  events.forEach(on);
}
