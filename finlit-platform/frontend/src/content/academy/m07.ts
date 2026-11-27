// F&O Academy, module 7: common structures, described neutrally with their payoff diagrams. Each is a shape of profit and loss at expiry,
// with its own costs and risks; none is a way to make money. Figures come from lib/payoff.ts with the presets shown (before costs and taxes).
import type { Module } from "./types";

const COSTS = "All figures are at expiry and before brokerage, taxes and charges (module 8). Premiums and lot sizes are illustrative.";

export const M7: Module = {
  n: 7, id: "structures", title: "Common structures and payoff diagrams", line: "Covered call, protective put, spreads, straddle, strangle and iron condor, each drawn at expiry.",
  lessons: [
    {
      id: "reading-payoff-diagrams", title: "Reading a payoff diagram", summary: "Price at expiry along the bottom, profit or loss up the side; breakevens where the line crosses zero.",
      body: [
        { p: "A payoff diagram draws the profit or loss of a position at expiry (up the side) against the underlying's price at expiry (along the bottom). The line is straight between strikes and bends at each strike." },
        { list: [
          "Breakeven: where the line crosses zero.",
          "Largest profit and largest loss: the highest and lowest points of the line, or \"not capped\" when the line keeps going.",
          "Slope: how much the result changes for each point the price moves.",
        ] },
        { p: "The diagram here draws the buyer's side of a put. Point at any price to read the result there; change the inputs to see the shape move. On a phone, tap the chart." },
        { note: COSTS },
      ],
      widget: { kind: "payoff", structure: "long-put" },
      example: { title: "The buyer of a 24,000 put at ₹150 (lot 65)", steps: [
        "Breakeven: 24,000 − 150 = 23,850.",
        "At 24,000 and above: the put is worth nothing; result −150 × 65 = −₹9,750.",
        "At 23,600: worth 400; result (400 − 150) × 65 = +₹16,250.",
      ], result: "The largest loss is the premium, ₹9,750; the gain grows ₹65 for each point below the breakeven." },
      quiz: [
        { q: "On a payoff diagram, what is a breakeven?", options: [
          { text: "A price where the line crosses zero", correct: true, why: "Right: at that expiry price the position neither gains nor loses (before costs)." },
          { text: "The strike price", why: "The strike is where the line bends; the breakeven is where it crosses zero." },
          { text: "The current market price", why: "The diagram is about prices at expiry." },
        ] },
        { q: "What does a payoff diagram leave out?", options: [
          { text: "The strike", why: "Strikes are where the line bends." },
          { text: "The premium", why: "The premium shifts the line up or down." },
          { text: "What happens before expiry, and costs and taxes", correct: true, why: "Right: it draws the result at expiry only, before costs." },
        ] },
        { q: "For the buyer of a 24,000 put at ₹150 (lot 65), what is the result at an expiry of 23,700?", options: [
          { text: "+₹9,750", correct: true, why: "Right: worth 300, minus 150 paid, × 65." },
          { text: "+₹19,500", why: "That forgets the premium paid." },
          { text: "−₹9,750", why: "At 23,700 the put is worth more than its premium." },
        ] },
      ],
    },
    {
      id: "covered-call", title: "Covered call", summary: "Owning the shares and writing a call: the premium adds to the result, the gain above the strike is given up.",
      body: [
        { p: "A covered call is owning shares and writing a call on the same number of shares. The premium received adds to the result. If the shares end above the strike, the gain above it is given up: the call's writer must deliver at the strike. If the shares fall, the premium cushions only part of the fall." },
        { list: ["Largest profit: (strike − price paid for the shares + premium) × quantity.", "Breakeven: price paid − premium.", "Largest loss: if the shares fell to zero, the price paid less the premium."] },
        { note: COSTS },
      ],
      widget: { kind: "payoff", structure: "covered-call" },
      example: { title: "500 shares from ₹1,200 with a 1,260 call written at ₹22", steps: [
        "Largest profit: (1,260 − 1,200 + 22) × 500 = ₹41,000, at 1,260 and above.",
        "Breakeven: 1,200 − 22 = 1,178.",
        "At 1,150: shares −50, premium +22, so −28 × 500 = −₹14,000.",
        "If the shares fell to zero: (−1,200 + 22) × 500 = −₹5,89,000.",
      ], result: "The premium of ₹11,000 widens the result by ₹22 a share at every price; above 1,260 nothing more is gained." },
      quiz: [
        { q: "What does the writer of a covered call give up?", options: [
          { text: "The gain if the shares rise above the strike", correct: true, why: "Right: above the strike, the call's value offsets the shares' gain." },
          { text: "The dividends on the shares, always", why: "Dividends are not part of the payoff shape here." },
          { text: "Nothing at all", why: "The capped gain above the strike is the trade-off." },
        ] },
        { q: "What is the breakeven of the example?", options: [
          { text: "1,260", why: "That is the strike." },
          { text: "1,222", why: "That adds the premium; for a covered call it is subtracted." },
          { text: "1,178", correct: true, why: "Right: 1,200 − 22." },
        ] },
        { q: "Does a covered call protect against a large fall in the shares?", options: [
          { text: "Yes, the loss is capped at the premium", why: "The loss keeps growing as the shares fall." },
          { text: "Only by the premium received", correct: true, why: "Right: below the breakeven the shares' fall is cushioned by ₹22 a share and no more." },
          { text: "Yes, the call's writer cannot lose", why: "The shares can still lose value." },
        ] },
      ],
    },
    {
      id: "protective-put", title: "Protective put", summary: "Owning the shares and being the buyer of a put: a floor below the put's strike, paid for with the premium.",
      body: [
        { p: "A protective put is owning shares and being the buyer of a put on the same number of shares. Below the put's strike, the put gains what the shares lose: the result has a floor. The premium paid is the cost of that floor, and it lowers the result at every price." },
        { list: ["Largest loss: (price paid − put strike + premium) × quantity.", "Breakeven: price paid + premium.", "The gain above the breakeven is not capped."] },
        { note: COSTS },
      ],
      widget: { kind: "payoff", structure: "protective-put" },
      example: { title: "500 shares from ₹1,200 with a 1,150 put at ₹18", steps: [
        "Largest loss: (1,200 − 1,150 + 18) × 500 = ₹34,000, at 1,150 and below.",
        "Breakeven: 1,200 + 18 = 1,218.",
        "At 1,300: (1,300 − 1,200 − 18) × 500 = +₹41,000.",
      ], result: "The loss stops at ₹34,000 however far the shares fall; every outcome is ₹9,000 (the premium) lower than owning the shares alone." },
      quiz: [
        { q: "What does the put add to a shareholding?", options: [
          { text: "A floor under the result, below the put's strike", correct: true, why: "Right: below the strike, the put's gain offsets the shares' loss." },
          { text: "A cap on the gain above the strike", why: "That describes a covered call." },
          { text: "A premium received", why: "The put is paid for; the premium is a cost here." },
        ] },
        { q: "What is the largest loss in the example?", options: [
          { text: "₹9,000", why: "That is only the premium; the gap from 1,200 down to 1,150 adds ₹25,000." },
          { text: "₹34,000", correct: true, why: "Right: (50 + 18) × 500." },
          { text: "It is not capped", why: "The put caps it." },
        ] },
        { q: "Where is the breakeven?", options: [
          { text: "1,182", why: "For a protective put the premium is added." },
          { text: "1,150", why: "That is the put's strike." },
          { text: "1,218", correct: true, why: "Right: 1,200 + 18." },
        ] },
      ],
    },
    {
      id: "call-spread", title: "Call spread (debit)", summary: "The buyer of a lower-strike call who writes a higher-strike call: loss and gain both capped.",
      body: [
        { p: "A debit call spread (also called a bull call spread) is being the buyer of a call at one strike and the writer of a call at a higher strike, same expiry. The premium received for the higher strike lowers the cost; in exchange, the gain stops at the higher strike." },
        { list: ["Net premium (debit) = premium paid − premium received.", "Largest loss = net premium × lot size.", "Largest gain = (gap between strikes − net premium) × lot size.", "Breakeven = lower strike + net premium."] },
        { note: COSTS },
      ],
      widget: { kind: "payoff", structure: "call-spread" },
      example: { title: "24,000 call at ₹180, 24,200 call written at ₹90 (lot 65)", steps: [
        "Net premium: 180 − 90 = 90; largest loss 90 × 65 = ₹5,850, at 24,000 and below.",
        "Largest gain: (200 − 90) × 65 = ₹7,150, at 24,200 and above.",
        "Breakeven: 24,000 + 90 = 24,090.",
      ], result: "Both ends are capped: ₹5,850 at risk against ₹7,150 at most." },
      quiz: [
        { q: "What caps the gain of a debit call spread?", options: [
          { text: "The written call at the higher strike", correct: true, why: "Right: above it, the written call's loss offsets the lower call's gain." },
          { text: "The exchange's price band", why: "The cap comes from the structure itself." },
          { text: "Nothing: the gain is not capped", why: "The written call caps it." },
        ] },
        { q: "With strikes 24,000 and 24,200 and a net premium of 90, what is the breakeven?", options: [
          { text: "24,110", why: "That subtracts from the higher strike." },
          { text: "24,090", correct: true, why: "Right: lower strike + net premium." },
          { text: "24,200", why: "That is where the gain stops growing." },
        ] },
        { q: "With the same strikes (200 apart) and a net premium of 120 (lot 65), what is the largest gain?", options: [
          { text: "₹13,000", why: "That forgets the net premium." },
          { text: "₹7,800", why: "That is the net premium × lot size, the largest loss." },
          { text: "₹5,200", correct: true, why: "Right: (200 − 120) × 65." },
        ] },
      ],
    },
    {
      id: "put-spread", title: "Put spread (debit)", summary: "The buyer of a higher-strike put who writes a lower-strike put: loss and gain both capped.",
      body: [
        { p: "A debit put spread (also called a bear put spread) is being the buyer of a put at one strike and the writer of a put at a lower strike, same expiry. The written put lowers the cost and caps the gain below the lower strike." },
        { list: ["Largest loss = net premium × lot size.", "Largest gain = (gap between strikes − net premium) × lot size.", "Breakeven = higher strike − net premium."] },
        { note: COSTS },
      ],
      widget: { kind: "payoff", structure: "put-spread" },
      example: { title: "24,000 put at ₹160, 23,800 put written at ₹85 (lot 65)", steps: [
        "Net premium: 160 − 85 = 75; largest loss 75 × 65 = ₹4,875, at 24,000 and above.",
        "Largest gain: (200 − 75) × 65 = ₹8,125, at 23,800 and below.",
        "Breakeven: 24,000 − 75 = 23,925.",
      ], result: "₹4,875 at risk against ₹8,125 at most, both capped." },
      quiz: [
        { q: "In a debit put spread, which put is written?", options: [
          { text: "The one with the lower strike", correct: true, why: "Right: the buyer's put has the higher strike." },
          { text: "The one with the higher strike", why: "Writing the higher strike would make it a credit structure." },
          { text: "Neither: both are paid for", why: "One put is written; its premium lowers the cost." },
        ] },
        { q: "What is the breakeven of the example?", options: [
          { text: "23,875", why: "That subtracts from the lower strike." },
          { text: "23,925", correct: true, why: "Right: 24,000 − 75." },
          { text: "24,075", why: "For a put spread the net premium is subtracted." },
        ] },
        { q: "What is the result in the example at an expiry of 24,100?", options: [
          { text: "₹0", why: "The premium paid is lost." },
          { text: "+₹8,125", why: "That is the largest gain, reached below 23,800." },
          { text: "−₹4,875", correct: true, why: "Right: both puts are worthless; the net premium is lost." },
        ] },
      ],
    },
    {
      id: "straddle", title: "Straddle", summary: "A call and a put at the same strike: the buyer's side needs a large move either way; the writer's side has losses that are not capped.",
      body: [
        { p: "A straddle is a call and a put at the same strike and expiry. The buyer of both pays two premiums and gains only if the price ends further from the strike than the two premiums together, in either direction." },
        { p: "The writer's side is the mirror image: the largest gain is both premiums, reached only if the price ends exactly at the strike, and the loss is not capped on the upside and is large on the downside. Use the switch on the diagram to see both sides." },
        { list: ["Breakevens: strike − total premium and strike + total premium.", "Buyer's largest loss: total premium × lot size, at the strike."] },
        { note: COSTS },
      ],
      widget: { kind: "payoff", structure: "straddle" },
      example: { title: "24,000 call at ₹180 and 24,000 put at ₹160 (lot 65)", steps: [
        "Total premium: 340; breakevens 23,660 and 24,340.",
        "Buyer's side at 24,000: −340 × 65 = −₹22,100, the largest loss.",
        "Buyer's side at 24,600: (600 − 340) × 65 = +₹16,900. Writer's side at the same price: −₹16,900.",
      ], result: "The buyer's side needs a move of more than 340 points; the writer's side gains at most ₹22,100 and its losses are not capped." },
      quiz: [
        { q: "Where are the breakevens of the example?", options: [
          { text: "23,660 and 24,340", correct: true, why: "Right: the strike ± the total premium of 340." },
          { text: "23,820 and 24,180", why: "That uses only one premium on each side." },
          { text: "Only at 24,000", why: "At 24,000 the buyer's side is at its largest loss." },
        ] },
        { q: "What is the writer's largest possible loss on a straddle?", options: [
          { text: "The total premium", why: "That is the writer's largest gain." },
          { text: "It is not capped as the price rises", correct: true, why: "Right: the written call's loss keeps growing." },
          { text: "Zero, because the premiums cover it", why: "The premiums are small compared with a large move." },
        ] },
        { q: "The expiry is 23,500. What is the buyer's side result?", options: [
          { text: "−₹22,100", why: "At 23,500 the put is worth 500, more than the total premium." },
          { text: "+₹32,500", why: "That forgets the premiums paid." },
          { text: "+₹10,400", correct: true, why: "Right: (500 − 340) × 65." },
        ] },
      ],
    },
    {
      id: "strangle", title: "Strangle", summary: "A lower-strike put and a higher-strike call: cheaper than a straddle for the buyer, with wider breakevens.",
      body: [
        { p: "A strangle is a put at a lower strike and a call at a higher strike, same expiry. For the buyer it costs less than a straddle, because both options are out of the money, but the price must move further before the position gains." },
        { p: "The writer's side gains both premiums if the price ends between the strikes, and its losses are not capped beyond the breakevens. Use the switch to see both sides." },
        { list: ["Breakevens: put strike − total premium and call strike + total premium.", "Buyer's largest loss: total premium × lot size, anywhere between the strikes."] },
        { note: COSTS },
      ],
      widget: { kind: "payoff", structure: "strangle" },
      example: { title: "23,800 put at ₹85 and 24,200 call at ₹90 (lot 65)", steps: [
        "Total premium: 175; breakevens 23,625 and 24,375.",
        "Buyer's side between 23,800 and 24,200: −175 × 65 = −₹11,375.",
        "Buyer's side at 24,500: (300 − 175) × 65 = +₹8,125.",
      ], result: "Half the cost of the straddle in the last lesson, with breakevens about 35 points further out on each side." },
      quiz: [
        { q: "How does a strangle differ from a straddle?", options: [
          { text: "Its put and call have different strikes", correct: true, why: "Right: the put is below and the call above the price." },
          { text: "It uses two calls", why: "It uses one put and one call." },
          { text: "It has no expiry", why: "Both options share an expiry." },
        ] },
        { q: "What are the breakevens of the example?", options: [
          { text: "23,800 and 24,200", why: "Those are the strikes." },
          { text: "23,625 and 24,375", correct: true, why: "Right: each strike moved out by the total premium of 175." },
          { text: "23,715 and 24,285", why: "That uses half the premium." },
        ] },
        { q: "Where does the buyer's side have its largest loss?", options: [
          { text: "Anywhere between the two strikes", correct: true, why: "Right: both options expire worthless there." },
          { text: "Below 23,625", why: "Below the lower breakeven the put gains." },
          { text: "Above 24,375", why: "Above the upper breakeven the call gains." },
        ] },
      ],
    },
    {
      id: "iron-condor", title: "Iron condor", summary: "A written strangle with a put paid for below and a call paid for above: the net premium is the largest gain, the wings cap the loss.",
      body: [
        { p: "An iron condor has four options of one expiry: the writer of a put and of a call near the price, and the buyer of a put further below and of a call further above. It receives a net premium." },
        { list: [
          "Largest gain: the net premium × lot size, if the price ends between the two written strikes.",
          "Largest loss: (gap between a written strike and its outer strike − net premium) × lot size, beyond either outer strike.",
          "Breakevens: written put strike − net premium and written call strike + net premium.",
        ] },
        { p: "The structure gains in a narrow range and loses more outside it: here the largest loss is larger than the largest gain." },
        { note: COSTS },
      ],
      widget: { kind: "payoff", structure: "iron-condor" },
      example: { title: "Puts 23,600 (paid ₹40) and 23,800 (written ₹85); calls 24,200 (written ₹90) and 24,400 (paid ₹45); lot 65", steps: [
        "Net premium received: 85 + 90 − 40 − 45 = 90.",
        "Largest gain: 90 × 65 = ₹5,850, from 23,800 to 24,200.",
        "Largest loss: (200 − 90) × 65 = ₹7,150, at 23,600 and below or at 24,400 and above.",
        "Breakevens: 23,800 − 90 = 23,710 and 24,200 + 90 = 24,290.",
      ], result: "₹5,850 at most in the middle against ₹7,150 at most outside the wings." },
      quiz: [
        { q: "What is the largest gain of an iron condor?", options: [
          { text: "The net premium received × lot size", correct: true, why: "Right: reached when all four options expire worthless." },
          { text: "The gap between the outer strikes", why: "That is not a gain the structure can reach." },
          { text: "It is not capped", why: "The gain is the premium received, and no more." },
        ] },
        { q: "What do the two outer options (the wings) do?", options: [
          { text: "They cap the loss beyond the outer strikes", correct: true, why: "Right: they turn an uncapped written strangle into a capped structure." },
          { text: "They raise the net premium", why: "They are paid for, so they lower it." },
          { text: "They remove all risk", why: "The loss is capped, not removed." },
        ] },
        { q: "What is the result in the example at an expiry of 24,350?", options: [
          { text: "+₹5,850", why: "Above 24,290 the structure is past its upper breakeven." },
          { text: "−₹7,150", why: "The largest loss is reached only at 24,400 and above." },
          { text: "−₹3,900", correct: true, why: "Right: the written call costs 150, the net premium is 90: (90 − 150) × 65." },
        ] },
      ],
    },
  ],
};
