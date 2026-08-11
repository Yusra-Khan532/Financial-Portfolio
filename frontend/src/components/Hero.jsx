import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { useLenis } from "lenis/react";

const HERO_BG =
  "https://images.unsplash.com/photo-1667832273606-c4a9e46c7d1a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzF8MHwxfHNlYXJjaHwzfHxhYnN0cmFjdCUyMGdvbGQlMjBuYXZ5JTIwYmFja2dyb3VuZHxlbnwwfHx8fDE3ODYzNjgyMDR8MA&ixlib=rb-4.1.0&q=85";

const lineParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.11, delayChildren: 0.15 } },
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

const CompoundingVisual = () => (
  <svg viewBox="0 0 480 460" fill="none" className="w-full h-auto" aria-hidden="true">
    <defs>
      <linearGradient id="heroArea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#F5A623" stopOpacity="0.20" />
        <stop offset="100%" stopColor="#F5A623" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="heroLine" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0%" stopColor="#D4AF37" />
        <stop offset="100%" stopColor="#F5A623" />
      </linearGradient>
    </defs>

    {/* faint analytical grid */}
    <g stroke="rgba(255,255,255,0.06)" strokeWidth="1">
      {[80, 160, 240, 320, 400].map((y) => (
        <line key={`h${y}`} x1="20" y1={y} x2="460" y2={y} />
      ))}
      {[100, 200, 300, 400].map((x) => (
        <line key={`v${x}`} x1={x} y1="40" x2={x} y2="420" />
      ))}
    </g>

    {/* compounding area + curve */}
    <path
      d="M20 400 C 120 390, 190 350, 250 280 C 300 220, 340 150, 460 60 L 460 420 L 20 420 Z"
      fill="url(#heroArea)"
    />
    <motion.path
      d="M20 400 C 120 390, 190 350, 250 280 C 300 220, 340 150, 460 60"
      stroke="url(#heroLine)"
      strokeWidth="2.5"
      strokeLinecap="round"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ delay: 0.6, duration: 1.8, ease: "easeInOut" }}
    />
    <motion.circle
      cx="460" cy="60" r="5" fill="#F5A623"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 2.2, duration: 0.5 }}
    />
  </svg>
);

export default function Hero() {
  const ref = useRef(null);
  const lenis = useLenis();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yBg = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  const scrollTo = (id) => lenis?.scrollTo(`#${id}`, { offset: -70 });

  return (
    <section
      id="top"
      ref={ref}
      className="relative min-h-screen flex items-center overflow-hidden grain"
    >
      <motion.div style={{ y: yBg }} className="absolute inset-0 z-0">
        <img src={HERO_BG} alt="" className="w-full h-[130%] object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050E1D]/80 via-[#050E1D]/70 to-[#050E1D]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050E1D] via-[#050E1D]/60 to-transparent" />
      </motion.div>

      <motion.div
        style={{ opacity }}
        className="relative z-10 max-w-7xl mx-auto px-6 md:px-10 w-full pt-28 pb-16 md:pt-24"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 items-center gap-10">
          {/* LEFT — content */}
          <div className="lg:col-span-7">
            <motion.div variants={lineParent} initial="hidden" animate="show">
              <MaskLine className="uppercase tracking-[0.35em] text-[11px] md:text-xs text-[#F5A623] mb-6">
                Equity Research · Portfolio Management
              </MaskLine>

              <h1 className="font-serif-display text-white leading-[0.95] tracking-tight text-6xl sm:text-7xl lg:text-7xl xl:text-8xl">
                <MaskLine className="whitespace-nowrap">Nishant Jain</MaskLine>
              </h1>

              <MaskLine className="mt-5 text-2xl md:text-3xl text-[#E2E8F0] font-serif-display italic">
                Independent Equity Investor &amp; Researcher
              </MaskLine>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.8 }}
              className="mt-5 max-w-xl text-lg md:text-xl text-[#94A3B8] leading-relaxed"
            >
              I build concentrated, research-driven equity portfolios grounded in
              fundamental analysis — investing with a margin of safety and a
              long-term, compounding mindset.
            </motion.p>

            <motion.div
              data-testid="hero-credentials"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.05, duration: 0.8 }}
              className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] md:text-[13px] uppercase tracking-[0.2em] text-[#94A3B8]"
            >
              <span>IIT Kanpur</span>
              <span className="text-[#F5A623]/50">·</span>
              <span>CFA Level I Cleared</span>
              <span className="text-[#F5A623]/50">·</span>
              <span>NISM Certified Research Analyst</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 0.8 }}
              className="mt-9 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <button
                data-testid="hero-cta-portfolio"
                onClick={() => scrollTo("performance")}
                className="px-8 py-3.5 rounded-full bg-[#F5A623] text-[#050E1D] text-base md:text-lg font-medium hover:bg-[#E19212] transition-colors"
              >
                View Portfolio
              </button>
              <button
                data-testid="hero-cta-approach"
                onClick={() => scrollTo("process")}
                className="px-8 py-3.5 rounded-full border border-white/25 text-white text-base md:text-lg hover:border-[#F5A623] hover:text-[#F5A623] transition-colors"
              >
                Investment Approach
              </button>
            </motion.div>
          </div>

          {/* RIGHT — subtle compounding visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 1 }}
            className="hidden lg:block lg:col-span-5"
          >
            <CompoundingVisual />
          </motion.div>
        </div>
      </motion.div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 text-[#64748B]">
        <span className="text-[10px] uppercase tracking-[0.3em]">Scroll</span>
        <span className="h-8 w-px bg-gradient-to-b from-[#F5A623] to-transparent" />
      </div>
    </section>
  );
}
