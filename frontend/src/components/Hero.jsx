import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { useLenis } from "lenis/react";
import { useNavigate } from "react-router-dom";

const lineParent = { hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.12 } } };
const lineChild = { hidden: { y: "110%" }, show: { y: "0%", transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } } };
const founderCredentials = [
  { type: "education", lines: ["B.Tech, IIT Kanpur", "Minor in Finance, IIT Kanpur"] },
  { type: "market", lines: ["CFA Level I Cleared"] },
  { type: "certification", lines: ["NISM Certified", "Research Analyst"] },
];

const MaskLine = ({ children, className }) => (
  <span className="block overflow-hidden">
    <motion.span variants={lineChild} className={`block ${className}`}>{children}</motion.span>
  </span>
);

function CredentialIcon({ type }) {
  if (type === "education") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true"><path d="m3 9 9-4 9 4-9 4-9-4Z" /><path d="M7 11.1V15c2.8 2 7.2 2 10 0v-3.9" /><path d="M21 9v6" /></svg>;
  if (type === "market") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true"><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 4-4 3 2 5-6" /><path d="M16 7h3v3" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true"><path d="M12 3 19 6v5c0 4.4-2.9 7.8-7 10-4.1-2.2-7-5.6-7-10V6l7-3Z" /><path d="m8.7 12 2.1 2.1 4.5-4.5" /></svg>;
}

function FounderGrid({ reduced }) {
  const points = ["left-8 top-12", "right-14 top-24", "left-[28%] top-[56%]", "right-[24%] bottom-12"];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -inset-x-8 -inset-y-12 opacity-80 [mask-image:linear-gradient(to_right,transparent,black_25%,black_100%)]" style={{ backgroundImage: "linear-gradient(rgba(80,111,150,.11) 1px, transparent 1px), linear-gradient(90deg, rgba(80,111,150,.11) 1px, transparent 1px)", backgroundSize: "26px 26px" }}>
      {points.map((position, index) => <motion.span key={position} className={`absolute h-1 w-1 bg-[#D4AF37] ${position}`} initial={{ opacity: 0 }} animate={reduced ? { opacity: 0.3 } : { opacity: [0.08, 0.42, 0.08] }} transition={{ duration: 4 + index, delay: index * 0.55, repeat: reduced ? 0 : Infinity, ease: "easeInOut" }} />)}
    </div>
  );
}

export default function Hero() {
  const ref = useRef(null);
  const lenis = useLenis();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yBackground = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.85], [1, 0]);
  const scrollTo = (id) => lenis?.scrollTo(`#${id}`, { offset: -70 });

  return (
    <section id="top" ref={ref} className="relative flex min-h-[min(780px,100svh)] items-center overflow-hidden">
      <motion.div style={{ y: yBackground }} className="absolute inset-0 bg-[#050E1D]">
        <div className="absolute -right-40 top-1/2 h-[38rem] w-[38rem] -translate-y-1/2 rounded-full bg-[#0A1E3F]/35 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050E1D] via-[#050E1D]/96 to-[#050E1D]/70" />
      </motion.div>
      <motion.div style={{ opacity: contentOpacity }} className="relative z-10 mx-auto w-full max-w-7xl px-6 py-28 md:px-10">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <motion.div variants={lineParent} initial="hidden" animate="show">
              <MaskLine className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.25em] text-[#E7C56B] sm:text-[11px]"><span className="h-5 w-px bg-[#F5A623]" />Investing for clearer decisions.</MaskLine>
              <h1 className="mt-6 max-w-4xl font-serif-display text-[3.6rem] leading-[0.93] tracking-[-0.04em] text-white sm:text-7xl lg:text-[5.4rem]">
                <MaskLine>FinLit Ventures</MaskLine>
              </h1>
            </motion.div>
            <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.48, duration: 0.8 }} className="mt-8 max-w-xl text-[17px] leading-relaxed text-[#94A3B8] md:text-[18px]">Portfolio reviews, market research and thoughtful discussions across Indian equities, mutual funds, ETFs and global opportunities.</motion.p>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.82, duration: 0.8 }} className="mt-9 flex flex-col gap-4 sm:flex-row">
              <button data-testid="hero-cta-approach" onClick={() => scrollTo("process")} className="rounded-full bg-[#F5A623] px-8 py-3.5 text-base font-medium text-[#050E1D] transition-colors hover:bg-[#E19212]">Explore Approach</button>
              <button data-testid="hero-cta-services" onClick={() => navigate("/services")} className="rounded-full border border-white/25 px-8 py-3.5 text-base text-white transition-colors hover:border-[#F5A623] hover:text-[#F5A623]">Our Services</button>
            </motion.div>
          </div>
          <motion.div
            initial={{ opacity: 0, y: reduced ? 0 : 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.78, duration: reduced ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="relative isolate lg:col-span-5 lg:pl-4 xl:pl-9"
          >
            <FounderGrid reduced={reduced} />
            <motion.div
              data-testid="hero-credentials"
              className="relative max-w-md py-2"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#E7C56B]">Founder</p>
              <h2 className="mt-3 font-serif-display text-[2.7rem] font-semibold leading-[0.95] tracking-[-0.035em] text-[#FFF8E7] sm:text-5xl">Nishant Jain</h2>
              <div className="mt-5 h-px w-10 bg-[#D4AF37]" />
              <div className="mt-8 space-y-5" aria-label="Founder credentials">
                {founderCredentials.map((credential, index) => (
                  <motion.div key={credential.type} initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduced ? 0 : 1.02 + index * 0.12, duration: reduced ? 0 : 0.55 }} className="flex items-start gap-3.5">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-[#D4AF37]"><CredentialIcon type={credential.type} /></span>
                    <p className="text-[13px] leading-[1.65] text-[#B8C5D4] sm:text-sm">{credential.lines.map((line) => <span key={line} className="block">{line}</span>)}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
