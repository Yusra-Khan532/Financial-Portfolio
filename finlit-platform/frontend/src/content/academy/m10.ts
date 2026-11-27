// F&O Academy, module 10: rules and protections, as announced, each with its circular and date. Rules change: every lesson says so.
// Effective dates follow SEBI's own record of them (the July 2025 study's Table 1), which differ in places from the 2024 circular's first timeline.
import { SRC } from "./sources";
import { CHECK, type Module } from "./types";

export const M10: Module = {
  n: 10, id: "rules", title: "Rules and protections", line: "SEBI's F&O measures as announced, with their circulars and dates, and the protections every trader has.",
  lessons: [
    {
      id: "sebi-measures-2024", title: "SEBI's measures of 1 October 2024", summary: "Six measures for index derivatives, phased in from November 2024 to April 2025.",
      body: [
        { p: "SEBI's circular SEBI/HO/MRD/TPD/P/CIR/2024/132 of 1 October 2024 set out measures to strengthen the equity index derivatives framework, following an expert working group's review. As SEBI's July 2025 study records, they took effect as follows:" },
        { list: [
          "Weekly index derivatives rationalised to one benchmark index per exchange: 20 November 2024.",
          "More tail-risk cover on expiry day (an extra 2% extreme loss margin on written options): 20 November 2024.",
          "Larger minimum contract size for index derivatives: 2 January 2025 on NSE.",
          "Upfront collection of option premium from buyers: 10 February 2025.",
          "Removal of the calendar spread treatment on expiry day: 10 February 2025.",
          "Intraday monitoring of position limits: 1 April 2025 (penalties for intraday breaches in index derivatives were exempted by a circular of 28 March 2025, until further directions).",
        ] },
        { note: CHECK },
      ],
      example: { title: "Which measure touches which trade", steps: [
        "A trader opens one lot of a weekly Nifty 50 option: the weekly contract exists because the Nifty 50 is NSE's one benchmark index for weekly expiries.",
        "The trader pays the full premium before the order goes through: upfront collection.",
        "Another trader writes the same option on its expiry day: the margin includes the extra 2% extreme loss margin.",
        "For a written position in an index contract worth ₹15,92,500, the extra 2% extreme loss margin on expiry day is 2% × ₹15,92,500 = ₹31,850 more margin.",
      ], result: "Each measure shows up at a specific point in a trade; together they change contract size, timing and margins." },
      quiz: [
        { q: "From when were option premiums collected upfront from buyers, as SEBI recorded?", options: [
          { text: "10 February 2025", correct: true, why: "Right, as SEBI's July 2025 study records." },
          { text: "1 October 2024", why: "That is the circular's date, not when this measure took effect." },
          { text: "1 April 2026", why: "That is when the STT rates changed." },
        ] },
        { q: "How many indices may each exchange offer weekly expiries on after these measures?", options: [
          { text: "Three", why: "The measures allow one benchmark index." },
          { text: "One benchmark index", correct: true, why: "Right, from 20 November 2024." },
          { text: "None", why: "Weekly expiries continue on one index." },
        ] },
        { q: "What did the measures add on expiry day for written options?", options: [
          { text: "A ban on new positions", why: "No ban; a higher margin." },
          { text: "A lower margin", why: "The margin was raised." },
          { text: "An extra 2% extreme loss margin", correct: true, why: "Right: more cover for expiry-day tail risk." },
        ] },
      ],
      sources: [SRC.oct2024, SRC.study2025],
    },
    {
      id: "contract-size-and-expiry-days", title: "Contract size and expiry days", summary: "₹15 lakh minimum index contract value at introduction, and expiries on Tuesday or Thursday only.",
      body: [
        { p: "Under the October 2024 measures, an index derivatives contract must be worth at least ₹15 lakh when introduced, and its lot size is set so that its value stays between ₹15 lakh and ₹20 lakh when reviewed. Exchanges revise lot sizes by circular when prices move the value outside that range." },
        { p: "SEBI's circular SEBI/HO/MRD/MRD-TPD-1/P/CIR/2025/76 of 26 May 2025 limited each exchange's equity derivatives expiries to either Tuesday or Thursday. NSE moved to Tuesday for contracts expiring from 1 September 2025; BSE moved to Thursday." },
        { note: CHECK },
      ],
      example: { title: "The smallest lot that meets the minimum", steps: [
        "Index at 24,500. The contract must be worth at least ₹15,00,000.",
        "15,00,000 ÷ 24,500 ≈ 61.2, so the lot must be at least 62 units (exchanges then round to their own multiples).",
        "A lot of 65 gives 24,500 × 65 = ₹15,92,500, inside ₹15–20 lakh.",
      ], result: "Contract size is set in rupees; the lot size follows from the index level." },
      quiz: [
        { q: "An index is at 20,000. What is the smallest whole lot worth at least ₹15 lakh?", options: [
          { text: "75 units", correct: true, why: "Right: 15,00,000 ÷ 20,000 = 75." },
          { text: "50 units", why: "50 × 20,000 = ₹10 lakh, below the minimum." },
          { text: "100 units", why: "100 works, but 75 is the smallest." },
        ] },
        { q: "On which days may an exchange set equity derivatives expiries under the circular of 26 May 2025?", options: [
          { text: "Any weekday", why: "The circular limits it to two weekdays." },
          { text: "Tuesday or Thursday", correct: true, why: "Right; NSE chose Tuesday." },
          { text: "Only the last Friday of the month", why: "Friday is not one of the allowed days." },
        ] },
        { q: "What happens when a rise in the index takes a contract's value above ₹20 lakh?", options: [
          { text: "The contract is delisted", why: "The lot size is revised instead." },
          { text: "The exchange revises the lot size at its next review", correct: true, why: "Right, announced by circular." },
          { text: "Nothing changes ever", why: "Lot sizes are reviewed to keep values in range." },
        ] },
      ],
      sources: [SRC.oct2024, { label: "SEBI circular SEBI/HO/MRD/MRD-TPD-1/P/CIR/2025/76, 26 May 2025: expiry days (in SEBI's circulars list)", url: SRC.circulars.url }],
    },
    {
      id: "premium-and-spread-margins", title: "Upfront premium and calendar spreads", summary: "The full premium is collected before an option position opens, and expiring contracts lose their offset with other months.",
      body: [
        { p: "Upfront premium: since 10 February 2025, the buyer of an option must have the full premium with the broker before the position is opened, so no option position is opened on credit or intraday leverage." },
        { p: "Calendar spread treatment: a position in one expiry hedged by an opposite position in another used to get a margin benefit. On the expiry day of the nearer contract, that benefit no longer applies (since 10 February 2025), so margins on such pairs rise on that day." },
        { note: CHECK },
      ],
      example: { title: "What must be in the account", steps: [
        "The buyer of 2 lots (65 each, illustrative) at a premium of ₹120 must have 2 × 65 × 120 = ₹15,600 with the broker before the order.",
        "A trader with a long position in this month's future and a short position in next month's future sees the margin benefit on the pair removed on this month's expiry day.",
      ], result: "Both rules change how much money must be in place, and when." },
      quiz: [
        { q: "The buyer of 3 lots of 65 at ₹50 needs how much with the broker upfront?", options: [
          { text: "₹9,750", correct: true, why: "Right: 3 × 65 × 50." },
          { text: "₹3,250", why: "That is one lot." },
          { text: "₹150", why: "That is per-unit premium × lots." },
        ] },
        { q: "What changed for calendar spreads on expiry day?", options: [
          { text: "They were banned", why: "They are allowed; only the margin benefit is removed on that day." },
          { text: "The margin benefit no longer applies on the expiry day of the nearer contract", correct: true, why: "Right, since 10 February 2025." },
          { text: "They get a larger margin benefit", why: "The benefit is removed, not enlarged." },
        ] },
        { q: "Why collect the premium upfront?", options: [
          { text: "So that option positions are not opened on credit", correct: true, why: "Right: it removes leverage on the premium." },
          { text: "To pay the writer a bonus", why: "The writer receives only the premium." },
          { text: "To lower STT", why: "It has no effect on STT." },
        ] },
      ],
      sources: [SRC.oct2024, SRC.study2025],
    },
    {
      id: "position-limits", title: "Position limits and intraday monitoring", summary: "Limits on how large a position one entity can carry in index options, checked during the day as well as at the close.",
      body: [
        { p: "Position limits cap how large a position one entity can carry. They mostly concern large traders and institutions, but they shape the market everyone trades in." },
        { list: [
          "Intraday monitoring: from 1 April 2025, under the October 2024 measures, position limits in index derivatives are checked during the day, not only at the close.",
          "SEBI's circular SEBI/HO/MRD/TPD-1/P/CIR/2025/79 of 29 May 2025 changed how positions are measured, to a futures-equivalent (delta-based) basis, and set end-of-day limits for index options of ₹1,500 crore net and ₹10,000 crore gross per entity.",
          "SEBI's circular SEBI/HO/MRD/TPD/CIR/P/2025/122 of 1 September 2025 set intraday limits for index options of ₹5,000 crore net and ₹10,000 crore gross, on a futures-equivalent basis, applied by the exchanges from 1 October 2025.",
        ] },
        { note: CHECK },
      ],
      example: { title: "A futures-equivalent position", steps: [
        "An entity has written 1,000 lots of an index call with a delta of 0.40; lot 65 (illustrative); index at 24,000.",
        "Futures-equivalent units: 1,000 × 65 × 0.40 = 26,000 units, short.",
        "Futures-equivalent value: 26,000 × 24,000 = ₹62.4 crore, measured against the entity's limits.",
      ], result: "Delta-based measurement counts an option position by how much it moves like the index, not by its number of lots." },
      quiz: [
        { q: "What is a futures-equivalent (delta-based) position?", options: [
          { text: "The option position multiplied by its delta, so it is counted by how much it moves like the underlying", correct: true, why: "Right: delta turns lots into an exposure to the underlying." },
          { text: "The number of lots, whatever the delta", why: "That is the older notional count." },
          { text: "The premium paid", why: "Premium is not the measure." },
        ] },
        { q: "Whom do these position limits mostly concern?", options: [
          { text: "Every individual with one lot", why: "The limits are in thousands of crores, far above an individual's lot." },
          { text: "Large traders and institutions", correct: true, why: "Right, though they shape the market for everyone." },
          { text: "Only brokers' own staff", why: "They apply to every entity." },
        ] },
        { q: "What did the circular of 1 September 2025 set for index options intraday, as announced?", options: [
          { text: "₹5,000 crore net and ₹10,000 crore gross per entity, futures-equivalent", correct: true, why: "Right, applied from 1 October 2025." },
          { text: "₹1 crore per individual", why: "No such limit was set." },
          { text: "No limits at all", why: "Limits were set." },
        ] },
      ],
      sources: [SRC.oct2024, { label: "SEBI circulars of 29 May 2025 (SEBI/HO/MRD/TPD-1/P/CIR/2025/79) and 1 September 2025 (SEBI/HO/MRD/TPD/CIR/P/2025/122), in SEBI's circulars list", url: SRC.circulars.url }],
    },
    {
      id: "investor-protections", title: "Protections every trader has", summary: "The risk disclosure at login, registered advisers only, and where to complain.",
      body: [
        { list: [
          "Risk disclosure: SEBI's circular SEBI/HO/MIRSD/MIRSD-PoD-1/P/CIR/2023/73 of 19 May 2023 requires brokers to show individual F&O traders a risk disclosure, drawn from SEBI's studies, when they log in and when they sign up for F&O (from 1 July 2023).",
          "Advice: only investment advisers and research analysts registered with SEBI may give investment advice or research for a fee. Their registration can be checked on SEBI's website.",
          "Complaints: complaints against a broker go first to the broker, then to the exchange and to SEBI's complaints system (SCORES), and can go on to online dispute resolution.",
          "Contract notes: every trade is confirmed by a contract note listing its price and every charge; brokers' statements of funds and securities can be checked against the exchange's and depository's messages.",
        ] },
        { note: CHECK },
      ],
      example: { title: "Checking a trade's charges", steps: [
        "A trader receives the contract note for one options round trip.",
        "It lists brokerage, STT, exchange charges, SEBI fee, stamp duty and GST for each order.",
        "The trader compares the total with the costs calculator in module 8 (₹65.11 for the module's example); a difference of a few paise is rounding.",
      ], result: "The contract note is the record of every charge; differences beyond rounding can be raised with the broker." },
      quiz: [
        { q: "When must a broker show the F&O risk disclosure, under the circular of 19 May 2023?", options: [
          { text: "At login and when the client signs up for F&O", correct: true, why: "Right, from 1 July 2023." },
          { text: "Only once a year", why: "It is shown at each login." },
          { text: "Only after a loss", why: "It is shown whatever the results." },
        ] },
        { q: "Who may give investment advice for a fee in India?", options: [
          { text: "Anyone with a large social media following", why: "Paid advice needs SEBI registration." },
          { text: "Investment advisers and research analysts registered with SEBI", correct: true, why: "Right; registration can be checked on SEBI's site." },
          { text: "Any broker's customer", why: "Registration is required." },
        ] },
        { q: "Where can a complaint against a broker go after the broker itself?", options: [
          { text: "Nowhere", why: "There is a route beyond the broker." },
          { text: "Only to a court", why: "The exchange and SCORES come first." },
          { text: "To the exchange and SEBI's SCORES system", correct: true, why: "Right, and on to online dispute resolution." },
        ] },
      ],
      sources: [SRC.risk2023, { label: "SEBI SCORES complaints system", url: "https://scores.sebi.gov.in/" }],
    },
  ],
};
