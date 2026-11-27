// F&O Academy, module 8: costs and taxes. Rates as announced, with their sources (lib/fnoCosts.ts holds the same rates for the calculator).
// Tax is described in general terms only; the lessons say to consult a professional.
import { SRC } from "./sources";
import { CHECK, type Module } from "./types";

export const M8: Module = {
  n: 8, id: "costs-taxes", title: "Costs and taxes", line: "STT, exchange charges, GST, stamp duty, SEBI fees, and how F&O income is taxed in general.",
  lessons: [
    {
      id: "securities-transaction-tax", title: "Securities transaction tax (STT)", summary: "A tax on the value of each F&O trade, charged on the seller's side, and on the intrinsic value of exercised options.",
      body: [
        { p: "STT is charged by the government on every F&O trade, through the exchange. The Finance Act, 2026 raised the rates for trades from 1 April 2026, as announced in the Union Budget of 1 February 2026:" },
        { terms: [
          ["Futures", "0.05% of the traded value, on the seller's side (was 0.02%)."],
          ["Options", "0.15% of the premium, on the seller's side (was 0.1%)."],
          ["Exercised options", "0.15% of the intrinsic value, paid by the buyer (was 0.125%)."],
        ] },
        { p: "STT is not refunded when a trade loses money, and no GST is charged on it." },
        { note: CHECK },
      ],
      example: { title: "STT on three trades", steps: [
        "Closing a long futures lot at 24,500 (lot 65, illustrative): seller's value 24,500 × 65 = ₹15,92,500; STT 0.05% = ₹796.25.",
        "Writing (or closing a long position in) an option at a premium of ₹120 (lot 65): premium value ₹7,800; STT 0.15% = ₹11.70.",
        "An index option exercised 60 points in the money (lot 65): intrinsic value ₹3,900; STT 0.15% = ₹5.85.",
      ], result: "On futures, STT is on the full contract value; on options, on the premium (or the intrinsic value when exercised)." },
      quiz: [
        { q: "What is STT on futures from 1 April 2026, as announced?", options: [
          { text: "0.05% of the value, on the seller's side", correct: true, why: "Right: raised from 0.02% by the Finance Act, 2026." },
          { text: "0.15% of the value, on the buyer's side", why: "0.15% applies to option premiums, on the seller's side." },
          { text: "Nothing: futures are exempt", why: "Futures pay STT." },
        ] },
        { q: "A premium of ₹80, lot 65. What is the STT on the seller's side at 0.15%?", options: [
          { text: "₹7.80", correct: true, why: "Right: 80 × 65 = ₹5,200, and 0.15% of it is ₹7.80." },
          { text: "₹780", why: "That uses 15%." },
          { text: "₹0.12", why: "That is per unit, not for the lot." },
        ] },
        { q: "Who pays STT when an option is exercised at expiry?", options: [
          { text: "The writer", why: "On exercise, STT is charged to the buyer." },
          { text: "The buyer, at 0.15% of the intrinsic value", correct: true, why: "Right, as announced from 1 April 2026." },
          { text: "The exchange", why: "The exchange collects it from the trader." },
        ] },
      ],
      sources: [{ label: "Finance Act, 2026 (Union Budget of 1 February 2026): STT on futures and options from 1 April 2026", url: "https://www.indiabudget.gov.in/" }],
    },
    {
      id: "exchange-sebi-stamp-gst", title: "Exchange charges, SEBI fee, stamp duty and GST", summary: "The other charges on each trade: who sets them, what they are charged on, and the rates as announced.",
      body: [
        { terms: [
          ["Exchange charges", "NSE's transaction charge with the contribution to its investor protection fund trust (IPFT): ₹183 per crore of traded value for futures and ₹3,553 per crore of traded premium for options, each side, from 1 March 2026 (NSE circular NSE/FA/73061 of 27 February 2026)."],
          ["SEBI turnover fee", "₹10 per crore of traded value (premium for options), each side."],
          ["Stamp duty", "On the buyer's side only: 0.002% of the value for futures and 0.003% of the premium for options (Indian Stamp Act, from 1 July 2020)."],
          ["GST", "18% on brokerage, exchange charges and the SEBI fee. Not on STT or stamp duty."],
          ["Brokerage", "Set by each broker: a flat amount per order or a percentage. Some brokers add clearing or platform fees; the contract note lists every charge."],
        ] },
        { note: CHECK },
      ],
      example: { title: "A futures round trip, every line", steps: [
        "Long one lot at 24,500, closed at 24,560 (lot 65, illustrative). Value in ₹15,92,500, value out ₹15,96,400, turnover ₹31,88,900. Brokerage ₹20 an order.",
        "STT 0.05% of ₹15,96,400 = ₹798.20. Exchange charges ₹183 per crore of ₹31,88,900 = ₹58.36. SEBI fee = ₹3.19. Stamp duty 0.002% of ₹15,92,500 = ₹31.85.",
        "Brokerage ₹40. GST 18% of (40 + 58.36 + 3.19) = ₹18.28.",
        "Total ₹949.88. Gross result 60 × 65 = ₹3,900; net ₹2,950.12.",
      ], result: "Charges took about a quarter of this trade's gross result; the price had to move about 14.6 points just to cover them." },
      quiz: [
        { q: "On which charges is GST levied?", options: [
          { text: "Brokerage, exchange charges and the SEBI fee", correct: true, why: "Right: not on STT or stamp duty." },
          { text: "Only on STT", why: "STT has no GST on it." },
          { text: "On the whole trade value", why: "GST is on the service charges, not the trade value." },
        ] },
        { q: "Who pays stamp duty on an F&O trade?", options: [
          { text: "The seller", why: "STT is on the seller's side; stamp duty is on the buyer's." },
          { text: "The buyer", correct: true, why: "Right: 0.002% for futures, 0.003% of premium for options." },
          { text: "Both sides equally", why: "Stamp duty is charged on the buyer's side only." },
        ] },
        { q: "NSE's charge for options is ₹3,553 per crore of premium each side. What is it on ₹14,300 of premium turnover?", options: [
          { text: "About ₹5.08", correct: true, why: "Right: 14,300 × 3,553 ÷ 1,00,00,000 ≈ ₹5.08." },
          { text: "About ₹508", why: "That is 100 times too large." },
          { text: "About ₹35.53", why: "That is the charge per ₹1 lakh, not on ₹14,300." },
        ] },
      ],
      sources: [SRC.nseCharges],
    },
    {
      id: "round-trip-costs", title: "Working out a round trip's costs", summary: "Every charge on an opening and a closing trade, from your own figures, with the rates as announced.",
      body: [
        { p: "Every F&O round trip pays two sets of charges: one on the opening trade and one on the closing trade. The calculator below works them out line by line from the price (or premium) in and out, the lot size, the number of lots and your broker's brokerage per order." },
        { p: "It shows the points the price must move just to cover the charges. A position closed at a gain smaller than that is a loss after costs." },
        { note: "The rates are the ones announced for trades from 1 April 2026 (STT) and 1 March 2026 (NSE charges). Your broker's contract note is the final word, and may round each order separately." },
      ],
      widget: { kind: "costs" },
      example: { title: "An options round trip", steps: [
        "The buyer of one lot (65, illustrative) at a premium of ₹100 closes it at ₹120. Brokerage ₹20 an order.",
        "Brokerage ₹40; STT 0.15% of ₹7,800 = ₹11.70; exchange charges ₹5.08; SEBI fee ₹0.01; stamp duty ₹0.20; GST ₹8.12.",
        "Total ₹65.11. Gross ₹1,300; net ₹1,234.89. The premium had to rise about ₹1 a unit to cover costs.",
      ], result: "On options, flat brokerage is often the largest charge; on futures, STT usually is." },
      quiz: [
        { q: "In the options example, which charge is the largest?", options: [
          { text: "Brokerage of ₹40", correct: true, why: "Right: on a small premium, a flat brokerage outweighs the percentage charges." },
          { text: "Stamp duty", why: "Stamp duty is ₹0.20." },
          { text: "SEBI fee", why: "The SEBI fee is about ₹0.01." },
        ] },
        { q: "What does \"points to cover the charges\" mean?", options: [
          { text: "The move in price per unit that pays for the round trip's charges", correct: true, why: "Right: total charges ÷ quantity." },
          { text: "The exchange's minimum price step", why: "That is the tick size." },
          { text: "The gain the trade will make", why: "It is a cost threshold, not a gain." },
        ] },
        { q: "Charges total ₹950 on a futures lot of 65. How many points must the price move to cover them?", options: [
          { text: "About 14.6", correct: true, why: "Right: 950 ÷ 65 ≈ 14.6." },
          { text: "About 950", why: "That is in rupees, not points." },
          { text: "About 1.5", why: "That divides by 650." },
        ] },
      ],
    },
    {
      id: "fno-taxation", title: "How F&O results are taxed, in general", summary: "F&O gains and losses are generally treated as non-speculative business income; consult a professional for your own case.",
      body: [
        { p: "Under India's income-tax law, gains and losses from exchange-traded F&O are generally treated as non-speculative business income, not as capital gains. They are added to other income and taxed at the slab rate that applies." },
        { list: [
          "Business expenses directly linked to trading (such as brokerage and charges) are generally deductible; STT paid is generally allowed as a deduction when computing business income.",
          "A non-speculative business loss can generally be set off against other income except salary in the same year, and the rest can be carried forward for up to eight years against business income, if the return is filed on time.",
          "Traders generally file the return form for business income, may need to pay advance tax, and may need books of account or a tax audit depending on turnover and profit. F&O turnover for tax purposes is not the contract value; it is worked out by a method the profession's guidance sets out.",
          "From 1 April 2026 the Income-tax Act, 2025 replaced the 1961 Act, and section numbers changed.",
        ] },
        { note: "This is a general description, not tax advice. Rules and thresholds change; consult a chartered accountant or tax professional about your own situation." },
      ],
      example: { title: "A year in outline", steps: [
        "Suppose a person's F&O round trips in a year show gains of ₹2,40,000 and losses of ₹1,90,000, with ₹18,000 of charges.",
        "Net F&O business income: 2,40,000 − 1,90,000 − 18,000 = ₹32,000, added to other income and taxed at the slab rate.",
        "Had the net been a loss of ₹32,000, it could generally be set off against other income except salary, and the rest carried forward, if the return was filed on time.",
      ], result: "F&O results are generally business income: gains add to income, losses follow business-loss rules. A professional confirms the details." },
      quiz: [
        { q: "How are F&O gains generally treated for income tax?", options: [
          { text: "As non-speculative business income", correct: true, why: "Right, in general; a professional confirms individual cases." },
          { text: "As long-term capital gains", why: "Derivatives trades are generally business income, not capital gains." },
          { text: "As tax-free income", why: "They are taxed at the slab rate as business income." },
        ] },
        { q: "Can an F&O business loss generally be set off against salary in the same year?", options: [
          { text: "Yes, against any income", why: "Business losses generally cannot be set off against salary." },
          { text: "No, but it can generally be set off against other income except salary, and carried forward", correct: true, why: "Right, subject to filing the return on time." },
          { text: "No, it is lost", why: "It can generally be carried forward for up to eight years." },
        ] },
        { q: "Who can confirm how the rules apply to a person's own F&O income?", options: [
          { text: "A chartered accountant or tax professional", correct: true, why: "Right: this lesson describes the rules generally." },
          { text: "The exchange", why: "Exchanges do not give tax advice." },
          { text: "Any online calculator", why: "A calculator cannot judge a person's full tax situation." },
        ] },
      ],
    },
    {
      id: "costs-add-up", title: "How costs add up", summary: "Small charges per trade become large over many trades; SEBI's study shows costs turning small gains into losses.",
      body: [
        { p: "Each charge is small on one trade, but they are paid on every trade, gain or loss. The more often positions are opened and closed, the more the charges add up." },
        { p: "SEBI's August 2026 study of individual traders found that 82.1% made losses in FY26 before transaction costs, and 87.7% after them: costs pushed some traders with small gross profits into net losses." },
        { note: "Costs are certain; the gross result is not." },
      ],
      example: { title: "The same small trade, repeated", steps: [
        "The options round trip of lesson 3 cost ₹65.11.",
        "Repeated 10 times a week for 48 weeks: 480 round trips.",
        "480 × ₹65.11 ≈ ₹31,250 in charges for the year, whatever the trades' results.",
      ], result: "Charges that look like rounding on one trade come to tens of thousands of rupees over a year of frequent trades." },
      quiz: [
        { q: "Are charges paid on trades that lose money?", options: [
          { text: "Yes: charges are paid on every trade", correct: true, why: "Right: STT and the other charges do not depend on the result." },
          { text: "No: they are refunded on losing trades", why: "There is no refund." },
          { text: "Only brokerage is paid", why: "Every charge applies." },
        ] },
        { q: "SEBI's August 2026 study found 82.1% of individual traders had losses before costs in FY26. What was the share after costs?", options: [
          { text: "82.1%", why: "Costs raised the share." },
          { text: "87.7%", correct: true, why: "Right: costs turned some small gross profits into net losses." },
          { text: "50%", why: "The share after costs was much higher." },
        ] },
        { q: "What happens to total charges when the same trade is repeated more often?", options: [
          { text: "They stay the same", why: "Each trade pays its own charges." },
          { text: "They shrink", why: "They grow with the number of trades." },
          { text: "They grow with the number of trades", correct: true, why: "Right: costs add up trade by trade." },
        ] },
      ],
      sources: [SRC.study2026],
    },
  ],
};
