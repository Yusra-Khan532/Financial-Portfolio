// Task #349 PR 3: the `since` event arrives through askAi before the words, and `fresh` (the "Full answer" button) is sent only when asked for.
import { afterEach, describe, expect, it, vi } from "vitest";
import { askAi, type AskEvent } from "./askAi";

const enc = new TextEncoder();
const sse = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

function serve(pieces: string[]) {
  const sent: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    const body = new ReadableStream<Uint8Array>({ start(c) { pieces.forEach((p) => c.enqueue(enc.encode(p))); c.close(); } });
    return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }));
  return sent;
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("askAi and since you last asked", () => {
  it("passes the since event on, before the text", async () => {
    const since = { askedAt: "2026-11-20T10:22:00+00:00", question: "TCS price?", match: "strong", changes: ["Price ₹2,880 → ₹2,950, +₹70 (+2.4%) (20 Nov 2026 → 23 Nov 2026)"], newItems: [], said: [] };
    const sent = serve([sse("meta", { limit: 50, used: 1, left: 49, resets: "2026-12-01", cached: false }), sse("since", since), sse("text", { text: "Since you last asked" }),
      sse("done", { disclaimer: "x", sources: [] })]);
    const got: AskEvent[] = [];
    await askAi("TCS price?", [], "TCS", (e) => got.push(e));
    expect(got.map((e) => e.type)).toEqual(["meta", "since", "text", "done"]);
    expect(got[1]).toEqual({ type: "since", ...since });
    expect(sent[0]).toEqual({ question: "TCS price?", history: [], symbol: "TCS" });                 // no `fresh` unless asked for
  });
  it("sends fresh: true for the full answer", async () => {
    const sent = serve([sse("done", { disclaimer: "x", sources: [] })]);
    await askAi("TCS price?", [], null, () => {}, undefined, undefined, { fresh: true });
    expect(sent[0]).toEqual({ question: "TCS price?", history: [], fresh: true });
  });
});
