import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { flagsOf, verdictTone } from "./EarningsCash";

const pr = (o: Record<string, unknown> = {}) => ({ years: [{ period: "2026-03-31", receivablesFlag: true, receivablesGrowth: 38.9, revenueGrowth: 10.2, otherIncomeShare: 44 }], ...o }) as never;
const m = (L: Record<string, unknown>, warnings: unknown[] = []) => ({ state: "ok", latest: L, warnings }) as never;

describe("Earnings & cash: the red flag is written once", () => {
  it("the receivables warning gives both the year-end and the average-balance growth in one sentence", () => {
    const { flag } = flagsOf(pr(), m({ receivablesGrowth: 36.4 }, [{ id: "receivables", text: "x", why: "y" }]), null);
    expect(flag?.title).toBe("Customers are paying more slowly");
    expect(flag?.text).toContain("38.9% on year-end balances and 36.4% on average balances");
    expect(flag?.text).toContain("against revenue growth of 10.2%");
  });
  it("other warnings stay as watch items, the receivables one never appears twice, and other income becomes the item to investigate", () => {
    const { watch, investigate } = flagsOf(pr(), m({ receivablesGrowth: 36.4 }, [{ id: "receivables", text: "a", why: "b" }, { id: "inventory", text: "c", why: "d" }]), { questions: ["Are receivables rising?", "Is inventory piling up?"] } as never);
    expect(watch.map((w) => w.id)).toEqual(["inventory"]);
    expect(investigate[0]).toContain("Other income is 44% of pre-tax profit");
    expect(investigate).toHaveLength(2); expect(investigate.join(" ")).not.toMatch(/receivables rising/);
  });
  it("no receivables problem, no red flag", () => {
    expect(flagsOf(pr({ years: [{ period: "2026-03-31", receivablesFlag: false, receivablesGrowth: 3 }] }), m({ receivablesGrowth: 3 }), null).flag).toBeNull();
  });
});

// Task #129 (14 Nov 2026): "highlight in proper color the verdict green, orange and red in 11". Every verdict tile takes its colour (it used to be only the first:
// "Healthy" and the cash-backing tile were plain), and the watch colour is a clear orange, not brown.
describe("Earnings & cash: each verdict tile in its colour (task #129)", () => {
  it("green for the good verdict, orange for the one to watch, red for the alarm, in all three tiles", () => {
    for (const v of ["Strong", "Healthy", "ok"]) expect(verdictTone(v), v).toBe("s");
    for (const v of ["Mixed", "Watch", "Improving", "watch"]) expect(verdictTone(v), v).toBe("w");
    for (const v of ["Needs a closer look", "Needs attention", "alert"]) expect(verdictTone(v), v).toBe("f");
    for (const v of [null, undefined, "", "na", "Not enough data", "Not comparable"]) expect(verdictTone(v as string)).toBe("");
  });
  it("each of the three tiles reads its verdict through the one map (the bug: only the first tile had a colour class)", () => {
    const src = readFileSync(join(__dirname, "EarningsCash.tsx"), "utf8");
    expect(src).toContain('"ec-tile " + verdictTone(pr.verdict)');
    expect(src).toContain('"ec-tile " + verdictTone(intel?.pill.tone)');
    expect(src).toContain('"ec-tile " + verdictTone(ok?.status)');
    expect(src).not.toMatch(/className="ec-tile"/);
  });
  it("the watch colour is orange in both themes, not the old brown", () => {
    const css = readFileSync(join(__dirname, "..", "styles", "earningscash.css"), "utf8");
    for (const old of ["#8A4B00", "#A35700", "#F0B45A"]) expect(css).not.toContain(old);
    expect(css).toMatch(/^\.ec \{[^}]*--ck-watch: #AE3A09;[^}]*--ck-solid-watch: #EA580C;/m);
    expect(css).toMatch(/:root:not\(\[data-theme="light"\]\) \.ec \{[^}]*--ck-watch: #FDBA74;[^}]*--ck-solid-watch: #EA580C;/);
  });
});

// Task #129, second pass (team note): "in this mention what each color signifies and create uniformity with above symbols / follow - green, orange and red color only".
describe("Earnings & cash: one key, the six checks' marks, three colours only (task #129, team note)", () => {
  const src = readFileSync(join(__dirname, "EarningsCash.tsx"), "utf8");
  const css = readFileSync(join(__dirname, "..", "styles", "earningscash.css"), "utf8");
  it("a key says what green, orange and red mean, with the same marks as the six checks (✓ ! ⚑)", () => {
    expect(src).toContain("Green: in good shape"); expect(src).toContain("Orange: worth watching or checking"); expect(src).toContain("Red: a red flag that needs a closer look");
    expect(src).toMatch(/MARKS = \{ s: "✓", w: "!", f: "⚑" \}/);
    const pill = readFileSync(join(__dirname, "EarningsIntel.tsx"), "utf8");
    expect(pill).toMatch(/ok: "✓", watch: "!", alert: "⚑"/);                      // the six checks' pills use the same three marks
  });
  it("the cards under the tiles are red, orange or green only: no gold 'read' and no grey or blue 'investigate' card", () => {
    expect(src).not.toMatch(/className="ins v"|className="ins i"/);
    expect(src).toContain('"ins ec-c f"'); expect(src).toContain('"ins ec-c w"');
    expect(css).toMatch(/\.ec \.ins\.ec-c\.s \{ --ic: var\(--ck-solid-ok\); \} \.ec \.ins\.ec-c\.w \{ --ic: var\(--ck-solid-watch\); \} \.ec \.ins\.ec-c\.f \{ --ic: var\(--ck-solid-alert\);/);
  });
});
