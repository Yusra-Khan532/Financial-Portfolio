import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/Reveal";
import { holdings } from "@/data/portfolio";

const maxPct = Math.max(...holdings.map((h) => parseFloat(h.pct)));
const barWidth = (h) => `${(parseFloat(h.pct) / maxPct) * 100}%`;

const AllocBar = ({ h, reduced }) => (
  <div className="mt-2 h-px w-full bg-white/8 relative overflow-hidden">
    <motion.span
      className="absolute inset-y-0 left-0 bg-[#F5A623]/40 group-hover:bg-[#F5A623] transition-colors"
      initial={reduced ? false : { width: 0 }}
      whileInView={reduced ? {} : { width: barWidth(h) }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      style={reduced ? { width: barWidth(h) } : undefined}
    />
  </div>
);

export default function Holdings() {
  const reduced = useReducedMotion();
  return (
    <section id="holdings" className="relative py-20 md:py-24 px-6 md:px-10">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="flex items-center gap-3 mb-5">
            <span className="uppercase tracking-[0.28em] text-[11px] text-[#F5A623]">Portfolio</span>
            <span className="h-px w-8 bg-[#F5A623]/50" />
            <span className="uppercase tracking-[0.28em] text-[11px] text-[#94A3B8]">High-Conviction Positions</span>
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <h2 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-white tracking-tight">
              Top ten holdings.
            </h2>
            <p className="text-[#94A3B8] max-w-sm text-base md:text-lg leading-relaxed">
              High-conviction positions across market caps — every name earns its
              place through fundamental research.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mt-10 rounded-xl border border-white/10 bg-[#0A1E3F]/40 overflow-hidden">
            {/* Header row (desktop) */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-7 py-4 border-b border-white/10 text-[11px] uppercase tracking-[0.16em] text-[#5A6B85]">
              <span className="col-span-1">Rank</span>
              <span className="col-span-5">Company / ETF</span>
              <span className="col-span-3">Sector</span>
              <span className="col-span-2">Market Cap</span>
              <span className="col-span-1 text-right">% Port.</span>
            </div>

            {holdings.map((h, i) => {
              const hasCap = h.cap && h.cap !== "—";
              return (
                <div
                  key={h.company}
                  data-testid={`holding-${i}`}
                  className="group px-7 py-5 md:py-6 border-b border-white/8 last:border-b-0 hover:bg-white/[0.03] transition-colors"
                >
                  {/* Desktop row */}
                  <div className="hidden md:grid grid-cols-12 gap-4 items-center">
                    <span className="col-span-1 font-serif-display text-[#F5A623] text-lg tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="col-span-5">
                      <div className="text-white text-[19px] leading-snug group-hover:text-[#F5A623] transition-colors">
                        {h.company}
                      </div>
                      <AllocBar h={h} reduced={reduced} />
                    </div>
                    <span className="col-span-3 text-[15px] text-[#94A3B8]">{h.sector}</span>
                    <span className="col-span-2 text-[15px] text-[#94A3B8]">{h.cap}</span>
                    <span className="col-span-1 text-right text-[19px] font-semibold text-white tabular-nums">
                      {h.pct}
                    </span>
                  </div>

                  {/* Mobile stacked entry */}
                  <div className="md:hidden">
                    <div className="flex items-baseline gap-3">
                      <span className="font-serif-display text-[#F5A623] text-base tabular-nums shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="flex-1 min-w-0 text-white text-[18px] leading-snug break-words">
                        {h.company}
                      </span>
                      <span className="text-[18px] font-semibold text-white tabular-nums shrink-0">{h.pct}</span>
                    </div>
                    <div className="mt-1.5 pl-9 text-[14px] text-[#94A3B8]">
                      {h.sector}{hasCap ? ` · ${h.cap}` : ""}
                    </div>
                    <div className="pl-9">
                      <AllocBar h={h} reduced={reduced} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
