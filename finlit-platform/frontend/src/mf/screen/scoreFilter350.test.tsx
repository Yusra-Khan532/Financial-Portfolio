// @vitest-environment jsdom
// Task #350: the Mutual Fund Screener's "FinLit Mutual Fund Score" group: the total and the four parts (Performance, Risk, Cost, Quality), each with its
// own (i), min and max, presets, the range on and Clear; each independent, joined with AND by the server; invalid ranges never applied; Gold only.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ScoreFilters } from "./ScoreFilter";
import { DEFAULTS, apiParams, chipsFor, parseQuery, queryToParams, withScore, type SQ } from "../../lib/mfScreen";
import { PART_PRESETS, SCORE_HELP, TOTAL_PRESETS, parseScores, scoreRangeError } from "../../lib/mfScoreFilter";
import { SCORE_BANDS } from "../../lib/mfScore";

afterEach(cleanup);
let last: SQ = DEFAULTS;
function Harness({ gold = true, start = DEFAULTS }: { gold?: boolean; start?: SQ }) {
  const [q, setQ] = useState<SQ>(start);
  last = q;
  return <MemoryRouter><ScoreFilters sc={q.sc} canScore={gold} onSet={(f, lo, hi) => setQ((s) => withScore(s, f, lo, hi))} /></MemoryRouter>;
}
const block = (name: string) => screen.getByRole("region", { name: new RegExp("^" + name) });

describe("the score ranges in the address and to the server", () => {
  it("the total and each part round-trip on their own, in a fixed order", () => {
    const q = withScore(withScore(withScore(DEFAULTS, "risk", "70", ""), "total", "65", "80"), "cost", "", "50");
    expect(apiParams(q).getAll("sc")).toEqual(["total:65:80", "risk:70:", "cost::50"]);
    expect(parseQuery(queryToParams(q)).sc).toEqual({ total: ["65", "80"], risk: ["70", ""], cost: ["", "50"] });
  });
  it("clearing one range leaves the others", () => {
    const q = withScore(withScore(DEFAULTS, "total", "65", "80"), "quality", "50", "70");
    expect(withScore(q, "total", "", "").sc).toEqual({ quality: ["50", "70"] });
  });
  it("invalid ranges from the address are dropped, never trusted", () => {
    expect(parseScores(["perf:55:100", "total:80:65", "total:-1:", "bogus:1:2", "risk:70:", "total:61.5:72.25", "total:101:"])).toEqual({ risk: ["70", ""], total: ["61.5", "72.25"] });
    expect(scoreRangeError("total", "80", "65")).toMatch(/below the maximum/);
    expect(scoreRangeError("perf", "55", "")).toMatch(/bands/);
    expect(scoreRangeError("total", "", "120")).toMatch(/0 to 100/);
  });
  it("each range is a removable chip that clears only itself", () => {
    const q = withScore(withScore(DEFAULTS, "total", "65", "80"), "risk", "70", "");
    const chips = chipsFor(q).filter((c) => c.id.startsWith("sc:"));
    expect(chips.map((c) => c.label)).toEqual(["Mutual Fund Score: Healthy (65 to under 80)", "Risk: Strong (70 or more)"]);
    expect(chips[0].clear(q).sc).toEqual({ risk: ["70", ""] });
  });
  it("presets have no gap and no overlap: the total uses the model's labels, a part its three words", () => {
    expect(TOTAL_PRESETS.map((p) => p.label)).toEqual(["Poor under 35", "Weak 35–50", "Average 50–65", "Healthy 65–80", "Strong 80+"]);
    for (let i = 1; i < TOTAL_PRESETS.length; i++) expect(TOTAL_PRESETS[i].lo).toBe(TOTAL_PRESETS[i - 1].hi);
    expect(SCORE_BANDS.length).toBe(TOTAL_PRESETS.length);
    expect(PART_PRESETS.map((p) => [p.lo, p.hi])).toEqual([["", "50"], ["50", "70"], ["70", ""]]);
  });
  it("every (i) says what it measures, what goes in, how to read it, and describes without advising", () => {
    const words = /\b(buy|sell|hold|reduce|avoid|accumulate|target|best|top pick|multibagger)\b/i;
    for (const g of Object.values(SCORE_HELP)) {
      expect(g.what && g.read && g.note).toBeTruthy();
      expect(JSON.stringify(g)).not.toMatch(words);
    }
  });
});

