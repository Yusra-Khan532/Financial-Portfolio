# IPO calendar: data path and how to see what the provider sends

Path: FinEdge `/ipo-calendar` -> `backend/finlit/calendars.py` (`ipo_rows`, `details_of`, `ipo_fields`) -> table `ipos` -> `GET /api/ipos` -> `frontend/src/pages/Ipo.tsx` (the compact layout of task #307: a KPI strip, a toolbar, cards for open, upcoming and closed issues, the listed issues as a table) and `IpoDrawer.tsx` (details).
`refresh-calendars` runs daily from the scheduler.

## Check the provider's field list from a browser (no SSH)

1. Open `https://<site>/api/results/status` and find `ipoFields`.
2. `seenKeys` is every field name the provider's IPO rows carried at the last `refresh-calendars` run; `sample` is one full row (the one with most fields, long text cut); `rowCount`, `windowFrom`, `windowTo` and `at` say what was asked and when.
3. Send us a screenshot of the `ipoFields` block. If it is `null`, `refresh-calendars` has not run since this release (or the provider call failed: see `lastRun.calendars.error` and `lastSkipped`).

## What is stored and shown

* `ipos.raw` (jsonb, migration 073): the provider's own row, trimmed (fields over 1,500 characters dropped, secret-looking keys dropped, about 6 KB cap). Not served by the API; kept so later features need no new provider call.
* `ipos.details` (jsonb): the facts we know how to read by tolerant alias (key spelling and case ignored): issue type, exchange, registrar, lead managers, subscription (overall, QIB, NII, retail, employees, shareholders), allotment / refund / credit dates, face value, issue price, fresh issue and offer for sale, promoter holding before and after, objects of the issue, DRHP / RHP / prospectus links (https only), minimum investment if the provider sends one.
* Existing columns now also read more aliases: sector, lot size (market lot), listing price.
* The page shows only what is present. Nothing is estimated: listing-day change is arithmetic on the issue price (or the top of the band when no issue price is sent) and the listing price; minimum investment is one lot times the upper price. GMP comes from InvestorGain (the latest on each open, upcoming or closed card; the record of listed issues in "What GMP said vs what actually listed").

## Adding a field

Send the `ipoFields` screenshot; we add the key to the alias list in `details_of` and to the drawer. Rows already stored can be re-read from `raw` without a provider call.

## The page (task #307, developer file 17 v2, 22 Nov 2026)

Order: one KPI strip (Open now · Upcoming · Closed, listing soon · Listed in the last 30 days · Avg listing vs issue, 30 days) → toolbar (search, Status and
Board with counts, All IPOs since 2020) → Open now → Upcoming → Closed, listing soon → Next seven weeks → What GMP said vs what actually listed (closed until
opened) → Listed → the as-of line.

* Cards: the same fields in the same order for every issue (Opens · Closes · Lists · Price band · Lot size · Minimum investment · Issue size · Times
  subscribed · Latest GMP, or Listed vs issue price); a missing value is a grey "—". Names in capitals are shown in title case (`lib/ipoCalendar.ts`).
* Listed: the last 30 days as a table, by listing date, newest first (same day: by opening date). A search or Status = Listed lists every listed match, 25 at
  a time. "See all … in All IPOs" links to `/ipo/all`.
* GMP section (`components/ipo/GmpRecord.tsx`): views By GMP range (default), Every issue and Table; filters Board, Listed (year), Issue size, Subscription,
  each with its count. Categories against the GMP: within 5 points, listed higher, listed lower, and "Opened at the +90% cap" for an SME issue that listed at
  +90% (±0.6) with a GMP above 85%. Worked out in the browser from `/api/ipos/gmp-record?board=all`. "How close GMP came ↓" on a card opens the section on its
  range and board. Colours: `--gv-*` in `styles/ipo-calendar.css` (not the gain and loss colours).
* Tests: `pages/Ipo.test.tsx`, `lib/ipoCalendar.test.ts`.
