import { Activity, ArrowRight, CircleDollarSign, Gauge, TrendingUp, WalletCards } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useNavigate } from "react-router-dom";
import { Reveal } from "@/components/Reveal";
import { usePortfolioData } from "@/hooks/usePortfolioData";

const metric = (items, key) => items.find((item) => item.key === key)?.value;
const CHART_AXIS = "var(--chart-secondary)";
const CHART_GRID = "var(--chart-grid)";
const CHART_POSITIVE = "var(--positive)";
const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compactCurrency = (value) => value === 0 ? "₹0" : `₹${Math.abs(value) >= 100000 ? `${(value / 100000).toFixed(1)}L` : `${Math.round(value / 1000)}K`}`;

function FinancialTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div data-financial-tooltip className="performance-tooltip rounded-lg border px-3 py-2.5 text-sm"><div className="text-[11px] font-medium uppercase tracking-[.12em]">{label}</div><div className="mt-1 font-medium">{currency.format(payload[0].value)}</div></div>;
}

function IconBadge({ children, tone = "gold" }) {
  return <span className="performance-icon-badge grid h-9 w-9 shrink-0 place-items-center rounded-full border text-[#D4AF37]" aria-hidden="true">{children}</span>;
}

function WinRateRing({ value }) {
  const percentage = Number.parseFloat(value) || 0;
  const radius = 23;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percentage / 100);

  return <div className="relative h-16 w-16 shrink-0" aria-label={`${value} win rate`}>
    <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90" role="img" aria-hidden="true">
      <circle cx="38" cy="38" r={radius} fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="2.5" />
      <circle cx="38" cy="38" r={radius} fill="none" stroke="var(--viz-gold)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} />
    </svg>
    <span className="performance-card-value absolute inset-0 grid place-items-center text-[13px] font-medium tabular-nums">{value}</span>
  </div>;
}

function PrimaryMetricCard({ label, value, detail, icon: Icon, className = "", testId, children }) {
  return <article data-financial-kpi="primary" data-testid={testId} className={`performance-metric-card group flex min-h-[176px] min-w-0 flex-col rounded-xl border p-5 transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none md:p-5 ${className}`}>
    <div className="flex items-center justify-between gap-3"><div className="performance-card-label text-[10px] font-semibold uppercase tracking-[.18em]">{label}</div>{Icon && <IconBadge><Icon size={16} strokeWidth={1.5} /></IconBadge>}</div>
    {children || <div className="mt-auto pt-7"><div className="performance-card-value text-[clamp(1.8rem,2.65vw,2.45rem)] font-medium leading-none tracking-tight tabular-nums">{value}</div><p className="performance-card-detail mt-2 text-xs leading-relaxed">{detail}</p></div>}
  </article>;
}

