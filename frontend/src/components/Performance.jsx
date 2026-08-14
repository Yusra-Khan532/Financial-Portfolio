import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { usePortfolioData } from "@/hooks/usePortfolioData";

const metric = (items, key) => items.find((m) => m.key === key)?.value;

const ChartTooltip = ({ active, payload, label, suffix = "%" }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0A1E3F] border border-white/15 rounded-lg px-4 py-3 shadow-xl">
      {label && <div className="text-xs text-[#94A3B8] mb-2">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-[#94A3B8]">{p.name}:</span>
          <span className="text-white font-medium">{p.value}{suffix}</span>
        </div>
      ))}
    </div>
  );
};

const AllocTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="bg-[#0A1E3F] border border-white/15 rounded-lg px-3 py-2 text-sm">
      <span className="text-[#94A3B8]">{p.name || p.payload.sector}: </span>
      <span className="text-white font-medium">{p.value}%</span>
    </div>
  );
};

const SECTOR_COLORS = ["#F5A623", "#3B82F6", "#64748B", "#94A3B8", "#475569", "#1E40AF"];

const topSectorsFor = (sectorAllocation) => {
  const sorted = [...sectorAllocation].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 5);
  const others = +sorted.slice(5).reduce((s, d) => s + d.value, 0).toFixed(1);
  return others > 0 ? [...top, { name: "Others", value: others }] : top;
};

const topContributionFor = (attribution) => {
  const positives = attribution.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const negSum = +attribution.filter((d) => d.value < 0).reduce((s, d) => s + d.value, 0).toFixed(1);
  return negSum ? [...positives, { sector: "Others", value: negSum }] : positives;
};

const toneCls = (t) =>
  t === "positive" ? "text-[#34D399]" : t === "negative" ? "text-[#F87171]" : "text-white";

