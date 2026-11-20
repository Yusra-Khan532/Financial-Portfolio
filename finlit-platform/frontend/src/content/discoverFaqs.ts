import type { PageFaq } from "./pageFaqs";

/** Discover's seven questions (task #260, the 20 Nov pack 04_Discover SPEC §15), with the page's answers word for word. The Sector Rotation answer names
 *  no date here: each reading on the page carries its own date (SHARED §3). */
export const DISCOVER_FAQ: PageFaq = {
  id: "discover", title: "Discover", section: "Research", routes: ["/discover", "/discover/:a", "/discover/:a/:b", "/discover/:a/:b/:c"],
  items: [
    { q: "How is a company placed in a theme?", a: "FinLit reads each company’s newest investor presentation and matches it against its keyword directory. A company sits in the theme its presentation talks about most; other themes it mentions are listed as “also mentions”. Companies with no presentation yet, or whose presentation names no theme, are not on this page." },
    { q: "What does the stage mean?", a: "The most advanced step the company’s own presentation describes for that theme: Operating (it already earns from it), Under execution (being built), Planned, MoU / pilot, or Not stated. It is what the company says, so check the figures in the document." },
    { q: "What are macro sectors, sectors and industries?", a: "NSE’s classification of every listed company, broad to narrow: 12 macro sectors, 22 sectors and 59 industries. Each industry sits in one sector and each sector in one macro sector. Discover groups companies at any of the three levels." },
    { q: "What do Sector Rotation and Sector Pulse show here?", a: "For the company’s industry: its Sector Rotation box against the average industry (Ahead and gaining, Ahead but slowing, Behind but gaining, Behind and slipping) and its rank, and its Sector Pulse reading (Rising together, Bouncing back, Bouncing back after a crash, Losing steam, Sold off, No clear signal). Each reading shows its date beside it, with a red “days old” tag when it is more than a week old." },
    { q: "How are company sizes set?", a: "By market value at the last close, the same on every FinLit page: Large above ₹75,000 Cr, Mid ₹25,000 to ₹75,000 Cr, Small ₹10,000 to ₹25,000 Cr, Micro below ₹10,000 Cr." },
    { q: "Why is there no quote for some companies?", a: "A sentence is quoted only when it names the theme. When the presentation’s text that FinLit kept does not, Discover shows the words that placed the company instead of an unrelated sentence." },
    { q: "Does Discover tell me what to buy?", a: "No. It shows what companies say about themselves, their recent filings and FinLit’s readings. A theme word or a filing by itself is not proof of material business; check the figures, orders, capacity and status in the company’s documents. This is information, not a recommendation. Information only, not investment advice." },
  ],
};
