import { PRICING } from "@/data/services";

const navigate = (to) => ({ type: "navigate", to });
const enquire = (service) => ({ type: "enquire", service });
const menu = (target) => ({ type: "menu", target });

export const MAIN_MENU_ID = "main";

export const assistantNodes = {
  main: {
    greeting: "Hi, I’m the FinLit Assistant. I can help you explore our services, portfolio information, and ways to get in touch.",
    prompt: "How can I help you today?",
    options: [
      { label: "Explore Services", action: menu("services") },
      { label: "Portfolio Review", action: menu("portfolio-review") },
      { label: "Global Investing", action: menu("global-investing") },
      { label: "Performance", action: menu("performance") },
      { label: "About FinLit", action: menu("about") },
      { label: "Pricing & Consultation", action: menu("pricing") },
      { label: "Contact the Team", action: menu("contact") },
    ],
  },
  services: {
    answer: "FinLit Ventures offers structured investing and financial planning services designed around different stages of an investor’s journey.",
    backLabel: "Back to Main Menu",
    options: [
      { label: "0→1 Investing", action: menu("zero-to-one") },
      { label: "Wealth Planning", action: menu("wealth-planning") },
      { label: "Family Financial Planning", action: menu("family-planning") },
      { label: "Global Investing", action: menu("global-service") },
      { label: "Portfolio Review & Stock Selection", action: menu("portfolio-service") },
    ],
  },
  "zero-to-one": {
    answer: "0→1 Investing is designed for individuals who want to start investing with greater clarity and structure. The focus is on understanding goals, risk profile, capital allocation, and building a disciplined investment approach.",
    backLabel: "Back to Services",
    options: [{ label: "View Services", action: navigate("/services") }, { label: "Enquire About This Service", action: enquire("0 → 1 Investing") }],
  },
  "wealth-planning": {
    answer: "Wealth Planning focuses on aligning investments with long-term financial goals, capital requirements, risk preferences, and overall portfolio structure.",
    backLabel: "Back to Services",
    options: [{ label: "View Services", action: navigate("/services") }, { label: "Enquire", action: enquire("Wealth Planning") }],
  },
  "family-planning": {
    answer: "Family Financial Planning helps structure financial decisions across family goals such as wealth creation, major expenses, long-term planning, and portfolio organization.",
    backLabel: "Back to Services",
    options: [{ label: "View Services", action: navigate("/services") }, { label: "Enquire", action: enquire("Family Financial Planning") }],
  },
  "global-investing": {
    answer: "Global Investing helps investors understand opportunities beyond domestic markets and evaluate international exposure as part of a broader portfolio strategy.",
    backLabel: "Back to Main Menu",
    options: [{ label: "View Global Investing Service", action: navigate("/services") }, { label: "Enquire", action: enquire("Global Investing") }],
  },
  "global-service": {
    answer: "Global Investing helps investors understand opportunities beyond domestic markets and evaluate international exposure as part of a broader portfolio strategy.",
    backLabel: "Back to Services",
    options: [{ label: "View Global Investing Service", action: navigate("/services") }, { label: "Enquire", action: enquire("Global Investing") }],
  },
  "portfolio-service": {
    answer: "Portfolio Review & Stock Selection focuses on reviewing an existing portfolio, understanding its composition, identifying areas that may require attention, and supporting research-driven investment decision making.",
    backLabel: "Back to Services",
    options: [{ label: "View Portfolio", action: navigate("/portfolio") }, { label: "Enquire About Portfolio Review", action: enquire("Portfolio Review & Stock Selection") }],
  },
  "portfolio-review": {
    answer: "FinLit can help review an existing portfolio from a structured research and portfolio-construction perspective. The review may cover portfolio composition, concentration, allocation, and areas requiring deeper analysis.",
    backLabel: "Back to Main Menu",
    options: [{ label: "View Portfolio", action: navigate("/portfolio") }, { label: "Explore Portfolio Review Service", action: menu("portfolio-service") }, { label: "Enquire", action: enquire("Portfolio Review & Stock Selection") }],
  },
  performance: {
    answer: "You can review FinLit’s latest reported portfolio performance, realised P&L, ROI, win rate, holding period, realised trades, and supporting portfolio analytics on the Portfolio page.",
    backLabel: "Back to Main Menu",
    options: [{ label: "View Performance", action: navigate("/portfolio") }, { label: "View Full Portfolio", action: navigate("/portfolio") }],
  },
  about: {
    answer: "FinLit Ventures focuses on investment research, portfolio reviews, financial planning, and structured discussions around Indian equities, mutual funds, ETFs, and global investing.\n\nFounded by Nishant Jain — IIT Kanpur, CFA Level I Cleared, and NISM Certified Research Analyst.",
    backLabel: "Back to Main Menu",
    options: [{ label: "About FinLit", action: navigate("/about") }, { label: "Meet the Founder", action: navigate("/about") }],
  },
  pricing: {
    answer: `FinLit’s published engagement options start with ${PRICING[0].plan} at ${PRICING[0].price}. The services page lists the current options and prices.`,
    backLabel: "Back to Main Menu",
    options: [{ label: "View Services & Pricing", action: navigate("/services") }, { label: "Enquire", action: enquire() }],
  },
  contact: {
    answer: "You can reach the FinLit team through the website contact form. Share the service you’re interested in and the team can follow up with you.",
    backLabel: "Back to Main Menu",
    options: [{ label: "Open Contact Form", action: navigate("/contact") }, { label: "Explore Services", action: menu("services") }],
  },
};
