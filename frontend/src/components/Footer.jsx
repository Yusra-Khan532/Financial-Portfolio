import { Link } from "react-router-dom";
import { Linkedin, Mail } from "lucide-react";
import { profile } from "@/data/portfolio";
import finlitLogo from "@/assets/brand/finlit-logo-transparent.png";

const links = [
  { to: "/why-we-exist", label: "Why We Exist" }, { to: "/services", label: "Services" }, { to: "/financial-product", label: "Financial Products" }, { to: "/about", label: "About" }, { to: "/portfolio", label: "Portfolio" },
  { to: "/blog", label: "Blog" }, { to: "/contact", label: "Contact" }, { to: "/blog/admin/login", label: "Admin Login" },
];

export default function Footer() {
  return (
    <footer className="site-footer border-t px-5 py-8 transition-colors duration-300 md:px-6 md:py-12 lg:px-8">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col gap-5 border-b pb-8 md:flex-row md:items-center md:justify-between">
          <h2 className="max-w-xl font-serif-display text-2xl leading-[1.3] md:text-[2rem]">Have a question about your portfolio?</h2>
          <Link to="/contact" data-testid="footer-contact-cta" className="footer-cta w-fit rounded-lg px-6 py-3 text-sm font-medium transition-colors">Get in touch</Link>
        </div>
        <div className="grid grid-cols-1 gap-7 pt-8 md:grid-cols-[1.8fr_1.2fr_1fr] md:gap-8">
          <div>
            <img src={finlitLogo} alt="FinLit" className="brand-logo h-auto w-[140px] object-contain" />
            <div className="footer-brand-label mt-3 text-[10px] font-medium uppercase tracking-[0.2em]">Investment Research</div>
            <p className="footer-body mt-4 max-w-[340px] text-sm leading-[1.65]">Research-led perspectives across Indian and global markets.</p>
          </div>
          <div>
            <h3 className="footer-label text-xs font-medium uppercase tracking-[0.12em]">Explore</h3>
            <nav className="mt-4 flex flex-col items-start gap-3" aria-label="Footer navigation">
              {links.map((link) => <Link key={link.to} to={link.to} className={`footer-link text-sm transition-colors ${link.label === "Admin Login" ? "footer-secondary-link" : ""}`}>{link.label}</Link>)}
            </nav>
          </div>
          <div>
            <h3 className="footer-label text-xs font-medium uppercase tracking-[0.12em]">Connect</h3>
            <div className="mt-4 flex flex-col items-start gap-3">
              <a href="mailto:finlit.start@gmail.com" aria-label="Email FinLit" data-testid="footer-email-link" className="footer-link inline-flex min-h-9 items-center gap-3 text-sm transition-colors"><Mail size={19} strokeWidth={1.6} /><span>Email us</span></a>
              <a href="https://www.linkedin.com/company/finlitventures/about/" target="_blank" rel="noopener noreferrer" aria-label="FinLit LinkedIn" data-testid="footer-linkedin-link" className="footer-link inline-flex min-h-9 items-center gap-3 text-sm transition-colors"><Linkedin size={19} strokeWidth={1.6} /><span>LinkedIn</span></a>
            </div>
          </div>
        </div>
        <div className="footer-bottom mt-8 border-t pt-5">
          <p className="footer-body text-xs leading-[1.6]">Portfolio data period: {profile.reportPeriod}</p>
          <p className="footer-body mt-4 max-w-3xl text-[13px] leading-[1.6]">FinLitventure is a technology company and is not registered with SEBI or AMFI.</p>
          <p className="footer-secondary-link mt-4 text-xs">© {new Date().getFullYear()} FinLit. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
