import { Reveal, SectionLabel } from "@/components/Reveal";
import { process, researchApproach } from "@/data/portfolio";
import { Check } from "lucide-react";

export default function Process() {
  return (
    <section id="process" className="relative py-24 md:py-32 px-6 md:px-10 bg-[#04101f] grain">
      <div className="max-w-7xl mx-auto relative">
        <Reveal>
          <SectionLabel index="04">My Investment Process</SectionLabel>
          <h2 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-white tracking-tight max-w-3xl">
            A repeatable process. From idea to <span className="italic text-[#F5A623]">exit discipline.</span>
          </h2>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 lg:grid-cols-3 gap-x-10">
          <div className="lg:col-span-2 divide-y divide-white/10 border-t border-white/10">
            {process.map((step, i) => (
              <Reveal key={step.n} delay={(i % 3) * 0.05}>
                <div className="group flex gap-6 md:gap-10 py-8 hover:pl-2 transition-all duration-300">
                  <span className="font-serif-display text-5xl md:text-6xl text-white/15 group-hover:text-[#F5A623] transition-colors duration-300 shrink-0">
                    {step.n}
                  </span>
                  <div>
                    <h3 className="text-xl md:text-2xl text-white font-serif-display">{step.title}</h3>
                    <p className="text-[#94A3B8] mt-2 max-w-xl leading-relaxed">{step.detail}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.2}>
            <div className="lg:sticky lg:top-28 mt-10 lg:mt-0 bg-[#0A1E3F] border border-white/10 rounded-lg p-7">
              <h3 className="text-white font-medium mb-1">Research Approach</h3>
              <p className="text-xs text-[#64748B] mb-6 uppercase tracking-wider">How every idea is vetted</p>
              <ul className="space-y-4">
                {researchApproach.map((r) => (
                  <li key={r} className="flex items-start gap-3">
                    <span className="mt-0.5 h-5 w-5 rounded-full bg-[#F5A623]/15 flex items-center justify-center shrink-0">
                      <Check size={12} strokeWidth={2.5} className="text-[#F5A623]" />
                    </span>
                    <span className="text-sm text-[#CBD5E1] leading-relaxed">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
