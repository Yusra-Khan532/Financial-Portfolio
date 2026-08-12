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
];

const topSectors = (() => {
  const sorted = [...sectorAllocation].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 5);
  const others = +sorted.slice(5).reduce((s, d) => s + d.value, 0).toFixed(1);
  return others > 0 ? [...top, { name: "Others", value: others }] : top;
})();

const topContribution = (() => {
  const positives = attribution.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const negSum = +attribution.filter((d) => d.value < 0).reduce((s, d) => s + d.value, 0).toFixed(1);
  return negSum ? [...positives, { sector: "Others", value: negSum }] : positives;
})();

const proofStats = [
  { label: "XIRR (Annualized)", value: metric("xirr"), tone: "positive" },
  { label: "Win Rate", value: metric("winrate"), tone: "positive" },
  { label: "Max Drawdown", value: metric("drawdown"), tone: "negative" },
];

export default function Performance() {
  const lenis = useLenis();
  const viewFull = () => lenis?.scrollTo("#holdings", { offset: -70 });

  return (
    <section id="performance" className="relative py-20 md:py-28 px-6 md:px-10">
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

        {/* Editorial KPI composition */}
        <div className="mt-16 grid grid-cols-1 lg:grid-cols-12 gap-y-12 lg:gap-x-10 items-start">
          {/* Featured metric */}
          <Reveal className="lg:col-span-7">
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#64748B]">Net P&amp;L (After Charges)</div>
            <div className="font-serif-display text-6xl md:text-7xl xl:text-8xl text-white mt-3 tracking-tight leading-[0.95]">
              {headline.netPnl}
            </div>
            <div className="mt-8 flex flex-wrap items-end gap-x-12 gap-y-6">
              <div>
                <div className="text-2xl md:text-3xl font-medium text-[#34D399]">{headline.netRoi}</div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#64748B] mt-1">Net ROI</div>
              </div>
              <div>
                <div className="text-2xl md:text-3xl font-medium text-white">{headline.grossPnl}</div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#64748B] mt-1">Gross P&amp;L Generated</div>
              </div>
              <div>
                <div className="text-2xl md:text-3xl font-medium text-white">{headline.grossRoi}</div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#64748B] mt-1">Gross ROI</div>
              </div>
            </div>
          </Reveal>

          {/* Secondary proof — editorial vertical stack, asymmetrically indented */}
          <div className="lg:col-span-5 lg:pl-10 lg:border-l lg:border-white/10 space-y-8">
            {proofStats.map((s, i) => (
              <Reveal key={s.label} delay={0.1 + i * 0.08}>
                <div
                  data-testid={`snapshot-proof-${i}`}
                  className="flex items-baseline gap-5"
                  style={{ marginLeft: i * 18 }}
                >
                  <span
                    className={`font-serif-display text-4xl md:text-5xl tracking-tight ${
                      s.tone === "positive" ? "text-[#34D399]" : s.tone === "negative" ? "text-[#F87171]" : "text-white"
                    }`}
                  >
                    {s.value}
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-[#64748B]">{s.label}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Hidden testids for headline KPIs (kept for reference/tests) */}
        <div className="sr-only">
          <span data-testid="snapshot-headline-0">{headline.grossPnl}</span>
          <span data-testid="snapshot-headline-1">{headline.netPnl}</span>
          <span data-testid="snapshot-headline-2">{headline.grossRoi}</span>
          <span data-testid="snapshot-headline-3">{headline.netRoi}</span>
        </div>

        {/* Main performance chart — open, no heavy container */}
        <Reveal delay={0.05}>
          <div className="mt-20">
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="font-serif-display text-2xl md:text-3xl text-white">
                Portfolio growth vs benchmarks
              </h3>
              <span className="text-xs text-[#64748B] uppercase tracking-wider">Cumulative Returns %</span>
            </div>
            <ResponsiveContainer width="100%" height={450}>
              <LineChart data={growthData} margin={{ left: -16, right: 12, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,0.045)" vertical={false} />
                <XAxis dataKey="date" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#94A3B8", paddingTop: 16 }} iconType="plainline" />
                <Line type="monotone" dataKey="Portfolio" stroke="#F5A623" strokeWidth={3.5} dot={false} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="NIFTY 50" stroke="#64748B" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                <Line type="monotone" dataKey="NIFTY Midcap 150" stroke="#3B4A63" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Reveal>

        {/* Sector insights — asymmetric, light framing */}
        <div className="mt-20 grid grid-cols-1 lg:grid-cols-5 gap-x-16 gap-y-14 items-start">
          <Reveal className="lg:col-span-2">
            <div data-testid="snapshot-sector-allocation">
              <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#F5A623]">Where capital is allocated</div>
              <h3 className="font-serif-display text-xl md:text-2xl text-white mb-8">Allocation by sector</h3>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="46%" height={200}>
                  <PieChart>
                    <Pie data={topSectors} dataKey="value" innerRadius={50} outerRadius={88} paddingAngle={2} stroke="none">
                      {topSectors.map((_, i) => (
                        <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<AllocTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="flex-1 space-y-2.5">
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

          <Reveal className="lg:col-span-3" delay={0.12}>
            <div data-testid="snapshot-sector-contribution">
              <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#F5A623]">Where profit was generated</div>
              <h3 className="font-serif-display text-xl md:text-2xl text-white mb-8">Contribution to Net P&amp;L</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topContribution} layout="vertical" margin={{ left: 26, right: 24 }}>
                  <XAxis type="number" stroke="#64748B" fontSize={11} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="sector" stroke="#94A3B8" fontSize={11} width={92} tickLine={false} axisLine={false} />
                  <Tooltip content={<AllocTooltip />} cursor={{ fill: "rgba(245,166,35,0.06)" }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
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
          <div className="mt-20 border border-white/12 rounded-xl bg-[#0A1E3F]/40 px-8 md:px-12 py-10 md:py-12 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
            <div className="max-w-lg">
              <div className="mb-3 h-px w-12 bg-[#F5A623]" />
              <h3 className="font-serif-display text-3xl md:text-4xl text-white tracking-tight">
                Explore the complete portfolio
              </h3>
              <p className="text-[#94A3B8] mt-3 leading-relaxed">
                Detailed performance, allocation, risk metrics, benchmark comparisons and portfolio analytics.
              </p>
            </div>
            <button
              data-testid="snapshot-view-full"
              onClick={viewFull}
              className="group inline-flex items-center gap-3 px-8 py-4 rounded-full bg-[#F5A623] text-[#050E1D] font-medium hover:bg-[#E19212] transition-colors self-start md:self-auto shrink-0"
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
