// Logic of the Prism report page: equal arcs, readings, factor filters and sorting, threshold ticks, history series, and the
// automatic fifth part. Fixtures are real-engine outputs (the example) and the production RELIANCE report, as the research API sends them
// (through the public view: readings, no weights or points).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { PrismReportView } from "../components/prism/ReportView";
import reliance from "./__fixtures__/prismReliance.json";
import example from "./__fixtures__/prismReport.json";
import variants from "./__fixtures__/prismVariants.json";
import { readingOf, type PrismMetric, type PrismReport } from "./prism";
import {
  THRESHOLDS, arcSegments, bandLabel, daysBefore, filterFactors, monthIndex, peerRows, ratioPct,
  sortFactors, thresholdTicks, topFactors, yoy,
} from "./prismReport";

const E = example as unknown as PrismReport, R = reliance as unknown as PrismReport, V = variants as unknown as { notRated: PrismReport; limited: PrismReport };

describe("the method stays on the server", () => {
  it("the fixtures carry readings and no weight, point or cut-off", () => {
    const text = JSON.stringify([E, R, V]);
    for (const k of ["partWeights", "pointsLost", "pointsEarned", "capPointsLost", "\"weight\"", "\"points\"", "\"best\"", "\"worst\"", "redBoundary", "modelVersion"]) expect(text).not.toContain(k);
    expect(R.rating.metrics.filter((m) => m.status !== "N" && m.status !== "L").every((m) => readingOf(m) != null)).toBe(true);
  });
  it("the report page never shows a weight, a share of the score or points", () => {
    const html = renderToStaticMarkup(<MemoryRouter><PrismReportView report={R} /></MemoryRouter>);
    for (const t of ["% of the overall score", "Counts for", "weighted", "Points", "What moved the score", "Model 3.", "How this is calculated", "Data completeness and freshness"]) expect(html).not.toContain(t);
    expect(html).toContain("Disclaimer");
    expect(html).toContain("not all of them are shown in this report");
  });
});

describe("prism ring arcs", () => {
  it("arcs are equal (their length says nothing about weight) and the fill follows the score", () => {
    const segs = arcSegments(R.rating, 0);
    expect(segs.map((s) => s.key)).toEqual(["fundamental", "valuation", "quality", "risk"]);
    expect(segs.map((s) => s.span)).toEqual([0.25, 0.25, 0.25, 0.25].map((x) => expect.closeTo(x, 9)));
    expect(segs[0].fill).toBeCloseTo(0.25 * R.rating.parts.fundamental! / 100, 9);
    expect(segs[3].start).toBeCloseTo(0.75, 9);
  });
  it("draws no fill for a company that is not rated", () => {
    expect(arcSegments(V.notRated.rating).every((s) => s.fill === 0 && s.score === null)).toBe(true);
  });
  it("adds a fifth arc when the data has a technical part", () => {
    const r = { ...R.rating, parts: { ...R.rating.parts, technical: 60 } };
    const segs = arcSegments(r, 0);
    expect(segs).toHaveLength(5);
    expect(segs[0].span).toBeCloseTo(0.2, 9);
    expect(segs[4].key).toBe("technical");
  });
});

describe("threshold ticks and bands", () => {
  it("are the label thresholds", () => { expect(thresholdTicks()).toEqual([35, 50, 65, 80]); expect(THRESHOLDS).toEqual([35, 50, 65, 80]); });
  it("map a score to the model's label", () => {
    expect([bandLabel(34.9), bandLabel(35), bandLabel(50), bandLabel(65), bandLabel(80), bandLabel(null)]).toEqual(["POOR", "WEAK", "AVERAGE", "HEALTHY", "STRONG", "NOT RATED"]);
  });
});

