import { Activity, ArrowRight, Award, IndianRupee, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useNavigate } from "react-router-dom";
import { Reveal } from "@/components/Reveal";
import { usePortfolioData } from "@/hooks/usePortfolioData";

const metric = (items, key) => items.find((item) => item.key === key)?.value;
const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CHART_AXIS = "var(--home-support)";
const CHART_GRID = "var(--home-border)";
const CHART_POSITIVE = "var(--positive)";
const CHART_NEGATIVE = "var(--negative)";

const compactCurrency = (value) => {
  if (value === 0) return "₹0";
  const sign = value < 0 ? "−" : "";
  const amount = Math.abs(value);
  if (amount >= 100000) return `${sign}₹${(amount / 100000).toFixed(1)}L`;
  return `${sign}₹${Math.round(amount / 1000)}K`;
};

function FinancialTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div data-financial-tooltip className="rounded-lg border border-[var(--home-border)] bg-[var(--home-header-bg)] px-3 py-2.5 text-sm text-[var(--home-text)] shadow-lg">
      <div className="text-[11px] font-medium uppercase tracking-[.12em] text-[var(--home-support)]">{label}</div>
      <div className="mt-1 font-medium tabular-nums">{currency.format(payload[0].value)}</div>
    </div>
  );
}

function IconBadge({ children }) {
  return <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--home-border)] bg-[var(--home-secondary-hover)] text-[var(--home-gold)]" aria-hidden="true">{children}</span>;
}

function PrimaryMetricCard({ label, value, detail, icon: Icon, testId }) {
  return (
    <article data-financial-kpi="primary" data-testid={testId} className="flex min-h-[164px] min-w-0 flex-col rounded-xl border border-[var(--home-border)] bg-[var(--surface-bg)] p-5 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[var(--home-gold)] motion-reduce:transform-none motion-reduce:transition-none md:min-h-[176px] md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-xs font-medium uppercase tracking-[.14em] text-[var(--home-support)]">{label}</div>
        <IconBadge><Icon size={20} strokeWidth={1.6} /></IconBadge>
      </div>
      <div className="mt-auto pt-5">
        <div className="whitespace-nowrap text-[clamp(1.75rem,3vw,2.25rem)] font-semibold leading-none tracking-tight tabular-nums text-[var(--home-text)]">{value}</div>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--home-support)]">{detail}</p>
      </div>
    </article>
  );
}

function SupportingMetric({ label, value }) {
  return (
    <div className="min-w-0 border-t border-[var(--home-border)] pt-3 first:border-t-0 first:pt-0 sm:border-t-0 sm:border-l sm:pl-4 sm:first:border-l-0 sm:first:pl-0">
      <div className="text-[11px] font-medium uppercase tracking-[.12em] text-[var(--home-support)]">{label}</div>
      <div className="mt-1 text-base font-medium tabular-nums text-[var(--home-text)]">{value}</div>
    </div>
  );
}

