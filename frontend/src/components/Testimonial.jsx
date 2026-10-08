export default function Testimonial() {
  return (
    <section className="testimonial-section border-y border-[var(--home-border)] bg-[var(--home-page-bg)] px-5 py-8 md:px-6 md:py-12 lg:px-8" aria-labelledby="client-experience-heading">
      <div className="mx-auto max-w-[1200px]">
        <figure className="mx-auto max-w-[800px] text-center">
          <div id="client-experience-heading" className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--home-gold-text)]">Client Experience</div>
          <span aria-hidden="true" className="mt-5 block font-serif-display text-[2rem] leading-none text-[var(--home-gold-text)]">“</span>
          <blockquote className="mt-2 font-serif-display text-[clamp(1.25rem,2.3vw,1.75rem)] font-normal leading-[1.5] text-[var(--home-text)]">
            The portfolio review really helped me understand where my portfolio stands today. I got some idea about what decisions I can make to improve my portfolio’s performance in the near future.
          </blockquote>
          <figcaption className="mt-5 text-sm font-medium text-[var(--home-support)]">Kavya Agarwal</figcaption>
        </figure>
      </div>
    </section>
  );
}
