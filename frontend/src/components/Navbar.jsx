import { useEffect, useState } from "react";
import { useLenis } from "lenis/react";
import { useNavigate, useLocation } from "react-router-dom";

const links = [
  { id: "top", label: "About" },
  { route: "/portfolio", label: "Portfolio" },
  { id: "process", label: "Approach" },
  { route: "/blog", label: "Blog" },
  { route: "/services", label: "Services" },
];

const slug = (s) => s.toLowerCase().replace(/\s+/g, "-");

export default function Navbar() {
  const lenis = useLenis();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToId = (id) => {
    if (lenis) lenis.scrollTo(`#${id}`, { offset: -70 });
    else document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const go = (id) => {
    setOpen(false);
    if (id === "top") {
      if (location.pathname !== "/") navigate("/");
      else if (lenis) lenis.scrollTo(0);
      else window.scrollTo(0, 0);
      return;
    }
    if (location.pathname !== "/") {
      navigate("/");
      setTimeout(() => scrollToId(id), 500);
    } else {
      scrollToId(id);
    }
  };

  const goRoute = (r) => {
    setOpen(false);
    navigate(r);
  };

  const goHome = () => {
    setOpen(false);
    if (location.pathname !== "/") navigate("/");
    else if (lenis) lenis.scrollTo(0);
    else window.scrollTo(0, 0);
  };

  const goContact = () => {
    setOpen(false);
    navigate("/contact");
  };

  return (
    <header
      data-testid="site-navbar"
      className={`fixed top-8 inset-x-0 z-50 transition-colors duration-300 ${
        scrolled ? "bg-[#050E1D]/85 backdrop-blur-md border-b border-white/10" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10 h-16 md:h-20 flex items-center justify-between">
        <button data-testid="nav-logo" onClick={goHome} className="text-left">
          <span className="font-serif-display text-xl md:text-2xl text-white tracking-tight">
            Nishant Jain
          </span>
          <span className="block text-[10px] uppercase tracking-[0.3em] text-[#F5A623]">
            Equity Research
          </span>
        </button>

        <nav className="hidden lg:flex items-center gap-9">
          {links.map((l) => (
            <button
              key={l.label}
              data-testid={`nav-${slug(l.label)}`}
              onClick={() => (l.route ? goRoute(l.route) : go(l.id))}
              className="text-sm text-[#94A3B8] hover:text-white transition-colors"
            >
              {l.label}
            </button>
          ))}
          <button
            data-testid="nav-cta"
            onClick={goContact}
            className="px-5 py-2 rounded-full bg-[#F5A623] text-[#050E1D] text-sm font-medium hover:bg-[#E19212] transition-colors"
          >
            Contact
          </button>
        </nav>

        <button
          data-testid="nav-mobile-toggle"
          className="lg:hidden text-white text-sm"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {open && (
        <div className="lg:hidden bg-[#0A1E3F] border-t border-white/10 px-6 py-4 flex flex-col gap-4">
          {links.map((l) => (
            <button
              key={l.label}
              data-testid={`nav-mobile-${slug(l.label)}`}
              onClick={() => (l.route ? goRoute(l.route) : go(l.id))}
              className="text-left text-[#94A3B8] hover:text-white"
            >
              {l.label}
            </button>
          ))}
          <button
            data-testid="nav-mobile-contact"
            onClick={goContact}
            className="text-left text-[#F5A623] font-medium"
          >
            Contact
          </button>
        </div>
      )}
    </header>
  );
}
