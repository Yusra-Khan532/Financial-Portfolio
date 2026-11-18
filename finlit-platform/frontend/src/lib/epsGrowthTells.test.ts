import { describe, expect, it } from "vitest";
import { growthTells } from "./epsGrowthTells";

const row = (t: ReturnType<typeof growthTells>, k: string) => t.rows.find((r) => r.key === k)!;

describe("growthTells (task #205)", () => {
  it("lists the four results in order, growth-affected ones marked", () => {
    const t = growthTells(10, 20, 15, 10);
    expect(t.rows.map((r) => r.metric)).toEqual(["EPS", "P/E ratio", "PEG ratio", "Implied 5Y EPS"]);
    expect(t.rows.map((r) => r.affected)).toEqual([false, false, true, true]);
  });
  it("raising growth: EPS and P/E unchanged, PEG falls, 5Y EPS rises, with before and change", () => {
    const t = growthTells(10, 20, 15, 10);
    expect(row(t, "eps")).toMatchObject({ dir: "same", change: "No change", now: "₹10.00" });
    expect(row(t, "pe")).toMatchObject({ dir: "same", now: "20.00x" });
    expect(row(t, "peg")).toMatchObject({ dir: "down", before: "2.00", now: "1.33", change: "−0.67" });
    const f = row(t, "eps5");
    expect(f.dir).toBe("up"); expect(f.before).toBe("₹16.11"); expect(f.now).toBe("₹20.11"); expect(f.change).toBe("+4.00 (+24.9%)");
    expect(t.moved).toBe(2); expect(t.headline).toMatch(/raised from 10% to 15%: 2 of 4 results change/);
  });
  it("lowering growth: PEG rises, 5Y EPS falls", () => {
    const t = growthTells(10, 20, 5, 10);
    expect(row(t, "peg").dir).toBe("up"); expect(row(t, "eps5").dir).toBe("down");
    expect(row(t, "peg").why).toMatch(/came down from 10% to 5%/);
  });
  it("no previous rate yet: shows values and invites a change", () => {
    const t = growthTells(10, 20, 12, null);
    expect(row(t, "peg")).toMatchObject({ dir: "na", now: "1.67", change: "Change the growth to compare", before: null });
    expect(t.headline).toMatch(/Your growth assumption is 12%/);
  });
  it("PEG is not meaningful at zero or negative growth or without a P/E", () => {
    expect(row(growthTells(10, 20, 0, 10), "peg")).toMatchObject({ dir: "na", change: "Not meaningful" });
    expect(row(growthTells(-2, null, 10, 5), "peg").change).toBe("Not meaningful");
    expect(row(growthTells(-2, null, 10, 5), "eps5").change).toBe("Not meaningful");
  });
  it("incomplete inputs", () => {
    const t = growthTells(null, null, 10, 5);
    expect(t.rows.every((r) => r.dir === "na")).toBe(true);
    expect(row(t, "eps").change).toBe("Complete the inputs");
  });
  it("never gives advice", () => {
    const words = JSON.stringify([growthTells(10, 20, 15, 10), growthTells(10, 20, 5, 10), growthTells(10, 20, 12, null)]);
    expect(words).not.toMatch(/\b(buy|sell|hold|reduce|avoid|accumulate|target|best|undervalued|overvalued|cheap)\b/i);
  });
});
