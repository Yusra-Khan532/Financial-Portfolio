import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { usePortfolioData } from "@/hooks/usePortfolioData";

const GOLD = "#F5A623";
const MUTED = ["#64748B", "#476582", "#2A4668", "#A6B4C4"];
const metric = (items, key) => items.find((item) => item.key === key)?.value;

function SectionHeading({ eyebrow, title, children }) {
  return <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 mb-9">
    <div><div className="uppercase tracking-[0.28em] text-[11px] text-[#F5A623] mb-3">{eyebrow}</div><h2 className="font-serif-display text-4xl sm:text-5xl text-white leading-none">{title}</h2></div>
    {children && <div className="text-[#94A3B8] text-sm leading-relaxed max-w-md">{children}</div>}
  </div>;
}

function ReportTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-lg border border-white/10 bg-[#07182F] px-3 py-2.5 shadow-xl text-sm">
    <div className="text-[#94A3B8] mb-1">{label}</div>
    {payload.map((item) => <div key={item.name} className="flex gap-2 justify-between text-white"><span style={{ color: item.color || item.fill }}>{item.name}</span><span>{item.value}%</span></div>)}
  </div>;
}

function AllocationList({ data, color = GOLD }) {
  return <div className="space-y-3">{data.map((item, index) => <div key={item.name}>
    <div className="flex justify-between gap-4 text-sm mb-1.5"><span className="text-[#CBD5E1]">{item.name}</span><span className="text-white tabular-nums">{item.value}%</span></div>
    <div className="h-1 bg-white/10 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${item.value}%`, background: index ? "#60738A" : color }} /></div>
  </div>)}</div>;
}

const supportKeys = ["cagr", "winrate", "profit-factor", "drawdown", "sharpe", "sortino", "alpha-nifty", "alpha-midcap", "holding", "best-month", "active-trades"];

