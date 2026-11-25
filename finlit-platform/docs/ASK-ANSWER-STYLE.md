# FinLit AI: answer style v2 and the answer check

The founder, 25 Nov 2026: work on the structure of the answers and make them as good as possible. The model stays the same (Haiku) because of cost.

## What v2 changes (`backend/finlit/ask/`)

| Part | File | What it does |
|---|---|---|
| A shape per kind of question | `blueprints.py` | Each question is sorted into one of 18 kinds: company, bank, results, bank results, risks, bank risks, valuation, compare, fund, sector, economy, move, news, my holdings, lookup, concept, how-to and greeting. Each kind gets one concrete shape: a lead line of at most 25 words, then 2 to 4 numbered sections with fixed titles and what goes in each. Lookups, concepts, how-tos and greetings get one short answer instead. The shape goes in the note after the cached prefix, so the prompt cache stays warm and the shape costs almost nothing. |
| Small slips mended | `shape.py` (`tidy`) | Removes an opening filler line. Turns `**1. Title**` and `## 1. Title` into the heading form the panel draws, and odd bullets into `- `. Keeps one `Sources:` line and drops extra blank lines. Changes no figure. |
| A little more thinking | `config.py` | Effort `medium` for v2 (`ASK_EFFORT_V2`); v1 stays `low` (`ASK_EFFORT`). Roughly ₹0.05 more per answer. |
| The switch | `variant.py`, migration 142 | `ask_answer_v2` in the feature switches. Off by default, read at most once a minute. Administrators can ask either style on purpose. |

Every answer's shape is logged (`ask shape: style=… kind=… sections=… cited=… problems=…`).

## The answer check (Console > FinLit AI)

`check.py` asks 48 fixed questions in one style through the real `/api/ask`, as the administrator who started it, with `check` on. A check question uses no allowance, is never cached, and is kept in no one's question memory. The questions cover every kind, banks, Hindi, and four advice traps. Questions go one every 12.5 seconds, so a run takes about 10 minutes.

Each answer is scored out of 100:
- **60% fixed checks.** The answer must not read like advice. It must cover what the question needs (for example GNPA for a bank's asset quality), have the right shape for its kind, a source on every figure, short points and a sensible length.
- **40% a grade** by the same model: is the first line direct, are the figures specific and dated, is it clear.

The console shows both styles side by side, question by question, with each answer and what was off. It recommends switching only when v2 scores at least 3 points higher with no more advice-like or failed answers.

**How to use it:** run v1, then v2. Read the comparison and a few answers. Then press "Switch members to v2". One run costs about what 48 member questions cost (about ₹20 to ₹30).
