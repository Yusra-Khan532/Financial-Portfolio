"""Reader-facing commentary from an existing rating; never fetch or rescore inputs."""
PARTS = ("fundamental", "valuation", "quality", "risk")
REASONS = {
    "SALES_STREAK": ("Consistent year-on-year revenue growth.", "Revenue growth has been inconsistent."),
    "PROFIT_STREAK": ("Consistent year-on-year profit growth.", "Profit growth has been inconsistent."),
    "SALES_GROWTH": ("Strong recent revenue growth.", "Recent revenue growth is weak."),
    "PROFIT_GROWTH": ("Strong recent profit growth.", "Recent profit growth is weak."),
    "SALES_CAGR": ("Strong revenue growth over the longer term.", "Longer-term revenue growth is weak."),
    "PROFIT_CAGR": ("Strong profit growth over the longer term.", "Longer-term profit growth is weak."),
    "MARGIN_CHANGE": ("Operating margins have improved.", "Operating margin performance is weak."),
    "LOAN_GROWTH": ("Strong expansion in the loan book.", "Loan-book growth is weak."),
    "NETWORTH_GROWTH": ("Strong growth in net worth.", "Net-worth growth is weak."),
    "DEBT_TO_EQUITY": ("Low borrowing relative to equity.", "High borrowing relative to equity."),
    "INTEREST_COVER": ("Earnings provide a strong cushion for interest payments.", "Earnings provide a limited cushion for interest payments."),
    "ROE": ("Strong returns on shareholder equity.", "Low returns on shareholder equity."),
    "CASH_CONVERSION": ("Profits are well supported by operating cash flow.", "Operating cash flow provides weak support for reported profits."),
    "GROSS_NPA": ("Low gross non-performing loans support asset quality.", "High gross non-performing loans weaken asset quality."),
    "NET_NPA": ("Low net non-performing loans support asset quality.", "High net non-performing loans weaken asset quality."),
    "CAPITAL_ADEQUACY": ("A strong capital buffer supports the balance sheet.", "The capital buffer is limited."),
    "ROA": ("Strong profit generation relative to assets.", "Low profit generation relative to assets."),
    "SOLVENCY": ("A strong solvency buffer supports financial resilience.", "The solvency buffer is limited."),
    "PEG": ("The earnings multiple is favourable relative to profit growth.", "The earnings multiple is unfavourable relative to profit growth."),
    "VOLATILITY": ("Relatively low share-price volatility.", "High share-price volatility increases market risk."),
    "BIGGEST_FALL": ("The largest one-year share-price decline was relatively limited.", "The share price experienced a large one-year decline."),
    "TRADING_VALUE": ("Higher trading activity supports liquidity.", "Low trading activity can make entry and exit harder."),
    "PLEDGE": ("Low promoter pledging limits pledge-related risk.", "High promoter pledging increases pledge-related risk."),
}
MIXED = {
    "SALES_STREAK": "Revenue growth is uneven across comparable quarters.",
    "PROFIT_STREAK": "Profit growth is uneven across comparable quarters.",
    "SALES_GROWTH": "Recent revenue growth is moderate.", "PROFIT_GROWTH": "Recent profit growth is moderate.",
    "SALES_CAGR": "Longer-term revenue growth is moderate.", "PROFIT_CAGR": "Longer-term profit growth is moderate.",
    "MARGIN_CHANGE": "Margin performance provides limited support.", "LOAN_GROWTH": "Loan-book growth is moderate.",
    "NETWORTH_GROWTH": "Net-worth growth is moderate.", "DEBT_TO_EQUITY": "Borrowing is at an intermediate level relative to equity.",
    "INTEREST_COVER": "Earnings provide a moderate cushion for interest payments.",
    "ROE": "Returns on equity are moderate.", "ROA": "Returns on assets are moderate.",
    "CASH_CONVERSION": "Operating cash flow provides moderate support for profits.",
    "GROSS_NPA": "Gross non-performing loans warrant monitoring.", "NET_NPA": "Net non-performing loans warrant monitoring.",
    "CAPITAL_ADEQUACY": "The capital buffer is in the middle assessment range.", "SOLVENCY": "The solvency buffer is in the middle assessment range.",
    "PEG": "The earnings multiple offers limited support relative to profit growth.",
    "VOLATILITY": "Share-price volatility warrants monitoring.", "BIGGEST_FALL": "The one-year price decline warrants monitoring.",
    "TRADING_VALUE": "Trading activity provides moderate liquidity.", "PLEDGE": "Some promoter holdings are pledged; monitor pledge levels.",
}
LABELS = {"SALES_STREAK": "Revenue growth consistency", "PROFIT_STREAK": "Profit growth consistency",
          "SALES_GROWTH": "Revenue growth (12 months)", "SALES_CAGR": "Revenue CAGR",
          "TRADING_VALUE": "Average daily trading value"}


