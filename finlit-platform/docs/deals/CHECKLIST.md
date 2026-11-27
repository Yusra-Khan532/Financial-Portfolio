# Bulk & Block Deals: the checklist (Step 0 of docs/TASK-PROMPT.md)

Source: the build prompt "Bulk & Block Deals (under the IPO section)", sent in the chat by Pranjal Jain on 27 Nov 2026. Each line is the brief's own words;
a sentence asking for two things is split. Status and evidence are filled in as each point is proven (see the pull request).

## Goal
1. Add a **Bulk & Block Deals** page to finlitventures.com, opened from the IPO page as a third view next to "Now" and "All IPOs" (`/ipo?view=deals`).
2. `/deals` redirects there.
3. It must be fully working on real exchange data,
4. refreshed by a scheduled job,
5. and better than the reference layout (chips All/Buy/Sell and All deals/Bulk/Block, "Largest deals" cards, a sortable table of Stock, Date, Client, Action, Qty, Avg price, Value ₹ Cr).

## House rules
6. Describe, never advise. No buy/sell/hold/best/should/target wording, and no "smart money" or "follow this investor".
7. Keep the site disclaimer.
8. Numbers must be correct and traceable.
9. Every figure shows its source (NSE, and BSE if added) and the date it covers.
10. Never push failing tests. Never call the work done before a live check.
11. Branch from latest main. Run tsc, the whole vitest suite, the vite build and pytest.
12. Check in a browser at desktop width and at 390 px.
13. Open the PR. Merge only when every check concludes "success".
14. Wait for `/api/health` to show the new version, then check live.
15. No model names in code or commits.

## Explainer and glossary text
16. Bulk deal: any client's trades in one share on one day that add up to more than 0.5% of the company's listed shares; normal market; broker reports the same day; the exchange publishes after close.
17. Block deal: a single large trade in the separate block-deal windows. Since 7 Dec 2025 (SEBI circular SEBI/HO/MRD/POD-III/CIR/P/2025/134, 8 Oct 2025): morning window 08:45–09:00 priced off the previous close; afternoon window 14:05–14:20 priced off a VWAP; price within ±3% of that reference; minimum order ₹25 crore (previously ₹10 crore); delivery is compulsory.
18. NSE often lists the same trade in both files. **Our page must not double-count.**

## Data sources
19. Read the daily files first (`bulk.csv`, `block.csv` on nsearchives).
20. Use the snapshot as a cross-check
21. and to get short-selling data.
22. Backfill history on the jobs server from the historical API: 2 years at first, a month per request, one request a second. Use the cookie flow already in `finlit/iponse.py`.
23. If the historical API refuses, keep the daily files from today on.
24. Say in the UI how far back the history goes ("History from <first date>"). Never leave gaps unexplained.
25. BSE: Phase 2 only; if refused, ship NSE-only and label it "Exchange: NSE".

## Backend
26. Migration `market_deals` (next free number after 147) with the brief's columns, unique key and three indexes.
27. Module `finlit/deals.py`: parsers for the two CSVs, the snapshot JSON and the historical JSON.
28. Parse numbers with commas, `-` remarks become NULL, and dates come as `27-NOV-2026` or `27-Nov-2026`.
29. `client_key`: uppercase; collapse spaces and punctuation (`PTE . LTD .` → `PTE LTD`); `PRIVATE LIMITED` → `PVT LTD`, `LIMITED` → `LTD`. Keep the published name for display.
30. Duplicate rule: mark a bulk row `also_block = true` when a block row on the same day, symbol and side has the same client_key, the same price (to the paisa) and qty within 1 share.
31. Totals and "Largest deals" count each trade once.
32. The "Bulk" filter still shows it, with a small "also block" tag.
33. Saving uses an upsert on the unique key, so re-reading a day is harmless.
34. A run summary goes in `flows_meta` key `deals:last`: rows per kind, days covered, duplicates found, HTTP status counts, and the first and last day held.
35. Job `deals` in `finlit/jobs/registry.py` with the brief's arguments (priority 3, 12 min limit, 60 MB, honours_pause False, stall 10).
36. Run every 30 min from 16:00 to 22:00 IST on trading days, plus a morning run for the block window.
37. Each run reads today's files, then steps the backfill one month further back until 2 years are held.
38. Add the CLI command next to `refresh-ipo-prices`.
39. One request a second; stop after 5 refusals and try next run.
40. `GET /api/deals?days=7&kind=all|bulk|block&side=all|buy|sell&q=&symbol=&client=&min_cr=&sort=value|day|qty&page=` returns rows, totals and `coverage {first_day, last_day, exchanges}`.
41. `GET /api/deals/summary?days=7`: the 6 largest single trades, counted once;
42. totals by kind and side;
43. the most active shares by gross value, and net buy minus sell value per share;
44. the most active clients.
45. `GET /api/deals/stock/{symbol}`: every deal in that share, plus the closing price on each deal day and the latest close.
46. `GET /api/deals/client/{client_key}`: all deals by one client.
47. Cache like `/api/ipos/history`: in-memory copy served at once, rebuilt in the background; `Cache-Control: public, max-age=600`.

