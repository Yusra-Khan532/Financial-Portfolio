import { motion, useReducedMotion } from "framer-motion";
import { useLenis } from "lenis/react";
import { useNavigate } from "react-router-dom";

const lineParent = { hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.12 } } };
const lineChild = { hidden: { y: "110%" }, show: { y: "0%", transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } } };
const founderCredentials = [
  { label: "Education", lines: ["B.Tech, IIT Kanpur", "Minor in Finance, IIT Kanpur"] },
  { label: "Professional", lines: ["CFA Level I Cleared"] },
  { label: "Certification", lines: ["NISM Certified Research Analyst"] },
];
const focusAreas = ["Equities", "Mutual Funds", "ETFs", "Global Investing"];

const MaskLine = ({ children, className = "" }) => (
  <span className="block overflow-hidden">
    <motion.span variants={lineChild} className={`block ${className}`}>{children}</motion.span>
  </span>
);

function EdgeTexture({ reduced }) {
  const gridStyle = {
    backgroundImage: "linear-gradient(rgba(80,111,150,.09) 1px, transparent 1px), linear-gradient(90deg, rgba(80,111,150,.09) 1px, transparent 1px)",
    backgroundSize: "28px 28px",
  };

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-20 bottom-0 top-0 w-[34%] opacity-60 [mask-image:linear-gradient(to_right,black,transparent)]" style={gridStyle} />
      <div className="absolute -right-20 bottom-0 top-0 w-[34%] opacity-60 [mask-image:linear-gradient(to_left,black,transparent)]" style={gridStyle} />
      {[["left-[12%]", "top-[30%]"], ["right-[13%]", "top-[22%]"], ["left-[20%]", "bottom-[20%]"], ["right-[19%]", "bottom-[28%]"]].map(([horizontal, vertical], index) => (
        <motion.span key={`${horizontal}-${vertical}`} className={`absolute h-1 w-1 bg-[#D4AF37] ${horizontal} ${vertical}`} initial={{ opacity: 0 }} animate={reduced ? { opacity: 0.2 } : { opacity: [0.06, 0.34, 0.06] }} transition={{ duration: 4.8 + index, delay: index * 0.7, repeat: reduced ? 0 : Infinity, ease: "easeInOut" }} />
      ))}
    </div>
  );
}

export default function Hero() {
  const lenis = useLenis();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const scrollTo = (id) => lenis?.scrollTo(`#${id}`, { offset: -70 });

  return (
    <section id="top" className="relative isolate flex items-center overflow-hidden bg-[#050E1D] lg:min-h-[100svh]">
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(10,30,63,.32),_transparent_62%)]" />
      <EdgeTexture reduced={reduced} />
      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-24 text-center md:px-10 md:py-[clamp(4.75rem,8vh,6.5rem)]">
        <motion.div variants={lineParent} initial="hidden" animate="show">
          <MaskLine className="flex items-center justify-center gap-3 text-[10px] font-medium uppercase tracking-[0.25em] text-[#E7C56B] sm:text-[11px]">
            <span className="h-px w-7 bg-[#D4AF37]/60" />
            Investing for clearer decisions
            <span className="h-px w-7 bg-[#D4AF37]/60" />
          </MaskLine>
          <h1 className="mt-[clamp(1.25rem,2.5vh,1.75rem)] font-serif-display text-[3.75rem] leading-[0.92] tracking-[-0.045em] text-white sm:text-7xl lg:text-[clamp(4.8rem,6.3vw,5.75rem)]">
            <MaskLine>FinLit Ventures</MaskLine>
          </h1>
        </motion.div>

        <motion.p initial={{ opacity: 0, y: reduced ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.48, duration: reduced ? 0 : 0.8 }} className="mx-auto mt-[clamp(1.25rem,3vh,2rem)] max-w-3xl text-[17px] leading-relaxed text-[#AAB8C9] md:text-[18px]">
          Portfolio reviews, market research and thoughtful discussions across Indian equities, mutual funds, ETFs and global opportunities.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: reduced ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.66, duration: reduced ? 0 : 0.8 }} className="mt-[clamp(1.5rem,3.5vh,2.25rem)] flex flex-col items-center justify-center gap-4 sm:flex-row">
          <button data-testid="hero-cta-approach" onClick={() => scrollTo("process")} className="rounded-full bg-[#F5A623] px-8 py-3.5 text-base font-medium text-[#050E1D] transition-colors hover:bg-[#E19212]">Explore Approach</button>
          <button data-testid="hero-cta-services" onClick={() => navigate("/services")} className="rounded-full border border-white/25 px-8 py-3.5 text-base text-white transition-colors hover:border-[#F5A623] hover:text-[#F5A623]">Our Services</button>
        </motion.div>

        <motion.div data-testid="hero-credentials" initial={{ opacity: 0, y: reduced ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: reduced ? 0 : 0.85, ease: [0.22, 1, 0.36, 1] }} className="mx-auto mt-[clamp(3.25rem,7vh,4.5rem)] max-w-5xl">
          <div className="grid gap-8 text-left md:grid-cols-2 md:gap-x-12 md:gap-y-9 lg:grid-cols-[1.35fr_1fr_.9fr_1.15fr] lg:items-center lg:gap-x-8">
            <div className="px-1 lg:pr-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#D4AF37] sm:text-[11px]">Founder &amp; Lead Analyst</p>
              <h2 className="mt-2 font-serif-display text-[2rem] font-semibold leading-none tracking-[-0.035em] text-[#FFF8E7] sm:text-[2.25rem]">Nishant Jain</h2>
              <span aria-hidden="true" className="mt-4 block h-px w-7 bg-[#D4AF37]/55" />
            </div>
            {founderCredentials.map((credential, index) => (
              <motion.div key={credential.label} initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduced ? 0 : 1.08 + index * 0.12, duration: reduced ? 0 : 0.55 }} className="px-1 lg:px-2">
                <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-[#D4AF37] sm:text-[10px]">{credential.label}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-[#B8C5D4] sm:text-[14px]">{credential.lines.map((line) => <span key={line} className="block">{line}</span>)}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduced ? 0 : 1.45, duration: reduced ? 0 : 0.7 }} className="mt-[clamp(1.75rem,3.5vh,2.75rem)] flex flex-wrap items-center justify-center gap-x-4 gap-y-3 text-[9px] font-medium uppercase tracking-[0.16em] sm:gap-x-5 sm:text-[10px]">
          <span className="font-semibold text-[#D4AF37]">Focus Areas</span>
          {focusAreas.map((area) => <span key={area} className="flex items-center gap-x-4 text-[#94A3B8] sm:gap-x-5"><span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#D4AF37]/60" /><span>{area}</span></span>)}
        </motion.div>
      </div>
    </section>
  );
}