def value_text(row):
    value = row.get("value")
    if value is None:
        return "Not available"
    unit = row.get("unit", "")
    if unit == "quarters": return f"{value:g} growth quarters"
    if unit == "Cr": return f"INR {value:,.2f} crore"
    return f"{value:,.2f}{unit if unit in ('%', 'x') else ' ' + unit}".strip()


def factor(row, group):
    metric, state = row["metric"], row["status"]
    label = LABELS.get(metric, row["label"])
    if group in ("BANK", "NBFC") and metric.startswith("SALES"):
        label = label.replace("Revenue", "Net interest income")
    elif group == "INSURANCE" and metric.startswith("SALES"):
        label = label.replace("Revenue", "Net premium income")
    item = {"metric": metric, "label": label, "valueText": value_text(row)}
    if state == "N":
        return "notApplicable", dict(item, summary="Not applicable to this assessment.")
    if state in ("F", "L") or row.get("points") is None:
        summary = "Not reported; an estimate is used in the assessment." if state == "F" else "Not reported; not assessed."
        return "unavailable", dict(item, valueText="Not available", summary=summary)
    points = row["points"]
    bucket = "pros" if points >= 70 else "cons" if points < 40 else "mixed"
    if "_VS_" in metric:
        multiple = "P/E" if metric.startswith("PE_") else "P/B" if metric.startswith("PB_") else "EV/EBITDA"
        comparison = "industry peers" if metric.endswith("INDUSTRY") or state == "S" else "the company's own history"
        if state == "S": label = f"{multiple} vs industry (history unavailable)"
        reason = f"{multiple} is relatively {'low' if bucket == 'pros' else 'high'} against {comparison}." if bucket != "mixed" else f"{multiple} is in the middle assessment range against {comparison}."
    elif bucket == "mixed":
        reason = MIXED.get(metric, "In the middle assessment range.")
    else:
        reason = REASONS.get(metric, ("Supports the assessment.", "Holds back the assessment."))[bucket == "cons"]
    if row.get("value") is None:
        note = row.get("details", {}).get("note")
        if note in ("Loss to profit", "Loss narrowed", "Loss not narrowed"):
            reason = {"Loss to profit": "The business returned to profit.", "Loss narrowed": "Losses narrowed, but the business remains loss-making.", "Loss not narrowed": "Losses have not narrowed."}[note]
        elif metric == "INTEREST_COVER" and points == 100:
            reason = "No interest expense is reported for the year."
        elif metric == "CASH_CONVERSION" and note and note.startswith("Three-year loss"):
            reason = "Operating cash flow is positive despite a three-year loss." if note.endswith("positive") and not note.endswith("non-positive") else "Both three-year profits and operating cash flow are non-positive."
        else:
            reason = "Losses or a non-positive comparison prevent a meaningful ratio."
        item["valueText"] = "Not meaningful"
    if metric == "PLEDGE" and row.get("value") == 0:
        reason = "No promoter shares are reported as pledged."
    if metric.endswith("STREAK"):
        info = row.get("details", {})
        reason += f" {info.get('good', 0)} growth quarters across {info.get('judged', 0)} comparable quarters."
    if state == "S":
        reason += " Industry data is used because company history is unavailable."
    if group in ("BANK", "NBFC") and metric.startswith("SALES"):
        reason = reason.replace("revenue", "net interest income").replace("Revenue", "Net interest income")
    elif group == "INSURANCE" and metric.startswith("SALES"):
        reason = reason.replace("revenue", "net premium income").replace("Revenue", "Net premium income")
    if row.get("fallbackFor") == "PE_VS_INDUSTRY":
        reason += " Company history is used because the industry P/E benchmark is unavailable."
    if row.get("fallbackFor") == "CAPITAL_ADEQUACY":
        label = "Interest coverage (capital adequacy unavailable)"
        reason += " Used in place of unavailable capital adequacy."
    return bucket, dict(item, label=label, summary=reason)


