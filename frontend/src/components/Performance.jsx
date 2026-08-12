import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend,
} from "recharts";
import { useLenis } from "lenis/react";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { metrics, headline, growthData, sectorAllocation, attribution } from "@/data/portfolio";

const metric = (key) => metrics.find((m) => m.key === key)?.value;

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

const SECTOR_COLORS = [
  "#F5A623", "#3B82F6", "#64748B", "#94A3B8", "#475569", "#1E40AF",
  "#0EA5E9", "#6366F1", "#8B5CF6", "#14B8A6", "#D4AF37", "#334155",
];

const headlineStats = [
  { label: "Gross P&L Generated", value: headline.grossPnl },
  { label: "Net P&L (After Charges)", value: headline.netPnl },
  { label: "Gross ROI", value: headline.grossRoi },
  { label: "Net ROI", value: headline.netRoi },
];

const proofStats = [
  { label: "XIRR (Annualized)", value: metric("xirr"), tone: "positive" },
  { label: "Win Rate", value: metric("winrate"), tone: "positive" },
  { label: "Max Drawdown", value: metric("drawdown"), tone: "negative" },
];

export default function Performance() {
  const lenis = useLenis();
  const viewFull = () => lenis?.scrollTo("#allocation", { offset: -70 });

  return (
    <section id="performance" className="relative py-24 md:py-32 px-6 md:px-10">
      <div className="max-w-7xl mx-auto">
        {/* Intro */}
        <Reveal>
          <div className="flex items-center gap-3 mb-6">
            <span className="uppercase tracking-[0.28em] text-[11px] text-[#F5A623]">Performance</span>
            <span className="h-px w-8 bg-[#F5A623]/50" />
            <span className="uppercase tracking-[0.28em] text-[11px] text-[#94A3B8]">Apr–Aug 2026</span>
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <h2 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-white tracking-tight max-w-2xl leading-[1.02]">
              Performance, measured with context.
            </h2>
            <p className="text-[#94A3B8] max-w-sm text-sm md:text-base leading-relaxed">
              Report period 01 Apr 2026 – 07 Aug 2026 · Average deployed capital ₹30,00,000.
            </p>
          </div>
        </Reveal>

        {/* Headline stat strip */}
        <div className="mt-16 grid grid-cols-2 lg:grid-cols-4 border-t border-white/12">
          {headlineStats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.07}>
              <div
                data-testid={`snapshot-headline-${i}`}
                className={`py-8 lg:py-10 pr-6 ${i >= 2 ? "border-t border-white/12" : ""} lg:border-t-0 ${
                  i > 0 ? "lg:border-l lg:border-white/12 lg:pl-8" : ""
                }`}
              >
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#64748B] leading-tight">{s.label}</div>
                <div className="font-serif-display text-3xl md:text-4xl xl:text-5xl text-white mt-3 tracking-tight">
                  {s.value}
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Secondary proof metrics */}
        <Reveal delay={0.1}>
          <div className="mt-4 flex flex-wrap items-center gap-x-10 gap-y-4 border-t border-white/12 pt-6">
            {proofStats.map((s, i) => (
              <div key={s.label} data-testid={`snapshot-proof-${i}`} className="flex items-baseline gap-3">
                <span
                  className={`text-xl md:text-2xl font-medium ${
                    s.tone === "positive" ? "text-[#34D399]" : s.tone === "negative" ? "text-[#F87171]" : "text-white"
                  }`}
                >
                  {s.value}
                </span>
                <span className="text-[11px] uppercase tracking-[0.18em] text-[#64748B]">{s.label}</span>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Main performance chart */}
        <Reveal delay={0.05}>
          <div className="mt-16 border-t border-white/12 pt-10">
            <div className="flex items-baseline justify-between mb-8">
              <h3 className="font-serif-display text-2xl md:text-3xl text-white">
                Portfolio growth vs benchmarks
              </h3>
              <span className="text-xs text-[#64748B] uppercase tracking-wider">Cumulative Returns %</span>
            </div>
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={growthData} margin={{ left: -16, right: 12, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" stroke="#64748B" fontSize={12} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                <YAxis stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#94A3B8", paddingTop: 12 }} iconType="plainline" />
                <Line type="monotone" dataKey="Portfolio" stroke="#F5A623" strokeWidth={3.5} dot={false} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="NIFTY 50" stroke="#64748B" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                <Line type="monotone" dataKey="NIFTY Midcap 150" stroke="#3B4A63" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Reveal>

        {/* Two portfolio insight charts */}
        <div className="mt-16 grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-12 border-t border-white/12 pt-10">
          <Reveal>
            <div data-testid="snapshot-sector-allocation">
              <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#F5A623]">Where capital is allocated</div>
              <h3 className="font-serif-display text-xl md:text-2xl text-white mb-6">Allocation by sector</h3>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="48%" height={220}>
                  <PieChart>
                    <Pie data={sectorAllocation} dataKey="value" innerRadius={52} outerRadius={92} paddingAngle={2} stroke="none">
                      {sectorAllocation.map((_, i) => (
                        <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<AllocTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="flex-1 space-y-1.5">
                  {sectorAllocation.map((d, i) => (
                    <li key={d.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-[#94A3B8]">
                        <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                        {d.name}
                      </span>
                      <span className="text-white font-medium">{d.value}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div data-testid="snapshot-sector-contribution">
              <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#F5A623]">Where profit was generated</div>
              <h3 className="font-serif-display text-xl md:text-2xl text-white mb-6">Contribution to Net P&L</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={attribution} layout="vertical" margin={{ left: 26, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" stroke="#64748B" fontSize={11} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="sector" stroke="#94A3B8" fontSize={11} width={92} tickLine={false} axisLine={false} />
                  <Tooltip content={<AllocTooltip />} cursor={{ fill: "rgba(245,166,35,0.06)" }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {attribution.map((d, i) => (
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
          <div className="mt-16 border-t border-white/12 pt-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <p className="text-[#94A3B8] max-w-md leading-relaxed">
              Explore detailed allocation, benchmark performance, risk metrics and portfolio analytics.
            </p>
            <button
              data-testid="snapshot-view-full"
              onClick={viewFull}
              className="group inline-flex items-center gap-3 px-8 py-3.5 rounded-full bg-[#F5A623] text-[#050E1D] font-medium hover:bg-[#E19212] transition-colors self-start sm:self-auto"
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
