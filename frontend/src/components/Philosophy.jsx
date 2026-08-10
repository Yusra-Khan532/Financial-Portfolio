import Marquee from "react-fast-marquee";
import { profile } from "@/data/portfolio";

export default function Philosophy() {
  return (
    <section className="relative py-20 md:py-28 bg-[#04101f] overflow-hidden border-y border-white/5">
      <Marquee speed={40} gradient={false} className="py-4">
        <span className="font-serif-display italic text-6xl md:text-8xl text-white/10 whitespace-nowrap mr-16">
          Margin of Safety · Think Long Term · Let Compounding Work ·
        </span>
        <span className="font-serif-display italic text-6xl md:text-8xl text-[#F5A623]/20 whitespace-nowrap mr-16">
          Quality Businesses · Strong Moats · Patient Capital ·
        </span>
      </Marquee>

      <div className="max-w-4xl mx-auto px-6 md:px-10 mt-16 text-center">
        <span className="font-serif-display text-6xl text-[#F5A623] leading-none">“</span>
        <p className="font-serif-display text-2xl md:text-4xl text-white leading-snug -mt-6">
          {profile.quote}
        </p>
        <p className="mt-6 text-sm uppercase tracking-[0.3em] text-[#64748B]">— {profile.name}</p>
      </div>
    </section>
  );
}
