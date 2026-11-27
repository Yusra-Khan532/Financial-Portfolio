"""FinLit AI's finance knowledge layer (task #240, 19 Nov 2026: train FinLit AI on the attached reference,
FinLit_AI_Finance_Training_Parameters_and_Sources.pdf).

The reference itself says how to do it (its sections 1 and 14): curated knowledge retrieval for concepts, structured data for changing figures,
evaluated examples for behaviour; fine-tuning is no substitute for current data or retrieval, and comes only after evaluated examples exist.
The provider's small model cannot be retrained by us anyway. So the reference becomes:
  - this module, read by the tool `get_finance_framework` (which measures matter for a topic or a sector, how each is read, its traps);
  - the answering rules in ask/service.SYSTEM (the reference's question patterns and quality checklist, its source order);
  - the evaluation set in scripts/ask_eval.py (the reference's example questions, checked against its checklist).
Figures always come from FinLit's tools or the web, never from here: this module holds no company's numbers."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

# ------------------------------------------------------------------------------------------------ the parameter families (reference sections 1, 2, 4 to 8)
TOPICS: Dict[str, Dict[str, Any]] = {
    "income_statement": {"title": "Income statement", "measures": [
        "Revenue from operations", "Other income", "Gross profit and COGS", "EBITDA", "EBIT", "Depreciation and amortisation", "Finance cost", "PBT",
        "Tax", "PAT", "Minority interest", "Exceptional items", "Basic and diluted EPS"],
        "read": "Follow revenue down to PAT: where did the money go (costs, interest, depreciation, tax, one-offs)? Separate exceptional items from the "
                "operating business."},
    "balance_sheet": {"title": "Balance sheet", "measures": [
        "Cash and equivalents", "Investments", "Receivables", "Inventory", "PPE", "Intangibles and goodwill", "Total assets", "Payables",
        "Short- and long-term borrowings", "Lease liabilities", "Provisions", "Share capital and reserves (net worth)"],
        "read": "What the company owns against what it owes; how much is borrowed; how much of the assets are goodwill or receivables."},
    "cash_flow": {"title": "Cash flow", "measures": [
        "CFO (cash from operations)", "CFI (investing)", "CFF (financing)", "Capital expenditure", "Free cash flow", "Dividends paid",
        "Debt raised or repaid", "Working-capital movement"],
        "read": "Profit is an opinion, cash is a fact: compare CFO with PAT, and free cash flow with what is paid out."},
    "growth": {"title": "Growth and consistency", "measures": [
        "Revenue, EBITDA, EBIT, PAT and EPS growth", "QoQ and YoY", "3, 5 and 10-year CAGR", "Quarterly and annual trend",
        "Acceleration or slowdown", "Consecutive quarters of growth"],
        "read": "Growth is read over several periods and against its own history; one quarter is not a trend."},
    "earnings_quality": {"title": "Earnings quality", "measures": [
        "CFO / PAT", "FCF / PAT", "Receivables growth vs sales growth", "Inventory growth vs sales growth", "Other income share of profit",
        "Reliance on exceptional items", "Accruals", "Cash conversion", "Auditor qualifications"],
        "read": "Profit that does not turn into cash, receivables growing faster than sales, or profit propped up by other income are flags to "
                "describe, not conclusions."},
    "valuation": {"title": "Valuation ratios", "measures": [
        "Trailing and forward P/E", "P/B", "PEG", "EV/EBITDA", "EV/EBIT", "EV/Sales", "Price/Sales", "Dividend yield", "FCF yield",
        "Market cap", "Enterprise value"],
        "read": "Lower can mean cheaper or a weaker business; a valuation ratio is read against growth, quality, peers and the company's own history, "
                "never alone. P/E is not meaningful when earnings are negative.", "better": "lower, in context"},
    "profitability": {"title": "Profitability and returns", "measures": [
        "Gross, EBITDA, EBIT and PAT margins", "ROE", "ROA", "ROCE", "ROIC", "Return on tangible capital", "Incremental ROCE", "DuPont parts"],
        "read": "Higher is better, read across several years and against peers of the same sector; ROE can be lifted by debt (DuPont shows how).",
        "better": "higher"},
    "liquidity_leverage": {"title": "Liquidity and leverage", "measures": [
        "Current ratio", "Quick ratio", "Cash ratio", "Debt/equity", "Gross and net debt", "Debt/EBITDA", "Interest coverage", "DSCR",
        "Debt maturity profile"],
        "read": "Lower debt and higher cover are safer; for banks and lenders these ratios are read differently (borrowing is their raw material).",
        "better": "debt lower, cover higher"},
    "efficiency": {"title": "Efficiency", "measures": [
        "Asset turnover", "Inventory turnover", "Receivable (debtor) days", "Payable (creditor) days", "Working-capital days",
        "Cash conversion cycle", "Fixed-asset turnover", "Capacity utilisation"],
        "read": "Fewer receivable and inventory days and a shorter cash cycle mean money comes back faster; compare within the sector."},
    "ownership": {"title": "Ownership and shareholder measures", "measures": [
        "Promoter holding", "Promoter pledge", "FII/FPI holding", "DII holding", "Mutual fund holding", "Public holding", "Dilution",
        "Buybacks", "Dividend payout and cover", "Free float"],
        "read": "A pledge, falling promoter holding or repeated dilution are facts to state with their dates; they are not verdicts."},
    "valuation_methods": {"title": "Valuation methods", "measures": [
        "Comparable companies", "Precedent transactions", "DCF (FCFF, FCFE)", "Dividend discount model", "Sum of the parts", "Residual income",
        "Asset-based"],
        "read": "A DCF is only as good as its inputs: revenue, margins, tax, capex, working capital, WACC (cost of equity and debt, risk-free rate, "
                "equity risk premium, beta), terminal growth; show the sensitivity, never one number as the truth."},
    "investment_reasoning": {"title": "Investment reasoning", "measures": [
        "Growth vs value", "Quality", "Moat and competitive advantage", "Market share and pricing power", "Capital allocation",
        "Management execution", "Margin of safety", "Value trap and growth trap", "Cyclicality", "Bull, base and bear cases"],
        "read": "Describe each with evidence; FinLit never turns them into a call to buy or sell."},
    "portfolio": {"title": "Portfolio measures", "measures": [
        "CAGR", "XIRR", "TWR", "Alpha", "Beta", "Sharpe", "Sortino", "Information ratio", "Treynor", "Standard deviation", "Maximum drawdown",
        "Correlation", "Concentration", "Sector exposure", "Asset allocation", "Tracking error"],
        "read": "Returns are read with the risk taken; XIRR for money added at different times, CAGR for one sum."},
    "technical": {"title": "Technical analysis and market structure", "measures": [
        "Trend (higher highs and lows)", "SMA and EMA 20/50/100/200 and crossovers", "RSI", "MACD", "Stochastic", "ROC", "ADX", "ATR",
        "Bollinger Bands", "Volume and delivery volume", "VWAP", "OBV", "Support and resistance", "Relative strength vs a benchmark",
        "Bulk and block deals", "Futures open interest", "Put-call ratio", "Circuit limits"],
        "read": "Technical readings describe past prices and trading; they do not predict the next move. FinLit's own technical view is in Prism. "
                "Bulk and block deals come from NSE's files (the get_bulk_block_deals tool; the Bulk & Block Deals page, /ipo?view=deals): who traded, how much, "
                "at what price, each trade counted once; they describe trades, not intentions."},
    "funds": {"title": "Mutual funds and ETFs", "measures": [
        "NAV", "AUM", "Expense ratio (TER)", "Exit load", "Benchmark", "Direct vs Regular", "Growth vs IDCW", "Portfolio turnover",
        "Manager tenure", "Style drift", "Rolling returns", "Category rank", "Sharpe, Sortino, alpha, beta, standard deviation", "Maximum drawdown",
        "Upside and downside capture", "Tracking error and tracking difference (index funds and ETFs)", "iNAV and premium/discount (ETFs)",
        "Bid-ask spread and liquidity (ETFs)"],
        "read": "Compare a fund with its own category and benchmark, over rolling periods, after costs; Direct and Regular plans of one scheme differ "
                "only in cost. FinLit's Mutual Fund Score reads performance, risk, cost and quality."},
    "fixed_income": {"title": "Fixed income", "measures": [
        "Coupon", "YTM", "Current yield", "Duration and modified duration", "Convexity", "Credit spread", "G-sec yield and the yield curve",
        "Rating", "Default probability and recovery", "Accrued interest", "Clean and dirty price"],
        "read": "Prices fall when rates rise, more for longer duration; a higher yield usually carries more credit risk."},
    "macro": {"title": "Macroeconomics, currency and commodities", "measures": [
        "GDP and GVA", "CPI and WPI", "IIP", "PMI", "Fiscal and current account deficit", "Repo rate, CRR, SLR", "Bank credit and deposit growth",
        "Forex reserves", "USD/INR and DXY", "US Fed rate and Treasury yields", "FII/FPI and DII flows", "Brent, WTI, gas, coal", "Gold, silver",
        "Copper, aluminium, steel", "Freight rates"],
        "read": "FinLit's India economy page and FII/DII flows hold these with their periods; give the release date with every reading."},
    "corporate_actions": {"title": "Corporate actions", "measures": [
        "Dividend", "Bonus", "Split", "Rights issue", "Buyback", "QIP", "Preferential allotment", "OFS", "IPO and FPO", "Merger and demerger",
        "Acquisition", "Delisting", "Scheme of arrangement"],
        "read": "State the record date, ratio or price and what it changes for an existing shareholder; FinLit's News & filings holds the filings."},
    "governance_risk": {"title": "Governance, disclosures and risks", "measures": [
        "Related-party transactions", "Auditor resignation or qualification", "Internal financial controls", "Promoter pledge",
        "Insider and SAST disclosures", "Board independence", "Remuneration", "Contingent liabilities", "Litigation", "BRSR", "MD&A",
        "Risks: financial, liquidity, leverage, refinancing, operational, execution, concentration, regulatory, governance, cyber, commodity, "
        "currency, interest-rate, valuation, ESG, technology disruption"],
        "read": "Name the risk, the filing or figure that shows it and its date; never rate the company on it."},
}

# ------------------------------------------------------------------------------------------------ sector-specific measures (reference section 3)
SECTORS: Dict[str, Dict[str, Any]] = {
    "banks": {"title": "Banks", "match": r"(?<!non )(?<!non-)(?<!non)\bbank", "measures": [   # the match: never "Non Banking Financial Company"
        "NIM", "CASA ratio", "GNPA and NNPA", "PCR (provision coverage)", "Slippage ratio", "Credit cost", "CET1 and CRAR", "ROA and ROE",
        "Cost-to-income", "Deposit and advances growth", "LCR"],
        "note": "For a bank, debt/equity, current ratio and EBITDA are not meaningful: deposits are its raw material."},
    "nbfc": {"title": "NBFCs and housing finance", "match": r"\bnbfc|non[- ]banking|housing finance|\bhfc|finance compan|consumer finance|microfinance|lending|^finance$|^financial services$",
             "measures": ["AUM growth", "Disbursement growth", "Collection efficiency", "GNPA and NNPA", "Credit cost", "Stage 2 and 3 assets",
                          "Capital adequacy", "Gearing", "ALM gaps and liquidity", "Cost of funds", "Spread and NIM", "Borrowing mix"],
             "note": "Asset quality, capital, liquidity and the cost of borrowing matter more than margins on sales."},
    "insurance": {"title": "Insurance", "match": r"insur", "measures": [
        "Gross written premium", "APE", "VNB and VNB margin", "Embedded value", "Persistency", "Solvency ratio", "Claims ratio",
        "Combined ratio", "Expense ratio", "Renewal premium", "Channel mix"],
        "note": "Life insurers are read by VNB and embedded value; general insurers by the combined ratio and solvency."},
    "amc_exchanges": {"title": "AMCs, exchanges and brokers", "match": r"asset manag|\bamc\b|exchange|depositor|broking|capital market",
                      "measures": ["AUM", "Net flows", "Market share", "Yield on AUM", "Equity/debt mix", "SIP flows", "Operating margin",
                                   "Transaction volumes", "Active clients", "Revenue per client"]},
    "it": {"title": "IT services", "match": r"\bit\b|software|information technology|it services|computers",
           "measures": ["Constant-currency growth", "Dollar revenue", "EBIT margin", "Utilisation", "Attrition", "Revenue per employee",
                        "Onsite/offshore mix", "Deal wins and TCV", "Client concentration", "DSO"]},
    "fmcg": {"title": "FMCG and consumer", "match": r"fmcg|fast moving|consumer|food|beverage|personal care|personal products|household|tobacco|cigarette|retail",
             "measures": ["Volume growth", "Price/mix growth", "Distribution reach", "Market share", "Gross margin", "Advertising spend",
                          "Rural/urban mix", "Inventory", "Working capital"]},
    "auto": {"title": "Automobiles", "match": r"auto|vehicle|two wheeler|tyre",
             "measures": ["Volumes", "Average selling price", "Product mix", "EBITDA per vehicle", "Capacity utilisation", "Order backlog",
                          "EV share", "Export mix", "Dealer inventory", "Warranty provisions"]},
    "pharma": {"title": "Pharma and healthcare", "match": r"pharma|health|hospital|diagnostic|drug",
               "measures": ["Domestic formulation growth", "US sales", "ANDA pipeline", "Launches", "R&D to sales", "Gross margin",
                            "Plant utilisation", "Regulatory observations (USFDA)", "Product concentration", "Hospital occupancy and ARPOB"]},
    "real_estate": {"title": "Real estate and construction", "match": r"real estate|realty|residential|commercial projects|property|construction|cement|housing",
                    "measures": ["Pre-sales and bookings", "Collections", "Area sold and realisation", "Unsold inventory", "Launches",
                                 "Completion pipeline", "Net debt", "Customer advances", "Project cash flow"]},
    "telecom_media": {"title": "Telecom and media", "match": r"telecom|media|broadcast|entertainment",
                      "measures": ["ARPU", "Subscribers and churn", "Data usage", "Broadband subscribers", "Capex per subscriber",
                                   "Spectrum obligations", "EBITDA", "Content cost", "Ad yield", "Paid subscribers"]},
    "capital_goods": {"title": "Capital goods, infrastructure and logistics", "match": r"capital goods|industrial|engineering|infra|logistic|defen[cs]e|aerospace|railway|shipping|port|electrical equipment",
                      "measures": ["Order inflows", "Order book and book-to-bill", "Execution and project milestones", "Working capital and receivable days",
                                   "Claims", "Capacity", "Freight yield and tonnage", "Fleet utilisation"]},
    "energy_power": {"title": "Oil, gas, power and renewables", "match": r"oil|gas|petrol|refin|power|energy|renewable|utilit|electricity|consumable fuels|coal",
                     "measures": ["GRM and refining margin", "Throughput", "Petrochemical spreads", "Production and reserve replacement",
                                  "PLF and CUF", "Generation", "Receivables", "Tariff and PPA", "Capacity additions", "Project pipeline"]},
    "metals_chemicals": {"title": "Metals, mining and chemicals", "match": r"metal|steel|alumin|copper|zinc|mining|chemical|commodit",
                         "measures": ["Realisation per tonne", "Production and sales volume", "EBITDA per tonne", "Input spreads", "Utilisation",
                                      "Commodity prices", "Reserves and mine life", "Energy intensity", "Export mix"]},
}

# ------------------------------------------------------------------------------------------------ sources (reference sections 9 and 10) and patterns (12)
SOURCES = {
    "primary": ["NSE (nseindia.com): results, announcements, shareholding, corporate actions", "BSE (bseindia.com): filings, results, corporate actions",
                "SEBI (sebi.gov.in): regulations, circulars, orders", "RBI (rbi.org.in, data.rbi.org.in): policy, rates, banking data",
                "MOSPI (mospi.gov.in): GDP, CPI, IIP", "AMFI (amfiindia.com): fund statistics and NAVs",
                "Nifty Indices (niftyindices.com): index methods and constituents", "the company's own investor-relations page: annual reports, presentations, transcripts",
                "MCA (mca.gov.in): company master data"],
    "secondary": ["Screener, Moneycontrol, Trendlyne, Tickertape, Investing.com (check important figures against the filings)",
                  "TradingView (charts)", "FRED and SEC EDGAR (US data and filings)"],
    "education": ["SEBI investor site (investor.sebi.gov.in)", "CFA Institute", "Investopedia (plain definitions, not evidence)", "Investor.gov"],
}
# ------------------------------------------------------------------------------------------------ the team's source directory (task #253)
# FinLit_AI_Finance_Economics_Resources.pdf (19 Nov 2026): "if question is for broader economy then it should be trained separately; if its related to
# financials refer to finlit company page and moneycontrol and for daily news look moneycontrol.com; and so on". Its "How to use": official regulators,
# exchanges, company filings and statistical agencies first; educational and research sites for explanations; commercial data platforms and news as
# secondary. Its data-use note: FinLit AI only searches and links these live pages and names them; it never copies, stores or trains on their content.
# Each entry: (name, domain, what it is useful for, standing). Standing: primary | education | research | secondary.
Site = Dict[str, str]


def _s(name: str, domain: str, useful: str, standing: str) -> Site:
    return {"name": name, "domain": domain, "useful": useful, "standing": standing}


DIRECTORY: Dict[str, Dict[str, Any]] = {
    "education": {"title": "Financial knowledge and education", "sites": [
        _s("Investopedia", "investopedia.com", "Finance concepts, ratios, valuation, derivatives and investing terminology", "education"),
        _s("Corporate Finance Institute (CFI)", "corporatefinanceinstitute.com", "Financial modelling, accounting, corporate finance and analysis", "education"),
        _s("Wall Street Prep", "wallstreetprep.com", "DCF, financial modelling, valuation and investment banking concepts", "education"),
        _s("CFA Institute", "cfainstitute.org", "Equity, fixed income, portfolio management, ethics and economics", "education"),
        _s("Khan Academy: Economics and Finance", "khanacademy.org", "Foundational economics, accounting and personal finance", "education"),
        _s("FINRA Investor Education", "finra.org", "Investment products, securities and investor education", "education"),
        _s("Federal Reserve", "federalreserve.gov", "Monetary policy, central banking and financial-system information", "primary"),
    ]},
    "india_markets": {"title": "Indian financial markets and regulators", "sites": [
        _s("SEBI", "sebi.gov.in", "Securities regulations, circulars, disclosures and investor protection", "primary"),
        _s("NSE India", "nseindia.com", "Indian equities, indices, market structure and corporate announcements", "primary"),
        _s("BSE India", "bseindia.com", "Listed-company disclosures, filings and market information", "primary"),
        _s("Reserve Bank of India (RBI)", "rbi.org.in", "Monetary policy, banking, inflation, interest rates and financial stability", "primary"),
        _s("RBI Database on Indian Economy (DBIE)", "data.rbi.org.in", "Indian macroeconomic, banking and financial time series", "primary"),
        _s("Ministry of Statistics and Programme Implementation", "mospi.gov.in", "GDP, CPI, IIP and official economic statistics", "primary"),
        _s("Department of Economic Affairs", "dea.gov.in", "Economic policy, government reports and macroeconomic material", "primary"),
        _s("NISM", "nism.ac.in", "Indian securities markets, mutual funds and investment education", "education"),
        _s("AMFI", "amfiindia.com", "Mutual funds, NAV, AUM, categories and industry statistics", "primary"),
    ]},
    "company_financials": {"title": "Company financials and fundamental analysis", "sites": [
        _s("Screener.in", "screener.in", "Indian company financials, ratios, quarterly results and screening", "secondary"),
        _s("Moneycontrol", "moneycontrol.com", "Company results, financial ratios, market information and news", "secondary"),
        _s("Tickertape", "tickertape.in", "Stock fundamentals, valuation metrics and financial data", "secondary"),
        _s("Trendlyne", "trendlyne.com", "Financial analysis, forecasts, ownership and corporate actions", "secondary"),
        _s("AnnualReports", "annualreports.com", "Company annual reports and historical disclosures", "secondary"),
        _s("SEC EDGAR", "sec.gov", "US company filings including 10-K, 10-Q and related disclosures", "primary"),
    ]},
    "economics": {"title": "Economics and macroeconomic research", "sites": [
        _s("IMF Data", "imf.org", "GDP, inflation, fiscal indicators and global economic datasets", "primary"),
        _s("World Bank Data", "data.worldbank.org", "Global development, economic and country-level indicators", "primary"),
        _s("FRED", "fred.stlouisfed.org", "Historical interest rates, inflation, employment and economic series", "primary"),
        _s("OECD Data", "oecd.org", "Economic policy, productivity, taxation and comparative indicators", "primary"),
        _s("UN Data", "data.un.org", "International economic, demographic and social statistics", "primary"),
        _s("Bank for International Settlements (BIS)", "bis.org", "Global banking, monetary policy and financial stability research", "primary"),
        _s("National Bureau of Economic Research (NBER)", "nber.org", "Academic research papers in economics and finance", "research"),
        _s("Our World in Data", "ourworldindata.org", "Long-run economic, demographic and social trends", "research"),
    ]},
    "valuation": {"title": "Valuation and investment research", "sites": [
        _s("Aswath Damodaran (NYU)", "pages.stern.nyu.edu", "DCF, cost of capital, valuation, risk premiums and industry multiples", "research"),
        _s("Morningstar", "morningstar.com", "Equity research, fund analysis and investment research", "secondary"),
        _s("Multpl", "multpl.com", "Historical market valuation data and P/E ratios", "secondary"),
        _s("Value Line", "valueline.com", "Company analysis and investment research", "secondary"),
        _s("GuruFocus", "gurufocus.com", "Valuation, financial ratios and historical fundamentals", "secondary"),
        _s("Alpha Architect", "alphaarchitect.com", "Factor investing and quantitative investment research", "research"),
        _s("SSRN", "papers.ssrn.com", "Academic finance, economics and investment research", "research"),
    ]},
    "news": {"title": "Financial news and business intelligence", "sites": [
        _s("Moneycontrol News", "moneycontrol.com", "Indian stock-market and corporate news", "secondary"),
        _s("Mint", "livemint.com", "Indian business, corporate and financial news", "secondary"),
        _s("Economic Times", "economictimes.indiatimes.com", "Corporate developments, markets and economic news", "secondary"),
        _s("Business Standard", "business-standard.com", "Indian economy, policy and company analysis", "secondary"),
        _s("Reuters Markets", "reuters.com", "Global markets and financial developments", "secondary"),
        _s("Bloomberg Markets", "bloomberg.com", "Global markets, companies and economic developments", "secondary"),
        _s("CNBC", "cnbc.com", "Global business, markets and economic updates", "secondary"),
    ]},
    "sector": {"title": "Sector-specific sources", "sites": [
        _s("IRDAI", "irdai.gov.in", "Insurance regulation, industry data and disclosures", "primary"),
        _s("NABARD", "nabard.org", "Rural finance, agricultural credit and development banking", "primary"),
        _s("CDSCO", "cdsco.gov.in", "Indian drug regulation and pharmaceutical approvals", "primary"),
        _s("US FDA", "fda.gov", "Drug, medical-device and regulatory information", "primary"),
        _s("International Energy Agency (IEA)", "iea.org", "Energy markets, policy, supply and demand outlooks", "research"),
        _s("Central Electricity Authority (CEA)", "cea.nic.in", "Indian power-sector statistics, reports and planning", "primary"),
        _s("Indian Bureau of Mines", "ibm.gov.in", "Mineral production, mining statistics and industry information", "primary"),
        _s("US Geological Survey (USGS)", "usgs.gov", "Minerals, commodities and geological data", "primary"),
        _s("RERA / Ministry of Housing", "rera.mohua.gov.in", "Real-estate regulatory framework and state RERA links", "primary"),
        _s("National Housing Bank (NHB)", "nhb.org.in", "Housing finance and housing-market research", "primary"),
        _s("Society of Indian Automobile Manufacturers (SIAM)", "siam.in", "Indian automobile industry statistics and reports", "secondary"),
        _s("Automotive Component Manufacturers Association (ACMA)", "acma.in", "Automotive component industry data and reports", "secondary"),
        _s("NASSCOM", "nasscom.in", "Indian IT and technology industry research", "secondary"),
    ]},
}
# The sector-specific sites by FinLit's sector families (SECTORS above), plus rural and farm finance, which has no family of its own.
SECTOR_SOURCES: Dict[str, List[str]] = {
    "insurance": ["irdai.gov.in"], "pharma": ["cdsco.gov.in", "fda.gov"], "energy_power": ["cea.nic.in", "iea.org"],
    "metals_chemicals": ["ibm.gov.in", "usgs.gov"], "real_estate": ["rera.mohua.gov.in", "nhb.org.in"], "nbfc": ["nhb.org.in"],
    "auto": ["siam.in", "acma.in"], "it": ["nasscom.in"], "rural_agri": ["nabard.org"],
}
# The directory's "Suggested FinLit AI knowledge-base structure".
KB_STRUCTURE = [
    ("Finance concepts", "definitions, formulas, worked examples and FAQs"),
    ("Fundamental analysis", "financial statements, ratios, sector benchmarks and company filings"),
    ("Valuation", "DCF, PE, PEG, EV/EBITDA, cost of capital and peer comparisons"),
    ("Economics", "GDP, inflation, interest rates, fiscal policy and macroeconomic time series"),
    ("Sector intelligence", "industry-specific operating metrics, regulations and business drivers"),
    ("Corporate intelligence", "annual reports, quarterly results, investor presentations and exchange announcements"),
]
DATA_USE = ("A site being reachable does not give the right to copy, redistribute or train on its content: FinLit AI only searches these live pages, "
            "quotes briefly and names and links the site; it stores none of their content.")


def site_name(domain: str) -> str:
    """The directory's name for a domain (the first entry that lists it), or the domain itself."""
    for cat in DIRECTORY.values():
        for s in cat["sites"]:
            if s["domain"] == domain:
                return s["name"]
    return domain


