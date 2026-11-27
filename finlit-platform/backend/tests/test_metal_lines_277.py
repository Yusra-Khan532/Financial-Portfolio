"""Task #277 (All my investments pack of 20 Nov, live number fix 2): Nippon India Silver ETF files its silver as one line, "Nippon India Silver ETF"
(ISIN INF204KC1402, 100%), under a cash-like heading, so the parser counted the whole ETF as cash: All my investments' Step 2 showed Gold and silver 8.2%
and Debt and cash 10.3% (about 16.5% and 2% are right), and the ETF page put silver in "debt or overnight lending". A line of gold or silver held as the
metal (no Indian equity ISIN) is metal wherever it is filed; a gold-loan bond (an INE ISIN) keeps its class."""
from finlit.disclosure_parsers.sebi import parse_rows
from finlit.etfportfolio.calc import asset_mix
from finlit.myinvest.calc import item_mix, line_bucket

HEAD = [None, None, "Name of the Instrument / Issuer", "ISIN", "Rating / Industry^", "Quantity", "Market value\n(Rs. in Lakhs)", "% to AUM"]


def _sheet(*body):
    return [[None, None, "Nippon India Mutual Fund"], [None, None, "SCHEME NAME :", "Nippon India Silver ETF"], [None, None, "PORTFOLIO STATEMENT AS ON :", 46326.0],
            HEAD, *body, [None, None, "GRAND TOTAL", None, None, None, 363310.28, 100.0]]


def test_the_parser_files_a_silver_line_under_a_cash_heading_as_metal():
    p = parse_rows(iter(_sheet([None, None, "Cash and Other Receivables"], [None, None, "Triparty Repo", None, None, None, 839.17, 0.23],
                               [None, None, "Nippon India Silver ETF", "INF204KC1402", None, 209595115.0, 362471.1, 99.77])), "Nippon India Mutual Fund", "https://example/x.xls")
    by = {h.name: h.asset_class for h in p.holdings}
    assert by == {"Triparty Repo": "cash", "Nippon India Silver ETF": "other"}


def test_a_gold_loan_bond_keeps_its_debt_class():
    p = parse_rows(iter(_sheet([None, None, "Debt Instruments"], [None, None, "Muthoot Finance Ltd (Gold Loan NCD)", "INE414G07HI3", "CRISIL AA+", 1000.0, 1000.0, 99.0],
                               [None, None, "Triparty Repo", None, None, None, 10.0, 1.0])), "X Mutual Fund", "https://example/x.xls")
    assert {h.name: h.asset_class for h in p.holdings}["Muthoot Finance Ltd (Gold Loan NCD)"] == "debt"


def test_step2_counts_the_silver_line_as_gold_and_silver_even_where_it_was_stored_as_cash():
    stored = [{"name": "Triparty Repo", "isin": None, "assetClass": "cash", "pct": 0.23}, {"name": "Nippon India Silver ETF", "isin": "INF204KC1402", "assetClass": "cash", "pct": 100.0},
              {"name": "Net Current Assets", "isin": None, "assetClass": "cash", "pct": -0.23}]
    m, how = item_mix({"holdings": stored, "assetClass": "silver", "kind": "etfs"})
    assert how == "file" and round(m["gold"], 3) == 0.998 and round(m["debt"], 3) == 0.002
    assert line_bucket({"name": "GOLD 995 1KG BAR", "isin": None, "assetClass": "other"}, "gold") == "gold"
    assert line_bucket({"name": "Muthoot Gold Loan NCD", "isin": "INE414G07HI3", "assetClass": "debt"}, None) == "debt"


def test_the_etf_mix_counts_a_metal_etf_read_as_cash_wholly_as_its_metal():
    etfs = [{"symbol": "SILVERBEES", "w": 0.25, "assetClass": "silver", "split": {"equity": 0, "debt": 0, "cash": 100, "other": 0}},
            {"symbol": "GOLDBEES", "w": 0.25, "assetClass": "gold", "split": {"equity": 0, "debt": 0, "cash": 1.75, "other": 98.25}},
            {"symbol": "NIFTYBEES", "w": 0.5, "assetClass": "equity", "split": {"equity": 99.5, "debt": 0, "cash": 0.5, "other": 0}}]
    s = asset_mix(etfs)["shares"]
    assert round(s["silver"], 4) == 0.25 and round(s["gold"], 4) == round(0.25 * 0.9825, 4) and round(s["debt"], 4) == round(0.25 * 0.0175 + 0.5 * 0.005, 4)
