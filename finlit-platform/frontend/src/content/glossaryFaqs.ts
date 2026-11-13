import type { PageFaq } from "./pageFaqs";

/** "Questions about this page" of the Glossary, as the "FinLit final pages" pack lists them (board 02, 13 Nov 2026): eight questions in the pack's order.
 *  The pack gives the first answer; the others describe this page and the glossary's November update (board 03). Describes, never advises. */
export const GLOSSARY_FAQ: PageFaq = {
  id: "glossary", title: "Glossary", section: "Learn", routes: ["/glossary", "/glossary/:id"],
  items: [
    { q: "How do I find a term?", a: "Type in the search box (Ctrl K), pick a letter from A to Z, or choose a topic on the left. Select a term to open its full entry." },
    { q: "What do the four parts of each term mean?", a: "Meaning says what the term is. Why it matters says why investors look at it. How to use it gives a practical way to read it. How FinLit measures it says where FinLit works the figure out in its own way. A formula is added where there is a standard one." },
    { q: "Why do some terms say \"How FinLit measures it\"?", a: "Where a FinLit page works a figure out in its own way, for example from the data it receives or over a different period, the entry says so, so the number on the page can be checked. It says what is measured, not how a score is weighted." },
    { q: "What are FinLit words?", a: "The terms behind FinLit's own scores, labels and pages, such as the FinLit IQ, FinLit Prism, the Leader label, Company size and the industry states. Select FinLit words above the list to see them together." },
    { q: "What changed in the latest update?", a: "Seven new terms used on the new pages, five renamed in plain words, two rewritten, and 28 entries that no longer show how FinLit works out its scores (weights, cut-offs, points and look-back lengths). Select New and updated to see all of them; each carries a New or Updated mark." },
    { q: "Why were some names changed?", a: "So the glossary uses the same plain words as the pages: Washout, Thrust, Confirmed and Fading became Sold off, Bouncing back, Rising together and Losing steam, and the Leader flag became Standout, so it is not confused with the Leader label." },
    { q: "What does Company size mean on FinLit?", a: "FinLit uses three sizes everywhere, by market value: Large above ₹50,000 crore, Mid from ₹10,000 crore to ₹50,000 crore, and Small below ₹10,000 crore. Mega, micro and nano are no longer used. A mutual fund's category can differ, because SEBI ranks companies instead." },
    { q: "Does the glossary give investment advice?", a: "No. Definitions are for education only; they are not investment, tax or legal advice. Rules and limits quoted, such as tax rates and IPO quotas, can change, so check the latest SEBI and tax rules." },
  ],
};
