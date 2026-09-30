"""Standalone, read-only FinEdge API access probe.

This file is intentionally independent of the FinLit application. It uses only
the Python standard library and reads FINEDGE_API_KEY from the environment.
The key is sent as the documented ``token`` query parameter, but is never
printed or included in the displayed endpoint URL.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date, timedelta
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


BASE_URL = "https://data.finedgeapi.com"
SYMBOL = "RELIANCE"
TIMEOUT_SECONDS = 30


def endpoint(path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Describe one documented request without ever putting the API key here."""
    return {"path": path, "params": params or {}}


def request_plan() -> list[dict[str, Any]]:
    today = date.today()
    recent_7 = (today - timedelta(days=6)).isoformat()
    recent_30 = (today - timedelta(days=29)).isoformat()
    tomorrow = (today + timedelta(days=1)).isoformat()
    return [
        # Simplest authenticated request and symbol discovery.
        {"name": "Stock symbols", "category": "authentication / reference", **endpoint("/api/v1/stock-symbols")},
        {"name": "Company profile", "category": "company/profile", **endpoint(f"/api/v1/company-profile/{SYMBOL}")},
        {"name": "Company peers", "category": "company/other fundamental", **endpoint(f"/api/v1/peers/{SYMBOL}", {"group": "sector"})},
        # Financial statements: each statement type is tested separately.
        {"name": "P&L annual", "category": "financial statements", **endpoint(f"/api/v1/financials/{SYMBOL}", {"statement_type": "s", "statement_code": "pl", "period": "annual"})},
        {"name": "Balance sheet annual", "category": "financial statements", **endpoint(f"/api/v1/financials/{SYMBOL}", {"statement_type": "s", "statement_code": "bs", "period": "annual"})},
        {"name": "Cash flow annual", "category": "financial statements", **endpoint(f"/api/v1/financials/{SYMBOL}", {"statement_type": "s", "statement_code": "cf", "period": "annual"})},
        {"name": "P&L quarterly", "category": "historical financials", **endpoint(f"/api/v1/financials/{SYMBOL}", {"statement_type": "s", "statement_code": "pl", "period": "quarterly"})},
        {"name": "Revenue by segment", "category": "financial statements / other", **endpoint(f"/api/v1/segment-revenue/{SYMBOL}", {"statement_type": "s", "statement_code": "pl", "period": "annual"})},
        {"name": "Financial statement notes", "category": "financial statements / other", **endpoint(f"/api/v1/notes/{SYMBOL}", {"statement_type": "s", "period": "annual"})},
        # Ratio and metrics families cover PE, ROE, ROCE, debt/equity, EPS,
        # growth and other fields if the plan exposes them.
        {"name": "Profitability ratios", "category": "financial ratios", **endpoint(f"/api/v1/ratios/{SYMBOL}", {"statement_type": "s", "ratio_type": "pr"})},
        {"name": "Leverage ratios", "category": "financial ratios", **endpoint(f"/api/v1/ratios/{SYMBOL}", {"statement_type": "s", "ratio_type": "le"})},
        {"name": "Efficiency ratios", "category": "financial ratios", **endpoint(f"/api/v1/ratios/{SYMBOL}", {"statement_type": "s", "ratio_type": "ef"})},
        {"name": "Liquidity ratios", "category": "financial ratios", **endpoint(f"/api/v1/ratios/{SYMBOL}", {"statement_type": "s", "ratio_type": "li"})},
        {"name": "Growth metrics", "category": "growth / financial metrics", **endpoint(f"/api/v1/financial-metrics/{SYMBOL}", {"statement_type": "s", "ratio_type": "gr"})},
        {"name": "Basic financials", "category": "financial metrics", **endpoint(f"/api/v1/basic-financials/{SYMBOL}", {"statement_type": "s", "statement_code": "pl"})},
        # Market prices and price valuation.
        {"name": "Daily quote", "category": "stock prices", **endpoint("/api/v1/quote", {"symbol": SYMBOL})},
        {"name": "Historical adjusted prices", "category": "historical stock prices", **endpoint(f"/api/v1/daily-quotes/{SYMBOL}", {"from": str(today.year - 1), "to": str(today.year)})},
        {"name": "Daily price ratios", "category": "PE / price ratios", **endpoint(f"/api/v1/daily-price-ratios/{SYMBOL}", {"statement_type": "s", "from": str(today.year - 1), "to": str(today.year)})},
        {"name": "Annual price ratios", "category": "PE / price ratios", **endpoint(f"/api/v1/annual-price-ratios/{SYMBOL}", {"statement_type": "s"})},
        # Ownership and corporate actions.
        {"name": "Shareholding pattern", "category": "shareholding", **endpoint(f"/api/v1/shareholdings/pattern/{SYMBOL}", {"period": "quarterly"})},
        {"name": "Current shareholder ownership", "category": "shareholding", **endpoint(f"/api/v1/shareholdings/ownership-current/{SYMBOL}")},
        {"name": "Corporate actions", "category": "corporate actions", **endpoint("/api/v1/corporate-actions/all", {"symbol": SYMBOL, "from_date": recent_30, "to_date": tomorrow})},
        {"name": "Dividends", "category": "corporate actions", **endpoint(f"/api/v1/dividend/{SYMBOL}")},
        {"name": "Corporate announcements", "category": "company disclosures", **endpoint("/api/v1/corp-announcements", {"symbol": SYMBOL, "from_date": recent_7, "to_date": today.isoformat()})},
    ]


