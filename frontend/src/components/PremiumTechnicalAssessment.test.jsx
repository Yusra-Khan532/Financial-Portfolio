import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";
import PremiumTechnicalAssessment from "./PremiumTechnicalAssessment";

const part = { score: null, rating: "Unavailable", horizon: "5–20 sessions", availableCount: 1, requiredCount: 2, factors: [
  { key: "ema", label: "EMA alignment", status: "available", signal: 1, weight: 10, detail: "EMA 9 is above EMA 20." },
  { key: "sfp", label: "Swing failure", status: "unavailable", signal: null, weight: 8, detail: "Swing confirmation rules are not specified." },
  { key: "sector", label: "Sector relative strength", status: "disabled", signal: null, weight: 4 },
] };
const assessment = { asOf: "2026-10-23", provider: "FinEdge", shortTerm: part, longTerm: {...part, horizon: "6–18 months"}, verdict: {label: "Unavailable", tone: "muted"}, notes: ["Scores are unavailable until all required signals can be calculated."] };

test("shows incomplete scores, available signals and precise missing rules without weights", () => {
  const html = renderToStaticMarkup(<PremiumTechnicalAssessment assessment={assessment} />);
  const content = html.replace(/<[^>]*>/g, "");
  for (const term of ["Short &amp; long-term assessment", "5–20 sessions", "6–18 months", "Combined verdict", "Unavailable", "1 of 2", "Supportive", "Swing confirmation rules", "FinEdge"]) expect(content).toContain(term);
  expect(html).not.toContain("weight");
  expect(html).not.toContain("0.0");
});

test("uses returned scores and verdict without frontend rescoring", () => {
  const ready = {...assessment, shortTerm: {...part, score: -20, rating: "Reduce"}, longTerm: {...part, score: 19, rating: "Hold", stageCapped: true}, verdict: {label: "REDUCE", tone: "negative"}};
  const html = renderToStaticMarkup(<PremiumTechnicalAssessment assessment={ready} />);
  expect(html).toContain("-20.0");
  expect(html).toContain("+19.0");
  expect(html).toContain("REDUCE");
  expect(html).toContain("Limited by the current market stage");
});

test("legacy snapshots remain viewable without inventing a technical assessment", () => {
  expect(renderToStaticMarkup(<PremiumTechnicalAssessment />)).toBe("");
});
