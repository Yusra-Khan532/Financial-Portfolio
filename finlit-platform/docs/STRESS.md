# Stress Lab on the site (task 79)

Engine: `backend/finlit_technicals/stress.py` (v2.1.1, vendored; the 2.1.1 patch makes a level that sets any raw-material share set the whole mix, so Reliance, IOC, Titan, MRF and 15 more build). API: `backend/finlit/stress/` (`page.py` payload and plan rules, `service.py` inputs, `router.py` routes). Tests: `tests/test_stress_api.py`, `tests/test_stress_exposure_groups.py` (all 471 launch companies get valid settings; `tests/stress_launch/launch-universe-2026-11-09.csv`).

| Route | Plan | |
| --- | --- | --- |
| `GET /api/stress/{SYM}/page` | Silver, Gold | the page payload. Silver gets Today, Crude eases, 2022 and 2020 only, plus the names of the locked ones (`locked_scenarios`) |
| `POST /api/stress/{SYM}/run` | Gold | one scenario on the server (preset and/or sliders, clipped to the spec ranges; `settings` = the six "your value" boxes) |
| `POST /api/stress/compare` | Gold | two companies, one shock |
| `GET /api/stress/{SYM}/peer` | Gold | `default_peer()`: the first covered peer with results to the same quarter |

* **Covered:** large and mid caps (market cap 10,000 Cr or more) that are not banks, NBFCs or insurers (the screener table decides, `service.covered_by_rule`), with three years of results. Others get a 404 `not_covered` whose message the page shows as it is. Rebuild `launch-universe-*.csv` on launch day.
* **Inputs** are what the site already holds: the stored report sections (summary, financials, peers), the premium statements kept in Redis, the macro table (CPI, WPI, GDP, repo, USD/INR, Brent) and `price_history_long` weekly closes. Nothing new is called except one macro step: `eia_steo` (nightly, needs `EIA_API_KEY`) stores the EIA outlook for the next four quarters; without it the "Crude eases" scenario is not offered.
* **The value move** is a percentage and never a price. `STRESS_SHOW_VALUE=0` removes it from every answer (`flags.showValue` tells the page).
* **Still to do before launch** (START-HERE): fill the exposure table (50 company rows, the 84 industries without a row), the back-test job (`backtest.latest_quarter`, inventory days), the FinEdge answer, the adviser's view on the value move.
