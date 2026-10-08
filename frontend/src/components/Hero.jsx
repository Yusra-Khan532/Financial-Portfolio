import { motion, useReducedMotion } from "framer-motion";
import { useLenis } from "lenis/react";
import { useNavigate } from "react-router-dom";
import { Award, GraduationCap, Globe2 } from "lucide-react";

const lineParent = { hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.12 } } };
const lineChild = { hidden: { y: "110%" }, show: { y: "0%", transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } } };
const MaskLine = ({ children, className = "" }) => (
  <span className="block overflow-hidden">
    <motion.span variants={lineChild} className={`block ${className}`}>{children}</motion.span>
  </span>
);

export default function Hero() {
  const lenis = useLenis();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const scrollTo = (id) => lenis?.scrollTo(`#${id}`, { offset: -112 });

  return (
    <>
    <section id="top" className="relative isolate overflow-hidden bg-[var(--home-page-bg)]">
      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-5 pb-12 pt-[112px] text-center sm:px-6 sm:pb-16 sm:pt-[128px] md:px-8 md:pb-20 md:pt-[156px]">
        <motion.div variants={lineParent} initial="hidden" animate="show">
          <MaskLine className="flex items-center justify-center gap-2 text-[12px] font-medium uppercase tracking-[0.16em] text-[var(--home-gold-text)] sm:gap-3">
            Research · Portfolios · Investing
          </MaskLine>
          <h1 className="mx-auto mt-5 max-w-[950px] font-serif-display text-[clamp(2.375rem,6vw,4rem)] font-normal leading-[1.12] text-[var(--home-text)]">
            <MaskLine>Invest with clarity, not noise.</MaskLine>
          </h1>
        </motion.div>

        <motion.p initial={{ opacity: 0, y: reduced ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.48, duration: reduced ? 0 : 0.8 }} className="mx-auto mt-6 max-w-[720px] text-base leading-[1.65] text-[var(--home-support)] md:text-lg">
          Independent portfolio reviews, market research and thoughtful investing guidance across Indian and global markets.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: reduced ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.66, duration: reduced ? 0 : 0.8 }} className="mx-auto mt-8 flex w-full max-w-sm flex-col items-stretch justify-center gap-4 sm:max-w-none sm:flex-row sm:items-center">
          <button data-testid="hero-cta-approach" onClick={() => scrollTo("process")} className="min-h-12 rounded-lg bg-[var(--home-button-bg)] px-6 text-sm font-medium text-[var(--home-button-text)] transition-colors hover:bg-[var(--home-button-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--home-gold)]">Explore Approach</button>
          <button data-testid="hero-cta-services" onClick={() => navigate("/services")} className="min-h-12 rounded-lg border border-[var(--home-border)] bg-transparent px-6 text-sm font-medium text-[var(--home-text)] transition-colors hover:bg-[var(--home-secondary-hover)] hover:border-[var(--home-gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--home-gold)]">Our Services</button>
        </motion.div>

      </div>
    </section>
    <motion.section data-testid="founder-section" initial={{ opacity: 0, y: reduced ? 0 : 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.35 }} transition={{ duration: reduced ? 0 : 0.7 }} className="border-t border-[var(--home-border)] bg-[var(--home-page-bg)] px-5 py-10 sm:px-6 md:px-8 md:py-16">
      <div className="mx-auto grid max-w-[1200px] items-start gap-7 lg:grid-cols-[.4fr_.6fr] lg:gap-12">
        <div className="text-left">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--home-gold-text)]">Meet the founder</p>
          <h2 className="mt-3 font-serif-display text-[2rem] font-normal leading-[1.2] text-[var(--home-text)] sm:text-[2.5rem]">Nishant Jain</h2>
          <p className="mt-4 max-w-[400px] text-base leading-[1.65] text-[var(--home-support)]">Research-led investing shaped by finance training, market study and disciplined decision-making.</p>
        </div>
        <div className="text-left lg:border-l lg:border-[var(--home-border)] lg:pl-12">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--home-support)]">Credentials</p>
            <ul className="mt-4 space-y-4 text-[15px] leading-[1.55] text-[var(--home-text)] sm:text-base">
              <li className="flex items-start gap-3">
                <GraduationCap aria-hidden="true" size={19} strokeWidth={1.6} className="mt-0.5 shrink-0 text-[var(--home-gold)]" />
                <span>IIT Kanpur <span className="text-[var(--home-support)]">·</span> Minor in Finance</span>
              </li>
              <li className="flex items-start gap-3">
                <Award aria-hidden="true" size={19} strokeWidth={1.6} className="mt-0.5 shrink-0 text-[var(--home-gold)]" />
                <span>CFA Level I Cleared <span className="text-[var(--home-support)]">·</span> NISM Certified Research Analyst</span>
              </li>
            </ul>
          </div>
          <div className="mt-6">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--home-support)]">Investment focus</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px] leading-[1.55] text-[var(--home-support)] sm:text-base">
              <Globe2 aria-hidden="true" size={19} strokeWidth={1.6} className="shrink-0 text-[var(--home-gold)]" />
              <span>Indian equities</span><span aria-hidden="true" className="text-[var(--home-border)]">·</span>
              <span>Mutual funds</span><span aria-hidden="true" className="text-[var(--home-border)]">·</span>
              <span>ETFs</span><span aria-hidden="true" className="text-[var(--home-border)]">·</span>
              <span>Global investing</span>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
    </>
  );
}
