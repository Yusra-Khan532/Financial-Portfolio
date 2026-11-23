// Task #349: a written answer never stays on "Reading…". A stream that ends with no "done" or "error" is reported as interrupted; an answer still
// running after the time limit is stopped and reported; Stop ends the read at once; each earlier turn is cut to 3,500 characters before it is sent.
import { afterEach, describe, expect, it, vi } from "vitest";
import { INTERRUPTED, TIMED_OUT, TURN_CHARS, askAi, type AskEvent } from "./askAi";

const enc = new TextEncoder();
const sse = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

/** fetch answering with these SSE pieces, then (when `hang`) never ending: the read waits until the request is stopped. */
function serve(pieces: string[], hang = false) {
  const sent: { body: Record<string, unknown>; signal?: AbortSignal }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    sent.push({ body: JSON.parse(String(init.body)), signal: init.signal ?? undefined });
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        pieces.forEach((p) => c.enqueue(enc.encode(p)));
        if (!hang) c.close();
      },
    });
    return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }));
  return sent;
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("askAi (task #349: never an empty or silent answer)", () => {
  it("a stream that ends with no final event is reported as interrupted", async () => {
    serve([sse("meta", { limit: 50, used: 1, left: 49, resets: "2026-12-01", cached: false }), sse("text", { text: "Sales rose" })]);
    const got: AskEvent[] = [];
    await askAi("How is TCS doing?", [], null, (e) => got.push(e));
    expect(got.map((e) => e.type)).toEqual(["meta", "text", "error"]);
    expect(got[2]).toEqual({ type: "error", code: INTERRUPTED, text: "The answer was interrupted. Ask again." });
  });

  it("a stream that ends with done or error gets nothing more", async () => {
    serve([sse("text", { text: "Done." }), sse("done", { disclaimer: "x", sources: [] })]);
    const got: AskEvent[] = [];
    await askAi("What is P/E?", [], null, (e) => got.push(e));
    expect(got.map((e) => e.type)).toEqual(["text", "done"]);
    serve([sse("error", { code: "busy", text: "Busy." })]);
    const err: AskEvent[] = [];
    await askAi("What is P/E?", [], null, (e) => err.push(e));
    expect(err).toEqual([{ type: "error", code: "busy", text: "Busy." }]);
  });

  it("a keep-alive ping is read and passed on, never shown as text", async () => {
    serve([sse("ping", {}), sse("text", { text: "ok" }), sse("done", { disclaimer: "x", sources: [] })]);
    const got: AskEvent[] = [];
    await askAi("q?", [], null, (e) => got.push(e));
    expect(got.map((e) => e.type)).toEqual(["ping", "text", "done"]);
  });

  it("an answer still running after the time limit is stopped and said so", async () => {
    const sent = serve([sse("text", { text: "Half" })], true);
    const got: AskEvent[] = [];
    await askAi("q?", [], null, (e) => got.push(e), undefined, 60);
    expect(got.at(-1)).toEqual({ type: "error", code: TIMED_OUT, text: "The answer took too long and was stopped. Ask again." });
    expect(sent[0].signal?.aborted).toBe(true);                                   // the request itself is stopped
  });

  it("Stop ends the answer at once: the abort reaches the caller and no error event is made up", async () => {
    const sent = serve([sse("text", { text: "Half" })], true);
    const stop = new AbortController();
    const got: AskEvent[] = [];
    const p = askAi("q?", [], null, (e) => { got.push(e); if (e.type === "text") stop.abort(); }, stop.signal);
    await expect(p).rejects.toBeTruthy();
    expect(got.map((e) => e.type)).toEqual(["text"]);
    expect(sent[0].signal?.aborted).toBe(true);
  });

  it("each earlier turn is cut to 3,500 characters, so a follow-up after a long answer is never refused", async () => {
    const sent = serve([sse("done", { disclaimer: "x", sources: [] })]);
    const long = "- Sales rose 12%. ".repeat(400);
    await askAi("And its debt?", [{ role: "user", content: "How is TCS doing?" }, { role: "assistant", content: long }], "TCS", () => undefined);
    const history = sent[0].body.history as { role: string; content: string }[];
    expect(long.length).toBeGreaterThan(4000);
    expect(history[1].content.length).toBe(TURN_CHARS);
    expect(history[1].content.endsWith("…")).toBe(true);
    expect(history[0].content).toBe("How is TCS doing?");
  });
});
