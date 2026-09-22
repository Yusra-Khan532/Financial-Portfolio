export default function FinancialProductPage() {
  return (
    <main className="relative flex min-h-[calc(100svh-2rem)] items-center justify-center overflow-hidden px-6 pb-16 pt-24 md:px-10 md:pb-20 md:pt-28">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#D4AF37]/15 sm:h-96 sm:w-96" aria-hidden="true" />
      <section className="relative w-full max-w-3xl text-center" aria-labelledby="financial-product-title">
        <div className="mx-auto h-px w-12 bg-[var(--viz-gold)]" aria-hidden="true" />
        <p className="mt-7 text-[10px] font-medium uppercase tracking-[0.3em] text-[var(--viz-gold)]">Financial Product</p>
        <h1 id="financial-product-title" className="mt-5 font-serif-display text-5xl leading-none tracking-tight text-[var(--text-primary)] sm:text-6xl md:text-7xl">
          Coming Soon
        </h1>
        <p className="mt-5 text-base text-[var(--text-muted)] md:text-lg">Stay Tuned.</p>
      </section>
    </main>
  );
}
