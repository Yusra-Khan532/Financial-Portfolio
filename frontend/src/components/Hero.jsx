import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { useLenis } from "lenis/react";
import { profile, headline } from "@/data/portfolio";

const HERO_BG =
  "https://images.unsplash.com/photo-1667832273606-c4a9e46c7d1a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzF8MHwxfHNlYXJjaHwzfHxhYnN0cmFjdCUyMGdvbGQlMjBuYXZ5JTIwYmFja2dyb3VuZHxlbnwwfHx8fDE3ODYzNjgyMDR8MA&ixlib=rb-4.1.0&q=85";

const lineParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.2 } },
};
const lineChild = {
  hidden: { y: "110%" },
  show: { y: "0%", transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } },
};

const MaskLine = ({ children, className }) => (
  <span className="block overflow-hidden">
    <motion.span variants={lineChild} className={`block ${className}`}>
      {children}
    </motion.span>
  </span>
);

export default function Hero() {
  const ref = useRef(null);
  const lenis = useLenis();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yBg = useTransform(scrollYProgress, [0, 1], ["0%", "35%"]);
  const yText = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section ref={ref} className="relative min-h-screen flex items-center overflow-hidden grain">
      <motion.div style={{ y: yBg }} className="absolute inset-0 z-0">
        <img src={HERO_BG} alt="" className="w-full h-[130%] object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050E1D]/70 via-[#050E1D]/60 to-[#050E1D]" />
      </motion.div>

      <motion.div
        style={{ y: yText, opacity }}
        className="relative z-10 max-w-7xl mx-auto px-6 md:px-10 w-full pt-28 pb-20"
      >
        <motion.div variants={lineParent} initial="hidden" animate="show">
          <MaskLine className="uppercase tracking-[0.35em] text-xs md:text-sm text-[#F5A623] mb-6">
            Independent Equity Portfolio Management · {profile.financialYear}
          </MaskLine>

          <h1 className="font-serif-display text-white leading-[0.92] tracking-tight text-6xl sm:text-7xl md:text-8xl lg:text-[9rem]">
            <MaskLine>Nishant</MaskLine>
            <MaskLine className="italic text-[#F5A623]">Jain</MaskLine>
          </h1>

          <MaskLine className="mt-8 max-w-xl text-base md:text-lg text-[#94A3B8] leading-relaxed">
            {profile.title} — building concentrated, research-driven equity
            portfolios that compound quietly, with a margin of safety.
          </MaskLine>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.8 }}
          className="mt-12 flex flex-wrap items-center gap-4"
        >
          <button
            data-testid="hero-cta-primary"
            onClick={() => lenis?.scrollTo("#performance", { offset: -70 })}
            className="px-7 py-3 rounded-full bg-[#F5A623] text-[#050E1D] font-medium hover:bg-[#E19212] transition-colors"
          >
            View performance
          </button>
          <button
            data-testid="hero-cta-secondary"
            onClick={() => lenis?.scrollTo("#contact", { offset: -70 })}
            className="px-7 py-3 rounded-full border border-white/25 text-white hover:border-[#F5A623] hover:text-[#F5A623] transition-colors"
          >
            Start a conversation
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 1 }}
          className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-3xl border-t border-white/10 pt-8"
        >
          {[
            ["Net P&L", headline.netPnl],
            ["Net ROI", headline.netRoi],
            ["XIRR", "52.81%"],
            ["Win Rate", "72.22%"],
          ].map(([label, value]) => (
            <div key={label} data-testid={`hero-stat-${label}`}>
              <div className="font-serif-display text-2xl md:text-3xl text-white">{value}</div>
              <div className="text-xs uppercase tracking-widest text-[#64748B] mt-1">{label}</div>
            </div>
          ))}
        </motion.div>
      </motion.div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 text-[#64748B]">
        <span className="text-[10px] uppercase tracking-[0.3em]">Scroll</span>
        <span className="h-10 w-px bg-gradient-to-b from-[#F5A623] to-transparent" />
      </div>
    </section>
  );
}