export default function Performance() {
  const navigate = useNavigate();
  const { data } = usePortfolioData();
  const { charts, headline, metrics, profile, charges } = data;
  const reportEnd = profile.reportPeriod.split(" – ")[1]?.trim() || profile.reportPeriod;
  const winRate = metric(metrics, "winrate");
  const realisedTrades = metric(metrics, "active-trades");
  const holding = metric(metrics, "holding");
  const secondaryKpis = [["Gross P&L", headline.grossPnl], ["Gross ROI", headline.grossRoi], ["Total Charges", charges.totalFormatted], ["Avg Holding", holding]];
  const contributors = charts.pnlAttribution.filter((item) => item.realizedPnl > 0).slice(0, 5);
  const maxContributor = Math.max(...contributors.map((item) => item.realizedPnl), 1);

  return <section id="performance" className="relative px-6 py-16 md:px-10 md:py-20"><div className="mx-auto max-w-7xl">
    <Reveal><div className="mb-4 flex items-center gap-3"><span className="text-[11px] uppercase tracking-[.28em] text-[var(--viz-gold)]">Performance</span><span className="h-px w-8 bg-[var(--viz-gold)]/50" /><span className="text-[11px] uppercase tracking-[.22em] text-[var(--text-muted)]">{profile.reportPeriod}</span></div><div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="max-w-2xl font-serif-display text-4xl leading-[1.05] tracking-tight text-[var(--text-primary)] sm:text-5xl">Performance, measured with context.</h2><p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--text-muted)]">A clear view of realised equity performance across the current reporting period.</p></div><div className="border-l border-[var(--viz-gold)]/45 pl-4 text-sm leading-relaxed text-[var(--text-muted)] lg:max-w-xs lg:text-right lg:border-l-0 lg:border-r lg:pr-4"><p>{profile.deployedCapital} average deployed capital</p><p>Realised equity transactions</p><p>{profile.reportPeriod}</p></div></div></Reveal>

    <Reveal delay={.05}><div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <PrimaryMetricCard label="Net P&L" value={headline.netPnl} detail="After charges" icon={CircleDollarSign} testId="snapshot-headline-0" />
      <PrimaryMetricCard label="Net ROI" value={headline.netRoi} detail={`On ${profile.deployedCapital} deployed capital`} icon={TrendingUp} testId="snapshot-headline-1" />
      <PrimaryMetricCard label="Win Rate" icon={Gauge} testId="snapshot-headline-2"><div className="mt-auto flex items-center gap-3 pt-7"><WinRateRing value={winRate} /><p className="performance-card-detail max-w-[8rem] text-xs leading-relaxed">Profitable realised trades</p></div></PrimaryMetricCard>
      <PrimaryMetricCard label="Realised Trades" value={realisedTrades} detail={`Through ${reportEnd}`} icon={Activity} testId="snapshot-headline-3" />
    </div></Reveal>

    <Reveal delay={.08}><div className="performance-metric-card mt-3 grid overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-4">{secondaryKpis.map(([label, value], i) => <div key={label} data-financial-kpi="secondary" className={`performance-secondary-item flex items-center gap-3 px-4 py-3 md:px-5 ${i ? "border-t sm:border-l sm:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}><IconBadge><WalletCards size={15} strokeWidth={1.5} /></IconBadge><div className="min-w-0"><div className="performance-card-label text-[10px] uppercase tracking-[.16em]">{label}</div><div className="performance-card-value mt-1 text-lg font-medium leading-none tabular-nums sm:text-xl">{value}</div></div></div>)}</div></Reveal>

    <Reveal delay={.12}><div className="mt-12 grid gap-6 lg:grid-cols-[1.75fr_1fr] lg:gap-8"><div data-financial-surface className="performance-analytics-card min-w-0 rounded-[20px] border p-5 md:p-8"><div className="mb-0 flex items-start justify-between gap-4"><div><div className="mb-3 h-px w-9 bg-[var(--viz-gold)]/65" /><h3 className="text-base font-medium md:text-lg">Monthly realised P&amp;L</h3><p className="mt-2 text-[12px]">Discrete monthly outcome · September through {reportEnd}</p></div><span className="pt-1 text-right text-[10px] uppercase tracking-[.15em]">₹ realised P&amp;L</span></div><div className="mt-8 h-[230px] md:h-[260px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={charts.monthlyRealizedPnl} margin={{ top: 10, right: 6, left: 0, bottom: 0 }} barCategoryGap="28%"><CartesianGrid vertical={false} stroke={CHART_GRID} strokeDasharray="2 5" /><XAxis dataKey="month" stroke={CHART_AXIS} fontSize={11} tickLine={false} axisLine={false} dy={8} /><YAxis width={52} stroke={CHART_AXIS} fontSize={10} tickLine={false} axisLine={false} tickFormatter={compactCurrency} /><Tooltip cursor={{ fill: "rgba(212,175,55,.05)" }} content={<FinancialTooltip />} /><Bar dataKey="realizedPnl" barSize={22} radius={[2, 2, 0, 0]}>{charts.monthlyRealizedPnl.map((entry, index) => <Cell key={`${entry.month}-${index}`} fill={CHART_POSITIVE} fillOpacity={index === charts.monthlyRealizedPnl.length - 1 ? .68 : .9} />)}</Bar></BarChart></ResponsiveContainer></div></div><div data-financial-surface className="performance-analytics-card rounded-[20px] border p-5 md:p-8"><div className="mb-0"><div className="mb-3 h-px w-9 bg-[var(--viz-gold)]/65" /><h3 className="text-base font-medium md:text-lg">Top contributors</h3><p className="mt-2 text-[12px]">Stocks contributing most to realised P&amp;L</p></div><div className="mt-8 space-y-6">{contributors.map((item) => <div key={item.stock}><div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="truncate">{item.stock}</span><span className="shrink-0 tabular-nums">{currency.format(item.realizedPnl)}</span></div><div className="performance-contributor-track h-[6px] overflow-hidden rounded-full"><div className="h-full rounded-full bg-[#D4AF37]" style={{ width: `${(item.realizedPnl / maxContributor) * 100}%` }} /></div></div>)}</div></div></div></Reveal>
    <Reveal delay={.16}><div className="mt-8 flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-5 text-sm leading-relaxed text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between"><p>{winRate} win rate across {realisedTrades} realised trades, with an average holding period of {holding.replace(" Days", " days")}.</p><button onClick={() => navigate("/portfolio")} className="group inline-flex shrink-0 items-center gap-2 text-[var(--viz-gold)] transition-colors hover:text-[var(--gold)] motion-reduce:transition-none">View detailed performance <ArrowRight size={15} className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none" /></button></div><p className="mt-5 text-[11px] text-[var(--text-subtle)]">Source: Upstox Realised P&amp;L Report · {profile.reportPeriod}. September reflects realised transactions through {reportEnd}.</p></Reveal>
  </div></section>;
}
