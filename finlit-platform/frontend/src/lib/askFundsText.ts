// Task #203: written answers for the FinLit AI theme "Mutual funds & ETFs" (the team's question bank, docs/design/mf-etf-questions). General knowledge,
// how FinLit's fund data works, and polite refusals where the data is not held or a question asks for advice. Describes; never advises.
export type Written = { text: string; link?: { to: string; label: string } };

const FUNDS = { to: "/funds", label: "Open the mutual funds list" };
const ETFS = { to: "/etfs", label: "Open the ETF list" };
const COMPARE = { to: "/funds/compare", label: "Open Compare funds" };
const INSIGHTS = { to: "/funds/insights", label: "Open Mutual Fund Insights" };
const SIPCALC = { to: "/sip-calculator", label: "Open the SIP calculator" };
const GLOSSARY = { to: "/glossary", label: "Open the glossary" };
const SCREENER = { to: "/funds/screener", label: "Open the fund screener" };

/** The fund houses left out of FinLit's lists (the same reply for each). */
const excluded = (name: string): Written => ({
  text: `• **${name}** is one of the fund houses not shown on FinLit right now.\n• They are left out of FinLit's fund lists for now (data from them is incomplete in the sources FinLit reads), so their schemes are not shown.\n• Schemes of every other fund house in AMFI's NAV file are in the funds list.`,
  link: FUNDS,
});

/** Holdings not read yet for a fund house (no portfolio adapter). */
const noHoldings = (name: string): Written => ({
  text: `• FinLit does not read **${name}**'s monthly portfolio file yet, so holdings are not shown for its schemes.\n• FinLit reads portfolio files from **39** fund houses; ${name} is not among them for now.\n• NAV, returns, risk figures, AUM and expense ratio are still shown for its schemes, from AMFI.`,
  link: FUNDS,
});

/** Which {c} funds own the most of one sector: no cross-fund view yet. */
const sectorQ = (sector: string): Written => ({
  text: `• FinLit does not yet rank funds by how much they put into **${sector}** stocks: there is no cross-fund view of holdings yet.\n• You can see each fund's own holdings and sector split on its fund page, under **What it invests in**, where the fund house publishes a portfolio file.\n• The funds list lets you filter **{c}** funds and open them one by one.`,
  link: FUNDS,
});

/** Advice-style "which fund for ..." questions. */
const pickQ = (what: string, extra: string): Written => ({
  text: `• FinLit describes funds from their data and does not give recommendations or predict returns, so it does not name ${what}.\n• ${extra}\n• Each fund page shows its returns, SIP return, risk card and **5-check checklist** against its category peers.`,
  link: FUNDS,
});

