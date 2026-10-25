import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";
import { ReportDetail } from "./PremiumReportPage";

jest.mock("react-router-dom", () => ({ Link: () => null, useNavigate: jest.fn(), useParams: () => ({}) }));
jest.mock("@/components/CompanyBrowser", () => () => null);
jest.mock("@/components/cms/AdminShell", () => ({children}) => children);

const keys = ["fundamental", "valuation", "quality", "risk"];
const report = {
  id: "internal-report-id", company: {name: "Example Bank", symbol: "EXAMPLE", industry: "Bank"},
  statementType: "standalone", createdAt: "2026-10-19T12:00:00Z", trends: [], inputMeta: {},
  rating: {status: "RATED", label: "AVERAGE", final: 55, confidence: .9, judgedQuarters: 10, modelVersion: "internal-model-version", group: "BANK", parts: Object.fromEntries(keys.map(k => [k, 55])), coverage: Object.fromEntries(keys.map(k => [k, .9]))},
  review: {notes:["Capital adequacy is unavailable."], parts: keys.map(key => ({key, name: key, score: 55, pros:[{metric:"pro", label:"Strong factor", valueText:"10%", summary:"Supports this category."}], cons:[{metric:"con", label:"Weak factor", valueText:"1%", summary:"Holds back this category."}], mixed:[], unavailable:[]}))},
};

test("report shows pros and cons in every category without weights or technical appendix", () => {
  const html = renderToStaticMarkup(<ReportDetail report={report} />);
  for (const key of keys) expect(html).toContain(`aria-label="${key} factors"`);
  expect(html.match(/>Pros</g)).toHaveLength(4);
  expect(html.match(/>Cons</g)).toHaveLength(4);
  expect(html).toContain("Capital adequacy is unavailable.");
  for (const term of ["weight", "calculation trail", "Source audit", "Input hash", "internal-model-version", "internal-report-id"]) expect(html).not.toContain(term);
});

test("report shows the loss limit beside the Fundamental score", () => {
  const note = "The Fundamental score is limited to 30/100 because net profit over the last 4 quarters is zero or negative.";
  const lossReport = {...report, review: {...report.review, parts: report.review.parts.map((part) => part.key === "fundamental" ? {...part, score: 30, notes: [note]} : part)}};
  const html = renderToStaticMarkup(<ReportDetail report={lossReport} />);
  expect(html).toContain(note);
  expect(html.indexOf(note)).toBeGreaterThan(html.indexOf('aria-label="fundamental factors"'));
  expect(html.indexOf(note)).toBeLessThan(html.indexOf('aria-label="valuation factors"'));
  expect(html).not.toContain("LOSS_CAP");
});

test("report shows the actual benchmark value, source and coverage used", () => {
  const comparisonText = "Company P/E: 15.21x. Industry peer median: 30.00x. Source: FinEdge. Uses 74 positive multiples; 122 of 137 peer records available.";
  const sample = {...report, review: {...report.review, parts: report.review.parts.map((part) => part.key === "valuation" ? {...part, pros: [{metric: "PE_VS_INDUSTRY", label: "P/E vs industry", valueText: "0.51x", summary: "Supports the assessment.", comparisonText}]} : part)}};
  expect(renderToStaticMarkup(<ReportDetail report={sample} />)).toContain(comparisonText);
});

test("report displays the actual CAGR lookback and year endpoints", () => {
  const sample = {...report, review: {...report.review, parts: report.review.parts.map((part) => part.key === "fundamental" ? {...part, pros: [{metric: "SALES_CAGR", label: "Revenue CAGR (1-year)", valueText: "12.00%", summary: "Strong revenue growth over the 1-year period.", comparisonText: "Period used: 2025 to 2026."}]} : part)}};
  const html = renderToStaticMarkup(<ReportDetail report={sample} />);
  expect(html).toContain("Revenue CAGR (1-year)");
  expect(html).toContain("Period used: 2025 to 2026.");
});

test("report exposes missing dependencies and short histories together", () => {
  const sample = {...report, review: {...report.review, completeness: {
    complete:false, missingFactorCount:1, limitedHistoryCount:1,
    items:[{metric:"INTEREST_COVER", category:"Quality", label:"Interest cover", reason:"Annual P&L interest expense.", treatment:"Group estimate used: 50/100."},
      {metric:"SALES_STREAK", category:"Fundamental", label:"Net premium income streak", reason:"Quarterly income history (6 of 14 observations available).", treatment:"2 of 10 year-on-year comparisons available."}]
  }}};
  const html=renderToStaticMarkup(<ReportDetail report={sample} />);
  expect(html).toContain('aria-label="Input completeness"');
  expect(html).toContain('Annual P&amp;L interest expense.');
  expect(html).toContain('Group estimate used: 50/100.');
  expect(html).toContain('6 of 14');
  expect(html).toContain('2 of 10 year-on-year comparisons');
});

test("a legacy report cannot claim all inputs were checked", () => {
  const html=renderToStaticMarkup(<ReportDetail report={report} />);
  expect(html).toContain('Recalculate this report to see the latest missing-input');
  expect(html).not.toContain('All applicable scoring factors have usable inputs');
});