def classify_failure(status: int | None, body: Any) -> str:
    if status == 401:
        return "authentication (invalid or missing API key)"
    if status == 402:
        return "request failed after valid parameters (often plan/subscription or request failure)"
    if status == 403:
        return "subscription/permission (API key is not allowed to use this endpoint)"
    if status == 404:
        return "endpoint or resource not found"
    if status == 429:
        return "rate limit"
    if status == 400:
        return "parameter/request validation"
    if status is not None and status >= 500:
        return "FinEdge server error"
    return f"request/network error: {body}"


def parse_body(raw: bytes) -> Any:
    text = raw.decode("utf-8", errors="replace")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def field_names(value: Any) -> list[str]:
    if isinstance(value, dict):
        return sorted(value.keys())
    if isinstance(value, list) and value and isinstance(value[0], dict):
        keys: set[str] = set()
        for item in value:
            keys.update(item.keys())
        return sorted(keys)
    return []


def run_one(api_key: str, item: dict[str, Any]) -> None:
    path = item["path"]
    params = dict(item["params"])
    params["token"] = api_key
    url = f"{BASE_URL}{path}"
    if params:
        url += "?" + urlencode(params, doseq=True)
    display_endpoint = f"{BASE_URL}{path}"
    if item["params"]:
        display_endpoint += "?" + urlencode(item["params"], doseq=True)

    print(f"\n{'=' * 88}\n{item['name']} [{item['category']}]\nEndpoint: GET {display_endpoint}")
    try:
        request = Request(url, headers={"Accept": "application/json", "User-Agent": "FinEdge-local-access-probe/1.0"})
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            status = response.status
            body = parse_body(response.read())
        print(f"HTTP status: {status} (SUCCESS)")
        print(f"Returned fields: {field_names(body) or '(non-object response; inspect JSON below)'}")
        print("Formatted JSON response:")
        print(json.dumps(body, indent=2, ensure_ascii=False, default=str))
    except HTTPError as error:
        body = parse_body(error.read())
        print(f"HTTP status: {error.code} (FAILED)")
        print(f"Failure category: {classify_failure(error.code, body)}")
        print("Error response:")
        print(json.dumps(body, indent=2, ensure_ascii=False, default=str))
    except (URLError, TimeoutError, OSError) as error:
        print("HTTP status: unavailable (FAILED)")
        print(f"Failure category: {classify_failure(None, error)}")
        print(f"Error: {error}")


def inspect_quarterly_history(api_key: str) -> int:
    """Print only the requested quarterly P&L history summary."""
    path = f"/api/v1/financials/{SYMBOL}"
    params = {
        "statement_type": "s",
        "statement_code": "pl",
        "period": "quarterly",
        "token": api_key,
    }
    display_endpoint = f"{BASE_URL}{path}?statement_type=s&statement_code=pl&period=quarterly"
    try:
        with urlopen(Request(f"{BASE_URL}{path}?{urlencode(params)}", headers={"Accept": "application/json"}), timeout=TIMEOUT_SECONDS) as response:
            status = response.status
            body = parse_body(response.read())
    except HTTPError as error:
        body = parse_body(error.read())
        print(f"Request failed: HTTP {error.code} ({classify_failure(error.code, body)})")
        return 1
    except (URLError, TimeoutError, OSError) as error:
        print(f"Request failed: {classify_failure(None, error)}")
        return 1

    if status < 200 or status >= 300:
        print(f"Request failed: HTTP {status} ({classify_failure(status, body)})")
        return 1
    if not isinstance(body, dict) or not isinstance(body.get("financials"), list):
        print("Request succeeded, but the response did not contain a financials array.")
        return 1

    records = [record for record in body["financials"] if isinstance(record, dict)]
    records.sort(key=lambda record: str(record.get("period_start", "")))
    if not records:
        print("Quarterly records: 0")
        print("Oldest quarter: unavailable")
        print("Latest quarter: unavailable")
        print("Approximate history: 0 years")
        print("More historical data available through pagination/date parameters: Unknown")
        return 0

    oldest = records[0]
    latest = records[-1]
    start = str(oldest.get("period_start", ""))
    end = str(latest.get("period_end", ""))
    try:
        years = (date.fromisoformat(end) - date.fromisoformat(start)).days / 365.25
    except ValueError:
        years = max(0.0, (len(records) - 1) / 4)

    print(f"Endpoint: GET {display_endpoint}")
    print(f"Quarterly records: {len(records)}")
    print(f"Latest quarter: {latest.get('period_start', 'unknown')} → {latest.get('period_end', 'unknown')}")
    print(f"Oldest quarter: {oldest.get('period_start', 'unknown')} → {oldest.get('period_end', 'unknown')}")
    print("Quarters in chronological order:")
    for record in records:
        print(f"{record.get('period_start', 'unknown')} → {record.get('period_end', 'unknown')}")
    print(f"Approximate history: {years:.2f} years")
    # The official financials documentation lists only statement_type,
    # statement_code, and period for this route; it documents no pagination
    # or date-range query parameters.
    print("More historical data available through pagination/date parameters: Unknown")
    return 0


def main() -> int:
    api_key = os.environ.get("FINEDGE_API_KEY")
    if not api_key:
        print("FINEDGE_API_KEY is not set. Set it in the environment and rerun this script.", file=sys.stderr)
        return 2

    if "--quarterly-history" in sys.argv[1:]:
        return inspect_quarterly_history(api_key)

    print(f"FinEdge API local access probe | base URL: {BASE_URL} | symbol: {SYMBOL}")
    print("Authentication: documented query parameter token (API key value is intentionally hidden).")
    print(f"Requests planned: {len(request_plan())}")
    for item in request_plan():
        run_one(api_key, item)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
