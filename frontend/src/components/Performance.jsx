import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, Legend,
} from "recharts";
import { Reveal, SectionLabel } from "@/components/Reveal";
import {
  metrics, headline, profile, growthData, returnsComparison,
  marketCapPerf, etfPerf, riskSummary,
} from "@/data/portfolio";

const toneColor = (t) =>
  t === "positive" ? "text-[#10B981]" : t === "negative" ? "text-[#EF4444]" : "text-white";

const ChartTooltip = ({ active, payload, label, suffix = "%" }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0A1E3F] border border-white/15 rounded-lg px-4 py-3 shadow-xl">
      {label && <div className="text-xs text-[#94A3B8] mb-2">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-[#94A3B8]">{p.name}:</span>
          <span className="text-white font-medium">
            {p.value}{suffix}
          </span>
        </div>
      ))}
    </div>
  );
};

const barColors = ["#F5A623", "#475569", "#94A3B8"];

export default function Performance() {
  return (
    <section id="performance" className="relative py-24 md:py-32 px-6 md:px-10">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <SectionLabel index="01">Performance Report</SectionLabel>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <h2 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-white tracking-tight max-w-2xl">
              Four months of disciplined, measurable returns.
            </h2>
            <p className="text-[#94A3B8] max-w-sm">
              Report period {profile.reportPeriod} · returns on average deployed
              capital of {profile.deployedCapital}.
            </p>
          </div>
        </Reveal>

        {/* headline P&L */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 mt-14">
          {[
            ["Gross P&L Generated", headline.grossPnl, "positive"],
            ["Net P&L (After Charges)", headline.netPnl, "positive"],
            ["Gross ROI", headline.grossRoi, "positive"],
            ["Net ROI", headline.netRoi, "positive"],
          ].map(([label, value, tone], i) => (
            <Reveal key={label} delay={i * 0.06}>
              <div
                data-testid={`headline-${i}`}
                className="bg-[#0A1E3F] border border-white/10 rounded-lg p-6 h-full hover:-translate-y-1 hover:border-[#F5A623]/40 transition-all duration-300"
              >
                <div className="text-xs uppercase tracking-widest text-[#64748B]">{label}</div>
                <div className={`font-serif-display text-3xl md:text-4xl mt-3 ${toneColor(tone)}`}>
                  {value}
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* metrics grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 mt-6">
          {metrics.map((m, i) => (
            <Reveal key={m.key} delay={(i % 4) * 0.05}>
              <div
                data-testid={`metric-${m.key}`}
                className="bg-[#0A1E3F]/60 border border-white/10 rounded-lg p-5 hover:border-[#F5A623]/40 transition-colors duration-300"
              >
                <div className="text-[11px] uppercase tracking-wider text-[#64748B] leading-tight">
                  {m.label}
                </div>
                <div className={`text-2xl mt-2 font-medium ${toneColor(m.tone)}`}>{m.value}</div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* charts */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6">
          <Reveal className="lg:col-span-3">
            <div className="bg-[#0A1E3F] border border-white/10 rounded-lg p-6 h-full">
              <div className="flex items-baseline justify-between mb-6">
                <h3 className="text-white font-medium">Portfolio Growth Over Time</h3>
                <span className="text-xs text-[#64748B]">Cumulative Returns %</span>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={growthData} margin={{ left: -18, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" stroke="#64748B" fontSize={12} tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={12} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#94A3B8" }} />
                  <Line type="monotone" dataKey="Portfolio" stroke="#F5A623" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="NIFTY 50" stroke="#94A3B8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="NIFTY Midcap 150" stroke="#475569" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Reveal>

          <Reveal className="lg:col-span-2" delay={0.1}>
            <div className="bg-[#0A1E3F] border border-white/10 rounded-lg p-6 h-full">
              <div className="flex items-baseline justify-between mb-6">
                <h3 className="text-white font-medium">Returns Comparison</h3>
                <span className="text-xs text-[#64748B]">Annualized</span>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={returnsComparison} margin={{ left: -18, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="name" stroke="#64748B" fontSize={11} tickLine={false} interval={0} />
                  <YAxis stroke="#64748B" fontSize={12} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(245,166,35,0.06)" }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {returnsComparison.map((_, i) => (
                      <Cell key={i} fill={barColors[i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Reveal>
        </div>

        {/* tables + risk */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <Reveal>
            <PerfTable
              testid="marketcap-perf"
              title="Market Cap Performance"
              head={["Market Cap", "ROI", "XIRR"]}
              rows={marketCapPerf.map((r) => [r.cap, r.roi, r.xirr])}
            />
          </Reveal>
          <Reveal delay={0.08}>
            <PerfTable
              testid="etf-perf"
              title="ETF Performance"
              head={["Category", "ROI", "XIRR"]}
              rows={etfPerf.map((r) => [r.cat, r.roi, r.xirr])}
            />
          </Reveal>
          <Reveal delay={0.16}>
            <div className="bg-[#0A1E3F] border border-white/10 rounded-lg p-6 h-full">
              <h3 className="text-white font-medium mb-5">Risk & Return Summary</h3>
              <div className="space-y-4">
                {riskSummary.map((r) => (
                  <div key={r.label} className="flex items-center justify-between border-b border-white/5 pb-3">
                    <span className="text-sm text-[#94A3B8]">{r.label}</span>
                    <span className={`text-lg font-medium ${toneColor(r.tone)}`}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

const PerfTable = ({ title, head, rows, testid }) => (
  <div data-testid={testid} className="bg-[#0A1E3F] border border-white/10 rounded-lg p-6 h-full">
    <h3 className="text-white font-medium mb-5">{title}</h3>
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[#64748B] uppercase text-[11px] tracking-wider">
          {head.map((h) => (
            <th key={h} className="pb-3 font-normal">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={i}
            className={`border-t border-white/5 hover:bg-white/5 transition-colors ${
              i === rows.length - 1 ? "text-[#F5A623] font-medium" : "text-[#CBD5E1]"
            }`}
          >
            {r.map((c, j) => (
              <td key={j} className="py-3 pr-2">{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
