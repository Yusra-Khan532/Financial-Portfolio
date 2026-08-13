import { Link } from "react-router-dom";
import { Reveal } from "@/components/Reveal";
import { aboutPillars, aboutPrinciples, aboutTeam } from "@/data/about";

function Portrait({ person, prominent = false }) {
  const ratioClass = prominent ? "aspect-[4/5]" : "aspect-[5/4] sm:aspect-[4/3]";

  return (
    <div className={`relative overflow-hidden border border-white/10 bg-[#07182F] ${ratioClass}`}>
      <img
        src={person.image.src}
        alt={person.image.alt}
        className="h-full w-full object-cover"
        style={{ objectPosition: person.image.objectPosition }}
      />
    </div>
  );
}

function Eyebrow({ children }) {
  return <div className="text-[11px] uppercase tracking-[0.28em] text-[#F5A623]">{children}</div>;
}

export default function AboutPage() {
  const { investmentLead, technologyTeam } = aboutTeam;

  return (
    <main className="pt-24 md:pt-28">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_82%_12%,rgba(212,175,55,.1),transparent_30%)] px-6 py-14 md:px-10 md:py-20">
        <Reveal className="mx-auto max-w-7xl">
          <Eyebrow>About</Eyebrow>
          <h1 className="mt-5 max-w-4xl font-serif-display text-5xl leading-[.96] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Research-led investing, built with <span className="text-[#E7C56B]">clarity and discipline.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-[15px] leading-relaxed text-[#A6B4C4] md:text-base">
            An independent equity research platform for exploring businesses, portfolio thinking and market opportunities across India and global markets—including equities, ETFs and mutual funds—with an emphasis on understanding before action.
          </p>
        </Reveal>
      </section>

      <section className="px-6 py-16 md:px-10 md:py-20" aria-labelledby="what-we-do-title">
        <div className="mx-auto max-w-7xl">
          <Reveal className="grid gap-8 lg:grid-cols-[.55fr_1fr] lg:gap-16">
            <div>
              <Eyebrow>What We Do</Eyebrow>
              <h2 id="what-we-do-title" className="mt-4 max-w-md font-serif-display text-4xl leading-tight text-white sm:text-5xl">Research that supports better questions.</h2>
            </div>
            <div className="grid sm:grid-cols-2">
              {aboutPillars.map((pillar, index) => (
                <article key={pillar.title} className={`border-t border-white/10 py-6 sm:px-7 ${index % 2 ? "sm:border-l" : "sm:pl-0"} ${index > 1 ? "sm:pb-0" : ""}`}>
                  <div className="text-[10px] tabular-nums text-[#71839A]">0{index + 1}</div>
                  <h3 className="mt-3 text-xs font-medium uppercase tracking-[.17em] text-[#FFF8E7]">{pillar.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#94A3B8]">{pillar.text}</p>
                </article>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#07182F]/55 px-6 py-16 md:px-10 md:py-20" aria-labelledby="principles-title">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <Eyebrow>Our Principles</Eyebrow>
            <h2 id="principles-title" className="mt-4 font-serif-display text-4xl text-white sm:text-5xl">A clear standard for how we work.</h2>
            <div className="mt-10 grid border-y border-white/10 md:grid-cols-3">
              {aboutPrinciples.map((principle, index) => (
                <article key={principle.title} className={`py-7 md:px-8 ${index ? "border-t border-white/10 md:border-l md:border-t-0" : "md:pl-0"}`}>
                  <h3 className="text-xs font-medium uppercase tracking-[.17em] text-[#FFF8E7]">{principle.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#94A3B8]">{principle.text}</p>
                </article>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="px-6 py-16 md:px-10 md:py-20" aria-labelledby="nishant-profile-title">
        <div className="mx-auto max-w-7xl">
          <Reveal className="grid items-center gap-10 lg:grid-cols-[.78fr_1.22fr] lg:gap-20">
            <Portrait person={investmentLead} prominent />
            <div>
              <Eyebrow>Investment & Research Lead</Eyebrow>
              <h2 id="nishant-profile-title" className="mt-4 font-serif-display text-5xl leading-none text-white sm:text-6xl">{investmentLead.name}</h2>
              <p className="mt-3 text-sm text-[#E7C56B]">{investmentLead.role}</p>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 border-y border-white/10 py-4 text-xs text-[#CBD5E1]">
                {investmentLead.credentials.map((credential) => <span key={credential}>{credential}</span>)}
              </div>
              <p className="mt-7 max-w-2xl text-base leading-relaxed text-[#A6B4C4]">{investmentLead.bio}</p>
              <p className="mt-5 max-w-2xl text-sm leading-relaxed text-[#94A3B8]">
                His process moves from idea generation and industry analysis through business quality, valuation and position sizing—then continues with deliberate monitoring and exit discipline.
              </p>
              <div className="mt-8 border-l-2 border-[#D4AF37]/70 pl-5">
                <div className="text-[10px] uppercase tracking-[.17em] text-[#71839A]">Research philosophy</div>
                <p className="mt-2 font-serif-display text-2xl leading-snug text-[#FFF8E7]">Understand the business, respect the price and let discipline govern the decision.</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#07182F]/55 px-6 py-16 md:px-10 md:py-20" aria-labelledby="technology-title">
        <div className="mx-auto max-w-7xl">
          <Reveal className="grid gap-5 lg:grid-cols-[.72fr_1.28fr] lg:items-end lg:gap-16">
            <div>
              <Eyebrow>Technology Team</Eyebrow>
              <h2 id="technology-title" className="mt-4 max-w-xl font-serif-display text-4xl leading-tight text-white sm:text-5xl">The team behind the digital experience.</h2>
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-[#94A3B8]">
              The technology team builds and maintains the digital platform that brings research, portfolio information and investor resources into a clear and accessible experience.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-8 md:grid-cols-2">
            {technologyTeam.map((person, index) => (
              <Reveal key={person.name} delay={index * 0.08}>
                <article className="grid gap-6 sm:grid-cols-[.9fr_1.1fr] sm:items-end">
                  <Portrait person={person} />
                  <div className="border-t border-white/10 pt-5 sm:pb-3">
                    <h3 className="font-serif-display text-3xl text-white">{person.name}</h3>
                    <p className="mt-1 text-xs uppercase tracking-[.15em] text-[#E7C56B]">{person.role}</p>
                    <p className="mt-4 text-sm leading-relaxed text-[#94A3B8]">{person.bio}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 px-6 py-16 md:px-10 md:py-20">
        <Reveal className="mx-auto flex max-w-7xl flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Eyebrow>Continue Exploring</Eyebrow>
            <h2 className="mt-4 max-w-2xl font-serif-display text-4xl leading-tight text-white sm:text-5xl">Explore the research behind the process.</h2>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link to="/portfolio" className="rounded-full bg-[#F5A623] px-6 py-3 text-sm font-medium text-[#050E1D] transition-colors hover:bg-[#E19212]">View Portfolio</Link>
            <Link to="/blog" className="text-sm text-[#CBD5E1] transition-colors hover:text-[#F5A623]">Read Research</Link>
            <Link to="/contact" className="text-sm text-[#CBD5E1] transition-colors hover:text-[#F5A623]">Contact</Link>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
