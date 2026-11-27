// F&O Academy, module 1: what derivatives are. Lot sizes and prices in the examples are illustrative.
import { SRC } from "./sources";
import { CHECK, type Module } from "./types";

export const M1: Module = {
  n: 1, id: "derivatives", title: "What derivatives are", line: "Contracts that take their value from something else, who uses them, and how NSE's F&O market is organised.",
  lessons: [
    {
      id: "what-is-a-derivative", title: "What a derivative is", summary: "A contract whose value comes from an underlying: a share, an index, a currency or a commodity.",
      body: [
        { p: "A derivative is a contract whose value comes from something else, called the underlying. The underlying can be a share, an index such as the Nifty 50, a currency, an interest rate or a commodity. The contract has no value of its own: it changes because the underlying changes." },
        { p: "There are four common kinds. A forward is a private agreement to exchange the underlying at a fixed price on a fixed date. A future is a standardised forward that trades on an exchange. An option gives one side a right, but not a duty, to exchange the underlying at a fixed price. A swap exchanges one stream of payments for another, mostly between banks and companies." },
        { p: "On NSE's equity derivatives segment, individuals meet two of these: futures and options on indices and on selected shares. Together they are called F&O." },
        { terms: [["Underlying", "The share or index the contract is written on."], ["Expiry", "The last day of the contract. After it, the contract is settled and ends."], ["Contract value", "The underlying's price multiplied by the number of units in one contract (the lot size)."]] },
      ],
      example: { title: "A Nifty 50 futures contract moving with the index", steps: [
        "The Nifty 50 index is at 24,000 and this month's Nifty futures contract trades at 24,080.",
        "The index rises 1% to 24,240. The futures price moves with it, to about 24,320: a change of about 240 points.",
        "One contract is one lot. With an illustrative lot size of 65 units, each point is worth ₹65.",
        "The contract's value changes by 240 × 65 = ₹15,600.",
      ], result: "The long side of the contract gains about ₹15,600 and the short side loses the same amount, only because the index moved." },
      quiz: [
        { q: "Where does a derivative's value come from?", options: [
          { text: "From the underlying it is linked to", correct: true, why: "Right: a derivative's price follows its underlying, such as a share or an index." },
          { text: "From the company that issues the contract", why: "Exchange-traded F&O contracts are not issued by a company: they are agreements between two sides, cleared by a clearing corporation." },
          { text: "From a fixed interest rate set by the exchange", why: "An equity future or option takes its value from a share or an index, not from a rate the exchange sets." },
        ] },
        { q: "Which of these trade on NSE's equity derivatives segment?", options: [
          { text: "Private forward agreements between two companies", why: "Forwards are private (over-the-counter) agreements; they do not trade on the exchange." },
          { text: "Futures and options on indices and selected shares", correct: true, why: "Right: NSE's equity F&O segment lists index and stock futures and options." },
          { text: "Interest-rate swaps between banks", why: "Swaps are mostly agreed directly between institutions, not traded by individuals on NSE's equity segment." },
        ] },
        { q: "In the example, why did the contract's value change by about ₹15,600?", options: [
          { text: "The contract has a fixed value of ₹15,600", why: "A futures contract has no fixed value; it changes every time the price changes." },
          { text: "The exchange added a bonus for the day", why: "Exchanges pay no bonus; one side's gain is the other side's loss." },
          { text: "The price moved about 240 points and each point is worth one lot of 65 units", correct: true, why: "Right: points moved × lot size = 240 × 65 = ₹15,600." },
        ] },
      ],
    },
    {
      id: "why-derivatives-exist", title: "Why derivatives exist", summary: "Moving risk from those who do not want it to those willing to carry it; hedgers, speculators and arbitrageurs.",
      body: [
        { p: "Derivatives let risk change hands. Someone who already carries a risk, such as a fund that owns shares, can offset part of it with a derivative. Someone else takes the other side, accepting that risk in exchange for a possible gain." },
        { list: [
          "Hedgers already have an exposure and use derivatives to offset it, for example a short futures position against a portfolio of shares.",
          "Speculators have no exposure to offset; they take one on, hoping to gain from a price change, and accept the chance of a loss.",
          "Arbitrageurs look for price gaps between two markets, such as a share and its future, and trade both sides to capture the gap.",
        ] },
        { p: "Futures and options markets also help price discovery: their prices show what participants together are paying today for exposure at a future date." },
        { note: "A hedge also gives up gains: if prices rise, the short futures position loses what the shares gain." },
      ],
      example: { title: "A portfolio offset with one Nifty futures lot", steps: [
        "An investor's share portfolio is worth ₹15,60,000 and moves closely with the Nifty 50.",
        "The Nifty future is at 24,000. With an illustrative lot size of 65, one lot's contract value is 24,000 × 65 = ₹15,60,000.",
        "The investor takes a short position of one lot.",
        "The index falls 5% to 22,800. The portfolio loses about ₹78,000; the short future gains (24,000 − 22,800) × 65 = ₹78,000.",
      ], result: "The two roughly offset. Had the index risen 5%, the portfolio's gain would have been offset by the future's loss in the same way." },
      quiz: [
        { q: "Who is a hedger?", options: [
          { text: "Someone who uses a derivative to offset a risk they already carry", correct: true, why: "Right: a hedger starts with an exposure and uses the derivative against it." },
          { text: "Someone who takes on a new risk in search of a gain", why: "That describes a speculator, who has no exposure to offset." },
          { text: "Someone who trades two markets to capture a price gap", why: "That describes an arbitrageur." },
        ] },
        { q: "In the example, what happens if the index rises 5% instead?", options: [
          { text: "Both the portfolio and the short future gain", why: "A short future loses when the price rises, so they cannot both gain." },
          { text: "The portfolio gains about ₹78,000 and the short future loses about ₹78,000", correct: true, why: "Right: a hedge works both ways, so it also gives up the gain." },
          { text: "Nothing changes, because the hedge freezes the portfolio's value", why: "The portfolio's value still changes; the future's opposite change offsets it." },
        ] },
        { q: "What is price discovery?", options: [
          { text: "The exchange announcing tomorrow's price", why: "No exchange announces future prices; they come from trading." },
          { text: "A regulator fixing the fair value of an index", why: "Regulators do not fix market prices." },
          { text: "Trading revealing what participants pay today for exposure at a later date", correct: true, why: "Right: the traded price shows the market's current price for that later exposure." },
        ] },
      ],
    },
    {
      id: "exchange-and-clearing", title: "Exchanges, clearing and the other side", summary: "NSE Clearing stands between both sides; F&O is zero-sum before costs and negative-sum after them.",
      body: [
        { p: "Every F&O trade on NSE is cleared by NSE Clearing Limited, a clearing corporation. Through novation it becomes the counterparty to both sides, so neither side depends on the other paying up." },
        { p: "To protect itself, the clearing corporation collects margins before positions are opened, settles gains and losses every day, and keeps a settlement guarantee fund. Brokers (trading and clearing members) stand between their clients and the exchange." },
        { p: "For every long position there is a short position. Before costs, one side's gain is exactly the other side's loss: F&O is zero-sum. After brokerage, taxes and exchange charges, the total across everyone is negative." },
        { terms: [["Novation", "The clearing corporation replaces the original contract between two traders with two contracts, one with each of them."], ["Counterparty", "The other side of a contract."], ["Zero-sum", "Gains and losses of all sides add up to zero (before costs)."]] },
      ],
      example: { title: "Two sides of one futures lot", steps: [
        "Trader A takes a long position of one Nifty futures lot at 24,000; trader B takes the short position. Lot size 65 (illustrative).",
        "At the day's end the futures settle at 24,100: a rise of 100 points.",
        "A gains 100 × 65 = ₹6,500; B loses ₹6,500.",
        "NSE Clearing collects ₹6,500 through B's broker and pays it through A's broker.",
      ], result: "Together, A and B are at zero before costs; after each pays brokerage, taxes and charges, they are below zero together." },
      quiz: [
        { q: "What does novation by the clearing corporation mean for a trader?", options: [
          { text: "The trader's contract is with the clearing corporation, not the other trader", correct: true, why: "Right: the clearing corporation becomes the counterparty to both sides." },
          { text: "The trader can cancel the contract at any time without loss", why: "Novation changes who the counterparty is; it does not remove gains or losses." },
          { text: "The clearing corporation promises the trader a profit", why: "The clearing corporation makes sure obligations are met; it promises no profit." },
        ] },
        { q: "Why is F&O negative-sum after costs?", options: [
          { text: "The exchange keeps every profit", why: "Profits are paid to the winning side; the exchange earns charges, not profits." },
          { text: "Gains and losses cancel out, and every side also pays costs", correct: true, why: "Right: the zero-sum result before costs becomes negative once brokerage, taxes and charges are paid." },
          { text: "Options always expire worthless", why: "Some options expire with value; the negative sum comes from costs." },
        ] },
        { q: "In the example, what does trader B pay if the futures settle at 23,950 instead?", options: [
          { text: "B pays ₹3,250", why: "At 23,950 the price fell, which is a gain for the short side B." },
          { text: "B pays nothing and receives nothing", why: "A 50-point move does change both sides' results." },
          { text: "B receives 50 × 65 = ₹3,250 and A pays it", correct: true, why: "Right: the price fell 50 points from 24,000, which is a gain for the short side." },
        ] },
      ],
    },
    {
      id: "leverage", title: "Leverage: a small margin, a large exposure", summary: "Margin is a fraction of the contract value, so price moves are magnified against the money put up.",
      body: [
        { p: "To open a futures position, or to write an option, a trader puts up margin: a deposit that is only a fraction of the contract's value. The gain or loss, however, is on the full contract value. That is leverage." },
        { p: "Leverage magnifies results in both directions. A move of a few percent in the underlying can be a large share of the margin, and a big enough move can lose more than the whole margin." },
        { note: "Margin is not the largest possible loss. Losses beyond the margin must still be paid." },
      ],
      example: { title: "A 2% and a 10% move against one futures lot", steps: [
        "Contract value: 24,000 × 65 (illustrative lot) = ₹15,60,000. Suppose the margin is 12% of it: about ₹1,87,200 (illustrative).",
        "A 2% move is 480 points: 480 × 65 = ₹31,200, which is about 16.7% of the margin.",
        "A 10% move is 2,400 points: 2,400 × 65 = ₹1,56,000, about 83% of the margin.",
      ], result: "The same index move is five to six times larger measured against the margin than against the contract value." },
      quiz: [
        { q: "What is leverage in F&O?", options: [
          { text: "A loan from the exchange at a fixed interest rate", why: "Margin is a deposit, not a loan from the exchange." },
          { text: "Results on the full contract value while putting up only a margin", correct: true, why: "Right: the margin is a fraction of the exposure, so moves are magnified against it." },
          { text: "A rule that limits losses to the margin", why: "Losses can exceed the margin." },
        ] },
        { q: "With a margin of ₹1,87,200 on a contract of ₹15,60,000, a 2% move against the position is about what share of the margin?", options: [
          { text: "2%", why: "2% is the move in the contract value; against the smaller margin it is larger." },
          { text: "About 16.7%", correct: true, why: "Right: 2% of ₹15,60,000 is ₹31,200, and ₹31,200 ÷ ₹1,87,200 ≈ 16.7%." },
          { text: "About 50%", why: "That would need a move of about 6%." },
        ] },
        { q: "Can a futures position lose more than its margin?", options: [
          { text: "No, the margin is the most it can lose", why: "The margin is a deposit; a large move can cost more than it." },
          { text: "Only on expiry day", why: "Large losses can happen on any day the price moves far." },
          { text: "Yes, a large enough move loses more than the margin, and the rest must be paid", correct: true, why: "Right: the loss is on the full contract value." },
        ] },
      ],
    },
    {
      id: "nse-fno-at-a-glance", title: "NSE F&O at a glance", summary: "Index and stock contracts, expiry days, trading hours and how each kind is settled.",
      body: [
        { p: "NSE lists futures and options on a few indices, such as the Nifty 50 and Nifty Bank, and on shares that meet SEBI's eligibility rules. The list of shares changes as NSE adds and removes names." },
        { p: "Expiry days: SEBI's circular of 26 May 2025 (SEBI/HO/MRD/MRD-TPD-1/P/CIR/2025/76) asked each exchange to set its equity derivatives expiry on either a Tuesday or a Thursday. NSE chose Tuesday for contracts expiring from 1 September 2025: monthly contracts expire on the last Tuesday of the month. After SEBI's measures of 1 October 2024, each exchange offers weekly expiries on one benchmark index only; on NSE that is the Nifty 50. When an expiry day is a holiday, the contract expires on the trading day before it." },
        { p: "Trading runs from 9:15 to 15:30 IST on trading days. Index futures and options are settled in cash. Stock futures and options are settled by delivery of the shares (physical settlement)." },
        { note: CHECK },
      ],
      example: { title: "Finding a monthly expiry", steps: [
        "Take a month whose last Tuesday is the 24th.",
        "NSE's monthly contracts for that month expire on Tuesday the 24th.",
        "If the 24th is an exchange holiday, they expire on the previous trading day, Monday the 23rd (if that is a trading day).",
        "An index futures lot (65 units, illustrative) still open at the close of expiry is settled in cash: if the final settlement price is 20 points above the previous day's settlement price, the long side receives 20 × 65 = ₹1,300 that day and the contract ends.",
      ], result: "Expiry is a fixed rule (the last Tuesday), moved earlier only for holidays." },
      quiz: [
        { q: "On which weekday do NSE's equity derivatives expire from 1 September 2025, as announced?", options: [
          { text: "Thursday", why: "NSE used Thursday before September 2025; BSE moved to Thursday." },
          { text: "Tuesday", correct: true, why: "Right: NSE chose Tuesday under SEBI's circular of 26 May 2025." },
          { text: "Friday", why: "Neither NSE nor BSE uses Friday for equity derivatives expiry." },
        ] },
        { q: "How are NSE's stock futures and options settled at expiry?", options: [
          { text: "By delivery of the shares", correct: true, why: "Right: stock derivatives are physically settled." },
          { text: "In cash only, like index contracts", why: "Cash settlement applies to index contracts; stock contracts are settled by delivery." },
          { text: "They are rolled over to the next month automatically", why: "Nothing rolls over by itself: an open contract is settled at expiry." },
        ] },
        { q: "After SEBI's measures of 1 October 2024, how many indices may an exchange offer weekly expiries on?", options: [
          { text: "Every index it lists", why: "That was the earlier practice the measures changed." },
          { text: "None: weekly expiries were stopped", why: "Weekly expiries continue, on one benchmark index per exchange." },
          { text: "One benchmark index", correct: true, why: "Right: on NSE that is the Nifty 50." },
        ] },
      ],
      sources: [
        SRC.oct2024,
        { label: "SEBI circular SEBI/HO/MRD/MRD-TPD-1/P/CIR/2025/76, 26 May 2025: expiry days (in SEBI's circulars list)", url: SRC.circulars.url },
      ],
    },
  ],
};
