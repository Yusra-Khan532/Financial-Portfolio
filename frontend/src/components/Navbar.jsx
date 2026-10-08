import { useState } from "react";
import { useLenis } from "lenis/react";
import { useNavigate, useLocation } from "react-router-dom";
import finlitLogo from "@/assets/brand/finlit-logo-transparent.png";
import ThemeToggle from "@/components/ThemeToggle";

const links = [
  { route: "/why-we-exist", label: "Why We Exist" },
  { route: "/services", label: "Services" },
  { route: "/financial-product", label: "Financial Products" },
  { route: "/about", label: "About" },
  { route: "/portfolio", label: "Portfolio" },
  { route: "/blog", label: "Blog" },
];

const slug = (s) => s.toLowerCase().replace(/\s+/g, "-");

export default function Navbar() {
  const lenis = useLenis();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const scrollToId = (id) => {
    if (lenis) lenis.scrollTo(`#${id}`, { offset: -112 });
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
      className="fixed inset-x-0 top-8 z-50 border-b border-[var(--home-border)] bg-[var(--home-header-bg)] transition-colors duration-300"
    >
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5 sm:px-6 md:h-[76px] md:px-8">
        <button data-testid="nav-logo" onClick={goHome} className="flex items-center rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--home-gold)]">
          <img
            src={finlitLogo}
            alt="FinLit"
            className="brand-logo h-auto w-[110px] object-contain md:w-[120px]"
          />
        </button>

        <nav aria-label="Primary navigation" className="hidden items-center gap-5 lg:flex xl:gap-7">
          {links.map((l) => (
            <button
              key={l.label}
              data-testid={`nav-${slug(l.label)}`}
              onClick={() => (l.route ? goRoute(l.route) : go(l.id))}
              aria-current={location.pathname === l.route ? "page" : undefined}
              className="nav-link relative whitespace-nowrap text-[14px] font-medium text-[var(--home-support)] transition-colors hover:text-[var(--home-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--home-gold)]"
            >
              {l.label}
            </button>
          ))}
          <button
            data-testid="nav-cta"
            onClick={goContact}
            className="rounded-lg bg-[var(--home-gold)] px-5 py-2.5 text-[14px] font-medium text-[var(--home-button-text)] transition-colors hover:bg-[var(--home-button-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--home-gold)]"
          >
            Contact
          </button>
          <ThemeToggle />
        </nav>

        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggle compact />
          <button
            data-testid="nav-mobile-toggle"
            className="rounded-lg border border-[var(--home-border)] px-3.5 py-2 text-sm text-[var(--home-text)] transition-colors hover:border-[var(--home-gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--home-gold)]"
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
        <div id="mobile-navigation" className="max-h-[calc(100svh-8rem)] overflow-y-auto border-t border-[var(--home-border)] bg-[var(--home-header-bg)] px-5 py-4 sm:px-6 lg:hidden">
          {links.map((l) => (
            <button
              key={l.label}
              data-testid={`nav-mobile-${slug(l.label)}`}
              onClick={() => (l.route ? goRoute(l.route) : go(l.id))}
              aria-current={location.pathname === l.route ? "page" : undefined}
              className={`block w-full rounded-lg px-3 py-3 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--home-gold)] ${location.pathname === l.route ? "bg-[var(--home-secondary-hover)] text-[var(--home-gold-text)]" : "text-[var(--home-support)] hover:bg-[var(--home-secondary-hover)] hover:text-[var(--home-text)]"}`}
            >
              {l.label}
            </button>
          ))}
          <button
            data-testid="nav-mobile-contact"
            onClick={goContact}
            className="mt-1 block w-full rounded-lg bg-[var(--home-gold)] px-3 py-3 text-left text-sm font-medium text-[var(--home-button-text)] transition-colors hover:bg-[var(--home-button-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--home-gold)]"
          >
            Contact
          </button>
        </div>
      )}
    </header>
  );
}