export const FUND_TEXT: Record<string, Written> = {
  // ---------------------------------------------------------------- returns: how they are worked out
  Q0353: { text: "• The **1-year return** starts from the NAV on the same date **1 year** before the latest NAV date.\n• If that day had no NAV (a holiday or weekend), FinLit uses the **nearest earlier NAV**.\n• The start date is shown as the **since** date next to the return.", link: FUNDS },
  Q0354: { text: "• The **3-year return** starts from the NAV on the same date **3 years** before the latest NAV date.\n• If that day had no NAV, FinLit uses the **nearest earlier NAV**.\n• The start date is shown as the **since** date next to the return.", link: FUNDS },
  Q0355: { text: "• The **5-year return** starts from the NAV on the same date **5 years** before the latest NAV date.\n• If that day had no NAV, FinLit uses the **nearest earlier NAV**.\n• The start date is shown as the **since** date next to the return.", link: FUNDS },
  Q0356: { text: "• **1-year return** of {fund} = (latest NAV ÷ NAV 1 year earlier) − 1, shown as a percentage.\n• It is an **absolute** return over the year, worked out by FinLit from AMFI's NAV history.\n• The start date appears as the **since** date next to the figure.", link: FUNDS },
  Q0357: { text: "• **3-year return** of {fund} is a **CAGR**: (latest NAV ÷ NAV 3 years earlier)^(1 ÷ **3**) − 1.\n• It is the steady yearly rate that would turn the start NAV into today's NAV over 3 years.\n• FinLit works it out from AMFI's NAV history; the start date is the **since** date shown next to it.", link: FUNDS },
  Q0358: { text: "• **5-year return** of {fund} is a **CAGR**: (latest NAV ÷ NAV 5 years earlier)^(1 ÷ **5**) − 1.\n• It is the steady yearly rate that would turn the start NAV into today's NAV over 5 years.\n• FinLit works it out from AMFI's NAV history; the start date is the **since** date shown next to it.", link: FUNDS },
  Q0359: { text: "• The **1-year return** is **absolute**: the total change in NAV over that one year.\n• Over exactly one year, the absolute return and the per-year rate are the same number." },
  Q0360: { text: "• The **3-year return** is **per year** (a **CAGR**), not the total over 3 years.\n• For example, **10%** per year over 3 years is about **33%** in total, because of compounding." },
  Q0361: { text: "• The **5-year return** is **per year** (a **CAGR**), not the total over 5 years.\n• For example, **10%** per year over 5 years is about **61%** in total, because of compounding." },
  Q0511: { text: "• Direct and Regular plans of a fund own the **same portfolio**, but charge different **expense ratios**.\n• A **Regular plan** includes distributor commission in its expense ratio; a **Direct plan** does not, so its expense is lower.\n• The expense is taken out of the NAV daily, so the Direct plan's NAV grows a little faster and its returns are a little higher.", link: FUNDS },
  Q0512: { text: "• For **Growth** options, yes: dividends the fund receives stay in the fund, so the NAV, and the return worked from it, already reflects them.\n• For **IDCW** options, payouts leave the NAV, so a return worked only from NAV leaves those payouts out.", link: FUNDS },
  Q0513: { text: "• The **since** date is the date of the starting NAV used for that return.\n• It is the same date 1, 3 or 5 years before the latest NAV date, or the **nearest earlier NAV** if that day had none.\n• The return measures the change from that NAV to the latest one." },
  Q0514: { text: "• No. Mutual fund returns are **not guaranteed**; NAVs move with the market.\n• The returns FinLit shows are **past** returns worked out from NAV history; they do not tell what will happen next.", link: FUNDS },
  Q0517: { text: "• A fund with less than **1 year** of NAV history has no 1-year return, so FinLit leaves it blank.\n• In the same way, 3- and 5-year returns need **3** and **5** years of history.\n• You can still see its NAV and the NAV chart since launch on its fund page.", link: FUNDS },

  // ---------------------------------------------------------------- SIP
  Q0578: { text: "• **XIRR** is a yearly return for money that goes in at different dates, such as monthly SIP instalments.\n• It finds the one yearly rate at which all the instalments would grow to today's value.\n• FinLit's **SIP return** is the XIRR of monthly instalments over **3** or **5** years.", link: GLOSSARY },
  Q0579: { text: "• Yes. The **5-year return** follows one lump sum from the NAV 5 years ago (a **CAGR**).\n• The **5-year SIP return** follows monthly instalments over 5 years (an **XIRR**).\n• Later instalments spend less time invested, so the two numbers usually differ.", link: FUNDS },
  Q0580: { text: "• FinLit does not project a fund's future value: there is no projection engine, and future returns are unknown.\n• The **SIP calculator** shows what a monthly amount becomes at a yearly rate you choose.\n• {fund}'s past **5-year SIP return** on its fund page shows what monthly instalments earned in the past.", link: SIPCALC },
  Q0581: { text: "• Find the fund in the funds list and note its past **3-year** or **5-year SIP return**.\n• Open the **SIP calculator** and enter that figure as the yearly rate.\n• The result shows what the same rate would give; past returns are not a forecast.", link: SIPCALC },
  Q0582: { text: "• FinLit describes funds from their data and does not say which way of investing is better.\n• On {fund}'s page you can see both the **5-year return** (one lump sum, CAGR) and the **5-year SIP return** (monthly instalments, XIRR) for the same period.\n• Which one came out higher depends on how the market moved during that period.", link: FUNDS },
  Q0583: { text: "• No. FinLit works out the SIP return from **NAVs only**.\n• **Exit load**, stamp duty and tax are not taken out. The **expense ratio** is already inside the NAV.", link: FUNDS },

  // ---------------------------------------------------------------- fund facts (disclosures)
  Q0662: { text: "• FinLit does not show the **minimum SIP amount** of {fund}: it is kept on file but deliberately not shown, as fund houses change it.\n• The scheme's **Key Information Memorandum** or the fund house's website lists the current minimum.", link: FUNDS },
  Q0663: { text: "• FinLit does not show the **minimum lump sum** of {fund}: it is kept on file but deliberately not shown, as fund houses change it.\n• The scheme's **Key Information Memorandum** or the fund house's website lists the current minimum.", link: FUNDS },
  Q0664: { text: "• FinLit does not have lock-in details per fund yet.\n• **ELSS** funds have a **3-year** lock-in; **solution-oriented** (retirement and children's) funds also carry a lock-in. Most other open-ended funds have none, though an **exit load** may apply.\n• {fund}'s scheme documents state its exact terms.", link: FUNDS },
  Q0665: { text: "• FinLit does not have tax rules per fund, so it cannot state the tax on {fund}.\n• Tax depends on the fund type, how long units were held and current law; the scheme documents and a tax adviser cover it.", link: FUNDS },
  Q0666: { text: "• FinLit does not have whether {fund} accepts SIPs yet.\n• Most open-ended funds accept SIPs; the fund house's website or the scheme documents confirm it.\n• You can see its past **SIP return** on its fund page if it has 3 years of history.", link: FUNDS },
  Q0667: { text: "• FinLit does not have NRI eligibility per fund yet.\n• Rules differ by fund house, and some limit applications from residents of certain countries; the scheme documents and the fund house state them.", link: FUNDS },
  Q0668: { text: "• FinLit does not have cut-off times per fund yet.\n• The **cut-off time** decides which day's NAV an order gets; SEBI sets it, and it differs for liquid and other funds.\n• {fund}'s scheme documents state the exact times.", link: FUNDS },
  Q0669: { text: "• **Entry load**: SEBI removed entry loads on mutual funds in **2009**, so none is charged.\n• **Stamp duty**: a small stamp duty applies when units are issued; FinLit does not have the rate.\n• **Exit load**, if any, is in the scheme documents.", link: GLOSSARY },
  Q0670: { text: "• FinLit does not have the written **scheme objective** of {fund} yet.\n• It is in the fund's **Scheme Information Document (SID)** on the fund house's website.\n• FinLit shows its **category**, which describes what kind of fund it is, and its holdings where the fund house publishes them.", link: FUNDS },
  Q0671: { text: "• FinLit does not offer funds or take orders; it is information only.\n• Mutual fund units are applied for through the fund house's website, the registrars (CAMS, KFintech), stock-exchange platforms or a registered distributor or adviser.\n• FinLit shows {fund}'s returns, risk and costs on its fund page.", link: FUNDS },

  // ---------------------------------------------------------------- managers
  Q0678: { text: "• FinLit does not have fund manager data yet: there is no manager history or lookup by fund house.\n• Each scheme's factsheet and its fund house's website name the managers.\n• You can see all of {a}'s schemes by filtering the funds list by fund house.", link: FUNDS },
  Q0679: { text: "• FinLit does not have fund manager data yet, so it cannot list the funds {m} manages.\n• Fund house factsheets name the manager of each scheme.", link: FUNDS },
  Q0697: { text: "• FinLit does not have fund manager history yet, so it cannot tell whether {fund}'s manager changed.\n• Fund houses announce manager changes in notices on their websites, and the monthly factsheet names the current manager.", link: FUNDS },
  Q0698: { text: "• FinLit does not have fund manager history yet, so it cannot show how long the manager has run {fund}.\n• The fund's monthly factsheet usually states the date each manager took charge.", link: FUNDS },

  // ---------------------------------------------------------------- holdings across funds
  Q0731: { text: "• FinLit does not yet look up which funds own **{stock}**: there is no cross-fund view of holdings yet.\n• You can see each fund's own holdings on its fund page, under **What it invests in**, where the fund house publishes a portfolio file.", link: FUNDS },
  Q0732: sectorQ("banking"),
  Q0733: sectorQ("IT"),
  Q0734: sectorQ("pharma"),
  Q0735: sectorQ("auto"),
  Q0736: sectorQ("FMCG"),
  Q0737: sectorQ("energy"),
  Q0738: sectorQ("metals"),
  Q0739: sectorQ("real estate"),
  Q0740: sectorQ("infrastructure"),
  Q0741: sectorQ("defence"),
  Q0745: { text: "• FinLit does not show **portfolio turnover** yet: it has no valuation or turnover analytics on holdings.\n• The fund's monthly **factsheet** states its turnover ratio.\n• You can see {fund}'s current holdings on its fund page where the fund house publishes them.", link: FUNDS },
  Q0746: { text: "• FinLit does not work out the **average market cap** of a portfolio yet: it has no valuation analytics on holdings.\n• The fund's monthly **factsheet** often states it.\n• You can see {fund}'s holdings on its fund page where the fund house publishes them.", link: FUNDS },
  Q0747: { text: "• FinLit does not work out a portfolio **P/E** yet: it has no valuation analytics on holdings.\n• The fund's monthly **factsheet** often states it.\n• You can see {fund}'s holdings on its fund page where the fund house publishes them.", link: FUNDS },
  Q0748: { text: "• FinLit does not measure **overlap** between two funds yet: there is no cross-fund view of holdings.\n• You can open {fund} and {fund2} and read each one's holdings under **What it invests in**.\n• **Compare** shows their returns and risk side by side.", link: COMPARE },
  Q0751: noHoldings("HDFC Mutual Fund"),
  Q0752: noHoldings("Kotak Mutual Fund"),
  Q0753: noHoldings("Edelweiss Mutual Fund"),
  Q0754: noHoldings("Navi Mutual Fund"),
  Q0755: noHoldings("Union Mutual Fund"),
  Q0756: noHoldings("Carnelian"),

  // ---------------------------------------------------------------- alpha, beta, benchmark
  Q0802: { text: "• FinLit does not show **alpha** yet: the index data it holds is **price-only**, so a fair comparison with the benchmark is not possible.\n• **Alpha** is the return a fund earned above what its benchmark and its risk level would explain.\n• You can see {fund}'s returns and risk card on its fund page, and compare funds side by side.", link: COMPARE },
  Q0803: { text: "• FinLit does not show **beta** yet: the index data it holds is **price-only**.\n• **Beta** measures how much a fund moves when its benchmark moves: **1** means in step, above 1 more, below 1 less.\n• You can see {fund}'s **volatility** and **largest fall** on its risk card.", link: COMPARE },
  Q0804: { text: "• The **Sortino ratio** = (return − risk-free rate) ÷ **downside deviation**.\n• It is like the Sharpe ratio but counts only falls as risk, not rises.\n• FinLit does not show it yet; a fund's risk card shows its **volatility** and **largest fall**.", link: FUNDS },
  Q0806: { text: "• FinLit does not compare a fund with its benchmark yet: the index data it holds is **price-only**, while fund NAVs include dividends, so the comparison would not be fair.\n• **Compare** lets you put {fund} next to other funds, such as an index fund on the same index.", link: COMPARE },

  // ---------------------------------------------------------------- advice-style rankings (guardrail)
  Q0991: pickQ("one fund", "You can sort the funds list by **5-year return**, **expense ratio** or **checklist** within a category and plan."),
  Q0992: pickQ("one SIP fund", "You can sort the funds list by **5-year SIP return** within a category and plan."),
  Q0993: pickQ("one ELSS fund", "You can filter the funds list to the **ELSS** category and sort by **5-year return** or **5-year SIP return**."),
  Q0994: pickQ("a fund for a 10-year period", "You can sort a category by **5-year return** and read each fund's NAV chart since launch."),
  Q0995: pickQ("a fund for beginners", "The **glossary** explains each term, and the funds list shows every category with its returns and risk figures."),
  Q0996: pickQ("a fund for monthly income", "Funds with an **IDCW** option pay out from time to time, but payouts are not fixed or guaranteed; the funds list can be filtered by option."),
  Q0997: pickQ("a fund for retirement", "The **solution-oriented: retirement** category groups funds built for that purpose; you can filter the funds list by it."),
  Q0998: pickQ("a fund for children", "The **solution-oriented: children's** category groups funds built for that purpose; you can filter the funds list by it."),
  Q0999: pickQ("a fund for a 1-year period", "You can see debt, liquid and arbitrage categories in the funds list, with their **1-year return** and **largest fall**."),
  Q1000: { text: "• FinLit describes funds from their data and does not give recommendations, so it does not call any fund safe.\n• Every mutual fund carries risk. The **risk-o-meter** and a fund's **volatility** and **largest fall** describe how much it has moved.\n• You can see these on each fund's risk card and compare them within a category.", link: FUNDS },
  Q1001: { text: "• FinLit describes funds from their data and does not give recommendations.\n• You can sort the funds list by **1-year**, **3-year** or **5-year return** within a category and plan to see which funds had the highest **past** returns.\n• Past returns do not tell what a fund will return next.", link: FUNDS },
  Q1002: { text: "• FinLit does not predict returns, and no fund's return is fixed or guaranteed.\n• You can see which funds had a **past** 3- or 5-year return near **20%** by sorting the funds list by return.", link: FUNDS },
  Q1003: { text: "• FinLit does not know your own purchases, so it cannot say which fund doubled your money.\n• Money doubles in about **72 ÷ yearly return** years (the **rule of 72**): about **7.2** years at **10%**.\n• You can sort the funds list by **5-year return** to see the highest past growth rates.", link: FUNDS },
  Q1004: { text: "• FinLit does not compare funds with the Nifty yet: there is no benchmark alpha, and the index data it holds is **price-only**.\n• You can sort a category by **3-** or **5-year return** and set that next to the index's own return from an index fund on the Nifty 50.", link: FUNDS },

  // ---------------------------------------------------------------- industry insights
  Q1092: { text: "• FinLit does not have the industry's monthly **SIP inflow** figure yet; it is not stored from AMFI's reports.\n• FinLit's insights page shows **net inflows** and **AUM** by category from AMFI's Monthly Category Report, from **April 2019**.", link: INSIGHTS },
  Q1098: { text: "• FinLit does not have industry flow data before **April 2019** yet; its series from AMFI's Monthly Category Report starts there.\n• The insights page shows net inflows and AUM by category from April 2019 onward.", link: INSIGHTS },

  // ---------------------------------------------------------------- ETFs
  Q1184: { text: "• An **ETF (exchange-traded fund)** is a fund whose units are listed on a stock exchange and trade through the day like shares.\n• Most ETFs track an index, such as the Nifty 50, or a commodity such as gold.\n• Its price can be a little above or below its **NAV** (a **premium** or **discount**).", link: ETFS },
  Q1200: { text: "• FinLit does not show the **bid-ask spread** of {etf} yet.\n• The **bid-ask spread** is the gap between the highest price buyers offer and the lowest price sellers ask; a smaller gap means easier trading.\n• The ETF list shows **traded volume**, another sign of how actively it trades.", link: ETFS },
  Q1204: { text: "• FinLit does not show the **tracking error** of {etf} yet.\n• **Tracking error** is how much the ETF's return wobbles around its index's return, as a standard deviation; lower means it follows the index more closely.\n• The fund house's factsheet usually states it.", link: ETFS },
  Q1205: { text: "• FinLit does not show the **tracking difference** of {etf} yet.\n• **Tracking difference** = ETF return − index return over a period; it is usually slightly negative because of costs.\n• The fund house's factsheet usually states it.", link: ETFS },
  Q1220: { text: "• FinLit describes both and does not say which is better.\n• An **ETF** trades on the exchange at a live price and needs a **demat** account; an **index fund** is bought from the fund house at the day's **NAV**.\n• Index funds allow easy SIPs; ETFs often have lower expense ratios but carry a **bid-ask spread** and may trade at a premium or discount.", link: ETFS },
  Q1221: { text: "• Both are mutual fund schemes run by fund houses under SEBI rules.\n• An **ETF** is listed on an exchange and trades through the day at a market price; a regular **mutual fund** is bought from and sold back to the fund house once a day at **NAV**.\n• Most ETFs track an index; mutual funds can track an index or be actively managed.", link: ETFS },
  Q1228: { text: "• FinLit does not have broker SIP rules for ETFs.\n• ETFs trade on the exchange, so a regular monthly purchase depends on the broker; some offer it, and the terms are theirs.\n• An **index fund** on the same index accepts SIPs directly from the fund house.", link: ETFS },
  Q1229: { text: "• Yes. ETFs are listed on stock exchanges, so trading them needs a **demat account** and a **trading account** with a broker.\n• Units of a regular mutual fund can be held without a demat account.", link: ETFS },
  Q1230: { text: "• FinLit does not have tax rules for ETFs.\n• Tax depends on the ETF type (equity, debt, gold, international), how long units were held and current law; the scheme documents and a tax adviser cover it.", link: ETFS },
  Q1231: { text: "• No. The ETF return FinLit shows is a **price return**: it measures the change in the ETF's value only.\n• Any dividend the ETF pays out is not added back, so the total return can be a little higher.", link: ETFS },

  // ---------------------------------------------------------------- basics (glossary)
  Q1243: { text: "• A **mutual fund** pools money from many investors and invests it in shares, bonds or other assets.\n• A professional fund house (**AMC**) runs it, under **SEBI** rules.\n• Each investor owns **units**; the value of one unit is the **NAV**.", link: FUNDS },
  Q1244: { text: "• **NAV (Net Asset Value)** is the value of one unit of a fund.\n• **NAV** = (value of everything the fund owns − its liabilities) ÷ number of units.\n• Funds publish it every business day; FinLit loads it from **AMFI** each evening.", link: GLOSSARY },
  Q1245: { text: "• **AUM (Assets Under Management)** is the total money a fund manages, at market value.\n• FinLit shows AMFI's **average AUM** per scheme, published **quarterly**.\n• A bigger AUM means a bigger fund, not a better or worse one.", link: GLOSSARY },
  Q1246: { text: "• The **expense ratio (TER, Total Expense Ratio)** is the yearly cost of running a fund, as a **%** of its assets.\n• It is taken out of the NAV a little each day, so returns shown are already after it.\n• FinLit shows it from AMFI's **monthly** TER file.", link: GLOSSARY },
  Q1247: { text: "• A **Direct plan** is the version of a fund taken straight from the fund house, with no distributor in between.\n• It pays no distributor commission, so its **expense ratio** is lower than the Regular plan's.", link: GLOSSARY },
  Q1248: { text: "• A **Regular plan** is the version of a fund taken through a distributor, such as a bank or agent.\n• Its **expense ratio** includes the distributor's commission, so it is higher than the Direct plan's.", link: GLOSSARY },
  Q1249: { text: "• Both plans own the **same portfolio** and have the same fund manager.\n• The **Regular plan**'s expense ratio includes distributor commission; the **Direct plan**'s does not.\n• So the Direct plan has a higher NAV over time and slightly higher returns. FinLit shows each plan separately.", link: FUNDS },
  Q1250: { text: "• In the **Growth** option, the fund pays nothing out; all gains stay invested and show up in a rising **NAV**.\n• Its NAV-based return therefore includes everything the fund earned.", link: GLOSSARY },
  Q1251: { text: "• **IDCW** = **Income Distribution cum Capital Withdrawal** (earlier called the dividend option).\n• The fund pays out money from time to time, and the NAV drops by the amount paid.\n• Payouts are not fixed or guaranteed, and part of them can be your own capital.", link: GLOSSARY },
  Q1252: { text: "• **Growth**: nothing is paid out; gains stay in the NAV.\n• **IDCW**: the fund pays out from time to time and the NAV falls by the payout.\n• Both options of a fund own the same portfolio; only the payout differs.", link: GLOSSARY },
  Q1253: { text: "• A **SIP (Systematic Investment Plan)** puts a fixed amount into a fund at regular intervals, usually monthly.\n• Each instalment buys units at that day's NAV, so more units come when the NAV is low and fewer when it is high.", link: SIPCALC },
  Q1254: { text: "• A **lump sum** investment puts the whole amount into a fund at once, at that day's NAV.\n• Its result depends on the NAV on that single day and the NAV later.", link: GLOSSARY },
  Q1255: { text: "• **CAGR (Compound Annual Growth Rate)** is the steady yearly rate that turns a start value into an end value.\n• **CAGR** = (end value ÷ start value)^(1 ÷ years) − 1.\n• FinLit's **3-** and **5-year returns** are CAGRs.", link: GLOSSARY },
  Q1256: { text: "• **Absolute return** is the total change over a period, not per year.\n• **Absolute return** = (end value ÷ start value) − 1.\n• FinLit's **1-year return** is absolute.", link: GLOSSARY },
  Q1257: { text: "• **Volatility** measures how much a fund's NAV moves up and down.\n• It is the **standard deviation** of returns, shown per year; higher means bigger swings.\n• FinLit works it out from the NAV history and shows it on the fund's risk card.", link: GLOSSARY },
  Q1258: { text: "• **Max drawdown** is the largest fall from a peak to a later low, as a **%**.\n• A max drawdown of **−30%** means the NAV once fell 30% below its earlier high.\n• FinLit shows a fund's **largest fall** on its risk card, worked out from NAV history.", link: GLOSSARY },
  Q1259: { text: "• The **Sharpe ratio** = (fund return − risk-free rate) ÷ **volatility**.\n• It shows how much extra return was earned for each unit of risk taken; higher means more return per unit of risk.", link: GLOSSARY },
  Q1260: { text: "• The **risk-o-meter** is a SEBI-mandated label every fund carries, showing its risk level.\n• It has **6** levels, from **Low** to **Very High**, and fund houses review it every month.\n• It describes the portfolio's risk; it is not a rating of performance.", link: GLOSSARY },
  Q1261: { text: "• An **exit load** is a fee some funds charge when units are redeemed within a set period after investing.\n• It is a **%** of the amount redeemed, and the period and rate differ by fund.\n• The scheme documents state each fund's exit load.", link: GLOSSARY },
  Q1262: { text: "• A **benchmark** is an index a fund measures itself against, such as the **Nifty 50** for many large-cap funds.\n• Each fund names its benchmark in its scheme documents.\n• Comparing a fund's return with its benchmark shows whether it did better or worse than the index.", link: GLOSSARY },
  Q1263: { text: "• An **index fund** copies an index, such as the Nifty 50, by owning the same stocks in the same weights.\n• It is **passive**: no manager picks stocks, so its expense ratio is usually low.\n• It is bought from the fund house at NAV, unlike an ETF, which trades on the exchange.", link: FUNDS },
  Q1264: { text: "• An **ELSS (Equity Linked Savings Scheme)** is an equity fund with a **3-year lock-in** on each investment.\n• It is the fund type linked to the **Section 80C** deduction; FinLit does not have tax rules.\n• Each SIP instalment has its own 3-year lock-in.", link: FUNDS },
  Q1265: { text: "• A **large cap fund** invests at least **80%** in large companies: the top **100** listed companies by market value.\n• These are usually the biggest, most established companies, so the fund tends to move less than mid or small cap funds.", link: FUNDS },
  Q1266: { text: "• A **mid cap fund** invests at least **65%** in mid-sized companies: those ranked **101 to 250** by market value.\n• They tend to move more than large caps, both up and down.", link: FUNDS },
  Q1267: { text: "• A **small cap fund** invests at least **65%** in small companies: those ranked **251 onwards** by market value.\n• They usually swing the most of the three size groups.", link: FUNDS },
  Q1268: { text: "• A **flexi cap fund** invests at least **65%** in equity, with no fixed split between large, mid and small companies.\n• The manager can move between sizes at any time.", link: FUNDS },
  Q1269: { text: "• A **multi cap fund** invests at least **75%** in equity, with at least **25%** each in large, mid and small companies.\n• Unlike a flexi cap fund, it must keep that minimum in each size.", link: FUNDS },
  Q1270: { text: "• A **hybrid fund** invests in more than one asset type, usually **equity** and **debt**, and sometimes gold.\n• SEBI groups them by mix: conservative, balanced, aggressive, dynamic (balanced advantage), multi-asset, arbitrage and equity savings.", link: FUNDS },
  Q1271: { text: "• A **balanced advantage fund** (dynamic asset allocation) changes its split between equity and debt over time.\n• The fund house's own model decides the split, often based on market valuations.", link: FUNDS },
  Q1272: { text: "• An **arbitrage fund** buys a stock in the cash market and sells it in the futures market at the same time, earning the price gap.\n• This keeps market risk low; returns are usually close to short-term interest rates.", link: FUNDS },
  Q1273: { text: "• A **liquid fund** is a debt fund that invests in very short-term instruments maturing within **91 days**.\n• Its NAV moves very little, and redemptions are usually paid the next business day.", link: FUNDS },
  Q1274: { text: "• A **debt fund** invests in bonds, government securities and money-market instruments that pay interest.\n• Its main risks are **interest-rate risk** (bond prices fall when rates rise) and **credit risk** (a borrower may not repay).", link: FUNDS },
  Q1275: { text: "• A **gilt fund** invests at least **80%** in government securities across maturities.\n• It carries almost no credit risk, but its NAV can move a lot with interest rates.", link: FUNDS },
  Q1276: { text: "• A **corporate bond fund** invests at least **80%** in the highest-rated corporate bonds (**AA+** and above).\n• It aims for a little more interest than government bonds, with limited credit risk.", link: FUNDS },
  Q1277: { text: "• A **credit risk fund** invests at least **65%** in corporate bonds rated **AA and below**.\n• Lower-rated borrowers pay more interest but are more likely to miss payments, so the risk of loss is higher.", link: FUNDS },
  Q1278: { text: "• A **fund of funds (FoF)** invests in other mutual funds or ETFs instead of directly in shares or bonds.\n• Costs come at two levels: the FoF's own and those of the funds it owns.\n• Many international funds in India are FoFs.", link: FUNDS },
  Q1279: { text: "• A **sectoral fund** invests in one sector, such as banking or pharma; a **thematic fund** in a theme, such as infrastructure or consumption.\n• They must put at least **80%** into that sector or theme, so they are less spread out than diversified funds.", link: FUNDS },
  Q1280: { text: "• A **solution-oriented fund** is built for one goal: **retirement** or **children's** needs.\n• SEBI requires a lock-in of at least **5 years** or until retirement age or the child's majority, whichever comes first.", link: FUNDS },
  Q1281: { text: "• **Portfolio turnover** shows how much of a fund's portfolio was bought and sold in a year, as a **%**.\n• **100%** turnover means roughly the whole portfolio was changed once in the year.\n• Higher turnover means more trading inside the fund.", link: GLOSSARY },
  Q1282: { text: "• **Top-10 concentration** is the share of a fund's money in its **10** largest holdings, as a **%**.\n• A higher figure means the fund depends more on a few companies.", link: GLOSSARY },
  Q1283: { text: "• A **fund house** or **AMC (Asset Management Company)** is the company that runs mutual fund schemes.\n• It manages the money under **SEBI** rules; the money itself is held by a trust and a custodian, not the AMC.", link: FUNDS },
  Q1284: { text: "• **AMFI (Association of Mutual Funds in India)** is the industry body of SEBI-registered fund houses.\n• It publishes every scheme's daily **NAV**, AUM, expense ratios and monthly industry data.\n• FinLit's fund data comes from AMFI's official files.", link: FUNDS },
  Q1285: { text: "• **SEBI (Securities and Exchange Board of India)** is the regulator of mutual funds.\n• It sets the rules for fund categories, costs, disclosures and the risk-o-meter, and registers fund houses and distributors." },
  Q1286: { text: "• An **ISIN (International Securities Identification Number)** is a **12-character** code that identifies one security.\n• Each plan and option of a fund has its own ISIN, starting with **IN** for India.\n• AMFI's NAV file lists the ISINs of each scheme.", link: GLOSSARY },
  Q1287: { text: "• An **open-ended fund** takes in and pays out money on any business day at that day's **NAV**.\n• It has no fixed end date, and units are created or cancelled as people come in or leave.", link: GLOSSARY },
  Q1288: { text: "• A **close-ended fund** takes money only during its **NFO** and runs for a fixed period.\n• Units cannot be redeemed with the fund house before maturity; they are listed on an exchange instead.", link: GLOSSARY },
  Q1289: { text: "• An **interval fund** is a mix of open- and close-ended: it allows purchases and redemptions only in set windows.\n• Outside those windows, its units can only trade on an exchange if listed.", link: GLOSSARY },
  Q1290: { text: "• A **stopped** scheme has stopped publishing NAVs: it matured, merged into another scheme or was wound up.\n• FinLit keeps it on record but hides it from lists by default, and shows no returns for it.\n• Tick **Include schemes that stopped publishing NAVs** in the funds list to see them.", link: FUNDS },
  Q1291: { text: "• A **fund family** is all the plans and options of one fund: Direct and Regular, Growth and IDCW.\n• They share one portfolio and manager, but each has its own NAV and code.\n• A fund page lists the other plans of the same fund.", link: FUNDS },
  Q1292: { text: "• A **category average** is the typical figure for funds in the same SEBI category.\n• FinLit's checklist uses the **category median** (the middle value) of funds in the same category and plan.", link: FUNDS },
  Q1293: { text: "• **Rolling returns** are many returns of the same length, each starting on a different day.\n• For example, every 3-year return in the past 10 years, one per day.\n• They show how steady a fund's returns have been, not just one start date.", link: GLOSSARY },
  Q1294: { text: "• **Downside deviation** is like volatility but counts only the falls below a set level, usually zero.\n• Lower downside deviation means smaller or fewer drops. It is used in the **Sortino ratio**.", link: GLOSSARY },
  Q1295: { text: "• **Tracking error** is how much an index fund's or ETF's return wobbles around its index's return.\n• It is the **standard deviation** of the gap between the two; lower means the fund follows its index more closely.", link: GLOSSARY },
  Q1296: { text: "• An ETF's market price can differ from its **NAV**.\n• **Premium** = price above NAV; **discount** = price below NAV.\n• **Premium / discount %** = (price − NAV) ÷ NAV × 100.", link: ETFS },
  Q1297: { text: "• An **NFO (New Fund Offer)** is the first period when a new scheme takes money, before it starts.\n• Units are usually issued at **₹10** in the NFO; this price does not make them cheaper or dearer than other funds.", link: GLOSSARY },
  Q1298: { text: "• A **folio** is your account number with a fund house.\n• All your investments in that fund house's schemes can sit under one folio." },
  Q1299: { text: "• A **fund manager** is the professional who decides what a fund owns and when to change it, within the scheme's rules.\n• Index funds and ETFs have managers too, but they only follow the index." },
  Q1300: { text: "• **Top**: the fund's name, plan, option, category and latest NAV.\n• **Returns**: 1-year (absolute) and 3- and 5-year (per year), each with a **since** date, plus SIP returns.\n• **Checklist** and **risk card**: 5 checks against peers, volatility and largest fall.\n• Then the NAV chart, holdings (where published), other plans of the same fund and **About the data**.", link: FUNDS },
  Q1301: { text: "• FinLit describes funds and does not set a number of funds for anyone.\n• What matters is how much the funds overlap: two funds in the same category often own many of the same stocks.\n• You can read each fund's holdings and compare funds side by side.", link: COMPARE },
  Q1302: { text: "• FinLit describes both plans and does not choose between them.\n• The **Direct plan** has a lower expense ratio; the **Regular plan** includes the distributor's commission, which pays for their service.\n• You can see both plans' returns and expense ratios on a fund page, under other plans of the same fund.", link: FUNDS },
  Q1303: { text: "• A **SIP** in a mutual fund puts a fixed amount in each month at that day's **NAV**, through the fund house.\n• An **ETF** purchase is a trade on the exchange at the **market price**, through a broker and a demat account, for whole units.\n• ETF trades may carry brokerage and a bid-ask spread.", link: ETFS },

  // ---------------------------------------------------------------- data and trust
  Q1304: { text: "• **NAVs**: AMFI's official NAV files, with history back to each scheme's launch where AMFI has it.\n• **AUM**: AMFI's quarterly average AUM by scheme. **Expense ratio**: AMFI's monthly TER file.\n• **Industry flows**: AMFI's Monthly Category Report. **Holdings**: fund houses' monthly portfolio files.\n• Returns, SIP returns, volatility and falls are worked out by FinLit from the NAV history.", link: FUNDS },
  Q1305: { text: "• **NAVs**: every evening, after AMFI publishes them.\n• **Expense ratios**: monthly. **AUM**: quarterly. **Industry flows**: monthly.\n• **Holdings**: monthly, as fund houses publish their portfolio files.", link: FUNDS },
  Q1307: { text: "• Fund houses publish NAVs after the market closes, and **AMFI** collects them in the evening.\n• FinLit loads them every evening after AMFI publishes, so today's NAV appears only after that.\n• Some funds, such as international funds, publish their NAV a day later.", link: FUNDS },
  Q1308: { text: "• Yes. NAVs, AUM, expense ratios and industry flows come from **AMFI**'s official files.\n• Where AMFI's own NAV history for a scheme is not loaded yet, the page says it uses a **third-party mirror** of AMFI data.\n• Holdings come from the fund houses' monthly portfolio files.", link: FUNDS },
  Q1309: { text: "• FinLit works out the returns itself from **AMFI**'s NAV history.\n• They are not copied from fund houses or other websites." },
  Q1310: { text: "• FinLit calculates them. AMFI publishes **NAVs**; FinLit works out 1-, 3- and 5-year returns, SIP returns, volatility and falls from that NAV history.\n• Each return shows its **since** date so you can check it." },
  Q1311: { text: "• AMFI publishes every scheme's daily NAV on its website, **amfiindia.com**.\n• The fund house's website and the scheme's factsheet show it too.\n• FinLit's fund page shows the NAV date, so you can match the same day." },
  Q1312: { text: "• Take the NAV on the **since** date and the latest NAV, both from AMFI.\n• **1 year**: (latest ÷ start) − 1. **3 or 5 years**: (latest ÷ start)^(1 ÷ years) − 1.\n• Small differences from other websites can come from a different start date." },
  Q1313: { text: "• AMFI publishes **average AUM** scheme-wise each quarter on **amfiindia.com**.\n• FinLit shows the period the AUM figure belongs to next to it.\n• Fund house factsheets give month-end AUM, which can differ from the quarterly average." },
  Q1314: { text: "• AMFI publishes each scheme's **TER** monthly on **amfiindia.com**, and fund houses publish it on their websites.\n• FinLit shows the date of the TER figure next to it, so you can match the same month." },
  Q1315: { text: "• No. Mutual fund NAVs are set **once a day**, after the market closes.\n• FinLit loads them every evening after AMFI publishes. AUM, expense ratios and holdings update monthly or quarterly.", link: FUNDS },
  Q1316: { text: "• A figure is blank when it cannot be worked out: for example, the fund is less than 1, 3 or 5 years old, its NAV history is not on file, or it has **stopped publishing** NAVs.\n• **IDCW** options show no return, because payouts would make the NAV-based figure too low.\n• Figures also stay blank where AMFI's file has no AUM or expense ratio for that plan.", link: FUNDS },
  Q1317: { text: "• A few fund houses are left out of FinLit's fund lists for now: data from them is incomplete in the sources FinLit reads, so their schemes are not shown.\n• All other fund houses in AMFI's NAV file are shown.", link: FUNDS },
  Q1318: { text: "• Not shown now: **ASK, Abakkus, ITI, Lakshya, NJ, PGIM India, Samco, Taurus, Trust, Unifi** and **Zerodha**.\n• They are left out of FinLit's fund lists for now (data from them is incomplete in the sources FinLit reads), so their schemes are not shown.", link: FUNDS },
  Q1319: { text: "• These fund houses are left out of FinLit's fund lists for now (data from them is incomplete in the sources FinLit reads), so their schemes are not shown.\n• All other fund houses in AMFI's NAV file are shown.", link: FUNDS },
  Q1320: { text: "• The **third-party mirror** is **api.mfapi.in**, a public copy of AMFI's NAV data.\n• FinLit uses it for a scheme's NAV history only when AMFI's own history for that scheme is not loaded yet.\n• The latest NAV still comes from AMFI, and the mirror's newest NAV is checked against AMFI's.", link: FUNDS },
  Q1321: { text: "• It means this scheme's NAV history comes from **api.mfapi.in**, a public copy of AMFI data, because AMFI's own history for it is not loaded yet.\n• The latest NAV is still AMFI's, and the mirror's newest NAV was checked against it.\n• **About the data** on the fund page shows the history source.", link: FUNDS },
  Q1322: { text: "• No. FinLit is **information only**: it describes funds from official data.\n• It does not give recommendations or predict returns." },
  Q1323: { text: "• No. FinLit describes funds from their data and does not give recommendations.\n• You can sort and filter the funds list, read each fund's returns, risk card and checklist, and compare funds side by side.", link: FUNDS },
  Q1324: { text: "• No. **Past returns do not guarantee future returns.**\n• A fund that did well before can do worse later, and the other way round. FinLit shows past figures only." },
  Q1325: { text: "• **Not loaded** means FinLit does not have that kind of data yet, so it cannot show it.\n• It is not a zero or a bad result; the source has not been added to FinLit yet." },
  Q1326: { text: "• **Not stated** means the official source does not give that detail for the scheme.\n• For example, **Plan not stated** means AMFI's file does not say whether the scheme is Direct or Regular." },
  Q1327: { text: "• No. FinLit does not offer funds, take orders or handle money.\n• It is **information only**: it shows official fund data and explains it." },
  Q1328: { text: "• No. FinLit earns **no commission** from fund houses or distributors.\n• It does not offer funds or take orders; it is information only." },
  Q1329: { text: "• The **hot** list is the most viewed and traded schemes, which FinLit keeps ready so they open fast.\n• It is refreshed **nightly**. It is not a ranking or a recommendation.", link: FUNDS },
  Q1330: { text: "• The fund page reads the latest figures for that one scheme, while the list's figures are copied into the list in a **nightly** step.\n• So a new expense ratio can appear on the fund page first and in the list after the next refresh.\n• The list also stays blank where the TER could not be matched to that exact plan.", link: FUNDS },
  Q1332: { text: "• Use the **Raise a Query** button at the bottom right of every page.\n• Mention the fund, the figure and the date shown, so it can be checked against the source." },

  // ---------------------------------------------------------------- excluded fund houses
  Q1333: excluded("ASK"),
  Q1334: excluded("Abakkus"),
  Q1335: excluded("ITI"),
  Q1336: excluded("Lakshya"),
  Q1337: excluded("NJ"),
  Q1338: excluded("PGIM India"),
  Q1339: excluded("Samco"),
  Q1340: excluded("Taurus"),
  Q1341: excluded("Trust"),
  Q1342: excluded("Unifi"),
  Q1343: excluded("Zerodha"),

  // ---------------------------------------------------------------- predictions and actions (guardrail)
  Q1344: { text: "• FinLit does not predict returns; no one can know what {fund} will return next year.\n• You can see its past **1-, 3- and 5-year returns** and how much it has swung on its risk card.", link: FUNDS },
  Q1345: { text: "• FinLit does not predict NAVs; a fund's NAV depends on how its holdings move.\n• You can see {fund}'s NAV history on its chart, back to launch where AMFI has it.", link: FUNDS },
  Q1346: { text: "• FinLit describes funds from their data and does not give recommendations or tell anyone to act on a fund.\n• On {fund}'s page you can see its returns, SIP return, risk card, expense ratio and **5-check checklist** against its peers.", link: FUNDS },
  Q1347: { text: "• FinLit describes funds from their data and does not give recommendations or tell anyone to exit a fund.\n• On {fund}'s page you can see how it has done against its category peers in the **5-check checklist**, plus its returns and risk card.", link: FUNDS },
  Q1348: { text: "• FinLit does not judge whether a fund is a good choice now, and does not predict prices.\n• You can see {fund}'s past returns, risk figures and how it compares with its category on its fund page.", link: FUNDS },
  Q1349: { text: "• FinLit does not predict markets.\n• A fund's risk card shows its **largest fall** in the past, which shows how much it has dropped before.", link: FUNDS },
  Q1350: { text: "• FinLit describes funds from their data and does not tell anyone when to move money between funds.\n• You can read {fund}'s checklist against its category, and use **Compare** to see it next to other funds.", link: COMPARE },
  Q1351: { text: "• FinLit does not predict the market or time redemptions.\n• A fund's scheme documents state any **exit load** period, and a fund page shows its NAV history.", link: FUNDS },

  // ---------------------------------------------------------------- out of scope
  Q1352: { text: "• FinLit does not have tax rules per fund, so it cannot work out your tax on {fund}.\n• Tax depends on the fund type, how long units were held, your income and current law; the scheme documents and a tax adviser cover it.", link: FUNDS },
  Q1353: { text: "• FinLit's fund pages do not have your personal mutual fund portfolio.\n• Your **Consolidated Account Statement (CAS)** from CAMS, KFintech or the depositories lists all your funds.", link: FUNDS },
  Q1354: { text: "• A fund watchlist is not available in this chat.\n• You can open {fund} from the funds list, and its page address can be saved as a bookmark.", link: FUNDS },
  Q1355: { text: "• FinLit does not take orders or handle money; it is information only.\n• Applications for units go through the fund house, the registrars (CAMS, KFintech), exchange platforms or a registered distributor.", link: FUNDS },
  Q1356: { text: "• FinLit does not take orders or set up SIPs; it is information only.\n• SIPs are registered through the fund house, the registrars, exchange platforms or a distributor.\n• The **SIP calculator** shows how a monthly amount grows at a chosen rate.", link: SIPCALC },
  Q1357: { text: "• FinLit does not have news about funds.\n• Fund houses post notices, such as changes to a scheme, on their websites. FinLit shows {fund}'s latest NAV and returns.", link: FUNDS },
  Q1358: { text: "• FinLit does not show third-party ratings such as Morningstar or Value Research.\n• It shows its own **5-check checklist**, comparing {fund} with its category peers on return, cost, falls, size and age.", link: FUNDS },
  Q1359: { text: "• FinLit does not give star ratings.\n• It shows a **5-check checklist** against category peers, e.g. **4 of 5**, plus the fund's returns and risk card.", link: FUNDS },
  Q1360: { text: "• FinLit does not show **alpha**, **beta** or **R-squared** yet: the index data it holds is price-only.\n• {fund}'s risk card shows its **volatility** and **largest fall**, and the fund's factsheet often states these ratios.", link: FUNDS },
  Q1361: { text: "• FinLit does not work out portfolio **P/E** or **P/B** yet: it has no valuation analytics on holdings.\n• The fund's monthly **factsheet** often states them; FinLit shows {fund}'s holdings where the fund house publishes them.", link: FUNDS },
  Q1362: { text: "• FinLit does not show **credit quality** (the split of bonds by rating) yet.\n• The fund's monthly **factsheet** shows its rating split; FinLit shows {fund}'s holdings where the fund house publishes them.", link: FUNDS },
  Q1363: { text: "• FinLit does not show **YTM** or **modified duration** yet.\n• **YTM** is the yearly return the bonds would give if held to maturity; **modified duration** shows how much the NAV moves for a 1% change in interest rates.\n• The fund's monthly **factsheet** states both.", link: FUNDS },
  Q1364: { text: "• FinLit does not show **average maturity** yet.\n• It is the weighted average time until the fund's bonds mature; the fund's monthly **factsheet** states it.", link: FUNDS },
  Q1365: { text: "• FinLit does not show IDCW (dividend) payout history yet.\n• The fund house's website lists past IDCW payouts and record dates for {fund}.", link: FUNDS },
  Q1366: { text: "• FinLit does not have SIP pause or stop rules; each fund house and platform sets its own.\n• The fund house or the platform used to register the SIP states how to pause or stop it.", link: SIPCALC },
  Q1367: { text: "• FinLit does not have factsheet PDFs.\n• {fund}'s monthly factsheet is on its fund house's website. FinLit shows its NAV, returns, risk and holdings where published.", link: FUNDS },
  Q1368: { text: "• FinLit does not have scheme documents.\n• The **Scheme Information Document (SID)** of {fund} is on its fund house's website and SEBI's website.", link: FUNDS },
  Q1369: { text: "• FinLit does not have merger notices.\n• Fund houses announce scheme mergers on their websites. If a scheme stops publishing NAVs, FinLit marks it **Stopped publishing**.", link: FUNDS },
  Q1370: { text: "• FinLit does not take AUM from AMFI's performance list.\n• It shows AMFI's **average AUM** by scheme, published **quarterly**, with the period next to the figure.", link: FUNDS },
  Q1372: { text: "• FinLit does not show **15-year returns**; it works out **1-, 3- and 5-year** returns.\n• You can see {fund}'s NAV chart back to launch, where AMFI has the history, to see longer periods.", link: FUNDS },
  Q1373: { text: "• FinLit does not compare a fund with its benchmark yet: the index data it holds is **price-only**, so the comparison would not be fair.\n• **Compare** lets you put {fund} next to other funds, such as an index fund on the same index.", link: COMPARE },

  // ---------------------------------------------------------------- navigation
  Q1374: { text: "• Open **Funds** in the top menu, then **Mutual funds**.\n• The list has filters for category, plan and fund house, a search box, and sorting by clicking a column.", link: FUNDS },
  Q1375: { text: "• Use the link below to open **Mutual Fund Insights**.\n• It shows industry net inflows and AUM by category from AMFI, from April 2019.", link: INSIGHTS },
  Q1376: { text: "• Use the link below, or **Compare funds** in the site footer under **Funds and Workspace**.\n• It takes **2 to 4** funds side by side.", link: COMPARE },
  Q1377: { text: "• Open **Funds** in the top menu, then **ETFs**.\n• The ETF list can be searched and sorted by clicking a column.", link: ETFS },
  Q1378: { text: "• Open **Research** in the top menu, then **SIP calculator** under **Investment calculators**.\n• Enter a monthly amount, a period and a yearly rate to see how the amount grows.", link: SIPCALC },
  Q1379: { text: "• Open the **Compare** page and search for each fund to add it.\n• It takes **2 to 4** funds and shows their returns and risk side by side.", link: COMPARE },
  Q1380: { text: "• In the funds list, use the **category** filter above the table.\n• The list then shows only funds in that category.", link: FUNDS },
  Q1381: { text: "• In the funds list, set the **plan** filter to **Direct**.\n• Regular plans of the same funds are then hidden.", link: FUNDS },
  Q1382: { text: "• In the funds list, tick **Include schemes that stopped publishing NAVs** above the table.\n• Stopped schemes carry a **Stopped publishing** tag and show no returns.", link: FUNDS },
  Q1383: { text: "• Type part of the fund's name in the **search box** at the top of the funds list.\n• Open a result to see its fund page.", link: FUNDS },
  Q1384: { text: "• In the funds list, click a return column heading, such as **5Y**, to sort by it.\n• Click it again to reverse the order.", link: FUNDS },
  Q1385: { text: "• The **Checklist** column shows how many of **5** checks a fund passes against peers in the same category and plan, e.g. **4 of 5**.\n• The checks: long-term return above the category median, expense ratio below it, a smaller largest fall than the median, fund size at least **₹500 crore**, and at least **5 years** since launch.", link: FUNDS },
  Q1386: { text: "• **About the data** on a fund page shows how much NAV history is on file and its date range.\n• It also shows where the history came from (AMFI or a third-party mirror) and that the latest NAV is from AMFI's NAV file.", link: FUNDS },
  Q1387: { text: "• Open a fund from the funds list; the **risk card** is on its page below the returns.\n• The section links near the top of the fund page jump straight to it.", link: FUNDS },
  Q1388: { text: "• Open a fund from the funds list and go to **What it invests in** on its page.\n• Holdings appear where the fund house publishes a monthly portfolio file; FinLit reads **39** fund houses.", link: FUNDS },
  Q1389: { text: "• Open a fund's page and go to **Other plans and options of this fund**.\n• It lists the Direct, Regular, Growth and IDCW versions with their own figures.", link: FUNDS },
  Q1390: { text: "• Open the **Compare** page and add the three funds one by one with its search box.\n• It takes up to **4** funds at once.", link: COMPARE },
  Q1391: { text: "• Copy the fund page's address from your browser's address bar and share it.\n• The link opens the same fund page for anyone.", link: FUNDS },
};

