import { Link } from "react-router-dom";
import { profile } from "@/data/portfolio";
import { CONTACT_EMAIL, LINKEDIN_URL } from "@/config";

const links = [
  { to: "/about", label: "About" }, { to: "/portfolio", label: "Portfolio" },
  { to: "/blog", label: "Blog" }, { to: "/services", label: "Services" }, { to: "/contact", label: "Contact" },
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
          <div><div className="font-serif-display text-3xl tracking-tight text-white">FinLit</div><div className="mt-1 text-[10px] uppercase tracking-[0.29em] text-[#F5A623]">Investment Research</div><p className="mt-5 max-w-xs text-sm leading-relaxed text-[#94A3B8]">Research-led perspectives across Indian and global markets.</p></div>
          <div><h3 className="text-[10px] uppercase tracking-[0.23em] text-[#64748B]">Explore</h3><nav className="mt-4 flex flex-col items-start gap-3" aria-label="Footer navigation">{links.map((link) => <Link key={link.to} to={link.to} className="text-sm text-[#94A3B8] transition-colors hover:text-[#F5A623]">{link.label}</Link>)}</nav></div>
          <div><h3 className="text-[10px] uppercase tracking-[0.23em] text-[#64748B]">Connect</h3><div className="mt-4 flex flex-col items-start gap-3 text-sm"><a href={`mailto:${CONTACT_EMAIL}`} data-testid="footer-email-link" className="text-[#CBD5E1] transition-colors hover:text-[#F5A623]">{CONTACT_EMAIL}</a><a href={LINKEDIN_URL} target="_blank" rel="noreferrer" data-testid="footer-linkedin-link" className="text-[#94A3B8] transition-colors hover:text-[#F5A623]">LinkedIn</a></div></div>
        </div>
        <div className="border-t border-white/[0.07] pt-7"><p className="text-[10px] uppercase tracking-[0.16em] text-[#64748B]">Portfolio data period: {profile.reportPeriod}</p><p className="mt-6 max-w-3xl text-xs leading-relaxed text-[#64748B]">Disclaimer: This website is for informational purposes only and does not constitute investment advice or a recommendation to buy or sell any security. Past performance is not indicative of future results. Investments are subject to market risks.</p><p className="mt-6 text-xs text-[#475569]">© {new Date().getFullYear()} FinLit. All rights reserved.</p></div>
      </div>
    </footer>
  );
}
