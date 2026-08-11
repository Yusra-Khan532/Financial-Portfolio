import { Link } from "react-router-dom";
import { profile } from "@/data/portfolio";
import { CONTACT_EMAIL, LINKEDIN_URL } from "@/config";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 px-6 md:px-10 py-14 bg-[#04101f]">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8 pb-10 border-b border-white/10">
          <div>
            <div className="font-serif-display text-2xl md:text-3xl text-white max-w-md leading-snug">
              Have a question or want to connect?
            </div>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              data-testid="footer-email-link"
              className="inline-block mt-3 text-[#94A3B8] hover:text-[#F5A623] transition-colors"
            >
              {CONTACT_EMAIL}
            </a>
          </div>
          <div className="flex items-center gap-4">
            {LINKEDIN_URL ? (
              <a
                href={LINKEDIN_URL}
                target="_blank"
                rel="noreferrer"
                data-testid="footer-linkedin-link"
                className="px-5 py-2.5 rounded-full border border-white/20 text-white text-sm hover:border-[#F5A623] hover:text-[#F5A623] transition-colors"
              >
                LinkedIn
              </a>
            ) : null}
            <Link
              to="/contact"
              data-testid="footer-contact-cta"
              className="px-6 py-2.5 rounded-full bg-[#F5A623] text-[#050E1D] text-sm font-medium hover:bg-[#E19212] transition-colors"
            >
              Contact
            </Link>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mt-10">
          <div>
            <div className="font-serif-display text-2xl text-white">{profile.name}</div>
            <div className="text-[#F5A623] text-sm">{profile.title}</div>
          </div>
          <div className="text-sm text-[#64748B] md:text-right">
            <p>Report period {profile.reportPeriod}</p>
            <p>{profile.financialYear} · Equity Research Portfolio</p>
          </div>
        </div>

        <p className="text-xs text-[#475569] leading-relaxed mt-10 max-w-3xl">
          Disclaimer: This website is for informational purposes only and does
          not constitute investment advice or a recommendation to buy or sell any
          security. Past performance is not indicative of future results.
          Investments are subject to market risks.
        </p>
        <p className="text-xs text-[#475569] mt-6">
          © {new Date().getFullYear()} {profile.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
