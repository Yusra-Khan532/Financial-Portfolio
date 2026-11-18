# Ask FinLit AI: written answers from FinLit's own data (task #211)

Founder's decisions (17 Nov 2026): Claude Haiku (lowest cost), answers only from FinLit's data, plan limits respected, fast.

| Plan | Written answers a month | Listed (predefined) questions |
|---|---|---|
| Visitor, Basic | **0** (the panel offers the closest listed questions and says written answers are Silver and Gold) | yes, instant |
| Silver | **50** | yes, instant |
| Gold | **100** | yes, instant |

The month is the calendar month in India; the count renews on the 1st. An administrator counts as Gold (or as the plan previewed with "view as").

## How an answer is made

1. The panel (`frontend/src/components/Assistant.tsx`) answers a listed question at once, in the browser, as before (task #138). Only a question that is
   not listed, from a Silver or Gold member, goes to `POST /api/ask` (`frontend/src/lib/askAi.ts`).
2. `backend/finlit/ask/api.py` checks the member (signed in, Origin, CSRF), the plan and the month's allowance (`ask/quota.py`, table `ai_usage`,
   migration 107), then streams the answer as Server-Sent Events: `meta` (questions left), `status` ("Reading the ratios (TCS)"), `text` (the words as
   they are written), `replace` (an answer withdrawn as advice-like), `done` (the disclaimer) or `error`.
3. `ask/service.py` runs Claude (`ASK_MODEL`, default `claude-haiku-5-5`) with 23 read-only tools (`ask/tools.py`): the FinLit MCP tools (quotes,
   statements, ratios, shareholding, price history, FinLit IQ, results, results calendar, screener, market overview, FII/DII flows, IPOs, funds, ETFs,
   data freshness) and the member's own Equity portfolio, mutual funds and watchlists.
4. **Every tool calls the website's own route in-process as the member** (`ask/gateway.py`: their session cookie, CSRF token and "view as"). So the AI
   sees exactly what that member's plan shows on the website, never more; a route that refuses a plan gives the AI a "not included in this member's plan"
   message, and the answer says which plan includes it.
5. The instructions (`service.SYSTEM`): every figure from a tool, with its period or date; a blank is said with its reason; describe, never advise;
   no disclaimer of its own (the panel shows the standard one under every answer). A finished answer that reads like advice (`service.ADVICE`: "you
   should buy", "target price", "multibagger", "top pick", "best stock" ...) is withdrawn and replaced by a plain notice.

## Answer every question, in a few lines (18 Nov 2026)

The founder asked "what is future prospect of reliance": FinLit AI replied that the forecast was not available and gave the sector outlook, while
Claude itself answered from the web. Founder: answer what is asked, from the web when FinLit's data does not hold it, in simple words and few lines;
denying an answer is embarrassing.

- FinLit's data first (company cards and tools); the web (`web_search`, run by the provider, at most 2 searches an answer, results India first) for
  everything else: prospects, plans, news, management commentary, the wider economy, general questions.
- Style: the direct answer in one sentence, then at most 4 short bullets, under 90 words; "Sources: ..." in one line when the web was used.
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
  parts and technical views, FinLit IQ, key ratios, returns, strengths and watch-outs, rank against NSE peers, F&O and margin trading), read from the
  page's own routes as the member, so each part follows the plan (Prism: Gold, and the showcase company for every member).
- `get_finlit_prism`, and `get_company_section` for every other section (peers, rank vs peers, dividends and corporate actions, segments, ownership
  insights, company brief, IQ and Prism history, forecast, macro outlook, trading facts).
- **Cards first:** the company of the page the member is on, and up to two companies the question names (`ask/companies.py`: whole names, short
  names and plurals such as "jsw steels", symbols written in capitals; loose matches need a distinctive word, so "indian banks" or "life insurance
  companies" name no company), are read before the model starts. Any wording about a company is answered from what its page shows, in one round.
  Checked against the full list of 5,745 companies: 0 false matches on 48 questions about groups of companies, 20 of 20 named companies found.
- The instructions name FinLit Prism (and "Prism score", "rating", the dots G&P, V, Q, R, S, L), FinLit IQ, FundPulse, the peer rank and NSE's levels,
  and forbid saying FinLit lacks a measure; times are written in India time.

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
| Basic and Advanced stock screeners | `screen_by_finlit_score` (FinLit IQ or FinLit Prism, by range, sector, size) | `/api/screener/universe` |

The company report, Prism report, stock screener, portfolios, FII/DII flows and results calendar already had tools. The instructions name every page
and its tool, FinLit's page before the web. **Links:** the `done` event carries `pages` (`[{to, label}]`, at most four, made by `pages.page_links`
from the tools the answer used), cached answers too; the panel shows them as "Read on FinLit" links under the answer, this site's pages only
(`safePages`). **Documents:** a filing is an "Investor presentation" only when it is one: NSE files meeting notices as "Analysts/Institutional Investor
Meet/Con. Call Updates", which the Documents page used to count (8 of Reliance's 9; 195 of the newest 200 filings site-wide, 55 real). The same rule
is in `frontend/src/lib/feed.ts docType` and `pages.doc_type`.

## Speed

- Instant listed answers first; the model is used only for the rest.
- Streaming: the first words show as soon as they are written.
- Haiku at low effort, at most 1,500 words of output, at most 4 rounds of reading, 30 seconds in all (then a clear message).
- The tool list and the instructions never change, so they are cached by the provider (`cache_control`): every question after the first sends less.
  Today's date, the plan and the page's company go in the message, after the cached part.
- The tools of one round run together; each result is cut to about 3,000 tokens (`tools.RESULT_CAP`).
- On a company page the company is sent with the question, so no search is needed.
- The same first question on the same page, plan and day is answered from Redis for 30 minutes, at once and without using the allowance (never for
  questions about the member's own lists).
- One client per process keeps its connection to the provider open.

## Allowance, failures and cost

- A question is taken from the allowance when its answer starts; if nothing could be written (provider down, busy, too slow, declined), it is given back.
- At most 6 questions a minute per member, whatever the allowance.
- Daily totals of questions and tokens: Redis hash `ask:usage:YYYY-MM-DD` (fields `questions`, `input`, `output`, `cache_read`, `cache_write`, kept 120 days).

## Settings (`/opt/finlit/.env.aws`)

| Setting | Meaning |
|---|---|
| `ANTHROPIC_API_KEY` | The Claude API key. Empty = written answers are off; the panel keeps its listed questions and nobody is told to upgrade for them. |
| `ASK_MODEL` | Optional. Default `claude-haiku-5-5`. |

## Tests

`backend/tests/test_ask.py` (a scripted model, real Postgres and Redis, Basic / Silver / Gold members), `backend/tests/test_ask_pages.py` (the page
tools on copies of the live site's answers, a real PDF, the links), `frontend/src/components/AssistantMore.test.tsx`
(written answers in the panel), `frontend/src/lib/askAi.test.ts` (the event stream).

## Discovery (task #221, 18 Nov 2026)

`get_discovery` (in `ask/pages.py`) reads `/api/discovery`: companies grouped by the themes their newest investor presentation talks about
(docs/DISCOVERY.md). The instructions send "which companies are into ..." questions to it, with the caution that a keyword mention alone is not proof of
a material business. The same nightly reading fixed `read_company_document` for NSE's files (`.in` links, NSE's archive refusing a non-browser agent).
