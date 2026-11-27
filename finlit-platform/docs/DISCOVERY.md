# Discovery: themes from companies' investor presentations (task #221)

The task (18 Nov 2026, area FinLit AI): "reading investor presentation from documents and extracting keywords attached in below excel file and the
bucketing it and creating separate section called 'DISCOVERY'", with the Investor Presentation Keyword Directory and the founder's pseudo-code
(`bucket_investor_presentations.py`).

## Where to see it

FinLit AI panel → **Discovery** (side menu in the full window; "More themes" on the start screen in both sizes). Themes with their counts, then
one theme: each company with the keywords found, up to 2 sentences from the presentation that hold a figure, other themes it talks about, and the
presentation itself (the exchange's link and date). The directory's caution is on every screen: a keyword mention by itself is not proof of material
business exposure. Open on every plan (it quotes what companies filed). FinLit AI answers "which companies are into ..." from it (`get_discovery`).

## How a company is placed (`backend/finlit/discovery/keywords.py`, the founder's rules as written)

- 21 themes, 254 keywords, copied from the notes (a test checks them against the notes).
- Whole words only; short all-capital acronyms (5 letters or fewer: EMS, CAM, ESS, UPS ...) in capitals only, so "campaign" or "ems" never count.
  Plurals count ("solar cells", "EVs"): an upgrade, the notes' exact boundary missed every plural.
- A theme counts when 2 different keywords, or 5 mentions, appear. Score = 2 × different keywords + 0.5 × mentions (up to 20).
- Primary theme: the highest score. Secondary: any other theme scoring at least half of it.
- Evidence: up to 2 sentences that name one of the primary theme's keywords AND hold a figure.
- Status: `ok` (evidence found), `keyword_only_no_figures`, `no_bucket_match`, `no_text_layer` (a scanned file, under 200 characters of text),
  `error` (the exchange did not give the file; the reason is logged). Fix: the notes set "ok" from the evidence function itself, so it was always "ok".

## The nightly job (`backend/finlit/discovery/service.py`, job `discovery`)

Per company, the newest filing in the last 400 days that the Documents page calls an "Investor presentation" (not a meeting notice, annual report or
transcript). Read again only when a newer one is filed; a failed read is tried again after a day. First 80 pages (the notes). Newest filings first,
300 a run and 40 minutes, resumable. Table `discovery_companies` (migration 110). Route `GET /api/discovery` (`?theme=`, `?symbol=`).

## Upgrade (owner, 18 Nov 2026): bucketing as the PDF, tone, every filing, sectors

The owner asked for "proper bucketing as mentioned in the PDF", "the same bucketing for all the other companies' news in our documents section",
"sentimental kind of analysis" and "sectorization, because we have to do further more things into it".

- **The PDF's own structure** (`discovery/directory.json`, read from the PDF's tables): 166 keywords in the 21 buckets, each with its related terms
  and "what to verify". A keyword and its related terms are one concept, so synonyms count once ("Counter-drone systems", "Anti-drone", "CUAS" are
  one); every term of the founder's notes is matched (merged into the concept that holds it, or its own: 175 concepts, 521 phrases). Each piece of
  text counts for one concept only ("Generative AI" is not also "AI"). A handful of related terms that are ordinary words in any deck ("MW",
  "trials", "navigation", "payload" ...) stay in the directory but are not matched alone.
- **Screening discipline** (the PDF: "distinguish operating businesses from plans, pilots, MoUs and unexecuted announcements"): each sentence on a
  theme is Operating (commissioned, delivered, revenue from ...), Under execution (under construction, order book, orders received ...), Planned
  (plans to, proposed, by FY28 ...) or MoU / pilot; the company shows the most advanced one its own words support.
