import { Link } from "react-router-dom";
import { Linkedin, Mail } from "lucide-react";
import { profile } from "@/data/portfolio";
import finlitLogo from "@/assets/brand/finlit-logo-transparent.png";

const links = [
  { to: "/what-we-do", label: "What We Do" }, { to: "/services", label: "Services" }, { to: "/about", label: "About" }, { to: "/portfolio", label: "Portfolio" },
  { to: "/blog", label: "Blog" }, { to: "/contact", label: "Contact" }, { to: "/blog/admin/login", label: "Admin Login" },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#04101f] px-6 py-12 md:px-10 md:py-14">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-6 border-b border-white/10 pb-9 md:flex-row md:items-center md:justify-between">
          <h2 className="max-w-xl font-serif-display text-2xl leading-tight text-white md:text-3xl">Have a question or want to discuss your portfolio?</h2>
          <Link to="/contact" data-testid="footer-contact-cta" className="w-fit rounded-full bg-[#F5A623] px-6 py-3 text-sm font-medium text-[#050E1D] transition-colors hover:bg-[#E19212]">Get in touch</Link>
        </div>
        <div className="grid grid-cols-1 gap-10 py-10 sm:grid-cols-2 lg:grid-cols-[1.35fr_.8fr_1fr] lg:gap-16">
          <div><img src={finlitLogo} alt="FinLit" className="h-20 w-auto object-contain" /><div className="mt-3 text-[10px] uppercase tracking-[0.29em] text-[#F5A623]">Investment Research</div><p className="mt-5 max-w-xs text-sm leading-relaxed text-[#94A3B8]">Research-led perspectives across Indian and global markets.</p></div>
          <div><h3 className="text-[10px] uppercase tracking-[0.23em] text-[#64748B]">Explore</h3><nav className="mt-4 flex flex-col items-start gap-3" aria-label="Footer navigation">{links.map((link) => <Link key={link.to} to={link.to} className="text-sm text-[#94A3B8] transition-colors hover:text-[#F5A623]">{link.label}</Link>)}</nav></div>
          <div><h3 className="text-[10px] uppercase tracking-[0.23em] text-[#64748B]">Connect</h3><div className="mt-4 flex items-center gap-4"><a href="mailto:finlit.start@gmail.com" aria-label="Email FinLit" data-testid="footer-email-link" className="inline-flex h-9 w-9 items-center justify-center text-[#CBD5E1] transition-colors hover:text-[#F5A623] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] focus-visible:ring-offset-2 focus-visible:ring-offset-[#04101f]"><Mail size={21} strokeWidth={1.5} /></a><a href="https://www.linkedin.com/company/finlitventures/about/" target="_blank" rel="noopener noreferrer" aria-label="FinLit LinkedIn" data-testid="footer-linkedin-link" className="inline-flex h-9 w-9 items-center justify-center text-[#CBD5E1] transition-colors hover:text-[#F5A623] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] focus-visible:ring-offset-2 focus-visible:ring-offset-[#04101f]"><Linkedin size={21} strokeWidth={1.5} /></a></div></div>
        </div>
        <div className="border-t border-white/[0.07] pt-7"><p className="text-[10px] uppercase tracking-[0.16em] text-[#64748B]">Portfolio data period: {profile.reportPeriod}</p><p className="mt-6 max-w-3xl text-xs leading-relaxed text-[#64748B]">FinLitventure is a technology company and is not registered with SEBI or AMFI.</p><p className="mt-6 text-xs text-[#475569]">© {new Date().getFullYear()} FinLit. All rights reserved.</p></div>
      </div>
    </footer>
  );
}
