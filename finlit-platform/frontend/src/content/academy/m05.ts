// F&O Academy, module 5: open interest, PCR, max pain and build-ups. Each lesson links to the same reading on live data in the Trading Lab
// (Order Flow > Option Pulse), shown only to Trading Lab members. These readings describe where positions sit; none says what comes next.
import type { Module } from "./types";

const LIVE = { to: "/lab/flow?view=options", label: "See it on live data: Option Pulse in the Trading Lab" };
const LIVE_FLOW = { to: "/lab/flow", label: "See it on live data: build-ups on Order Flow in the Trading Lab" };

export const M5: Module = {
  n: 5, id: "open-interest", title: "Open interest, PCR, max pain and build-ups", line: "What open positions show, and what they do not.",
  lessons: [
    {
      id: "open-interest", title: "Open interest", summary: "The number of contracts still open; it rises when new positions open and falls when positions close.",
      body: [
        { p: "Open interest (OI) is the number of contracts (or units) still open at a moment: positions that have been opened and not yet closed, exercised or expired. Every open contract has a long side and a short side, so OI counts each contract once." },
        { list: [
          "OI rises when a new long and a new short position meet (both sides open).",
          "OI falls when both sides of a trade are closing.",
          "OI stays the same when one side opens and the other closes: the position just changes hands.",
        ] },
        { p: "Volume counts every trade in the day; OI counts what is left open. A contract can trade many times in a day with no change in OI." },
      ],
      live: LIVE,
      example: { title: "Three trades and their effect on OI", steps: [
        "Start: OI is 0. A opens a long of one lot and B opens a short of one lot: OI = 1.",
        "C opens a new long and A closes his long against it: OI stays 1 (C now has the long).",
        "B closes her short and C closes his long against each other: OI = 0.",
        "Volume for the day: 3 lots; OI at the end: 0.",
        "With a lot of 65 units and a futures price of 24,000, each open contract is an exposure of 24,000 × 65 = ₹15,60,000 on each side.",
      ], result: "OI tells how many contracts remain open, not how much trading took place." },
      quiz: [
        { q: "A trader opens a new long position and the other side is a trader closing a long position. What happens to OI?", options: [
          { text: "It rises by one contract", why: "OI rises only when both sides are opening." },
          { text: "It stays the same", correct: true, why: "Right: the open position just changes hands." },
          { text: "It falls by one contract", why: "OI falls only when both sides are closing." },
        ] },
        { q: "How does OI differ from volume?", options: [
          { text: "OI counts open positions; volume counts trades in the day", correct: true, why: "Right: they measure different things." },
          { text: "They are the same number shown twice", why: "They often differ widely." },
          { text: "OI counts only call options", why: "OI is reported for futures, calls and puts." },
        ] },
        { q: "Why does each open contract count once in OI, though it has two sides?", options: [
          { text: "Because only long positions are counted", why: "Both sides exist; the count is of contracts, each with one long and one short." },
          { text: "Because each contract has exactly one long and one short side", correct: true, why: "Right: counting contracts counts each pair once." },
          { text: "Because the exchange halves the figure", why: "There is no halving; it is a count of contracts." },
        ] },
      ],
    },
    {
      id: "oi-build-ups", title: "The four build-ups", summary: "Price and OI together give four labels: long build-up, short build-up, short covering and long unwinding.",
      body: [
        { p: "Comparing today's price change with today's OI change gives four labels used across Indian F&O desks. They describe what positions did, not what the price does next." },
        { terms: [
          ["Long build-up", "Price up, OI up: new positions were opened as the price rose."],
          ["Short build-up", "Price down, OI up: new positions were opened as the price fell."],
          ["Short covering", "Price up, OI down: positions were closed as the price rose."],
          ["Long unwinding", "Price down, OI down: positions were closed as the price fell."],
        ] },
        { note: "Every new long has a new short on the other side. The labels name the side whose move matched the price, as a convention; they cannot show who started the trades." },
      ],
      live: LIVE_FLOW,
      example: { title: "Naming four stocks' days", steps: [
        "Stock A: price +1.2%, futures OI +8% → long build-up.",
        "Stock B: price −0.9%, OI +6% → short build-up.",
        "Stock C: price +2.1%, OI −5% → short covering.",
        "Stock D: price −1.5%, OI −4% → long unwinding.",
        "For stock A at ₹1,500 with a lot of 500 (illustrative), an OI rise of 400 contracts is 400 × 500 × ₹1,500 = ₹30 crore of new open positions on each side.",
      ], result: "Each label is a fact about the day's price and OI, not a reading of the future." },
      quiz: [
        { q: "Price falls and OI rises. Which label applies?", options: [
          { text: "Long build-up", why: "Long build-up is price up with OI up." },
          { text: "Short build-up", correct: true, why: "Right: new positions opened while the price fell." },
          { text: "Long unwinding", why: "Long unwinding is price down with OI down." },
        ] },
        { q: "Price rises and OI falls. Which label applies?", options: [
          { text: "Short covering", correct: true, why: "Right: positions closed while the price rose." },
          { text: "Long build-up", why: "Long build-up needs OI to rise." },
          { text: "Short build-up", why: "Short build-up is price down with OI up." },
        ] },
        { q: "What does a long build-up tell about tomorrow's price?", options: [
          { text: "That it rises", why: "A label describes the day that has passed; it says nothing certain about tomorrow." },
          { text: "That it falls", why: "A label does not foretell a fall either." },
          { text: "Nothing certain: it describes what happened today", correct: true, why: "Right: build-ups describe what has happened, not what comes next." },
        ] },
      ],
    },
    {
      id: "put-call-ratio", title: "Put-call ratio (PCR)", summary: "Total put OI divided by total call OI for an expiry; read in different ways by different people.",
      body: [
        { formula: "PCR (OI) = total put open interest ÷ total call open interest", what: "Usually for one underlying and one expiry. A volume PCR uses the day's traded volumes instead." },
        { p: "A PCR above 1 means more puts are open than calls; below 1, more calls than puts. It is read in more than one way: some see many open puts as protection being paid for, others as puts being written by people who are comfortable with the price staying up. The number alone cannot tell which." },
        { note: "FinLit shows PCR as a fact. It is not a reading of where the market goes." },
      ],
      live: LIVE,
      example: { title: "PCR for one expiry", steps: [
        "Total put OI: 1,20,00,000 units. Total call OI: 1,00,00,000 units.",
        "PCR (OI) = 1,20,00,000 ÷ 1,00,00,000 = 1.20.",
        "Day's put volume 80,00,000 and call volume 1,00,00,000: volume PCR = 0.80.",
        "At an index of 24,000, put OI of 1,20,00,000 units is a notional exposure of about ₹28,800 crore (1,20,00,000 × 24,000).",
      ], result: "The same expiry can show an OI PCR above 1 and a volume PCR below 1 on the same day." },
      quiz: [
        { q: "Put OI is 90 lakh and call OI is 1.2 crore. What is the PCR (OI)?", options: [
          { text: "1.33", why: "That divides calls by puts." },
          { text: "0.75", correct: true, why: "Right: 90 lakh ÷ 120 lakh = 0.75." },
          { text: "0.90", why: "That ignores the call OI." },
        ] },
        { q: "Why can the same PCR be read in opposite ways?", options: [
          { text: "Because OI does not show whether the open puts were opened by buyers seeking protection or by writers", correct: true, why: "Right: each open put has both a buyer and a writer." },
          { text: "Because PCR is computed differently each day", why: "The formula stays the same." },
          { text: "Because only call OI is reported", why: "Both put and call OI are reported." },
        ] },
        { q: "What does a volume PCR use?", options: [
          { text: "Open interest at the end of the day", why: "That is the OI PCR." },
          { text: "The day's traded volumes of puts and calls", correct: true, why: "Right: volume PCR = put volume ÷ call volume." },
          { text: "The premiums of puts and calls", why: "Premiums are not part of PCR." },
        ] },
      ],
    },
    {
      id: "max-pain", title: "Max pain", summary: "The expiry price at which option buyers together would receive the least; a calculation on today's OI, not a magnet.",
      body: [
        { p: "Max pain is the expiry price at which the total value of all open options, calls and puts together, would be smallest: where option buyers together would receive the least and writers together would pay the least." },
        { formula: "Payout at price X = Σ call OI × max(X − strike, 0) + Σ put OI × max(strike − X, 0)", what: "Work it out at every strike; max pain is the strike with the smallest payout." },
        { p: "Max pain moves as OI changes during the expiry, and nothing makes the price settle there. Some say prices drift towards it near expiry; others find no such pattern. It is a calculation on open positions, not a level the market is drawn to." },
      ],
      live: LIVE,
      example: { title: "Max pain over three strikes (OI in lakh units)", steps: [
        "Strike 23,900: call OI 10, put OI 50. Strike 24,000: call 40, put 40. Strike 24,100: call 60, put 15.",
        "Expiry at 23,900: puts at 24,000 pay 40 × 100 and at 24,100 pay 15 × 200; total 7,000 (lakh ₹, about ₹70 crore).",
        "Expiry at 24,000: calls at 23,900 pay 10 × 100 = 1,000; puts at 24,100 pay 15 × 100 = 1,500; total 2,500 (about ₹25 crore).",
        "Expiry at 24,100: calls at 23,900 pay 10 × 200 and at 24,000 pay 40 × 100; total 6,000 (about ₹60 crore).",
      ], result: "Max pain is 24,000, the strike with the smallest total payout (2,500 lakh ₹)." },
      quiz: [
        { q: "What is max pain?", options: [
          { text: "The expiry price where open options together would pay out the least", correct: true, why: "Right: it is worked out from open interest at each strike." },
          { text: "The price the index reaches at expiry", why: "It is a calculation; the index can end anywhere." },
          { text: "The largest loss any trader can make", why: "That is not what the term means." },
        ] },
        { q: "In the example, what is the total payout at an expiry of 24,000?", options: [
          { text: "7,000 lakh ₹", why: "That is the payout at 23,900." },
          { text: "6,000 lakh ₹", why: "That is the payout at 24,100." },
          { text: "2,500 lakh ₹", correct: true, why: "Right: 1,000 from calls at 23,900 and 1,500 from puts at 24,100." },
        ] },
        { q: "Does the price have to settle at max pain?", options: [
          { text: "Yes, writers make sure of it", why: "No rule or mechanism makes the price settle at max pain." },
          { text: "No: it is a calculation on today's open positions and it moves as they change", correct: true, why: "Right: it describes positions, not where the price ends." },
          { text: "Only for stock options", why: "No rule makes it so for any contract." },
        ] },
      ],
    },
    {
      id: "oi-by-strike", title: "Reading OI strike by strike", summary: "Where open positions sit across strikes, and how they changed today; facts about positions, not walls.",
      body: [
        { p: "An option chain lists, for each strike, the call OI and put OI and today's change in each. Laid out as a ladder, it shows where open positions are concentrated." },
        { list: [
          "A strike with very large call OI is where many calls are open; a strike with very large put OI, where many puts are open.",
          "The change in OI during the day shows where positions are being added or closed.",
          "Large OI at a strike is often called a wall or a ceiling. It is only a count of open contracts: prices regularly move through strikes with large OI.",
        ] },
      ],
      live: LIVE,
      example: { title: "A small ladder", steps: [
        "Index at 24,352. Strike 24,300: put OI 48 lakh (+11 lakh today), call OI 26 lakh.",
        "Strike 24,500: call OI 51 lakh (−5 lakh today), put OI 10 lakh.",
        "Facts: the most put OI is at 24,300 and it grew today; the most call OI is at 24,500 and it shrank today.",
        "With a lot of 65, the 11 lakh units of new put OI at 24,300 are about 16,900 contracts; at a premium of ₹80, their buyers together paid about ₹8.8 crore.",
      ], result: "The ladder says where positions are open and how they changed, and nothing about where the index goes." },
      quiz: [
        { q: "What does very large call OI at a strike show?", options: [
          { text: "That the price cannot rise above that strike", why: "Prices regularly move through strikes with large OI." },
          { text: "That many call contracts at that strike are open", correct: true, why: "Right: it is a count of open contracts." },
          { text: "That call buyers made money there", why: "OI says nothing about who made or lost money." },
        ] },
        { q: "Put OI at 24,300 rose 11 lakh today. What does that describe?", options: [
          { text: "New put positions at 24,300 were opened today, more than were closed", correct: true, why: "Right: a rise in OI means net new positions." },
          { text: "The index will stay above 24,300", why: "OI change describes positions, not the future." },
          { text: "Put buyers closed their positions", why: "Closing lowers OI." },
        ] },
        { q: "What does the word \"wall\" for a large OI strike leave out?", options: [
          { text: "That the strike is listed on the exchange", why: "That is true but not what the word hides." },
          { text: "That OI is counted in lots", why: "That is not what the word leaves out." },
          { text: "That it is just a count of open contracts, which prices often move through", correct: true, why: "Right: the strike is not a barrier." },
        ] },
      ],
    },
  ],
};
