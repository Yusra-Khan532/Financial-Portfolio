import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/Reveal";
import { process } from "@/data/portfolio";

const stageDescriptions = {
  "Idea Generation": "Identify businesses and themes worth researching.",
  "Industry Analysis": "Understand industry trends, competition, and business cycles.",
  "Business Quality": "Assess financial strength, management, and competitive advantages.",
  "Valuation & Modelling": "Evaluate assumptions and valuation against business fundamentals.",
  "Position Sizing & Risk": "Consider portfolio exposure, position size, and downside risk.",
  "Monitoring & Review": "Review results and developments against the investment thesis.",
  "Exit Discipline": "Reassess holdings when the thesis, valuation, or risk changes.",
};

const journeyNodes = [
  { x: 95, y: 170 },
  { x: 245, y: 115 },
  { x: 405, y: 150 },
  { x: 570, y: 88 },
  { x: 735, y: 135 },
  { x: 895, y: 78 },
  { x: 1040, y: 132 },
];

const journeyPath = "M95 170 C145 170 195 115 245 115 S355 150 405 150 S520 88 570 88 S685 135 735 135 S845 78 895 78 S990 132 1040 132";

function descriptionFor(stage) {
  return stageDescriptions[stage.title] || stage.detail;
}

function StageNode({ stage, index, selected, reducedMotion, onSelect, mobile = false }) {
  const label = `Step ${index + 1}: ${stage.title}`;
  const selectedClass = selected
    ? "border-[var(--home-gold)] bg-[var(--home-gold)] text-[var(--home-button-text)]"
    : "border-[var(--home-border)] bg-[var(--surface-bg)] text-[var(--home-support)] group-hover:border-[var(--home-gold)] group-hover:text-[var(--home-text)]";

  return (
    <motion.button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onMouseEnter={mobile ? undefined : onSelect}
      onFocus={onSelect}
      onClick={onSelect}
      initial={reducedMotion ? false : { opacity: 0 }}
      whileInView={reducedMotion ? undefined : { opacity: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={reducedMotion ? undefined : { duration: 0.35, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className={`group outline-none focus-visible:ring-2 focus-visible:ring-[var(--home-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--home-page-bg)] ${mobile ? "relative z-10 flex w-full items-start gap-4 text-left" : "absolute flex w-[128px] flex-col items-center rounded-lg text-center"}`}
      style={mobile ? undefined : {
        left: `${(journeyNodes[index].x / 1200) * 100}%`,
        top: `${(journeyNodes[index].y / 270) * 100}%`,
        marginLeft: "-64px",
        marginTop: "-22px",
      }}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums transition-colors duration-200 ${selectedClass}`}>
        {stage.n}
      </span>
      <span className={`${mobile ? "pt-2" : "mt-2"} text-sm font-medium leading-[1.3] text-[var(--home-text)] transition-colors duration-200 group-hover:text-[var(--home-text)]`}>{stage.title}</span>
    </motion.button>
  );
}

function SelectedStage({ active, reducedMotion }) {
  return (
    <div className="border-t border-[var(--home-border)] px-5 py-5 md:grid md:grid-cols-[3rem_minmax(12rem,17rem)_1fr] md:items-center md:gap-5 md:px-6 md:py-6" aria-live="polite">
      <div className="text-xs font-medium tabular-nums text-[var(--home-gold-text)]">{active.n}</div>
      <h3 className="mt-2 text-base font-semibold text-[var(--home-text)] md:mt-0 md:text-lg">{active.title}</h3>
      <p key={active.n} className={`mt-2 max-w-2xl text-sm leading-[1.6] text-[var(--home-support)] md:mt-0 md:border-l md:border-[var(--home-border)] md:pl-6 ${reducedMotion ? "" : "animate-[process-detail-in_.25s_ease-out]"}`}>
        {descriptionFor(active)}
      </p>
    </div>
  );
}

export default function Process() {
  const [activeIndex, setActiveIndex] = useState(0);
  const reducedMotion = useReducedMotion();
  const active = process[activeIndex];

  return (
    <section id="process" className="border-y border-[var(--home-border)] bg-[var(--home-page-bg)] px-5 py-10 md:px-8 md:py-16">
      <div className="mx-auto max-w-[1200px]">
        <Reveal>
          <div>
            <div className="text-xs font-medium uppercase tracking-[.16em] text-[var(--home-gold-text)]">Investment process</div>
            <h2 className="mt-3 font-serif-display text-[clamp(1.75rem,4vw,2.5rem)] font-normal leading-[1.2] text-[var(--home-text)]">From research to portfolio decisions</h2>
            <p className="mt-4 max-w-[680px] text-base leading-[1.65] text-[var(--home-support)]">A structured approach to evaluating businesses, assessing value, managing risk, and reviewing investments.</p>
          </div>
        </Reveal>

        <Reveal className="mt-8" delay={0.08}>
          <div className="overflow-hidden rounded-xl border border-[var(--home-border)] bg-[var(--surface-bg)]" data-testid="process-experience">
              <div className="relative hidden aspect-[1200/270] lg:block" aria-label="Seven-step investment process journey" data-testid="process-desktop-path">
                <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1200 270" preserveAspectRatio="none" aria-hidden="true">
                <motion.path d={journeyPath} fill="none" stroke="var(--home-border)" strokeWidth="2" vectorEffect="non-scaling-stroke" pathLength="1" initial={reducedMotion ? { pathLength: 1 } : { pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true, margin: "-60px" }} transition={reducedMotion ? { duration: 0 } : { duration: 1.35, ease: "easeInOut" }} />
                  <motion.path d={journeyPath} fill="none" stroke="var(--home-gold)" strokeLinecap="round" strokeOpacity=".9" strokeWidth="3" vectorEffect="non-scaling-stroke" pathLength="1" strokeDasharray={`${Math.max(0.08, (activeIndex + 1) / 7)} ${Math.max(0, 1 - (activeIndex + 1) / 7)}`} initial={reducedMotion ? { opacity: 1 } : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, margin: "-60px" }} transition={reducedMotion ? { duration: 0 } : { duration: 0.45, delay: 1.1 }} />
              </svg>
              {process.map((stage, index) => {
                const selected = index === activeIndex;
                return <StageNode key={stage.n} stage={stage} index={index} selected={selected} reducedMotion={reducedMotion} onSelect={() => setActiveIndex(index)} />;
              })}
            </div>

            <div className="relative px-5 py-6 lg:hidden" data-testid="process-mobile-timeline">
              <span aria-hidden="true" className="absolute bottom-10 left-[2.65rem] top-10 w-px bg-[var(--home-border)]" />
              <ol className="space-y-5" aria-label="Seven-step investment process">
                {process.map((stage, index) => (
                  <li key={stage.n}>
                    <StageNode stage={stage} index={index} selected={index === activeIndex} reducedMotion={reducedMotion} onSelect={() => setActiveIndex(index)} mobile />
                  </li>
                ))}
              </ol>
            </div>

            <SelectedStage active={active} reducedMotion={reducedMotion} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
