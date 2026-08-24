import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { usePortfolioData } from "@/hooks/usePortfolioData";

const metric = (items, key) => items.find((item) => item.key === key)?.value;
const GOLD = "#F5A623";

const TooltipCard = ({ active, payload, label }) => active && payload?.length ? <div className="rounded-lg border border-white/15 bg-[#0A1E3F] px-3 py-2 text-sm shadow-xl"><div className="mb-1 text-[#94A3B8]">{label}</div><div className="text-white">{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(payload[0].value)}</div></div> : null;

export default function Performance() {
  const navigate = useNavigate();
  const { data } = usePortfolioData();
  const { charts, headline, metrics, profile } = data;
  const kpis = [["Gross P&L Generated", headline.grossPnl], ["Net P&L (After Charges)", headline.netPnl], ["Gross ROI", headline.grossRoi], ["Net ROI", headline.netRoi]];
  const proofStats = [["Win Rate", metric(metrics, "winrate")], ["Realised Trades", metric(metrics, "active-trades")], ["Avg Holding", metric(metrics, "holding")]];

  return <section id="performance" className="relative px-6 py-20 md:px-10 md:py-24"><div className="mx-auto max-w-7xl">
    <Reveal><div className="mb-5 flex items-center gap-3"><span className="text-[11px] uppercase tracking-[.28em] text-[#F5A623]">Performance</span><span className="h-px w-8 bg-[#F5A623]/50" /><span className="text-[11px] uppercase tracking-[.22em] text-[#94A3B8]">01 Apr – 23 Aug 2026</span></div><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><h2 className="max-w-2xl font-serif-display text-4xl leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">Performance, measured with context.</h2><p className="max-w-sm text-base leading-relaxed text-[#94A3B8]">Report period {profile.reportPeriod} · Average deployed capital {profile.deployedCapital}.</p></div></Reveal>
    <Reveal delay={.05}><div className="mt-10 grid grid-cols-1 overflow-hidden rounded-xl border border-white/10 bg-[#0A1E3F]/40 sm:grid-cols-2">{kpis.map(([label, value], i) => <div key={label} data-testid={`snapshot-headline-${i}`} className={`px-5 py-6 md:px-6 md:py-7 ${i < 2 ? "sm:border-b" : ""} ${i % 2 ? "sm:border-l" : ""} border-white/10`}><div className="text-[11px] uppercase tracking-[.16em] text-[#64748B]">{label}</div><div className="mt-2.5 text-[clamp(2rem,8vw,2.6rem)] font-medium leading-none tracking-tight text-white tabular-nums">{value}</div></div>)}</div></Reveal>
    <Reveal delay={.1}><div className="mt-6 grid grid-cols-3">{proofStats.map(([label, value], i) => <div key={label} className={`min-w-0 px-2 py-1 sm:px-5 ${i ? "border-l border-white/10" : ""}`}><div className="text-lg font-medium text-[#34D399] tabular-nums sm:text-2xl">{value}</div><div className="mt-1 text-[10px] uppercase tracking-[.14em] text-[#64748B] sm:text-[11px]">{label}</div></div>)}</div></Reveal>
    <Reveal delay={.05}><div className="mt-10 rounded-xl border border-white/10 bg-[#0A1E3F]/50 p-5 md:p-7"><div className="mb-4"><h3 className="text-base font-medium text-white md:text-lg">Monthly realised P&amp;L</h3><p className="mt-1 text-[11px] text-[#71839A]">Derived from the latest realised trade ledger.</p></div><ResponsiveContainer width="100%" height={330}><BarChart data={charts.monthlyRealizedPnl}><XAxis dataKey="month" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} /><YAxis hide /><Tooltip content={<TooltipCard />} /><Bar dataKey="realizedPnl" radius={[4, 4, 0, 0]}>{charts.monthlyRealizedPnl.map((item) => <Cell key={item.month} fill={item.realizedPnl >= 0 ? GOLD : "#F87171"} />)}</Bar></BarChart></ResponsiveContainer></div></Reveal>
    <Reveal delay={.05}><div className="mt-8 flex flex-col gap-6 rounded-xl border border-white/10 bg-[#0A1E3F]/40 px-7 py-8 md:flex-row md:items-center md:justify-between md:px-10 md:py-9"><div className="max-w-lg"><div className="mb-3 h-px w-10 bg-[#F5A623]" /><h3 className="font-serif-display text-2xl tracking-tight text-white md:text-3xl">Explore the complete portfolio</h3><p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">Realised P&amp;L, trade outcomes, holding periods and stock-level contribution.</p></div><button data-testid="snapshot-view-full" onClick={() => navigate("/portfolio")} className="group inline-flex shrink-0 self-start rounded-full bg-[#F5A623] px-7 py-3.5 font-medium text-[#050E1D] transition-colors hover:bg-[#E19212] md:self-auto">View Full Portfolio Report <ArrowRight size={18} className="ml-3 transition-transform group-hover:translate-x-1" /></button></div></Reveal>
  </div></section>;
}