export default function Performance() {
  const navigate = useNavigate();
  const { data } = usePortfolioData();
  const { charts, headline, metrics, profile, charges, summary } = data;
  const reportEnd = profile.reportPeriod.split(" – ")[1]?.trim() || profile.reportPeriod;
  const winRate = metric(metrics, "winrate");
  const realisedTrades = metric(metrics, "active-trades");
  const holding = metric(metrics, "holding");
  const secondaryKpis = [["Gross P&L", headline.grossPnl], ["Gross ROI", headline.grossRoi], ["Total Charges", charges.totalFormatted], ["Avg Holding", holding]];
  const contributors = charts.pnlAttribution.filter((item) => item.realizedPnl > 0).slice(0, 5);

  return (
    <section id="performance" className="relative bg-[var(--home-page-bg)] px-5 py-10 md:px-8 md:py-16">
      <div className="mx-auto max-w-[1200px]">
        <Reveal>
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium uppercase tracking-[.16em] text-[var(--home-gold-text)]">Performance</span>
              <span className="h-px w-8 bg-[var(--home-gold)]/60" />
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-8">
              <div>
                <h2 className="font-serif-display text-[clamp(1.75rem,4vw,2.5rem)] font-normal leading-[1.2] text-[var(--home-text)]">Realised portfolio performance</h2>
                <p className="mt-3 max-w-[620px] text-base leading-[1.6] text-[var(--home-support)]">A snapshot of realised equity results for the reporting period.</p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 border-l border-[var(--home-border)] pl-4 text-sm leading-relaxed text-[var(--home-support)] md:max-w-[360px] md:justify-end md:border-l-0 md:border-r md:pr-4 md:text-right">
                <span>{profile.reportPeriod}</span>
                <span>{profile.deployedCapital} average deployed capital</span>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          <div className="mt-8 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <PrimaryMetricCard label="Net P&L" value={headline.netPnl} detail="After charges" icon={IndianRupee} testId="snapshot-headline-0" />
            <PrimaryMetricCard label="Net ROI" value={headline.netRoi} detail={`On ${profile.deployedCapital} deployed capital`} icon={TrendingUp} testId="snapshot-headline-1" />
            <PrimaryMetricCard label="Win rate" value={winRate} detail="Profitable realised trades" icon={Award} testId="snapshot-headline-2" />
            <PrimaryMetricCard label="Realised trades" value={realisedTrades} detail={`Through ${reportEnd}`} icon={Activity} testId="snapshot-headline-3" />
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
            <section data-financial-surface className="min-w-0 rounded-xl border border-[var(--home-border)] bg-[var(--surface-bg)] p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-[var(--home-text)]">Monthly realised P&amp;L</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--home-support)]">Realised monthly outcome through {reportEnd}; September is a partial reporting month.</p>
                </div>
                <span className="shrink-0 pt-1 text-right text-[11px] font-medium uppercase tracking-[.12em] text-[var(--home-support)]">₹ realised P&amp;L</span>
              </div>
              <div className="mt-5 h-[240px] min-w-0 sm:h-[260px] lg:h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.monthlyRealizedPnl} margin={{ top: 12, right: 4, left: 0, bottom: 0 }} barCategoryGap="24%">
                    <CartesianGrid vertical={false} stroke={CHART_GRID} strokeDasharray="2 5" />
                    <XAxis dataKey="month" stroke={CHART_AXIS} fontSize={12} tickLine={false} axisLine={false} dy={8} />
                    <YAxis width={54} stroke={CHART_AXIS} fontSize={11} tickLine={false} axisLine={false} tickFormatter={compactCurrency} />
                    <Tooltip cursor={{ fill: "var(--home-secondary-hover)" }} content={<FinancialTooltip />} />
                    <Bar dataKey="realizedPnl" maxBarSize={42} radius={[3, 3, 0, 0]}>
                      {charts.monthlyRealizedPnl.map((entry, index) => (
                        <Cell key={`${entry.month}-${index}`} fill={entry.realizedPnl >= 0 ? CHART_POSITIVE : CHART_NEGATIVE} fillOpacity={index === charts.monthlyRealizedPnl.length - 1 ? 0.68 : 0.9} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="sr-only">
                <caption>Monthly realised P&amp;L</caption>
                <thead><tr><th>Month</th><th>Realised P&amp;L</th></tr></thead>
                <tbody>{charts.monthlyRealizedPnl.map((entry) => <tr key={entry.month}><td>{entry.month}</td><td>{currency.format(entry.realizedPnl)}</td></tr>)}</tbody>
              </table>
            </section>

            <section data-financial-surface className="min-w-0 rounded-xl border border-[var(--home-border)] bg-[var(--surface-bg)] p-5 md:p-6">
              <h3 className="text-lg font-semibold text-[var(--home-text)]">Top contributors</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--home-support)]">Largest contributors to realised P&amp;L.</p>
              <div className="mt-4">
                {contributors.map((item) => (
                  <div key={item.stock} className="flex min-w-0 items-center justify-between gap-4 border-t border-[var(--home-border)] py-3.5 text-sm first:border-t-0 first:pt-0">
                    <span className="min-w-0 truncate text-[var(--home-text)]">{item.stock}</span>
                    <span className="shrink-0 tabular-nums text-[var(--home-support)]">{currency.format(item.realizedPnl)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="mt-6 border-t border-[var(--home-border)] pb-16 pt-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <p className="max-w-2xl text-sm leading-[1.6] text-[var(--home-support)]">{winRate} win rate across {summary.tradeCount || realisedTrades} realised trades, with an average holding period of {holding.replace(" Days", " days")}.</p>
              <button onClick={() => navigate("/portfolio")} className="group inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-[var(--home-border)] px-4 py-2.5 text-sm font-medium text-[var(--home-text)] transition-colors hover:border-[var(--home-gold)] hover:bg-[var(--home-secondary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--home-gold)] lg:self-auto">View detailed performance <ArrowRight size={15} className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none" /></button>
            </div>
            <div className="mt-5 grid gap-4 border-t border-[var(--home-border)] pt-4 sm:grid-cols-2 md:grid-cols-4">
              {secondaryKpis.map(([label, value]) => <div key={label} className="min-w-0 border-t border-[var(--home-border)] pt-3 first:border-t-0 first:pt-0 sm:border-t-0 sm:border-l sm:pl-4 sm:first:border-l-0 sm:first:pl-0"><div className="text-[11px] font-medium uppercase tracking-[.12em] text-[var(--home-support)]">{label}</div><div className="mt-1 text-base font-medium tabular-nums text-[var(--home-text)]">{value}</div></div>)}
            </div>
            <p className="mt-5 text-xs leading-relaxed text-[var(--home-support)]">Source: Upstox Realised P&amp;L Report · {profile.reportPeriod}. September reflects realised transactions through {reportEnd}.</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
