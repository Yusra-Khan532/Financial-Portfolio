// Hand-written set for /holdings (the new Equity portfolio page): the six questions of the design. It takes the place of the PDF-built set for this route
// (lib/pageFaqs.ts lists hand-written sets first). Descriptive only; information, not investment advice.
import type { PageFaq } from "./pageFaqs";

export const MY_PORTFOLIO_FAQ: PageFaq = {
  id: "my-portfolio", title: "Equity portfolio", section: "Your workspace", routes: ["/holdings"],
  items: [
    { q: "Why does FinLit not ask for quantities?", a: "The page describes how your shares are made up and how they behave together. Quantities are optional: add them when you want the figures to follow your money." },
    { q: "What is the portfolio score?", a: "One number from 0 to 100 for the whole list. It brings together the readings in the tiles beside it: how strong the shares are on FinLit IQ (FinLit Prism on Gold), how spread out the list is, how risky it is, the price trend, the valuation and how much sits in the largest holdings. The optional choices under Make the score yours change how much each reading counts. It follows your money, so it needs the quantities you own; until they are in, it shows a dash." },
    { q: "How is diversification worked out?", a: "It looks at two things: how closely the shares in your list move together, from a year of weekly prices, and how widely the list is spread across sectors. They combine into one score from 0 to 100. The score describes how spread out the list is, not how safe it is." },
    { q: "What does \"moves like\" mean?", a: "Shares that rise and fall together count as one bet. \"Moves like 6.5 of 13\" means the 13 shares have behaved like about 6.5 shares that move independently. The closer the two numbers, the more each share adds its own movement to the list." },
    { q: "How is the risk against the index worked out?", a: "From the list's weekly price changes over the last year, as if equal amounts were held, set against the Nifty 50's. Beta is how much the list has tended to move when the index moved 1%. The typical swing is how much it has risen and fallen in a year. Both describe the past, not what comes next." },
    { q: "Is anything sent to my broker?", a: "No. FinLit never connects to a broker or places orders. The names you add stay in this browser; on Silver and Gold they are also saved to your FinLit account so they follow you to other devices. A broker file you upload is read on your device for the share names only; the file itself never leaves it." },
  ],
};