describe("factor filters and sorting", () => {
  const rows = R.rating.metrics;
  it("strengths read Strong or Very strong, concerns Weak or Very weak, estimated means F or L", () => {
    expect(filterFactors(rows, "strengths").length).toBeGreaterThan(0);
    expect(filterFactors(rows, "strengths").every((r) => ["strong", "very_strong"].includes(readingOf(r)!))).toBe(true);
    expect(filterFactors(rows, "concerns").every((r) => ["weak", "very_weak"].includes(readingOf(r)!))).toBe(true);
    expect(filterFactors(rows, "all")).toHaveLength(rows.length);
    const lim = V.limited.rating.metrics;
    const est = filterFactors(lim, "estimated");
    expect(est.length).toBeGreaterThan(0);
    expect(est.every((r) => r.status === "F" || r.status === "L")).toBe(true);
    expect(filterFactors(lim, "strengths").some((r) => r.status === "F" || r.status === "L")).toBe(false);
  });
  it("sorts by reading, keeps ties in model order and puts factors without a reading last", () => {
    const mk = (m: string, reading: PrismMetric["reading"]) => ({ metric: m, reading }) as PrismMetric;
    const list = [mk("a", "middle"), mk("b", null), mk("c", "very_strong"), mk("d", "middle"), mk("e", "very_weak")];
    expect(sortFactors(list, "high").map((r) => r.metric)).toEqual(["c", "a", "d", "e", "b"]);
    expect(sortFactors(list, "low").map((r) => r.metric)).toEqual(["e", "a", "d", "c", "b"]);
    expect(sortFactors(list, "model")).toBe(list);
  });
  it("picks a top strength and a biggest drag from real factors only", () => {
    const { strength, drag } = topFactors(R.rating.metrics.filter((m) => m.part === "fundamental"));
    expect(["strong", "very_strong"]).toContain(readingOf(strength!));
    expect(["strong", "very_strong"]).not.toContain(readingOf(drag!));
    const est = [{ metric: "x", status: "F", reading: "very_weak" }, { metric: "y", status: "A", reading: "weak" }, { metric: "z", status: "A", reading: "middle" }] as PrismMetric[];
    expect(topFactors(est).drag!.metric).toBe("y");          // the estimate is never the drag, and the weakest real reading is
  });
});

describe("history series", () => {
  it("reads quarter, month and year labels", () => { expect([monthIndex("2023-03"), monthIndex("Mar 2023"), monthIndex("2023")]).toEqual([2023 * 12 + 2, 2023 * 12 + 2, 2023 * 12]); });
  it("computes year-on-year growth against the same period a year earlier, skipping gaps", () => {
    const g = yoy([{ period: "2021", value: 100 }, { period: "2022", value: 150 }, { period: "2023", value: null }, { period: "2024", value: 200 }]);
    expect(g[0]).toBeNull(); expect(g[1]).toBeCloseTo(50); expect(g[2]).toBeNull(); expect(g[3]).toBeNull();
    const q = yoy([{ period: "2023-03", value: 10 }, { period: "2023-06", value: 12 }, { period: "2024-03", value: 15 }, { period: "2024-06", value: 6 }]);
    expect(q[2]).toBeCloseTo(50); expect(q[3]).toBeCloseTo(-50);
    expect(yoy([{ period: "2023", value: -5 }, { period: "2024", value: 5 }])[1]).toBeNull();
  });
  it("margins are ratios of reported figures and never invented", () => { expect(ratioPct(25, 100)).toBe(25); expect(ratioPct(null, 100)).toBeNull(); expect(ratioPct(5, 0)).toBeNull(); });
  it("counts days from a data date to the calculation", () => { expect(daysBefore("2026-10-23", "2026-10-26T05:00:00+00:00")).toBe(3); expect(daysBefore(null, "2026-10-26")).toBeNull(); });
  it("lists the multiples that have a company figure or a benchmark", () => {
    const rows = peerRows(R);
    expect(rows.map((r) => r.key)).toEqual(["pe", "pb", "ev_ebitda"]);
    expect(rows[0].benchmark).toBeCloseTo(15.98);
    expect(rows[0].detail!.provider).toBe("Upstox");
  });
});

describe("report rendering", () => {
  it("shows a fifth part card and arc by itself when the model sends a technical part", () => {
    const r = JSON.parse(JSON.stringify(E)) as PrismReport;
    r.rating.parts.technical = 61.2; r.rating.coverage.technical = 1;
    const html = renderToStaticMarkup(<MemoryRouter><PrismReportView report={r} /></MemoryRouter>);
    expect(html).toMatch(/Technical 61 of 100: [A-Za-z]+\./);       // the fifth component of the ring, without a weight
    expect(html).not.toContain("Counts for");
    expect(html).not.toContain("Technical part coming soon");
  });
  it("marks the locked preview as an example", () => {
    expect(renderToStaticMarkup(<MemoryRouter><PrismReportView report={E} example /></MemoryRouter>)).toContain("A fictional company, to show the layout");
  });
  it("renders the real RELIANCE report with its readings, key ratios as tables and benchmark", () => {
    const html = renderToStaticMarkup(<MemoryRouter><PrismReportView report={R} /></MemoryRouter>);
    expect(html).toContain("Sector P/E benchmark 15.98×");
    expect(html).toMatch(/class="pzr-rd (very_strong|strong|middle|weak|very_weak)">(Very strong|Strong|Middle|Weak|Very weak)</);
    for (const t of ["Valuation multiple", "Own 5-year median", "Per share and size", "Balance sheet and profit", "Risk and trading", "How to read this report", "Notes"]) expect(html).toContain(t);
  });
});
