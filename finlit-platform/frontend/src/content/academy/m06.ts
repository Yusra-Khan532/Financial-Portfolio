// F&O Academy, module 6: volatility and implied volatility. Model figures come from lib/blackScholes.ts with the inputs stated.
import type { Module } from "./types";

export const M6: Module = {
  n: 6, id: "volatility", title: "Volatility and implied volatility", line: "Historical volatility, implied volatility, India VIX, the skew and what events do to premiums.",
  lessons: [
    {
      id: "historical-volatility", title: "Historical volatility", summary: "How much prices have moved: the standard deviation of daily returns, scaled to a year.",
      body: [
        { p: "Historical (realised) volatility measures how much the underlying's price has actually moved over a past window. It is the standard deviation of daily returns, scaled to a year." },
        { formula: "Annual volatility ≈ standard deviation of daily log returns × √252", what: "252 is the usual count of trading days in a year. The window (20 days, a year) changes the number, so every figure needs to say its window." },
        { p: "Historical volatility looks back. It says how bumpy the past was, not how bumpy the future is." },
      ],
      example: { title: "From daily moves to an annual figure", steps: [
        "Over the last 20 trading days, the standard deviation of an index's daily log returns was 1.0%.",
        "√252 ≈ 15.87.",
        "Annual historical volatility ≈ 1.0% × 15.87 ≈ 15.9% (20-day window).",
        "On one futures lot of 65 at 24,000 (₹15,60,000 of exposure), a typical 1% day is about ₹15,600.",
      ], result: "A 1% typical daily move corresponds to about 16% a year." },
      quiz: [
        { q: "Daily returns have a standard deviation of 0.5%. What is the annual volatility, using √252 ≈ 15.87?", options: [
          { text: "About 7.9%", correct: true, why: "Right: 0.5% × 15.87 ≈ 7.9%." },
          { text: "About 126%", why: "That multiplies by 252 instead of its square root." },
          { text: "0.5%", why: "That is the daily figure, not the annual one." },
        ] },
        { q: "What does historical volatility describe?", options: [
          { text: "How much prices will move next month", why: "It looks back, not forward." },
          { text: "How much prices moved over a past window", correct: true, why: "Right: it is a measure of past movement." },
          { text: "The premium of an option", why: "Premiums depend on implied volatility, which can differ." },
        ] },
        { q: "Why does a historical volatility figure need to state its window?", options: [
          { text: "Because the exchange requires it", why: "It is about honest numbers, not an exchange rule." },
          { text: "Because the window changes nothing", why: "It changes the number a lot." },
          { text: "Because 20 days and one year can give very different numbers", correct: true, why: "Right: the window is part of what the figure means." },
        ] },
      ],
    },
    {
      id: "implied-volatility", title: "Implied volatility", summary: "The volatility that makes the model's price equal the market premium; how the market prices options, in one number.",
      body: [
        { p: "Implied volatility (IV) works the model backwards: given an option's market premium, it is the volatility at which the Black-Scholes price equals that premium. Higher premiums, all else equal, mean higher IV." },
        { p: "IV lets premiums be compared across strikes, expiries and underlyings. It reflects supply and demand for options, not only past price moves, so it can be above or below historical volatility." },
        { p: "Use the box below: enter a premium and the contract's details to see the volatility it implies under the model's assumptions." },
      ],
      widget: { kind: "iv" },
      example: { title: "From a premium to an IV", steps: [
        "Index 24,000; 24,000 call; 30 days to expiry; interest rate 6.5%; no dividends.",
        "The market premium is ₹400.",
        "The volatility that makes the model's price ₹400 is about 12.1% a year.",
        "At 14% volatility the model would price the same call at about ₹450.6.",
      ], result: "A premium of ₹400 implies about 12.1% volatility; a higher premium would imply more." },
      quiz: [
        { q: "What is implied volatility?", options: [
          { text: "The volatility at which the model's price equals the market premium", correct: true, why: "Right: it is solved from the premium." },
          { text: "The volatility of the last 20 days", why: "That is historical volatility." },
          { text: "A volatility the exchange publishes for each strike by rule", why: "It comes from market premiums, not an exchange rule." },
        ] },
        { q: "All else equal, the premium of a call rises. What happens to its IV?", options: [
          { text: "It falls", why: "A higher premium needs a higher volatility in the model." },
          { text: "It rises", correct: true, why: "Right: premium and IV move together, all else equal." },
          { text: "It does not change", why: "IV is computed from the premium, so it changes with it." },
        ] },
        { q: "Can IV be higher than historical volatility?", options: [
          { text: "No, the two are always equal", why: "They are different measures and often differ." },
          { text: "Only for put options", why: "It can happen for calls and puts." },
          { text: "Yes: IV reflects demand for options, not only past moves", correct: true, why: "Right: they often differ." },
        ] },
      ],
    },
    {
      id: "india-vix", title: "India VIX", summary: "NSE's index of the Nifty 50's implied volatility over the next 30 days, as an annual percentage.",
      body: [
        { p: "India VIX is computed by NSE from the bid and ask prices of Nifty 50 options. It expresses the volatility the options market implies for the next 30 calendar days, as an annual percentage." },
        { formula: "Rough 30-day range of one standard deviation ≈ VIX × √(30 ÷ 365)", what: "A rough way to turn the annual figure into a 30-day one; it assumes normally distributed returns, which real markets do not follow exactly." },
        { p: "VIX tends to be higher in falling, uncertain markets and lower in calm ones. It measures expected size of moves, not their direction." },
      ],
      example: { title: "Turning a VIX of 14 into a 30-day range", steps: [
        "India VIX = 14.",
        "√(30 ÷ 365) ≈ 0.2867.",
        "14% × 0.2867 ≈ 4.0%: with the Nifty at 24,000, one standard deviation over 30 days is about ±960 points under the model's assumptions.",
        "For one futures lot of 65 at 24,000 (₹15,60,000), ±960 points is about ±₹62,400.",
      ], result: "A VIX of 14 describes moves of about 4% over a month as one standard deviation; larger moves happen too." },
      quiz: [
        { q: "What does India VIX measure?", options: [
          { text: "Which way the Nifty 50 moves next", why: "VIX measures the size of expected moves, not the direction." },
          { text: "The Nifty 50's implied volatility for the next 30 days, as an annual percentage", correct: true, why: "Right: it is computed from Nifty 50 option prices." },
          { text: "The number of open Nifty contracts", why: "That would be open interest." },
        ] },
        { q: "India VIX is 20. Roughly what is one standard deviation over 30 days, using √(30 ÷ 365) ≈ 0.287?", options: [
          { text: "About 5.7%", correct: true, why: "Right: 20% × 0.287 ≈ 5.7%." },
          { text: "About 20%", why: "20% is the annual figure." },
          { text: "About 0.6%", why: "That is closer to a one-day figure." },
        ] },
        { q: "Which statement about VIX is accurate?", options: [
          { text: "A high VIX means prices go up", why: "VIX does not show direction." },
          { text: "VIX is set by SEBI each week", why: "NSE computes it from option prices throughout the day." },
          { text: "A high VIX means the options market prices larger moves", correct: true, why: "Right: it is about the size of moves." },
        ] },
      ],
    },
    {
      id: "skew-and-smile", title: "The skew and the smile", summary: "Different strikes trade at different implied volatilities; index puts below the price often carry higher IV.",
      body: [
        { p: "If the Black-Scholes assumptions were true, every strike of one expiry would have the same IV. In practice it differs by strike. Plotted against strike, IV often forms a slope (a skew) or a curve (a smile)." },
        { p: "In index options, puts with strikes below the current price often trade at higher IVs than calls above it, as demand for protection against falls is steady. This pattern changes over time and from one underlying to another." },
        { note: "Because of the skew, an IV is always tied to its strike and expiry. Quoting one IV for a whole underlying is a simplification." },
      ],
      example: { title: "Three IVs on one expiry", steps: [
        "Index at 24,000; 10 days to expiry (illustrative figures).",
        "23,500 put: IV 16.5%. 24,000 (at the money): IV 13.8%. 24,500 call: IV 12.6%.",
        "IV falls from the lower strike to the higher strike: a skew.",
        "For an option with a vega of 10 points (illustrative), the 2.7-point gap between 16.5% and 13.8% is worth 27 points: ₹1,755 for a lot of 65.",
      ], result: "One expiry, three implied volatilities: market prices do not meet the model's single-volatility assumption." },
      quiz: [
        { q: "What is the volatility skew?", options: [
          { text: "IV that differs across strikes of the same expiry", correct: true, why: "Right: a slope of IV against strike." },
          { text: "The difference between futures and spot", why: "That is the basis." },
          { text: "A fee for out-of-the-money options", why: "There is no such fee." },
        ] },
        { q: "In index options, which often has a higher IV?", options: [
          { text: "Calls far above the price", why: "In index options the higher IVs usually sit on lower-strike puts." },
          { text: "Puts below the current price", correct: true, why: "Right: steady demand for protection is the usual explanation." },
          { text: "Neither: all strikes always have the same IV", why: "That is the model's assumption, not what markets show." },
        ] },
        { q: "What does the skew show about the Black-Scholes model?", options: [
          { text: "That the model is exact", why: "The skew is evidence against one of its assumptions." },
          { text: "That the model cannot price puts", why: "It can; the skew shows the inputs differ by strike." },
          { text: "That one constant volatility does not match market prices", correct: true, why: "Right: different strikes imply different volatilities." },
        ] },
      ],
    },
    {
      id: "events-and-iv", title: "Events and IV", summary: "IV often rises before scheduled events and falls after them, which can lower premiums even when the price moves.",
      body: [
        { p: "Before scheduled events such as company results, the Union Budget or an RBI policy decision, implied volatility has often risen, because a larger move is possible. Once the event is out, IV has often fallen back. This fall is called volatility crush." },
        { p: "A fall in IV lowers premiums through vega. A buyer of an option can see the premium fall after an event even when the price moved in the buyer's favour, if the IV fall outweighs the move." },
      ],
      example: { title: "A premium before and after an event", steps: [
        "Index 24,000; 24,000 call; 10 days to expiry; rate 6.5%; no dividends.",
        "Before the event, at IV 18%, the model's premium is about ₹306.9 (vega about 15.8).",
        "After the event, at IV 13% with the price unchanged, the premium is about ₹227.9: about 79 points lower.",
        "For one lot of 65 (illustrative), that is about ₹5,130 less, from the change in IV alone.",
      ], result: "A 5-point fall in IV cost about 79 points, close to vega × 5 = 79." },
      quiz: [
        { q: "What is volatility crush?", options: [
          { text: "A sharp fall in IV after an event", correct: true, why: "Right: premiums fall with it." },
          { text: "A sharp fall in the underlying's price", why: "It refers to implied volatility, not the price." },
          { text: "A rule that limits volatility on expiry day", why: "There is no such rule." },
        ] },
        { q: "Vega is 15.8 and IV falls 5 points. About how much does the premium change, all else equal?", options: [
          { text: "+79 points", why: "A fall in IV lowers the premium." },
          { text: "−79 points", correct: true, why: "Right: 15.8 × 5 ≈ 79." },
          { text: "−5 points", why: "Each IV point is worth vega, 15.8 points." },
        ] },
        { q: "The price moves in the buyer's favour after results, but the call's premium falls. What can explain it?", options: [
          { text: "The exchange changed the strike", why: "Strikes of a listed contract do not change." },
          { text: "Delta became negative", why: "A call's delta is never negative." },
          { text: "A fall in IV outweighed the gain from the price move", correct: true, why: "Right: vega losses can exceed delta gains." },
        ] },
      ],
    },
  ],
};
