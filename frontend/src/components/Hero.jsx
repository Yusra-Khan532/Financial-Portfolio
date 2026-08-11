import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { useLenis } from "lenis/react";

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
  const yText = useTransform(scrollYProgress, [0, 1], ["0%", "16%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  const scrollTo = (id) => lenis?.scrollTo(`#${id}`, { offset: -70 });

  return (
    <section
      id="top"
      ref={ref}
      className="relative min-h-screen flex items-center overflow-hidden grain"
    >
      <motion.div style={{ y: yBg }} className="absolute inset-0 z-0">
        <img src={HERO_BG} alt="" className="w-full h-[130%] object-cover opacity-25" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050E1D]/75 via-[#050E1D]/65 to-[#050E1D]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050E1D] via-transparent to-transparent" />
      </motion.div>

      <motion.div
        style={{ y: yText, opacity }}
        className="relative z-10 max-w-7xl mx-auto px-6 md:px-10 w-full pt-32 pb-24"
      >
        <div className="max-w-3xl">
          <motion.div variants={lineParent} initial="hidden" animate="show">
            <MaskLine className="uppercase tracking-[0.35em] text-[11px] md:text-xs text-[#F5A623] mb-8">
              Equity Research · Portfolio Management
            </MaskLine>

            <h1 className="font-serif-display text-white leading-[0.9] tracking-tight text-6xl sm:text-7xl md:text-8xl lg:text-[8.5rem]">
              <MaskLine>Nishant</MaskLine>
              <MaskLine className="italic text-[#F5A623]">Jain</MaskLine>
            </h1>

            <MaskLine className="mt-8 text-lg md:text-2xl text-[#E2E8F0] font-serif-display italic">
              Independent Equity Investor &amp; Researcher
            </MaskLine>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.95, duration: 0.8 }}
            className="mt-6 max-w-xl text-base md:text-lg text-[#94A3B8] leading-relaxed"
          >
            I build concentrated, research-driven equity portfolios grounded in
            fundamental analysis — investing with a margin of safety and a
            long-term, compounding mindset.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.15, duration: 0.8 }}
            className="mt-10 flex flex-col sm:flex-row sm:items-center gap-4"
          >
            <button
              data-testid="hero-cta-portfolio"
              onClick={() => scrollTo("performance")}
              className="px-8 py-3.5 rounded-full bg-[#F5A623] text-[#050E1D] font-medium hover:bg-[#E19212] transition-colors"
            >
              View Portfolio
            </button>
            <button
              data-testid="hero-cta-approach"
              onClick={() => scrollTo("process")}
              className="px-8 py-3.5 rounded-full border border-white/25 text-white hover:border-[#F5A623] hover:text-[#F5A623] transition-colors"
            >
              Investment Approach
            </button>
          </motion.div>

          <motion.div
            data-testid="hero-credentials"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.35, duration: 0.8 }}
            className="mt-14 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 text-xs uppercase tracking-[0.2em] text-[#94A3B8]"
          >
            <span>IIT Kanpur</span>
            <span className="hidden sm:inline text-[#F5A623]/50">·</span>
            <span>CFA Level I Cleared</span>
            <span className="hidden sm:inline text-[#F5A623]/50">·</span>
            <span>NISM Certified Research Analyst</span>
          </motion.div>
        </div>
      </motion.div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 text-[#64748B]">
        <span className="text-[10px] uppercase tracking-[0.3em]">Scroll</span>
        <span className="h-10 w-px bg-gradient-to-b from-[#F5A623] to-transparent" />
      </div>
    </section>
  );
}
