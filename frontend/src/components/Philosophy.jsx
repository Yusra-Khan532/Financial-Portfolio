import { useEffect, useRef, useState } from "react";
import Marquee from "react-fast-marquee";
import { useReducedMotion } from "framer-motion";

const principles = [
  "Margin of Safety",
  "Think Long Term",
  "Let Compounding Work",
  "Quality Businesses",
  "Strong Moats",
  "Patient Capital",
];

function PrincipleList({ animated = false }) {
  return (
    <div aria-hidden={animated ? "true" : undefined} className={animated ? "flex items-center whitespace-nowrap" : "flex flex-wrap justify-center gap-x-6 gap-y-3"}>
      {principles.map((principle, index) => (
        <span
          key={principle}
          className={`font-serif-display italic ${animated ? "mr-8 text-[clamp(1.5rem,3.3vw,3rem)] leading-[1.2] md:mr-12" : "text-xl leading-[1.2]"} ${index % 2 ? "text-[var(--home-gold-text)]" : "text-[var(--home-text)]"}`}
        >
          {principle}
          {index < principles.length - 1 && <span className="ml-8 text-sm not-italic text-[var(--home-gold-text)] md:ml-12">·</span>}
        </span>
      ))}
    </div>
  );
}

export default function Philosophy() {
  const sectionRef = useRef(null);
  const reducedMotion = useReducedMotion();
  const [isVisible, setIsVisible] = useState(true);
  const [isFocused, setIsFocused] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.05 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const timeout = window.setTimeout(() => setHasTimedOut(true), 5000);
    return () => window.clearTimeout(timeout);
  }, [reducedMotion]);

  const shouldPlay = !reducedMotion && isVisible && !hasTimedOut && !isFocused;

  return (
    <section ref={sectionRef} className="border-y border-[var(--home-border)] bg-[var(--home-page-bg)] px-5 py-6 md:px-8 md:py-8" aria-label="Investment principles">
      <div className="mx-auto max-w-[1200px]">
        <div className="relative" onFocusCapture={() => setIsFocused(true)} onBlurCapture={() => setIsFocused(false)}>
          {reducedMotion ? (
            <PrincipleList />
          ) : (
            <Marquee
              speed={34}
              gradient={false}
              play={shouldPlay}
              pauseOnHover
              className="py-1"
              aria-hidden="true"
            >
              <PrincipleList animated />
              <span aria-hidden="true" className="w-8 shrink-0 md:w-12" />
              <PrincipleList animated />
            </Marquee>
          )}

          {!reducedMotion && <span className="sr-only">Investment principles: {principles.join(", ")}.</span>}
        </div>

      </div>
    </section>
  );
}
