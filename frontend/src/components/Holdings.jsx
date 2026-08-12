import { motion } from "framer-motion";
import { Reveal } from "@/components/Reveal";
import { holdings } from "@/data/portfolio";

const maxPct = Math.max(...holdings.map((h) => parseFloat(h.pct)));

const HoldingRow = ({ h, rank }) => {
  const secondary = h.cap && h.cap !== "—" ? `${h.sector} · ${h.cap}` : h.sector;
  const width = `${(parseFloat(h.pct) / maxPct) * 100}%`;
  return (
    <motion.div
      data-testid={`holding-${rank - 1}`}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: ((rank - 1) % 5) * 0.05 }}
      className="group py-5 border-t border-white/10"
    >
      <div className="flex items-baseline gap-4 sm:gap-6">
        <span className="font-serif-display text-[#F5A623] text-base sm:text-lg w-7 shrink-0 tabular-nums">
          {String(rank).padStart(2, "0")}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-white text-lg md:text-xl leading-snug group-hover:text-[#F5A623] transition-colors break-words">
              {h.company}
            </span>
            <span className="text-white font-medium text-sm md:text-base shrink-0 tabular-nums">
              {h.pct}
            </span>
          </div>
          <div className="text-xs md:text-sm text-[#64748B] mt-1.5 uppercase tracking-[0.08em]">
            {secondary}
          </div>
          <div className="mt-3 h-px w-full bg-white/8 relative overflow-hidden">
            <span
              className="absolute inset-y-0 left-0 bg-[#F5A623]/40 group-hover:bg-[#F5A623] transition-colors"
              style={{ width }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default function Holdings() {
  const left = holdings.slice(0, 5);
  const right = holdings.slice(5, 10);
  return (
    <section id="holdings" className="relative py-20 md:py-28 px-6 md:px-10">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="flex items-center gap-3 mb-6">
            <span className="uppercase tracking-[0.28em] text-[11px] text-[#F5A623]">Portfolio</span>
            <span className="h-px w-8 bg-[#F5A623]/50" />
            <span className="uppercase tracking-[0.28em] text-[11px] text-[#94A3B8]">High-Conviction Positions</span>
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <h2 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-white tracking-tight">
              Top ten holdings.
            </h2>
            <p className="text-[#94A3B8] max-w-sm text-sm md:text-base leading-relaxed">
              High-conviction positions across market caps — every name earns its
              place through fundamental research.
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 lg:grid-cols-2 lg:gap-x-16">
          <div>
            {left.map((h, i) => (
              <HoldingRow key={h.company} h={h} rank={i + 1} />
            ))}
          </div>
          <div>
            {right.map((h, i) => (
              <HoldingRow key={h.company} h={h} rank={i + 6} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
