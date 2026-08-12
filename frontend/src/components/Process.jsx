import { Reveal } from "@/components/Reveal";
import { process, researchApproach } from "@/data/portfolio";
import { Check } from "lucide-react";

export default function Process() {
  return (
    <section id="process" className="relative py-20 md:py-24 px-6 md:px-10 bg-[#04101f]">
      <div className="max-w-6xl mx-auto">
        {/* Intro */}
        <Reveal>
          <div className="flex items-center gap-3 mb-5">
            <span className="uppercase tracking-[0.28em] text-[11px] text-[#F5A623]">04</span>
            <span className="h-px w-8 bg-[#F5A623]/50" />
            <span className="uppercase tracking-[0.28em] text-[11px] text-[#94A3B8]">My Investment Process</span>
          </div>
          <h2 className="font-serif-display text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight leading-tight max-w-3xl">
            A repeatable process — from idea to <span className="text-[#F5A623]">exit discipline</span>.
          </h2>
        </Reveal>

        {/* Research approach — compact supporting list */}
        <Reveal delay={0.08}>
          <div className="mt-10 pt-8 border-t border-white/10">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#5A6B85] mb-5">
              Research approach
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
              {researchApproach.map((r) => (
                <li key={r} className="flex items-start gap-2.5 text-sm text-[#CBD5E1]">
                  <Check size={14} strokeWidth={2.5} className="text-[#F5A623] mt-0.5 shrink-0" />
                  <span className="leading-snug">{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        {/* Vertical process timeline */}
        <div className="mt-14">
          {process.map((s, i) => (
            <Reveal key={s.n} delay={(i % 4) * 0.05}>
              <div className="group grid grid-cols-[auto_1fr] gap-5 md:gap-7">
                {/* marker + connector */}
                <div className="flex flex-col items-center">
                  <span className="h-9 w-9 rounded-full border border-[#F5A623]/40 flex items-center justify-center text-[#F5A623] text-[13px] font-medium tabular-nums group-hover:border-[#F5A623] group-hover:bg-[#F5A623]/10 transition-colors">
                    {s.n}
                  </span>
                  {i < process.length - 1 && (
                    <span className="w-px flex-1 bg-gradient-to-b from-white/15 to-white/5 mt-2" />
                  )}
                </div>
                {/* content */}
                <div className={`pt-1 ${i < process.length - 1 ? "pb-8" : "pb-0"}`}>
                  <h3 className="text-lg md:text-xl text-white group-hover:text-[#F5A623] transition-colors">
                    {s.title}
                  </h3>
                  <p className="text-sm md:text-[15px] text-[#94A3B8] mt-1.5 max-w-2xl leading-relaxed">
                    {s.detail}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