// Task #203, the questions answered in general that the first pass left out (found by askFunds.test.ts: every question has an answer)
const riskList = (who: string): Written => ({ text: `• FinLit does not have a list of ${who} by **risk-o-meter** level yet: fund houses publish the level in their own documents, and FinLit reads it for only some of them.\n• A fund's page shows its risk-o-meter where FinLit has it, with its **volatility** and **largest fall** worked out from the NAV history.\n• The fund screener filters by those measured risk figures.`, link: SCREENER });
Object.assign(FUND_TEXT, {
  Q0333: { text: "• Each NAV on FinLit shows the **date** it belongs to, from AMFI's NAV file.\n• A fund's NAV is worked out after the market closes, so the latest one is usually for the **last business day**.", link: FUNDS },
  Q0345: { text: "• No: a **lower NAV** does not make a fund cheaper.\n• NAV depends on when the fund started and how it has grown; ₹10,000 buys the **same value** of the portfolio at any NAV.\n• What changes the outcome is how the portfolio does next, and the costs.", link: GLOSSARY },
  Q0346: { text: "• No: the size of a NAV says nothing about how good a fund is.\n• To compare funds, look at their **returns over the same period**, their **costs** and their **risk**, against funds of the same category.", link: FUNDS },
  Q0546: FUND_TEXT.Q1257,
  Q0585: { text: "• FinLit's fund size is AMFI's **average AUM** for a **quarter**, shown with the date the quarter ends (e.g. 30 Sep).\n• It covers all plans of a scheme together.", link: FUNDS },
  Q0586: { text: "• **Quarterly**: AMFI's average AUM per scheme for the quarter.\n• Industry and category totals on Mutual Fund Insights are **monthly** (AMFI's monthly category report).", link: INSIGHTS },
  Q0623: { text: "• Each expense ratio on FinLit shows the **date of AMFI's TER file** it comes from.\n• Fund houses can change the expense ratio during the month; FinLit reads AMFI's file as it is updated.", link: FUNDS },
  Q0649: { text: "• The **expense ratio** is taken from the fund every day, so the NAV and every return you see are **already after** it.\n• Over many years a higher ratio adds up: **1%** a year more in costs leaves roughly **1%** a year less return, compounding.\n• That is why the Direct plan of a fund, with a lower ratio, shows higher returns than its Regular plan.", link: GLOSSARY },
  Q0650: FUND_TEXT.Q1246,
  Q0657: { text: "• FinLit cannot list funds without an exit load yet: exit loads are in each scheme's own documents, and FinLit reads them for only part of the schemes.\n• A fund's page shows its exit load where FinLit has it.", link: FUNDS },
  ...Object.fromEntries(["Q0681", "Q0682", "Q0683", "Q0684", "Q0685", "Q0686", "Q0687", "Q0688", "Q0689", "Q0690"].map((id) => [id, riskList("these funds")])),
  ...Object.fromEntries(["Q0691", "Q0692", "Q0693", "Q0694"].map((id) => [id, riskList("funds")])),
  Q0695: FUND_TEXT.Q1260,
  Q0696: { text: "• The **6** risk-o-meter levels, from lowest to highest: **Low**, **Low to Moderate**, **Moderate**, **Moderately High**, **High** and **Very High**.\n• SEBI requires every fund to carry one; fund houses review it every month.", link: GLOSSARY },
  ...Object.fromEntries(["Q0699", "Q0700", "Q0701", "Q0702", "Q0703", "Q0704", "Q0705", "Q0706"].map((id) => [id, riskList("this fund house's funds")])),
  Q0750: { text: "• On a fund's page, under **What it invests in**, each listed company in the holdings opens its FinLit company report.\n• Holdings show where the fund house's monthly portfolio file is read by FinLit.", link: FUNDS },
  Q0805: { text: "• Open **Compare funds** and add up to **4** funds: their returns, risk and costs sit side by side.\n• On the mutual funds list, tick the funds you want and open the compare bar.", link: COMPARE },
} satisfies Record<string, Written>);

/** Pages a written answer may point to (kept here so a test can check links stay inside the app). */
export const FUND_TEXT_PAGES = [FUNDS, ETFS, COMPARE, INSIGHTS, SIPCALC, GLOSSARY, SCREENER].map((l) => l.to);
