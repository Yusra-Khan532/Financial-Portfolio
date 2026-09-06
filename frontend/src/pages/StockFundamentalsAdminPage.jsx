import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, RefreshCcw, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import AdminShell from "@/components/cms/AdminShell";
import { cmsRequest, formatCmsDateTime } from "@/lib/cms";

const GOLD = "#F5A623";
const TEAL = "#75B89B";
const RED = "#C98182";
const BLUE = "#7AA7E8";
const MUTED = "#94A3B8";

const DEFAULT_QUERY = "RELIANCE";
const YEARLY_PERIOD_LIMIT = 6;
const QUARTERLY_PERIOD_LIMIT = YEARLY_PERIOD_LIMIT * 4;
const PRICE_RANGES = [
  { id: "1m", label: "1M", months: 1 },
  { id: "6m", label: "6M", months: 6 },
  { id: "1y", label: "1Yr", months: 12 },
  { id: "3y", label: "3Yr", months: 36 },
  { id: "5y", label: "5Yr", months: 60 },
  { id: "max", label: "Max", months: null },
];
const DASHBOARD_TABS = [
  { id: "summary", label: "Summary" },
  { id: "price-chart", label: "Chart" },
  { id: "profit-loss", label: "P&L" },
  { id: "balance-sheet", label: "Balance Sheet" },
  { id: "cash-flow", label: "Cash Flow" },
  { id: "ratios", label: "Ratios" },
  { id: "shareholding", label: "Shareholding" },
  { id: "competitors", label: "Peers" },
  { id: "corporate-actions", label: "Actions" },
];

function compactNumber(value, options = {}) {
  if (value === null || value === undefined || value === "") return "N/A";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: options.decimals ?? 2,
    notation: options.compact ? "compact" : "standard",
  }).format(number);
}

function valueWithUnit(value, unit) {
  const formatted = compactNumber(value, { compact: Math.abs(Number(value)) >= 100000 });
  return unit && formatted !== "N/A" ? `${formatted} ${unit}` : formatted;
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace("%", ""));
  return Number.isFinite(number) ? number : null;
}

function movingAverage(items, index, windowSize) {
  if (index + 1 < windowSize) return null;
  const slice = items.slice(index + 1 - windowSize, index + 1);
  const values = slice.map((item) => Number(item.close)).filter(Number.isFinite);
  if (values.length !== windowSize) return null;
  return values.reduce((sum, value) => sum + value, 0) / windowSize;
}

