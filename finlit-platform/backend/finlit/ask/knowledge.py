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
        "read": "Technical readings describe past prices and trading; they do not predict the next move. FinLit's own technical view is in Prism."},
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
             "Uncertainty said plainly when data is missing", "FinLit IQ and Prism explained the same way every time"]


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
    out["checklist"] = CHECKLIST
    return out


SYSTEM_RULES = """How to answer finance questions (the team's finance reference, 19 Nov 2026)
- For what a measure means, or which measures matter for a sector, use get_finance_framework (and lookup_glossary for FinLit's own wording); then read the company's figures with FinLit's tools.
- Use the sector's own measures: banks (NIM, CASA, GNPA/NNPA, PCR, CRAR, credit cost), NBFCs (AUM growth, asset quality, capital adequacy, cost of funds), insurers (VNB, embedded value, solvency, combined ratio), IT (constant-currency growth, margins, attrition, deal wins), and so on. For banks, debt/equity and EBITDA are not meaningful.
- Never judge a valuation ratio alone: a P/E, P/B or EV/EBITDA is read against growth, quality, peers and the company's own history.
- Never mix standalone and consolidated figures; say which one each figure is. Give the source and the period of each figure.
- Keep facts apart from estimates and your own reasoning ("the filing shows ...", "this suggests ..."). Never invent a filing, a news item or a FinLit score; say plainly when data is missing.
- Web sources, in this order: primary (NSE, BSE, SEBI, RBI, MOSPI, AMFI, Nifty Indices, the company's own reports), then secondary sites (Moneycontrol, Screener, Trendlyne and others), checked against filings for important figures."""
