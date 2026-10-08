import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "financial_portfolio_test")

from server import (  # noqa: E402
    _derive_bank_roce,
    _derive_income_metrics,
    _merge_category_history,
    _ratio_lookup,
    _reconcile_valuation_ratios,
    _ttm_net_profit_from_statement,
)


def _row(category, values):
    return {
        "category": category,
        "label": category.replace("_", " ").title(),
        "history": [
            {"period": period, "value": value, "change": None}
            for period, value in values
        ],
    }


def test_bank_annual_depreciation_backfill_reconciles_financing_profit():
    rows = [
        _row("revenue", [("Mar 2026", 348615.15)]),
        _row("interest", [("Mar 2026", 185491.23)]),
        _row("expenses", [("Mar 2026", 207830.13)]),
        _row("profit_before_tax", [("Mar 2026", 102141.45)]),
        _row("other_income", [("Mar 2026", 146847.66)]),
        _row("provisions_for_loan_loss", [("Mar 2026", 1)]),
    ]
    rows = _merge_category_history(rows, "depreciation", [{"period": "Mar 2026", "value": 4194.9, "change": None}])

    derived = _derive_income_metrics(rows)
    expenses = next(row for row in derived if row["category"] == "expenses")["history"][0]["value"]
    financing_profit = next(row for row in derived if row["category"] == "financing_profit")["history"][0]["value"]

    assert round(expenses, 2) == 203635.23
    assert round(financing_profit, 2) == -40511.31


def test_daily_finedge_pe_is_preferred_over_market_cap_derived_pe():
    ratios = _reconcile_valuation_ratios(
        [{"name": "P/E", "company_value": 15.94, "sector_value": None}],
        {"marketCap": 1262369.85},
        {"income_statement": [_row("net_profit", [("Mar 2026", 79219.46)])]},
        price_ratio_snapshot={"pe": 13.71},
    )

    pe = _ratio_lookup(ratios)["P/E"]
    assert pe["company_value"] == 13.71
    assert pe["source"] == "finedge_daily_price_ratios"


def test_negative_pe_uses_ttm_profit_when_available():
    ratios = _reconcile_valuation_ratios(
        [{"name": "P/E", "company_value": -26.4, "sector_value": None}],
        {"marketCap": 8515.55},
        {"income_statement": [_row("net_profit", [("Mar 2026", -336.89)])]},
        ttm_net_profit=3.72,
    )

    pe = _ratio_lookup(ratios)["P/E"]
    assert round(pe["company_value"], 2) == 2289.13
    assert pe["source"] == "derived_ttm_net_profit"


def test_negative_pe_is_hidden_when_ttm_profit_is_not_positive():
    ratios = _reconcile_valuation_ratios(
        [{"name": "P/E", "company_value": -26.4, "sector_value": None}],
        {"marketCap": 8515.55},
        {"income_statement": [_row("net_profit", [("Mar 2026", -336.89)])]},
        ttm_net_profit=None,
    )

    pe = _ratio_lookup(ratios)["P/E"]
    assert pe["company_value"] is None
    assert pe["source"] == "unavailable_negative_earnings"


def test_ttm_net_profit_uses_latest_four_quarters():
    income_statement = {
        "income_statement": [
            _row("net_profit", [
                ("Jun 2026", 64.71),
                ("Mar 2026", -494.0),
                ("Dec 2025", 25.11),
                ("Sep 2025", 407.9),
                ("Jun 2025", 5.0),
            ])
        ]
    }

    assert round(_ttm_net_profit_from_statement(income_statement), 2) == 3.72


def test_bank_roce_uses_finedge_capital_employed_convention():
    income_statement = {
        "income_statement": [
            _row("profit_before_tax", [("Mar 2026", 102141.45)]),
            _row("interest", [("Mar 2026", 185491.23)]),
        ]
    }
    balance_sheet = {
        "balance_sheet": [
            _row("deposits", [("Mar 2026", 3099638.29), ("Mar 2025", 2710898.23)]),
            _row("borrowings", [("Mar 2026", 588484.55), ("Mar 2025", 634605.57)]),
            _row("capital", [("Mar 2026", 1539.34), ("Mar 2025", 765.22)]),
            _row("reserves", [("Mar 2026", 579975.02), ("Mar 2025", 517218.98)]),
        ]
    }

    assert round(_derive_bank_roce(income_statement, balance_sheet), 2) == 7.07


def test_missing_roce_is_derived_for_banks_from_finedge_rows():
    ratios = _reconcile_valuation_ratios(
        [],
        {},
        {
            "income_statement": [
                _row("profit_before_tax", [("Mar 2026", 102141.45)]),
                _row("interest", [("Mar 2026", 185491.23)]),
            ]
        },
        {
            "balance_sheet": [
                _row("deposits", [("Mar 2026", 3099638.29), ("Mar 2025", 2710898.23)]),
                _row("borrowings", [("Mar 2026", 588484.55), ("Mar 2025", 634605.57)]),
                _row("capital", [("Mar 2026", 1539.34), ("Mar 2025", 765.22)]),
                _row("reserves", [("Mar 2026", 579975.02), ("Mar 2025", 517218.98)]),
            ]
        },
    )

    roce = _ratio_lookup(ratios)["ROCE"]
    assert roce["company_value"] == 7.07
    assert roce["source"] == "derived_bank_capital_employed"
