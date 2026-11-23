# Ask FinLit AI: written answers from FinLit's own data (task #211)

Founder's decisions (17 Nov 2026): Claude Haiku (lowest cost), answers only from FinLit's data, plan limits respected, fast.

| Plan | Written answers a month | AI summaries of the Prism card a month (task #228, counted apart) | Listed (predefined) questions |
|---|---|---|---|
| Visitor, Basic | **0** (the panel offers the closest listed questions and says written answers are Silver and Gold) | **0** (the summary in words from the card itself) | yes, instant |
| Silver | **50** | **10** | yes, instant |
| Gold | **100** | **10** | yes, instant |

The month is the calendar month in India; the count renews on the 1st. An administrator counts as Gold (or as the plan previewed with "view as").

## How an answer is made

1. The panel (`frontend/src/components/Assistant.tsx`) answers a listed question at once, in the browser, as before (task #138). Only a question that is
   not listed, from a Silver or Gold member, goes to `POST /api/ask` (`frontend/src/lib/askAi.ts`).
2. `backend/finlit/ask/api.py` checks the member (signed in, Origin, CSRF), the plan and the month's allowance (`ask/quota.py`, table `ai_usage`,
   migration 107), then streams the answer as Server-Sent Events: `meta` (questions left), `status` ("Reading the ratios (TCS)"), `text` (the words as
   they are written), `replace` (an answer withdrawn as advice-like, or `""` to clear the words written before a tool round), `ping` (a keep-alive
   after 10 s of quiet), `done` (the disclaimer) or `error`. A stream that ends with neither `done` nor `error` is shown as interrupted (task #349).
3. `ask/service.py` runs Claude (`ASK_MODEL`, default `claude-haiku-5-5`) with 34 read-only tools (`ask/tools.py`) and the web search: the company
   page tools, the page tools of `ask/pages.py`, the FinLit MCP tools (quotes, statements, ratios, shareholding, price history, FinLit Prism, results,
   results calendar, screener, market overview, FII/DII flows, IPOs, funds, ETFs, data freshness) and the member's own Equity portfolio, mutual funds
   and watchlists.
4. **Every tool calls the website's own route in-process as the member** (`ask/gateway.py`: their session cookie, CSRF token and "view as"). So the AI
   sees exactly what that member's plan shows on the website, never more; a route that refuses a plan gives the AI a "not included in this member's plan"
   message, and the answer says which plan includes it.
5. The instructions (`service.SYSTEM`): every figure from a tool, with its period or date; a blank is said with its reason; describe, never advise;
   no disclaimer of its own (the panel shows the standard one under every answer). A finished answer that reads like advice (`service.ADVICE`: "you
   should buy", a buy / sell / hold / accumulate / reduce rating or call, "target price", "price target", an analyst's or the consensus target,
   "multibagger", "top pick", "the best stock to buy" ...) is withdrawn and replaced by a plain notice. Task #349: a target of policy or of a plan
   ("RBI's inflation target of 4%", "a capex target of Rs 5,000 crore", "a target range of 2% to 6%") and "FinLit does not say which is the best
   fund" are not advice and are no longer withdrawn.

## Answer every question, in a few lines (18 Nov 2026)

The founder asked "what is future prospect of reliance": FinLit AI replied that the forecast was not available and gave the sector outlook, while
Claude itself answered from the web. Founder: answer what is asked, from the web when FinLit's data does not hold it, in simple words and few lines;
denying an answer is embarrassing.

- FinLit's data first (company cards and tools); the web (`web_search`, run by the provider, at most 2 searches an answer, results India first) for
  everything else: prospects, plans, news, management commentary, the wider economy, general questions.
- Style (task #290, 21 Nov 2026): one line that answers the question, then 2 to 4 numbered sections ("1. Business growth"), each of 1 to 3
  short points with the figure's source in square brackets; at most about 200 words in all (task #349); a lookup or a definition in one or two
  sentences; "Sources: ..." in one line when the web was used.
- Never passed on from the web: analysts' buy / sell / hold ratings, target prices, price forecasts (instructions, and the final check withdraws an
  answer that has them).
- The panel says "Searching the web" while a search runs. Daily usage counts web searches (`ask:usage:<day>` field `web_searches`).
- Cost: the provider charges about $10 per 1,000 web searches (under Rs 1 a search), on top of the tokens; most company questions are answered from
  FinLit's data without one.

## Reading the company page (rework, 18 Nov 2026)

The founder asked "prism score of jsw steels?" on JSW Steel's page and was told "FinLit has no prism score". Cause: the first tools were the MCP tools,
made for an anonymous visitor, so none read FinLit Prism or the company page's own sections, and the instructions never named FinLit's measures.
Now:

- `get_company_card`: everything at the top of a company page in one call (NSE's four levels, market cap, price, 52-week range, FinLit Prism with its
  parts and technical views, key ratios, returns, strengths and watch-outs, rank against NSE peers, F&O and margin trading), read from the
  page's own routes as the member, so each part follows the plan (Prism: Gold, and the showcase company for every member).
- `get_finlit_prism`, and `get_company_section` for every other section (peers, rank vs peers, dividends and corporate actions, segments, ownership
  insights, company brief, Prism history, forecast, macro outlook, trading facts).
- **Cards first:** the company of the page the member is on, and up to two companies the question names (`ask/companies.py`: whole names, short
  names and plurals such as "jsw steels", symbols written in capitals; loose matches need a distinctive word, so "indian banks" or "life insurance
  companies" name no company), are read before the model starts. Any wording about a company is answered from what its page shows, in one round.
  Checked against the full list of 5,745 companies: 0 false matches on 48 questions about groups of companies, 20 of 20 named companies found.
- The instructions name FinLit Prism (and "Prism score", "rating", the dots G&P, V, Q, R, S, L), Mutual Fund Score, the peer rank and NSE's levels,
  and forbid saying FinLit lacks a measure; times are written in India time. FinLit IQ is retired: asked about it, FinLit AI says so and explains
  FinLit Prism, FinLit's only company score.

## Reading every FinLit page (task #218, 18 Nov 2026)

The team asked for FinLit AI to be "aligned with our pages" (stock screener, Prism report, company report, advanced stock screener, superinvestor,
portfolio, Indian economy, FII/DII flows, results calendar, glossary, insights and blogs, news and filings), to "read the investor presentation in the
Documents section", and to be "aligned with the web pages". `backend/finlit/ask/pages.py` adds one tool per page that had none, each reading the
route that page reads, as the member:

| Page | Tool | Route |
|---|---|---|
| Superinvestor portfolios | `get_superinvestors` (list, or one investor by name) | `/api/superinvestors`, `/api/superinvestors/{key}` |
| India economy | `get_india_economy` (each reading with its period and publisher) | `/api/macro` |
| Glossary | `lookup_glossary` (FinLit's own wording) | the glossary data the page is built from |
| Insights & blog | `get_insights_and_blogs` (says plainly when nothing is published) | `/api/content` |
| News & filings, Documents | `get_news_and_filings` (news, results filings, documents by type) | `/api/feed` |
| Documents: the file itself | `read_company_document` (newest investor presentation, annual report or call transcript; the pages that answer, with page numbers and the link) | `/api/feed`, then the PDF from the exchange archive (`earnings/transcripts.Fetcher`: exchange hosts only, robots.txt, byte cap, relay on 403); the newest 24 files stay in memory |
| Basic and Advanced stock screeners | `screen_by_finlit_score` (FinLit Prism, by range, sector, size) | `/api/screener/universe` |

The company report, Prism report, stock screener, portfolios, FII/DII flows and results calendar already had tools. The instructions name every page
and its tool, FinLit's page before the web. **Links:** the `done` event carries `pages` (`[{to, label}]`, at most four, made by `pages.page_links`
from the tools the answer used), cached answers too; the panel shows them as "Read on FinLit" links under the answer, this site's pages only
(`safePages`). **Documents:** a filing is an "Investor presentation" only when it is one: NSE files meeting notices as "Analysts/Institutional Investor
Meet/Con. Call Updates", which the Documents page used to count (8 of Reliance's 9; 195 of the newest 200 filings site-wide, 55 real). The same rule
is in `frontend/src/lib/feed.ts docType` and `pages.doc_type`.

## Speed

- Instant listed answers first; the model is used only for the rest.
- Streaming: the first words show as soon as they are written.
- Haiku at low effort, at most 4 rounds of reading (a paused web search is not a round). The answer's length is set in the instructions (about 200
  words); `max_tokens` (6,000, setting `ASK_MAX_TOKENS`) is the room for the model's thinking, its tool calls and the answer together.
- Time (task #349): the reads before the model (the companies named, the cards, the documents) share one budget of 15 s (`api.PREREAD_SECONDS`);
  a read not finished by then is left out. The model then has 40 s (`service.DEADLINE`); after 30 s (`service.TOOLS_UNTIL`) no more tools are
  called and the answer is written from what was read. The stream sends a keep-alive `ping` after every 10 s of quiet, for questions and summaries.
- The tool list and the instructions never change, so they are cached by the provider (`cache_control`): every question after the first sends less.
  The tool list is byte for byte the same for every question (task #349: the web search no longer carries a question type's `allowed_domains`,
  which made one cache entry per type); the type's sites go in the note with the question. Today's date, the plan and the page's company go in the
  message, after the cached part.
- The tools of one round run together; each result is cut to about 3,000 tokens (`tools.RESULT_CAP`).
- On a company page the company is sent with the question, so no search is needed.
- The same first question on the same page, plan and day is answered from Redis for 30 minutes, at once and without using the allowance (never for
  questions about the member's own lists).
- One client per process keeps its connection to the provider open.

## AI summary of the FinLit Prism card (task #228)

The "AI summary" button under the two FinLit Prism cards of the company page (`frontend/src/stock/PrismAiSummary.tsx`) sends
`POST /api/ask {"kind": "summary", "symbol"}`: no question and no history. The server writes what is asked (`ask/service.summary_question`): what the
rating means, in words, with the reasons behind it (the card's topPros and topCons), and no scores or other numbers (the team, 19 Nov 2026: "i dont want
it to show numbrrs but meaning of it"). It uses the month's **AI summaries** (10 on Silver and Gold; table `ai_summary_usage`, migration 114), never
the questions, and the questions never use it; `GET /api/ask/quota` returns both (`summary: {limit, used, left, resets}`). The same summary of the same
company, plan and day comes from the cache without using one. When FinLit AI is not used (a visitor or Basic, written answers off, the summaries used),
the button shows what the card means in words, written from the card itself (`cardSummary`), again without numbers. `scripts/ask_eval.py` checks
FinLit AI's summary has no scores.

## Allowance, failures and cost

- A question is taken from the allowance when its answer starts; if nothing could be written (provider down, busy, too slow, declined), it is given back.

## Never an empty or silent answer (task #349)

1. **Out of room.** A request that ends at `max_tokens` before any answer text (the thinking took the room) or in the middle of a tool call is
   asked once more with no tools (`tool_choice: none`): the answer is written from what was read. Every request logs its stop reason and output
   tokens (`ask: request N stop=... output tokens=...`).
2. **Cut answers say so.** An answer cut by `max_tokens` or by the deadline ends with "(cut short; ask for the rest)"; a refusal after some text
   ends with "(stopped early: ...)". The panel draws these as a note under the points (`AnswerText`, `.aif-a-cut`).
3. **Only the answer.** Words written before a tool round ("Let me check ...") are cleared (`replace` with `""`) and are not part of the answer.
4. **Web-search refusals only.** A 400 is retried without the web search only when its message is about the web search; any other 400 is logged
   with the provider's message and the member sees "FinLit AI could not take this question just now" (code `refused`).
5. **Long follow-ups.** The panel cuts each earlier turn to 3,500 characters before sending it; the server cuts a turn over 4,000 instead of
   refusing it (it used to answer 422, and every later follow-up in that chat failed the same way).
6. **The panel never waits forever.** A stream that ends with no `done` or `error` shows "The answer was interrupted. Ask again." with an "Ask again"
   button; an answer still running after 120 s is stopped and says so; while an answer streams, a Stop button ends it (the server stops the work
   too). Both buttons are the shared `ui-btn` (`components/ui`).
- At most 6 questions a minute per member, whatever the allowance.
- Daily totals of questions and tokens: Redis hash `ask:usage:YYYY-MM-DD` (fields `questions`, `input`, `output`, `cache_read`, `cache_write`, kept 120 days).

## Settings (`/opt/finlit/.env.aws`)

| Setting | Meaning |
|---|---|
| `ANTHROPIC_API_KEY` | The Claude API key. Empty = written answers are off; the panel keeps its listed questions and nobody is told to upgrade for them. |
| `ASK_MODEL` | Optional. Default `claude-haiku-5-5`. |
| `ASK_MAX_TOKENS` | Optional. The room for one request's output (thinking, tool calls and the answer), 2,000 to 16,000. Default 6,000. |

## Tests

`backend/tests/test_ask.py` (a scripted model, real Postgres and Redis, Basic / Silver / Gold members), `backend/tests/test_ask_pages.py` (the page
tools on copies of the live site's answers, a real PDF, the links), `frontend/src/components/AssistantMore.test.tsx`
(written answers in the panel), `frontend/src/lib/askAi.test.ts` (the event stream). Task #349: `backend/tests/test_ask_349.py` (one test per
cause of an empty or silent answer, the advice check's positive and negative table, the cache-identical tool list), `frontend/src/lib/askAi349.test.ts`
(a stream with no final event, the time limit, Stop, turns cut to 3,500), `frontend/src/components/AssistantStop349.test.tsx` (Ask again, Stop) and
`frontend/src/components/AnswerText349.test.tsx` (the cut-short note).

## Discovery (task #221, 18 Nov 2026)

`get_discovery` (in `ask/pages.py`) reads `/api/discovery`: companies grouped by the themes their newest investor presentation talks about
(docs/DISCOVERY.md). The instructions send "which companies are into ..." questions to it, with the caution that a keyword mention alone is not proof of
a material business. The same nightly reading fixed `read_company_document` for NSE's files (`.in` links, NSE's archive refusing a non-browser agent).

## The finance reference (task #240, 19 Nov 2026)

The team asked to train FinLit AI on `FinLit_AI_Finance_Training_Parameters_and_Sources.pdf`. The reference itself says how (its sections 1
and 14): curated knowledge retrieval for concepts, structured data for changing figures, evaluated examples for behaviour; fine-tuning is no
substitute for current data and comes only after evaluated examples exist (and the provider's small model cannot be retrained by us). So:

- `ask/knowledge.py` holds the reference in FinLit's words: 19 families of measures (statements, growth, earnings quality, valuation,
  profitability, leverage, efficiency, ownership, valuation methods, reasoning, portfolio, technical, funds, fixed income, macro, corporate
  actions, governance and risk), each with how it is read and its traps; 13 sector families with their own measures (banks: NIM, CASA,
  GNPA/NNPA, PCR, CRAR; NBFCs; insurers; AMCs and exchanges; IT; FMCG; autos; pharma; real estate; telecom and media; capital goods; energy;
  metals and chemicals), found from NSE's own sector and industry names; the source order (primary, secondary, education); the answer
  patterns; the quality checklist. It holds no company's figures.
- The tool `get_finance_framework` (topic or sector) returns it; the instructions (`SYSTEM_RULES`) add: the sector's own measures, never a
  valuation ratio alone, never standalone and consolidated mixed, source and period with every figure, facts apart from estimates, no invented
  filings or scores, and the web in the reference's order (NSE, BSE, SEBI, RBI, MOSPI, AMFI, Nifty Indices, the company's reports first).
- `scripts/ask_eval.py`: the reference's example questions asked of the real model, each answer checked against the checklist (run by hand
  on the server: `docker compose -f deploy/aws/docker-compose.aws.yml exec api python scripts/ask_eval.py`). When the set passes over time and
  enough good examples exist, the reference's next step (fine-tuning on stable patterns) can be weighed; it is not needed for current data.

## Question memory (task #349, PR 2, 23 Nov 2026)

FinLit AI keeps a Silver or Gold member's questions so that a later answer can say what changed "since you last asked" (the next PR). This PR
only stores, lists and deletes: no answer changes. `backend/tests/test_ask_memory.py` holds a golden test of `build_messages` and the cache key
(values taken from `main` before this PR), and an end-to-end test that the request to the model and the events to the member are identical with
memory on or off.

- **What is kept** (table `ai_question_memory`, migration 135): when it was asked, the question (at most 500 characters), a topic key, the answer's
  key lines (`points`: at most 8 of at most 160 characters, no model) and the figures the answer read (`figures`, each with its as-of date: price,
  52-week range, FinLit Prism score, label, parts and model version (only when the tool returned them), P/E, market cap, a sector's box or state,
  the latest results period and filing date, the newest news item or filing), and the plan. Figures come only from the tool results this answer
  already read (the company cards read first, the documents read before the model, the model's own tool rounds); nothing is looked up again.
- **The topic key** (`ask/memory.py topic_of`, no model): `<kind>:<id>:<intent>`. The subject, in this order: the first company the question names
  (`companies.named_in`), the page's company when the question is about it, a fund or ETF in context, a fund or ETF question, a sector
  (`routing._SECTORS`), the economy, the market (Nifty, Sensex, flows), a term (`concept:<words>`), else `general:all`. The intent is one of
  overview, results, valuation, prism, news, documents, price, risks, ownership, concept, from the same words the classifiers read, English and
  Hinglish ("munafa", "share price kya hai", "sensex kyu gira"). Examples: `company:TCS:results`, `sector:pharma:overview`, `concept:pe:concept`.
- **When nothing is written:** an AI summary of the Prism card, an answer that ended in an error, an answer withdrawn as advice-like, a refusal, an
  administrator's "view as" preview, Basic members and visitors (no written answers), and a member who switched remembering off. A repeated first
  question answered from the 30-minute cache is not written either (the cache holds no tool results, so the row would have no figures).
- **When it is written:** in the background once the answer is complete (`memory.after_answer`, one call in `ask/api.py`), so an answer is never
  held up and a failure here is logged, never shown.
- **Retention:** 180 days and at most 200 rows per member. Each write deletes the member's rows older than 180 days and beyond the newest 200;
  reading the list also deletes rows past 180 days.
- **Privacy:** every query is scoped to the member's `user_id`; a member can never list or delete another member's rows (deleting another's row
  answers 404). Deleting the account deletes them (`ON DELETE CASCADE`).
- **Routes** (`ask/history.py`; signed in; deletes need the Origin and CSRF checks): `GET /api/ask/history?limit=50` (`items`: id, askedAt, topic,
  subjectKind, subjectId, intent, question; `count`; `remember`; `retentionDays`; `maxRows`), `DELETE /api/ask/history` (clear all),
  `DELETE /api/ask/history/{id}`. They reach the research API like `/api/ask` (the Vite proxy's `ask` prefix; Caddy sends every path to the app).
- **The member's controls:** `prefs.aiMemory` (default on; older saved prefs load as on). The panel's Chat History reads the server's list for a
  signed-in Silver or Gold member (date, subject, question; tap to ask again; × deletes one) and keeps the browser-only list for visitors and Basic.
  Under the input, while remembering is on: "FinLit AI keeps your questions for 180 days to tell you what changed. Manage in Account.", linking to
  Account > FinLit AI (`/account/ai`): the section "FinLit AI history" with "Remember my FinLit AI questions", how many are kept, and "Clear my
  AI history" with a confirm step.
- **Files:** `backend/finlit/ask/memory.py`, `backend/finlit/ask/history.py`, `backend/finlit/migrations/135_ai_question_memory.sql`,
  `frontend/src/lib/askMemory.ts`, `frontend/src/components/AskHistory.tsx`, `frontend/src/components/AccountAiHistory.tsx`,
  `frontend/src/styles/ask-memory.css`. Tests: `backend/tests/test_ask_memory.py`, `frontend/src/components/askMemory349.test.tsx`.
