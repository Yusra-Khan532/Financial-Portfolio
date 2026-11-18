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
