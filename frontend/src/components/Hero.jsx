import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { useRef } from "react";
import { useLenis } from "lenis/react";
import { useNavigate } from "react-router-dom";

const lineParent = { hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.12 } } };
const lineChild = { hidden: { y: "110%" }, show: { y: "0%", transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } } };
const founderCredentials = [
  "B.Tech, IIT Kanpur · Minor in Finance, IIT Kanpur",
  "CFA Level I Cleared · NISM Certified Research Analyst",
];

const MaskLine = ({ children, className }) => (
  <span className="block overflow-hidden">
    <motion.span variants={lineChild} className={`block ${className}`}>{children}</motion.span>
  </span>
);

function CapitalFlowVisual() {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 35, damping: 24 });
  const springY = useSpring(y, { stiffness: 35, damping: 24 });
  const nearX = useTransform(springX, [-0.5, 0.5], [4, -4]);
  const nearY = useTransform(springY, [-0.5, 0.5], [3, -3]);
  const farX = useTransform(springX, [-0.5, 0.5], [1.5, -1.5]);
  const farY = useTransform(springY, [-0.5, 0.5], [1, -1]);

  const updatePosition = (event) => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((event.clientX - rect.left) / rect.width - 0.5);
    y.set((event.clientY - rect.top) / rect.height - 0.5);
  };

  return (
    <div ref={ref} onMouseMove={updatePosition} onMouseLeave={() => { x.set(0); y.set(0); }} className="mx-auto w-full max-w-[440px]">
      <svg viewBox="0 0 480 410" fill="none" className="h-auto w-full" aria-label="Abstract market research network and capital-flow composition">
        <defs>
          <radialGradient id="flow-glow" cx="50%" cy="50%" r="50%">
            <stop stopColor="#173B6B" stopOpacity=".46" />
            <stop offset=".52" stopColor="#0A1E3F" stopOpacity=".2" />
            <stop offset="1" stopColor="#050E1D" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="flow-gold" x1="45" y1="300" x2="438" y2="105" gradientUnits="userSpaceOnUse">
            <stop stopColor="#D4AF37" stopOpacity=".08" />
            <stop offset=".48" stopColor="#F5A623" stopOpacity=".86" />
            <stop offset="1" stopColor="#D4AF37" stopOpacity=".14" />
          </linearGradient>
          <filter id="flow-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="13" /></filter>
          <filter id="node-blur" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="3.5" /></filter>
        </defs>

        {/* Background: a quiet, irregular analytical mesh. */}
        <motion.g style={reduced ? undefined : { x: farX, y: farY }} stroke="#7E96B5" strokeWidth=".7" strokeOpacity=".105">
          <path d="M38 123C94 70 148 76 194 131C239 185 289 181 337 133C381 89 420 87 451 116" />
          <path d="M27 190C90 150 144 152 198 190C252 228 310 231 365 195C402 171 435 170 462 184" />
          <path d="M42 273C101 226 153 231 202 270C250 308 306 313 360 276C396 252 429 247 455 258" />
          <path d="M97 64C121 118 139 172 153 233C166 291 192 328 230 353" />
          <path d="M207 49C193 111 195 157 218 201C244 251 277 300 315 352" />
          <path d="M332 61C311 112 287 155 245 195C215 224 210 271 225 343" />
          <path d="M414 92C372 127 345 166 335 217C326 265 339 304 370 333" />
          <path d="M64 318C132 308 175 278 218 201C267 113 329 82 421 88" strokeDasharray="2 8" />
        </motion.g>

        {/* Mid layer: research paths moving through the mesh. */}
        <motion.g style={reduced ? undefined : { x: nearX, y: nearY }}>
          <ellipse cx="238" cy="205" rx="174" ry="148" fill="url(#flow-glow)" />
          <ellipse cx="238" cy="205" rx="34" ry="23" fill="#153562" fillOpacity=".32" filter="url(#flow-blur)" />
          <path d="M54 91C119 99 159 128 226 200" stroke="#9DB1C9" strokeOpacity=".25" strokeWidth=".9" />
          <path d="M45 178C112 159 168 171 226 200" stroke="#9DB1C9" strokeOpacity=".2" strokeWidth=".9" />
          <path d="M67 288C132 248 176 218 226 200" stroke="#9DB1C9" strokeOpacity=".23" strokeWidth=".9" />
          <path d="M145 351C168 283 191 230 226 200" stroke="#9DB1C9" strokeOpacity=".16" strokeWidth=".8" />
          <path d="M226 200C287 171 350 122 427 88" stroke="#A6B8CF" strokeOpacity=".27" strokeWidth=".9" />
          <path d="M226 200C298 208 355 226 452 200" stroke="#A6B8CF" strokeOpacity=".17" strokeWidth=".8" />
          <path d="M226 200C284 240 333 277 422 319" stroke="#A6B8CF" strokeOpacity=".22" strokeWidth=".9" />
          <path d="M226 200C255 271 285 322 346 358" stroke="#A6B8CF" strokeOpacity=".15" strokeWidth=".8" />

          <g fill="#9FB2CC">
            <circle cx="54" cy="91" r="2.4" fillOpacity=".42" /><circle cx="45" cy="178" r="1.8" fillOpacity=".34" />
            <circle cx="67" cy="288" r="2.2" fillOpacity=".38" /><circle cx="145" cy="351" r="1.7" fillOpacity=".28" />
            <circle cx="427" cy="88" r="2.1" fillOpacity=".38" /><circle cx="452" cy="200" r="1.7" fillOpacity=".28" />
            <circle cx="422" cy="319" r="2.2" fillOpacity=".36" /><circle cx="346" cy="358" r="1.6" fillOpacity=".26" />
          </g>

          <motion.path
            d="M46 304C112 282 157 119 226 200C284 268 341 166 435 111"
            stroke="url(#flow-gold)" strokeWidth="1.25" strokeLinecap="round"
            initial={reduced ? false : { pathLength: 0, opacity: 0 }}
            animate={reduced ? undefined : { pathLength: 1, opacity: 1 }}
            transition={{ duration: 2.4, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* Foreground: a soft convergence core, not a diagrammatic target. */}
          <ellipse cx="226" cy="200" rx="27" ry="18" fill="#07182F" fillOpacity=".82" stroke="#B5C4D5" strokeOpacity=".18" />
          {!reduced && <motion.ellipse cx="226" cy="200" rx="18" ry="12" fill="#F5A623" animate={{ opacity: [0.07, 0.15, 0.07], scale: [0.94, 1.08, 0.94] }} transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }} />}
          <ellipse cx="226" cy="200" rx="8" ry="5.5" fill="#E7C56B" fillOpacity=".72" />
          <ellipse cx="226" cy="200" rx="13" ry="9" fill="#F5A623" fillOpacity=".16" filter="url(#node-blur)" />
        </motion.g>
      </svg>
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
        <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <motion.div variants={lineParent} initial="hidden" animate="show">
              <MaskLine className="text-[10px] uppercase tracking-[0.26em] text-[#F5A623]">Investment Research</MaskLine>
              <h1 className="mt-5 max-w-4xl font-serif-display text-[3.35rem] leading-[0.95] tracking-tight text-white sm:text-7xl lg:text-[6.35rem]">
                <MaskLine>Research-led</MaskLine>
                <MaskLine className="text-[#E2E8F0]">investing for</MaskLine>
                <MaskLine className="text-[#E7C56B]">clearer decisions.</MaskLine>
              </h1>
            </motion.div>
            <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65, duration: 0.8 }} className="mt-7 max-w-xl text-[17px] leading-relaxed text-[#94A3B8] md:text-[18px]">Portfolio reviews, market research and thoughtful discussions across Indian equities, mutual funds, ETFs and global opportunities.</motion.p>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.82, duration: 0.8 }} className="mt-9 flex flex-col gap-4 sm:flex-row">
              <button data-testid="hero-cta-approach" onClick={() => scrollTo("process")} className="rounded-full bg-[#F5A623] px-8 py-3.5 text-base font-medium text-[#050E1D] transition-colors hover:bg-[#E19212]">Explore Approach</button>
              <button data-testid="hero-cta-services" onClick={() => navigate("/services")} className="rounded-full border border-white/25 px-8 py-3.5 text-base text-white transition-colors hover:border-[#F5A623] hover:text-[#F5A623]">Our Services</button>
            </motion.div>
            <motion.div
              data-testid="hero-credentials"
              initial={{ opacity: 0, y: reduced ? 0 : 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.98, duration: reduced ? 0 : 0.85, ease: [0.22, 1, 0.36, 1] }}
              className="relative mt-10 max-w-2xl overflow-hidden rounded-[1.35rem] border border-[#E7C56B]/20 bg-[#0A1E3F]/55 px-6 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-sm sm:px-8 sm:py-7"
            >
              <div aria-hidden="true" className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[#F5A623]/10 blur-3xl" />
              <motion.div
                aria-hidden="true"
                className="absolute bottom-0 left-0 top-0 w-px bg-gradient-to-b from-transparent via-[#FFE3A3] to-transparent"
                animate={reduced ? undefined : { opacity: [0.55, 1, 0.55] }}
                transition={reduced ? undefined : { duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="relative border-l-2 border-[#E7C56B] pl-5 sm:pl-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#E7C56B] sm:text-[11px]">Founded by</p>
                <h2 className="mt-2 font-serif-display text-[2.35rem] font-semibold leading-none tracking-[-0.035em] text-white sm:text-5xl">Nishant Jain</h2>
                <div className="mt-5 flex flex-wrap gap-2.5" aria-label="Founder credentials">
                  {founderCredentials.map((credential) => (
                    <span key={credential} className="rounded-full border border-white/10 bg-white/[0.055] px-3.5 py-2 text-[10px] font-medium leading-snug tracking-[0.035em] text-[#C5D0DE] sm:px-4 sm:text-[11px]">
                      {credential}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35, duration: 1.1 }} className="mx-auto mt-4 w-full max-w-[390px] lg:col-span-5 lg:mt-0 lg:max-w-none"><CapitalFlowVisual /></motion.div>
        </div>
      </motion.div>
    </section>
  );
}
