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
