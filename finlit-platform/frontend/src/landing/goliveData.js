// Task #407: the data behind the landing page's interactive parts, from the team's go-live pack (finlit-landing-golive-26nov.zip, 26 Nov 2026).
// AREAS: the six areas and their tools ("Six areas. 40 tools."); each tool is [icon, name, plan, line, parts, note, path, isNew, ownModel, tiles].
// PLANS: the plan comparison (plans P = [name, price text, colour, -, {y: yearly price}], groups G with rows and parts, tool counts cnt, total n,
// add-on prices AP). CLIPS: the short recording of each tool. Change prices and plan contents here only; the page reads them from this file.
export const AREAS = [
 {
  "id": "discover",
  "name": "Discover",
  "line": "Find the stocks and funds worth a closer look.",
  "tools": [
   [
    "ss",
    "Stock screener",
    "Gold",
    "Cut 5,800+ companies down to the few that fit your rules.",
    [
     "200+ filters in 16 groups: valuation, growth, quarterly results, ownership and red flags",
     "Ready-made screens to start from",
     "Pick your columns, sort and save the screen"
    ],
    "In Equity Portfolio, Gold and Platinum · custom ratios from Gold",
    "/screener",
    false,
    false,
    [
     [
      "200+ filters",
      "Across 16 groups",
      "filter"
     ],
     [
      "Ready-made screens",
      "Start in one click",
      "layers"
     ],
     [
      "Pick and sort",
      "Your own columns",
      "sliders"
     ],
     [
      "Save screens",
      "Run them again",
      "bookmark"
     ]
    ]
   ],
   [
    "ps",
    "Advanced stock screener",
    "Gold",
    "Rank the whole market by FinLit Prism, such as the top 10 large caps, or open a momentum screener, in one click.",
    [
     "Prism score with Growth & Profitability, Valuation, Quality and Risk",
     "Short-term and long-term technical views beside each company",
     "*Ready-made screens: highest-rated by size, momentum, themes and chart patterns"
    ],
    "",
    "/advanced-score-screener",
    false,
    true,
    [
     [
      "Prism score",
      "Growth, valuation, quality, risk",
      "layers"
     ],
     [
      "Technical views",
      "Short and long term",
      "candles"
     ],
     [
      "*Top 10 rated",
      "Large, mid and small caps",
      "trophy"
     ],
     [
      "Momentum",
      "Ready-made, after every close",
      "bolt"
     ]
    ]
   ],
   [
    "qb",
    "Query builder & baskets",
    "Free",
    "Type a rule in plain words, get every company that matches, and save it as a basket.",
    [
     "Write rules like Market cap > 500 AND P/E < 15",
     "Start from examples: quality compounders, value, high dividend",
     "*Save it as a basket: run the same query again any day for fresh matches"
    ],
    "200+ ratios free · baskets from Equity Portfolio · custom ratios from Gold",
    "/query-builder",
    false,
    false,
    [
     [
      "Plain-word rules",
      "Market cap > 500 AND P/E < 15",
      "code"
     ],
     [
      "Ready examples",
      "Quality, value, high dividend",
      "list"
     ],
     [
      "Custom ratios",
      "Your own, from Gold",
      "percent"
     ],
     [
      "*Saved baskets",
      "Run again for fresh matches",
      "bookmark"
     ]
    ]
   ],
   [
    "disc",
    "Discover",
    "Gold",
    "Spot companies moving into new businesses, straight from their own investor presentations.",
    [
     "See where 944 companies are heading, sorted into 19 themes by their own investor presentations",
     "Catch what changed: order wins and other filings, grouped by company",
     "Judge each one on the spot, with its sector, industry and FinLit readings beside it"
    ],
    "",
    "/discover",
    true,
    true,
    [
     [
      "19 themes",
      "From company presentations",
      "compass"
     ],
     [
      "944 companies",
      "Sorted by where they are heading",
      "building"
     ],
     [
      "What changed",
      "Order wins and filings",
      "bell"
     ],
     [
      "FinLit readings",
      "Beside each company",
      "layers"
     ]
    ]
   ],
   [
    "sup",
    "Superinvestor portfolios",
    "Gold",
    "See what India’s best-known investors hold, and what they changed.",
    [
     "Every name an investor files under, grouped into one",
     "New stakes, increases and cuts since the last filing",
     "Stocks several investors hold, and overlap with yours"
    ],
    "",
    "/superinvestors",
    true,
    false,
    [
     [
      "26 investors",
      "329 companies named",
      "users"
     ],
     [
      "Latest moves",
      "New stakes, adds and cuts",
      "refresh"
     ],
     [
      "Held by several",
      "Stocks they have in common",
      "grid"
     ],
     [
      "Against yours",
      "Overlap with your portfolio",
      "venn"
     ]
    ]
   ],
   [
    "mf",
    "Mutual funds & ETFs",
    "Free",
    "Filter 8,500+ funds and 350+ ETFs by cost, holdings and returns.",
    [
     "Mutual fund screener: type, category, fund house, size, cost and risk",
     "Returns, SIP returns and the worst fall for every scheme",
     "Compare mutual funds head to head, and an ETF against an index fund"
    ],
    "",
    "/funds",
    false,
    false,
    [
     [
      "8,500+ funds",
      "And 350+ ETFs",
      "pie"
     ],
     [
      "Fund screener",
      "Category, cost, size, risk",
      "filter"
     ],
     [
      "Returns and falls",
      "SIP returns, worst fall",
      "chart"
     ],
     [
      "Head to head",
      "Fund vs fund, ETF vs index fund",
      "scale"
     ]
    ]
   ],
   [
    "mfs",
    "Mutual Fund Score",
    "MF + ETF",
    "Is your fund any good? One 0–100 score from performance, risk, cost and quality, for 8,500+ funds.",
    [
     "A 0–100 score for 8,500+ funds, built from NAVs, costs and holdings",
     "Four parts: performance, risk, cost and quality",
     "Category leaderboards and ready-made views"
    ],
    "Also in Gold and Platinum",
    "/fund-score-screener",
    false,
    true,
    [
     [
      "0–100 score",
      "For 8,500+ funds",
      "gauge"
     ],
     [
      "Four parts",
      "Performance, risk, cost, quality",
      "layers"
     ],
     [
      "Leaderboards",
      "Top-scored in each category",
      "trophy"
     ],
     [
      "From the data",
      "NAVs, costs and holdings",
      "database"
     ]
    ]
   ]
  ]
 },
 {
  "id": "company",
  "name": "Company 360",
  "line": "Open one company up from every side.",
  "tools": [
   [
    "rep",
    "Company report",
    "Free",
    "Read any listed company like an analyst: what it does, how it earns, who owns it and how it compares.",
    [
     "What the company does and what changed, written from its own filings",
     "The latest quarter, its financials and ratios, and whether the profit turns into cash",
     "Who owns it, how it stands against its peers, its segments, dividends and every filing: 17+ sections"
    ],
    "Core sections free · full report from Equity Portfolio · sector sections on Platinum",
    "/research",
    false,
    false,
    [
     [
      "*From its own filings",
      "What it does, in plain words",
      "doc"
     ],
     [
      "Every number",
      "Quarter, P&L, balance sheet, cash",
      "chart"
     ],
     [
      "Is the profit real?",
      "Earnings set against cash",
      "shield"
     ],
     [
      "17+ sections",
      "From the business to every filing",
      "list"
     ]
    ]
   ],
   [
    "pr",
    "FinLit Prism",
    "Gold",
    "A statistical model: a fundamental score on 4 pillars and a technical score on 2, kept apart, with an AI summary of the whole report.",
    [
     "Growth & Profitability, Valuation, Quality and Risk, each with its readings",
     "Short-term and long-term technical views, kept apart from the score",
     "Every factor with its value, its reading and what is missing",
     "An AI summary of the whole report in a few lines"
    ],
    "10 reports a day on Gold · 20 on Platinum",
    "/prism",
    false,
    true,
    [
     [
      "Fundamental",
      "4 pillars: growth, valuation, quality, risk",
      "layers"
     ],
     [
      "Why this score",
      "Every factor, value and reading",
      "list"
     ],
     [
      "Technical",
      "2 pillars: short and long term",
      "candles"
     ],
     [
      "Trend alignment",
      "Do the two trends agree?",
      "compass"
     ]
    ]
   ],
   [
    "docs",
    "Annual reports & presentations",
    "Free",
    "Every report and presentation, linked to the exchange’s own copy.",
    [
     "Annual reports, investor presentations and call transcripts",
     "Each one linked to the exchange’s own copy",
     "Only your watchlist, with one switch"
    ],
    "Free for everyone",
    "/documents",
    false,
    false,
    [
     [
      "Annual reports",
      "Every year on file",
      "doc"
     ],
     [
      "Presentations",
      "And call transcripts",
      "slides"
     ],
     [
      "Exchange copies",
      "Each one linked",
      "link"
     ],
     [
      "Your watchlist",
      "With one switch",
      "eye"
     ]
    ]
   ],
   [
    "cmp",
    "Compare companies",
    "Free",
    "Line companies up on size, valuation, quality, growth and price behaviour, and see where each one is stronger.",
    [
     "Size, valuation, quality, growth and price behaviour",
     "A shareable link for every comparison",
     "Up to 4 companies at once on Gold, up to 8 on Platinum"
    ],
    "2 at once free · 4 on Gold · 8 on Platinum",
    "/compare",
    false,
    false,
    [
     [
      "Side by side",
      "Size, valuation, quality",
      "columns"
     ],
     [
      "Growth and price",
      "How each one behaves",
      "chart"
     ],
     [
      "*Up to 8 at once",
      "On Platinum",
      "grid"
     ],
     [
      "Share link",
      "For every comparison",
      "link"
     ]
    ]
   ],
   [
    "chart",
    "Chart builder",
    "Gold",
    "Chart a company’s price against its results and ratios, and see how they move together.",
    [
     "Line, column, candlestick and heatmap views",
     "Up to 9 charts side by side on Gold and unlimited on Platinum, annual or quarterly",
     "Share price, financials and ratios on the same screen"
    ],
    "From Gold",
    "/graphs",
    false,
    false,
    [
     [
      "Price, results, ratios",
      "Overlaid on one chart",
      "chart"
     ],
     [
      "Side by side",
      "Up to 9 on Gold\nUnlimited on Platinum",
      "grid"
     ],
     [
      "Any period",
      "Annual or quarterly",
      "calendar"
     ],
     [
      "All on one",
      "Price, results and ratios",
      "layers"
     ]
    ]
   ],
   [
    "corr",
    "Correlation charts",
    "Platinum",
    "Does a higher P/E come with faster growth? Plot any two measures across companies and sectors and see.",
    [
     "The relationship between any two measures",
     "A regression trend when it is statistically valid",
     "Add companies to see where each one sits"
    ],
    "Platinum · also as the Charts Pro add-on",
    "/graphs/advanced",
    false,
    false,
    [
     [
      "Any two",
      "P/E, ROE, growth, debt and more",
      "scatter"
     ],
     [
      "Ready pairs",
      "10 groups to start from",
      "list"
     ],
     [
      "Trend line",
      "Only when the link is real",
      "chart"
     ],
     [
      "Your companies",
      "See where each one sits",
      "plus"
     ]
    ]
   ]
  ]
 },
 {
  "id": "quant",
  "name": "Quant Lab",
  "line": "Value a company, test a forecast, shock its earnings.",
  "tools": [
   [
    "dcf",
    "DCF valuation calculator",
    "Gold",
    "Find a share’s intrinsic valuation from its future cash flows, pre-filled and set against its market valuation.",
    [
     "Fills a company’s cash flow, debt, shares and price for you",
     "Intrinsic value, upside or downside, and a margin-of-safety price",
     "Sensitivity grid, reverse DCF and Bear, Base and Bull cases"
    ],
    "Every step of the working shown",
    "/dcf",
    false,
    false,
    [
     [
      "Filled for you",
      "Cash flow, debt, shares, price",
      "spark"
     ],
     [
      "Intrinsic value",
      "Upside or downside",
      "target"
     ],
     [
      "Margin of safety",
      "A price to compare",
      "shield"
     ],
     [
      "Bear, Base, Bull",
      "Sensitivity grid, reverse DCF",
      "sliders"
     ]
    ]
   ],
   [
    "rv",
    "Reverse valuation",
    "Platinum",
    "Work back from today’s price to the growth, margin and return it already assumes.",
    [
     "Solve for the growth, margin, exit multiple or return a price assumes",
     "Miss scenarios and a growth and margin grid",
     "Every assumption on screen"
    ],
    "Platinum · also as an add-on",
    "/reverse-valuation",
    false,
    false,
    [
     [
      "Price assumes",
      "Growth, margin, multiple, return",
      "target"
     ],
     [
      "Growth misses",
      "What if it falls short",
      "bolt"
     ],
     [
      "Growth × margin",
      "The full grid",
      "grid"
     ],
     [
      "All assumptions",
      "On screen",
      "eye"
     ]
    ]
   ],
   [
    "fc",
    "Profit and revenue forecasting",
    "Platinum",
    "Do it yourself: set your own inputs and get 1, 3 and 5-year profit and revenue estimates.",
    [
     "*Do it yourself: start from FinLit’s weights for the company’s own history and its sector, then set your own and watch the estimate change",
     "Short, medium and long-term estimates (1, 3 and 5 years)",
     "Reported figures drawn solid and estimates dotted, so you never mix the two"
    ],
    "Platinum · also as an add-on",
    "/outlook",
    false,
    false,
    [
     [
      "*Do it yourself",
      "Set your own inputs",
      "sliders"
     ],
     [
      "1, 3 and 5 years",
      "Short to long term",
      "calendar"
     ],
     [
      "FinLit’s weights",
      "History and sector, to start from",
      "layers"
     ],
     [
      "Solid and dotted",
      "Reported vs estimated",
      "chart"
     ]
    ]
   ],
   [
    "eps",
    "P/E, EPS & PEG calculator",
    "Free",
    "Turn a company’s earnings and growth into EPS, P/E and PEG, and see the share price they would support.",
    [
     "Work out EPS and a target P/E",
     "Estimate the share price they imply",
     "Try different earnings scenarios"
    ],
    "Free for everyone",
    "/eps-calculator",
    false,
    false,
    [
     [
      "EPS and P/E",
      "Worked out for you",
      "calc"
     ],
     [
      "Implied price",
      "From earnings",
      "rupee"
     ],
     [
      "PEG",
      "Price against growth",
      "gauge"
     ],
     [
      "Scenarios",
      "Try different earnings",
      "sliders"
     ]
    ]
   ],
   [
    "sip",
    "SIP calculator",
    "Free",
    "See what a monthly amount could grow into.",
    [
     "Returns on monthly investments",
     "Step-ups and investment duration",
     "Inflation and taxes accounted for"
    ],
    "Free for everyone",
    "/sip-calculator",
    false,
    false,
    [
     [
      "Monthly SIP",
      "What it could grow into",
      "chart"
     ],
     [
      "Step-ups",
      "And for how long",
      "stairs"
     ],
     [
      "After inflation",
      "In today’s rupees",
      "percent"
     ],
     [
      "After tax",
      "What you keep",
      "rupee"
     ]
    ]
   ],
   [
    "st",
    "Stress Lab",
    "Platinum",
    "Shock crude, the rupee or interest rates and watch earnings react.",
    [
     "Pull the levers yourself: crude oil, the rupee and inflation",
     "Add an interest-rate or demand shock and watch the company’s earnings react",
     "Compare companies under the same shock and see which one holds up"
    ],
    "Platinum · also as an add-on",
    "/research/stress-lab",
    false,
    false,
    [
     [
      "*Your levers",
      "Crude, rupee, inflation",
      "sliders"
     ],
     [
      "Shocks",
      "Interest rates and demand",
      "bolt"
     ],
     [
      "Earnings react",
      "See the hit or the lift",
      "chart"
     ],
     [
      "Compare companies",
      "Which one holds up",
      "scale"
     ]
    ]
   ]
  ]
 },
 {
  "id": "track",
  "name": "Track & manage",
  "line": "Keep what you own and follow in one place.",
  "tools": [
   [
    "all",
    "All my investments",
    "Gold",
    "Your shares, mutual funds and ETFs as one portfolio, in one view.",
    [
     "Every holding read by its ISIN, so nothing is counted twice",
     "Size mix across your shares and the shares inside your funds",
     "Shares, mutual funds and ETFs in one total"
    ],
    "",
    "/my-investments",
    false,
    false,
    [
     [
      "One portfolio",
      "Shares, mutual funds, ETFs",
      "pie"
     ],
     [
      "No double count",
      "Every holding read by ISIN",
      "shield"
     ],
     [
      "Size mix",
      "Including inside your funds",
      "grid"
     ],
     [
      "One page",
      "Everything you own",
      "doc"
     ]
    ]
   ],
   [
    "eq",
    "Equity portfolio",
    "Gold",
    "Your shares scored by FinLit Prism, with diversification and risk analytics.",
    [
     "Prism score for every stock you hold",
     "Diversification across sectors, share by share",
     "Risk exposure and concentration"
    ],
    "50 stocks on Gold and Equity Portfolio · 150 on Platinum",
    "/holdings",
    false,
    false,
    [
     [
      "Prism for each stock",
      "And one for the whole",
      "layers"
     ],
     [
      "Diversification",
      "Sector by sector, share by share",
      "pie"
     ],
     [
      "Risk analytics",
      "Beta, swings, falls, concentration",
      "gauge"
     ],
     [
      "Alerts",
      "When a rating or a trend changes",
      "bell"
     ]
    ]
   ],
   [
    "mfp",
    "MF portfolio",
    "MF + ETF",
    "Your funds read with Mutual Fund Score, with overlap, diversification and risk analytics.",
    [
     "Latest NAV and historical returns",
     "Mutual Fund Score for each fund",
     "1, 3 and 5-year performance side by side"
    ],
    "30 funds on Mutual Fund + ETF, Gold and Platinum",
    "/mf-portfolio",
    false,
    false,
    [
     [
      "Mutual Fund Score",
      "For each fund",
      "gauge"
     ],
     [
      "NAV and returns",
      "1, 3 and 5 years",
      "chart"
     ],
     [
      "Overlap and mix",
      "Stocks your funds share",
      "venn"
     ],
     [
      "Risk analytics",
      "Beta, swings, falls",
      "shield"
     ]
    ]
   ],
   [
    "etfp",
    "ETF portfolio",
    "MF + ETF",
    "See what your ETFs hold, what they cost and how they move together.",
    [
     "What each ETF tracks and costs, and how close it trades to its NAV",
     "Asset mix, overlap and the biggest stocks inside",
     "Swing, worst fall and beta against the Nifty 500"
    ],
    "In MF + ETF and Gold",
    "/etf-portfolio",
    true,
    false,
    [
     [
      "Cost and tracking",
      "And price against NAV",
      "rupee"
     ],
     [
      "Inside your ETFs",
      "Asset mix, overlap, top stocks",
      "layers"
     ],
     [
      "Move together",
      "How your ETFs relate",
      "chart"
     ],
     [
      "Risk analytics",
      "Swing, worst fall, beta",
      "shield"
     ]
    ]
   ],
   [
    "wl",
    "Watchlists",
    "Gold",
    "Track and manage the stocks you are following, with scores, notes and a target price beside each one.",
    [
     "Notes and target prices on each stock",
     "See where your list is concentrated by industry",
     "Group and sort by industry, size or score"
    ],
    "4 lists of 20 stocks on Gold · 8 lists of 40 on Platinum",
    "/watchlist",
    false,
    false,
    [
     [
      "Notes and targets",
      "On each stock",
      "note"
     ],
     [
      "Concentration",
      "By industry",
      "pie"
     ],
     [
      "Group and sort",
      "Industry, size or score",
      "sliders"
     ],
     [
      "Scores beside them",
      "Each stock’s readings",
      "layers"
     ]
    ]
   ],
   [
    "al",
    "Alerts",
    "Free",
    "Set your own triggers on price, signals, scores or filings, and get a live notification the moment one is hit.",
    [
     "Price, volume, technical, score and filing alerts",
     "One-click alerts: price target, big move, volume spike",
     "In the app or in your browser"
    ],
    "5 a month free · 20 a week on Gold · 40 a week on Platinum",
    "/alerts",
    false,
    false,
    [
     [
      "Five kinds",
      "Price, volume, technical, score, filing",
      "bell"
     ],
     [
      "One-click alerts",
      "Target, big move, volume spike",
      "bolt"
     ],
     [
      "App or browser",
      "Wherever you are",
      "phone"
     ],
     [
      "Free to start",
      "5 a month; 20 a week on Gold",
      "gauge"
     ]
    ]
   ]
  ]
 },
 {
  "id": "market",
  "name": "Follow the market",
  "line": "See which way the market and its industries are moving.",
  "tools": [
   [
    "dash",
    "Dashboard",
    "Gold",
    "Open FinLit to your whole day: every portfolio, the live market, your alerts and scores on one screen.",
    [
     "Indices, your alerts and the scores of what you follow on one screen",
     "Your funds on Mutual Fund + ETF, your shares on Equity Portfolio",
     "Everything together on Gold"
    ],
    "Full dashboard on Gold",
    "/dashboard",
    false,
    false,
    [
     [
      "Every portfolio",
      "Shares, funds and ETFs",
      "pie"
     ],
     [
      "Live market",
      "Indices at a glance",
      "chart"
     ],
     [
      "Your alerts",
      "All in one place",
      "bell"
     ],
     [
      "Scores",
      "Of everything you follow",
      "layers"
     ]
    ]
   ],
   [
    "pulse",
    "Sector Pulse",
    "Platinum",
    "Which sectors are sold off, bouncing back or losing steam? See all 22, fresh after every close.",
    [
     "See which industries are sold off, bouncing back or losing steam, after every close",
     "22 sectors and 59 industries, each with its state in plain words",
     "The Nifty’s own trend beside them, so you can tell a sector move from a market move"
    ],
    "",
    "/sectors",
    false,
    true,
    [
     [
      "22 sectors",
      "And 59 industries",
      "grid"
     ],
     [
      "In plain words",
      "Sold off, bouncing back, losing steam",
      "flag"
     ],
     [
      "Vs the Nifty",
      "Is it the sector or the market?",
      "chart"
     ],
     [
      "Daily",
      "Fresh after each close",
      "clock"
     ]
    ]
   ],
   [
    "rot",
    "Sector Rotation",
    "Platinum",
    "See which industries are taking the lead, which are fading, and which just changed places.",
    [
     "Four corners show it at a glance: ahead and gaining, ahead but slowing, behind but gaining, behind and slipping",
     "6-month and last-month returns, measured against the average industry",
     "Weekly ranks, and the industries that have just changed corner"
    ],
    "",
    "/sectors/rotation",
    false,
    true,
    [
     [
      "Four corners",
      "Leading, slowing, improving, slipping",
      "quad"
     ],
     [
      "Just moved",
      "Industries that changed corner",
      "refresh"
     ],
     [
      "Two windows",
      "6 months and the last month",
      "chart"
     ],
     [
      "Weekly ranks",
      "Every industry, every week",
      "trophy"
     ]
    ]
   ],
   [
    "mev",
    "Market events & index",
    "Gold",
    "Announcements, call transcripts and index history in one place.",
    [
     "Company announcements as they are filed",
     "Every index against its own history",
     "Commodity indices in the same place"
    ],
    "One page for the week",
    "/premium/markets",
    false,
    false,
    [
     [
      "Announcements",
      "As they are filed",
      "bell"
     ],
     [
      "Call transcripts",
      "In the same place",
      "doc"
     ],
     [
      "Index history",
      "Each against its own past",
      "chart"
     ],
     [
      "Commodities",
      "Indices beside the rest",
      "globe"
     ]
    ]
   ],
   [
    "md",
    "FII & DII flows and India economy",
    "Free",
    "Institutional money (FII and DII) day by day, and India’s inflation, growth, interest rates and reserves.",
    [
     "FII and DII buying and selling, streaks and history",
     "India economy: inflation, growth, interest rates and reserves",
     "Plain-English readings of each release"
    ],
    "Two pages · free for everyone",
    "/fii-dii",
    false,
    false,
    [
     [
      "Institutional money",
      "FII and DII, day by day",
      "rupee"
     ],
     [
      "Streaks and history",
      "How long each has run",
      "chart"
     ],
     [
      "India economy",
      "Inflation, growth, rates, reserves",
      "globe"
     ],
     [
      "Plain readings",
      "Of each release",
      "doc"
     ]
    ]
   ],
   [
    "res",
    "Results",
    "Gold",
    "See who reports this week, and how each result really compares with the rest of its industry.",
    [
     "Never miss a date: a calendar of who reports when",
     "Go beyond the headline number: every result benchmarked against its industry",
     "See which industries had a strong quarter and which did not, on Platinum"
    ],
    "From Gold · industry view on Platinum",
    "/results",
    false,
    true,
    [
     [
      "Calendar",
      "Who reports, day by day",
      "calendar"
     ],
     [
      "Vs its industry",
      "Same quarter, same yardstick",
      "scale"
     ],
     [
      "Your watchlist",
      "Only the companies you follow",
      "eye"
     ],
     [
      "Industry view",
      "Strong and weak industries",
      "grid"
     ]
    ]
   ],
   [
    "cc",
    "Concall Monitor",
    "Free",
    "Earnings calls straight from the companies’ own filings, each with an AI summary of the key points.",
    [
     "Date and time of upcoming calls",
     "Recording, transcript and investor presentation for each call",
     "Filter by company, quarter and type"
    ],
    "",
    "/concalls",
    true,
    false,
    [
     [
      "AI summary",
      "The key points of each call",
      "spark"
     ],
     [
      "Upcoming calls",
      "Date and time",
      "calendar"
     ],
     [
      "Recording and transcript",
      "With the presentation",
      "doc"
     ],
     [
      "Filters",
      "Company, quarter, type",
      "filter"
     ]
    ]
   ],
   [
    "ipo",
    "IPOs",
    "Free",
    "Every IPO from opening day to listing, with times subscribed and how close GMP came.",
    [
     "Open now, upcoming and about to list",
     "Every mainboard and SME IPO since 2020",
     "Subscription, price band and listing price"
    ],
    "Free for everyone",
    "/ipo",
    false,
    false,
    [
     [
      "Open now",
      "Dates, lot size, minimum amount",
      "calendar"
     ],
     [
      "Subscription",
      "How many times over",
      "chart"
     ],
     [
      "*GMP vs listing",
      "How close it came",
      "target"
     ],
     [
      "Since 2020",
      "Mainboard and SME",
      "list"
     ]
    ]
   ],
   [
    "news",
    "News & filings",
    "Free",
    "Exchange filings and market news as they land, each marked by its tone: positive, neutral or negative.",
    [
     "Filings sorted by type: results, orders, ratings, management changes",
     "Only your names, with one switch",
     "Market news picked by the FinLit team",
     "The tone of every filing and story, at a glance"
    ],
    "Free for everyone",
    "/news",
    false,
    false,
    [
     [
      "Filings by type",
      "Results, orders, ratings",
      "doc"
     ],
     [
      "Only your names",
      "With one switch",
      "eye"
     ],
     [
      "Market news",
      "Picked by the FinLit team",
      "news"
     ],
     [
      "Tone of each",
      "Positive, neutral or negative",
      "spark"
     ]
    ]
   ]
  ]
 },
 {
  "id": "learn",
  "name": "Learn & connect",
  "line": "Learn the terms, ask questions, get help.",
  "tools": [
   [
    "glo",
    "Glossary & guides",
    "Free",
    "1,000+ finance and economics terms in plain words, with formulas.",
    [
     "1,000+ terms from A to Z, or by 18 topics",
     "What each means, why it matters, how to use it, and its formula",
     "The FinLit words behind the scores and labels"
    ],
    "",
    "/glossary",
    false,
    false,
    [
     [
      "1,000+ terms",
      "A to Z or 18 topics",
      "book"
     ],
     [
      "Formulas",
      "With each term",
      "percent"
     ],
     [
      "Why it matters",
      "And how to use it",
      "spark"
     ],
     [
      "FinLit’s own words",
      "Behind the scores",
      "layers"
     ]
    ]
   ],
   [
    "blog",
    "Insights & blog",
    "Free",
    "Articles on markets, companies and investing, in plain language.",
    [
     "Explainers and myth-busters",
     "Investing basics and industry insights",
     "Plain language; never a recommendation"
    ],
    "Free to read · first articles coming soon",
    "/blog",
    false,
    false,
    [
     [
      "Explainers",
      "And myth-busters",
      "doc"
     ],
     [
      "Basics",
      "Investing and industries",
      "book"
     ],
     [
      "Plain language",
      "Never a recommendation",
      "chat"
     ],
     [
      "Free to read",
      "First articles soon",
      "note"
     ]
    ]
   ],
   [
    "forum",
    "Discussion forums",
    "Gold",
    "Talk through a company’s filings with other investors, in moderated threads sorted by company.",
    [
     "Discussions sorted by company",
     "Trending, most discussed and companies you follow",
     "Moderated; information and opinion only"
    ],
    "From Gold",
    "/forum",
    false,
    false,
    [
     [
      "By company",
      "Every thread together",
      "chat"
     ],
     [
      "Most discussed",
      "What investors are talking about",
      "chart"
     ],
     [
      "Following",
      "Threads on your companies",
      "eye"
     ],
     [
      "Moderated",
      "Opinion, never advice",
      "shield"
     ]
    ]
   ],
   [
    "ai",
    "FinLit AI",
    "Gold",
    "Ask anything about a company, the market or the economy, and get a clear, direct answer, powered by Claude’s advanced model.",
    [
     "Any question about the market, the economy or a company",
     "Powered by Claude’s advanced model, explaining scores, charts and terms",
     "Never gives investment advice"
    ],
    "On Gold and Platinum",
    "/",
    false,
    false,
    [
     [
      "Ask anything",
      "Company, market, economy",
      "chat"
     ],
     [
      "Claude’s advanced model",
      "Clear, direct answers",
      "spark"
     ],
     [
      "100 a month",
      "300 on Platinum",
      "clock"
     ],
     [
      "No advice",
      "Information only",
      "shield"
     ]
    ]
   ],
   [
    "ext",
    "Browser extension",
    "Gold",
    "FinLit readings on any web page you read.",
    [
     "Select a term on any web page to see what it means",
     "A listed company’s FinLit readings where you read about it",
     "It reads only what you select"
    ],
    "From Gold",
    "/browser-extension",
    false,
    false,
    [
     [
      "Select a term",
      "See what it means",
      "cursor"
     ],
     [
      "Company view",
      "FinLit readings, where you read",
      "layers"
     ],
     [
      "Any web page",
      "Wherever you read",
      "globe"
     ],
     [
      "Private",
      "Reads only what you select",
      "shield"
     ]
    ]
   ],
   [
    "conn",
    "Connect AI assistants",
    "Gold",
    "Bring FinLit data into the AI assistant you already use.",
    [
     "Company and fund data in the assistant you already use",
     "Read-only: it cannot change an account, a watchlist or a portfolio"
    ],
    "From Gold",
    "/mcp",
    false,
    false,
    [
     [
      "Your assistant",
      "The one you already use",
      "plug"
     ],
     [
      "Company data",
      "Right in your chat",
      "building"
     ],
     [
      "Fund data",
      "Right in your chat",
      "pie"
     ],
     [
      "Read-only",
      "Cannot change anything",
      "shield"
     ]
    ]
   ]
  ]
 }
];