function priceChartData(history) {
  const rows = [...(history || [])]
    .filter((row) => row.date && Number.isFinite(Number(row.close)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return rows.map((row, index) => ({
    date: row.date,
    label: new Date(`${row.date}T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
    price: Number(row.close),
    volume: Number(row.volume) || 0,
    dma50: movingAverage(rows, index, 50),
    dma200: movingAverage(rows, index, 200),
  }));
}

function filterPriceRange(rows, rangeId) {
  const selectedRange = PRICE_RANGES.find((range) => range.id === rangeId) || PRICE_RANGES[2];
  if (!selectedRange.months || rows.length < 2) return rows;
  const latest = new Date(`${rows[rows.length - 1].date}T00:00:00`);
  if (Number.isNaN(latest.getTime())) return rows;
  const cutoff = new Date(latest);
  cutoff.setMonth(cutoff.getMonth() - selectedRange.months);
  return rows.filter((row) => new Date(`${row.date}T00:00:00`) >= cutoff);
}

function descriptionBullets(description) {
  const matches = String(description || "").replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]?/g) || [];
  const bullets = matches.map((item) => item.trim()).filter(Boolean).slice(0, 5);
  return bullets.length ? bullets : [description].filter(Boolean);
}

function ratioByName(ratios, name) {
  return (ratios || []).find((ratio) => String(ratio.name || "").toUpperCase() === name.toUpperCase());
}

function ratioComparisonData(ratios, names) {
  return names.map((name) => {
    const ratio = ratioByName(ratios, name);
    return {
      name,
      company: numericValue(ratio?.company_value),
      sector: numericValue(ratio?.sector_value),
    };
  }).filter((row) => row.company !== null || row.sector !== null);
}

function categoryHistory(rows, category) {
  const item = (rows || []).find((row) => row.category === category);
  return item?.history || [];
}

function uniquePeriodsFromHistory(rows, field = "history") {
  return Array.from(new Set((rows || []).flatMap((row) => (row?.[field] || []).map((point) => point.period).filter(Boolean))));
}

function financialPeriodLimit(period) {
  return period === "quarterly" ? QUARTERLY_PERIOD_LIMIT : YEARLY_PERIOD_LIMIT;
}

function limitHistoryRows(rows, period) {
  const limit = financialPeriodLimit(period);
  return (rows || []).map((row) => ({
    ...row,
    history: (row.history || []).slice(0, limit),
  }));
}

function limitPeriods(items, period) {
  return (items || []).slice(-financialPeriodLimit(period));
}

function periodListLabel(periods) {
  if (!periods.length) return "No periods returned";
  if (periods.length <= 6) return periods.join(", ");
  return `${periods.slice(0, 3).join(", ")} ... ${periods.slice(-2).join(", ")}`;
}

function combineHistories(rows, series, period = "yearly") {
  const periods = new Map();
  const limitedRows = limitHistoryRows(rows, period);
  series.forEach(({ key, category }) => {
    categoryHistory(limitedRows, category).forEach((point) => {
      const current = periods.get(point.period) || { period: point.period };
      current[key] = Number(point.value) || 0;
      periods.set(point.period, current);
    });
  });
  return Array.from(periods.values()).reverse();
}

function balanceChartData(balanceSheet, period = "yearly") {
  return limitPeriods([...(balanceSheet?.history || [])].reverse(), period).map((row) => ({
    period: row.period,
    assets: Number(row.total_asset) || 0,
    liabilities: Number(row.total_liability) || 0,
  }));
}

function shareholdingChartData(shareholding, period = "yearly") {
  const labels = {
    promoters: "Promoters",
    fii: "FII",
    other_dii: "Other DII",
    mutual_funds: "Mutual Funds",
    retail_and_other: "Retail/Others",
  };
  const periods = new Map();
  (shareholding || []).forEach((row) => {
    (row.history || []).forEach((point) => {
      const current = periods.get(point.period) || { period: point.period };
      current[labels[row.category] || row.label || row.category] = Number(point.value) || 0;
      periods.set(point.period, current);
    });
  });
  return limitPeriods(Array.from(periods.values()).reverse(), period);
}

function latestHistory(rows) {
  return (rows || []).map((row) => ({
    ...row,
    latest: row.history?.[0],
  }));
}

function PriceVolumeChart({ data, symbol, ratios }) {
  const [chartMode, setChartMode] = useState("price");
  const [priceRange, setPriceRange] = useState("1y");
  const [show50, setShow50] = useState(true);
  const [show200, setShow200] = useState(false);
  const chartData = useMemo(() => priceChartData(data), [data]);
  const visibleChartData = useMemo(() => filterPriceRange(chartData, priceRange), [chartData, priceRange]);
  const peData = useMemo(() => ratioComparisonData(ratios, ["P/E"]), [ratios]);
  const moreRatioData = useMemo(() => ratioComparisonData(ratios, ["P/E", "P/B", "ROE", "ROCE"]), [ratios]);
  const ratioData = chartMode === "pe" ? peData : moreRatioData;
  const sampledTicks = useMemo(() => {
    if (visibleChartData.length <= 6) return visibleChartData.map((row) => row.date);
    const step = Math.max(1, Math.floor(visibleChartData.length / 5));
    return visibleChartData.filter((_, index) => index % step === 0).map((row) => row.date);
  }, [visibleChartData]);

  return (
    <DataSection
      id="price-chart"
      title="Price Chart"
      subtitle={chartData.length ? `${symbol || "Stock"} price and traded volume from Upstox historical candles.` : "Historical candles were not returned for this stock."}
    >
      <div className="mb-5 space-y-3">
        {chartMode === "price" ? (
          <div className="flex flex-wrap gap-2">
            {PRICE_RANGES.map((range) => (
              <button
                key={range.id}
                type="button"
                onClick={() => setPriceRange(range.id)}
                className={`h-9 rounded-md border px-3 text-xs font-medium transition-colors ${priceRange === range.id ? "border-[#F5A623]/45 bg-[#F5A623]/15 text-[#F5A623]" : "border-white/10 text-[#94A3B8] hover:border-white/20 hover:bg-white/[.04] hover:text-white"}`}
              >
                {range.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex overflow-hidden rounded-lg border border-white/10 bg-[#050E1D]/55 text-sm">
            {[
              ["price", "Price"],
              ["pe", "PE Ratio"],
              ["ratios", "More"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setChartMode(mode)}
                className={`border-l border-white/10 px-4 py-2 font-medium first:border-l-0 ${chartMode === mode ? "bg-[#F5A623]/15 text-[#F5A623]" : "text-[#94A3B8] hover:bg-white/[.04] hover:text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {chartMode === "price" ? <div className="flex flex-wrap gap-3 text-sm text-[#CBD5E1]">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked readOnly className="h-4 w-4 accent-[#F5A623]" />
              Price on NSE
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={show50} onChange={(event) => setShow50(event.target.checked)} className="h-4 w-4 accent-[#75B89B]" />
              50 DMA
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={show200} onChange={(event) => setShow200(event.target.checked)} className="h-4 w-4 accent-[#7AA7E8]" />
              200 DMA
            </label>
          </div> : null}
        </div>
      </div>
      {chartMode === "price" && visibleChartData.length ? (
        <div className="h-[320px] min-w-0 sm:h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={visibleChartData} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
              <XAxis
                dataKey="date"
                ticks={sampledTicks}
                tickFormatter={(value) => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}
                stroke="#94A3B8"
                fontSize={10}
                axisLine={false}
                tickLine={false}
              />
              <YAxis yAxisId="price" stroke="#94A3B8" fontSize={10} width={42} axisLine={false} tickLine={false} tickFormatter={(value) => compactNumber(value, { compact: true })} />
              <YAxis yAxisId="volume" orientation="right" hide domain={[0, "dataMax"]} />
              <Tooltip content={<PriceTooltip />} />
              <Bar yAxisId="volume" dataKey="volume" name="Volume" fill="rgba(122,167,232,0.28)" radius={[2, 2, 0, 0]} />
              <Line yAxisId="price" type="monotone" dataKey="price" name="Price" stroke="#F5A623" strokeWidth={2.4} dot={false} />
              {show50 ? <Line yAxisId="price" type="monotone" dataKey="dma50" name="50 DMA" stroke="#75B89B" strokeWidth={1.6} dot={false} connectNulls /> : null}
              {show200 ? <Line yAxisId="price" type="monotone" dataKey="dma200" name="200 DMA" stroke="#7AA7E8" strokeWidth={1.6} dot={false} connectNulls /> : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      {chartMode === "price" && !chartData.length ? (
        <div className="rounded-lg border border-white/10 bg-[#050E1D]/45 p-5 text-sm text-[#94A3B8]">
          Price history will appear here when Upstox returns historical candles for the selected instrument.
        </div>
      ) : null}
      {chartMode !== "price" && ratioData.length ? (
        <div className="h-[280px] min-w-0 sm:h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ratioData}>
              <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
              <XAxis dataKey="name" stroke="#94A3B8" fontSize={11} axisLine={false} tickLine={false} />
              <YAxis stroke="#94A3B8" fontSize={10} width={42} axisLine={false} tickLine={false} />
              <Tooltip content={<MultiTooltip />} />
              <Legend wrapperStyle={{ color: MUTED, fontSize: 12 }} />
              <Bar dataKey="company" name="Company" fill={GOLD} radius={[4, 4, 0, 0]} />
              <Bar dataKey="sector" name="Sector" fill={TEAL} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      {chartMode !== "price" && !ratioData.length ? (
        <div className="rounded-lg border border-white/10 bg-[#050E1D]/45 p-5 text-sm text-[#94A3B8]">
          Ratio chart will appear here when Upstox returns comparable ratio data for this instrument.
        </div>
      ) : null}
    </DataSection>
  );
}

function PriceTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const visible = payload.filter((item) => item.value !== null && item.value !== undefined);
  return (
    <div className="rounded-lg border border-white/10 bg-[#07182F] px-3 py-2 text-xs shadow-xl">
      <div className="font-medium text-white">{new Date(`${label}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
      <div className="mt-2 space-y-1">
        {visible.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-6">
            <span style={{ color: item.color }}>{item.name}</span>
            <span className="text-[#CBD5E1]">{item.dataKey === "volume" ? compactNumber(item.value, { compact: true }) : `Rs. ${compactNumber(item.value)}`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardTabs({ onSelect }) {
  return (
    <nav className="sticky top-0 z-10 -mx-4 overflow-x-auto border-y border-white/10 bg-[#061225]/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-3">
      <div className="flex min-w-max gap-1">
        {DASHBOARD_TABS.map((tab) => (
          <button
            key={`${tab.id}-${tab.label}`}
            type="button"
            onClick={() => onSelect(tab)}
            className="rounded-lg px-3 py-2 text-sm text-[#94A3B8] transition-colors hover:bg-white/[.04] hover:text-white"
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function PeriodToggle({ period, onChange }) {
  return (
    <div className="flex flex-col gap-3 border border-white/10 bg-[#08172C]/55 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-[10px] uppercase tracking-[.14em] text-[#71839A]">Financial data period</div>
        <p className="mt-1 text-sm text-[#94A3B8]">Switches supported charts and statement tables between yearly and quarterly data.</p>
      </div>
      <div className="flex overflow-hidden rounded-lg border border-white/10 bg-[#050E1D]/55 text-sm">
        {[
          ["yearly", "Yearly"],
          ["quarterly", "Quarterly"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={`border-l border-white/10 px-4 py-2 font-medium first:border-l-0 ${period === value ? "bg-[#F5A623]/15 text-[#F5A623]" : "text-[#94A3B8] hover:bg-white/[.04] hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PeriodCoverageNotice({ period, data }) {
  const requestedCount = financialPeriodLimit(period);
  const incomePeriods = uniquePeriodsFromHistory(limitHistoryRows(data?.incomeStatement?.income_statement, period));
  const cashPeriods = uniquePeriodsFromHistory(limitHistoryRows(data?.cashFlow?.cash_flow, period));
  const balancePeriods = limitPeriods([...(data?.balanceSheet?.history || [])].reverse(), period).map((row) => row.period).filter(Boolean).reverse();
  return (
    <div className="rounded-lg border border-white/10 bg-[#050E1D]/50 p-4 text-sm text-[#CBD5E1]">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[.14em] text-[#71839A]">Returned financial periods</div>
          <p className="mt-1 text-[#94A3B8]">
            {period === "yearly"
              ? `Yearly view can show up to ${requestedCount} years; Upstox returned ${incomePeriods.length || 0}.`
              : `Quarterly view can show up to ${requestedCount} quarters; Upstox returned ${incomePeriods.length || 0} income-statement quarters.`}
          </p>
        </div>
        <div className="grid gap-1 text-xs text-[#94A3B8] md:min-w-[340px]">
          <span>Income statement: {periodListLabel(incomePeriods)}</span>
          <span>Cash flow: {periodListLabel(cashPeriods)} {period === "quarterly" ? "(annual from Upstox)" : ""}</span>
          <span>Balance sheet: {periodListLabel(balancePeriods)} {period === "quarterly" ? "(annual from Upstox)" : ""}</span>
        </div>
      </div>
    </div>
  );
}

function MultiMetricChart({ id, title, subtitle, data, unit, bars, stacked = false }) {
  return (
    <DataSection id={id} title={title} subtitle={subtitle}>
      <div className="h-64 min-w-0 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="period" stroke="#94A3B8" fontSize={10} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip content={<MultiTooltip unit={unit} />} />
            <Legend wrapperStyle={{ color: MUTED, fontSize: 12 }} />
            {bars.map((bar) => (
              <Bar key={bar.key} dataKey={bar.key} name={bar.label} fill={bar.color} radius={stacked ? 0 : [4, 4, 0, 0]} stackId={stacked ? "stack" : undefined} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DataSection>
  );
}

function MultiTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[#07182F] px-3 py-2 text-xs shadow-xl">
      <div className="font-medium text-white">{label}</div>
      <div className="mt-2 space-y-1">
        {payload.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-6">
            <span style={{ color: item.color }}>{item.name}</span>
            <span className="text-[#CBD5E1]">{valueWithUnit(item.value, unit)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryHistoryTable({ id, title, subtitle, rows, unit, period = "yearly" }) {
  const categories = limitHistoryRows(rows, period);
  const periods = uniquePeriodsFromHistory(categories);
  const minWidth = Math.max(760, 220 + periods.length * 130);
  return (
    <DataSection id={id} title={title} subtitle={subtitle}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" style={{ minWidth }}>
          <thead className="border-b border-white/10 text-[10px] uppercase tracking-[.14em] text-[#71839A]">
            <tr>
              <th className="sticky left-0 bg-[#08172C] px-4 py-3 font-normal">Metric</th>
              {periods.map((periodLabel) => <th key={periodLabel} className="px-4 py-3 font-normal">{periodLabel}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {categories.map((row) => (
              <tr key={row.category}>
                <td className="sticky left-0 bg-[#08172C] px-4 py-3 text-white">{row.label || row.category?.replaceAll("_", " ")}</td>
                {periods.map((periodLabel) => {
                  const point = row.history?.find((item) => item.period === periodLabel);
                  return <td key={periodLabel} className="px-4 py-3 text-[#CBD5E1]">{valueWithUnit(point?.value, unit)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DataSection>
  );
}

function RatioTable({ ratios }) {
  return (
    <DataSection id="ratios" title="Ratios" subtitle="Company values compared with sector benchmarks.">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 text-[10px] uppercase tracking-[.14em] text-[#71839A]">
            <tr>
              <th className="px-4 py-3 font-normal">Ratio</th>
              <th className="px-4 py-3 font-normal">Company</th>
              <th className="px-4 py-3 font-normal">Sector</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {(ratios || []).map((ratio) => (
              <tr key={ratio.name}>
                <td className="px-4 py-3 text-white">{ratio.name}</td>
                <td className="px-4 py-3 text-[#CBD5E1]">{compactNumber(ratio.company_value)}</td>
                <td className="px-4 py-3 text-[#94A3B8]">{compactNumber(ratio.sector_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DataSection>
  );
}

function HistoryTable({ id, title, subtitle, rows, unit }) {
  const normalized = latestHistory(rows);
  return (
    <DataSection id={id} title={title} subtitle={subtitle}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-white/10 text-[10px] uppercase tracking-[.14em] text-[#71839A]">
            <tr>
              <th className="px-4 py-3 font-normal">Holder</th>
              <th className="px-4 py-3 font-normal">Latest</th>
              <th className="px-4 py-3 font-normal">Period</th>
              <th className="px-4 py-3 font-normal">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {normalized.map((row) => (
              <tr key={row.category}>
                <td className="px-4 py-3 text-white">{row.label || row.category?.replaceAll("_", " ")}</td>
                <td className="px-4 py-3 text-[#CBD5E1]">{valueWithUnit(row.latest?.value, unit)}</td>
                <td className="px-4 py-3 text-[#94A3B8]">{row.latest?.period || "Latest period"}</td>
                <td className="px-4 py-3 text-[#94A3B8]">{row.latest?.change !== undefined ? `${compactNumber(row.latest.change)}%` : "N/A"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DataSection>
  );
}

function SnapshotRatios({ metrics }) {
  const visibleMetrics = metrics.slice(0, 8);
  return (
    <div className="grid grid-cols-2 border border-white/10">
      {visibleMetrics.map((metric) => {
        const value = metric.format === "currency" ? `Rs. ${compactNumber(metric.value)}` : valueWithUnit(metric.value, metric.unit);
        return (
          <div key={metric.label} className="border-b border-r border-white/10 p-3 [&:nth-child(2n)]:border-r-0 [&:nth-last-child(-n+2)]:border-b-0">
            <div className="text-[10px] uppercase tracking-[.14em] text-[#71839A]">{metric.label}</div>
            <div className="mt-2 text-lg font-medium text-white">{value}</div>
            <div className="mt-1 min-h-4 text-xs text-[#94A3B8]">
              {metric.benchmark !== undefined && metric.benchmark !== null ? `Sector ${compactNumber(metric.benchmark)}` : metric.period || ""}
              {metric.change !== undefined && metric.change !== null ? ` | ${compactNumber(metric.change)}%` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompanySummary({ data, quote, metrics }) {
  const price = quote.price || quote.lastPrice;
  const change = numericValue(quote.changePercent);
  return (
    <section id="summary" className="scroll-mt-28 border border-white/10 bg-[#071326]/70">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="p-5 md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[.18em] text-[#E7C56B]">Stock fundamentals</div>
              <h2 className="mt-2 text-3xl font-semibold leading-tight text-white">{data.instrument?.name || data.instrument?.symbol}</h2>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#94A3B8]">
                <span>{data.instrument?.symbol}</span>
                <span>{data.instrument?.isin}</span>
                <span>{data.profile?.sector || "Sector unavailable"}</span>
                <span>{data.cached ? "Cached" : "Live fetch"}</span>
              </div>
            </div>
            <div className="min-w-32 text-left sm:text-right">
              <div className="text-3xl font-semibold text-white">{price ? `Rs. ${compactNumber(price)}` : "N/A"}</div>
              <div className={`mt-1 text-sm ${change >= 0 ? "text-[#8CC8AA]" : "text-[#E7A5A6]"}`}>{quote.changePercent !== undefined ? `${compactNumber(quote.changePercent)}%` : "Quote unavailable"}</div>
            </div>
          </div>

          {data.profile?.description ? (
            <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_.85fr]">
              <div>
                <h3 className="text-sm font-medium text-white">About</h3>
                <p className="mt-3 text-sm leading-7 text-[#CBD5E1]">{descriptionBullets(data.profile.description)[0]}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-white">Key Points</h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-[#CBD5E1]">
                  {descriptionBullets(data.profile.description).slice(1, 5).map((point) => (
                    <li key={point} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#E7C56B]" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="border-t border-white/10 p-5 lg:border-l lg:border-t-0 md:p-6">
          <div className="text-[10px] uppercase tracking-[.14em] text-[#71839A]">Generated</div>
          <div className="mt-2 text-sm text-white">{formatCmsDateTime(data.generatedAt)}</div>
          <div className="mt-1 text-xs text-[#94A3B8]">Provider: {data.provider}</div>
          <div className="mt-5">
            <SnapshotRatios metrics={metrics} />
          </div>
        </aside>
      </div>
    </section>
  );
}

function MetricGrid({ metrics }) {
  const rows = metrics.map((metric) => ({
    label: metric.label,
    value: metric.format === "currency" ? `Rs. ${compactNumber(metric.value)}` : valueWithUnit(metric.value, metric.unit),
    meta: [
      metric.benchmark !== undefined && metric.benchmark !== null ? `Sector ${compactNumber(metric.benchmark)}` : metric.period,
      metric.change !== undefined && metric.change !== null ? `${compactNumber(metric.change)}%` : null,
    ].filter(Boolean).join(" | "),
  }));
  return (
    <DataSection id="analysis" title="Analysis" subtitle="At-a-glance metrics from quote, ratios, statements and holdings.">
      <div className="grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <div key={row.label} className="bg-[#071326] p-4">
            <div className="text-[10px] uppercase tracking-[.14em] text-[#71839A]">{row.label}</div>
            <div className="mt-2 text-lg font-medium text-white">{row.value}</div>
            <div className="mt-1 text-xs text-[#94A3B8]">{row.meta}</div>
          </div>
        ))}
      </div>
    </DataSection>
  );
}

function BalanceSheetSection({ balanceSheet, period }) {
  const rows = limitPeriods([...(balanceSheet?.history || [])].reverse(), period).reverse();
  const minWidth = Math.max(760, 220 + rows.length * 130);
  return (
    <DataSection
      id="balance-sheet"
      title="Balance Sheet"
      subtitle={period === "quarterly" ? "Assets and liabilities across annual reported periods; Upstox does not return quarterly balance-sheet history here." : "Assets and liabilities across available reported periods."}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" style={{ minWidth }}>
          <thead className="border-b border-white/10 text-[10px] uppercase tracking-[.14em] text-[#71839A]">
            <tr>
              <th className="px-4 py-3 font-normal">Period</th>
              <th className="px-4 py-3 font-normal">Total Assets</th>
              <th className="px-4 py-3 font-normal">Total Liabilities</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((row) => (
              <tr key={row.period}>
                <td className="px-4 py-3 text-white">{row.period}</td>
                <td className="px-4 py-3 text-[#CBD5E1]">{valueWithUnit(row.total_asset, balanceSheet?.units_in)}</td>
                <td className="px-4 py-3 text-[#94A3B8]">{valueWithUnit(row.total_liability, balanceSheet?.units_in)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DataSection>
  );
}

function CorporateActionsSection({ actions }) {
  return (
    <DataSection id="corporate-actions" title="Corporate Actions" subtitle="Dividends, splits, bonuses and other returned action events.">
      {actions?.length ? (
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-3 pb-1">
            {actions.slice(0, 10).map((action, index) => (
              <div key={`${action.name || action.purpose || action.type}-${index}`} className="w-80 rounded-lg border border-white/10 bg-[#050E1D]/55 p-4">
                <div className="text-sm font-medium text-white">{action.name || action.purpose || action.type || "Corporate action"}</div>
                <div className="mt-1 text-xs text-[#E7C56B]">{actionDate(action)}</div>
                {actionDetails(action) ? <div className="mt-3 text-xs leading-relaxed text-[#CBD5E1]">{actionDetails(action)}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : <div className="text-sm text-[#94A3B8]">No corporate actions returned.</div>}
    </DataSection>
  );
}

function CompetitorsSection({ competitors, onOpen }) {
  return (
    <DataSection id="competitors" title="Competitors" subtitle="Click a peer to drill into its fundamentals without changing the search style.">
      {competitors?.length ? (
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-3 pb-1">
            {competitors.slice(0, 10).map((competitor) => (
              <button key={competitor.instrumentKey} type="button" onClick={() => onOpen(competitor)} className="w-80 rounded-lg border border-white/10 bg-[#050E1D]/55 p-4 text-left transition-colors hover:border-[#F5A623]/45 hover:bg-white/[.035]">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-medium text-white">{competitor.name || competitor.symbol || competitor.instrumentKey}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-[.14em] text-[#E7C56B]">Open</span>
                </div>
                <div className="mt-2 text-xs text-[#94A3B8]">
                  {[competitor.symbol, competitor.isin, competitor.sector || "Sector unavailable"].filter(Boolean).join(" | ")}
                </div>
                {competitor.sectorMarketCapInr ? <div className="mt-2 text-xs text-[#8CC8AA]">Sector market cap {competitor.sectorMarketCapInr}</div> : null}
                {competitor.summary ? <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-[#CBD5E1]">{competitor.summary}</p> : null}
              </button>
            ))}
          </div>
        </div>
      ) : <div className="text-sm text-[#94A3B8]">No competitors returned.</div>}
    </DataSection>
  );
}

function actionDate(action) {
  if (action.expiry_date) return action.expiry_date;
  if (action.ex_date || action.record_date || action.announcement_date) {
    return action.ex_date || action.record_date || action.announcement_date;
  }
  const details = action.event_details || [];
  return details.find((item) => /date/i.test(item.name || ""))?.value || "Date unavailable";
}

function actionDetails(action) {
  const details = action.event_details || [];
  const interesting = details.filter((item) => !/date/i.test(item.name || "")).slice(0, 4);
  if (interesting.length) {
    return interesting.map((item) => `${item.name}: ${item.value}`).join(" | ");
  }
  if (action.amount !== undefined && action.amount !== null) return `Amount: ${action.amount}`;
  if (action.ratio) return `Ratio: ${action.ratio}`;
  return "";
}

function DataSection({ id, title, subtitle, children }) {
  return (
    <section id={id} className="min-w-0 scroll-mt-28 border border-white/10 bg-[#071326]/70 p-4 sm:p-5 md:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-medium text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-[#94A3B8]">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function StockFundamentalsAdminPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [submittedQuery, setSubmittedQuery] = useState(DEFAULT_QUERY);
  const [statementType, setStatementType] = useState("consolidated");
  const [period, setPeriod] = useState("yearly");
  const [data, setData] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingScrollId, setPendingScrollId] = useState("");
  const requestSequence = useRef(0);

  const loadFundamentals = useCallback(async () => {
    const search = submittedQuery.trim();
    if (!search) return;
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ query: search, statement_type: statementType, period });
      const response = await cmsRequest(`/stocks/admin/fundamentals?${params.toString()}`);
      if (requestSequence.current === requestId) {
        setData(response);
        setError("");
      }
    } catch (requestError) {
      if (requestSequence.current !== requestId) return;
      if (requestError.status === 401) navigate("/blog/admin/login", { replace: true });
      else setError(requestError.message);
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [navigate, period, statementType, submittedQuery]);

  useEffect(() => { loadFundamentals(); }, [loadFundamentals]);

  useEffect(() => {
    if (loading || !pendingScrollId) return;
    document.getElementById(pendingScrollId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setPendingScrollId("");
  }, [loading, pendingScrollId, data]);

  useEffect(() => {
    const search = query.trim();
    if (search.length < 2) {
      setSuggestions([]);
      return undefined;
    }
    const timeout = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ query: search });
        const response = await cmsRequest(`/stocks/admin/fundamentals/search?${params.toString()}`);
        setSuggestions(response.items || []);
      } catch {
        setSuggestions([]);
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const quote = useMemo(() => data?.quote || {}, [data]);
  const incomeUnit = data?.incomeStatement?.units_in;
  const chartData = useMemo(() => {
    const incomeRows = data?.incomeStatement?.income_statement || [];
    const cashRows = data?.cashFlow?.cash_flow || [];
    return {
      income: combineHistories(incomeRows, [
        { key: "revenue", category: "revenue" },
        { key: "preTaxProfit", category: "operating_profit" },
        { key: "netProfit", category: "net_profit" },
      ], period),
      cash: combineHistories(cashRows, [
        { key: "operating", category: "operating" },
        { key: "investing", category: "investing" },
        { key: "financing", category: "financing" },
      ], period),
      balance: balanceChartData(data?.balanceSheet, period),
      shareholding: shareholdingChartData(data?.shareholding, period),
    };
  }, [data, period]);

  const dashboardMetrics = useMemo(() => {
    if (!data) return [];
    const incomeRows = data.incomeStatement?.income_statement || [];
    const cashRows = data.cashFlow?.cash_flow || [];
    const latestBalance = data.balanceSheet?.history?.[0];
    const promoter = categoryHistory(data.shareholding, "promoters")[0];
    const fii = categoryHistory(data.shareholding, "fii")[0];
    const otherDii = categoryHistory(data.shareholding, "other_dii")[0];
    const mutualFunds = categoryHistory(data.shareholding, "mutual_funds")[0];
    const retail = categoryHistory(data.shareholding, "retail_and_other")[0];
    const cfo = categoryHistory(cashRows, "operating")[0];
    const revenue = categoryHistory(incomeRows, "revenue")[0];
    const netProfit = categoryHistory(incomeRows, "net_profit")[0];
    const price = quote.price || quote.lastPrice;
    return [
      ...(price ? [{ label: "Last Price", value: price, format: "currency", period: `${compactNumber(quote.changePercent)}% today` }] : []),
      ...((data.highlights || []).filter((metric) => ["P/E", "P/B", "ROE", "ROCE"].includes(metric.label))),
      { label: "Revenue", value: revenue?.value, unit: data.incomeStatement?.units_in, period: revenue?.period, change: revenue?.change },
      { label: "Net Profit", value: netProfit?.value, unit: data.incomeStatement?.units_in, period: netProfit?.period, change: netProfit?.change },
      { label: "Operating Cash Flow", value: cfo?.value, unit: data.cashFlow?.units_in, period: cfo?.period, change: cfo?.change },
      { label: "Total Assets", value: latestBalance?.total_asset, unit: data.balanceSheet?.units_in, period: latestBalance?.period },
      { label: "Promoter Holding", value: promoter?.value, unit: "%", period: promoter?.period },
      { label: "FII Holding", value: fii?.value, unit: "%", period: fii?.period },
      { label: "DII + MF Holding", value: (numericValue(otherDii?.value) || 0) + (numericValue(mutualFunds?.value) || 0), unit: "%", period: otherDii?.period || mutualFunds?.period },
      { label: "Retail/Others", value: retail?.value, unit: "%", period: retail?.period },
    ].filter((metric) => metric.value !== null && metric.value !== undefined && metric.value !== "");
  }, [data, quote]);

  const submit = (event) => {
    event.preventDefault();
    const normalizedQuery = query.trim().toUpperCase();
    if (!normalizedQuery) {
      toast.error("Enter a stock symbol, company name, ISIN, or instrument key.");
      return;
    }
    setQuery(normalizedQuery);
    setSubmittedQuery(normalizedQuery);
  };

  const updateQuery = (value) => {
    setQuery(value.toUpperCase());
  };

  const openCompetitor = (competitor) => {
    const instrumentKey = competitor?.instrumentKey;
    if (!instrumentKey) return;
    setQuery(competitor.symbol || competitor.name || instrumentKey);
    setSubmittedQuery(instrumentKey);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selectDashboardTab = (tab) => {
    document.getElementById(tab.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const updatePeriod = (nextPeriod) => {
    if (nextPeriod === period) return;
    setPendingScrollId("profit-loss");
    setPeriod(nextPeriod);
  };

  return (
    <AdminShell>
      <header className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link to="/blog/admin" className="inline-flex items-center gap-2 text-xs text-[#94A3B8] hover:text-white"><ArrowLeft size={14} />Back to CMS</Link>
          <div className="mt-5 text-[11px] uppercase tracking-[.22em] text-[#F5A623]">Admin Dashboard</div>
          <h1 className="mt-2 text-3xl font-semibold leading-tight text-white sm:text-4xl">Stock fundamentals</h1>
          <p className="mt-3 max-w-2xl text-sm text-[#94A3B8]">Research view for Indian listed equities: price, profile, ratios, statements, holdings, actions and peers.</p>
        </div>
        <button onClick={loadFundamentals} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg border border-white/10 px-4 text-sm text-[#CBD5E1] hover:border-white/25 hover:text-white disabled:opacity-60 lg:self-auto">
          <RefreshCcw size={16} />Refresh
        </button>
      </header>

      <section className="mt-6 border border-white/10 bg-[#071326]/70 p-4">
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_140px] md:items-end">
          <label>
            <span className="mb-2 block text-[10px] uppercase tracking-[.14em] text-[#71839A]">Stock</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71839A]" />
              <input
                list="stock-fundamental-suggestions"
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                className="cms-input h-12 pr-4"
                style={{ paddingLeft: "2.5rem" }}
                placeholder="RELIANCE, INFY, HDFCBANK, ISIN..."
              />
            </div>
            <datalist id="stock-fundamental-suggestions">
              {suggestions.map((item) => (
                <option
                  key={item.instrumentKey}
                  value={item.symbol || item.name}
                  label={`${item.name || item.symbol} | ${item.exchange || item.segment || "Equity"}`}
                />
              ))}
            </datalist>
          </label>
          <SelectControl label="Statement" value={statementType} onChange={setStatementType} options={[["consolidated", "Consolidated"], ["standalone", "Standalone"]]} />
          <button disabled={loading} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#F5A623] px-4 text-sm font-medium text-[#050E1D] hover:bg-[#FFB33B] disabled:opacity-60">
            <BarChart3 size={16} />{loading ? "Loading..." : "Load data"}
          </button>
        </form>
      </section>

      {error ? (
        <section className="mt-8 border border-[#C98182]/25 bg-[#C98182]/5 p-6">
          <h2 className="text-lg text-white">Fundamentals could not be loaded.</h2>
          <p className="mt-2 text-sm text-[#94A3B8]">{error}</p>
        </section>
      ) : null}

      {loading && !data ? <div className="py-20 text-center text-sm text-[#71839A]">Fetching stock fundamentals...</div> : null}

      {data ? (
        <div className="mt-8 space-y-6">
          <CompanySummary data={data} quote={quote} metrics={dashboardMetrics} />

          <DashboardTabs onSelect={selectDashboardTab} />

          <PriceVolumeChart data={data.priceHistory} ratios={data.ratios} symbol={data.instrument?.symbol || data.instrument?.name} />

          <PeriodToggle period={period} onChange={updatePeriod} />

          <section className="grid gap-4 xl:grid-cols-2">
            {chartData.income.length ? (
              <MultiMetricChart
                id="profit-loss-chart"
                title="Profit & Loss Overview"
                subtitle={`${period === "quarterly" ? "Quarterly" : "Yearly"} sales, operating profit and net profit from the Upstox income statement.`}
                data={chartData.income}
                unit={incomeUnit}
                bars={[
                  { key: "revenue", label: "Revenue", color: GOLD },
                  { key: "preTaxProfit", label: "Pre-tax Profit", color: TEAL },
                  { key: "netProfit", label: "Net Profit", color: BLUE },
                ]}
              />
            ) : null}
            {chartData.cash.length ? (
              <MultiMetricChart
                id="cash-flow-chart"
                title="Cash Flow Overview"
                subtitle="Annual operating, investing and financing cash flows. Upstox does not return quarterly cash-flow history here."
                data={chartData.cash}
                unit={data.cashFlow?.units_in}
                bars={[
                  { key: "operating", label: "Operating", color: TEAL },
                  { key: "investing", label: "Investing", color: RED },
                  { key: "financing", label: "Financing", color: BLUE },
                ]}
              />
            ) : null}
            {chartData.balance.length ? (
              <MultiMetricChart
                id="balance-sheet-chart"
                title="Balance Sheet Scale"
                subtitle="Annual total assets and liabilities. Upstox does not return quarterly balance-sheet history here."
                data={chartData.balance}
                unit={data.balanceSheet?.units_in}
                bars={[
                  { key: "assets", label: "Total Assets", color: GOLD },
                  { key: "liabilities", label: "Liabilities", color: BLUE },
                ]}
              />
            ) : null}
            {chartData.shareholding.length ? (
              <MultiMetricChart
                id="shareholding-chart"
                title="Shareholding Pattern"
                subtitle={`${period === "quarterly" ? "Quarterly" : "Latest available"} ownership mix, stacked by holder category where Upstox provides holdings.`}
                data={chartData.shareholding}
                unit="%"
                stacked
                bars={[
                  { key: "Promoters", label: "Promoters", color: GOLD },
                  { key: "FII", label: "FII", color: BLUE },
                  { key: "Other DII", label: "Other DII", color: TEAL },
                  { key: "Mutual Funds", label: "Mutual Funds", color: "#A78BFA" },
                  { key: "Retail/Others", label: "Retail/Others", color: MUTED },
                ]}
              />
            ) : null}
          </section>

          <PeriodCoverageNotice period={period} data={data} />

          <CategoryHistoryTable id="profit-loss" title={period === "quarterly" ? "Quarterly Results" : "Profit & Loss"} subtitle={`Consolidated figures in ${data.incomeStatement?.units_in || "reported units"}. Showing up to ${financialPeriodLimit(period)} ${period === "quarterly" ? "quarters" : "years"} when returned by Upstox.`} rows={data.incomeStatement?.income_statement} unit={data.incomeStatement?.units_in} period={period} />
          <BalanceSheetSection balanceSheet={data.balanceSheet} period={period} />
          <CategoryHistoryTable id="cash-flow" title="Cash Flow" subtitle={period === "quarterly" ? "Upstox currently returns annual cash-flow periods for this endpoint." : "Operating, investing and financing cash flow history."} rows={data.cashFlow?.cash_flow} unit={data.cashFlow?.units_in} period={period} />
          <RatioTable ratios={data.ratios} />
          <HistoryTable id="shareholding" title="Shareholding Pattern" subtitle="Latest ownership mix from available filing history." rows={data.shareholding} unit="%" />

          <MetricGrid metrics={dashboardMetrics} />
          <CorporateActionsSection actions={data.corporateActions} />
          <CompetitorsSection competitors={data.competitors} onOpen={openCompetitor} />
        </div>
      ) : null}
    </AdminShell>
  );
}

function SelectControl({ label, value, onChange, options }) {
  return (
    <label>
      <span className="mb-2 block text-[10px] uppercase tracking-[.14em] text-[#71839A]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="cms-input h-12 min-w-40">
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}
