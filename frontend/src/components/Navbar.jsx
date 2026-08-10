import { useEffect, useState } from "react";
import { useLenis } from "lenis/react";

const links = [
  { id: "performance", label: "Performance" },
  { id: "allocation", label: "Allocation" },
  { id: "holdings", label: "Holdings" },
  { id: "process", label: "Process" },
  { id: "services", label: "Services" },
  { id: "contact", label: "Contact" },
];

export default function Navbar() {
  const lenis = useLenis();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (id) => {
    setOpen(false);
    if (lenis) lenis.scrollTo(`#${id}`, { offset: -70 });
    else document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header
      data-testid="site-navbar"
      className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${
        scrolled ? "bg-[#050E1D]/85 backdrop-blur-md border-b border-white/10" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10 h-16 md:h-20 flex items-center justify-between">
        <button
          data-testid="nav-logo"
          onClick={() => (lenis ? lenis.scrollTo(0) : window.scrollTo(0, 0))}
          className="text-left"
        >
          <span className="font-serif-display text-xl md:text-2xl text-white tracking-tight">
            Nishant Jain
          </span>
          <span className="block text-[10px] uppercase tracking-[0.3em] text-[#F5A623]">
            Equity Research
          </span>
        </button>

        <nav className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <button
              key={l.id}
              data-testid={`nav-${l.id}`}
              onClick={() => go(l.id)}
              className="text-sm text-[#94A3B8] hover:text-white transition-colors"
            >
              {l.label}
            </button>
          ))}
          <button
            data-testid="nav-cta"
            onClick={() => go("contact")}
            className="px-5 py-2 rounded-full bg-[#F5A623] text-[#050E1D] text-sm font-medium hover:bg-[#E19212] transition-colors"
          >
            Work with me
          </button>
        </nav>

        <button
          data-testid="nav-mobile-toggle"
          className="md:hidden text-white text-sm"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-[#0A1E3F] border-t border-white/10 px-6 py-4 flex flex-col gap-4">
          {links.map((l) => (
            <button
              key={l.id}
              data-testid={`nav-mobile-${l.id}`}
              onClick={() => go(l.id)}
              className="text-left text-[#94A3B8] hover:text-white"
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
