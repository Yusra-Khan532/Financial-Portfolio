import type { PageFaq } from "./pageFaqs";

export const MF_PORTFOLIO_FAQ: PageFaq = {
  id: "mf-portfolio", title: "MF portfolio", section: "Your workspace", routes: ["/mf-portfolio"], plan: "Silver (FundPulse: Gold)",
  items: [
    { q: "How does FinLit see inside my funds?", a: "Each fund house publishes its holdings once a month. FinLit reads those files, adds up the stocks across your funds and describes how much they overlap and how they are spread. Holdings can have changed since the file was published, and a fund whose file is not loaded yet is named and left out. Information only, not investment advice." },
    { q: "How do I add my mutual funds?", a: "Search a fund by name and select Add fund, or choose a file: Excel (.xlsx, .xls) or CSV, including consolidated-statement exports from CAMS, KFintech and broker apps. Company shares in the file are ignored. You do not need to enter units or amounts: the page lists the funds with their latest NAV, returns and FundPulse." },
    { q: "How are the rows of a file matched to funds?", a: "By AMFI code, then ISIN, then the exact fund name with its plan and option, then a close name. A row that has an ISIN is matched by it; if AMFI's list does not have that ISIN, the fund's name is only suggested, never matched on its own. A close name is only ever suggested: every row is shown as matched, needs choosing or not found, and nothing unmatched is imported." },
    { q: "What does FundPulse show here?", a: "The FinLit FundPulse with its four parts (Performance, Risk, Cost, Quality). It is part of the Gold plan; other plans still see the NAV and returns. It describes the fund's health from its past NAVs, costs and holdings; it is not a recommendation." },
    { q: "Why are the 1, 3 and 5 year returns blank for some funds?", a: "When you add a fund, its returns are worked out at once from its published NAV history, so they normally appear within a minute (the page checks again by itself). They stay blank only when the fund is younger than the period: a fund under a year old has no 1 year return, and one under 3 or 5 years has no 3 or 5 year return." },
    { q: "How do the groups and the pie chart work?", a: "Pick a group (Equity, Hybrid, Debt, Solution oriented, Others or All funds). They sit under Mix & overlap. The pie chart shows the share of your funds in each type, or in each category of the group you picked. The categories and their fund counts are for reading only; Your funds always lists every fund." },
    { q: "What happens when the same fund appears twice?", a: "A fund appears once in your list. A line repeated in a file is counted once, and a fund you already follow is skipped." },
    { q: "How many funds can I add?", a: "The page shows your count against your plan's limit, for example 3 of 30 on Silver and 500 on Gold." },
    { q: "Can I export my list?", a: "No. The portfolio pages have no download (team decision, 15 Nov 2026); your list stays in your account." },
    { q: "Why does a liquid fund pull the risk figures down?", a: "Until you add units, every fund counts the same, so a liquid fund is a full share of the list. It barely moves, so the list's swing, worst fall and beta come out lower than for the other funds alone. The page shows the list's beta with and without the liquid fund. Information only, not investment advice." },
  ],
};
