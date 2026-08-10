import { motion } from "framer-motion";
import { Reveal, SectionLabel } from "@/components/Reveal";
import { services, profile, pillars } from "@/data/portfolio";
import { ArrowUpRight } from "lucide-react";

const PORTRAIT =
  "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTN8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBidXNpbmVzc21hbiUyMGRhcmslMjBiYWNrZ3JvdW5kfGVufDB8fHx8MTc4NjM2ODIwNHww&ixlib=rb-4.1.0&q=85";

export default function Services() {
  return (
    <section id="services" className="relative py-24 md:py-32 px-6 md:px-10">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <SectionLabel index="05">Portfolio Management Services</SectionLabel>
          <h2 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl text-white tracking-tight max-w-3xl">
            Ways to work together.
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-14 items-stretch">
          {/* portrait / bio */}
          <Reveal>
            <div className="relative h-full min-h-[420px] rounded-lg overflow-hidden border border-white/10">
              <img src={PORTRAIT} alt="Nishant Jain" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050E1D] via-[#050E1D]/50 to-transparent" />
              <div className="absolute bottom-0 p-7">
                <div className="font-serif-display text-3xl text-white">{profile.name}</div>
                <div className="text-[#F5A623] text-sm mb-4">{profile.title}</div>
                <ul className="flex flex-wrap gap-2">
                  {profile.credentials.map((c) => (
                    <li key={c} className="text-[11px] text-[#CBD5E1] border border-white/20 rounded-full px-3 py-1">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>

          {/* service cards */}
          <div className="space-y-4">
            {services.map((s, i) => (
              <Reveal key={s.title} delay={i * 0.08}>
                <div
                  data-testid={`service-${i}`}
                  className="group bg-[#0A1E3F] border border-white/10 rounded-lg p-7 hover:border-[#F5A623]/40 hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-xl text-white font-serif-display">{s.title}</h3>
                    <ArrowUpRight className="text-[#64748B] group-hover:text-[#F5A623] transition-colors shrink-0" size={20} strokeWidth={1.5} />
                  </div>
                  <p className="text-[#94A3B8] mt-3 leading-relaxed text-sm">{s.detail}</p>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {s.points.map((p) => (
                      <li key={p} className="text-[11px] text-[#F5A623] bg-[#F5A623]/10 rounded-full px-3 py-1">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* pillars */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-10">
          {pillars.map((p, i) => (
            <motion.div
              key={p.title}
              data-testid={`pillar-${i}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06, duration: 0.5 }}
              className="border-t-2 border-[#F5A623]/40 pt-4"
            >
              <div className="text-white font-medium text-sm">{p.title}</div>
              <div className="text-[#64748B] text-xs mt-1 leading-relaxed">{p.detail}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
