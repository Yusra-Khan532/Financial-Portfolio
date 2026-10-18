import { buildFundamentalGrowth } from "./fundamentalGrowth";
const row = (category, points) => ({ category, history: points.map(([period, value]) => ({ period, value })) });
test("calculates annual revenue, net profit and EPS growth using exact previous years", () => {
  const result = buildFundamentalGrowth([
    row("revenue", [["2026", 120], ["2025", 100]]),
    row("net_profit", [["2026", 15], ["2025", 20]]),
    row("basicreinr", [["2026", 3], ["2025", 2]]),
  ]);
  expect(result[1]).toMatchObject({ revenue: 20, profit: -25, eps: 50 });
  expect(result[1].epsDetail).toMatchObject({ current: 3, previous: 2, comparison: "2025" });
});
test("quarterly YoY compares the same quarter last year and QoQ the preceding quarter", () => {
  const rows = [row("revenue", [["Jun 2026", 150], ["Mar 2026", 125], ["Jun 2025", 100]])];
  expect(buildFundamentalGrowth(rows, "quarterly", "yoy").at(-1).revenue).toBe(50);
  expect(buildFundamentalGrowth(rows, "quarterly", "qoq").at(-1).revenue).toBe(20);
});
test("preserves zero current values, gaps and non-meaningful negative or zero baselines", () => {
  const result = buildFundamentalGrowth([
    row("revenue", [["2026", 0], ["2025", 100], ["2023", 10]]),
    row("net_profit", [["2026", 5], ["2025", -10]]),
    row("eps", [["2026", 1], ["2025", 0]]),
  ]);
  expect(result.at(-1)).toMatchObject({ revenue: -100, profit: null, eps: null });
  expect(result.find((point) => point.period === "2024").revenue).toBeNull();
  expect(result.find((point) => point.period === "2025").revenue).toBeNull();
  expect(result.at(-1).profitDetail.reason).toMatch(/negative/);
});
test("uses history beyond the six visible years for the first growth comparison", () => {
  const points = Array.from({ length: 7 }, (_, i) => [String(2020 + i), 100 + i * 10]);
  const result = buildFundamentalGrowth([row("revenue", points)]);
  expect(result).toHaveLength(6);
  expect(result[0].revenue).toBe(10);
});
test("missing EPS does not become zero and TTM is excluded", () => {
  const result = buildFundamentalGrowth([row("revenue", [["2026", null], ["2025", 10], ["TTM", 20]])]);
  expect(result).toHaveLength(2);
  expect(result.at(-1).revenue).toBeNull();
  expect(result.at(-1).eps).toBeNull();
  expect(buildFundamentalGrowth([])).toEqual([]);
});
