// F&O Academy, module 9: risk. Every figure from SEBI's studies is quoted from the documents themselves (read on 27 Nov 2026), with the
// study's name, date and link; nothing is estimated. Position sizing is described as arithmetic, not as a size anyone should use.
import { SRC } from "./sources";
import type { Module } from "./types";

export const M9: Module = {
  n: 9, id: "risk", title: "Risk", line: "What SEBI's studies found, position sizing as a concept, margin calls, gap risk and expiry-day risk.",
  lessons: [
    {
      id: "sebi-studies", title: "What SEBI's studies found", summary: "Four SEBI studies of individual traders in equity F&O, FY22 to FY26: most lost money every year.",
      body: [
        { p: "SEBI has studied the profits and losses of individual traders (individuals, HUFs, NRIs and proprietors, through their brokers' records) in equity F&O several times. Each figure below is quoted from the study named, for the years it covers." },
        { list: [
          "September 2024 (press release of 23 September 2024, FY22 to FY24): 93% of individual traders incurred losses in equity F&O between FY22 and FY24, and their aggregate losses exceeded ₹1.8 lakh crore.",
          "July 2025 (\"Comparative study of growth in Equity Derivatives Segment vis-à-vis Cash Market after recent measures\", FY25): nearly 91% of individual traders made net losses in FY25, and their net losses rose 41% to ₹1,05,603 crore, from ₹74,812 crore in FY24 (after transaction costs; about 96 lakh traders at 13 brokers).",
          "August 2026 (\"Profitability of Individual Traders in the Equity Derivatives Segment (FY25–FY26)\"): 87.7% of individual traders made net losses in FY26, against 90.9% in FY25; aggregate net losses were ₹91,685 crore in FY26; options trading accounted for 92% of individuals' aggregate losses; from FY22 to FY26 aggregate net losses came to about ₹3.85 lakh crore.",
          "August 2026 (\"Trading Behaviour of Individual Traders in the Equity Derivatives Segment (FY25–FY26)\"): 85% of client-quarters were loss-making, and the median loss in a losing quarter (₹10,525) was more than twice the median gain in a profitable one (₹4,366).",
        ] },
        { p: "SEBI notes that the lower share of loss-makers in FY26 came with a fall of about a fifth in the number of active traders, so it does not necessarily mean outcomes improved." },
      ],
      example: { title: "Reading one study's figures", steps: [
        "SEBI's July 2025 study: FY25 net losses of individual traders ₹1,05,603 crore; about 96 lakh traders in the brokers studied.",
        "SEBI's own table gives the average per person for FY25 as a loss of ₹1,10,069.",
        "Share of traders with a net loss in FY25: 91.0%.",
      ], result: "Roughly nine in ten individual traders lost money in FY25, by about ₹1.1 lakh each on average, after costs." },
      quiz: [
        { q: "According to SEBI's August 2026 study, what share of individual traders made net losses in equity F&O in FY26?", options: [
          { text: "87.7%", correct: true, why: "Right, against 90.9% in FY25." },
          { text: "About 50%", why: "The share was far higher." },
          { text: "12.3%", why: "12.3% is roughly the share that did not make a net loss." },
        ] },
        { q: "Which part of F&O accounted for 92% of individuals' aggregate losses in FY26, per SEBI's August 2026 study?", options: [
          { text: "Stock futures", why: "The study attributes most losses to options." },
          { text: "Options trading", correct: true, why: "Right, as the study reports." },
          { text: "Index futures", why: "The study attributes most losses to options." },
        ] },
        { q: "Why does SEBI read the lower FY26 loss-maker share with caution?", options: [
          { text: "Because the study covered only one day", why: "It covered whole financial years." },
          { text: "Because the number of active traders also fell by about a fifth", correct: true, why: "Right: fewer traders does not by itself mean better outcomes." },
          { text: "Because losses were not counted after costs", why: "The net figures are after transaction costs." },
        ] },
      ],
      sources: [SRC.pr2024, SRC.study2025, SRC.study2026, SRC.behaviour2026],
    },
    {
      id: "position-sizing", title: "Position sizing, as a concept", summary: "Relating the size of a position to the loss it can bring, as a share of capital. Arithmetic, not a suggestion of any size.",
      body: [
        { p: "Position sizing is the arithmetic of how large a position is compared with the money behind it. It starts from the loss a position could bring and expresses it as a share of total capital." },
        { list: [
          "For the buyer of an option, the most that can be lost is the premium paid.",
          "For a futures position or a written option, the loss depends on how far the price moves, and can exceed the margin.",
          "Lot sizes make positions lumpy: one lot can already be a large share of a small account.",
        ] },
        { note: "This lesson explains the arithmetic. It does not suggest any size, and no size removes the risk of loss." },
      ],
      example: { title: "One lot against ₹5 lakh of capital", steps: [
        "Capital ₹5,00,000. Suppose someone asks what share of it one position could lose.",
        "The buyer of one option lot at a premium of ₹90 (lot 65) can lose ₹5,850: 1.17% of capital.",
        "One index futures lot (24,500 × 65 = ₹15,92,500 of exposure) loses ₹5,000 after an adverse move of about 77 points (5,000 ÷ 65), about 0.3%; a 5% move (1,225 points) loses ₹79,625, about 16% of capital.",
      ], result: "The same capital can face a small, known loss on one position and a much larger, open-ended one on another." },
      quiz: [
        { q: "What is the most the buyer of an option can lose?", options: [
          { text: "The premium paid", correct: true, why: "Right, before costs." },
          { text: "The full contract value", why: "That is the exposure, not the buyer's largest loss." },
          { text: "The margin", why: "The buyer pays the premium and does not post margin like a writer." },
        ] },
        { q: "A futures lot of 65 units moves 200 points against the position. What is the loss?", options: [
          { text: "₹200", why: "Each point is worth ₹65 for one lot." },
          { text: "₹13,000", correct: true, why: "Right: 200 × 65." },
          { text: "₹3,077", why: "That divides instead of multiplying." },
        ] },
        { q: "Why are positions in F&O called lumpy?", options: [
          { text: "Because they trade only in whole lots, which can be large next to a small account", correct: true, why: "Right: a single lot can be a big share of capital." },
          { text: "Because prices move in jumps of ₹100", why: "Price steps are much smaller." },
          { text: "Because the exchange limits each trader to one lot", why: "There is no such limit for individuals." },
        ] },
      ],
    },
    {
      id: "margin-calls", title: "Margin calls", summary: "When losses eat into the margin, the broker asks for more money and can close positions if it does not arrive.",
      body: [
        { p: "Daily mark-to-market losses are taken from the money in the trading account. If what is left falls below the margin the position needs, there is a shortfall. The broker asks for more money (a margin call)." },
        { p: "If the shortfall is not met in time, the broker can close positions at the market price (a square-off), which turns a paper loss into a booked one. Exchanges also charge penalties for short margin, which brokers can pass on." },
        { p: "Margins can also rise during volatile markets, so a shortfall can appear even on a day with no loss." },
      ],
      example: { title: "A shortfall after one bad day", steps: [
        "Account balance ₹2,00,000; one index futures lot needs ₹1,75,175 of margin (illustrative).",
        "The index falls 500 points: MTM loss 500 × 65 = ₹32,500. Balance left: ₹1,67,500.",
        "Shortfall: 1,75,175 − 1,67,500 = ₹7,675, which the broker asks to be paid in.",
      ], result: "A 2% fall left the account short of margin; a further fall would widen the shortfall the same day." },
      quiz: [
        { q: "What is a margin call?", options: [
          { text: "A request from the broker for more money when the balance falls below the required margin", correct: true, why: "Right: that is what a margin call is." },
          { text: "A call option on the margin", why: "It has nothing to do with call options." },
          { text: "A refund of unused margin", why: "It is a request for more money." },
        ] },
        { q: "What can happen if a shortfall is not met?", options: [
          { text: "Nothing until expiry", why: "Brokers can act the same day." },
          { text: "The broker can close the positions at the market price", correct: true, why: "Right: a square-off books the loss." },
          { text: "The exchange pays the shortfall", why: "The trader owes it." },
        ] },
        { q: "Can a margin shortfall appear on a day with no loss?", options: [
          { text: "No, only losses cause shortfalls", why: "Higher required margins can cause one too." },
          { text: "Only on expiry day", why: "It can happen on any day margins rise." },
          { text: "Yes, if the required margin rises", correct: true, why: "Right: margins rise in volatile markets." },
        ] },
      ],
    },
    {
      id: "gap-risk", title: "Gap risk", summary: "Prices can open far from the last close; no exit is possible in between, and losses can jump past any planned exit level.",
      body: [
        { p: "Markets are closed overnight and on weekends, while news keeps coming. The next session can open far from the last close: a gap. Nothing can be traded in between, so a position takes the whole gap at once." },
        { p: "A planned exit level does not help inside a gap: the first available price can be well beyond it. Gaps hit written options hardest, because their losses are not capped." },
      ],
      example: { title: "A written call and an overnight gap", steps: [
        "The index closes at 24,200. A trader has written one lot (65) of the 24,500 call at ₹60.",
        "Overnight news; the index opens at 24,800. The call now trades near ₹320 (illustrative).",
        "Loss at the open: (320 − 60) × 65 = ₹16,900, more than four times the ₹3,900 of premium received, before any trade could be made.",
      ], result: "The loss arrived in one step at the open; there was no price in between at which to leave." },
      quiz: [
        { q: "What is a price gap?", options: [
          { text: "A session opening far from the previous close", correct: true, why: "Right: no trades happen between the two prices." },
          { text: "The gap between bid and ask", why: "That is the spread." },
          { text: "The gap between two strikes", why: "That is strike spacing." },
        ] },
        { q: "Why does a planned exit level not protect against a gap?", options: [
          { text: "Because exit levels are not allowed in F&O", why: "They are allowed; the problem is the missing prices." },
          { text: "Because the first available price can be well beyond it", correct: true, why: "Right: the market jumps over it." },
          { text: "Because gaps happen only on expiry day", why: "Gaps can happen at any open." },
        ] },
        { q: "In the example, how many times the premium received was the loss at the open?", options: [
          { text: "About 4.3 times", correct: true, why: "Right: ₹16,900 ÷ ₹3,900 ≈ 4.3." },
          { text: "About 1.5 times", why: "The loss was much larger." },
          { text: "Exactly equal", why: "The loss was far larger than the premium." },
        ] },
      ],
    },
    {
      id: "expiry-day-risk", title: "Expiry-day risk", summary: "Large gamma, fast premiums, extra margin on written options and delivery for stock contracts.",
      body: [
        { list: [
          "Gamma is largest close to expiry: near-the-money premiums can multiply or fall to almost nothing within minutes.",
          "SEBI's measures of 1 October 2024 added an extra 2% extreme loss margin on written index options on expiry day (from 20 November 2024), because of this risk.",
          "Since 10 February 2025, as SEBI's July 2025 note records, positions in different expiries no longer offset each other's margin on the expiry day of one of them (the calendar spread benefit).",
          "Stock options and futures that end in the money are settled by delivery: the full contract value must be paid, or the shares delivered.",
          "An exercised option pays STT on its intrinsic value (module 8), which can take a large share of a small intrinsic value's worth.",
        ] },
      ],
      example: { title: "An at-the-money option in its last two days", steps: [
        "From the model in module 4 (index 24,000, IV 14%): the at-the-money call is worth about ₹103.5 with 2 days left, with gamma about 0.0016.",
        "A 150-point rise on the same day takes the model's premium to about ₹198, nearly double; a 150-point fall takes it to about ₹44, less than half. Delta moves by about 0.24 either way.",
      ], result: "Near expiry, a modest index move changes an at-the-money premium by a large share of its value." },
      quiz: [
        { q: "What extra margin did SEBI add on expiry day for written index options, as announced on 1 October 2024?", options: [
          { text: "An extra 2% extreme loss margin", correct: true, why: "Right, from 20 November 2024." },
          { text: "No extra margin", why: "An extra 2% was added." },
          { text: "A ban on written options on expiry day", why: "Writing is allowed; the margin is higher." },
        ] },
        { q: "Why do premiums move fast on expiry day?", options: [
          { text: "Because gamma is largest close to expiry", correct: true, why: "Right: delta changes quickly with the price." },
          { text: "Because vega is largest", why: "Vega is small near expiry." },
          { text: "Because the exchange widens strikes", why: "Strikes do not change." },
        ] },
        { q: "What happens to an in-the-money stock option position at expiry?", options: [
          { text: "It is settled by delivery of the shares", correct: true, why: "Right: stock F&O is physically settled." },
          { text: "It is cancelled", why: "It is exercised and settled." },
          { text: "It is paid in cash like an index option", why: "Stock options are delivered." },
        ] },
      ],
      sources: [SRC.oct2024, SRC.study2025],
    },
  ],
};
