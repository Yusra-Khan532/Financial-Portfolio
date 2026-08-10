import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Reveal, SectionLabel } from "@/components/Reveal";
import { sectorAllocation, marketCapAllocation, segmentAllocation, etfGeography, attribution } from "@/data/portfolio";

const GOLDS = ["#F5A623", "#D4AF37", "#E19212", "#C68A1F", "#B8860B", "#9C6F13"];
const NAVIES = ["#F5A623", "#3B82F6", "#64748B", "#94A3B8", "#475569", "#1E40AF", "#0EA5E9", "#6366F1", "#8B5CF6", "#14B8A6", "#F59E0B", "#334155"];

const AllocTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="bg-[#0A1E3F] border border-white/15 rounded-lg px-3 py-2 text-sm">
      <span className="text-[#94A3B8]">{p.name}: </span>
      <span className="text-white font-medium">{p.value}%</span>
    </div>
  );
};

const Donut = ({ title, data, colors, testid }) => (
  <div data-testid={testid} className="bg-[#0A1E3F] border border-white/10 rounded-lg p-6">
    <h3 className="text-white font-medium mb-4">{title}</h3>
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="45%" height={160}>
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={38} outerRadius={68} paddingAngle={2} stroke="none">
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip content={<AllocTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-[#94A3B8]">
              <span className="h-2 w-2 rounded-sm" style={{ background: colors[i % colors.length] }} />
              {d.name}
            </span>
            <span className="text-white font-medium">{d.value}%</span>
          </li>
        ))}
      </ul>
    </div>
  </div>
);

export default function Allocation() {
  return (
    <section id="allocation" className="relative py-24 md:py-32 px-6 md:px-10 bg-[#04101f]">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <SectionLabel index="02">Portfolio Construction</SectionLabel>
          <h2 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-white tracking-tight max-w-3xl">
            Diversified by design, concentrated by conviction.
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-14">
          <Reveal>
            <Donut testid="alloc-sector" title="By Sector (% of invested capital)" data={sectorAllocation} colors={NAVIES} />
          </Reveal>
          <Reveal delay={0.08}>
            <div className="bg-[#0A1E3F] border border-white/10 rounded-lg p-6 h-full">
              <h3 className="text-white font-medium mb-6">Contribution to Net P&L by Sector</h3>
              <ResponsiveContainer width="100%" height={330}>
                <BarChart data={attribution} layout="vertical" margin={{ left: 30, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" stroke="#64748B" fontSize={11} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="sector" stroke="#94A3B8" fontSize={11} width={90} tickLine={false} axisLine={false} />
                  <Tooltip content={<AllocTooltip />} cursor={{ fill: "rgba(245,166,35,0.06)" }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {attribution.map((d, i) => (
                      <Cell key={i} fill={d.value >= 0 ? "#F5A623" : "#EF4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <Reveal>
            <Donut testid="alloc-marketcap" title="By Market Cap" data={marketCapAllocation} colors={GOLDS} />
          </Reveal>
          <Reveal delay={0.08}>
            <Donut testid="alloc-segment" title="By Segment" data={segmentAllocation} colors={["#F5A623", "#3B82F6", "#64748B"]} />
          </Reveal>
          <Reveal delay={0.16}>
            <Donut testid="alloc-etf" title="ETF Geography" data={etfGeography} colors={["#F5A623", "#3B82F6", "#EF4444", "#94A3B8"]} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
