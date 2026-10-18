import { CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildFundamentalGrowth, GROWTH_METRICS } from "@/lib/fundamentalGrowth";
export const growthPercent = (value) => value == null ? "N/M" : `${value > 0 ? "+" : ""}${value.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`;
const amount = (value) => value == null ? "N/A" : value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
function GrowthTooltip({ active, payload, metrics, unit }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return <div className="max-w-72 rounded-lg border border-[#233650] bg-[#07182F] p-3 text-xs text-[#CBD5E1] shadow-xl"><p className="font-medium text-white">{row.period}</p>{metrics.map((metric) => { const detail = row[`${metric.key}Detail`]; return <div key={metric.key} className="mt-3"><p style={{ color: metric.color }}>{metric.label}: {growthPercent(row[metric.key])}</p><p>Reported: {amount(detail.current)} {metric.key === "eps" ? "₹/share" : unit}</p><p>{detail.comparison || "Comparison"}: {amount(detail.previous)} {metric.key === "eps" ? "₹/share" : unit}</p>{detail.reason ? <p className="text-[#94A3B8]">{detail.reason}</p> : null}</div>; })}</div>;
}
export default function IncomeGrowthView({ rows, period, basis, unit, isBank }) {
  const data = buildFundamentalGrowth(rows, period, basis);
  const latest = data[data.length - 1];
  const metrics = GROWTH_METRICS.map((metric) => metric.key === "revenue" && isBank ? { ...metric, label: "Interest earned growth" } : metric);
  const hasValues = data.some((row) => metrics.some((metric) => row[metric.key] !== null));
  return <>
    <div className="mb-5 grid grid-cols-3 gap-2">{metrics.map((metric) => <div key={metric.key} className="min-w-0 rounded-lg border border-[#233650] bg-[#0B1D30] p-3"><p className="text-[11px] text-[#94A3B8]">{metric.label}</p><p title={latest?.[`${metric.key}Detail`]?.reason || ""} className="mt-2 text-xl font-semibold tabular-nums sm:text-2xl" style={{ color: latest?.[metric.key] < 0 ? "#C98182" : metric.color }}>{latest ? growthPercent(latest[metric.key]) : "N/A"}</p><p className="mt-1 text-[10px] text-[#71839A]">{latest?.period || "No history"}</p></div>)}</div>
    {hasValues ? <div className="stock-chart-frame h-64 min-w-0 sm:h-80" role="img" aria-label="Revenue, net profit and EPS percentage growth chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
      <CartesianGrid stroke="#233650" vertical={false} strokeDasharray="3 4" />
      <XAxis dataKey="period" stroke="#94A3B8" fontSize={10} axisLine={false} tickLine={false} minTickGap={24} />
      <YAxis stroke="#94A3B8" fontSize={10} width={52} axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(value)}%`} />
      <ReferenceLine y={0} stroke="#71839A" />
      <Tooltip filterNull={false} content={<GrowthTooltip metrics={metrics} unit={unit} />} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      {metrics.map((metric) => <Line key={metric.key} type="linear" dataKey={metric.key} name={metric.label} stroke={metric.color} strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={{ r: 5 }} connectNulls={false} />)}
    </ComposedChart></ResponsiveContainer></div> : <p className="flex h-64 items-center justify-center text-sm text-[#94A3B8]">Not enough comparable data to plot growth.</p>}
    <p className="mt-4 text-[11px] leading-relaxed text-[#71839A]">Growth = (current − comparison) ÷ comparison × 100. N/M means the reported or comparison value is missing, or the comparison value is zero or negative. Chart gaps are preserved.</p>
  </>;
}
