# #183 part 1 · Equity portfolio · Step 1 findings and Step 2 plan

## Step 1: before (signed in, mocked session, pack sample_40, live answers for everything else; 4 views, Silver + Gold)
Evidence: scratchpad/t183/eq/before-<plan>-<desk|phone>-<light|dark>-{portfolio,div,risk}.png + .json
- A1 reproduced: Gold account shows "SILVER" (all 4 views). Cause: the badge text is written as "Silver" in pages/Holdings.tsx.
- A2/A3: label held over by the two-week rule is shown even after this week's 12-month gap flipped sign (leadership_api shape/list/peers,
  api.py screener, myinvest). Live API, 15 Nov: RPEL published leader, raw in_line, rel52 −0.18; KRN leader/in_line; ICICIBANK laggard/leader.
- A4/A5: the "How spread out" score counts industries; macro-sector counting lives in diversification/sectors.py but the page engine scores on the
  Sector label. Headings say "sector".
- A6: not reproducible: the public universe carries pct_from_high and return_1m for 5,699 / 5,435 companies (RPEL 0.5 / 5.45, KRN 41.39 / −25.61);
  the columns read those fields. Re-check after the rebuild with live answers.
- A7/A8: stock-group ("pack") names and "but" sentences come from portfolio_page/metrics.py (M4, M5, K1, K2) and lib/equityPack.ts.
- B19: tab reads "Diversification" (before json). C41: Export CSV present (before json). Top: score box + 9 tinted tiles? -> today: score box,
  tabs, no tiles row on the Portfolio tab; no sections bar; Risk tab has 4 sections (glance, money vs risk, fall 10%, each share); Diversification
  has spread / where your list sits / what moves together / style tilt.
- Same cause elsewhere: the hard-coded "Silver" badge also sits in pages/MfPortfolio.tsx and pages/EtfPortfolio.tsx (their own tasks, MF and ETF
  parts of #183). Export CSV also on MF portfolio (MF part). Leader rule: stock page, watchlists, Advanced screener, All my investments share it.

## Step 2: work items (in the pack's order), each with its proof
W1 Live fixes: A1 badge (Holdings.tsx: plan word) · A2/A3 leadership `agreeing()` at every reader (leadership_api, api.py, myinvest) ·
   C41 remove Export CSV (SharesTable, PortfolioTabs, Holdings, page FAQ via build-page-faqs AMENDMENTS + json + ts) · B19 tab rename.
   Proof: unit tests (leadership agreeing, badge, no export) + after screenshots 4 views.
W2 ISIN (F86–F91, B10–B11): isin on /api/stocks/{symbol} and screener universe rows; /api/securities/{isin}; list stored with isin; search by
   ISIN; broker import ISIN-first with confirm list for rows without. Proof: backend tests + import e2e with ETERNAL/TMPV rows.
W3 Clear portfolio (B12, G92–G96): server-held cleared list for 10 s (Redis key per member, CSRF), dialog, empty state, Undo.
   Proof: API test (clear, undo within 10 s, final after), page test (focus, Esc, count 0), e2e.
W4 Top (B13–B18, B20–B22, D-19): score box kept, three tinted tiles with ⓘ and "See … →", Silver texts; Key figures strip per tab (foldable,
   remembers state, jump + flash); sticky sections bar with numbered chips, arrows, All sections menu, underline in view. Proof: page tests + 4 views.
W5 Portfolio table (C28–C40): columns by plan (Gold Prism+4+2, Silver IQ+4+1 with API words), divider, band filters by plan, views (Overview,
   By sector with Macro 9 · Sector 13 · Industry 22, By size with cards), fold groups with Open/Close all, sort every heading, weak tint.
   Proof: component tests per plan + screenshots Silver/Gold.
W6 Trends, peers, group leaders (C42–C49): Gold-only cards with Silver lock, matrix with axes/ⓘ/"+N more ▾", business & price lists,
   peers 3 + "Show all N ▾", group leaders section with lock on Silver. Proof: tests + screenshots.
W7 Diversification analytics (D50–D71, A4/A5): Where it sits grid (moved, totals 100%), spread on macro sectors with industry count beside,
   three sub-tabs (sectors heat + reader + ties + pairs + Macro/Sector switch; stock groups via average linkage on 1−ρ cut 0.5 with crosses-sectors
   tag and filter; sizes 3 figures + 3×3 + closest-30), share-by-share grid with reader, sort, slider + Expand; style tilt Gold only.
W8 Risk analytics (E72–E85): server job for betas vs size benchmark index closes (NIF50, NIFMID150, NIFSML250, NIF500), R², capture, risk share,
   blended and Nifty 50 betas; page sections glance → beta build → reading a beta → size benchmarks → risk share → fall 10% → each share.
   Proof: server unit tests (betas to 2 decimals vs a hand calculation), page tests, screenshots.
W9 Whole page (H97–H100, standing rules): insight cards closed on load, keyboard; no sideways scroll 390 px; ⓘ two lines; wording check; disclaimer.

## Not touched
MF portfolio and ETF portfolio pages (their own parts of #183), the dashboard, the screener pages' layout, the weekly leadership job and its
two-week rule, every background job and its schedule.
