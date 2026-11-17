# Sector and industry: NSE's four levels (task #192)

The site used "sector" for several different groupings, so counts did not match between pages (15 Nov sector pack, `TAXONOMY.md` there). Every
listed company now has NSE's four levels, each from NSE's own list, with one name per level:

| Say on the page | Level | Count | Stored as |
|---|---|---|---|
| Macro sector | Macro-Economic Sector | 12 | `company_classification.macro_sector` |
| Sector | Sector | 22 | `company_classification.sector` |
| Industry | Industry | 59 | `company_classification.industry` |
| Basic industry | Basic Industry | 197 | `company_classification.basic_industry` |

## Where the lists come from
`backend/finlit/data/nse_classification.json` is built from NSE Indices' *Industry Classification Structure* (July 2023 edition, niftyindices.com →
Resources → Industry Classification) by `backend/scripts/build_nse_classification.py`. Nothing is typed by hand. The build reads NSE's codes
(IN01 > IN0101 > IN010101 > IN010101001), keeps NSE's spelling with its commas ("Oil, Gas & Consumable Fuels"), joins the two words the PDF breaks
inside a cell ("Telecommunic|ation", "Transmission/Mark|eting") and stops unless it finds exactly 12 / 22 / 59 / 197 with one parent each.
When NSE publishes a new edition: run the script (it needs poppler's `pdftotext`), check its output, bump `taxonomy.VERSION`, commit.

NSE's 59 industries include **Public Services** (no listed share today) and no "Trading": "Trading" in the screener's old column is FinEdge's name
for one company, which NSE files under the basic industry "Trading & Distributors" (industry Commercial Services & Supplies).

## How a company is placed (`backend/finlit/taxonomy.py`)
The first rule that applies; the rule is stored in `source`, and every blank level has a `note` that says why.

1. `basic_industry`: FinEdge's sub-industry is one of NSE's 197 basic industries (175 of the 176 the site showed on 15 Nov are), so all four
   levels follow. If NSE's own quote page puts the company in a different industry, NSE's quote page wins (rule 2).
2. `nse_quote_page`: NSE's quote page names the company's industry (`finlit_technicals/data/nse_industries.json`, 29 Oct 2026).
3. `industry`: one of FinEdge's fields holds one of NSE's 59 industries (HAPPY: "Industrial Manufacturing" → Capital Goods → Industrials).
4. `sector` / `macro_sector`: only a higher level is known.
5. none: "Not classified: ..." with the reason.

Matching ignores case, spaces, commas and "and" / "&", so "Oil Gas & Consumable Fuels" finds "Oil, Gas & Consumable Fuels".

## When it is worked out
- Every start (`worker migrate`): companies never placed, or placed by an older `taxonomy.VERSION`, from stored data only (the latest report's
  profile, else the screener row, else the companies list). No provider call; a few seconds. A failure is logged and never stops a deploy.
- Every full report build places its company again (a quote patch never does). A score-only save places a company that has no place yet and
  never replaces one worked out from a full report.
- By hand: `python -m finlit.worker classify-companies [--force]`.

Each row also carries the company's ISIN (the same lookup as the search list: Dhan's NSE instrument, else BSE, else the fund disclosure list), so
fund and ETF holdings, which are read by ISIN, can be grouped the same way.

## API
- `GET /api/taxonomy`: the four lists with NSE codes and parents, the number of listed companies under each name, and how many are not classified
  at each level (`notClassified`). Public; cached 10 minutes.
- `GET /api/taxonomy/company/{symbol}`: one company's four levels, ISIN, rule and note; 404 when unknown or not placed yet.

## Fund and ETF holdings (round 3)
Each equity line of a fund's or ETF's monthly portfolio is named by `taxonomy.holding_level` (in `portfolios.build_portfolio_json`, so the fund page,
the ETF page, the MF portfolio and the ETF portfolio all read the same names, and in the MF screener's nightly job):
1. ISIN not starting with IN: **Listed abroad** (NSE's lists cover companies listed in India only).
2. The company's own place in `company_classification` (by ISIN, else by the symbol its ISIN maps to): the fund page names the same industry as the
   company page.
3. The fund house's name when it is one of NSE's 59 industries in any spelling ("It - Software" → "IT - Software") or one of the 197 basic
   industries (mapped up to its industry).
4. Otherwise **Not classified**, with the fund house's name in the note.

The API gives each line `industry`, `sector` (NSE's 22), `macroSector`, `industryNote` and the fund house's own `amfiIndustry`; the summary gives
`industries`, `sectors` (NSE's 22) and `macroSectors` (Diversified is the 12th macro sector). `sector` used to hold the fund house's industry
name; it now holds only NSE's 22-level sector.
## Sector Pulse and Sector Rotation names (round 4a)
The board's groups mix NSE industries and sector groups (small industries of one NSE sector read together), so every count on those pages says
"groups" and names its two levels ("38 groups: 33 industries and 5 sectors"); the yardstick is "the average group". Group names are NSE's own in full,
with NSE's commas (`frontend/src/lib/groupNames.ts`, checked against `nse_classification.json` by a test); the two home-made short-name lists are gone.
The Too small section names the industries inside a too-small sector group and accounts for all 59 industries.

## Rounds of task #192
1. This data layer (nothing on the pages changes yet).
2. Every page named in the pack's section 3 reads these fields and labels each list by its level; the old mixed `sector` column goes when no
   page reads it.
3. Fund and ETF holdings mapped through these levels (AMFI names normalised, foreign lines "Listed abroad"), peer groups fall back to the NSE
   industry, Diversified as the 12th macro sector in portfolio grids.
4. Sector Pulse and Sector Rotation (the pack's SECTOR-PAGES.md).
