import { motion, useReducedMotion } from "framer-motion";
import { useLenis } from "lenis/react";
import { useNavigate } from "react-router-dom";

const lineParent = { hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.12 } } };
const lineChild = { hidden: { y: "110%" }, show: { y: "0%", transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } } };
const MaskLine = ({ children, className = "" }) => (
  <span className="block overflow-hidden">
    <motion.span variants={lineChild} className={`block ${className}`}>{children}</motion.span>
  </span>
);

function EdgeTexture({ reduced }) {
  const gridStyle = {
    backgroundImage: "linear-gradient(var(--hero-grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--hero-grid-line) 1px, transparent 1px)",
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
    <>
    <section id="top" className="relative isolate flex items-center overflow-hidden bg-[#050E1D]">
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(10,30,63,.32),_transparent_62%)]" />
      <EdgeTexture reduced={reduced} />
      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-24 pt-24 text-center sm:px-6 md:px-10 md:pb-[clamp(4.5rem,8vh,6rem)] md:pt-[clamp(4.5rem,8vh,6rem)]">
        <motion.div variants={lineParent} initial="hidden" animate="show">
          <MaskLine className="flex items-center justify-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-[#E7C56B] sm:gap-3 sm:text-[11px] sm:tracking-[0.25em]">
            <span className="h-px w-5 bg-[#D4AF37]/60 sm:w-7" />
            Research · Portfolios · Investing
            <span className="h-px w-5 bg-[#D4AF37]/60 sm:w-7" />
          </MaskLine>
          <h1 className="mt-[clamp(1.25rem,2.5vh,1.75rem)] font-serif-display text-5xl leading-[0.95] text-white sm:text-6xl lg:text-[clamp(3.75rem,5.2vw,4.75rem)]">
            <MaskLine>Invest with clarity, not noise.</MaskLine>
          </h1>
        </motion.div>

        <motion.p initial={{ opacity: 0, y: reduced ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.48, duration: reduced ? 0 : 0.8 }} className="mx-auto mt-[clamp(1.25rem,3vh,2rem)] max-w-2xl text-[17px] leading-relaxed text-[#AAB8C9] md:text-[18px]">
          Independent portfolio reviews, market research and thoughtful investing guidance across Indian and global markets.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: reduced ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.66, duration: reduced ? 0 : 0.8 }} className="mx-auto mt-[clamp(1.5rem,3.5vh,2.25rem)] flex w-full max-w-sm flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
          <button data-testid="hero-cta-approach" onClick={() => scrollTo("process")} className="rounded-xl bg-[var(--navy-950)] px-7 py-3.5 text-base font-medium text-[var(--hero-button-foreground)] transition-colors hover:bg-[var(--navy-900)]">Explore Approach</button>
          <button data-testid="hero-cta-services" onClick={() => navigate("/services")} className="rounded-xl border border-[var(--text-primary)] bg-transparent px-7 py-3.5 text-base text-[var(--text-primary)] transition-colors hover:bg-white/5">Our Services</button>
        </motion.div>

      </div>
    </section>
    <motion.section data-testid="founder-section" initial={{ opacity: 0, y: reduced ? 0 : 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.35 }} transition={{ duration: reduced ? 0 : 0.7 }} className="bg-[var(--app-bg)] px-4 py-20 text-center sm:px-6 md:px-10 md:py-24">
      <div className="mx-auto max-w-3xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#D4AF37] sm:text-[11px]">Founder &amp; Lead Analyst</p>
        <h2 className="mt-4 font-serif-display text-[2.75rem] font-semibold leading-none tracking-[-0.035em] text-[#FFF8E7] sm:text-5xl">Nishant Jain</h2>
        <span aria-hidden="true" className="mx-auto mt-5 block h-px w-8 bg-[#D4AF37]/60" />
        <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-[var(--text-secondary)] sm:text-base">IIT Kanpur · Minor in Finance · CFA Level I Cleared · NISM Certified Research Analyst</p>
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--text-muted)] sm:text-base">Focused on Indian equities, mutual funds, ETFs and global investing.</p>
      </div>
    </motion.section>
    </>
  );
}
