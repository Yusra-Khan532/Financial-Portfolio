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

`backend/tests/test_ask.py` (a scripted model, real Postgres and Redis, Basic / Silver / Gold members), `frontend/src/components/AssistantMore.test.tsx`
(written answers in the panel), `frontend/src/lib/askAi.test.ts` (the event stream).
