import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/Reveal";
import { process } from "@/data/portfolio";

const journeyNodes = [
  { x: 110, y: 170 },
  { x: 245, y: 120 },
  { x: 410, y: 145 },
  { x: 590, y: 85 },
  { x: 760, y: 120 },
  { x: 955, y: 70 },
  { x: 1090, y: 95 },
];

const journeyPath = "M110 170 C155 170 200 120 245 120 S350 145 410 145 S525 85 590 85 S700 120 760 120 S885 70 955 70 S1045 95 1090 95";

export default function Process() {
  const [activeIndex, setActiveIndex] = useState(0);
  const reducedMotion = useReducedMotion();
  const active = process[activeIndex];

  return (
    <section id="process" className="relative overflow-hidden border-y border-white/5 bg-[#04101f] px-6 py-12 md:px-10 md:py-14">
      <div className="mx-auto max-w-7xl">
        <Reveal>
          <div className="text-[11px] uppercase tracking-[0.28em] text-[#F5A623]">My Investment Process</div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end lg:gap-12">
            <h2 className="max-w-3xl font-serif-display text-4xl leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl">
              A repeatable process — from idea to <span className="text-[#E7C56B]">exit discipline.</span>
            </h2>
            <p className="text-sm leading-relaxed text-[#94A3B8]">
              Each decision advances through research, valuation, risk control and continuous review.
            </p>
          </div>
          <p className="mt-5 text-[10px] uppercase tracking-[0.16em] text-[#64748B] sm:text-[11px]">
            Fundamental research <span aria-hidden="true">·</span> Industry cycles <span aria-hidden="true">·</span> Financial analysis <span aria-hidden="true">·</span> Valuation <span aria-hidden="true">·</span> Moat analysis <span aria-hidden="true">·</span> Risk discipline
          </p>
        </Reveal>

        <Reveal className="mt-7" delay={0.08}>
          <div className="overflow-hidden rounded-[1.25rem] border border-white/[0.08] bg-[radial-gradient(circle_at_72%_20%,rgba(212,175,55,.07),transparent_32%),linear-gradient(145deg,rgba(11,32,63,.7),rgba(5,17,34,.72))]" data-testid="process-experience">
            <div className="relative hidden h-[270px] md:block" aria-label="Seven-step investment process journey" data-testid="process-desktop-path">
              <svg className="absolute inset-x-0 top-0 h-[230px] w-full" viewBox="0 0 1200 230" preserveAspectRatio="none" aria-hidden="true">
                <path d={journeyPath} fill="none" stroke="#3A4A60" strokeOpacity=".72" strokeWidth="3" vectorEffect="non-scaling-stroke" />
                <path
                  d={journeyPath}
                  fill="none"
                  pathLength="6"
                  stroke="#D4AF37"
                  strokeLinecap="round"
                  strokeOpacity=".9"
                  strokeWidth="4"
                  strokeDasharray={`${Math.max(0.12, activeIndex + 0.12)} 6`}
                  vectorEffect="non-scaling-stroke"
                  className={reducedMotion ? "" : "transition-all duration-200 ease-out"}
                />
              </svg>

              {process.map((step, index) => {
                const node = journeyNodes[index];
                const selected = index === activeIndex;
                return (
                  <button
                    key={step.n}
                    type="button"
                    aria-label={`Step ${index + 1}: ${step.title}`}
                    aria-pressed={selected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onFocus={() => setActiveIndex(index)}
                    onClick={() => setActiveIndex(index)}
                    className="group absolute flex w-24 flex-col items-center rounded-lg text-center outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623]/80 focus-visible:ring-offset-4 focus-visible:ring-offset-[#07182f] lg:w-32"
                    style={{ left: `${(node.x / 1200) * 100}%`, top: `${node.y}px`, transform: "translate(-50%, -24px)" }}
                  >
                    <span className="flex h-12 w-12 items-center justify-center">
                      <span className={`flex items-center justify-center rounded-full border text-xs font-medium tabular-nums ${selected ? "h-12 w-12 border-[#D4AF37] bg-[#D4AF37] text-[#061326]" : "h-11 w-11 border-[#607086] bg-[#0A1E3F] text-[#C5CED9] group-hover:border-[#B79A5B] group-hover:text-white"} ${reducedMotion ? "" : "transition-all duration-200 ease-out"}`}>
                        {step.n}
                      </span>
                    </span>
                    <span className={`mt-2 text-[11px] font-medium leading-[1.25] lg:text-[13px] ${selected ? "text-[#FFF8E7]" : "text-[#A0AEC0] group-hover:text-[#D8E0E9]"} ${reducedMotion ? "" : "transition-colors duration-200"}`}>
                      {step.title}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="px-4 pt-5 md:hidden" data-testid="process-mobile-rail">
              <div className="process-scroll overflow-x-auto pb-4">
                <div className="relative flex min-w-max items-stretch gap-3 px-1">
                  <span aria-hidden="true" className="absolute left-6 right-6 top-6 h-[2px] bg-[#3A4A60]" />
                  {process.map((step, index) => {
                    const selected = index === activeIndex;
                    return (
                      <button
                        key={step.n}
                        type="button"
                        aria-label={`Step ${index + 1}: ${step.title}`}
                        aria-pressed={selected}
                        onFocus={() => setActiveIndex(index)}
                        onClick={() => setActiveIndex(index)}
                        className="relative z-10 flex w-[106px] shrink-0 flex-col items-center rounded-xl px-2 pb-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623]/80"
                      >
                        <span className={`flex h-12 w-12 items-center justify-center rounded-full border text-xs font-medium tabular-nums ${selected ? "border-[#D4AF37] bg-[#D4AF37] text-[#061326]" : "border-[#607086] bg-[#0A1E3F] text-[#C5CED9]"} ${reducedMotion ? "" : "transition-colors duration-200"}`}>
                          {step.n}
                        </span>
                        <span className={`mt-2 text-xs font-medium leading-tight ${selected ? "text-[#FFF8E7]" : "text-[#A0AEC0]"}`}>{step.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mx-5 border-t border-white/10 px-0 py-5 md:mx-8 md:grid md:min-h-[118px] md:grid-cols-[3.5rem_minmax(12rem,17rem)_1fr] md:items-center md:gap-5 md:py-6" aria-live="polite">
              <div className="text-xs font-medium tabular-nums text-[#D4AF37]">{active.n}</div>
              <h3 className="mt-2 text-base font-medium uppercase tracking-[0.08em] text-[#FFF8E7] md:mt-0 md:text-lg">{active.title}</h3>
              <p key={active.n} className={`mt-3 max-w-2xl text-sm leading-relaxed text-[#A9B6C8] md:mt-0 md:border-l md:border-white/10 md:pl-7 ${reducedMotion ? "" : "animate-[process-detail-in_.2s_ease-out]"}`}>
                {active.detail}
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
