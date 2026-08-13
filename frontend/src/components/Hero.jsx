import { motion, useScroll, useTransform, useReducedMotion, useMotionValue, useSpring } from "framer-motion";
import { useRef } from "react";
import { useLenis } from "lenis/react";
import { useNavigate } from "react-router-dom";

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

const IsoBlock = ({ cx, topY, halfH, h, delay, reduced }) => {
  const halfV = halfH / 2;
  const top = `M${cx},${topY + halfV} L${cx + halfH},${topY} L${cx},${topY - halfV} L${cx - halfH},${topY} Z`;
  const left = `M${cx - halfH},${topY} L${cx},${topY + halfV} L${cx},${topY + halfV + h} L${cx - halfH},${topY + h} Z`;
  const right = `M${cx},${topY + halfV} L${cx + halfH},${topY} L${cx + halfH},${topY + h} L${cx},${topY + halfV + h} Z`;
  return (
    <motion.g
      initial={reduced ? false : { opacity: 0 }}
      animate={reduced ? {} : { opacity: 1 }}
      transition={{ delay, duration: 1.1, ease: "easeOut" }}
    >
      <path d={left} fill="#050B16" />
      <path d={right} fill="#0A1E3F" />
      <path d={top} fill="#12315f" />
      <path d={top} fill="none" stroke="rgba(226,232,240,0.16)" strokeWidth="1" />
      <path d={left} fill="none" stroke="rgba(226,232,240,0.05)" strokeWidth="1" />
      <path d={right} fill="none" stroke="rgba(226,232,240,0.06)" strokeWidth="1" />
    </motion.g>
  );
};

const CompoundingVisual = () => {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 55, damping: 22 });
  const sy = useSpring(my, { stiffness: 55, damping: 22 });
  const fgX = useTransform(sx, [-0.5, 0.5], [4, -4]);
  const fgY = useTransform(sy, [-0.5, 0.5], [3, -3]);
  const bgX = useTransform(sx, [-0.5, 0.5], [1.5, -1.5]);
  const bgY = useTransform(sy, [-0.5, 0.5], [1, -1]);

  const onMove = (e) => {
    if (reduced) return;
    const r = ref.current.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className="relative">
      <svg viewBox="0 0 480 480" fill="none" className="w-full h-auto" aria-hidden="true">
        <defs>
          <radialGradient id="csGlow" cx="60%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#12315f" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#050E1D" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="csGold" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.2" />
            <stop offset="55%" stopColor="#F5A623" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#F5A623" stopOpacity="0.15" />
          </linearGradient>
          <filter id="csBlur" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>

        {/* background depth */}
        <motion.g style={reduced ? undefined : { x: bgX, y: bgY }}>
          <circle cx="290" cy="210" r="220" fill="url(#csGlow)" />
          {/* soft directional ground shadows */}
          <motion.g
            initial={reduced ? false : { opacity: 0 }}
            animate={reduced ? {} : { opacity: 0.5 }}
            transition={{ delay: 0.2, duration: 1.2 }}
          >
            <ellipse cx="205" cy="440" rx="150" ry="24" fill="#03080f" filter="url(#csBlur)" />
            <ellipse cx="330" cy="360" rx="90" ry="16" fill="#03080f" filter="url(#csBlur)" />
          </motion.g>
          <IsoBlock cx={175} topY={362} halfH={118} h={64} delay={0.35} reduced={reduced} />
        </motion.g>

        {/* foreground stepped progression */}
        <motion.g style={reduced ? undefined : { x: fgX, y: fgY }}>
          <IsoBlock cx={244} topY={300} halfH={86} h={78} delay={0.7} reduced={reduced} />
          <IsoBlock cx={306} topY={232} halfH={62} h={92} delay={1.05} reduced={reduced} />
          <IsoBlock cx={358} topY={158} halfH={44} h={64} delay={1.4} reduced={reduced} />

          {/* one restrained gold light along a structural edge */}
          <motion.path
            d="M293,362 L330,300 L368,232 L358,136"
            stroke="url(#csGold)"
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
            initial={reduced ? { opacity: 0.5 } : { pathLength: 0, opacity: 0 }}
            animate={reduced ? { opacity: 0.5 } : { pathLength: 1, opacity: 0.65 }}
            transition={{ delay: 1.5, duration: 1.4, ease: "easeInOut" }}
          />
          <motion.circle
            cx="358" cy="136" r="3" fill="#F5A623"
            initial={reduced ? { opacity: 0.6 } : { opacity: 0, scale: 0 }}
            animate={reduced ? { opacity: 0.6 } : { opacity: 0.8, scale: 1 }}
            transition={{ delay: 2.7, duration: 0.5 }}
          />
        </motion.g>
      </svg>
    </div>
  );
};

export default function Hero() {
  const ref = useRef(null);
  const lenis = useLenis();
  const navigate = useNavigate();
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
                onClick={() => navigate("/portfolio")}
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
