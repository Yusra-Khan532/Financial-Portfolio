// Task #312 (developer file 20, change 3): the AI summary never sticks on "Writing the summary…" and never shows a box with only a disclaimer. The four
// cases the pack ran (done with no text; ended without done; normal; error), plus silence, Stop and the "being updated" refusal.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AskRefused, type AskEvent } from "../lib/askAi";
import { runSummary } from "./PrismAiSummary";

type S = { kind: string; reason?: string; text?: string; cached?: boolean };
const play = (events: AskEvent[], opts: { hang?: boolean; throws?: unknown } = {}) => async (_s: string, on: (e: AskEvent) => void, signal?: AbortSignal) => {
  for (const e of events) on(e);
  if (opts.throws) throw opts.throws;
  if (opts.hang) await new Promise((_, rej) => signal!.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
};
const run = async (ask: ReturnType<typeof play>, outer = new AbortController(), ms = { quiet: 50, total: 200 }) => {
  const seen: S[] = [];
  await runSummary("RELIANCE", (s) => seen.push(s as S), outer.signal, ask as never, ms);
  return seen;
};
const meta = { type: "meta", limit: 10, used: 1, left: 9, resets: "2026-12-01", cached: false } as unknown as AskEvent;

describe("task #312: the AI summary's stream is read safely", () => {
  it("done with no text (seen live, 22 Nov): a plain reason, not counted, never a box with only the disclaimer", async () => {
    const s = await run(play([meta, { type: "status", text: "Reading the company page (RELIANCE)" }, { type: "done" } as AskEvent]));
    expect(s.at(-1)).toEqual({ kind: "empty", reason: "FinLit AI sent back no text, so this was not counted." });
  });
  it("the stream ends without done (a deploy, a proxy): not stuck on Writing", async () => {
    const s = await run(play([meta, { type: "text", text: "- Reliance reads as **mixed**" }]));
    expect(s.at(-1)).toEqual({ kind: "empty", reason: "The summary stopped before it was finished, so it was not counted." });
  });
  it("normal: the text streams and then is done", async () => {
    const s = await run(play([meta, { type: "text", text: "- Overall: **mixed**" }, { type: "text", text: "\n- Price trend: down" }, { type: "done" } as AskEvent]));
    expect(s.some((x) => x.kind === "writing" && x.text === "- Overall: **mixed**")).toBe(true);
    expect(s.at(-1)).toMatchObject({ kind: "done", text: "- Overall: **mixed**\n- Price trend: down", cached: false });
  });
  it("an error event: its text, and that it was not counted", async () => {
    const s = await run(play([meta, { type: "error", text: "FinLit AI could not answer just now." } as AskEvent]));
    expect(s.at(-1)).toEqual({ kind: "empty", reason: "FinLit AI could not answer just now. It was not counted." });
  });
  it("silence: given up after the quiet time, said plainly", async () => {
    const s = await run(play([meta], { hang: true }));
    expect(s.at(-1)).toEqual({ kind: "empty", reason: "FinLit AI took too long, so this was not counted." });
  });
  it("Stop: back to the bar, no failure message", async () => {
    const outer = new AbortController();
    const p = run(play([meta], { hang: true }), outer, { quiet: 5000, total: 5000 });
    setTimeout(() => outer.abort(), 10);
    expect((await p).at(-1)).toEqual({ kind: "idle" });
  });
  it("a deploy's 503 'FinLit is being updated': try again in a minute, not counted", async () => {
    const s = await run(play([], { throws: new AskRefused(503, "updating", "FinLit is being updated. Please try again in a minute.") }));
    expect(s.at(-1)).toEqual({ kind: "empty", reason: "FinLit is being updated. Try again in a minute; this was not counted." });
  });
  it("the bar is the first thing in the FinLit Prism card, before the two panels", () => {
    const src = readFileSync(join(__dirname, "PrismCompare.tsx"), "utf8");
    expect(src.indexOf("<PrismAiSummary")).toBeGreaterThan(-1);
    expect(src.indexOf("<PrismAiSummary")).toBeLessThan(src.indexOf('<div className="pcx-body"'));
  });
});
