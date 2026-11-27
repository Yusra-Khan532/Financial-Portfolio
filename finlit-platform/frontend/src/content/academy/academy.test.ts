// F&O Academy content: every module has 5 to 8 lessons; every lesson has a body, a worked example in ₹ and a 3 to 5 question quiz in which
// every question has exactly one right option and a reason for every option; ids are valid progress keys; sources are official addresses;
// and no lesson text uses advice words. The nouns "buyer", "seller" and "writer" name the sides of a contract; the verbs are not allowed.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LESSONS, MODULES, TOOLS, findLesson, findTool } from ".";
import { STRUCTURES } from "../../lib/payoff";
import { LESSON_ID } from "../../lib/prefs";
import { BANNED } from "./banned";
import { CHECK, RISK_LINE, type Block, type Lesson } from "./types";


const blockText = (b: Block) => ("p" in b ? b.p : "list" in b ? b.list.join(" ") : "terms" in b ? b.terms.flat().join(" ") : "note" in b ? b.note : `${b.formula} ${b.what}`);
const lessonText = (l: Lesson) => [l.title, l.summary, ...l.body.map(blockText), l.example.title, ...l.example.steps, l.example.result,
  ...l.quiz.flatMap((q) => [q.q, ...q.options.flatMap((o) => [o.text, o.why])]), ...(l.sources ?? []).map((s) => s.label), l.live?.label ?? ""].join("\n");

