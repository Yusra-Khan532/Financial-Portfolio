# Superinvestor portfolios (task #212)

Pages: `/superinvestors` (every investor) and `/superinvestors/{key}` (one portfolio). Menu: Research → Find stocks → Superinvestor portfolios.

## Where the data comes from

FinEdge has no investor-wise endpoint (its API documentation lists only per-company shareholding endpoints; "Superinvestor Portfolio"
is a card on its home page). Every listed company does file, each quarter, the names of the public shareholders who own **1% or more**
of it, and FinEdge sends those filings (`shareholdingDetails`). The nightly job `ownership-insights` (docs/OWNERSHIP.md) already keeps
each company's named holders in `ownership_insights.extra.holders` as `[name, group, % now, % a year ago]`.

`finlit/superinvestors.py` turns that around, by investor instead of by company. It makes **no provider call** and adds **no job**:

| Figure | From |
|---|---|
| Stock picks, stake now and a year ago | `ownership_insights.extra.holders` (rows with `premium_state = 'ok'`) |
| Value of each stake | stake × market capitalisation in `listing_quotes` (₹ crore, nightly `refresh-listing`) |
| Weighting | the stake's value ÷ the value of all the investor's stakes that have a value |
| Industry, sector allocation | `company_classification` (NSE's four levels, docs/TAXONOMY.md) |
| Company name | `companies` |

The answer is built in one pass and kept for an hour (Redis `superinvestors:v1`, then the process).

## Who is listed

A named holder in the **public** group of the filings (not a fund, bank, insurer or other institution, not a promoter, not the
government), named with 1% or more in **two or more** listed companies today. The filing's category lines ("Bodies corporate",
"Clearing members", "HUF", "Individuals holding nominal share capital …") are groups, not investors, and are left out.

Names are matched as the filings write them, after dropping honorifics and punctuation and making "Private Limited" / "Pvt. Ltd."
alike. One investor who files under two spellings, or through a company, appears separately; the page says so.

## The year's changes ("transaction history")

The filings allow one honest comparison: the latest filing against the one a year earlier.

| Status | When |
|---|---|
| Newly named | named now, not a year ago |
| Stake up / Stake down | moved by 0.01 percentage points or more |
| No longer named | named a year ago, not now: **sold, or now under 1%**; the filing does not say which |

## Plans

* The list (names, number of companies, value, largest picks, change counts): everyone, signed in or not.
* A portfolio (every pick, weightings, sector allocation, the year's changes): **Silver and Gold**. The server sends it only to them
  (`403 plan_required` otherwise); the page shows the lock card over an outline built from the list's figures.

## Blanks and their reasons

* No market capitalisation today → "no price", left out of the value and the weights, with the reason under the table.
* No NSE classification → "Not classified", and the stake's value goes to "Not classified" in the sector split.
* Not named a year ago → "not named" in the "A year ago" column.
* No filings stored yet → the list says the details are fetched overnight.

Every page carries the source, the latest quarter, when the filings were fetched, the date of the prices, the rule for who is listed,
and the disclaimer: information only, not investment advice; holdings below 1% are not named in filings.

## Tests

`backend/tests/test_superinvestors.py` (matching, categories, values, weights, sectors, the year's changes, plans) and
`frontend/src/pages/Superinvestors.test.tsx` (list, search, the lock for Basic, Silver and Gold views, every blank's reason).
