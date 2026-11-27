// F&O Academy, module 3: options basics. Premiums are illustrative (contracts a few days from expiry); lot size 65 is illustrative.
import { CHECK, type Module } from "./types";

export const M3: Module = {
  n: 3, id: "options", title: "Options basics", line: "Calls and puts, premium and strike, moneyness, intrinsic and time value, payoff and settlement.",
  lessons: [
    {
      id: "calls-and-puts", title: "Calls and puts", summary: "A call gives its buyer a right to the underlying at the strike; a put gives a right to hand it over. The writer takes the duty.",
      body: [
        { p: "An option is a contract between a buyer and a seller, who is also called the writer. The buyer pays a premium and gets a right, but not a duty. The writer receives the premium and takes on the duty to honour that right." },
        { list: [
          "A call gives its buyer the right to the underlying at the strike price on expiry. It gains value as the underlying rises above the strike.",
          "A put gives its buyer the right to hand over the underlying at the strike price on expiry. It gains value as the underlying falls below the strike.",
          "The writer of a call or a put has the mirror image: the premium received, against a duty that can cost much more than that premium.",
        ] },
        { terms: [["Strike", "The price at which the right can be used."], ["Premium", "The price of the option, paid by the buyer to the writer."], ["Writer", "The seller of an option, who receives the premium and carries the duty."]] },
      ],
      example: { title: "A call at expiry, from both sides", steps: [
        "Index call, strike 24,000, premium ₹180 a unit, lot size 65 (illustrative).",
        "The buyer pays 180 × 65 = ₹11,700; the writer receives it.",
        "At expiry the index is at 24,400. The call is worth 24,400 − 24,000 = 400 points.",
        "Buyer: (400 − 180) × 65 = +₹14,300. Writer: −₹14,300.",
      ], result: "One side's gain is the other side's loss; the buyer risked ₹11,700, while the writer's loss had no fixed upper limit." },
      quiz: [
        { q: "What does the buyer of a put get?", options: [
          { text: "The duty to take the underlying at the strike", why: "A duty belongs to the writer; the buyer gets a right." },
          { text: "The right to hand over the underlying at the strike", correct: true, why: "Right: a put gives its buyer the right to deliver at the strike price." },
          { text: "A fixed payment at expiry", why: "An option pays only if it ends in the money." },
        ] },
        { q: "Who receives the premium?", options: [
          { text: "The writer (seller)", correct: true, why: "Right: the buyer pays it to the writer." },
          { text: "The exchange", why: "The exchange earns charges, not the premium." },
          { text: "The buyer", why: "The buyer pays the premium." },
        ] },
        { q: "In the example, what is the writer's result if the index ends at 23,900?", options: [
          { text: "−₹6,500", why: "Below the strike the call is worth nothing, so the writer pays nothing." },
          { text: "+₹11,700, the premium received", correct: true, why: "Right: the call expires worthless and the writer keeps the premium (before costs)." },
          { text: "₹0", why: "The writer still keeps the premium received." },
        ] },
      ],
    },
    {
      id: "premium-and-strike", title: "Premium and strike", summary: "The premium is quoted per unit and paid for a whole lot, upfront; strikes are listed at fixed steps.",
      body: [
        { p: "An option's premium is quoted per unit of the underlying. The amount paid is the premium × lot size × number of lots. Since SEBI's measures of 1 October 2024 (in force from February 2025), brokers collect the full premium from the buyer upfront." },
        { p: "Strikes are listed at fixed steps around the current price, set by the exchange for each underlying, and new strikes are added as the price moves. Every strike has a call and a put for each expiry." },
        { p: "The writer does not pay a premium but must put up margin, which for a written option is usually far larger than the premium received." },
        { note: CHECK },
      ],
      example: { title: "What one lot costs and what the writer puts up", steps: [
        "Index call, strike 24,000, premium ₹180, lot size 65 (illustrative).",
        "The buyer pays 180 × 65 = ₹11,700 upfront.",
        "The writer receives ₹11,700 but must have margin in place; suppose it is about ₹1,50,000 (illustrative).",
      ], result: "The buyer's money at risk is the premium; the writer puts up much more as margin because the possible loss is larger." },
      quiz: [
        { q: "A premium is quoted at ₹90 and the lot size is 65. What does one lot cost the buyer?", options: [
          { text: "₹90", why: "₹90 is per unit; the lot has 65 units." },
          { text: "₹5,850", correct: true, why: "Right: 90 × 65 = ₹5,850." },
          { text: "₹155", why: "That adds instead of multiplying." },
        ] },
        { q: "When does the buyer pay the premium, under the rules as announced by SEBI on 1 October 2024?", options: [
          { text: "Upfront, in full", correct: true, why: "Right: upfront collection of the premium applies from February 2025." },
          { text: "At expiry, if the option has value", why: "That is not how the premium works; it is paid when the position is opened." },
          { text: "Only half upfront, the rest at expiry", why: "The full premium is collected upfront." },
        ] },
        { q: "Why does the writer put up margin larger than the premium?", options: [
          { text: "Because the writer's possible loss can be much larger than the premium", correct: true, why: "Right: margin covers the writer's duty, which can cost far more than the premium received." },
          { text: "Because the writer pays the premium", why: "The writer receives the premium." },
          { text: "Because margin is a fee kept by the exchange", why: "Margin is a deposit, not a fee." },
        ] },
      ],
    },
    {
      id: "moneyness", title: "In, at and out of the money", summary: "Whether an option would be worth anything if it expired now: ITM, ATM or OTM.",
      body: [
        { list: [
          "A call is in the money (ITM) when the underlying is above the strike, and out of the money (OTM) when it is below.",
          "A put is ITM when the underlying is below the strike, and OTM when it is above.",
          "At the money (ATM) is the strike nearest to the current price.",
        ] },
        { p: "Moneyness changes as the underlying moves, so the same option can be OTM in the morning and ITM by the afternoon." },
      ],
      example: { title: "One price, several strikes", steps: [
        "The index is at 24,130 and strikes are 50 points apart (illustrative).",
        "The 24,000 call is ITM by 130 points; the 24,000 put is OTM.",
        "The 24,300 call is OTM; the 24,300 put is ITM by 170 points.",
        "The ATM strike is 24,150, the strike nearest to 24,130.",
        "If the index stayed at 24,130 until expiry, one lot (65, illustrative) of the 24,000 call would be worth 130 × 65 = ₹8,450 and the 24,000 put nothing.",
      ], result: "Calls below the price and puts above it are in the money." },
      quiz: [
        { q: "The underlying is at 1,520. Which option is in the money?", options: [
          { text: "The 1,560 call", why: "A call is ITM only when the price is above its strike." },
          { text: "The 1,480 put", why: "A put is ITM only when the price is below its strike." },
          { text: "The 1,500 call", correct: true, why: "Right: 1,520 is above 1,500, so the call is ITM by 20." },
        ] },
        { q: "The index is at 24,130 with strikes every 50 points. Which strike is at the money?", options: [
          { text: "24,100", why: "24,100 is 30 away; 24,150 is only 20 away." },
          { text: "24,150", correct: true, why: "Right: it is the strike nearest to 24,130." },
          { text: "24,000", why: "24,000 is 130 points away." },
        ] },
        { q: "Can an OTM option become ITM before expiry?", options: [
          { text: "No, moneyness is fixed when the option is listed", why: "Moneyness follows the underlying's price." },
          { text: "Only on expiry day", why: "It can change on any day the price moves across the strike." },
          { text: "Yes, if the underlying moves past the strike", correct: true, why: "Right: moneyness changes with the price." },
        ] },
      ],
    },
    {
      id: "intrinsic-and-time-value", title: "Intrinsic value and time value", summary: "A premium is what the option is worth now if used, plus what is paid for the time left.",
      body: [
        { formula: "Intrinsic value: call = max(spot − strike, 0); put = max(strike − spot, 0)", what: "What the option would be worth if it expired now." },
        { formula: "Time value = premium − intrinsic value", what: "What is paid for the chance that the option gains more before expiry. It falls to zero at expiry." },
        { p: "OTM and ATM options are made only of time value. Time value is largest at the money and shrinks as expiry comes closer; module 4 (theta) shows how fast." },
      ],
      example: { title: "Splitting three premiums", steps: [
        "Index at 24,150.",
        "24,000 call at ₹260: intrinsic 150, time value 110.",
        "24,200 call at ₹95: intrinsic 0, time value 95.",
        "24,200 put at ₹140: intrinsic 50, time value 90.",
      ], result: "Only ITM options have intrinsic value; every option before expiry has some time value." },
      quiz: [
        { q: "The index is at 24,150 and the 24,000 call trades at ₹260. What is its time value?", options: [
          { text: "₹260", why: "Part of the premium is intrinsic value (150)." },
          { text: "₹150", why: "₹150 is the intrinsic value." },
          { text: "₹110", correct: true, why: "Right: 260 − 150 = ₹110." },
        ] },
        { q: "What is the intrinsic value of an OTM option?", options: [
          { text: "Zero", correct: true, why: "Right: its premium is all time value." },
          { text: "The full premium", why: "An OTM option's premium is time value, not intrinsic value." },
          { text: "The strike price", why: "Intrinsic value is a gap between spot and strike, never the strike itself." },
        ] },
        { q: "What happens to time value at expiry?", options: [
          { text: "It doubles", why: "No time is left, so there is nothing to pay for." },
          { text: "It becomes zero", correct: true, why: "Right: at expiry an option is worth only its intrinsic value." },
          { text: "It turns into intrinsic value", why: "Time value disappears; intrinsic value depends only on the price at expiry." },
        ] },
      ],
    },
    {
      id: "option-payoff-at-expiry", title: "Payoff at expiry", summary: "The buyer's loss stops at the premium; the breakeven is the strike plus or minus the premium.",
      body: [
        { formula: "Buyer of a call: max(price at expiry − strike, 0) − premium", what: "Breakeven = strike + premium. The largest loss is the premium." },
        { formula: "Buyer of a put: max(strike − price at expiry, 0) − premium", what: "Breakeven = strike − premium. The largest loss is the premium; the largest gain is reached if the price falls to zero." },
        { p: "The writer's payoff is the mirror image. The writer of a call has a loss with no upper limit as the price rises; the writer of a put can lose up to the strike less the premium." },
        { p: "The diagram below draws the buyer's side of a call. Change the strike, the premium or the lot size and point at the chart to read the result at any price." },
      ],
      widget: { kind: "payoff", structure: "long-call" },
      example: { title: "The buyer of a 24,000 call at ₹180", steps: [
        "Breakeven: 24,000 + 180 = 24,180.",
        "Expiry at 23,800: the call is worth 0; result −180 × 65 = −₹11,700, the whole premium.",
        "Expiry at 24,180: worth 180; result ₹0.",
        "Expiry at 24,500: worth 500; result (500 − 180) × 65 = +₹20,800.",
      ], result: "Below the strike the loss stays at the premium; above the breakeven the gain grows ₹65 for every point." },
      quiz: [
        { q: "What is the breakeven at expiry for the buyer of a 24,000 put at ₹150?", options: [
          { text: "24,150", why: "Adding the premium is the rule for a call." },
          { text: "23,850", correct: true, why: "Right: for a put, breakeven = strike − premium." },
          { text: "24,000", why: "At the strike a put is worth nothing, so the buyer is down the premium." },
        ] },
        { q: "What is the largest loss for the buyer of an option?", options: [
          { text: "The premium paid", correct: true, why: "Right: the buyer's right can simply lapse; nothing more is owed (before costs)." },
          { text: "The strike price × lot size", why: "That is the contract's exposure, not the buyer's largest loss." },
          { text: "It has no limit", why: "That describes the writer of a call, not the buyer." },
        ] },
        { q: "The buyer of a 24,000 call at ₹180 (lot 65) sees expiry at 24,300. What is the result?", options: [
          { text: "+₹19,500", why: "That forgets to subtract the premium." },
          { text: "+₹7,800", correct: true, why: "Right: (300 − 180) × 65 = ₹7,800." },
          { text: "−₹11,700", why: "At 24,300 the call is worth 300, more than the premium." },
        ] },
      ],
    },
    {
      id: "exercise-and-settlement", title: "Exercise and settlement", summary: "NSE options are European; in-the-money options are exercised at expiry, index options in cash and stock options by delivery.",
      body: [
        { p: "NSE's options are European: they can be exercised only at expiry. Before that, the buyer or the writer leaves the position by an opposite trade in the market." },
        { p: "At expiry, options that are in the money are exercised automatically. Index options are settled in cash at the final settlement price. Stock options are settled by delivery: the buyer of an ITM call pays the strike and receives the shares; the buyer of an ITM put delivers the shares and receives the strike." },
        { p: "An exercised option pays securities transaction tax of 0.15% of its intrinsic value, charged to the buyer (from 1 April 2026, as announced in the Finance Act, 2026; module 8)." },
        { note: CHECK },
      ],
      example: { title: "An index call and a stock call at expiry", steps: [
        "Index call 24,000, lot 65 (illustrative); final settlement price 24,060. Intrinsic value 60 × 65 = ₹3,900 is paid in cash.",
        "STT on exercise: 0.15% × ₹3,900 = ₹5.85, paid by the buyer.",
        "Stock call 1,200, lot 500 (illustrative); final settlement price 1,230. The buyer pays 1,200 × 500 = ₹6,00,000 and receives 500 shares worth ₹6,15,000.",
      ], result: "An index option ends in cash; a stock option ends in a delivery worth the whole contract." },
      quiz: [
        { q: "When can an NSE option be exercised?", options: [
          { text: "Any day before expiry", why: "That describes American options; NSE's are European." },
          { text: "Only at expiry", correct: true, why: "Right: before expiry, positions are closed by an opposite trade." },
          { text: "Only on the first day of the month", why: "There is no such rule." },
        ] },
        { q: "How is an ITM stock call settled at expiry?", options: [
          { text: "The buyer pays the strike and receives the shares", correct: true, why: "Right: stock options are physically settled." },
          { text: "In cash, like an index option", why: "Cash settlement applies to index options." },
          { text: "It expires worthless because stock options cannot be exercised", why: "ITM stock options are exercised automatically." },
        ] },
        { q: "An index call ends 40 points in the money, lot 65. What is the STT on exercise at 0.15%?", options: [
          { text: "₹3.90", correct: true, why: "Right: intrinsic value 40 × 65 = ₹2,600, and 0.15% of it is ₹3.90." },
          { text: "₹390", why: "That uses 15% instead of 0.15%." },
          { text: "₹0, since exercise is tax-free", why: "STT applies to exercised options." },
        ] },
      ],
    },
  ],
};
