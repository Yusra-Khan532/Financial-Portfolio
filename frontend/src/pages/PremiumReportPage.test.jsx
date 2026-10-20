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
