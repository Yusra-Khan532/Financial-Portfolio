# Bulk & Block Deals

Built 27 Nov 2026 from the founder's build prompt "Bulk & Block Deals (under the IPO section)". Checklist and evidence: `docs/deals/CHECKLIST.md`, `docs/deals/shots/`.

## What it shows
- **Page:** `/ipo?view=deals`, the third view of the IPOs page (`pages/Deals.tsx`). `/deals` redirects there with its parameters. Every filter is in the address: side, kind, period (or two dates), search, minimum value, sort, page, client.
- **Elsewhere:**
  - IPO report: "Deals since listing", with deals marked in the 5 trading days after each lock-in end. The ends are the 30- and 90-day anchor lock-ins, and the pre-issue 6-month and 1-year lock-ins counted from allotment (`components/ipo/DealsSinceListing.tsx`).
  - All IPOs: the optional "Deals column" (net value since listing).
  - IPOs first view: "Anchor lock-in ends ahead" (`components/ipo/LockinCalendar.tsx`).
  - Company report, section 12 Ownership: the tab "Bulk & block deals", with dots on the year's closes (`stock/own/OwnDeals.tsx`).
  - The glossary entries Bulk Deal, Block Deal and Short selling (reported).
  - Ask FinLit AI and MCP: the `get_bulk_block_deals` tool.
  - Follows: "Alert me on new deals" on a client's view and on the company-report tab (`components/DealFollow.tsx`).
- **Counted once:** NSE lists most block deals in its bulk file too. Such a bulk line is kept with `also_block = true`, shown under Bulk with an "also block" tag, and left out of All deals, every total, the largest deals, the IPO figures and the notifications. The rule is one function, `finlit/deals.py mark_duplicates`: same exchange, day, share, side and normalised client, the same price to the paisa, and a quantity within one share.

## Data
- **Table:** `market_deals` (migration 148). Unique on (exchange, kind, day, symbol, client, side, qty, price), `NULLS NOT DISTINCT`, so re-reading a day inserts nothing. Before inserting, `save()` also skips a line already held from another source under the same trade key.
- **Sources, in the order a run reads them:**
  1. Today's archive files: `nsearchives.nseindia.com/content/equities/bulk.csv` and `block.csv`.
  2. The snapshot (`/api/snapshot-capital-market-largedeal`): short selling, plus a cross-check of the archive. It stands in for the archive when the archive does not answer.
  3. The history (`/api/historical/{bulk-deals,block-deals,short-selling}`): one month further back per run until two years are held.
- **When NSE refuses:** a request goes to NSE first, then to FinLit's relay (`EXCHANGE_RELAY_URL` / `EXCHANGE_RELAY_KEY`, deploy/amfi-relay). After 5 refusals the run stops asking and the next run tries again.
- **Exchanges:** NSE only for now; the page says "Exchanges: NSE". BSE refuses outside requests (403); try it from the jobs server in phase 2.
- **Run summary:** `flows_meta` key `deals:last` holds rows inserted and read per kind, days covered, duplicates found, HTTP status counts, the cross-check, the first and last day held, the backfill state and the notifications sent. `deals:backfill` holds how far back the history has been read.
- **Derived figures (arithmetic only):**
  - Value = qty × price / 1e7 (₹ crore).
  - % of equity = qty ÷ (market cap × 1e7 ÷ price), from `listing_quotes`.
  - Since deal = (latest close − deal price) ÷ deal price. It is shown only when our close on the deal day is within 0.75–1.33 of the deal price; otherwise a split or bonus has come since and the row says so.

## API (`finlit/dealsapi.py`, public, `Cache-Control: public, max-age=600`, stale-while-revalidate copy in memory)
- `GET /api/deals?days|from&to&kind&side&q&symbol&client&min_cr&sort&dir&page&size&format=csv`
- `GET /api/deals/summary`
- `GET /api/deals/stock/{symbol}?since=`
- `GET /api/deals/client/{key}`
- `GET /api/deals/ipos`
- Signed in: `GET|PUT|DELETE /api/me/deal-follows/{symbol|client}/{key}`. A member can follow at most 50 shares and clients. One notification per member per run, for new deals in today's files only.

## Job
`deals`: weekdays, every 30 minutes from 16:00 to 22:00 IST, plus the MORNING window. Limit 12 minutes; `--max-minutes 8`. See docs/JOBS.md.

## Live check after deploy (on the jobs server)
1. Run the job once and read the run summary (`flows_meta` key `deals:last`):

   ```bash
   docker compose exec jobs python -m finlit.worker refresh-deals --backfill-months 1 --max-minutes 8
   ```
2. Compare one day with NSE's own Bulk & Block deals page: the row count, three random rows' quantity, price and value, and the largest deal.
