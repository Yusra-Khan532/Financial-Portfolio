// The landing page's product tour (owner, 27 Nov 2026: re-recorded in light and dark after the FinLit Ventures logo, task #400). The hero's chapter
// buttons jump to fixed seconds (CH in golive.js); scripts/record-home-tour.mjs cuts every recording to the section lengths those seconds imply, so in
// both themes each chapter starts exactly where its button jumps to.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { chapterList, startsOf, targetLengths } from "../../../scripts/tour-timing.mjs";

const golive = readFileSync(resolve(__dirname, "golive.js"), "utf8");
const recorder = readFileSync(resolve(__dirname, "../../../scripts/record-home-tour.mjs"), "utf8");

describe("product tour timing", () => {
  const ch = chapterList(golive);
  const at = ch.map((c) => c[1]);

  it("reads the hero's seven chapters, in order", () => {
    expect(ch.map((c) => c[0])).toEqual(["Screener", "Company report", "FinLit Prism", "Sector Pulse", "Sector Rotation", "Mutual Fund Score", "Portfolio"]);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("starts every section of the video where its chapter button jumps to, and the end card at 38.8 s", () => {
    const lengths = targetLengths(at, 38.8, 3.55, 0.4);
    const starts = startsOf(lengths, 0.4);
    starts.slice(0, at.length).forEach((s, i) => expect(s).toBeCloseTo(at[i], 6));
    expect(starts[at.length]).toBeCloseTo(38.8, 6);
    expect(starts[starts.length - 1] + lengths[lengths.length - 1]).toBeCloseTo(42.35, 6);   // the video's length, as before
    lengths.forEach((d) => expect(d).toBeGreaterThan(0.4));                                     // every section outlasts its cross-fade
  });

  it("has one recorded section per chapter button", () => {
    const sections = recorder.slice(recorder.indexOf("const SECTIONS = ["), recorder.indexOf("async function record("));
    expect((sections.match(/^ {2}\["\//gm) || []).length).toBe(ch.length);
  });

  it("records both themes, each with its own end-card logo", () => {
    expect(recorder).toMatch(/THEMES \|\| "light,dark"/);
    expect(recorder).toContain("/brand/finlit-ventures-logo-on-' + theme + '.png");
  });
});
