# #183 part 1 · Equity portfolio · Step 0 checklist (team's words, pack 15 Nov rev. 4)

Source: finlit-portfolios-handover-15nov/01-equity-portfolio/README.md, CHECKLIST.md, COMMON-RULES.md (sections 3, 4, 8, 9, 10, 11).
Founder's decisions (16 Nov): plans stay Basic / Silver / Gold ("Mutual Fund + ETF" is a later task); Equity first, then MF, then ETF.

## A. Live issues (fix on the live page)
1. A SILVER badge shows on a Gold account.
2. Leader labels show with negative points against peers (RPEL, KRN).
3. ICICIBANK reads Laggard while it is ahead of its index.
4. The diversification score counts industries (86) where the design uses macro sectors (74). Decided: macro sectors (12). Show the industry count beside it as detail.
5. Headings, column heads and counts say "macro sector".
6. The "1-yr high" and "1 month" columns are empty.
7. Some pack names are mislabelled.
8. Wording: "but …" sentences and "all score" read oddly. Rewrite them in the plain style of the mock-up.

## B. Top of the page
9. Keep the portfolio score box and "Make the score yours".
10. The add row searches by name, symbol or ISIN.
11. The upload note says each share is read by its ISIN, and rows without one are shown for the member to confirm.
12. A Clear portfolio button sits after Upload broker file: dialog, empty state, 10-second Undo (COMMON-RULES 10).
13. The top shows the score and three tiles only: Portfolio (holding strength), Diversification analytics (74 · Fairly spread), Risk analytics (β and swing).
14. Each tile opens its tab.
15. Tiles take the live site's tinted tile style (green, blue, amber, grey).
16. Each tile has an ⓘ and a "See … →" link that opens the right tab.
17. Tiles that use Prism show the Silver text on Silver: "Average FinLit IQ …" for holding strength; "Gold and up" for the others.
18. Against peers, Price trend and Valuation move into the Portfolio tab's Key figures row; Moves like and Concentration into Diversification analytics.
19. Tab renamed: Diversification → Diversification analytics.
20. Sections bar under the tabs, sticky: All sections (menu of every section on all three tabs) and one chip per section of the open tab.
21. The chip of the section in view is underlined.
22. The bar shows numbered steps with arrows; sections in this order — Portfolio: 1 Your shares → 2 Trends → 3 Peers → 4 Group leaders; Diversification analytics: 1 Where it sits → 2 Spread → 3 Sectors → 4 Stock groups → 5 Company sizes → 6 Share by share → 7 Style tilt; Risk analytics: 1 At a glance → 2 Beta build → 3 Size benchmarks → 4 Risk share → 5 If the market fell 10% → 6 Each share.