export default function Performance() {
  const navigate = useNavigate();
  const { data } = usePortfolioData();
  const { metrics, headline, growthData, sectorAllocation, attribution, profile } = data;
  const topSectors = topSectorsFor(sectorAllocation);
  const topContribution = topContributionFor(attribution);
  const kpis = [
    { label: "Gross P&L Generated", value: headline.grossPnl },
    { label: "Net P&L (After Charges)", value: headline.netPnl },
    { label: "Gross ROI", value: headline.grossRoi },
    { label: "Net ROI", value: headline.netRoi },
  ];
  const proofStats = [
    { label: "XIRR (Annualized)", value: metric(metrics, "xirr"), tone: "positive" },
    { label: "Win Rate", value: metric(metrics, "winrate"), tone: "positive" },
    { label: "Max Drawdown", value: metric(metrics, "drawdown"), tone: "negative" },
  ];

  return (
    <section id="performance" className="relative py-20 md:py-24 px-6 md:px-10">
      <div className="max-w-7xl mx-auto">
        {/* Intro */}
        <Reveal>
          <div className="flex items-center gap-3 mb-5">
            <span className="uppercase tracking-[0.28em] text-[11px] text-[#F5A623]">Performance</span>
            <span className="h-px w-8 bg-[#F5A623]/50" />
            <span className="uppercase tracking-[0.28em] text-[11px] text-[#94A3B8]">Apr–Aug 2026</span>
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <h2 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-white tracking-tight max-w-2xl leading-[1.05]">
              Performance, measured with context.
            </h2>
            <p className="text-[#94A3B8] max-w-sm text-base md:text-lg leading-relaxed">
              Report period {profile.reportPeriod} · Average deployed capital {profile.deployedCapital}.
            </p>
          </div>
        </Reveal>

        {/* Primary KPI strip */}
        <Reveal delay={0.05}>
          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 rounded-xl border border-white/10 bg-[#0A1E3F]/40 overflow-hidden">
            {kpis.map((k, i) => (
              <div
                key={k.label}
                data-testid={`snapshot-headline-${i}`}
                className={`px-5 py-6 md:px-6 md:py-7 ${i < 2 ? "border-b border-white/10 md:border-b-0" : ""} ${
                  i % 2 === 1 ? "border-l border-white/10" : ""
                } md:border-l md:border-white/10 md:first:border-l-0`}
              >
                <div className="text-[11px] md:text-xs uppercase tracking-[0.16em] text-[#64748B] leading-tight">
                  {k.label}
                </div>
                <div className="mt-2.5 text-[2.1rem] md:text-[2.6rem] leading-none font-medium text-white tracking-tight tabular-nums">
                  {k.value}
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Secondary metrics */}
        <Reveal delay={0.1}>
          <div className="mt-6 grid grid-cols-3">
            {proofStats.map((s, i) => (
              <div
                key={s.label}
                data-testid={`snapshot-proof-${i}`}
                className={`px-1 sm:px-5 py-1 ${i > 0 ? "border-l border-white/10 sm:pl-6" : ""}`}
              >
                <div className={`text-lg sm:text-2xl font-medium tabular-nums ${toneCls(s.tone)}`}>{s.value}</div>
                <div className="text-[10px] sm:text-[11px] uppercase tracking-[0.16em] text-[#64748B] mt-1 leading-tight">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Main benchmark chart */}
        <Reveal delay={0.05}>
          <div className="mt-10 rounded-xl border border-white/10 bg-[#0A1E3F]/50 p-5 md:p-7">
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="text-white font-medium text-base md:text-lg">Portfolio growth vs benchmarks</h3>
              <span className="text-[11px] text-[#64748B] uppercase tracking-wider">Cumulative Returns %</span>
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={growthData} margin={{ left: -18, right: 10, top: 6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#94A3B8", paddingTop: 14 }} iconType="plainline" />
                <Line type="monotone" dataKey="Portfolio" stroke="#F5A623" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="NIFTY 50" stroke="#64748B" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                <Line type="monotone" dataKey="NIFTY Midcap 150" stroke="#3B4A63" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Reveal>

        {/* Supporting insights */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Reveal>
            <div data-testid="snapshot-sector-allocation" className="h-full rounded-xl border border-white/10 bg-[#0A1E3F]/40 p-6">
              <div className="mb-1 text-[11px] uppercase tracking-[0.16em] text-[#F5A623]">Where capital is allocated</div>
              <h3 className="text-white font-medium text-base md:text-lg mb-5">Allocation by sector</h3>
              <div className="flex items-center gap-5">
                <ResponsiveContainer width="44%" height={190}>
                  <PieChart>
                    <Pie data={topSectors} dataKey="value" innerRadius={46} outerRadius={80} paddingAngle={2} stroke="none">
                      {topSectors.map((_, i) => (
                        <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<AllocTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="flex-1 space-y-2">
                  {topSectors.map((d, i) => (
                    <li key={d.name} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2.5 text-[#94A3B8]">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                        {d.name}
                      </span>
                      <span className="text-white font-medium tabular-nums">{d.value}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div data-testid="snapshot-sector-contribution" className="h-full rounded-xl border border-white/10 bg-[#0A1E3F]/40 p-6">
              <div className="mb-1 text-[11px] uppercase tracking-[0.16em] text-[#F5A623]">Where profit was generated</div>
              <h3 className="text-white font-medium text-base md:text-lg mb-5">Contribution to Net P&amp;L</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topContribution} layout="vertical" margin={{ left: 24, right: 20 }}>
                  <XAxis type="number" stroke="#64748B" fontSize={11} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="sector" stroke="#94A3B8" fontSize={11} width={92} tickLine={false} axisLine={false} />
                  <Tooltip content={<AllocTooltip />} cursor={{ fill: "rgba(245,166,35,0.06)" }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14}>
                    {topContribution.map((d, i) => (
                      <Cell key={i} fill={d.value >= 0 ? "#F5A623" : "#F87171"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Reveal>
        </div>

        {/* CTA */}
        <Reveal delay={0.05}>
          <div className="mt-8 rounded-xl border border-white/10 bg-[#0A1E3F]/40 px-7 md:px-10 py-8 md:py-9 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="max-w-lg">
              <div className="mb-3 h-px w-10 bg-[#F5A623]" />
              <h3 className="font-serif-display text-2xl md:text-3xl text-white tracking-tight">
                Explore the complete portfolio
              </h3>
              <p className="text-[#94A3B8] mt-2 text-sm md:text-base leading-relaxed">
                Detailed performance, allocation, risk metrics, benchmark comparisons and portfolio analytics.
              </p>
            </div>
            <button
              data-testid="snapshot-view-full"
              onClick={() => navigate("/portfolio")}
              className="group inline-flex items-center gap-3 px-7 py-3.5 rounded-full bg-[#F5A623] text-[#050E1D] font-medium hover:bg-[#E19212] transition-colors self-start md:self-auto shrink-0"
            >
              View Full Portfolio Report
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