- **Tone** of the presentation: positive minus negative finance words, -1 to 1, "Positive", "Mixed", "Negative" or "Too few words to tell".
- **Every exchange filing** of the last 180 days (news, results filings, documents; `discovery/signals.py`, table `discovery_signals`): an event type
  from NSE's category and the headline (order win, capacity / commissioning, acquisition / merger, partnership / MoU, fund raising, credit rating,
  results, management change, legal / regulatory, default, payout, investor meet), the themes its headline names, and a tone of +1 / 0 / -1 (an
  order +1, a penalty -1, a rating by "upgraded" / "downgraded", a top resignation -1, else the headline's words). Database only, in the same job.
- **Sectors**: NSE's macro sector, sector and industry of each company (`company_classification`); "By sector" in the panel, a sector filter in a
  theme (`/api/discovery?sector=`), sector counts per theme, and `bySector` (sector -> theme -> companies) for the work that comes next.
- The panel shows per company: stage, sector, keywords, sentences with figures, tone, filings of 90 days (count, positive, negative), the
  presentation; per theme: stages, sectors, the filings that name it, and the directory's "what to verify".

## Reading NSE's files (shared fetcher, `earnings/transcripts.py`)

Checked on 18 Nov 2026: NSE's filings list gives links on `nsearchives.nseindia.in`, which the fetcher refused ("host is not an exchange archive"),
and NSE's archive drops the connection with no answer for a non-browser agent. So FinLit AI's "read the investor presentation" (task #218) and the
company brief could not read NSE files either. Now: `.in` links are read from `nsearchives.nseindia.com` (the same file), NSE files are asked for with
the browser agent the NSE API calls already use (robots.txt still read and obeyed), a dropped connection is retried through the exchange relay when one
is set, and presentations and annual reports have a 40 MB cap (a 16.5 MB presentation was seen; transcripts keep 15 MB).

## First night on the live site (18 Nov 2026) and the fix that followed

The first run read 98 presentations with 1 failed download (the NSE fix works on the server) and placed 66 companies. Checking the filings showed
66 under "Renewable Energy & Power" and no company: the themes were read from the whole headline, so company names ("Emmvee Photovoltaic Power
Ltd", "Om Power Transmission Ltd") and NSE's own label "Capacity addition" (filed for hotel rooms and hospital beds too) counted. Now a filing's
themes and stage come only from what it says about the business (`signals.subject_of`: the headline without the company's name, NSE's boilerplate
and its category label); "MW" alone no longer means a data centre; "wins ... order" is an order win. A change of the tagging rules re-tags every
stored filing once (`TAG_VERSION`, database only).

The same first night showed "Corporate Catalysts & Growth Signals" (order book, JV, M&A, guidance) as the main theme of 43 of 133 companies:
events every deck names, not a line of business. Now a business theme that qualifies is the primary and the catalysts stay a secondary theme
(alone, they are still shown). `keywords.RULES_VERSION` (migration 111, `discovery_companies.rules`): when the scoring changes, the job reads the
older presentations again, after the new ones, bounded per night.

## The Discover page (task #260, the 20 Nov 2026 Discover pack)

The page lives at `/discover` (menu: Research › Find stocks › Discover, after Query builder). One real path per view, so every page can be linked:
`/discover` (Themes), `/discover/themes/<slug>`, `/discover/changes`, `/discover/changes/<key>`, `/discover/sectors`, `/discover/sectors/<macro>`,
`/discover/sectors/<macro>/<sector>`, `/discover/industries/<industry>`, `/discover/companies`. The company table's filters, sort and page are in the
query string (`?stage=Operating&size=mid&mac=Industrials&v=uptrend&sort=r3m&page=2`). The old `/discovery` address and its `#theme-...` hashes land on
the same pages. Code: `frontend/src/pages/Discovery.tsx`, `frontend/src/discovery/` (model, views, table and panel, styles `dsc-`).

Reads: `GET /api/discovery/board` (every placed company with its NSE macro sector, sector and industry, the latest event filing with its PDF, the latest
filings per event and per theme), and, when a company's row is opened, `GET /api/discovery/company?symbol=` (`board.company()`): the words that placed
it, every passage FinLit kept with whether it names the theme and its PDF page, the presentation's PDF and its filings of 90 days with their PDFs. The
passages go through the pack's quote rule (`discovery/quotes.py`, a port of the pack's `quote-rule.js`), run on the stored evidence and on the
presentation's page texts that the job keeps (`document_pages`, task #255), so a page number is shown wherever the page text is kept. Only the
exchanges' own files are linked. Sizes are FinLit's four sizes (`frontend/src/lib/companySize.ts`, SHARED §2); Pulse and Rotation are in the shared
words with their reading date and a red "N days old" tag after a week. Without Gold, Prism, Short term and Long term are locked, and so are the two
ready-made views that filter on them (the pack's open decision, decided on 20 Nov 2026: their counts would reveal the readings).

## Task #273 (20 Nov 2026): data fixes the other pages depend on

- **Filing sorter** (`signals.py`, TAG_VERSION 3): a filing whose subject names a Commissioner, tax, GST, VAT, customs, excise, a demand notice or order, a penalty, an appeal or a tribunal is **Legal and regulatory**, read before every other event, so it is never an Order win or Capacity (an order win's own "(excluding GST)" and a results filing's "profit after tax" do not count). NSE's results category stays Results. `commission` now matches only commissioning / commissioned, never Commissioner. The version bump re-sorts every stored filing once on the next run (database only, seconds).
- **Lenders and technology themes** (`keywords.seat`, read by the board, the company panel, `/api/discovery` and FinLit AI): for Banks, Finance, Capital Markets and Insurance, AI & GenAI, Cloud & Data Centres, Cybersecurity & Connectivity, Semiconductor & Electronics and Space & Drone Technology count only as mentions unless the sentences that placed them show revenue, orders, contracts, licences, subscriptions or a product sold to clients, in the same sentence or table cell as the theme's own word (a KPI slide's "Revenue" next to an unrelated "AI" cell does not count: live check, 20 Nov). The main theme is then the strongest non-technology theme the company qualified for; with none, the company is not placed. Theme counts and medians follow from the rows.
- **Passages** (`quotes.py`): cover letters, signature blocks ("Yours sincerely … Company Secretary … M.No."), biographies and legal disclaimers ("Reproduction, distribution … prohibited") are skipped. `mend()` joins split words ("operat ional") and spaces glued numbers ("to12,500+") where the text is extracted and again for text stored before.
- **One label per theme**: `board.label_of()` and `board.theme_slug()`; the board's themes carry `label` and `slug`, the company route `themeLabel` and `themeSlug`, `/api/discovery` themes `label`.
- **Filings on the company route**: the newest 12, plus the latest filing of each other kind in the 90 days.
- **`&open=<symbol>`** on any Discover page opens that company's row on arrival.

## Task #267 (21 Nov 2026): earnings-call transcripts and results filings

The team: "in discovery tab we need to add call transcript as well as result filings same way we did and use the keywords mentioned in pdf".

- **Keywords**: Part 2 (Earnings Call Transcript Keywords: 8 "Call: ..." buckets, 87 keywords) and Part 3 (Results Filing Keywords: 7 "Results: ..."
  buckets, 101 keywords, the sector KPIs included) of the Investor Presentation Keyword Directory v3, each keyword with its related terms (10 or more)
  and what to verify, in `discovery/sources.json`, read from the PDF's word positions by `scripts/build_discovery_sources.py` (it stops unless the
  PDF's own counts come out). Part 1 stays in `directory.json` as it was: v3 has the same 166 keywords and "what to verify" lines, but lists 10+
  related terms for each where `directory.json` holds 1 to 6; adding them would re-sort every company's presentation theme, so it is left for its
  own task.
- **Documents** (`discovery/sources.py`), per company, the newest of the last 400 days: the filing the Documents page calls a "Call transcript"
  whose title or category says "transcript" (a "concall" letter alone is a schedule or recording), and the newest results filing (financial results,
  the outcome of the board meeting that approved them, the results press release; not a results-date notice, a newspaper copy, a call letter or a
  presentation). Text the site already keeps is read first (`document_pages`, kept by the Concall Monitor, FinLit AI and this job;
  `earnings_call_text`, kept by the earnings-call job); a file is downloaded through the shared fetcher only when no text is kept, and its text is
  then kept in `document_pages` for FinLit AI.
- **Matching**: the presentations' engine (concepts, whole words, plurals, short capital acronyms in capitals only, 2 different keywords or 5
  mentions, evidence = up to 2 sentences that name a keyword AND hold a figure, never a rating or a disclaimer; tone of the document's words), built
  as tries for the 1,400+ phrases (same counts as `keywords.analyse`, a test checks it; 0.07 s instead of 11 s per 100 KB). Ordinary words of every
  call or filing ("about", "FY", "revenue", "guidance" ...) stay in the directory but are not matched alone. Stages stay with presentations.
- **Job**: the nightly `refresh-discovery` reads them after the presentations, in the minutes the presentations left (their limits unchanged),
  at most 400 documents and 600 exchange requests a run, newest first; re-read only when a newer document is filed or the rules change, a failed
  read after a day; `sourcesUnreached` in the run result keeps the `discovery` probe asking for more. Table `discovery_documents` (migration 122),
  one row per company and source.
- **Route**: `GET /api/discovery/sources?source=calls|results` (every bucket with companies, how many with evidence, first names, what to verify,
  and the reason when empty), `&bucket=<name>` (its companies: keywords, evidence, document date and exchange link, what to verify, tone),
  `&symbol=<SYM>` (one company's buckets, or why there are none). Open on every plan, like the rest of Discover.
- **Page** (25 Nov 2026, the founder: Results filings is no longer shown; `/discover/results` opens Earnings calls; the bar has two labelled groups,
  "From investor presentations" and "From earnings calls"): "Earnings calls" (`/discover/calls`) and "Results filings" (`/discover/results`), in a strip of their own under the four ways; a
  bucket at `/discover/calls/<slug>` (`discovery/Sources.tsx`, styles `dsc-kd-`).
