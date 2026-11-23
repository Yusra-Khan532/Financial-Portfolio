// @vitest-environment jsdom
// Task #356 (team, 23 Nov 2026): the Mutual Fund Screener's preset screens in labelled rows (the team's second picture): Equity, Debt, Index and themes,
// Hybrid, FinLit Score; the heading and the note on one line. Every preset is in exactly one row; none is lost.
import { describe, expect, it } from "vitest";
import { PRESETS, PRESET_GROUPS } from "../../lib/mfScreen";

describe("task #356: preset rows", () => {
  it("has the five rows in the picture's order", () => {
    expect(PRESET_GROUPS.map((g) => g.label)).toEqual(["Equity", "Debt", "Index and themes", "Hybrid", "FinLit Score"]);
  });
  it("puts every preset in exactly one row, as in the picture", () => {
    const all = PRESET_GROUPS.flatMap((g) => g.ids);
    expect([...all].sort()).toEqual(PRESETS.map((p) => p.id).sort());
    expect(new Set(all).size).toBe(all.length);
    const by = Object.fromEntries(PRESET_GROUPS.map((g) => [g.label, g.ids.map((id) => PRESETS.find((p) => p.id === id)!.label)]));
    expect(by.Equity).toEqual(["Large caps at lower cost", "Mid caps ahead of category, steadily", "Small caps that fell less", "Tax saver (ELSS) with a five-year record"]);
    expect(by.Debt).toEqual(["Short-term debt, no falling month", "Debt with a small worst month and low fee share"]);
    expect(by["Index and themes"]).toEqual(["Index funds and ETFs, lowest expense ratio first", "Defence and aerospace funds", "AI and technology funds"]);
    expect(by.Hybrid).toEqual(["Hybrid funds with steady months"]);
    expect(by["FinLit Score"]).toEqual(["Mutual Fund Score 65+ at low cost"]);
  });
});