export const PLANS = {
 "P": [
  [
   "Free",
   "₹0",
   "#8a8f7a",
   "",
   null
  ],
  [
   "Mutual Fund + ETF",
   "₹1,700 a year",
   "#1f7a6b",
   "",
   {
    "y": 1700
   }
  ],
  [
   "Equity Portfolio",
   "₹3,300 a year",
   "#6b43b0",
   "",
   {
    "y": 3300
   }
  ],
  [
   "Gold",
   "₹5,500 a year",
   "#b8892b",
   "",
   {
    "y": 5500
   }
  ],
  [
   "Platinum",
   "₹10,000 a year",
   "#3e4a5c",
   "",
   {
    "y": 10000
   }
  ]
 ],
 "G": [
  {
   "id": "discover",
   "name": "Discover",
   "line": "Find the stocks and funds worth a closer look.",
   "rows": [
    {
     "n": "Stock screener",
     "line": "Cut 5,800+ companies down to the few that fit your rules.",
     "k": "5,800+ companies · your custom rules",
     "new": false,
     "usp": false,
     "v": [
      "N",
      "N",
      "No custom ratios",
      "Full",
      "Full"
     ],
     "ao": "",
     "subs": [
      {
       "n": "All 200+ filters",
       "line": "Valuation, growth, quarterly results, ownership and red flags, in 16 groups",
       "v": [
        "N",
        "N",
        "Y",
        "Y",
        "Y"
       ],
       "ao": ""
      },
      {
       "n": "Ready-made screens",
       "line": "Quick screens you can open in one click, then change",
       "v": [
        "N",
        "N",
        "Y",
        "Y",
        "Y"
       ],
       "ao": ""
      },
      {
       "n": "Custom ratios",
       "line": "Divide one figure by another and filter on the result",
       "v": [
        "N",
        "N",
        "N",
        "Y",
        "Y"
       ],
       "ao": ""
      }
     ]
    },
    {
     "n": "Advanced stock screener",
     "line": "Rank the whole market by FinLit Prism, such as the top 10 large caps, or open a momentum screener, in one click.",
     "k": "FinLit Prism · top 10s · momentum screeners",
     "new": false,
     "usp": true,
     "v": [
      "N",
      "N",
      "Y",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": [
      {
       "n": "Ranked by FinLit Prism",
       "line": "Every rated company by its score, its four parts and both trends",
       "v": [
        "N",
        "N",
        "Y",
        "Y",
        "Y"
       ],
       "ao": ""
      },
      {
       "n": "Ready-made screens and chart patterns",
       "line": "Rebuilt after every close, showing which companies joined",
       "v": [
        "N",
        "N",
        "Y",
        "Y",
        "Y"
       ],
       "ao": ""
      },
      {
       "n": "Momentum screeners",
       "line": "Ready-made screens of the strongest price momentum, rebuilt after every close",
       "v": [
        "N",
        "N",
        "Y",
        "Y",
        "Y"
       ]
      }
     ]
    },
    {
     "n": "Query builder & baskets",
     "line": "Type a rule in plain words, get every company that matches, and save it as a basket.",
     "k": "Plain-word rules · 200+ ratios · baskets",
     "new": false,
     "usp": false,
     "v": [
      "200+ ratios",
      "200+ ratios",
      "200+ ratios · 15 baskets",
      "Custom ratios · 15 baskets",
      "Custom ratios · 30 baskets"
     ],
     "ao": "",
     "subs": [
      {
       "n": "Rules from 200+ ratios",
       "line": "Type a rule such as Market cap > 500 AND P/E < 15",
       "v": [
        "Y",
        "Y",
        "Y",
        "Y",
        "Y"
       ],
       "ao": ""
      },
      {
       "n": "Your custom ratios",
       "line": "Use a ratio you built yourself inside a rule",
       "v": [
        "N",
        "N",
        "N",
        "Y",
        "Y"
       ],
       "ao": ""
      },
      {
       "n": "Saved baskets",
       "line": "Keep a query as a basket and run it again for fresh matches",
       "v": [
        "N",
        "N",
        "15",
        "15",
        "30"
       ],
       "ao": ""
      }
     ]
    },
    {
     "n": "Discover",
     "line": "Spot companies moving into new businesses, straight from their investor presentations and earnings calls.",
     "k": "New businesses · from investor presentations & concalls",
     "new": true,
     "usp": true,
     "v": [
      "N",
      "N",
      "N",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": []
    },
    {
     "n": "Superinvestor portfolios",
     "line": "See what India’s best-known investors hold, and what they changed.",
     "k": "Big investors · holdings and changes",
     "new": true,
     "usp": false,
     "v": [
      "N",
      "N",
      "Y",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": []
    },
    {
     "n": "Mutual funds & ETFs",
     "line": "Filter 8,500+ funds and 350+ ETFs by returns, risk, cost and holdings.",
     "k": "8,500+ funds and 350+ ETFs · returns, risk, cost, holdings",
     "new": false,
     "usp": false,
     "v": [
      "Browse",
      "Y",
      "Browse",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": [
      {
       "n": "Browse funds and ETFs",
       "line": "Every scheme with its returns, cost and size",
       "v": [
        "Y",
        "Y",
        "Y",
        "Y",
        "Y"
       ],
       "ao": ""
      },
      {
       "n": "Fund screener and fund comparison",
       "line": "Filter by category, cost and risk; compare funds head to head",
       "v": [
        "N",
        "Y",
        "N",
        "Y",
        "Y"
       ],
       "ao": ""
      }
     ]
    },
    {
     "n": "Mutual Fund Score",
     "line": "Is your fund any good? One 0–100 score from performance, risk, cost and quality, for 8,500+ funds.",
     "k": "0–100 score · 4 pillars · 8,500+ funds",
     "new": false,
     "usp": true,
     "v": [
      "N",
      "Y",
      "N",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": []
    }
   ]
  },
  {
   "id": "company",
   "name": "Company 360",
   "line": "Open one company up from every side.",
   "rows": [
    {
     "n": "Company report",
     "line": "Read any listed company like an analyst: what it does, how it earns, who owns it and how it compares.",
     "k": "17+ sections · from its own filings",
     "new": false,
     "usp": false,
     "v": [
      "Core sections",
      "Core sections",
      "No sector sections",
      "No sector sections",
      "All sections"
     ],
     "ao": "Full company report",
     "subs": [
      {
       "n": "Core sections",
       "line": "Overview, financial statements and key ratios",
       "v": [
        "Y",
        "Y",
        "Y",
        "Y",
        "Y"
       ],
       "ao": ""
      },
      {
       "n": "The rest of the report",
       "line": "Charts, ownership, peers, valuation and filings",
       "v": [
        "N",
        "N",
        "Y",
        "Y",
        "Y"
       ],
       "ao": "Full company report"
      },
      {
       "n": "Leader, In line or Laggard",
       "line": "Where the company stands against its peers",
       "v": [
        "N",
        "N",
        "Y",
        "Y",
        "Y"
       ],
       "ao": "Full company report"
      },
      {
       "n": "Sector Pulse and Rotation sections",
       "line": "How the company’s industry is moving",
       "v": [
        "N",
        "N",
        "N",
        "N",
        "Y"
       ],
       "ao": "Sector Pulse and Rotation"
      }
     ]
    },
    {
     "n": "FinLit Prism",
     "line": "A statistical model: a fundamental score on 4 pillars and a technical score on 2, kept apart, with an AI summary of the whole report.",
     "k": "Fundamental (4 pillars) · technical (2) · AI summary",
     "new": false,
     "usp": true,
     "v": [
      "N",
      "N",
      "10 a day",
      "10 a day",
      "20 a day"
     ],
     "ao": "",
     "subs": [
      {
       "n": "Reports you can open in a day",
       "line": "A report is counted once a day, however often you reopen it",
       "v": [
        "N",
        "N",
        "10",
        "10",
        "20"
       ],
       "ao": ""
      },
      {
       "n": "Short-term and long-term trend",
       "line": "Shown beside the score, never mixed into it",
       "v": [
        "N",
        "N",
        "Y",
        "Y",
        "Y"
       ],
       "ao": ""
      }
     ]
    },
    {
     "n": "Annual reports & presentations",
     "line": "Every report and presentation, linked to the exchange’s own copy.",
     "k": "Every report · the exchange’s own copy",
     "new": false,
     "usp": false,
     "v": [
      "Y",
      "Y",
      "Y",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": []
    },
    {
     "n": "Compare companies",
     "line": "Line companies up on size, valuation, quality, growth and price behaviour, and see where each one is stronger.",
     "k": "Up to 8 head to head · valuation, quality, growth",
     "new": false,
     "usp": false,
     "v": [
      "2 at once",
      "2 at once",
      "2 at once",
      "Up to 4",
      "Up to 8"
     ],
     "ao": "",
     "subs": []
    },
    {
     "n": "Chart builder",
     "line": "Chart a company’s price against its results and ratios, and see how they move together.",
     "k": "Price against results & ratios · 9+ charts at once",
     "new": false,
     "usp": false,
     "v": [
      "N",
      "N",
      "N",
      "Y",
      "Y"
     ],
     "ao": "Charts Pro",
     "subs": [
      {
       "n": "Charts side by side",
       "line": "On one screen",
       "v": [
        "N",
        "N",
        "N",
        "Up to 9",
        "Unlimited"
       ],
       "ao": ""
      }
     ]
    },
    {
     "n": "Correlation charts",
     "line": "Does a higher P/E come with faster growth? Plot any two metrics across companies and sectors, with a trend line when the link is real.",
     "k": "P/E vs growth, ROE vs debt · any two metrics",
     "new": false,
     "usp": false,
     "v": [
      "N",
      "N",
      "N",
      "N",
      "Y"
     ],
     "ao": "Charts Pro",
     "subs": []
    }
   ]
  },
  {
   "id": "quant",
   "name": "Quant Lab",
   "line": "Value a company, test a forecast, shock its earnings.",
   "rows": [
    {
     "n": "DCF valuation calculator",
     "line": "Work out a share’s intrinsic valuation from its future cash flows, pre-filled, and see how far the market valuation is from it.",
     "k": "Intrinsic valuation vs market valuation",
     "new": false,
     "usp": false,
     "v": [
      "N",
      "N",
      "N",
      "Y",
      "Y"
     ],
     "ao": "Investment calculators",
     "subs": []
    },
    {
     "n": "Reverse valuation",
     "line": "Start from today’s price and see the growth, margins and returns the market is already counting on.",
     "k": "The growth today’s price has already priced in",
     "new": false,
     "usp": false,
     "v": [
      "N",
      "N",
      "N",
      "N",
      "Y"
     ],
     "ao": "Investment calculators",
     "subs": []
    },
    {
     "n": "Profit and revenue forecasting",
     "line": "Do it yourself: set your own inputs and get 1, 3 and 5-year profit and revenue estimates.",
     "k": "Your inputs · 1, 3 and 5-year estimates",
     "new": false,
     "usp": false,
     "v": [
      "N",
      "N",
      "N",
      "N",
      "Y"
     ],
     "ao": "Profit and revenue forecast",
     "subs": []
    },
    {
     "n": "P/E, EPS & PEG calculator",
     "line": "Turn a company’s earnings and growth into EPS, P/E and PEG, and see the share price they would support.",
     "k": "EPS, P/E and PEG · the price earnings support",
     "new": false,
     "usp": false,
     "v": [
      "Y",
      "Y",
      "Y",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": []
    },
    {
     "n": "SIP calculator",
     "line": "See what a monthly amount could grow into.",
     "k": "Monthly amount · what it could grow to",
     "new": false,
     "usp": false,
     "v": [
      "Y",
      "Y",
      "Y",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": []
    },
    {
     "n": "Stress Lab",
     "line": "Shock crude, the rupee, interest rates, input costs or demand, alone or together, and watch earnings and margins react.",
     "k": "Crude, rupee, rates, input costs, demand · earnings impact",
     "new": false,
     "usp": false,
     "v": [
      "N",
      "N",
      "N",
      "N",
      "Y"
     ],
     "ao": "Stress Lab",
     "subs": []
    }
   ]
  },
  {
   "id": "track",
   "name": "Track & manage",
   "line": "Keep what you own and follow in one place.",
   "rows": [
    {
     "n": "All my investments",
     "line": "Your shares, mutual funds and ETFs as one portfolio, in one view.",
     "k": "One portfolio · shares, mutual funds, ETFs",
     "new": false,
     "usp": false,
     "v": [
      "N",
      "N",
      "N",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": []
    },
    {
     "n": "Equity portfolio",
     "line": "One portfolio score from FinLit Prism for everything you hold, with diversification and risk analytics share by share.",
     "k": "Portfolio score by FinLit Prism · spread and risk",
     "new": false,
     "usp": false,
     "v": [
      "N",
      "N",
      "50 stocks",
      "50 stocks",
      "150 stocks"
     ],
     "ao": "Full equity portfolio",
     "subs": [
      {
       "n": "Stocks you can hold in it",
       "line": "Across all your portfolios",
       "v": [
        "N",
        "N",
        "50",
        "50",
        "150"
       ],
       "ao": ""
      },
      {
       "n": "Portfolio scored by FinLit Prism",
       "line": "One reading for everything you hold",
       "v": [
        "N",
        "N",
        "Y",
        "Y",
        "Y"
       ],
       "ao": "Full equity portfolio"
      },
      {
       "n": "Diversification and risk",
       "line": "Share by share, and against the index",
       "v": [
        "N",
        "N",
        "Y",
        "Y",
        "Y"
       ],
       "ao": "Full equity portfolio"
      }
     ]
    },
    {
     "n": "MF portfolio",
     "line": "Each fund read with Mutual Fund Score, where your funds overlap, how they are spread and the risk they carry together.",
     "k": "Mutual Fund Score · overlap, spread and risk",
     "new": false,
     "usp": false,
     "v": [
      "N",
      "30 funds",
      "N",
      "30 funds",
      "30 funds"
     ],
     "ao": "",
     "subs": []
    },
    {
     "n": "ETF portfolio",
     "line": "See what your ETFs hold, what they cost and how they move together.",
     "k": "Holdings · cost · how they move together",
     "new": true,
     "usp": false,
     "v": [
      "N",
      "Y",
      "N",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": []
    },
    {
     "n": "Watchlists",
     "line": "Track and manage the stocks you are following, with scores, notes and a target price beside each one.",
     "k": "Stocks on your radar · track and manage",
     "new": false,
     "usp": false,
     "v": [
      "N",
      "N",
      "1 list",
      "4 lists",
      "8 lists"
     ],
     "ao": "",
     "subs": [
      {
       "n": "Watchlists",
       "line": "Separate lists for separate ideas",
       "v": [
        "N",
        "N",
        "1",
        "4",
        "8"
       ],
       "ao": ""
      },
      {
       "n": "Stocks in each list",
       "line": "With notes and a target price on each",
       "v": [
        "N",
        "N",
        "20",
        "20",
        "40"
       ],
       "ao": ""
      }
     ]
    },
    {
     "n": "Alerts",
     "line": "Set your own triggers on price, signals, scores or filings, and get a live notification the moment one is hit.",
     "k": "Set your own triggers · live notifications",
     "new": false,
     "usp": false,
     "v": [
      "5 a month",
      "5 a month",
      "20 a week",
      "20 a week",
      "40 a week"
     ],
     "ao": "",
     "subs": []
    }
   ]
  },
  {
   "id": "market",
   "name": "Follow the market",
   "line": "See which way the market and its industries are moving.",
   "rows": [
    {
     "n": "Dashboard",
     "line": "Open FinLit to your whole day: every portfolio, the live market, your alerts and scores on one screen.",
     "k": "Portfolios, market, alerts · one screen",
     "new": false,
     "usp": false,
     "v": [
      "N",
      "Funds only",
      "Equity only",
      "Full",
      "Full"
     ],
     "ao": "",
     "subs": []
    },
    {
     "n": "Sector Pulse",
     "line": "Which sectors are sold off, bouncing back or losing steam? Every sector and industry gets its state in plain words, fresh after every close.",
     "k": "22 sectors · 59 industries · state after every close",
     "new": false,
     "usp": true,
     "v": [
      "N",
      "N",
      "N",
      "N",
      "Y"
     ],
     "ao": "Sector Pulse and Rotation",
     "subs": [
      {
       "n": "Sectors and industries",
       "line": "Each with its state in plain words, after every close",
       "v": [
        "N",
        "N",
        "N",
        "N",
        "Y"
       ],
       "ao": "Sector Pulse and Rotation"
      },
      {
       "n": "Industry pages",
       "line": "22 sectors and 59 industries",
       "v": [
        "N",
        "N",
        "N",
        "N",
        "Y"
       ],
       "ao": "Sector Pulse and Rotation"
      }
     ]
    },
    {
     "n": "Sector Rotation",
     "line": "See which industries are taking the lead, which are fading, and which just changed places.",
     "k": "Industries leading, fading, switching",
     "new": false,
     "usp": true,
     "v": [
      "N",
      "N",
      "N",
      "N",
      "Y"
     ],
     "ao": "Sector Pulse and Rotation",
     "subs": []
    },
    {
     "n": "Market events & index",
     "line": "Announcements, call transcripts and index history in one place.",
     "k": "Announcements · transcripts · index history",
     "new": false,
     "usp": false,
     "v": [
      "N",
      "N",
      "N",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": []
    },
    {
     "n": "FII & DII flows and India economy",
     "line": "Institutional money (FII and DII) day by day, and India’s inflation, growth, interest rates and reserves.",
     "k": "FII and DII daily · inflation, growth, rates",
     "new": false,
     "usp": false,
     "v": [
      "Y",
      "Y",
      "Y",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": []
    },
    {
     "n": "Results",
     "line": "See who reports this week, and how each result really compares with the rest of its industry.",
     "k": "This week’s results · against the industry",
     "new": false,
     "usp": true,
     "v": [
      "N",
      "N",
      "N",
      "Industry-benchmarked",
      "Plus industry view"
     ],
     "ao": "Results analysis",
     "subs": [
      {
       "n": "Results calendar",
       "line": "Who reports when, day by day",
       "v": [
        "N",
        "N",
        "N",
        "Y",
        "Y"
       ],
       "ao": "Results analysis"
      },
      {
       "n": "Industry-benchmarked results",
       "line": "Every result measured against its industry for the quarter",
       "v": [
        "N",
        "N",
        "N",
        "Y",
        "Y"
       ],
       "ao": "Results analysis"
      },
      {
       "n": "Industry view",
       "line": "How each industry performed this quarter",
       "v": [
        "N",
        "N",
        "N",
        "N",
        "Y"
       ],
       "ao": ""
      }
     ]
    },
    {
     "n": "Concall Monitor",
     "line": "Earnings calls straight from the companies’ own filings, each with an AI summary of the key points.",
     "k": "Earnings calls · AI summary of each · from filings",
     "new": true,
     "usp": false,
     "v": [
      "Y",
      "Y",
      "Y",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": []
    },
    {
     "n": "IPOs",
     "line": "Every IPO from opening day to listing, with times subscribed and how close GMP came.",
     "k": "Opening day to listing · subscription, GMP",
     "new": false,
     "usp": false,
     "v": [
      "Y",
      "Y",
      "Y",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": []
    },
    {
     "n": "News & filings",
     "line": "Exchange filings and market news as they land, each marked by its tone: positive, neutral or negative.",
     "k": "Exchange filings · market news · the tone of each",
     "new": false,
     "usp": false,
     "v": [
      "Y",
      "Y",
      "Y",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": []
    }
   ]
  },
  {
   "id": "learn",
   "name": "Learn & connect",
   "line": "Learn the terms, ask questions, get help.",
   "rows": [
    {
     "n": "Glossary & guides",
     "line": "1,000+ finance and economics terms in plain words, with formulas.",
     "k": "1,000+ terms · plain words, formulas",
     "new": false,
     "usp": false,
     "v": [
      "Y",
      "Y",
      "Y",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": []
    },
    {
     "n": "Insights & blog",
     "line": "Articles on markets, companies and investing, in plain language.",
     "k": "Markets and companies · plain language",
     "new": false,
     "usp": false,
     "v": [
      "Y",
      "Y",
      "Y",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": []
    },
    {
     "n": "Discussion forums",
     "line": "Talk through a company’s filings with other investors, in moderated threads sorted by company.",
     "k": "Company threads · moderated",
     "new": false,
     "usp": false,
     "v": [
      "N",
      "N",
      "N",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": []
    },
    {
     "n": "FinLit AI",
     "line": "Ask anything about a company, the market or the economy, and get a clear, direct answer, powered by Claude’s advanced model.",
     "k": "Ask anything · powered by Claude’s advanced model",
     "new": false,
     "usp": false,
     "v": [
      "N",
      "N",
      "N",
      "100 questions a month",
      "300 questions a month"
     ],
     "ao": "",
     "subs": []
    },
    {
     "n": "Browser extension",
     "line": "FinLit readings on any web page you read.",
     "k": "FinLit readings · on any web page",
     "new": false,
     "usp": false,
     "v": [
      "N",
      "N",
      "N",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": []
    },
    {
     "n": "Connect AI assistants",
     "line": "Bring FinLit data into the AI assistant you already use.",
     "k": "FinLit data · in your AI assistant",
     "new": false,
     "usp": false,
     "v": [
      "N",
      "N",
      "N",
      "Y",
      "Y"
     ],
     "ao": "",
     "subs": []
    }
   ]
  }
 ],
 "cnt": [
  14,
  18,
  21,
  34,
  40
 ],
 "n": 40,
 "AP": {
  "Full equity portfolio": "₹399",
  "Full company report": "₹499",
  "Results analysis": "₹299",
  "Investment calculators": "₹399",
  "Profit and revenue forecast": "₹499",
  "Charts Pro": "₹399",
  "Sector Pulse and Rotation": "₹999",
  "Stress Lab": "₹999",
  "More room": "₹199 each"
 }
};

/* Task #410: the combined plan (Equity Portfolio + Mutual Fund + ETF), shown under the plans table on the landing page and on /plans: its yearly
   price and the five extras it adds from Gold (moved here from golive.js, so both pages read one source). */
export const COMBINED = {y:4499,extras:[['All my investments','Shares, funds and ETFs in one view'],['Full dashboard','Shares, funds and alerts on one screen'],['Watchlists','3 lists of 20 stocks'],['Discussion forums','Moderated threads by company'],['FinLit AI','60 questions a month']]};

export const CLIPS = {
 "Stock screener": "/landing/golive/clips/stock-screener.mp4",
 "Query builder": "/landing/golive/clips/query-builder.mp4",
 "Discover": "/landing/golive/clips/discover.mp4",
 "Superinvestor portfolios": "/landing/golive/clips/superinvestor-portfolios.mp4",
 "Mutual funds & ETFs": "/landing/golive/clips/mutual-funds-etfs.mp4",
 "Annual reports & presentations": "/landing/golive/clips/annual-reports-presentations.mp4",
 "Compare companies": "/landing/golive/clips/compare-companies.mp4",
 "Chart builder": "/landing/golive/clips/chart-builder.mp4",
 "Correlation charts": "/landing/golive/clips/correlation-charts.mp4",
 "DCF valuation calculator": "/landing/golive/clips/dcf-valuation-calculator.mp4",
 "Reverse valuation": "/landing/golive/clips/reverse-valuation.mp4",
 "Profit and revenue forecasting": "/landing/golive/clips/profit-and-revenue-forecasting.mp4",
 "P/E, EPS & PEG calculator": "/landing/golive/clips/p-e-eps-peg-calculator.mp4",
 "SIP calculator": "/landing/golive/clips/sip-calculator.mp4",
 "Stress Lab": "/landing/golive/clips/stress-lab.mp4",
 "Market events & index": "/landing/golive/clips/market-events-index.mp4",
 "FII & DII flows and India economy": "/landing/golive/clips/fii-dii-flows-and-india-economy.mp4",
 "Results": "/landing/golive/clips/results.mp4",
 "Concall Monitor": "/landing/golive/clips/concall-monitor.mp4",
 "IPOs": "/landing/golive/clips/ipos.mp4",
 "News & filings": "/landing/golive/clips/news-filings.mp4",
 "Glossary & guides": "/landing/golive/clips/glossary-guides.mp4",
 "Insights & blog": "/landing/golive/clips/insights-blog.mp4",
 "Discussion forums": "/landing/golive/clips/discussion-forums.mp4",
 "Browser extension": "/landing/golive/clips/browser-extension.mp4",
 "Connect AI assistants": "/landing/golive/clips/connect-ai-assistants.mp4",
 "Query builder & baskets": "/landing/golive/clips/query-builder.mp4",
 "All my investments": "/landing/golive/clips/all-my-investments.mp4",
 "Equity portfolio": "/landing/golive/clips/equity-portfolio.mp4",
 "MF portfolio": "/landing/golive/clips/mf-portfolio.mp4",
 "ETF portfolio": "/landing/golive/clips/etf-portfolio.mp4",
 "Watchlists": "/landing/golive/clips/watchlists.mp4",
 "Alerts": "/landing/golive/clips/alerts.mp4",
 "Dashboard": "/landing/golive/clips/dashboard.mp4",
 "FinLit AI": "/landing/golive/clips/finlit-ai.mp4"
};
