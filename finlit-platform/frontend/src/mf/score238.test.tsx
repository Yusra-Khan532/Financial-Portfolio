// @vitest-environment jsdom
// Task #238 (Chinmay, 18 Nov 2026): "in this for each pillar show number". The FinLit FundPulse card on a fund page showed each part (Performance, Risk,
// Cost, Quality) as a bar and a word only; it now shows the part's own figure out of 100 beside the word, draws the bar to that figure, and the breakdown
// table below says the same. A part the answer carries no figure for (a locked or older answer) keeps the word alone.
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ScoreBody } from "./ScoreCard";
import { ScoreBreakdown } from "./ScoreBreakdown";

afterEach(cleanup);

const pillars = (pts: (number | null)[]) => (["performance", "risk", "cost", "quality"] as const).map((key, i) => ({
  key, name: key[0].toUpperCase() + key.slice(1), points: pts[i], reading: pts[i] == null ? "Not scored" : pts[i]! >= 70 ? "Strong" : pts[i]! >= 50 ? "Fair" : "Weak",
}));
const score = (pts: (number | null)[]) => ({
  locked: false, group: "EQ-MID", groupName: "Mid Cap", status: "RATED", final: 62.7, label: "Average", disclaimer: "", method: "", model: "", months: 63,
  peers: { kind: "grp", n: 26, text: "" }, pillars: pillars(pts), rank: { n: 5, of: 27, percentile: 85 }, reasons: { strengths: [], watchouts: [], gaps: [], notApplicable: [], substitutions: [] },
  metrics: [{ id: "A_ONE", label: "a", pillar: "performance", state: "A", value: 1, own: 1, peer: 1, peerN: 30, points: 60, weight: 8, groupValue: null, why: null }],
  categoryMedian: { performance: "Fair", risk: "Fair", cost: "Fair", quality: "Fair", final: 56.7, n: 27, plan: "Direct", categoryLabel: "Mid Cap" },
}) as never;

describe("task #238: each part of the FundPulse shows its figure", () => {
  it("shows the figure out of 100 beside each word, in the order of the parts", () => {
    render(<MemoryRouter><ScoreBody s={score([58.3, 81, 55.04, 61.9])} /></MemoryRouter>);
    const list = screen.getByRole("list", { name: /four parts of the score, each out of 100/ });
    const rows = within(list).getAllByRole("listitem").map((li) => [li.querySelector(".mfs-pn")!.textContent, li.querySelector(".mfs-pnum")?.textContent, li.querySelector(".mfs-pv")!.textContent]);
    expect(rows).toEqual([["Performance", "58.3", "58.3Fair"], ["Risk", "81.0", "81.0Strong"], ["Cost", "55.0", "55.0Fair"], ["Quality", "61.9", "61.9Fair"]]);
    expect(screen.getByLabelText("Risk: 81.0 out of 100, Strong")).toBeTruthy();
  });
  it("draws each bar to the part's own figure, so two Fair parts no longer look the same", () => {
    const { container } = render(<MemoryRouter><ScoreBody s={score([58.3, 81, 55, 61.9])} /></MemoryRouter>);
    const widths = [...container.querySelectorAll(".mfs-pillars .mfs-bar i")].map((i) => (i as HTMLElement).style.width);
    expect(widths).toEqual(["58.3%", "81%", "55%", "61.9%"]);
  });
  it("keeps the word alone when the answer has no figure for a part", () => {
    const { container } = render(<MemoryRouter><ScoreBody s={score([58.3, null, 55, 61.9])} /></MemoryRouter>);
    const risk = container.querySelectorAll(".mfs-pillars li")[1];
    expect(risk.querySelector(".mfs-pnum")).toBeNull();
    expect(risk.querySelector(".mfs-pv")!.textContent).toBe("Not scored");
    expect((risk.querySelector(".mfs-bar i") as HTMLElement).style.width).toBe("0%");
  });
  it("the breakdown table shows the same figures in the This fund column", () => {
    render(<ScoreBreakdown s={score([58.3, 81, 55, 61.9])} />);
    const parts = screen.getAllByRole("table")[0];
    expect([...parts.querySelectorAll("tbody tr")].map((r) => [...r.children].map((c) => c.textContent))).toEqual([
      ["Performance", "58.3Fair", "Fair"], ["Risk", "81.0Strong", "Fair"], ["Cost", "55.0Fair", "Fair"], ["Quality", "61.9Fair", "Fair"]]);
  });
});