describe("F&O Academy curriculum", () => {
  it("has ten modules, numbered in order, each with 5 to 8 lessons", () => {
    expect(MODULES.map((m) => m.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const m of MODULES) {
      expect(m.lessons.length, m.id).toBeGreaterThanOrEqual(5);
      expect(m.lessons.length, m.id).toBeLessThanOrEqual(8);
      expect(m.title.length && m.line.length, m.id).toBeTruthy();
    }
    expect(LESSONS.length).toBe(MODULES.reduce((s, m) => s + m.lessons.length, 0));
  });

  it("every lesson id is unique, a valid progress key and not a tool's address", () => {
    const ids = LESSONS.map((x) => x.lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) { expect(LESSON_ID.test(id), id).toBe(true); expect(findTool(id), id).toBeNull(); expect(findLesson(id)?.lesson.id).toBe(id); }
    for (const t of TOOLS) { expect(LESSON_ID.test(t.id)).toBe(true); expect(findLesson(t.lesson), t.id).not.toBeNull(); }
  });

  it("every lesson has a title, a summary, a body and a worked example in rupees", () => {
    for (const { lesson: l } of LESSONS) {
      expect(l.title.trim() && l.summary.trim(), l.id).toBeTruthy();
      expect(l.body.length, l.id).toBeGreaterThan(0);
      expect(l.example.steps.length, l.id).toBeGreaterThanOrEqual(2);
      expect(l.example.result.trim(), l.id).toBeTruthy();
    }
    expect(LESSONS.filter(({ lesson: l }) => ![l.example.title, ...l.example.steps, l.example.result].join(" ").includes("₹")).map((x) => x.lesson.id)).toEqual([]);
  });

  it("every quiz has 3 to 5 questions; each has exactly one right option and a reason for every option", () => {
    for (const { lesson: l } of LESSONS) {
      expect(l.quiz.length, l.id).toBeGreaterThanOrEqual(3);
      expect(l.quiz.length, l.id).toBeLessThanOrEqual(5);
      for (const q of l.quiz) {
        expect(q.q.trim(), l.id).toBeTruthy();
        expect(q.options.length, `${l.id}: ${q.q}`).toBeGreaterThanOrEqual(3);
        expect(q.options.filter((o) => o.correct).length, `${l.id}: ${q.q}`).toBe(1);
        for (const o of q.options) expect(o.why.trim().length, `${l.id}: ${o.text}`).toBeGreaterThan(10);
        expect(new Set(q.options.map((o) => o.text)).size, `${l.id}: ${q.q}`).toBe(q.options.length);
      }
    }
  });

  it("the right answer is not always in the same place", () => {
    const at = LESSONS.flatMap((x) => x.lesson.quiz.map((q) => q.options.findIndex((o) => o.correct)));
    const counts = [0, 1, 2].map((i) => at.filter((x) => x === i).length);
    for (const c of counts) expect(c / at.length).toBeGreaterThan(0.2);
  });

  it("the widgets point at real structures; every lesson of module 7 draws its payoff diagram", () => {
    const ids = new Set(STRUCTURES.map((s) => s.id));
    for (const { lesson: l } of LESSONS) if (l.widget?.kind === "payoff") expect(ids.has(l.widget.structure), l.id).toBe(true);
    const m7 = MODULES.find((m) => m.n === 7)!;
    for (const l of m7.lessons) expect(l.widget?.kind, l.id).toBe("payoff");
    const m7s = m7.lessons.map((l) => (l.widget as { structure: string }).structure);
    for (const s of ["covered-call", "protective-put", "call-spread", "put-spread", "straddle", "strangle", "iron-condor"]) expect(m7s).toContain(s);
    expect(LESSONS.some((x) => x.lesson.widget?.kind === "greeks")).toBe(true);
    expect(LESSONS.some((x) => x.lesson.widget?.kind === "costs")).toBe(true);
  });

  it("only module 5 links to live data, and only to Trading Lab pages", () => {
    for (const { lesson: l, module: m } of LESSONS) {
      if (!l.live) continue;
      expect(m.n, l.id).toBe(5);
      expect(l.live.to.startsWith("/lab"), l.id).toBe(true);
      expect(l.live.label).toMatch(/^See it on live data/);
    }
    expect(MODULES[4].lessons.every((l) => !!l.live)).toBe(true);
  });

  it("sources are official addresses (SEBI, NSE, the Union Budget site)", () => {
    for (const { lesson: l } of LESSONS) for (const s of l.sources ?? []) expect(s.url, l.id).toMatch(/^https:\/\/(www\.sebi\.gov\.in|scores\.sebi\.gov\.in|nsearchives\.nseindia\.com|www\.indiabudget\.gov\.in)\//);
    const risk = findLesson("sebi-studies")!.lesson;
    expect(risk.sources!.length).toBeGreaterThanOrEqual(3);
    expect(lessonText(risk)).toMatch(/September 2024/);
    expect(lessonText(risk)).toMatch(/August 2026/);
  });

  it("rules that change point to the current circular; module 10's rules carry their circular and date", () => {
    for (const id of ["nse-fno-at-a-glance", "lot-size-contract-value", "exercise-and-settlement", "securities-transaction-tax", "sebi-measures-2024", "contract-size-and-expiry-days", "position-limits"]) {
      const l = findLesson(id)!.lesson;
      expect(l.body.some((b) => "note" in b && b.note === CHECK), id).toBe(true);
    }
    for (const l of MODULES[9].lessons) expect(lessonText(l), l.id).toMatch(/SEBI\/HO\/[A-Za-z0-9/-]+\/20\d\d\/\d+/);
    expect(lessonText(findLesson("fno-taxation")!.lesson)).toMatch(/consult a chartered accountant or tax professional/);
  });

  it("no lesson text uses advice or forecast words (buyer, seller and writer name the sides)", () => {
    const bad: string[] = [];
    for (const { lesson: l } of LESSONS) for (const line of lessonText(l).split("\n")) { const m = line.match(BANNED); if (m) bad.push(`${l.id}: "${m[0]}" in ${line.slice(0, 90)}`); }
    for (const m of MODULES) { const t = `${m.title} ${m.line}`.match(BANNED); if (t) bad.push(`${m.id}: ${t[0]}`); }
    for (const t of TOOLS) { const w = `${t.title} ${t.line}`.match(BANNED); if (w) bad.push(`${t.id}: ${w[0]}`); }
    for (const s of STRUCTURES) { const w = `${s.name} ${s.also ?? ""} ${s.line} ${s.fields.map((f) => f.label).join(" ")}`.match(BANNED); if (w) bad.push(`${s.id}: ${w[0]}`); }
    expect(RISK_LINE).not.toMatch(BANNED);
    expect(bad).toEqual([]);
    expect(lessonText(findLesson("calls-and-puts")!.lesson)).toMatch(/buyer/);   // the nouns are allowed
  });

  it("the source strings of the Academy's own files use no advice words either", () => {
    const files = [...readdirSync(join(__dirname)).filter((f) => /^m\d\d\.ts$|^types\.ts$|^index\.ts$|^sources\.ts$/.test(f)).map((f) => join(__dirname, f)),
      ...["components/academy/PayoffWidget.tsx", "components/academy/GreeksExplorer.tsx", "components/academy/CostsCalculator.tsx", "components/academy/Quiz.tsx", "components/academy/chart.tsx",
        "pages/FnoAcademy.tsx", "lib/payoff.ts", "lib/blackScholes.ts", "lib/fnoCosts.ts", "lib/academy.ts"].map((f) => join(__dirname, "../..", f))];
    const bad: string[] = [];
    for (const f of files) {
      const strings = [...readFileSync(f, "utf8").matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`]*)`|>([^<>{}]+)</g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
      for (const s of strings) { const m = s.match(BANNED); if (m) bad.push(`${f.split("/src/")[1]}: "${m[0]}" in ${s.slice(0, 80)}`); }
    }
    expect(bad).toEqual([]);
  });
});