## C. Portfolio tab
23. Start here (Key figures) strip: new, foldable, three cards.
24. Gold cards: weak Prism scores, peer laggards, short term behind long term.
25. Silver cards: Mixed FinLit IQ, weak technical pillar, strong FinLit IQ.
26. Each button jumps to and flashes the card it names.
27. Start here remembers its state (open or closed) per tab in the browser.
28. Gold columns: FinLit Prism score, then four fundamental pillars (G&P, Valuation, Quality, Risk: Strong / Fair / Weak words), then two technical pillars (short-term and long-term trend score with a bar and a label).
29. Silver columns: FinLit IQ score, then four fundamental pillars (Quality, Growth, Profitability, Balance sheet), then one technical pillar.
30. Each Silver pillar shows the API's word (score.pillars[].band.label): Strong / Healthy / Mixed / Watch — not cut-offs in the page.
31. "Not scored yet" shows as "–". Banks and lenders have no balance-sheet pillar (ICICIBANK's balance-sheet pillar shows "–").
32. A heading band names the groups. A thick divider follows the score column; thin lines start each other group. Never both scores show.
33. Band filters follow the plan: Gold uses Strong / Healthy / Average / Weak; Silver uses Strong / Healthy / Mixed / Watch.
34. Views: Overview (one flat list).
35. By sector: group rows, with a Sector | Industry switch; offers Macro sector (9) · Sector (13) · Industry (22), named as NSE names them.
36. By company size: group rows plus three size cards.
37. Ratios and Financials: unchanged.
38. Group rows fold, with Open all / Close all. Each shows the count, % of the list, how closely the group moves together and the group's average score.
39. Every heading sorts both ways, ▲ ▼ shows the order; add Share, Size, Qty and Value.
40. Weak rows get a light red tint.
41. Remove Export CSV.
42. Trend and Peers cards: Gold only; Silver sees a dashed lock card.
43. Trend card: the "Business and price" list stacks as rows (CSS clash put it on one line).
44. Short- and long-term trend reads as a matrix: axis bars "Short-term trend →" and "Long-term trend ↓", each with ⓘ; arrows on the column and row heads.
45. Matrix cells show 4 names, then "+N more ▾".
46. Business and price: full lists, 4 names then "+N more ▾", with ⓘ. Rule: business = Prism (65+ strong, below 50 weak), price = long-term trend; shares in between are counted under the list.
47. Against their peers: 3 shares per column, then "Show all N ▾".
48. "What if you had owned the group leader instead?": its own section (card) after Against their peers, own chip "Group leaders", lock card on Silver; one card per laggard, 12-month lines from 100 (share red, group #1 green, dashed 100 line), ₹1 lakh values, then 3 insights.
49. Every "and N more" on the page is a "+N more ▾" control that shows the full list.

## D. Diversification analytics tab
50. Keep Start here.
51. Keep "How spread out is the list?" with its two rings and insights.
52. "Where it sits": the macro sector × size grid, moved here as step 1. Rows: sectors. Columns: large, mid, small. Each share a chip whose dot shows its Prism band (Gold) or FinLit IQ band (Silver).
53. Cell colour deepens with the share count; the last column shows the sector's share of the list; row and column totals add to 100%.
54. Three sub-tabs under one bar.
55. Sub-tab 1, How sectors move together: the sector × sector heat grid.
56. A cell reader beside it: tap a cell to read the pair.
57. "How tied is each sector to the rest" bars.
58. Most and least linked pairs.
59. The sector panel has a Macro sector · Sector switch; grid, inspector, ties, pairs and stock groups follow it.
60. Sub-tab 2, How stocks move together (renamed from "Groups that move together"): groups found from prices, average-linkage clustering on 1 − ρ, cut at 0.5.
61. One card per group, with a "Crosses sectors" tag when the group spans sectors.
62. An All / Crosses sectors / One sector filter.
63. Looser families below.
64. Sub-tab 3, Small, mid and large: three figures (how closely each size moves with itself).
65. A 3 × 3 size heat grid.
66. "Of the 30 closest pairs, how many are small with small …" against the share of all pairs.
67. Share by share below the sub-tabs: the interactive share grid with a reader (tap a share or a cell).
68. Sort by sector or by "Rest".
69. A slider and Expand ⤢ when the grid is wider than its box.
70. Remove "Where your list sits" from this tab.
71. Style tilt: Gold only.

## E. Risk analytics tab (rebuilt)
72. Risk at a glance: a lede line and four figures, each against the Nifty 50: typical swing 3 years; worst fall 3 years; ten worst weeks past year; size-weighted beta.
73. How your list's beta is built: five steps, three size cards (Large/Nifty 50, Mid/Midcap 150, Small/Smallcap 250: shares, average beta, share of list) and a sum card; a stacked bar shows each size's part.
74. Each share's beta is against its size benchmark; size averages, size-weighted beta, blended beta and Nifty 50 beta match the server's job to 2 decimals.
75. Reading a beta: a filter (All / Large / Mid / Small); four plain figures; the six-band scale with pins for the list and each size, with the owner's words.
76. A bar showing how many shares fall in each band.
77. Range cards: max 6 names each, then "Show all N"; tap a name to place it on the scale.
78. Three beta figures: size-weighted; against a blended benchmark; against the Nifty 50 alone.
79. Each size against its own benchmark: the beta figures only (1 year, in down weeks and in up weeks, per 100).
80. Share of the list vs share of the risk, by size, sector or share; the share view adds Beta and Reading columns. Risk shares add to 100%, shaded rows follow COMMON-RULES 8.
81. If the market fell 10%, with the rupee line on ₹10 lakh.
82. Each share's risk: grouped by size and foldable; columns: beta against its benchmark with reading tag; explained by benchmark; swing a year and worst fall over 3 years (with years of data when under 3); 1 year, below its 1-year high, 1 month; share of risk; Prism Risk (Gold only); what stands out.
83. Every beta shows "Explained by benchmark"; shares with under a year of prices show "Under a year" (FRACTAL left out).
84. Swing and worst fall are over 3 years, beta figures over the past year, and every figure says which.
85. Benchmarks use index closes (Nifty 50, Midcap 150, Smallcap 250, Nifty 500), not ETF prices; swing and worst fall from daily closes on the server.

## F. ISIN (COMMON-RULES 9)
86. Add isin to /api/stocks/{symbol} and to every /api/screener/universe row.
87. Accept an ISIN in the path (or /api/securities/{isin}).
88. The list is stored by ISIN.
89. A broker file with an ISIN column adds the right shares, including renamed ones (ETERNAL, TMPV).
90. Rows without an ISIN are shown for the member to confirm.
91. Search finds a share by name, symbol or ISIN.

## G. Clear portfolio (COMMON-RULES 10)
92. Dialog title "Clear your … portfolio?", names the count ("Clear 39 shares") and lists what goes; says watchlists, alerts and other portfolios are not touched.
93. Focus starts on "Keep my portfolio"; Esc and a click outside close it; the red button clears.
94. After clearing: empty state (heading, one line on adding by name, symbol or ISIN, Add / Import buttons); header count reads 0.
95. Undo stays 10 seconds; the server keeps the cleared list (rows by ISIN with quantities) at least that long; Undo restores it exactly; then the clear is final.
96. Clearing one portfolio never touches another; needs the signed-in session and CSRF.

## H. Whole page
97. Every insight card is closed on load and opens on click and on Enter or Space.
98. At 1,440 px nothing is cut off. At 390 px the page never scrolls sideways (check the trend card); tables and grids scroll in their own box.
99. No buy/sell words, no download control. The page ends "Information only, not investment advice."
100. ⓘ popovers: two lines each, "What it shows" and "How to read it".

## Standing rules
101. Numbers correct and current, and every blank says why.
102. Describe, never advise (no buy, sell, hold, target, "best").
103. The disclaimer stays.
104. Silver and Gold see what their plan allows.
105. Desktop and phone, light and dark.
106. No job is stopped or weakened.