export default function PortfolioPage() {
  const { data } = usePortfolioData();
  const {
    attribution, etfGeography, etfPerf, growthData, headline, marketCapAllocation,
    marketCapPerf, metrics, profile, returnsComparison, riskSummary, sectorAllocation,
    segmentAllocation,
  } = data;
  const primaryMetrics = [
    ["Gross P&L Generated", headline.grossPnl], ["Net P&L After Charges", headline.netPnl],
    ["Gross ROI", headline.grossRoi], ["Net ROI", headline.netRoi], ["XIRR Annualized", metric(metrics, "xirr")],
  ];

  return <main className="pt-24 md:pt-28">
    <header id="overview" className="px-6 md:px-10 pt-16 md:pt-20 pb-12 border-b border-white/10 bg-[radial-gradient(circle_at_85%_0%,rgba(245,166,35,.12),transparent_28%)]">
      <div className="max-w-7xl mx-auto">
        <div className="uppercase tracking-[0.3em] text-[11px] text-[#F5A623] mb-5">Portfolio Report</div>
        <h1 className="font-serif-display text-5xl sm:text-6xl lg:text-7xl max-w-4xl text-white leading-[.95]">Performance, allocation and risk <span className="italic text-[#E7C56B]">— in full context.</span></h1>
        <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#CBD5E1]"><span>{profile.reportPeriod}</span><span className="text-[#F5A623]/60">•</span><span>Average deployed capital: {profile.deployedCapital}</span></div>
        <p className="mt-5 max-w-2xl text-[#94A3B8] leading-relaxed">A detailed view of portfolio performance, construction, return attribution and risk across the stated reporting period.</p>
      </div>
    </header>

    <nav aria-label="Portfolio report sections" className="sticky top-24 md:top-28 z-40 border-b border-white/10 bg-[#050E1D]/95 backdrop-blur px-6 md:px-10 overflow-x-auto">
      <div className="max-w-7xl mx-auto min-w-max flex gap-6 py-3 text-xs uppercase tracking-[.16em] text-[#94A3B8]">{["Overview", "Performance", "Allocation", "Attribution", "Risk"].map((label) => <a key={label} href={`#${label.toLowerCase()}`} className="hover:text-[#F5A623] transition-colors">{label}</a>)}</div>
    </nav>

    <section className="px-6 md:px-10 py-16" aria-labelledby="summary-title"><div className="max-w-7xl mx-auto">
      <SectionHeading eyebrow="Executive Summary" title="The essentials, clearly weighted." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 border border-white/10 rounded-xl overflow-hidden bg-[#0A1E3F]/35">{primaryMetrics.map(([label, value], i) => <div key={label} className={`p-5 md:p-6 ${i ? "lg:border-l border-white/10" : ""} border-b lg:border-b-0 border-white/10`}><div className="text-[10px] uppercase tracking-[.16em] text-[#94A3B8] min-h-8">{label}</div><div className="mt-3 text-2xl font-semibold tabular-nums text-white">{value}</div></div>)}</div>
      <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-white/10 border border-white/10 rounded-xl overflow-hidden">{supportKeys.map((key) => { const item = metrics.find((m) => m.key === key); return <div key={key} className="p-4 bg-[#07182F]"><div className="text-[10px] uppercase tracking-[.13em] text-[#71839A]">{item.label}</div><div className={`mt-2 text-lg tabular-nums ${item.tone === "positive" ? "text-[#E7C56B]" : item.tone === "negative" ? "text-[#D98A89]" : "text-white"}`}>{item.value}</div></div>; })}</div>
    </div></section>

    <section id="performance" className="px-6 md:px-10 py-16 border-y border-white/10 bg-[#07182F]/60"><div className="max-w-7xl mx-auto">
      <SectionHeading eyebrow="Performance" title="Portfolio growth versus benchmarks.">Cumulative return since the start of the reporting period.</SectionHeading>
      <div className="rounded-xl border border-white/10 bg-[#081B35] p-4 md:p-7 h-[360px] md:h-[430px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={growthData} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="rgba(255,255,255,.08)" /><XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value) => `${value}%`} tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip content={<ReportTooltip />} /><Line type="monotone" dataKey="Portfolio" stroke={GOLD} strokeWidth={3} dot={false} /><Line type="monotone" dataKey="NIFTY 50" stroke="#94A3B8" strokeWidth={1.7} dot={false} /><Line type="monotone" dataKey="NIFTY Midcap 150" stroke="#59708A" strokeWidth={1.7} dot={false} /></LineChart></ResponsiveContainer></div>
      <div className="mt-8 grid lg:grid-cols-[.8fr_1.2fr] gap-7 items-center"><div><div className="text-xs uppercase tracking-[.18em] text-[#F5A623]">Returns Comparison</div><p className="font-serif-display text-3xl text-white mt-3">Annualized return context.</p></div><div className="h-52"><ResponsiveContainer width="100%" height="100%"><BarChart data={returnsComparison} layout="vertical" margin={{ left: 18, right: 35 }}><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={125} tick={{ fill: "#CBD5E1", fontSize: 12 }} axisLine={false} tickLine={false} /><Tooltip content={<ReportTooltip />} /><Bar dataKey="value" radius={[0, 4, 4, 0]}>{returnsComparison.map((entry, i) => <Cell key={entry.name} fill={i === 0 ? GOLD : MUTED[i]} />)}<LabelList dataKey="value" position="right" formatter={(v) => `${v}%`} fill="#E2E8F0" fontSize={12} /></Bar></BarChart></ResponsiveContainer></div></div>
    </div></section>

    <section id="allocation" className="px-6 md:px-10 py-16"><div className="max-w-7xl mx-auto"><SectionHeading eyebrow="Portfolio Construction" title="Allocation with intent." />
      <div className="grid lg:grid-cols-2 gap-6"><div className="rounded-xl border border-white/10 bg-[#0A1E3F]/35 p-6"><h3 className="text-white font-medium mb-6">Full sector allocation</h3><AllocationList data={sectorAllocation} /></div><div className="grid sm:grid-cols-2 gap-6"><div className="rounded-xl border border-white/10 bg-[#0A1E3F]/35 p-6"><h3 className="text-white font-medium mb-4">Market cap</h3><div className="h-36"><ResponsiveContainer><PieChart><Pie data={marketCapAllocation} dataKey="value" innerRadius="60%" outerRadius="90%" stroke="none">{marketCapAllocation.map((item, i) => <Cell key={item.name} fill={i ? MUTED[i - 1] : GOLD} />)}</Pie><Tooltip content={<ReportTooltip />} /></PieChart></ResponsiveContainer></div><AllocationList data={marketCapAllocation} /></div><div className="rounded-xl border border-white/10 bg-[#0A1E3F]/35 p-6"><h3 className="text-white font-medium mb-5">Segment</h3><AllocationList data={segmentAllocation} /><h3 className="text-white font-medium mt-8 mb-5">ETF geography</h3><AllocationList data={etfGeography} /></div></div></div>
    </div></section>

    <section id="attribution" className="px-6 md:px-10 py-16 border-y border-white/10 bg-[#07182F]/60"><div className="max-w-7xl mx-auto"><SectionHeading eyebrow="P&L Attribution" title="Where returns came from.">Contribution to net P&amp;L by sector. Negative contributions remain visible for context.</SectionHeading><div className="h-[390px] rounded-xl border border-white/10 bg-[#081B35] p-4 md:p-6"><ResponsiveContainer width="100%" height="100%"><BarChart data={attribution} layout="vertical" margin={{ left: 25, right: 15 }}><XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="sector" width={120} tick={{ fill: "#CBD5E1", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip content={<ReportTooltip />} /><Bar dataKey="value" radius={3}>{attribution.map((item) => <Cell key={item.sector} fill={item.value >= 0 ? GOLD : "#A66267"} />)}</Bar></BarChart></ResponsiveContainer></div></div></section>

    <section className="px-6 md:px-10 py-16"><div className="max-w-7xl mx-auto"><SectionHeading eyebrow="Comparative Performance" title="Return across portfolio sleeves." /><div className="grid lg:grid-cols-2 gap-6"><PerformanceTable title="Market-cap performance" rows={marketCapPerf} label="cap" /><PerformanceTable title="ETF performance" rows={etfPerf} label="cat" /></div></div></section>

    <section id="risk" className="px-6 md:px-10 py-16 border-y border-white/10 bg-[#07182F]/60"><div className="max-w-7xl mx-auto"><SectionHeading eyebrow="Risk & Return" title="The path matters too." /><div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">{riskSummary.map((item) => <div key={item.label} className="rounded-xl border border-white/10 bg-[#081B35] p-5"><div className="text-[10px] uppercase tracking-[.15em] text-[#94A3B8]">{item.label}</div><div className={`mt-3 text-3xl tabular-nums ${item.tone === "negative" ? "text-[#D98A89]" : "text-white"}`}>{item.value}</div><p className="mt-3 text-xs leading-relaxed text-[#71839A]">{item.label.includes("Sharpe") ? "Risk-adjusted return" : item.label.includes("Sortino") ? "Return relative to downside risk" : item.label.includes("Beta") ? "Sensitivity relative to the benchmark" : "Observed across the stated period"}</p></div>)}</div></div></section>

  </main>;
}

function PerformanceTable({ title, rows, label }) {
  return <div className="rounded-xl border border-white/10 overflow-hidden bg-[#0A1E3F]/35"><div className="px-6 py-5 border-b border-white/10 text-white font-medium">{title}</div><div className="divide-y divide-white/10">{rows.map((row) => <div key={row[label]} className="grid grid-cols-[1fr_auto_auto] gap-5 px-6 py-4 text-sm"><span className="text-[#CBD5E1]">{row[label]}</span><span className="text-[#94A3B8]">ROI <b className="ml-1 text-white font-medium">{row.roi}</b></span><span className="text-[#94A3B8]">XIRR <b className="ml-1 text-[#E7C56B] font-medium">{row.xirr}</b></span></div>)}</div></div>;
}
