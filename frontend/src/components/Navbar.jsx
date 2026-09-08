import { useEffect, useState } from "react";
import { useLenis } from "lenis/react";
import { useNavigate, useLocation } from "react-router-dom";
import finlitLogo from "@/assets/brand/finlit-logo-transparent.png";
import ThemeToggle from "@/components/ThemeToggle";

const links = [
  { route: "/why-we-exist", label: "Why We Exist" },
  { route: "/services", label: "Services" },
  { route: "/about", label: "About" },
  { route: "/portfolio", label: "Portfolio" },
  { route: "/blog", label: "Blog" },
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
        scrolled ? "border-b border-[var(--border-subtle)] bg-[var(--nav-bg)] backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-10 h-14 md:h-20 flex items-center justify-between">
        <button data-testid="nav-logo" onClick={goHome} className="flex items-center">
          <img
            src={finlitLogo}
            alt="FinLit"
            className="brand-logo h-9 w-auto object-contain sm:h-10 md:h-14"
          />
        </button>

        <nav className="hidden lg:flex items-center gap-9">
          {links.map((l) => (
            <button
              key={l.label}
              data-testid={`nav-${slug(l.label)}`}
              onClick={() => (l.route ? goRoute(l.route) : go(l.id))}
              aria-current={location.pathname === l.route ? "page" : undefined}
              className={`nav-link relative text-sm transition-colors ${location.pathname === l.route ? "text-[#F5A623]" : "text-[#94A3B8] hover:text-white"}`}
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
          <ThemeToggle />
        </nav>

        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggle compact />
          <button
            data-testid="nav-mobile-toggle"
            className="rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--text-primary)]"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            aria-label={`${open ? "Close" : "Open"} navigation menu`}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-navigation" className="lg:hidden max-h-[calc(100svh-5.5rem)] overflow-y-auto border-t border-[var(--border-subtle)] bg-[var(--panel-bg-strong)] px-4 py-4 shadow-2xl sm:px-6">
          {links.map((l) => (
            <button
              key={l.label}
              data-testid={`nav-mobile-${slug(l.label)}`}
              onClick={() => (l.route ? goRoute(l.route) : go(l.id))}
              aria-current={location.pathname === l.route ? "page" : undefined}
              className={`block w-full rounded-lg px-3 py-3 text-left transition-colors ${location.pathname === l.route ? "bg-[#F5A623]/10 text-[#F5A623]" : "text-[#CBD5E1] hover:bg-white/5 hover:text-white"}`}
            >
              {l.label}
            </button>
          ))}
          <button
            data-testid="nav-mobile-contact"
            onClick={goContact}
            className="mt-1 block w-full rounded-lg bg-[#F5A623] px-3 py-3 text-left font-medium text-[#050E1D]"
          >
            Contact
          </button>
        </div>
      )}
    </header>
  );
}
