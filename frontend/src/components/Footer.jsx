import { profile } from "@/data/portfolio";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 px-6 md:px-10 py-12 bg-[#04101f]">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="font-serif-display text-3xl text-white">{profile.name}</div>
            <div className="text-[#F5A623] text-sm">{profile.title}</div>
          </div>
          <div className="text-sm text-[#64748B]">
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
