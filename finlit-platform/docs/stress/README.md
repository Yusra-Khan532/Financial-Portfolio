# Filling the Stress Lab company settings

Every company already has working settings: its own industry's row, or the NSE sector's (the page says which, under "The assumptions behind it"). A company row replaces those with figures from the company's own annual report, for the settings where the report says something.

1. Open `company-rows-first-50.csv` (the 50 largest covered companies) in Excel or Google Sheets. Do not rename columns.
2. For each company, for each setting you can find in the annual report, fill the `<setting>_new` cell (a share from 0 to 1, or a percentage like 12%) **and** `<setting>_where_found` (the report and page, for example "Board report p.41"). Fill `annual_report_year` (FY26). Leave a setting blank to keep the industry value.
   - Where to look for each setting: `launch` notes in the handover, summarised in `docs/STRESS.md`.
3. Check the sheet (writes nothing): `python backend/scripts/stress_company_rows.py filled.csv`
4. Load it: `python backend/scripts/stress_company_rows.py filled.csv --write`, then open a pull request with the changed `industry_exposure.json`.

The loader refuses a value with no source, a value outside 0 to 1, a row with no report year, and a row whose shares cannot add up (for example 70% crude and 50% imported materials). The raw-material shares are one mix and the export and crude-linked shares are another: when you fill one share of a mix, the others keep their current value (the `_now` column), they are not reset to 0.

Statements on the site hold only totals (materials, staff, other expenses, interest), not the mix inside them, so these figures cannot be worked out from our own data. They have to be read from the report.
