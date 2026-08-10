import { motion } from "framer-motion";
import { Reveal, SectionLabel } from "@/components/Reveal";
import { holdings } from "@/data/portfolio";

export default function Holdings() {
  return (
    <section id="holdings" className="relative py-24 md:py-32 px-6 md:px-10">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <SectionLabel index="03">Portfolio Snapshot</SectionLabel>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <h2 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-white tracking-tight">
              Top ten holdings.
            </h2>
            <p className="text-[#94A3B8] max-w-sm">
              High-conviction positions across market caps — every name earns its
              place through fundamental research.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-12 bg-[#0A1E3F] border border-white/10 rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 px-6 py-4 text-[11px] uppercase tracking-wider text-[#64748B] border-b border-white/10">
              <span className="col-span-1">#</span>
              <span className="col-span-5">Company / ETF</span>
              <span className="col-span-3 hidden sm:block">Sector</span>
              <span className="col-span-2 hidden sm:block">Market Cap</span>
              <span className="col-span-2 sm:col-span-1 text-right">% Port.</span>
            </div>
            {holdings.map((h, i) => (
              <motion.div
                key={h.company}
                data-testid={`holding-${i}`}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04, duration: 0.5 }}
                className="grid grid-cols-12 items-center px-6 py-4 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors group"
              >
                <span className="col-span-1 font-serif-display text-[#F5A623]">{String(i + 1).padStart(2, "0")}</span>
                <span className="col-span-9 sm:col-span-5 text-white group-hover:text-[#F5A623] transition-colors">{h.company}</span>
                <span className="col-span-3 hidden sm:block text-[#94A3B8] text-sm">{h.sector}</span>
                <span className="col-span-2 hidden sm:block text-[#94A3B8] text-sm">{h.cap}</span>
                <span className="col-span-2 sm:col-span-1 text-right text-white font-medium">{h.pct}</span>
              </motion.div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
