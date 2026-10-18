const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const number = (value) => value === null || value === undefined || value === "" || typeof value === "boolean" || !Number.isFinite(Number(value)) ? null : Number(value);
function indexOfPeriod(label, period) {
  const text = String(label || "");
  const year = text.match(/\b(19\d{2}|20\d{2})\b/);
  if (!year || /TTM|YTD/i.test(text)) return null;
  if (period === "yearly") return Number(year[1]);
  const month = months.findIndex((name) => new RegExp(`^${name}\\b`, "i").test(text));
  if (month >= 0) return Number(year[1]) * 12 + month;
  const quarter = text.match(/^Q([1-4])\s/);
  return quarter ? Number(year[1]) * 12 + Number(quarter[1]) * 3 - 1 : null;
}
const keyOf = (row) => String(row.category || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const GROWTH_METRICS = [
  { key: "revenue", label: "Revenue growth", aliases: ["revenue"], color: "#F5A623" },
  { key: "profit", label: "Net profit growth", aliases: ["netprofit"], color: "#68BDA4" },
  { key: "eps", label: "EPS growth", aliases: ["eps", "basicreinr", "basiceps", "dilutedreinr", "dilutedeps"], color: "#8DAEF1" },
];

export function buildFundamentalGrowth(rows = [], period = "yearly", basis = "yoy") {
  const series = GROWTH_METRICS.map((metric) => {
    const row = metric.aliases.map((alias) => rows.find((item) => keyOf(item) === alias && item.history?.length)).find(Boolean);
    const values = new Map();
    (row?.history || []).forEach((point) => { const index = indexOfPeriod(point.period, period); if (index !== null) values.set(index, { period: point.period, value: number(point.value) }); });
    return { ...metric, values };
  });
  const indices = series.flatMap((metric) => [...metric.values.keys()]);
  if (!indices.length) return [];
  const step = period === "yearly" ? 1 : 3;
  const lag = period === "yearly" ? 1 : basis === "qoq" ? 3 : 12;
  const end = Math.max(...indices);
  const start = Math.max(Math.min(...indices), end - step * (period === "yearly" ? 5 : 23));
  const result = [];
  for (let index = start; index <= end; index += step) {
    const fallback = period === "yearly" ? String(index) : `${months[index % 12]} ${Math.floor(index / 12)}`;
    const row = { period: series.map((metric) => metric.values.get(index)?.period).find(Boolean) || fallback };
    series.forEach((metric) => {
      const current = metric.values.get(index)?.value ?? null;
      const previousPoint = metric.values.get(index - lag);
      const previous = previousPoint?.value ?? null;
      const reason = current === null ? "Reported value unavailable" : previous === null ? "Matching comparison period unavailable" : previous <= 0 ? "Zero or negative comparison value" : null;
      row[metric.key] = reason ? null : (current - previous) / previous * 100;
      row[`${metric.key}Detail`] = { current, previous, comparison: previousPoint?.period || null, reason };
    });
    result.push(row);
  }
  return result;
}