## Frontend: the main page
48. Header with "Last updated <date>" and "Exchanges: NSE (· BSE)".
49. One line: "Last 7 days · NSE · 679 deals (612 trades after removing block deals also listed as bulk)".
50. Chips: Side All / Buy / Sell.
51. Chips: Kind All deals / Bulk / Block / Short selling.
52. Chips: Period Today / 7 days / 30 days / 90 days / 1 year / custom.
53. Board filter if useful.
54. Search for a stock or a client.
55. All filters live in URL parameters, so a view can be shared.
56. Largest deals cards: stock (links to `/stocks/:symbol`), kind, exchange, date, ₹ value, client, side badge.
57. Deal price against the latest close ("Close now ₹X, +Y% since deal"), as a description.
58. A trade listed in both files appears once.
59. Table columns: Stock (link), Date, Client (link to the client view), Action, Qty (Indian grouping), Avg price, Value ₹ Cr,
60. and % of equity when share count is known.
61. Sortable,
62. paged,
63. with a sticky header.
64. On phone, cards instead of the table (as `.ia-cards` on All IPOs).
65. Summary strip: totals bought and sold by kind, the most active shares, the most active clients over the chosen period.
66. CSV download of the current filtered view.
67. Empty, loading and error states with real wording.
68. Coverage notice when the history is shorter than the chosen period.
69. Reuse `nf` / `dateFormat` from `lib/format.ts`, the Indian number format, and the house table styles.
70. Prefetch in `main.tsx` for `/ipo?view=deals`.

## Where else it shows
71. IPO report page: a "Deals since listing" block listing every bulk or block deal in that share after its listing date.
72. Mark deals that fall within a few days of the anchor lock-in ends (30 and 90 day) and of the 6-month or 1-year pre-IPO lock-in ends.
73. Describe only, e.g. "3 block deals in the 5 trading days after the 90-day anchor lock-in ended (₹412 Cr sold)."
74. All IPOs table: an optional column "Deals since listing (₹ Cr, net)".
75. Lock-in calendar on the IPO page: upcoming anchor lock-in end dates beside recent deals in those shares.
76. Stock page: a "Bulk & block deals" tab.
77. Deal markers on the price chart: a dot per deal at the deal price, with a hover card in the style of the GMP chart dots.
78. Client view (`/ipo?view=deals&client=...`): all deals by one client, net value per share, and the shares this client both bought and sold.
79. Glossary entries "bulk deal", "block deal" and "short selling (reported)".
80. `ask/knowledge.py` "Bulk and block deals" topic points at the new data.

## Upgrades (in this order)
81. Count a trade listed in both files once. 82. % of equity. 83. Price since the deal. 84. Deals linked to IPO lock-in ends. 85. Per-share and per-client histories.
86. Markers on the price chart. 87. The short-selling list. 88. CSV export. 89. Follow a share or client and get an alert on a new deal (existing alerts system; check first).
90. Phase 2: BSE deals. 91. Phase 2: SAST/insider (PIT) disclosures.

## Tests
92. Parser tests on saved samples of both CSVs, the snapshot JSON and a historical JSON (small fixtures, no live calls): comma numbers, `-` remarks, both date styles, client-name normalisation, the duplicate rule (same trade, and a near miss), value in crore.
93. Job test: a re-run inserts nothing new, and the `deals:last` summary is correct.
94. API tests: filters, sorting, totals counted once, coverage, and stale-while-revalidate.
95. Frontend tests: chips change the URL; the table and phone cards render; sorting; empty and coverage states; CSV contents. The whole vitest suite stays green.

## Live check
96. After deploy, run the job once on the jobs server and read `deals:last`.
97. Compare one day on the page with NSE's own page: row count, three random rows' qty, price and value, and the largest deal.
98. Desktop and 390 px; time the page (data request start and rows on screen).
99. Report the coverage (first and last day held, rows per kind) and the comparison.

