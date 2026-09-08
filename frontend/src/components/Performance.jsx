import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { usePortfolioData } from "@/hooks/usePortfolioData";
import { useTheme } from "@/components/ThemeProvider";

const metric = (items, key) => items.find((item) => item.key === key)?.value;
const CHART_PRIMARY = "var(--chart-primary)";
const CHART_AXIS = "var(--chart-secondary)";
const CHART_GRID = "var(--chart-grid)";
const CHART_HIGHLIGHT = "var(--chart-highlight)";
const CHART_POSITIVE = "var(--positive)";
const CHART_NEGATIVE = "var(--negative)";
const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const compactCurrency = (value) => `₹${Math.abs(value) >= 100000 ? `${(value / 100000).toFixed(1)}L` : Math.round(value).toLocaleString("en-IN")}`;

function FinancialTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  return <div data-financial-tooltip className="rounded-lg border border-white/15 bg-[#0A1E3F] px-4 py-3 text-sm shadow-xl"><div className="text-[11px] font-medium uppercase tracking-[.14em] text-[#94A3B8]">{label}</div><div className="mt-1.5 font-medium text-white">{currency.format(value)}</div></div>;
}

export default function Performance() {
  const navigate = useNavigate();
  const { isLight } = useTheme();
  const { data } = usePortfolioData();
  const { charts, headline, metrics, profile } = data;
  const primaryKpis = [["Gross P&L Generated", headline.grossPnl], ["Net P&L (After Charges)", headline.netPnl]];
  const secondaryKpis = [["Gross ROI", headline.grossRoi], ["Net ROI", headline.netRoi]];
  const proofStats = [["Win Rate", metric(metrics, "winrate")], ["Realised Trades", metric(metrics, "active-trades")], ["Avg Holding", metric(metrics, "holding")]];

  return <section id="performance" className="relative px-6 py-20 md:px-10 md:py-24"><div className="mx-auto max-w-7xl">
    <Reveal><div className="mb-5 flex items-center gap-3"><span className="text-[11px] uppercase tracking-[.28em] text-[#F5A623]">Performance</span><span className="h-px w-8 bg-[#F5A623]/50" /><span className="text-[11px] uppercase tracking-[.22em] text-[#94A3B8]">01 Apr – 31 Aug 2026</span></div><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><h2 className="max-w-2xl font-serif-display text-4xl leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">Performance, measured with context.</h2><p className="max-w-sm text-base leading-relaxed text-[#94A3B8]">Report period {profile.reportPeriod} · Average deployed capital {profile.deployedCapital}.</p></div></Reveal>
    <Reveal delay={.05}><div data-financial-surface className="mt-10 overflow-hidden rounded-xl border border-white/10 bg-[#0A1E3F]/40"><div className="grid sm:grid-cols-2">{primaryKpis.map(([label, value], i) => <div key={label} data-financial-kpi="primary" data-testid={`snapshot-headline-${i}`} className={`relative px-6 py-7 md:px-8 md:py-8 ${i ? "border-t border-white/10 sm:border-l sm:border-t-0" : ""}`}><div className="mb-3 h-px w-7 bg-[#F5A623]/65" /><div className="text-[10px] uppercase tracking-[.17em] text-[#64748B]">{label}</div><div className="mt-3 text-[clamp(2.15rem,6vw,3.1rem)] font-medium leading-none tracking-tight text-white tabular-nums">{value}</div></div>)}</div><div className="grid border-t border-white/10 sm:grid-cols-2">{secondaryKpis.map(([label, value], i) => <div key={label} data-financial-kpi="secondary" className={`px-6 py-5 md:px-8 ${i ? "border-t border-white/10 sm:border-l sm:border-t-0" : ""}`}><div className="text-[10px] uppercase tracking-[.17em] text-[#64748B]">{label}</div><div className="mt-2 text-2xl font-medium leading-none text-white tabular-nums">{value}</div></div>)}</div></div></Reveal>
    <Reveal delay={.1}><div data-financial-surface className="mt-5 grid grid-cols-3 rounded-xl border border-white/10 px-3 py-4 sm:px-5">{proofStats.map(([label, value], i) => <div key={label} className={`min-w-0 px-2 sm:px-5 ${i ? "border-l border-white/10" : ""}`}><div className="metric-neutral text-lg font-medium text-[#34D399] tabular-nums sm:text-2xl">{value}</div><div className="mt-1 text-[10px] uppercase tracking-[.14em] text-[#64748B] sm:text-[11px]">{label}</div></div>)}</div></Reveal>
    <Reveal delay={.05}><div data-financial-surface className="mt-8 rounded-xl border border-white/10 bg-[#0A1E3F]/50 p-5 md:mt-10 md:p-8"><div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-3 h-px w-9 bg-[#F5A623]/65" /><h3 className="text-base font-medium text-white md:text-lg">Monthly realised P&amp;L</h3><p className="mt-1 text-[12px] text-[#71839A]">Realised outcome by calendar month.</p></div><span className="text-[10px] uppercase tracking-[.15em] text-[#71839A]">₹ realised P&amp;L</span></div><div className="h-[280px] md:h-[330px]"><ResponsiveContainer width="100%" height="100%">{isLight ? <AreaChart data={charts.monthlyRealizedPnl} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><defs><linearGradient id="homePerformanceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART_PRIMARY} stopOpacity={.18} /><stop offset="100%" stopColor={CHART_PRIMARY} stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke={CHART_GRID} strokeDasharray="2 5" /><XAxis dataKey="month" stroke={CHART_AXIS} fontSize={12} tickLine={false} axisLine={false} dy={8} /><YAxis width={58} stroke={CHART_AXIS} fontSize={11} tickLine={false} axisLine={false} tickFormatter={compactCurrency} /><Tooltip cursor={{ stroke: CHART_HIGHLIGHT, strokeWidth: 1 }} content={<FinancialTooltip />} /><Area type="monotone" dataKey="realizedPnl" stroke={CHART_PRIMARY} strokeWidth={2.25} fill="url(#homePerformanceFill)" activeDot={{ r: 4.5, fill: CHART_HIGHLIGHT, stroke: "#FFFFFF", strokeWidth: 2 }} /></AreaChart> : <BarChart data={charts.monthlyRealizedPnl} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}><XAxis dataKey="month" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} dy={8} /><YAxis width={58} stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={compactCurrency} /><Tooltip content={<FinancialTooltip />} /><Bar dataKey="realizedPnl" radius={[4, 4, 0, 0]}>{charts.monthlyRealizedPnl.map((entry, index) => <Cell key={`${entry.month}-${index}`} fill={entry.realizedPnl >= 0 ? CHART_POSITIVE : CHART_NEGATIVE} />)}</Bar></BarChart>}</ResponsiveContainer></div></div></Reveal>
    <Reveal delay={.05}><div data-financial-surface className="mt-8 flex flex-col gap-6 rounded-xl border border-white/10 bg-[#0A1E3F]/40 px-7 py-8 md:flex-row md:items-center md:justify-between md:px-10 md:py-9"><div className="max-w-lg"><div className="mb-3 h-px w-10 bg-[#F5A623]" /><h3 className="font-serif-display text-2xl tracking-tight text-white md:text-3xl">Explore the complete portfolio</h3><p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">Realised P&amp;L, trade outcomes, holding periods and stock-level contribution.</p></div><button data-testid="snapshot-view-full" onClick={() => navigate("/portfolio")} className="group inline-flex shrink-0 self-start rounded-full bg-[#F5A623] px-7 py-3.5 font-medium text-[#050E1D] transition-colors hover:bg-[#E19212] md:self-auto">View Full Portfolio Report <ArrowRight size={18} className="ml-3 transition-transform group-hover:translate-x-1" /></button></div></Reveal>
  </div></section>;
}
