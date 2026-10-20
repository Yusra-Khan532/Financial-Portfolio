import { premiumReportReview } from "./premiumReportReview";

test("older snapshots keep zero values, separate missing factors and respect category boundaries", () => {
  const row = (metric, points, status, value) => ({part: "risk", metric, label: metric, points, status, value, unit: "%"});
  const report = {rating: {status: "RATED", parts: {risk: 50}, metrics: [row("PLEDGE", 100, "A", 0), row("missing", 50, "F", null), row("low",39.9,"A",10), row("mixed",40,"A",20), row("excluded",null,"N",null)]}};
  const part = premiumReportReview(report).parts[3];
  expect(part.pros.map(r => r.metric)).toEqual(["PLEDGE"]);
  expect(part.pros[0].valueText).toBe("0 %");
  expect(part.cons.map(r => r.metric)).toEqual(["low"]);
  expect(part.mixed.map(r => r.metric)).toEqual(["mixed"]);
  expect(part.unavailable.map(r => r.metric)).toEqual(["missing"]);
});

test("uses the report's commentary and withholds category scores when unrated", () => {
  const review = {parts: [], notes: []};
  expect(premiumReportReview({review})).toBe(review);
  expect(premiumReportReview({rating:{status:"NOT RATED",parts:{risk:50},metrics:[]}}).parts[3].score).toBeNull();
});