## Standing rules (docs/TASK-PROMPT.md)
100. Every blank says why. 101. Each plan sees what it allows (the deals are public exchange data: open to every plan, like the IPO pages). 102. Desktop and phone, light and dark. 103. No job is stopped or weakened.

## Status and evidence (27 Nov 2026, before the pull request)

| # | Done? | Evidence |
|---|---|---|
| 1–2 | Yes | `pages/Deals.test.tsx` "/deals redirects…"; `ipos329.test.tsx` "3 views"; shots `after-deals-*` (before: `before-*`, the IPO page had 2 views and /deals was "cannot find that page") |
| 3–4 | Code yes; live data after deploy | `test_deals.py` job tests on NSE-format fixtures; job `deals` in `jobs/registry.py`. NSE is unreachable from this cloud container (proxy 403), so the first real run happens on the jobs server (points 96–99) |
| 5 | Yes | All the reference parts, plus % of equity, since-deal, counted-once line, short selling, CSV, client view, lock-ins (shots) |
| 6–7 | Yes | "describes, never advises" tests (`Deals.test.tsx`, `IpoReport.test.tsx`); the footnote keeps "Information only, not investment advice" |
| 8–9 | Yes | Header "Last updated · Exchanges: NSE · History from"; footnote names NSE and the dates covered; CSV ends with the source |
| 10–12 | See the PR | Full preflight (tsc, vitest, build, pytest, bandit, lint); desktop 1440 and phone 390 shots, light and dark, no sideways scroll, no console errors |
| 13–14 | After the PR | — |
| 16–18 | Yes | `EXPLAIN` in `pages/Deals.tsx` (folded "What bulk and block deals are"); glossary entries updated |
| 19–21 | Yes | `deals.refresh`: archive first, snapshot cross-check (`crossCheck`) and short selling (`test_job_stores_once…`) |
| 22 | Code yes; to verify on the jobs server | A month a request, a second between requests, cookie flow plus relay fallback. From here the history API is unreachable |
| 23–24 | Yes | `test_job_stops_after_five_refusals_and_keeps_today`; the UI "History from …" plus the coverage notice (`Deals.test.tsx` "short-history") |
| 25 | NSE only, labelled | "Exchanges: NSE" in the header; BSE is phase 2 |
| 26–34 | Yes | Migration 148; `test_numbers_dates_and_remarks`, `test_client_key_collapses_spelling`, `test_duplicate_rule_same_trade_and_near_misses`, re-run test, `deals:last` test |
| 35–39 | Yes | Registry entry, `LIMIT_POLICY`; jobs tests pass; CLI `refresh-deals` next to `refresh-ipo-prices` |
| 40–47 | Yes | `test_list_filters_sorting_and_totals_counted_once`, `test_coverage_and_csv`, `test_summary_stock_client_and_ipos`, `test_stale_copy_is_sent_and_rebuilt_behind_it` |
| 48–52, 54–70 | Yes | `Deals.test.tsx` (12 tests) and the shots |
| 53 | Not added, on purpose | NSE's deal files carry no board (mainboard or SME), so a Board filter would have to guess. The Value filter was added instead |
| 71–73 | Yes | `IpoReport.test.tsx` "Deals since listing" (3 tests) |
| 74 | Yes | All IPOs "Deals column" (optional; fetched only when switched on) |
| 75 | Yes | `LockinCalendar` on the first view |
| 76–77 | Yes | Ownership (section 12) tab "Bulk & block deals": dots and a hover card (`OwnDeals.test.tsx`). A tab inside section 12, so the report's 01–19 numbering stays as the final-pages pack has it |
| 78 | Yes | Client view (`Deals.test.tsx`) |
| 79–80 | Yes | Glossary (site, backend, extension); MCP and Ask tool `get_bulk_block_deals`; knowledge.py points at it |
| 81–88 | Yes | As above |
| 89 | Yes | Follows plus one notification per run (`test_follow_a_share_and_a_client_and_get_one_notification_per_run`) |
| 90–91 | Not done | Phase 2, as the brief says |
| 92–95 | Yes | `backend/tests/test_deals.py` (14), `pages/Deals.test.tsx` (15), `IpoReport.test.tsx` (+3), `OwnDeals.test.tsx` (2) |
| 96–99 | After deploy | Needs the jobs server (NSE answers there); steps in docs/DEALS.md |
| 100–103 | Yes | Blanks say why; public data, open to every plan; 4 views shot; the new job adds work and stops none |
