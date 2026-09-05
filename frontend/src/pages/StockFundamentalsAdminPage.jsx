import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, Building2, RefreshCcw, Search } from "lucide-react";
import { Bar, BarChart, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import AdminShell from "@/components/cms/AdminShell";
import { cmsRequest, formatCmsDateTime } from "@/lib/cms";

const GOLD = "#F5A623";
const TEAL = "#75B89B";
const RED = "#C98182";
const BLUE = "#7AA7E8";
const MUTED = "#94A3B8";

const DEFAULT_QUERY = "RELIANCE";

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

function categoryHistory(rows, category) {
  const item = (rows || []).find((row) => row.category === category);
  return item?.history || [];
}

function trendData(statement, category) {
  const rows = statement?.income_statement || statement?.cash_flow || [];
  const item = rows.find((row) => row.category === category);
  return [...(item?.history || [])].reverse().map((row) => ({
    period: row.period,
    value: Number(row.value) || 0,
    change: row.change,
  }));
}

function combineHistories(rows, series) {
  const periods = new Map();
  series.forEach(({ key, category }) => {
    categoryHistory(rows, category).forEach((point) => {
      const current = periods.get(point.period) || { period: point.period };
      current[key] = Number(point.value) || 0;
      periods.set(point.period, current);
    });
  });
  return Array.from(periods.values()).reverse();
}

function balanceChartData(balanceSheet) {
  return [...(balanceSheet?.history || [])].reverse().map((row) => ({
    period: row.period,
    assets: Number(row.total_asset) || 0,
    liabilities: Number(row.total_liability) || 0,
  }));
}

function shareholdingChartData(shareholding) {
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
  return Array.from(periods.values()).reverse().slice(-8);
}

function latestHistory(rows) {
  return (rows || []).map((row) => ({
    ...row,
    latest: row.history?.[0],
  }));
}

function StatementChart({ title, data, unit, color = GOLD }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#050E1D]/55 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-white">{title}</h3>
        <span className="text-[10px] uppercase tracking-[.14em] text-[#71839A]">{unit || "value"}</span>
      </div>
      <div className="h-64 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="period" stroke="#94A3B8" fontSize={10} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip content={<ChartTooltip unit={unit} />} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((row) => <Cell key={row.period} fill={row.value >= 0 ? color : RED} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MultiMetricChart({ title, subtitle, data, unit, bars, stacked = false }) {
  return (
    <DataSection title={title} subtitle={subtitle}>
      <div className="h-80 min-w-0">
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

function ChartTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div className="rounded-lg border border-white/10 bg-[#07182F] px-3 py-2 text-xs shadow-xl">
      <div className="font-medium text-white">{label}</div>
      <div className="mt-1 text-[#CBD5E1]">{valueWithUnit(row.value, unit)}</div>
      {row.change !== undefined && row.change !== null ? <div className="mt-1 text-[#94A3B8]">Change: {compactNumber(row.change)}%</div> : null}
    </div>
  );
}

function MetricCard({ metric }) {
  const value = metric.format === "currency" ? `Rs. ${compactNumber(metric.value)}` : valueWithUnit(metric.value, metric.unit);
  return (
    <div className="rounded-xl border border-white/10 bg-[#050E1D]/55 p-4">
      <div className="text-[10px] uppercase tracking-[.14em] text-[#71839A]">{metric.label}</div>
      <div className="mt-2 text-2xl font-medium text-white">{value}</div>
      <div className="mt-2 min-h-4 text-xs text-[#94A3B8]">
        {metric.benchmark !== undefined && metric.benchmark !== null ? `Sector: ${compactNumber(metric.benchmark)}` : metric.period || ""}
        {metric.change !== undefined && metric.change !== null ? ` | ${compactNumber(metric.change)}%` : ""}
      </div>
    </div>
  );
}

function CategoryHistoryTable({ title, subtitle, rows, unit }) {
  const categories = rows || [];
  const periods = Array.from(new Set(categories.flatMap((row) => (row.history || []).map((point) => point.period)))).slice(0, 8);
  return (
    <DataSection title={title} subtitle={subtitle}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
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
    <DataSection title="Key Ratios" subtitle="Company values compared with sector benchmarks.">
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

function HistoryTable({ title, subtitle, rows, unit }) {
  const normalized = latestHistory(rows);
  return (
    <DataSection title={title} subtitle={subtitle}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {normalized.map((row) => (
          <div key={row.category} className="rounded-lg border border-white/10 bg-[#050E1D]/45 p-4">
            <div className="text-[10px] uppercase tracking-[.14em] text-[#71839A]">{row.label || row.category?.replaceAll("_", " ")}</div>
            <div className="mt-2 text-lg font-medium text-white">{valueWithUnit(row.latest?.value, unit)}</div>
            <div className="mt-1 text-xs text-[#94A3B8]">
              {row.latest?.period || "Latest period"}{row.latest?.change !== undefined ? ` | ${compactNumber(row.latest.change)}%` : ""}
            </div>
          </div>
        ))}
      </div>
    </DataSection>
  );
}

function BalanceSheetSection({ balanceSheet }) {
  const rows = balanceSheet?.history || [];
  return (
    <DataSection title="Balance Sheet" subtitle="Assets and liabilities across available reported periods.">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
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
    <DataSection title="Corporate Actions" subtitle="Dividends, splits, bonuses and other returned action events.">
      {actions?.length ? (
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-3 pb-1">
            {actions.slice(0, 10).map((action, index) => (
              <div key={`${action.name || action.purpose || action.type}-${index}`} className="w-80 rounded-xl border border-white/10 bg-[#050E1D]/55 p-4">
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
    <DataSection title="Competitors" subtitle="Click a peer to drill into its fundamentals without changing the search style.">
      {competitors?.length ? (
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-3 pb-1">
            {competitors.slice(0, 10).map((competitor) => (
              <button key={competitor.instrumentKey} type="button" onClick={() => onOpen(competitor)} className="w-80 rounded-xl border border-white/10 bg-[#050E1D]/55 p-4 text-left transition-colors hover:border-[#F5A623]/45 hover:bg-white/[.035]">
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

function DataSection({ title, subtitle, children }) {
  return (
    <section className="min-w-0 rounded-2xl border border-white/10 bg-[#08172C]/55 p-5 md:p-6">
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

  const loadFundamentals = useCallback(async () => {
    const search = submittedQuery.trim();
    if (!search) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ query: search, statement_type: statementType, period });
      setData(await cmsRequest(`/stocks/admin/fundamentals?${params.toString()}`));
    } catch (requestError) {
      if (requestError.status === 401) navigate("/blog/admin/login", { replace: true });
      else setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [navigate, period, statementType, submittedQuery]);

  useEffect(() => { loadFundamentals(); }, [loadFundamentals]);

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
      ]),
      cash: combineHistories(cashRows, [
        { key: "operating", category: "operating" },
        { key: "investing", category: "investing" },
        { key: "financing", category: "financing" },
      ]),
      balance: balanceChartData(data?.balanceSheet),
      shareholding: shareholdingChartData(data?.shareholding),
      revenue: trendData(data?.incomeStatement, "revenue"),
      netProfit: trendData(data?.incomeStatement, "net_profit"),
    };
  }, [data]);

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

  return (
    <AdminShell>
      <header className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link to="/blog/admin" className="inline-flex items-center gap-2 text-xs text-[#94A3B8] hover:text-white"><ArrowLeft size={14} />Back to CMS</Link>
          <div className="mt-5 text-[11px] uppercase tracking-[.22em] text-[#F5A623]">Admin Dashboard</div>
          <h1 className="mt-2 font-serif-display text-5xl md:text-6xl text-white">Stock fundamental data</h1>
          <p className="mt-3 max-w-2xl text-sm md:text-base text-[#94A3B8]">Search Indian listed equities and review Upstox company profile, ratios, statements, holdings, actions and competitors.</p>
        </div>
        <button onClick={loadFundamentals} disabled={loading} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/10 px-5 text-sm text-[#CBD5E1] hover:border-white/25 hover:text-white disabled:opacity-60">
          <RefreshCcw size={16} />Refresh
        </button>
      </header>

      <section className="mt-10 rounded-2xl border border-white/10 bg-[#08172C]/55 p-5 md:p-6">
        <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
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
          <SelectControl label="Period" value={period} onChange={setPeriod} options={[["yearly", "Yearly"], ["quarterly", "Quarterly"]]} />
          <button disabled={loading} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#F5A623] px-5 text-sm font-medium text-[#050E1D] hover:bg-[#FFB33B] disabled:opacity-60">
            <BarChart3 size={16} />{loading ? "Loading..." : "Load data"}
          </button>
        </form>
      </section>

      {error ? (
        <section className="mt-8 rounded-2xl border border-[#C98182]/25 bg-[#C98182]/5 p-6">
          <h2 className="text-lg text-white">Fundamentals could not be loaded.</h2>
          <p className="mt-2 text-sm text-[#94A3B8]">{error}</p>
        </section>
      ) : null}

      {loading && !data ? <div className="py-20 text-center text-sm text-[#71839A]">Fetching stock fundamentals...</div> : null}

      {data ? (
        <div className="mt-8 space-y-6">
          <section className="rounded-2xl border border-white/10 bg-[#08172C]/55 p-5 md:p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#75B89B]/25 bg-[#75B89B]/10 px-3 py-1 text-[10px] uppercase tracking-[.14em] text-[#8CC8AA]">
                  <Building2 size={13} />{data.instrument?.exchange || data.instrument?.segment || "Equity"}
                </div>
                <h2 className="mt-4 text-3xl font-medium text-white">{data.instrument?.name || data.instrument?.symbol}</h2>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#94A3B8]">
                  <span>{data.instrument?.symbol}</span>
                  <span>{data.instrument?.isin}</span>
                  <span>{data.profile?.sector || "Sector unavailable"}</span>
                  <span>{data.cached ? "Cached" : "Live fetch"}</span>
                </div>
                {data.profile?.description ? <p className="mt-5 max-w-3xl text-sm leading-relaxed text-[#CBD5E1]">{data.profile.description}</p> : null}
              </div>
              <div className="grid min-w-full gap-3 sm:grid-cols-2 lg:min-w-80 lg:grid-cols-1">
                <div className="rounded-xl border border-white/10 bg-[#050E1D]/55 p-4">
                  <div className="text-[10px] uppercase tracking-[.14em] text-[#71839A]">Last Price</div>
                  <div className="mt-2 text-2xl font-medium text-white">{quote.price || quote.lastPrice ? `Rs. ${compactNumber(quote.price || quote.lastPrice)}` : "N/A"}</div>
                  <div className={`mt-1 text-xs ${Number(quote.changePercent) >= 0 ? "text-[#8CC8AA]" : "text-[#E7A5A6]"}`}>{quote.changePercent !== undefined ? `${compactNumber(quote.changePercent)}%` : "Quote unavailable"}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#050E1D]/55 p-4">
                  <div className="text-[10px] uppercase tracking-[.14em] text-[#71839A]">Generated</div>
                  <div className="mt-2 text-sm font-medium text-white">{formatCmsDateTime(data.generatedAt)}</div>
                  <div className="mt-1 text-xs text-[#94A3B8]">Provider: {data.provider}</div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {dashboardMetrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            {chartData.income.length ? (
              <MultiMetricChart
                title="Profit & Loss Overview"
                subtitle="Screener-style yearly comparison from the Upstox consolidated statement. The middle series is labelled conservatively because this Upstox field aligns closer to pre-tax profit for Reliance."
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
                title="Cash Flow Overview"
                subtitle="Operating, investing and financing cash flows by reported period."
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
                title="Balance Sheet Scale"
                subtitle="Total assets and liabilities across available annual periods."
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
                title="Shareholding Pattern"
                subtitle="Latest ownership mix, stacked by category where Upstox provides holdings."
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

          <section className="grid gap-4 xl:grid-cols-2">
            {chartData.revenue.length ? <StatementChart title="Revenue Trend" data={chartData.revenue} unit={incomeUnit} /> : null}
            {chartData.netProfit.length ? <StatementChart title="Net Profit Trend" data={chartData.netProfit} unit={incomeUnit} color="#E7C56B" /> : null}
          </section>

          <RatioTable ratios={data.ratios} />
          <CategoryHistoryTable title="Profit & Loss" subtitle="Latest statement periods in a Screener-like table format." rows={data.incomeStatement?.income_statement} unit={data.incomeStatement?.units_in} />
          <BalanceSheetSection balanceSheet={data.balanceSheet} />
          <CategoryHistoryTable title="Cash Flow" subtitle="Operating, investing and financing cash flow history." rows={data.cashFlow?.cash_flow} unit={data.cashFlow?.units_in} />
          <HistoryTable title="Shareholding" subtitle="Latest ownership mix from available filing history." rows={data.shareholding} unit="%" />
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