def all_domains() -> List[str]:
    return [s["domain"] for cat in DIRECTORY.values() for s in cat["sites"]]


PATTERNS = [
    ("What does ROCE (or any ratio) mean?", "Define it, give the formula and its variant, how to read it and its limits."),
    ("Why did profit fall while revenue rose?", "Look at margins, costs, finance cost, depreciation, tax, exceptional items and segment mix, from the results."),
    ("Is a P/E of 45 expensive?", "Never judge on P/E alone: compare growth, quality, peers, the company's own history, cash flow and expectations."),
    ("Which ratios matter for an NBFC (or any sector)?", "Use that sector's own measures (asset quality, capital, liquidity, leverage, profitability)."),
    ("Why did the price fall after results?", "Compare the results with expectations and guidance, margins, cash flow, disclosures and the market that day."),
    ("Is this a value trap?", "Describe structural decline, governance, leverage, cash conversion, cyclicality and valuation, with evidence; no verdict."),
]
CHECKLIST = ["Arithmetic and formulas correct", "Source, date and reporting period stated", "Standalone and consolidated never mixed",
             "The sector's own measures used", "Facts kept apart from estimates and inference", "No invented filings, news or FinLit scores",
             "Uncertainty said plainly when data is missing", "FinLit Prism explained the same way every time"]


