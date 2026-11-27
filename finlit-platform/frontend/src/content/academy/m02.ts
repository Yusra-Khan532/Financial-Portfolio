// F&O Academy, module 2: futures. Lot sizes, prices and margins in the examples are illustrative.
import { SRC } from "./sources";
import { CHECK, type Module } from "./types";

export const M2: Module = {
  n: 2, id: "futures", title: "Futures", line: "Lot size, margin, mark-to-market, expiry, rollover and basis.",
  lessons: [
    {
      id: "futures-contract", title: "A futures contract, step by step", summary: "Two sides agree a price today for an exchange at expiry; the long side gains when the price rises, the short side when it falls.",
      body: [
        { p: "A futures contract fixes today the price at which the underlying will be exchanged on the expiry date. The side that gains when the price rises is long; the side that gains when it falls is short. The buyer of a future is long; the seller is short." },
        { p: "Every term is standardised by the exchange: the underlying, the lot size, the expiry date and how it is settled. Only the price is agreed in the market. Neither side pays a premium: both put up margin." },
        { formula: "P&L of a long position = (exit price − entry price) × lot size × number of lots", what: "For a short position the sign is reversed: (entry − exit) × lot size × lots. Costs and taxes come on top (module 8)." },
        { p: "Either side can close the position before expiry with an opposite trade at the market price. Most futures positions are closed or rolled before expiry." },
      ],
      example: { title: "A stock future, long and short", steps: [
        "A stock future trades at ₹1,200 with an illustrative lot size of 500 shares.",
        "A long position of one lot is opened at ₹1,200 and closed at ₹1,236: (1,236 − 1,200) × 500 = ₹18,000 gain.",
        "Had it been closed at ₹1,170 instead: (1,170 − 1,200) × 500 = −₹15,000, a loss.",
        "A short position from ₹1,200 has the opposite results: −₹18,000 at ₹1,236 and +₹15,000 at ₹1,170.",
      ], result: "Each rupee of price change is worth ₹500 a lot, to one side or the other." },
      quiz: [
        { q: "What does the buyer of a futures contract gain from?", options: [
          { text: "A fall in the price", why: "A fall is a gain for the short side, the seller." },
          { text: "A rise in the price", correct: true, why: "Right: the buyer is long and gains as the price rises." },
          { text: "Time passing, whatever the price does", why: "Futures have no time value; only price changes move the result." },
        ] },
        { q: "Which part of a futures contract is agreed in the market rather than set by the exchange?", options: [
          { text: "The price", correct: true, why: "Right: the exchange sets the lot size, expiry and settlement; the price comes from trading." },
          { text: "The lot size", why: "The exchange sets the lot size." },
          { text: "The expiry date", why: "The exchange sets the expiry dates." },
        ] },
        { q: "A short position of one lot (500 shares) is opened at ₹1,200 and closed at ₹1,180. What is the result before costs?", options: [
          { text: "A loss of ₹10,000", why: "A fall in price is a gain for the short side." },
          { text: "A gain of ₹20", why: "₹20 is the change per share; the contract is 500 shares." },
          { text: "A gain of ₹10,000", correct: true, why: "Right: (1,200 − 1,180) × 500 = ₹10,000." },
        ] },
      ],
    },
    {
      id: "lot-size-contract-value", title: "Lot size and contract value", summary: "One contract is one lot; the exchange sets lot sizes so that a contract's value stays within the range SEBI sets.",
      body: [
        { p: "F&O trades only in whole lots. The lot size is the number of units in one contract, set by the exchange for each underlying." },
        { formula: "Contract value = price × lot size", what: "For an option, the same formula uses the underlying's price for the exposure and the premium for the amount paid." },
        { p: "SEBI's circular of 1 October 2024 raised the minimum value of an index derivatives contract to ₹15 lakh when it is introduced, with lot sizes set so the value stays between ₹15 lakh and ₹20 lakh when reviewed. SEBI's July 2025 note records that NSE applied the larger contract sizes from 2 January 2025." },
        { p: "Exchanges review lot sizes from time to time as prices change, and announce the new sizes in a circular. The lot sizes in these lessons are illustrative." },
        { note: CHECK },
      ],
      example: { title: "Contract values at two prices", steps: [
        "An index future at 24,500 with an illustrative lot size of 65: 24,500 × 65 = ₹15,92,500.",
        "A stock future at ₹1,200 with an illustrative lot size of 500: 1,200 × 500 = ₹6,00,000.",
        "If the index rose to 31,000 with the same lot size: 31,000 × 65 = ₹20,15,000, above ₹20 lakh, which is when a smaller lot size would come up at the next review.",
      ], result: "The lot size turns a price into a rupee exposure; one point on the index future is worth ₹65." },
      quiz: [
        { q: "What is the contract value of one lot of 75 units at a price of 22,000?", options: [
          { text: "₹22,000", why: "That is the price of one unit; a lot has 75 units." },
          { text: "₹16,50,000", correct: true, why: "Right: 22,000 × 75 = ₹16,50,000." },
          { text: "₹2,93,333", why: "That divides instead of multiplying." },
        ] },
        { q: "What minimum contract value did SEBI set for index derivatives at introduction, as announced on 1 October 2024?", options: [
          { text: "₹5 lakh", why: "₹5 lakh was the older minimum the measures replaced." },
          { text: "₹1 crore", why: "No such minimum was set." },
          { text: "₹15 lakh", correct: true, why: "Right: ₹15 lakh at introduction, kept between ₹15 lakh and ₹20 lakh at reviews." },
        ] },
        { q: "Who sets the lot size of an NSE contract?", options: [
          { text: "The exchange, within SEBI's rules", correct: true, why: "Right: NSE announces lot sizes, and their revisions, by circular." },
          { text: "Each broker for its own clients", why: "Brokers cannot change a contract's lot size." },
          { text: "The two sides of each trade", why: "Only the price is agreed between the sides." },
        ] },
      ],
      sources: [SRC.oct2024, SRC.study2025],
    },
    {
      id: "futures-margin", title: "Margin: SPAN and exposure", summary: "The clearing corporation sets the margin from a risk model; it is collected before the position is opened and changes every day.",
      body: [
        { p: "Before a futures position is opened, the broker collects initial margin. It has two parts. SPAN margin is the largest one-day loss the clearing corporation's risk model finds across a set of price and volatility scenarios. Exposure margin is an extra buffer on top." },
        { p: "Margins are collected upfront, and the clearing corporation checks the margin a broker has collected at several times during the day (SEBI's peak margin rules, phased in during 2020 and 2021). The required margin changes daily with prices and volatility, and exchanges add extra margins when markets are volatile." },
        { note: "The margins in these lessons are illustrative. Current margins come from NSE Clearing's daily files; brokers show them in their margin calculators." },
      ],
      example: { title: "Initial margin on one index futures lot", steps: [
        "Contract value: 24,500 × 65 = ₹15,92,500.",
        "Suppose SPAN margin is 9% of it: ₹1,43,325 (illustrative).",
        "Suppose exposure margin is 2% of it: ₹31,850 (illustrative).",
        "Initial margin = ₹1,43,325 + ₹31,850 = ₹1,75,175.",
      ], result: "About ₹1.75 lakh opens an exposure of about ₹15.9 lakh: roughly nine times the money put up." },
      quiz: [
        { q: "What does SPAN margin measure?", options: [
          { text: "The brokerage charged on the trade", why: "Brokerage is a cost, not a margin." },
          { text: "The largest one-day loss the clearing corporation's model finds across its scenarios", correct: true, why: "Right: SPAN scans price and volatility scenarios for the worst one-day loss." },
          { text: "The profit the exchange expects on the contract", why: "Margins cover possible losses; they say nothing about profit." },
        ] },
        { q: "When is initial margin collected?", options: [
          { text: "Before the position is opened", correct: true, why: "Right: margins are collected upfront." },
          { text: "Only at expiry", why: "Margin is needed from the moment the position is opened." },
          { text: "Only if the position makes a loss", why: "It is collected whether or not the position later loses." },
        ] },
        { q: "With SPAN at ₹1,43,325 and exposure margin at ₹31,850, what is the initial margin?", options: [
          { text: "₹1,11,475", why: "That subtracts the two parts; they are added." },
          { text: "₹31,850", why: "That is only the exposure part." },
          { text: "₹1,75,175", correct: true, why: "Right: ₹1,43,325 + ₹31,850 = ₹1,75,175." },
        ] },
      ],
    },
    {
      id: "mark-to-market", title: "Mark-to-market: settled every day", summary: "Each day's gain or loss is paid in cash at the daily settlement price, not only when the position closes.",
      body: [
        { p: "Futures gains and losses are settled every trading day. At the close, NSE Clearing sets a daily settlement price for each contract (for futures, the volume-weighted average price of the last half hour of trading). The day's change against the previous settlement price is paid to one side and collected from the other, in cash." },
        { p: "This is mark-to-market (MTM). A position that loses money on a day must have that loss paid the same day, even if the price later comes back. The total of all the daily amounts equals the final result of the trade." },
        { formula: "Day's MTM of a long position = (today's settlement price − yesterday's settlement price) × lot size × lots", what: "On the first day the entry price takes the place of yesterday's settlement price; on the last day the exit price takes the place of today's." },
      ],
      example: { title: "Three days of a long index futures lot", steps: [
        "Long one lot at 24,500 (lot size 65, illustrative).",
        "Day 1 settles at 24,620: +120 × 65 = +₹7,800 credited.",
        "Day 2 settles at 24,410: −210 × 65 = −₹13,650 debited the same day.",
        "Day 3 the position is closed at 24,450: +40 × 65 = +₹2,600.",
        "Total: 7,800 − 13,650 + 2,600 = −₹3,250, the same as (24,450 − 24,500) × 65.",
      ], result: "The trade lost ₹3,250 in all, but on day 2 alone ₹13,650 had to be paid in cash." },
      quiz: [
        { q: "What happens to a futures position's loss on a day the price falls?", options: [
          { text: "It is paid in cash that day", correct: true, why: "Right: losses and gains are settled daily." },
          { text: "It waits until the position is closed", why: "Futures settle daily, not only at the close of the position." },
          { text: "It is forgiven if the price comes back within a week", why: "Each day's loss is settled whatever happens later." },
        ] },
        { q: "In the example, why does the total equal (24,450 − 24,500) × 65?", options: [
          { text: "Because day 2's loss is not counted", why: "Every day counts; the daily amounts add up to the whole move." },
          { text: "Because the daily changes add up to the change from entry to exit", correct: true, why: "Right: the settlement prices in between cancel out." },
          { text: "Because the exchange rounds the result", why: "There is no rounding of that kind." },
        ] },
        { q: "A short position of one lot (65) is opened at 24,000 and the day settles at 23,900. What is the day's MTM?", options: [
          { text: "+₹6,500", correct: true, why: "Right: the price fell 100 points, a gain for the short side: 100 × 65." },
          { text: "−₹6,500", why: "A fall in price is a gain for the short side." },
          { text: "₹0, as MTM applies only to long positions", why: "Both sides are marked to market." },
        ] },
      ],
    },
    {
      id: "futures-expiry-settlement", title: "Expiry and settlement", summary: "Index futures end in cash at the final settlement price; stock futures end in delivery of the shares.",
      body: [
        { p: "A futures position still open at the close of expiry day is settled. Index futures are settled in cash at the final settlement price, which is the closing value of the index on expiry day." },
        { p: "Stock futures are settled by delivery. The long side pays the final settlement price for the shares and receives them; the short side delivers the shares and receives the money. Because delivery needs the full value, exchanges collect extra delivery margins on such positions in the days before expiry." },
        { note: CHECK },
      ],
      example: { title: "A stock future kept open to expiry", steps: [
        "Long one lot of a stock future at ₹1,200, illustrative lot 500.",
        "The final settlement price on expiry day is ₹1,250; the daily MTM has already paid the ₹25,000 gain ((1,250 − 1,200) × 500).",
        "Physical settlement: the long side pays 1,250 × 500 = ₹6,25,000 and receives 500 shares.",
      ], result: "A position kept open into expiry turns into a share delivery worth the full contract value, not only the margin." },
      quiz: [
        { q: "How is an open Nifty 50 futures position settled at expiry?", options: [
          { text: "The long side receives the 50 shares of the index", why: "Index contracts cannot be delivered; they are settled in cash." },
          { text: "In cash, at the final settlement price", correct: true, why: "Right: index futures are cash settled at the index's closing value on expiry day." },
          { text: "It continues into the next month", why: "Nothing carries over by itself; the contract ends at expiry." },
        ] },
        { q: "In the example, how much must the long side pay at settlement?", options: [
          { text: "₹25,000", why: "That is the MTM gain already settled; delivery needs the full value." },
          { text: "₹6,00,000", why: "That uses the entry price; delivery is at the final settlement price." },
          { text: "₹6,25,000", correct: true, why: "Right: 1,250 × 500 = ₹6,25,000, and the shares are received." },
        ] },
        { q: "Why do exchanges raise margins on stock futures positions close to expiry?", options: [
          { text: "Because the position may turn into a delivery of the full contract value", correct: true, why: "Right: delivery margins cover the obligation to pay for, or deliver, the shares." },
          { text: "To pay a bonus to the short side", why: "There is no bonus; margins only cover risk." },
          { text: "Because the price is fixed in the last week", why: "Prices keep moving until the close of expiry day." },
        ] },
      ],
    },
    {
      id: "basis-and-rollover", title: "Basis, cost of carry and rollover", summary: "A future usually trades above the spot by about the interest cost less dividends; rolling over moves a position to the next month.",
      body: [
        { p: "Basis is the gap between the futures price and the spot price of the underlying. A future usually trades above the spot (a premium), because owning the underlying until expiry costs interest, offset by any dividends received. A future can also trade below the spot (a discount), for example when a large dividend is due." },
        { formula: "Fair futures price ≈ spot × e^((r − q) × days ÷ 365)", what: "r is the interest rate and q the dividend yield, both a year. The gap shrinks to zero as expiry comes closer." },
        { p: "Rolling over means closing the current month's position and opening the same position in the next month. The difference between the two months' prices (the rollover spread) is part of the new entry level, and each of the two trades has its own costs." },
      ],
      example: { title: "Fair value and a rollover", steps: [
        "Spot index 24,000; interest rate 6.5% a year; dividend yield 1.2% a year; 30 days to expiry.",
        "(r − q) × days ÷ 365 = 0.053 × 30 ÷ 365 ≈ 0.004356; e^0.004356 ≈ 1.004366.",
        "Fair futures price ≈ 24,000 × 1.004366 ≈ 24,104.8, a basis of about 105 points.",
        "Near expiry, the current month trades at 24,040 and the next month at 24,180: a rollover spread of 140 points, which is 140 × 65 = ₹9,100 a lot (illustrative lot).",
      ], result: "The basis reflects carrying costs, not a view on the market; rolling a long position moves its entry 140 points higher in this example." },
      quiz: [
        { q: "What is the basis?", options: [
          { text: "The futures price minus the spot price", correct: true, why: "Right: basis is the gap between the future and the underlying." },
          { text: "The margin divided by the contract value", why: "That is a margin percentage." },
          { text: "The brokerage on a futures trade", why: "Brokerage is a cost, not the basis." },
        ] },
        { q: "Why does a future usually trade above the spot?", options: [
          { text: "Because the market expects the price to rise", why: "The premium comes mainly from carrying costs (interest less dividends), not from expectations." },
          { text: "Because owning the underlying until expiry costs interest, offset by dividends", correct: true, why: "Right: that is the cost of carry." },
          { text: "Because the exchange adds a fixed premium", why: "The exchange adds nothing to the price." },
        ] },
        { q: "What happens to the basis as expiry comes closer?", options: [
          { text: "It grows larger", why: "Fewer days of carry are left, so the gap gets smaller." },
          { text: "It shrinks towards zero", correct: true, why: "Right: at expiry the future settles at the spot's closing value." },
          { text: "It stays fixed from the first day", why: "It changes with rates, dividends and the days left." },
        ] },
      ],
    },
  ],
};
