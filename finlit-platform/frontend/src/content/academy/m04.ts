// F&O Academy, module 4: the option Greeks in plain words. Every figure comes from lib/blackScholes.ts with the inputs stated in the
// example (index 24,000, strike 24,000, implied volatility 14%, interest rate 6.5%, no dividend yield, lot size 65 illustrative).
import type { Module } from "./types";

const SETUP = "Model inputs: index 24,000, strike 24,000 (at the money), implied volatility 14% a year, interest rate 6.5% a year, no dividends; lot size 65 (illustrative).";

export const M4: Module = {
  n: 4, id: "greeks", title: "Option Greeks in plain words", line: "Delta, gamma, theta and vega: how a premium responds to price, time and volatility.",
  lessons: [
    {
      id: "delta", title: "Delta: how much the premium moves with the price", summary: "The change in the premium for a ₹1 move in the underlying; calls between 0 and 1, puts between −1 and 0.",
      body: [
        { p: "Delta is the change in an option's premium for a ₹1 change in the underlying. A call's delta is between 0 and 1; a put's is between −1 and 0. At the money, a call's delta is near 0.5; deep in the money it is near 1; far out of the money, near 0." },
        { p: "Delta × lot size gives the position's exposure in units of the underlying. The writer of an option has the opposite delta of the buyer." },
        { note: "Delta is a slope at today's price. For larger moves it changes (that is gamma), so delta × move is an estimate, not an exact result." },
      ],
      example: { title: "An at-the-money call, 30 days out", steps: [
        SETUP,
        "The call's model premium is about ₹450.6 and its delta about 0.561; the put's delta is about −0.439.",
        "A 100-point rise: delta suggests about 0.561 × 100 = 56.1 points. The model's new premium is about ₹508.7, a rise of about 58.1 (the extra 2 points come from gamma).",
        "Position delta for one lot: 0.561 × 65 ≈ 36.5 units, so a 10-point move changes the lot by about ₹365.",
      ], result: "One lot of this call moves roughly like 36 units of the index, and that number itself changes as the price moves." },
      quiz: [
        { q: "What does a call delta of 0.6 mean?", options: [
          { text: "There is a 60% chance of profit", why: "Delta is a rate of change in the premium; reading it as a probability is only a rough shortcut, and it is not a chance of profit." },
          { text: "The premium changes by about ₹0.60 for a ₹1 move in the underlying", correct: true, why: "Right: that is the definition of delta." },
          { text: "The option loses 0.6 a day", why: "Daily decay is theta, not delta." },
        ] },
        { q: "What range does a put's delta fall in?", options: [
          { text: "From 0 to 1", why: "That is a call's range." },
          { text: "From −1 to 0", correct: true, why: "Right: a put gains when the price falls, so its delta is negative." },
          { text: "Any number, positive or negative", why: "A single option's delta is bounded between −1 and 1." },
        ] },
        { q: "A call has a delta of 0.5 and a lot size of 65. About how much does one lot change for a 20-point rise?", options: [
          { text: "₹650", correct: true, why: "Right: 0.5 × 20 × 65 = ₹650 (an estimate)." },
          { text: "₹1,300", why: "That would need a delta of 1." },
          { text: "₹10", why: "That is the change per unit, not for the lot." },
        ] },
      ],
    },
    {
      id: "gamma", title: "Gamma: how fast delta changes", summary: "The change in delta for a ₹1 move; largest at the money and close to expiry.",
      body: [
        { p: "Gamma is the change in delta for a ₹1 change in the underlying. The buyer of an option has positive gamma: delta moves in the buyer's favour as the price moves. The writer has negative gamma: delta moves against the writer." },
        { p: "Gamma is largest for options at the money, and it rises sharply as expiry comes closer. That is why premiums of near-expiry, at-the-money options can swing from small to large within minutes." },
      ],
      example: { title: "The same at-the-money call at 30 days and at 2 days", steps: [
        SETUP,
        "30 days to expiry: gamma about 0.00041. After a 100-point move, delta changes by about 0.041.",
        "2 days to expiry: gamma about 0.0016, nearly four times as large. After the same 100-point move, delta changes by about 0.16.",
        "For one lot of 65, a delta change of 0.16 is about 10.4 units of exposure: each further 10-point move then changes the lot by about ₹104 more than before the first move.",
      ], result: "Close to expiry, the same price move changes the position's exposure about four times as much." },
      quiz: [
        { q: "Where is gamma largest?", options: [
          { text: "Far out of the money, a long time from expiry", why: "Gamma is small there." },
          { text: "At the money, close to expiry", correct: true, why: "Right: that is where delta can jump fastest." },
          { text: "Deep in the money, a long time from expiry", why: "Deep ITM options have a delta near 1 that barely changes." },
        ] },
        { q: "Who has negative gamma?", options: [
          { text: "The buyer of a call", why: "The buyer of any option has positive gamma." },
          { text: "The buyer of a put", why: "The buyer of any option has positive gamma." },
          { text: "The writer of an option", correct: true, why: "Right: the writer's delta moves against them as the price moves." },
        ] },
        { q: "Delta is 0.50 and gamma 0.0016. After a 50-point rise, delta is about:", options: [
          { text: "0.58", correct: true, why: "Right: 0.50 + 0.0016 × 50 = 0.58." },
          { text: "0.51", why: "That uses a smaller gamma." },
          { text: "1.30", why: "Delta of a call cannot exceed 1." },
        ] },
      ],
    },
    {
      id: "theta", title: "Theta: time decay", summary: "The change in premium from one day passing, all else equal; it speeds up near expiry for at-the-money options.",
      body: [
        { p: "Theta is the change in an option's premium from one day passing, with everything else the same. For the buyer it is usually negative: time value melts away. For the writer it is the other side of the same number." },
        { p: "Time decay is not even. For at-the-money options it speeds up as expiry comes closer, because the time value left has to fall to zero by expiry. Far out-of-the-money options have little time value left to lose." },
        { note: "Theta here is per calendar day (365 days a year), the convention the explorer uses. Some platforms quote it per trading day, which gives larger numbers." },
      ],
      example: { title: "Daily decay at 30 days and at 2 days", steps: [
        SETUP,
        "30 days to expiry: theta about −8.65 points a day, about −₹562 a lot a day.",
        "2 days to expiry: theta about −26.97 points a day, about −₹1,753 a lot a day.",
      ], result: "In this example the daily decay is about three times faster with 2 days left than with 30." },
      quiz: [
        { q: "What does a theta of −10 mean for the buyer of an option?", options: [
          { text: "The premium falls about ₹10 a unit for each day that passes, all else equal", correct: true, why: "Right: theta measures time decay." },
          { text: "The premium falls ₹10 when the price falls ₹1", why: "That would be delta." },
          { text: "The option expires in 10 days", why: "Theta is a rate of decay, not a count of days." },
        ] },
        { q: "How does theta change for an at-the-money option as expiry comes closer?", options: [
          { text: "It becomes smaller", why: "For ATM options it grows larger close to expiry." },
          { text: "It stays the same every day", why: "Decay is uneven; it speeds up." },
          { text: "It becomes larger", correct: true, why: "Right: the remaining time value has to reach zero by expiry." },
        ] },
        { q: "With theta at −26.97 a day and lot size 65, about how much does one lot lose to a day of decay?", options: [
          { text: "₹27", why: "That is per unit; the lot has 65 units." },
          { text: "₹1,753", correct: true, why: "Right: 26.97 × 65 ≈ ₹1,753." },
          { text: "₹26,970", why: "That multiplies by 1,000 instead of 65." },
        ] },
      ],
    },
    {
      id: "vega", title: "Vega: sensitivity to volatility", summary: "The change in premium for a 1-point change in implied volatility; largest for longer-dated options.",
      body: [
        { p: "Vega is the change in an option's premium for a change of 1 point in implied volatility (for example from 14% to 15%). Both calls and puts gain value when implied volatility rises, so the buyer has positive vega and the writer negative vega." },
        { p: "Vega is largest at the money and for options with more time left. Close to expiry, vega is small: the premium depends mostly on where the price is." },
      ],
      example: { title: "Vega at 30 days and at 2 days", steps: [
        SETUP,
        "30 days to expiry: vega about 27.1 points per volatility point. If implied volatility rises from 14% to 16%, the premium rises about 54 points, about ₹3,527 a lot.",
        "2 days to expiry: vega about 7.1, so the same 2-point rise adds only about 14 points.",
      ], result: "A change in volatility matters most for options with time left; module 6 shows when implied volatility tends to change." },
      quiz: [
        { q: "Implied volatility rises from 14% to 15%. What happens to a call and a put on the same strike, all else equal?", options: [
          { text: "The call gains and the put loses", why: "Volatility raises both calls and puts." },
          { text: "Both gain, by about their vega", correct: true, why: "Right: higher volatility makes both rights more valuable." },
          { text: "Both lose", why: "Both gain when volatility rises." },
        ] },
        { q: "For which option is vega larger?", options: [
          { text: "At the money with 30 days left", correct: true, why: "Right: vega is largest at the money and with more time left." },
          { text: "At the money with 1 day left", why: "Near expiry, vega is small." },
          { text: "Far out of the money with 1 day left", why: "Such an option has almost no time value for volatility to change." },
        ] },
        { q: "Vega is 27 and implied volatility falls 3 points. About how much does the premium change?", options: [
          { text: "+81 points", why: "A fall in volatility lowers the premium." },
          { text: "−3 points", why: "Each volatility point is worth vega, 27 points." },
          { text: "−81 points", correct: true, why: "Right: 27 × 3 = 81 points lower." },
        ] },
      ],
    },
    {
      id: "black-scholes-explorer", title: "The Black-Scholes model and the Greeks explorer", summary: "The model behind the Greeks, its assumptions, and an explorer to see each Greek change with price and days left.",
      body: [
        { p: "The Greeks in this module come from the Black-Scholes model (with Merton's dividend adjustment). It prices a European option from five inputs: the underlying's price, the strike, the time to expiry, the interest rate and the volatility (plus a dividend yield)." },
        { list: [
          "Assumptions: the option is European; the underlying's returns are normally distributed (prices lognormal) with one constant volatility; the interest rate and dividend yield are constant; there are no costs or taxes; trading is possible at any moment and in any size.",
          "Real markets break these assumptions: prices jump, volatility changes, and options at different strikes trade at different implied volatilities (module 6).",
          "Traders therefore use the model mainly to turn premiums into implied volatilities and to read the Greeks, not as a fair price.",
        ] },
        { formula: "Call = S·e^(−qT)·N(d1) − K·e^(−rT)·N(d2);  d1 = [ln(S/K) + (r − q + σ²/2)T] ÷ (σ√T);  d2 = d1 − σ√T", what: "S spot, K strike, T years to expiry, r rate, q dividend yield, σ volatility, N the normal distribution. The put follows from put-call parity." },
        { p: "Use the explorer below: choose a Greek, then move the price, the days left or the volatility, and point at the chart to read every Greek at that price for three different times to expiry." },
      ],
      widget: { kind: "greeks" },
      example: { title: "Checking the model against a textbook case", steps: [
        "Inputs: spot 49, strike 50, 0.3846 years, rate 5%, volatility 20%, no dividends (the standard textbook example).",
        "The model gives a call premium of about 2.40, delta 0.522, gamma 0.066, vega 0.121 per volatility point.",
        "This page's explorer uses the same formulas, so it gives the same values for the same inputs.",
        "With this module's own inputs (index 24,000, 30 days, IV 14%), the explorer shows a call premium of about ₹450.6 a unit: about ₹29,287 for a lot of 65.",
      ], result: "The explorer's numbers are the model's, with its assumptions; they describe the model, not what a market price will be." },
      quiz: [
        { q: "Which of these is an assumption of the Black-Scholes model?", options: [
          { text: "Volatility changes every day", why: "The model assumes one constant volatility." },
          { text: "One constant volatility until expiry", correct: true, why: "Right: that is one of the model's main simplifications." },
          { text: "Options can be exercised any day", why: "The model prices European options, exercised only at expiry." },
        ] },
        { q: "Why do traders quote implied volatility instead of the model's price?", options: [
          { text: "Because the model's assumptions are not met exactly, so the market's premium is turned into the volatility that matches it", correct: true, why: "Right: implied volatility is a common way to compare premiums." },
          { text: "Because the exchange requires it", why: "There is no such requirement." },
          { text: "Because the model cannot compute a price", why: "It can; the price is simply not the market's." },
        ] },
        { q: "Which input is not needed by the Black-Scholes model?", options: [
          { text: "Time to expiry", why: "Time to expiry is one of the inputs." },
          { text: "Volatility", why: "Volatility is one of the inputs." },
          { text: "The trader's view of the market", correct: true, why: "Right: the model uses no view on direction." },
        ] },
      ],
    },
  ],
};