def sector_key(text: Optional[str]) -> Optional[str]:
    """The sector family a sector, industry or company kind belongs to ("Private Sector Bank" -> banks), or None."""
    t = (text or "").lower()
    for k, s in SECTORS.items():
        if re.search(s["match"], t):
            return k
    return None


def framework(topic: Optional[str] = None, sector: Optional[str] = None) -> Dict[str, Any]:
    """What the tool returns: the measures for a topic or a sector, how they are read, the answer patterns, the source order and the checklist."""
    out: Dict[str, Any] = {}
    if sector:
        k = sector_key(sector)
        if k:
            out["sector"] = {"family": SECTORS[k]["title"], "measures": SECTORS[k]["measures"], **({"note": SECTORS[k]["note"]} if SECTORS[k].get("note") else {})}
        else:
            out["sector"] = {"family": None, "note": "No sector-specific list for this sector: use the general families (profitability, "
                                                     "liquidity and leverage, efficiency, growth, valuation, cash flow)."}
    if topic:
        t = TOPICS.get(topic)
        out["topic"] = t if t else {"note": f"Unknown topic. Topics: {', '.join(TOPICS)}"}
    if not topic and not sector:
        out["topics"] = {k: v["title"] for k, v in TOPICS.items()}
        out["sectors"] = {k: v["title"] for k, v in SECTORS.items()}
    out["answerPatterns"] = [{"question": q, "how": a} for q, a in PATTERNS]
    out["sources"] = SOURCES
    from .routing import ROUTES              # task #253: the team's directory, by kind of question (imported here: routing imports this module)
    out["sourcesByType"] = {k: {"finlitFirst": r["finlit"], "web": [site_name(d) for d in r["sites"]]} for k, r in ROUTES.items()}
    out["checklist"] = CHECKLIST
    return out


