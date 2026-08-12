import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/Reveal";
import { holdings } from "@/data/portfolio";

const maxPct = Math.max(...holdings.map((h) => parseFloat(h.pct)));
const secondaryLine = (h) => (h.cap && h.cap !== "—" ? `${h.sector} · ${h.cap}` : h.sector);
const barWidth = (h) => `${(parseFloat(h.pct) / maxPct) * 100}%`;

const Tile = ({ h, rank, reduced }) => (
  <div
    data-testid={`holding-${rank - 1}`}
    className="group h-full flex flex-col rounded-xl border border-white/10 bg-[#0A1E3F]/40 p-5 hover:border-[#F5A623]/40 transition-colors duration-300"
  >
    <div className="flex items-center justify-between">
      <span className="font-serif-display text-[#F5A623] text-lg tabular-nums">
        {String(rank).padStart(2, "0")}
      </span>
      <span className="text-sm font-medium text-white/90 tabular-nums">{h.pct}</span>
    </div>

    <div className="mt-4 flex-1">
      <h3 className="text-white text-lg leading-snug group-hover:text-[#F5A623] transition-colors break-words">
        {h.company}
      </h3>
      <div className="mt-1.5 text-[11px] uppercase tracking-[0.08em] text-[#64748B] leading-relaxed">
        {secondaryLine(h)}
      </div>
    </div>

    <div className="mt-5 h-px w-full bg-white/8 relative overflow-hidden">
      <motion.span
        className="absolute inset-y-0 left-0 bg-[#F5A623]/40 group-hover:bg-[#F5A623] transition-colors"
        initial={reduced ? false : { width: 0 }}
        whileInView={reduced ? {} : { width: barWidth(h) }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        style={reduced ? { width: barWidth(h) } : undefined}
      />
    </div>
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

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 md:gap-5">
          {holdings.map((h, i) => (
            <Reveal key={h.company} delay={(i % 5) * 0.05}>
              <Tile h={h} rank={i + 1} reduced={reduced} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
