import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/Reveal";
import { holdings } from "@/data/portfolio";

const maxPct = Math.max(...holdings.map((h) => parseFloat(h.pct)));
const secondaryLine = (h) => (h.cap && h.cap !== "—" ? `${h.sector} · ${h.cap}` : h.sector);
const barWidth = (h) => `${(parseFloat(h.pct) / maxPct) * 100}%`;

const AllocBar = ({ h, reduced }) => (
  <div className="h-px w-full bg-white/8 relative overflow-hidden">
    <motion.span
      className="absolute inset-y-0 left-0 bg-[#F5A623]/40 group-hover:bg-[#F5A623] transition-colors"
      initial={reduced ? false : { width: 0 }}
      whileInView={reduced ? {} : { width: barWidth(h) }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      style={reduced ? { width: barWidth(h) } : undefined}
    />
  </div>
);

const FeatureBlock = ({ h, rank, reduced, delay }) => (
  <Reveal delay={delay}>
    <div className="group">
      <div className="flex items-baseline gap-3">
        <span className="font-serif-display text-[#F5A623] text-xl">{String(rank).padStart(2, "0")}</span>
        <span className="text-[10px] uppercase tracking-[0.22em] text-[#64748B]">Top Conviction</span>
      </div>
      <h3 className="mt-4 font-serif-display text-3xl md:text-[2.6rem] leading-[1.05] text-white group-hover:text-[#F5A623] transition-colors break-words">
        {h.company}
      </h3>
      <div className="mt-3 text-xs uppercase tracking-[0.1em] text-[#64748B]">{secondaryLine(h)}</div>
      <div className="mt-6 flex items-baseline gap-3">
        <span className="font-serif-display text-4xl text-white tabular-nums">{h.pct}</span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-[#64748B]">of portfolio</span>
      </div>
      <div className="mt-4">
        <AllocBar h={h} reduced={reduced} />
      </div>
    </div>
  </Reveal>
);

const CompactRow = ({ h, rank, reduced, delay }) => (
  <Reveal delay={delay}>
    <div className="group flex items-baseline gap-4">
      <span className="font-serif-display text-[#F5A623]/80 text-base w-6 shrink-0 tabular-nums">
        {String(rank).padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-white text-lg leading-snug group-hover:text-[#F5A623] transition-colors break-words">
            {h.company}
          </span>
          <span className="text-white/90 font-medium text-sm shrink-0 tabular-nums">{h.pct}</span>
        </div>
        <div className="text-[11px] uppercase tracking-[0.08em] text-[#64748B] mt-1.5">{secondaryLine(h)}</div>
        <div className="mt-3">
          <AllocBar h={h} reduced={reduced} />
        </div>
      </div>
    </div>
  </Reveal>
);

export default function Holdings() {
  const reduced = useReducedMotion();
  const featured = holdings.slice(0, 3);
  const rest = holdings.slice(3, 10);

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

        {/* Top 3 — prominent editorial blocks */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-x-12 gap-y-12">
          {featured.map((h, i) => (
            <div key={h.company} data-testid={`holding-${i}`}>
              <FeatureBlock h={h} rank={i + 1} reduced={reduced} delay={i * 0.08} />
            </div>
          ))}
        </div>

        {/* Remaining 7 — quieter supporting layout */}
        <div className="mt-20 pt-10 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-x-16 gap-y-9">
          {rest.map((h, i) => (
            <div key={h.company} data-testid={`holding-${i + 3}`}>
              <CompactRow h={h} rank={i + 4} reduced={reduced} delay={(i % 2) * 0.06} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