SYSTEM_RULES = """How to answer finance questions (the team's finance reference, 19 Nov 2026)
- For what a measure means, or which measures matter for a sector, use get_finance_framework (and lookup_glossary for FinLit's own wording); then read the company's figures with FinLit's tools.
- Use the sector's own measures: banks (NIM, CASA, GNPA/NNPA, PCR, CRAR, credit cost), NBFCs (AUM growth, asset quality, capital adequacy, cost of funds), insurers (VNB, embedded value, solvency, combined ratio), IT (constant-currency growth, margins, attrition, deal wins), and so on. For banks, debt/equity and EBITDA are not meaningful.
- Never judge a valuation ratio alone: a P/E, P/B or EV/EBITDA is read against growth, quality, peers and the company's own history.
- Never mix standalone and consolidated figures; say which one each figure is. Give the source and the period of each figure.
- Keep facts apart from estimates and your own reasoning ("the filing shows ...", "this suggests ..."). Never invent a filing, a news item or a FinLit score; say plainly when data is missing.
- Web sources, in this order: primary (NSE, BSE, SEBI, RBI, MOSPI, AMFI, Nifty Indices, the company's own reports), then secondary sites (Moneycontrol, Screener, Trendlyne and others), checked against filings for important figures.
- By kind of question (the team's source directory): the economy from FinLit's India economy page, then RBI, MOSPI, the Department of Economic Affairs, IMF, World Bank, FRED, OECD and BIS; a company's financials from FinLit's company page, then Moneycontrol, Screener, Tickertape, Trendlyne, NSE and BSE; daily news from FinLit's News & filings, then Moneycontrol, Mint, Economic Times, Business Standard, Reuters and CNBC; terms from FinLit's glossary, then Investopedia, CFI, CFA Institute, Khan Academy and NISM; valuation methods from Damodaran, Morningstar, Multpl, GuruFocus and SSRN; rules from SEBI and RBI; mutual funds from FinLit's fund pages, then AMFI; a sector from its own body (IRDAI, CDSCO, US FDA, CEA, IEA, Indian Bureau of Mines, USGS, RERA, NHB, SIAM, ACMA, NASSCOM, NABARD)."""
