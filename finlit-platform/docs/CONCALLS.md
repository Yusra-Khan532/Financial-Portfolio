# Concall Monitor (task #278)

Page: `/concalls` (News & events menu, after Latest results). Code: `backend/finlit/concall/` (parse.py, service.py, api.py), `frontend/src/pages/ConcallMonitor.tsx`,
`frontend/src/lib/concalls.ts`, `frontend/src/styles/concall.css`. Tables: `concall_docs`, `concall_summaries` (migration 121). Job: `concalls` (`refresh-concalls`, docs/JOBS.md).

## Where the data comes from

Only the companies' own exchange filings, as NSE lists them under "Analysts/Institutional Investor Meet/Con. Call Updates" (and "Investor Presentation"). The site
already stores every announcement of a loaded company in `feed_items`; nothing new is fetched to find them. SEBI LODR (Regulation 30, Schedule III Part A Para A(15))
makes companies file the schedule of an earnings call before it, the audio recording within 24 hours and the transcript within 5 working days.

| Filing (title says) | kind | read from the PDF |
| --- | --- | --- |
| Schedule of meet / intimation of a call | schedule | the call's date and time, and whether it is an earnings call (broker conferences and one-on-ones are left out) |
| Link of Recording / audio recording | recording | the date and time the letter says the call was held, the audio file link (.mp3 ...) or the web page it names |
| Transcript | transcript | the call's date; the whole text is kept in `document_pages` (FinLit AI reads it too) |
| (Investor) Presentation | presentation | nothing: it is linked and shown as filed |

Nothing is guessed. A date or time a letter does not state is shown as "Date not stated" / "Time not stated in the filings". A date the letter calls "quarter
ended ..." is a period, never the call. A recording or transcript dated after its own filing, or more than 30 days before it, is a misread and is dropped.

## The job

`refresh-concalls --max-minutes 20 --limit 160`, light, every 2 hours plus the night and morning windows. New call filings go into `concall_docs`; each schedule,
recording and transcript letter is downloaded once (the same fetcher and relay as FinLit AI: `ask/pages._pages_of`) and read by `parse.read_letter`. Newest first,
fresh schedules before everything else. A file the exchange does not give is tried again on later runs (three tries) with its reason in `concall_docs.why`. Results
of every run: `/api/mf/status` (`run:refresh-concalls`).

## The page

One card per call (a company and a call date): the schedule gives an upcoming call; the recording, transcript and presentation filed around that date join it.
`latest`: calls held (or with a recording / transcript), newest first. `upcoming`: scheduled earnings calls from today, soonest first. Scope All for everyone;
Portfolio and Watchlist read the member's equity portfolio and watchlists (`filingalerts.lists_of`), and ask a visitor to sign in.

Four buttons per card, each opening its own panel in that card only:

- **Listen**: the audio file the letter links, played on the page (https only); a web page (company site, YouTube) opens in a new tab and says so.
- **Transcript**: the full text, page by page, with the original PDF.
- **PPT**: the presentation shown in place (`GET /api/concalls/file` serves the filed PDF from this site, which may be framed by this site only; the exchange's
  archive refuses frames), with "Open the PDF"; on a phone the PDF opens in the browser's viewer.
- **AI Summary**: written once per document from the transcript (or the presentation when no transcript is filed), with the language model behind FinLit AI, and
  kept in `concall_summaries`. Silver and Gold; the first member to open it uses one of the plan's 10 AI summaries a month (counted with the FinLit Prism
  summaries); afterwards it opens free for everyone on those plans. A line that reads as advice is dropped. The disclaimer stays.

A button with nothing to open is greyed and, when pressed, says why (for example "Companies file the transcript within 5 working days of the call (SEBI LODR)").
