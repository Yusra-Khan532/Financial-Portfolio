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
  return <div data-financial-tooltip className="rounded-md border border-[var(--border-muted)] bg-[var(--panel-bg-strong)] px-3 py-2.5 text-sm shadow-lg"><div className="text-[11px] font-medium uppercase tracking-[.12em] text-[var(--text-secondary)]">{label}</div><div className="mt-1 font-medium text-[var(--text-primary)]">{currency.format(payload[0].value)}</div></div>;
}

function IconBadge({ children, tone = "gold" }) {
  return <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${tone === "navy" ? "border-[var(--text-primary)]/10 bg-[var(--app-bg)] text-[var(--viz-gold)]" : "border-[var(--viz-gold)]/25 bg-[var(--viz-gold)]/10 text-[var(--viz-gold)]"}`} aria-hidden="true">{children}</span>;
}

function WinRateRing({ value }) {
  const percentage = Number.parseFloat(value) || 0;
  const radius = 29;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percentage / 100);

  return <div className="relative h-[76px] w-[76px] shrink-0" aria-label={`${value} win rate`}>
    <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90" role="img" aria-hidden="true">
      <circle cx="38" cy="38" r={radius} fill="none" stroke="var(--border-muted)" strokeWidth="2.5" />
      <circle cx="38" cy="38" r={radius} fill="none" stroke="var(--viz-gold)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} />
    </svg>
    <span className="absolute inset-0 grid place-items-center text-[13px] font-medium tabular-nums text-[var(--text-primary)]">{value}</span>
  </div>;
}

function PrimaryMetricCard({ label, value, detail, icon: Icon, className = "", testId, children }) {
  return <article data-financial-kpi="primary" data-testid={testId} className={`group min-w-0 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-bg)] p-5 shadow-[0_14px_36px_rgba(5,14,29,0.06)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-[var(--viz-gold)]/45 hover:shadow-[0_18px_42px_rgba(5,14,29,0.12)] motion-reduce:transform-none motion-reduce:transition-none md:p-6 ${className}`}>
    <div className="flex items-start justify-between gap-4"><div className="text-[10px] font-medium uppercase tracking-[.19em] text-[var(--text-muted)]">{label}</div>{Icon && <IconBadge><Icon size={16} strokeWidth={1.5} /></IconBadge>}</div>
    {children || <div className="mt-8"><div className="text-[clamp(2rem,3.3vw,3.15rem)] font-medium leading-none tracking-tight text-[var(--text-primary)] tabular-nums">{value}</div><p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">{detail}</p></div>}
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

    <Reveal delay={.05}><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2">
      <PrimaryMetricCard label="Net P&L" value={headline.netPnl} detail="After charges" icon={CircleDollarSign} testId="snapshot-headline-0" className="!border-[var(--navy-900)] !bg-[var(--navy-900)] !text-white shadow-[0_18px_44px_rgba(5,14,29,0.18)] sm:col-span-2 lg:row-span-2 lg:p-7">
        <div className="mt-10 flex min-h-[220px] flex-col justify-between"><div><div className="mb-5 h-px w-10 bg-[var(--viz-gold)]/80" /><div className="text-[clamp(2.4rem,4.8vw,4.6rem)] font-medium leading-none tracking-tight !text-white tabular-nums">{headline.netPnl}</div></div><div className="flex items-end justify-between gap-4"><p className="text-xs leading-relaxed !text-white/65">After charges</p><span className="text-[10px] uppercase tracking-[.18em] text-[var(--viz-gold)]">Net performance</span></div></div>
      </PrimaryMetricCard>
      <PrimaryMetricCard label="Net ROI" value={headline.netRoi} detail={`On ${profile.deployedCapital} deployed capital`} icon={TrendingUp} testId="snapshot-headline-1" className="lg:col-span-1">
        <div className="mt-8"><div className="text-[clamp(2rem,3.3vw,3.15rem)] font-medium leading-none tracking-tight text-[var(--text-primary)] tabular-nums">{headline.netRoi}</div><p className="mt-3 max-w-[15rem] text-xs leading-relaxed text-[var(--text-muted)]">On {profile.deployedCapital} deployed capital</p></div>
      </PrimaryMetricCard>
      <PrimaryMetricCard label="Win Rate" icon={Gauge} testId="snapshot-headline-2" className="lg:col-span-1"><div className="mt-7 flex items-center gap-4"><WinRateRing value={winRate} /><p className="max-w-[8rem] text-xs leading-relaxed text-[var(--text-muted)]">Profitable realised trades</p></div></PrimaryMetricCard>
      <PrimaryMetricCard label="Realised Trades" value={realisedTrades} detail={`Through ${reportEnd}`} icon={Activity} testId="snapshot-headline-3" className="sm:col-span-2 lg:col-span-2"><div className="mt-8 flex items-end justify-between gap-5"><div className="text-[clamp(2rem,3.3vw,3.15rem)] font-medium leading-none tracking-tight text-[var(--text-primary)] tabular-nums">{realisedTrades}</div><p className="max-w-[13rem] text-right text-xs leading-relaxed text-[var(--text-muted)]">Through {reportEnd}</p></div></PrimaryMetricCard>
    </div></Reveal>

    <Reveal delay={.08}><div className="mt-4 grid overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-bg)] sm:grid-cols-2 lg:grid-cols-4">{secondaryKpis.map(([label, value], i) => <div key={label} data-financial-kpi="secondary" className={`flex items-center gap-3 px-5 py-4 md:px-6 ${i ? "border-t border-[var(--border-subtle)] sm:border-l sm:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}><IconBadge tone="navy"><WalletCards size={15} strokeWidth={1.5} /></IconBadge><div className="min-w-0"><div className="text-[10px] uppercase tracking-[.16em] text-[var(--text-muted)]">{label}</div><div className="mt-1 text-lg font-medium leading-none text-[var(--text-primary)] tabular-nums sm:text-xl">{value}</div></div></div>)}</div></Reveal>

    <Reveal delay={.12}><div className="mt-10 grid gap-10 lg:grid-cols-[1.75fr_1fr] lg:gap-14"><div data-financial-surface className="min-w-0 border-t border-[var(--border-subtle)] pt-5"><div className="mb-5 flex items-end justify-between gap-4"><div><div className="mb-3 h-px w-9 bg-[var(--viz-gold)]/65" /><h3 className="text-base font-medium text-[var(--text-primary)] md:text-lg">Monthly realised P&amp;L</h3><p className="mt-1 text-[12px] text-[var(--text-muted)]">Discrete monthly outcome · September through {reportEnd}</p></div><span className="text-[10px] uppercase tracking-[.15em] text-[var(--text-muted)]">₹ realised P&amp;L</span></div><div className="h-[230px] md:h-[260px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={charts.monthlyRealizedPnl} margin={{ top: 10, right: 6, left: 0, bottom: 0 }} barCategoryGap="28%"><CartesianGrid vertical={false} stroke={CHART_GRID} strokeDasharray="2 5" /><XAxis dataKey="month" stroke={CHART_AXIS} fontSize={11} tickLine={false} axisLine={false} dy={8} /><YAxis width={52} stroke={CHART_AXIS} fontSize={10} tickLine={false} axisLine={false} tickFormatter={compactCurrency} /><Tooltip cursor={{ fill: "rgba(212,175,55,.05)" }} content={<FinancialTooltip />} /><Bar dataKey="realizedPnl" barSize={22} radius={[2, 2, 0, 0]}>{charts.monthlyRealizedPnl.map((entry, index) => <Cell key={`${entry.month}-${index}`} fill={CHART_POSITIVE} fillOpacity={index === charts.monthlyRealizedPnl.length - 1 ? .68 : .9} />)}</Bar></BarChart></ResponsiveContainer></div></div><div data-financial-surface className="border-t border-[var(--border-subtle)] pt-5"><div className="mb-6"><div className="mb-3 h-px w-9 bg-[var(--viz-gold)]/65" /><h3 className="text-base font-medium text-[var(--text-primary)] md:text-lg">Top contributors</h3><p className="mt-1 text-[12px] text-[var(--text-muted)]">Stocks contributing most to realised P&amp;L</p></div><div className="space-y-5">{contributors.map((item) => <div key={item.stock}><div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="truncate text-[var(--text-secondary)]">{item.stock}</span><span className="shrink-0 tabular-nums text-[var(--text-muted)]">{currency.format(item.realizedPnl)}</span></div><div className="h-1 overflow-hidden rounded-full bg-[var(--border-subtle)]"><div className="h-full bg-[var(--gold-soft)]" style={{ width: `${(item.realizedPnl / maxContributor) * 100}%` }} /></div></div>)}</div></div></div></Reveal>
    <Reveal delay={.16}><div className="mt-8 flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-5 text-sm leading-relaxed text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between"><p>{winRate} win rate across {realisedTrades} realised trades, with an average holding period of {holding.replace(" Days", " days")}.</p><button onClick={() => navigate("/portfolio")} className="group inline-flex shrink-0 items-center gap-2 text-[var(--viz-gold)] transition-colors hover:text-[var(--gold)] motion-reduce:transition-none">View detailed performance <ArrowRight size={15} className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none" /></button></div><p className="mt-5 text-[11px] text-[var(--text-subtle)]">Source: Upstox Realised P&amp;L Report · {profile.reportPeriod}. September reflects realised transactions through {reportEnd}.</p></Reveal>
  </div></section>;
}
