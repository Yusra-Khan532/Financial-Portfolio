"""ETF portfolio (task #136): the ETFs a member keeps, what they track and cost, how close they trade to their NAV, what sits inside them and how
risky they are together against the Nifty 500. Built like My mutual funds (finlit.mfportfolio) and reusing its risk sums.

Package layout
  calc   weights, what each ETF tracks, the asset mix, overlap, the largest stocks underneath, moving together and each one's share of the swings (pure)
  api    /api/me/etf-portfolio: list, add, quantities, remove, import-preview, import-commit, /inside, /risk

Everything is descriptive. No buy, sell, hold, switch or redeem wording anywhere. Information only, not investment advice.
"""

DISCLAIMER = ("Information only, not investment advice. Prices are NSE closing prices; NAV, costs and fund houses are from AMFI; holdings are from each fund house's "
              "monthly portfolio file. Returns are price returns: dividends are not included.")