describe("the score group on the page", () => {
  it("shows the total and the four parts by their own names, each with an (i), min, max and presets", () => {
    render(<Harness />);
    for (const n of ["Total score", "Performance", "Risk", "Cost", "Quality"]) {
      const b = block(n);
      expect(within(b).getByRole("button", { name: /^What is/ })).toBeTruthy();
      expect(within(b).getByLabelText("Min")).toBeTruthy(); expect(within(b).getByLabelText("Max (below)")).toBeTruthy();
      expect(within(b).getAllByRole("button", { pressed: false }).length).toBeGreaterThanOrEqual(3);
    }
  });
  it("a preset fills min and max, shows the range on, and a second press clears it; other ranges are untouched", () => {
    render(<Harness />);
    fireEvent.click(within(block("Risk")).getByRole("button", { name: "Strong 70+" }));
    fireEvent.click(within(block("Total score")).getByRole("button", { name: "Healthy 65–80" }));
    expect(last.sc).toEqual({ risk: ["70", ""], total: ["65", "80"] });
    expect((within(block("Total score")).getByLabelText("Min") as HTMLInputElement).value).toBe("65");
    expect((within(block("Risk")).getByLabelText("Min") as HTMLSelectElement).value).toBe("70");
    expect(block("Total score").textContent).toMatch(/On: 65 to under 80 \(Healthy\)/);
    fireEvent.click(within(block("Total score")).getByRole("button", { name: /Healthy 65–80/ }));
    expect(last.sc).toEqual({ risk: ["70", ""] });
  });
  it("typed min and max apply on Enter or leaving the box; an invalid range is explained and not applied", () => {
    render(<Harness />);
    const b = block("Total score"), min = within(b).getByLabelText("Min"), max = within(b).getByLabelText("Max (below)");
    fireEvent.change(min, { target: { value: "61.5" } }); fireEvent.keyDown(min, { key: "Enter" });
    expect(last.sc).toEqual({ total: ["61.5", ""] });
    fireEvent.change(max, { target: { value: "40" } }); fireEvent.blur(max);
    expect(within(b).getByRole("alert").textContent).toMatch(/below the maximum/);
    expect(last.sc).toEqual({ total: ["61.5", ""] });
    fireEvent.change(max, { target: { value: "90" } }); fireEvent.blur(max);
    expect(last.sc).toEqual({ total: ["61.5", "90"] });
  });
  it("a part's min and max offer its band edges only", () => {
    render(<Harness />);
    const sel = within(block("Cost")).getByLabelText("Min") as HTMLSelectElement;
    expect([...sel.options].map((o) => o.value)).toEqual(["", "50", "70"]);
    fireEvent.change(sel, { target: { value: "50" } });
    expect(last.sc).toEqual({ cost: ["50", ""] });
  });
  it("each Clear clears only its own range", () => {
    render(<Harness start={withScore(withScore(DEFAULTS, "perf", "70", ""), "quality", "", "50")} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear the Performance range" }));
    expect(last.sc).toEqual({ quality: ["", "50"] });
  });
  it("is locked for plans without Gold, with a link to the Gold plan", () => {
    render(<Harness gold={false} />);
    expect(screen.queryByLabelText("Min")).toBeNull();
    expect(screen.getByRole("link", { name: "See the Gold plan" }).getAttribute("href")).toBe("/plans#gold");
  });
});