def build_report_review(report):
    rating = report["rating"]
    parts = []
    for key in PARTS:
        part = {"key": key, "name": key.title(), "score": rating["parts"].get(key) if rating["status"] != "NOT RATED" else None,
                **{bucket: [] for bucket in ("pros", "cons", "mixed", "unavailable", "notApplicable")}}
        for row in rating["metrics"]:
            if row["part"] == key:
                bucket, item = factor(row, rating["group"])
                part[bucket].append(item)
        parts.append(part)
    notes = []
    if any(row.get("fallbackFor") == "CAPITAL_ADEQUACY" for row in rating["metrics"]):
        notes.append("Capital adequacy is unavailable; the Quality assessment uses interest coverage instead.")
    missing = [r["label"] for p in parts for r in p["unavailable"]]
    if missing: notes.append("Unavailable information: " + ", ".join(missing) + ". Estimates are not presented as company strengths or weaknesses.")
    for warning in report.get("warnings", []):
        if "bank asset-quality disclosures use" in warning:
            notes.append("Asset-quality ratios use the bank's separately reported statement basis; other financial results use the basis stated on this report.")
        elif "non-controlling interests" in warning:
            notes.append("Book equity includes non-controlling interests; provider valuation benchmarks may use a different equity basis.")
        elif "quote share count conflicts" in warning:
            notes.append("Share-count differences may affect valuation comparisons.")
    inputs = report.get("inputs", {})
    # Preserve substantive data concerns in plain language; omit provider plumbing.
    for message in inputs.get("rating_blockers", []) + inputs.get("rating_cautions", []):
        if "classification" in message: notes.append("The company's industry classification needs confirmation; the overall rating is withheld.")
        elif "Quarterly" in message: notes.append("Quarterly results are incomplete or more than 200 days old.")
        elif "freshness" in message: notes.append("The market price is more than 10 days old.")
        elif "date is unverified" in message: notes.append("The market-price date could not be confirmed.")
        elif "Share-count" in message: notes.append("The reported share count needs review following possible corporate actions.")
        elif "ratio" in message: notes.append("Calculated valuation ratios differ from the data provider's ratios; use caution when comparing valuations.")
        elif "closing prices" in message: notes.append("Gaps in the price history limit the market-risk assessment.")
        else: notes.append("Some financial information could not be fully verified; treat the assessment with caution.")
    meta = report.get("inputMeta", {})
    requested = meta.get("requestedStatementType")
    if requested and requested != report["statementType"]:
        notes.append(f"{requested.title()} statements were unavailable; this report uses {report['statementType']} statements.")
    if rating["status"] == "PROVISIONAL": notes.append("This assessment is provisional because the available financial history or data coverage is limited.")
    if rating["status"] == "NOT RATED": notes.append("There is insufficient verified information to provide an overall rating.")
    if rating.get("valuationCapped"): notes.append("Weak business fundamentals or financial quality limit the valuation assessment.")
    return {"parts": parts, "notes": list(dict.fromkeys(notes))}
