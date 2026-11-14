# Profit and revenue outlook (Gold)

`POST /api/outlook/{symbol}` with `{kind: "profit"|"revenue", horizon: "short"|"mid"|"long", values?: {parameter key: percent a year}, weights?: {parameter key: percent}, normalise?: bool, statement?}`.
Code: `backend/finlit/outlook/` (`model.py` the model, `sector.py` peer values, `inputs.py` stored report shape, `backtest.py` validation harness, `router.py` the API).
Information only, not investment advice. Estimates from the company's own history and its sector, not a prediction. The weights are starting values and have not yet been validated.
Method, data rules and what was adapted: [outlook/METHOD.md](outlook/METHOD.md). Back-test: [outlook/BACKTEST.md](outlook/BACKTEST.md).

## Contract
- Gold (and administrators) only; other plans get 403 `plan_required`. Responses are `private, no-store`; cached 10 minutes in Redis by symbol, statement, kind, horizon, weights and values hashes and the stored report version.
- `values` ("Set your own model", task #146, 14 Nov 2026): the user's expected growth rate per input, each set on its own (no total), -50 to +50 percent a year
  (else 422 `invalid_weights`). Any subset; an input left out keeps the company's figure. They replace the computed inputs and the model's weights for the horizon
  combine them; each row then carries `assumed` and `actualPct` (the company's or sector's figure it replaced). The page sends only the inputs moved away from the company's figure.
- `weights` omitted = "Use our model" (the horizon's column). The page no longer sends weights (it did before task #146); the API still accepts them. Otherwise every parameter of the kind, each 0-100, total 100 within 0.01 (else 422 `invalid_weights`), or `normalise: true` to scale them to 100.
- Response: `horizon`, `weights`, `defaultWeights`, `rate {ratePct, rows[] {label, weightPct, effectiveWeightPct, valuePct, rawPct, capped, contributionPts, status, method, reason}, unavailable, weightLeftPct}`, `forecast {available, reason, base, years[], rule}`, `history {points[] {period, valueCr, reportedCr, adjusted}}`, `adjustedYears`, `asOf`, `disclaimer`.
- The chart, the "how this is built" table and the year table on `/outlook/:symbol` are all drawn from this one response.

## Page
Two annual line charts (revenue, profit) above the tables: reported years solid with filled dots, estimate years dashed with hollow dots joined at the latest reported year, a "Forecast starts FYxx" divider, tooltip and arrow-key reading, "Show as table", CSV download. With your own growth rates the model's estimate is a second dashed line.
"Set your own model": one slider per input, its expected growth rate (CAGR, percent a year) from -50% to +50% in tenths of a point, starting at the company's own figure,
which stays under the input's name with how much the horizon's weights count it; an input with no figure shows a dash until it is set. "Combined yearly rate" is the
server's rate; "Reset to the company's figures" clears the user's rates. Profit and revenue each keep their own rates; changing the horizon changes only the weights. No range band is drawn: the model gives one rate, not a range.
The earlier outlook score, group scores and four-quarter range were replaced by this model (see git history).
