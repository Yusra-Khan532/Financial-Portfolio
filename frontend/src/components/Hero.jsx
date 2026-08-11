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
  <div className="relative">
    <svg viewBox="0 0 480 480" fill="none" className="w-full h-auto" aria-hidden="true">
      <defs>
        <linearGradient id="heroContour" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.35" />
          <stop offset="55%" stopColor="#F5A623" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#F5A623" stopOpacity="0.25" />
        </linearGradient>
        <radialGradient id="heroGlow" cx="62%" cy="42%" r="55%">
          <stop offset="0%" stopColor="#0F2A5C" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#050E1D" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* soft navy-on-navy depth */}
      <circle cx="300" cy="200" r="230" fill="url(#heroGlow)" />

      {/* faint analytical grid */}
      <g stroke="rgba(255,255,255,0.045)" strokeWidth="1">
        {[70, 140, 210, 280, 350, 420].map((y) => (
          <line key={`h${y}`} x1="20" y1={y} x2="470" y2={y} />
        ))}
        {[80, 160, 240, 320, 400].map((x) => (
          <line key={`v${x}`} x1={x} y1="30" x2={x} y2="440" />
        ))}
      </g>

      {/* topographic contour rings */}
      <g stroke="rgba(148,163,184,0.10)" strokeWidth="1" fill="none">
        <ellipse cx="300" cy="230" rx="70" ry="52" />
        <ellipse cx="296" cy="228" rx="118" ry="92" transform="rotate(-8 296 228)" />
        <ellipse cx="290" cy="226" rx="168" ry="134" transform="rotate(-8 290 226)" />
        <ellipse cx="284" cy="224" rx="220" ry="178" transform="rotate(-8 284 224)" />
      </g>

      {/* one restrained gold trajectory */}
      <motion.path
        d="M40 430 C 150 400, 220 360, 280 280 C 330 214, 360 150, 460 70"
        stroke="url(#heroContour)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ delay: 0.6, duration: 2, ease: "easeInOut" }}
      />

      {/* tiny editorial annotation */}
      <text
        x="352" y="132"
        fill="#94A3B8"
        fontSize="10"
        letterSpacing="3"
        fontFamily="'IBM Plex Sans', sans-serif"
        opacity="0.7"
      >
        LONG-TERM
      </text>
      <text
        x="352" y="148"
        fill="#F5A623"
        fontSize="10"
        letterSpacing="3"
        fontFamily="'IBM Plex Sans', sans-serif"
        opacity="0.8"
      >
        COMPOUNDING
      </text>
    </svg>
  </div>
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
        className="relative z-10 max-w-7xl mx-auto px-6 md:px-10 w-full pt-24 pb-14"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 items-center gap-10">
          {/* LEFT — content */}
          <div className="lg:col-span-7">
            <motion.div variants={lineParent} initial="hidden" animate="show">
              <MaskLine className="uppercase tracking-[0.35em] text-[11px] md:text-xs text-[#F5A623] mb-6">
                Equity Research · Portfolio Management
              </MaskLine>

              <h1 className="font-serif-display text-white leading-[0.95] tracking-tight text-6xl sm:text-7xl lg:text-7xl xl:text-[5.5rem]">
                <MaskLine className="whitespace-nowrap">Nishant Jain</MaskLine>
              </h1>

              <MaskLine className="mt-4 text-2xl lg:text-[1.7rem] text-[#E2E8F0] font-serif-display italic">
                Independent Equity Investor &amp; Researcher
              </MaskLine>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.8 }}
              className="mt-5 max-w-xl text-[18px] md:text-[19px] text-[#94A3B8] leading-relaxed"
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
              className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] md:text-[13px] uppercase tracking-[0.18em] text-[#94A3B8]"
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
              className="mt-7 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <button
                data-testid="hero-cta-portfolio"
                onClick={() => scrollTo("performance")}
                className="px-8 py-3.5 rounded-full bg-[#F5A623] text-[#050E1D] text-base md:text-[17px] font-medium hover:bg-[#E19212] transition-colors"
              >
                View Portfolio
              </button>
              <button
                data-testid="hero-cta-approach"
                onClick={() => scrollTo("process")}
                className="px-8 py-3.5 rounded-full border border-white/25 text-white text-base md:text-[17px] hover:border-[#F5A623] hover:text-[#F5A623] transition-colors"
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
