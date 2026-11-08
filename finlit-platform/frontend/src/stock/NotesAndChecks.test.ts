// Task #37: the earnings checks (section 11) also show in section 03, in plain words, with no title twice.
import { describe, expect, it } from "vitest";
import { CHECK_TITLE, checkItems, dedupe } from "./KeyFindings";
import type { Intel } from "../lib/earningsIntel";

const mod = (key: string, tone: string, fact = "A fact.") => ({ key, name: key, icon: "x", badge: tone, tone, facts: [fact], rule: "" });
const intel = (modules: unknown[]) => ({ modules }) as unknown as Intel;

describe("earnings checks in section 03", () => {
  it("an alert is a red flag, Investigate goes in Watch with its tag, OK and no-data add nothing", () => {
    const c = checkItems(intel([mod("receivables", "alert", "Receivables grew faster."), mod("inventory", "watch"), mod("fcf", "ok"), mod("sustain", "na")]));
    expect(c.flags.map((i) => i.title)).toEqual(["Customers are paying more slowly"]);
    expect(c.watch.map((i) => [i.title, i.tag, i.to])).toEqual([["Stock is building up", "Investigate", "earnings"]]);
    expect(c.flags[0].text).toBe("Receivables grew faster.");
  });
  it("every check has a plain title", () => {
    expect(Object.values(CHECK_TITLE)).toEqual(expect.arrayContaining(["Stock is building up", "Little cash left after investment", "Profit leans on one-off items", "Profit may not last"]));
    expect(checkItems(null)).toEqual({ flags: [], watch: [] });
  });
  it("a title in two columns stays in the most serious one, once", () => {
    const it = (key: string, title: string) => ({ key, title, text: "", to: "x" });
    const k = dedupe({ flags: [it("a", "Profit lagging sales")], watch: [it("b", "profit lagging sales"), it("c", "Other income is high")], good: [it("d", "Other income is high"), it("e", "Low debt")] });
    expect(k.flags.map((i) => i.key)).toEqual(["a"]);
    expect(k.watch.map((i) => i.key)).toEqual(["c"]);
    expect(k.good.map((i) => i.key)).toEqual(["e"]);
  });
});
